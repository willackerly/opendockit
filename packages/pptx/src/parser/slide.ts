/**
 * Slide parser for PresentationML.
 *
 * Parses `p:sld` elements into {@link SlideIR}, extracting the shape tree,
 * background, and color map override.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 19.3.1.38 (sld)
 */

import type { XmlElement, ThemeIR } from '@opendockit/core';
import type { SlideIR } from '../model/index.js';
import { parseShapeTreeChildren } from './shape-tree.js';
import { parseBackground } from './background.js';
import { parseColorMapOverride } from './color-map.js';

/**
 * Parse a slide XML element (`p:sld`).
 *
 * @param slideElement - The root `p:sld` XML element.
 * @param partUri - OPC part URI of this slide.
 * @param layoutPartUri - OPC part URI of the associated slide layout.
 * @param masterPartUri - OPC part URI of the associated slide master.
 * @param theme - The resolved presentation theme.
 * @returns Parsed slide IR.
 */
export function parseSlide(
  slideElement: XmlElement,
  partUri: string,
  layoutPartUri: string,
  masterPartUri: string,
  theme: ThemeIR
): SlideIR {
  const cSld = slideElement.child('p:cSld');

  // Parse shape tree
  const spTree = cSld?.child('p:spTree');
  const elements = spTree ? parseShapeTreeChildren(spTree, theme) : [];

  // Parse background
  const bgElement = cSld?.child('p:bg');
  const background = bgElement ? parseBackground(bgElement, theme) : undefined;

  // Parse color map override
  const clrMapOvr = slideElement.child('p:clrMapOvr');
  const colorMap = clrMapOvr ? parseColorMapOverride(clrMapOvr) : undefined;

  return {
    partUri,
    elements,
    background,
    colorMap,
    layoutPartUri,
    masterPartUri,
  };
}
