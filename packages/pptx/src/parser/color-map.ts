/**
 * Color map parser for PresentationML.
 *
 * Parses `p:clrMap` and `p:clrMapOvr/a:overrideClrMapping` elements
 * into {@link ColorMapOverride} dictionaries. These map scheme color
 * roles (bg1, tx1, etc.) to theme color slots (lt1, dk1, etc.).
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 19.3.1.6 (clrMap)
 */

import type { XmlElement } from '@opendockit/core';
import type { ColorMapOverride } from '../model/index.js';

/** The standard color map attribute names from OOXML. */
const COLOR_MAP_ATTRS = [
  'bg1',
  'tx1',
  'bg2',
  'tx2',
  'accent1',
  'accent2',
  'accent3',
  'accent4',
  'accent5',
  'accent6',
  'hlink',
  'folHlink',
] as const;

/**
 * Parse a color map element (`p:clrMap` or `a:overrideClrMapping`)
 * into a {@link ColorMapOverride}.
 *
 * @param element - The XML element containing color map attributes.
 * @returns Color map dictionary.
 */
export function parseColorMap(element: XmlElement): ColorMapOverride {
  const map: ColorMapOverride = {};

  for (const attrName of COLOR_MAP_ATTRS) {
    const value = element.attr(attrName);
    if (value !== undefined) {
      map[attrName] = value;
    }
  }

  return map;
}

/**
 * Parse a color map override element (`p:clrMapOvr`).
 *
 * The override can contain either:
 * - `a:masterClrMapping` — inherit the master's color map (returns undefined)
 * - `a:overrideClrMapping` — override with specific mappings
 *
 * @param clrMapOvr - The `p:clrMapOvr` XML element.
 * @returns Color map override, or undefined if using master mapping.
 */
export function parseColorMapOverride(clrMapOvr: XmlElement): ColorMapOverride | undefined {
  // If using master mapping, no override
  if (clrMapOvr.child('a:masterClrMapping')) {
    return undefined;
  }

  const override = clrMapOvr.child('a:overrideClrMapping');
  if (override) {
    return parseColorMap(override);
  }

  return undefined;
}
