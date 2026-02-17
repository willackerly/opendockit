/**
 * Picture parser for DrawingML picture elements (p:pic / pic:pic).
 *
 * Parses a picture element into {@link PictureIR}, extracting:
 * - Non-visual properties (name, description, hidden)
 * - Blip fill (image reference, crop, stretch, tile)
 * - Shape properties (transform, geometry)
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 19.3.1.37 (p:pic)
 */

import type { XmlElement } from '../../xml/index.js';
import type {
  ThemeIR,
  PictureIR,
  CropRect,
  TileInfo,
  PresetGeometryIR,
  ShapePropertiesIR,
} from '../../ir/index.js';
import type { ColorContext } from '../../theme/index.js';
import { parseIntAttr, parseBoolAttr, parseEnumAttr } from '../../xml/index.js';
import { parseTransform } from './transform.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a picture element (p:pic or pic:pic) into a {@link PictureIR}.
 *
 * Expected XML structure:
 * ```xml
 * <p:pic>
 *   <p:nvPicPr>
 *     <p:cNvPr id="4" name="Picture 3" descr="A photo"/>
 *     <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
 *     <p:nvPr/>
 *   </p:nvPicPr>
 *   <p:blipFill>
 *     <a:blip r:embed="rId2"/>
 *     <a:srcRect l="10000" t="10000" r="10000" b="10000"/>
 *     <a:stretch><a:fillRect/></a:stretch>
 *   </p:blipFill>
 *   <p:spPr>
 *     <a:xfrm>
 *       <a:off x="0" y="0"/>
 *       <a:ext cx="9144000" cy="6858000"/>
 *     </a:xfrm>
 *     <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
 *   </p:spPr>
 * </p:pic>
 * ```
 */
export function parsePicture(
  picElement: XmlElement,
  _theme: ThemeIR,
  _context?: ColorContext
): PictureIR {
  // --- Non-visual properties ---
  const nonVisualProperties = parseNonVisualProperties(picElement);

  // --- Blip fill ---
  const blipFillEl = picElement.child('p:blipFill');
  const imagePartUri = extractImagePartUri(blipFillEl);
  const blipFill = blipFillEl ? parseBlipFill(blipFillEl) : undefined;

  // --- Shape properties ---
  const spPrEl = picElement.child('p:spPr');
  const properties = spPrEl ? parseBasicShapeProperties(spPrEl) : { effects: [] };

  return {
    kind: 'picture',
    imagePartUri,
    properties,
    blipFill,
    nonVisualProperties,
  };
}

// ---------------------------------------------------------------------------
// Non-visual properties
// ---------------------------------------------------------------------------

/**
 * Parse non-visual properties from `p:nvPicPr/p:cNvPr`.
 *
 * Extracts name, description, and hidden flag.
 */
function parseNonVisualProperties(picElement: XmlElement): PictureIR['nonVisualProperties'] {
  const nvPicPr = picElement.child('p:nvPicPr');
  const cNvPr = nvPicPr?.child('p:cNvPr');

  const name = cNvPr?.attr('name') ?? '';
  const description = cNvPr?.attr('descr') ?? undefined;
  const hidden = cNvPr ? parseBoolAttr(cNvPr, 'hidden') : false;

  return {
    name,
    description,
    hidden: hidden || undefined,
  };
}

// ---------------------------------------------------------------------------
// Image part URI
// ---------------------------------------------------------------------------

/**
 * Extract the image relationship ID from `p:blipFill/a:blip @r:embed`.
 */
function extractImagePartUri(blipFillEl: XmlElement | undefined): string {
  if (!blipFillEl) return '';

  const blipEl = blipFillEl.child('a:blip');
  return blipEl?.attr('r:embed') ?? '';
}

// ---------------------------------------------------------------------------
// Blip fill
// ---------------------------------------------------------------------------

/**
 * Parse the blip fill element for crop, stretch, and tile information.
 */
function parseBlipFill(blipFillEl: XmlElement): PictureIR['blipFill'] {
  // Source crop rectangle
  const srcRectEl = blipFillEl.child('a:srcRect');
  const crop = srcRectEl ? parseCropRect(srcRectEl) : undefined;

  // Stretch mode
  const stretchEl = blipFillEl.child('a:stretch');
  const stretch = stretchEl !== undefined;

  // Tile mode
  const tileEl = blipFillEl.child('a:tile');
  const tile = tileEl ? parseTileInfo(tileEl) : undefined;

  return {
    crop,
    stretch: stretch || undefined,
    tile,
  };
}

/**
 * Parse a source crop rectangle from `<a:srcRect>`.
 *
 * Crop values are in 1/1000ths of a percent (0-100000 -> 0-1),
 * measured inward from each edge.
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
  const flip = parseEnumAttr(tileEl, 'flip', ['none', 'x', 'y', 'xy'] as const);
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

// ---------------------------------------------------------------------------
// Shape properties (inline transform + geometry)
// ---------------------------------------------------------------------------

/**
 * Parse basic shape properties from `p:spPr`.
 *
 * Extracts transform (a:xfrm) and preset geometry (a:prstGeom). Uses
 * the shared {@link parseTransform} from the transform module for
 * a:xfrm parsing, and handles a:prstGeom inline.
 */
function parseBasicShapeProperties(spPrEl: XmlElement): ShapePropertiesIR {
  const xfrmEl = spPrEl.child('a:xfrm');
  const transform = xfrmEl ? parseTransform(xfrmEl) : undefined;

  const prstGeomEl = spPrEl.child('a:prstGeom');
  const geometry = prstGeomEl ? parsePresetGeometry(prstGeomEl) : undefined;

  return {
    transform,
    geometry,
    effects: [],
  };
}

/**
 * Parse a preset geometry from `<a:prstGeom>`.
 *
 * ```xml
 * <a:prstGeom prst="rect">
 *   <a:avLst>
 *     <a:gd name="adj" fmla="val 16667"/>
 *   </a:avLst>
 * </a:prstGeom>
 * ```
 */
function parsePresetGeometry(prstGeomEl: XmlElement): PresetGeometryIR {
  const name = prstGeomEl.attr('prst') ?? 'rect';

  // Parse adjust values if present
  const avLst = prstGeomEl.child('a:avLst');
  let adjustValues: Record<string, number> | undefined;

  if (avLst) {
    const guides = avLst.allChildren('a:gd');
    if (guides.length > 0) {
      adjustValues = {};
      for (const gd of guides) {
        const gdName = gd.attr('name');
        const fmla = gd.attr('fmla');
        if (gdName && fmla) {
          // Adjust value formulas are "val <number>"
          const match = fmla.match(/^val\s+(\d+)$/);
          if (match) {
            adjustValues[gdName] = parseInt(match[1], 10);
          }
        }
      }
      // Only set if we actually found values
      if (Object.keys(adjustValues).length === 0) {
        adjustValues = undefined;
      }
    }
  }

  return {
    kind: 'preset',
    name,
    adjustValues,
  };
}
