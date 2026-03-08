/**
 * Numbering parser — extracts bullet and list definitions from
 * `word/numbering.xml`.
 *
 * OOXML numbering involves two concepts:
 * - Abstract numbering definitions (`<w:abstractNum>`) define the template
 *   for a list (number format, text, level indent, etc.)
 * - Numbering instances (`<w:num>`) reference an abstract definition and
 *   can apply overrides.
 *
 * This scaffold implements basic support: extracting the bullet character
 * or number format for each level, enough to render simple bulleted and
 * numbered lists.
 *
 * Reference: ECMA-376, Part 1, Section 17.9 (Numbering).
 */

import type { XmlElement } from '@opendockit/core';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Definition for a single numbering level. */
export interface NumberingLevelDef {
  /** Level index (0-8). */
  level: number;
  /** Number format: 'bullet', 'decimal', 'lowerLetter', 'upperLetter', etc. */
  numFmt: string;
  /** Level text pattern (e.g., '%1.' for decimal, '\uF0B7' for bullet). */
  levelText: string;
}

/** A numbering definition (resolved from abstract + instance). */
export interface NumberingDef {
  /** Numbering instance ID. */
  numId: number;
  /** Level definitions indexed by level number. */
  levels: Map<number, NumberingLevelDef>;
}

/** Map from numId to numbering definition. */
export type NumberingMap = Map<number, NumberingDef>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse the `word/numbering.xml` root element into a {@link NumberingMap}.
 *
 * @param numberingEl - The root `<w:numbering>` element.
 * @returns A map from numId to numbering definition.
 */
export function parseNumbering(numberingEl: XmlElement): NumberingMap {
  const abstractDefs = new Map<number, Map<number, NumberingLevelDef>>();
  const result: NumberingMap = new Map();

  // First pass: parse abstract numbering definitions
  for (const abstractNum of numberingEl.allChildren('w:abstractNum')) {
    const abstractId = abstractNum.attr('w:abstractNumId');
    if (abstractId === undefined) continue;

    const id = parseInt(abstractId, 10);
    if (Number.isNaN(id)) continue;

    const levels = new Map<number, NumberingLevelDef>();
    for (const lvl of abstractNum.allChildren('w:lvl')) {
      const levelDef = parseLevelDef(lvl);
      if (levelDef !== undefined) {
        levels.set(levelDef.level, levelDef);
      }
    }

    abstractDefs.set(id, levels);
  }

  // Second pass: create numbering instances
  for (const num of numberingEl.allChildren('w:num')) {
    const numIdAttr = num.attr('w:numId');
    if (numIdAttr === undefined) continue;

    const numId = parseInt(numIdAttr, 10);
    if (Number.isNaN(numId)) continue;

    const abstractNumIdEl = num.child('w:abstractNumId');
    if (abstractNumIdEl === undefined) continue;

    const abstractRef = abstractNumIdEl.attr('w:val');
    if (abstractRef === undefined) continue;

    const abstractId = parseInt(abstractRef, 10);
    if (Number.isNaN(abstractId)) continue;

    const levels = abstractDefs.get(abstractId) ?? new Map();

    result.set(numId, { numId, levels });
  }

  return result;
}

/**
 * Get the bullet character for a given numbering ID and level.
 *
 * @returns The bullet character or formatted number text, or `undefined`
 *          if the numbering definition is not found.
 */
export function getBulletChar(
  numberingMap: NumberingMap,
  numId: number,
  level: number
): string | undefined {
  const def = numberingMap.get(numId);
  if (def === undefined) return undefined;

  const levelDef = def.levels.get(level);
  if (levelDef === undefined) return undefined;

  if (levelDef.numFmt === 'bullet') {
    return levelDef.levelText || '\u2022';
  }

  // For numbered lists, return a generic indicator
  // (proper counter tracking would require state across paragraphs)
  return levelDef.levelText || '1.';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Parse a single `<w:lvl>` element into a level definition. */
function parseLevelDef(lvlEl: XmlElement): NumberingLevelDef | undefined {
  const ilvlAttr = lvlEl.attr('w:ilvl');
  if (ilvlAttr === undefined) return undefined;

  const level = parseInt(ilvlAttr, 10);
  if (Number.isNaN(level)) return undefined;

  const numFmtEl = lvlEl.child('w:numFmt');
  const numFmt = numFmtEl?.attr('w:val') ?? 'decimal';

  const lvlTextEl = lvlEl.child('w:lvlText');
  const levelText = lvlTextEl?.attr('w:val') ?? '';

  return { level, numFmt, levelText };
}
