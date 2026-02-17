/**
 * Fill parser for DrawingML fill elements.
 *
 * Parses all 5 fill types (solidFill, gradFill, pattFill, blipFill, noFill)
 * from OOXML XML into {@link FillIR} discriminated union values.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.8.17-20 (Fills)
 */

import type { XmlElement } from '../../xml/index.js';
import type { ThemeIR, FillIR, CropRect, TileInfo } from '../../ir/index.js';
import type { ColorContext } from '../../theme/index.js';
import { resolveColorFromParent } from '../../theme/index.js';
import { parseIntAttr, parseEnumAttr, parseAngle } from '../../xml/index.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a fill from a shape properties element (a:spPr) or similar parent.
 *
 * Looks for solidFill, gradFill, pattFill, blipFill, or noFill child.
 * Returns `undefined` if no fill element is present (inherit from parent).
 */
export function parseFill(
  spPrElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): FillIR | undefined {
  // Check for noFill first (simplest case)
  if (spPrElement.child('a:noFill')) {
    return { type: 'none' };
  }

  // Solid fill
  const solidFill = spPrElement.child('a:solidFill');
  if (solidFill) {
    return parseSolidFill(solidFill, theme, context);
  }

  // Gradient fill
  const gradFill = spPrElement.child('a:gradFill');
  if (gradFill) {
    return parseGradientFill(gradFill, theme, context);
  }

  // Pattern fill
  const pattFill = spPrElement.child('a:pattFill');
  if (pattFill) {
    return parsePatternFill(pattFill, theme, context);
  }

  // Picture fill (blipFill)
  const blipFill = spPrElement.child('a:blipFill');
  if (blipFill) {
    return parsePictureFill(blipFill);
  }

  // No fill element found — inherit from parent
  return undefined;
}

// ---------------------------------------------------------------------------
// Solid fill
// ---------------------------------------------------------------------------

/**
 * Parse a `<a:solidFill>` element.
 *
 * ```xml
 * <a:solidFill>
 *   <a:srgbClr val="FF0000"/>
 * </a:solidFill>
 * ```
 */
function parseSolidFill(
  solidFillEl: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): FillIR {
  const color = resolveColorFromParent(solidFillEl, theme, context);
  return {
    type: 'solid',
    color: color ?? { r: 0, g: 0, b: 0, a: 1 },
  };
}

// ---------------------------------------------------------------------------
// Gradient fill
// ---------------------------------------------------------------------------

/**
 * Parse a `<a:gradFill>` element.
 *
 * Handles both linear gradients (a:lin) and path/radial gradients (a:path).
 * Gradient stop positions are normalized from OOXML's 0-100000 range to 0-1.
 *
 * ```xml
 * <a:gradFill>
 *   <a:gsLst>
 *     <a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs>
 *     <a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs>
 *   </a:gsLst>
 *   <a:lin ang="5400000" scaled="1"/>
 * </a:gradFill>
 * ```
 */
function parseGradientFill(
  gradFillEl: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): FillIR {
  // Parse gradient stops
  const gsLst = gradFillEl.child('a:gsLst');
  const stops = gsLst
    ? gsLst.allChildren('a:gs').map((gs) => {
        const posRaw = parseIntAttr(gs, 'pos') ?? 0;
        const color = resolveColorFromParent(gs, theme, context);
        return {
          position: posRaw / 100_000,
          color: color ?? { r: 0, g: 0, b: 0, a: 1 },
        };
      })
    : [];

  // Determine gradient kind
  const linEl = gradFillEl.child('a:lin');
  const pathEl = gradFillEl.child('a:path');

  if (pathEl) {
    // Path gradient (radial, rect, shape)
    const pathType = parseEnumAttr(pathEl, 'path', [
      'circle',
      'rect',
      'shape',
    ] as const);

    const kind = pathType === 'circle' ? 'radial' : 'path';

    // Parse tile rect if present
    const fillToRect = pathEl.child('a:fillToRect');
    const tileRect = fillToRect ? parseTileRect(fillToRect) : undefined;

    return {
      type: 'gradient',
      kind,
      stops,
      tileRect,
    };
  }

  // Linear gradient (default)
  const angle = linEl ? parseAngle(linEl, 'ang') : undefined;

  return {
    type: 'gradient',
    kind: 'linear',
    angle: angle ?? 0,
    stops,
  };
}

/**
 * Parse a fill-to-rect element into a tile rectangle.
 * Values are in 1/1000ths of a percent (0-100000 -> 0-1).
 */
