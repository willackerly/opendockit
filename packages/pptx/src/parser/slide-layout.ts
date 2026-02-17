/**
 * Slide layout parser for PresentationML.
 *
 * Parses `p:sldLayout` elements into {@link SlideLayoutIR}, extracting
 * the shape tree, background, and color map override.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 19.3.1.39 (sldLayout)
 */

import type { XmlElement, ThemeIR } from '@opendockit/core';
import type { SlideLayoutIR } from '../model/index.js';
import { parseShapeTreeChildren } from './shape-tree.js';
import { parseBackground } from './background.js';
import { parseColorMapOverride } from './color-map.js';

/**
 * Parse a slide layout XML element (`p:sldLayout`).
 *
 * @param layoutElement - The root `p:sldLayout` XML element.
 * @param partUri - OPC part URI of this slide layout.
 * @param masterPartUri - OPC part URI of the associated slide master.
 * @param theme - The resolved presentation theme.
 * @returns Parsed slide layout IR.
 */
export function parseSlideLayout(
  layoutElement: XmlElement,
  partUri: string,
  masterPartUri: string,
  theme: ThemeIR
): SlideLayoutIR {
  const cSld = layoutElement.child('p:cSld');

  // Parse shape tree
  const spTree = cSld?.child('p:spTree');
  const elements = spTree ? parseShapeTreeChildren(spTree, theme) : [];

  // Parse background
  const bgElement = cSld?.child('p:bg');
  const background = bgElement ? parseBackground(bgElement, theme) : undefined;

  // Parse color map override
  const clrMapOvr = layoutElement.child('p:clrMapOvr');
  const colorMap = clrMapOvr ? parseColorMapOverride(clrMapOvr) : undefined;

  return {
    partUri,
    elements,
    background,
    masterPartUri,
    colorMap,
  };
}
