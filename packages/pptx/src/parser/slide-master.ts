/**
 * Slide master parser for PresentationML.
 *
 * Parses `p:sldMaster` elements into {@link SlideMasterIR}, extracting
 * the shape tree, background, and color map.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 19.3.1.42 (sldMaster)
 */

import type { XmlElement, ThemeIR } from '@opendockit/core';
import type { SlideMasterIR } from '../model/index.js';
import { parseShapeTreeChildren } from './shape-tree.js';
import { parseBackground } from './background.js';
import { parseColorMap } from './color-map.js';

/**
 * Parse a slide master XML element (`p:sldMaster`).
 *
 * @param masterElement - The root `p:sldMaster` XML element.
 * @param partUri - OPC part URI of this slide master.
 * @param theme - The resolved presentation theme.
 * @returns Parsed slide master IR.
 */
export function parseSlideMaster(
  masterElement: XmlElement,
  partUri: string,
  theme: ThemeIR
): SlideMasterIR {
  const cSld = masterElement.child('p:cSld');

  // Parse shape tree
  const spTree = cSld?.child('p:spTree');
  const elements = spTree ? parseShapeTreeChildren(spTree, theme) : [];

  // Parse background
  const bgElement = cSld?.child('p:bg');
  const background = bgElement ? parseBackground(bgElement, theme) : undefined;

  // Parse color map (required on slide masters)
  const clrMapEl = masterElement.child('p:clrMap');
  const colorMap = clrMapEl ? parseColorMap(clrMapEl) : {};

  return {
    partUri,
    elements,
    background,
    colorMap,
  };
}
