/**
 * Background parser for PresentationML.
 *
 * Parses `p:bg` elements into {@link BackgroundIR}, handling both
 * inline background properties (`p:bgPr`) and theme format references
 * (`p:bgRef`).
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 19.3.1.1-2 (bg, bgPr, bgRef)
 */

import type { XmlElement, ThemeIR, FillIR } from '@opendockit/core';
import { resolveFormatStyle, resolveColorFromParent } from '@opendockit/core/theme';
import type { BackgroundIR } from '../model/index.js';

/**
 * Parse a `p:bg` element into a {@link BackgroundIR}.
 *
 * A background can be specified in two ways:
 * 1. `p:bgPr` — inline fill properties (solidFill, gradFill, etc.)
 * 2. `p:bgRef` — a reference to a theme background fill style
 *
 * @param bgElement - The `p:bg` XML element.
 * @param theme - The resolved theme for format/color lookups.
 * @returns Parsed background IR.
 */
export function parseBackground(bgElement: XmlElement, theme: ThemeIR): BackgroundIR {
  // Option 1: inline background properties
  const bgPr = bgElement.child('p:bgPr');
  if (bgPr) {
    const fill = parseBgFill(bgPr, theme);
    return { fill };
  }

  // Option 2: theme format reference
  const bgRef = bgElement.child('p:bgRef');
  if (bgRef) {
    const fill = resolveBackgroundRef(bgRef, theme);
    return { fill };
  }

  return {};
}

/**
 * Parse a fill from a `p:bgPr` element.
 *
 * The fill children are direct children of `p:bgPr` and follow the same
 * pattern as shape property fills: solidFill, gradFill, pattFill, noFill.
 */
function parseBgFill(bgPr: XmlElement, theme: ThemeIR): FillIR | undefined {
  if (bgPr.child('a:noFill')) {
    return { type: 'none' };
  }

  const solidFill = bgPr.child('a:solidFill');
  if (solidFill) {
    const color = resolveColorFromParent(solidFill, theme);
    return { type: 'solid', color: color ?? { r: 0, g: 0, b: 0, a: 1 } };
  }

  const gradFill = bgPr.child('a:gradFill');
  if (gradFill) {
    return parseGradientBgFill(gradFill, theme);
  }

  const blipFill = bgPr.child('a:blipFill');
  if (blipFill) {
    const blip = blipFill.child('a:blip');
    if (blip) {
      const rEmbed = blip.attr('r:embed');
      if (rEmbed) {
        return { type: 'picture', imagePartUri: rEmbed } as FillIR;
      }
    }
  }

  return undefined;
}

/**
 * Parse a gradient fill from a background properties element.
 */
function parseGradientBgFill(gradFill: XmlElement, theme: ThemeIR): FillIR {
  const gsLst = gradFill.child('a:gsLst');
  const stops: { position: number; color: { r: number; g: number; b: number; a: number } }[] = [];

  if (gsLst) {
    for (const gs of gsLst.allChildren('a:gs')) {
      const posRaw = gs.attr('pos');
      const position = posRaw ? parseInt(posRaw, 10) / 100000 : 0;
      const color = resolveColorFromParent(gs, theme) ?? { r: 0, g: 0, b: 0, a: 1 };
      stops.push({ position, color });
    }
  }

  const lin = gradFill.child('a:lin');
  if (lin) {
    const angRaw = lin.attr('ang');
    const angle = angRaw ? parseInt(angRaw, 10) / 60000 : 0;
    return { type: 'gradient', kind: 'linear', angle, stops };
  }

  const path = gradFill.child('a:path');
  if (path) {
    const pathType = path.attr('path');
    return { type: 'gradient', kind: pathType === 'circle' ? 'radial' : 'path', stops };
  }

  return { type: 'gradient', kind: 'linear', angle: 0, stops };
}

/**
 * Resolve a `p:bgRef` element to a fill.
 *
 * The bgRef has an `idx` attribute that indexes into the theme's background
 * fill style list (1-based). It also contains a color child element that
 * provides the scheme color for the fill.
 */
function resolveBackgroundRef(bgRef: XmlElement, theme: ThemeIR): FillIR | undefined {
  const idxStr = bgRef.attr('idx');
  if (idxStr === undefined) return undefined;

  const idx = parseInt(idxStr, 10);
  if (isNaN(idx) || idx <= 0) return undefined;

  // resolveFormatStyle returns FillIR directly for 'bgFill' type
  const resolved = resolveFormatStyle(idx, 'bgFill', theme);
  return resolved as FillIR | undefined;
}