function parseTileRect(rectEl: XmlElement): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const l = parseIntAttr(rectEl, 'l') ?? 0;
  const t = parseIntAttr(rectEl, 't') ?? 0;
  const r = parseIntAttr(rectEl, 'r') ?? 0;
  const b = parseIntAttr(rectEl, 'b') ?? 0;
  return {
    left: l / 100_000,
    top: t / 100_000,
    right: r / 100_000,
    bottom: b / 100_000,
  };
}

// ---------------------------------------------------------------------------
// Pattern fill
// ---------------------------------------------------------------------------

/**
 * Parse a `<a:pattFill>` element.
 *
 * ```xml
 * <a:pattFill prst="ltDnDiag">
 *   <a:fgClr><a:srgbClr val="000000"/></a:fgClr>
 *   <a:bgClr><a:srgbClr val="FFFFFF"/></a:bgClr>
 * </a:pattFill>
 * ```
 */
function parsePatternFill(
  pattFillEl: XmlElement,
  theme: ThemeIR,
  context?: ColorContext
): FillIR {
  const preset = pattFillEl.attr('prst') ?? 'pct5';

  // Foreground color (from a:fgClr child)
  const fgClrEl = pattFillEl.child('a:fgClr');
  const foreground = fgClrEl
    ? resolveColorFromParent(fgClrEl, theme, context) ?? { r: 0, g: 0, b: 0, a: 1 }
    : { r: 0, g: 0, b: 0, a: 1 };

  // Background color (from a:bgClr child)
  const bgClrEl = pattFillEl.child('a:bgClr');
  const background = bgClrEl
    ? resolveColorFromParent(bgClrEl, theme, context) ?? {
        r: 255,
        g: 255,
        b: 255,
        a: 1,
      }
    : { r: 255, g: 255, b: 255, a: 1 };

  return {
    type: 'pattern',
    preset,
    foreground,
    background,
  };
}

// ---------------------------------------------------------------------------
// Picture fill (blipFill)
// ---------------------------------------------------------------------------

/**
 * Parse a `<a:blipFill>` element.
 *
 * ```xml
 * <a:blipFill>
 *   <a:blip r:embed="rId2"/>
 *   <a:stretch><a:fillRect/></a:stretch>
 * </a:blipFill>
 * ```
 */
function parsePictureFill(blipFillEl: XmlElement): FillIR {
  // Get the embedded image relationship id
  const blipEl = blipFillEl.child('a:blip');
  const imagePartUri = blipEl?.attr('r:embed') ?? '';

  // Check for stretch mode
  const stretchEl = blipFillEl.child('a:stretch');
  const stretch = stretchEl !== undefined;

  // Check for tile mode
  const tileEl = blipFillEl.child('a:tile');
  const tile = tileEl ? parseTileInfo(tileEl) : undefined;

  // Check for source crop rect
  const srcRectEl = blipFillEl.child('a:srcRect');
  const crop = srcRectEl ? parseCropRect(srcRectEl) : undefined;

  return {
    type: 'picture',
    imagePartUri,
    stretch,
    tile,
    crop,
  };
}

/**
 * Parse tile settings from `<a:tile>`.
 *
 * ```xml
 * <a:tile tx="0" ty="0" sx="100000" sy="100000" flip="none" algn="tl"/>
 * ```
 */
function parseTileInfo(tileEl: XmlElement): TileInfo {
  const offsetX = parseIntAttr(tileEl, 'tx') ?? 0;
  const offsetY = parseIntAttr(tileEl, 'ty') ?? 0;
  const sxRaw = parseIntAttr(tileEl, 'sx') ?? 100_000;
  const syRaw = parseIntAttr(tileEl, 'sy') ?? 100_000;
  const flip = parseEnumAttr(tileEl, 'flip', [
    'none',
    'x',
    'y',
    'xy',
  ] as const);
  const alignment = tileEl.attr('algn');

  return {
    offsetX,
    offsetY,
    scaleX: sxRaw / 100_000,
    scaleY: syRaw / 100_000,
    flip,
    alignment,
  };
}

/**
 * Parse a source crop rectangle from `<a:srcRect>`.
 *
 * Crop values are in 1/1000ths of a percent (0-100000 -> 0-1),
 * measured inward from each edge.
 *
 * ```xml
 * <a:srcRect l="10000" t="20000" r="10000" b="20000"/>
 * ```
 */
function parseCropRect(srcRectEl: XmlElement): CropRect {
  const l = parseIntAttr(srcRectEl, 'l') ?? 0;
  const t = parseIntAttr(srcRectEl, 't') ?? 0;
  const r = parseIntAttr(srcRectEl, 'r') ?? 0;
  const b = parseIntAttr(srcRectEl, 'b') ?? 0;
  return {
    left: l / 100_000,
    top: t / 100_000,
    right: r / 100_000,
    bottom: b / 100_000,
  };
}
