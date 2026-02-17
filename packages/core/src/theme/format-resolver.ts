/**
 * Format scheme resolver for OOXML style matrix references.
 *
 * Resolves `fillRef`, `lnRef`, `effectRef`, and `bgFillRef` attributes
 * from shape style elements to concrete fill, line, and effect definitions
 * from the theme's format scheme.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.4.2.9 (Shape Style)
 */

import type { ThemeIR, FillIR, LineIR, EffectIR } from '../ir/index.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Resolved format style components. */
export interface ResolvedFormatStyle {
  fill?: FillIR;
  line?: LineIR;
  effects?: EffectIR[];
}

/**
 * Resolve a style matrix reference to a concrete format style.
 *
 * The `idx` parameter is **1-based** as specified in OOXML:
 * - `fillRef idx="1"` -> first fill style (index 0 in the array)
 * - `fillRef idx="2"` -> second fill style (index 1)
 * - `fillRef idx="3"` -> third fill style (index 2)
 *
 * For fill/bgFill, indices > 1000 refer to background fill styles
 * (subtract 1000 to get the array index).
 *
 * @param idx - 1-based style index from the XML attribute
 * @param type - The type of style to resolve
 * @param theme - The resolved theme
 * @returns The resolved fill, line, or effects; undefined if out of range
 */
export function resolveFormatStyle(
  idx: number,
  type: 'fill' | 'line' | 'effect' | 'bgFill',
  theme: ThemeIR
): FillIR | LineIR | EffectIR[] | undefined {
  if (idx <= 0) return undefined;

  const scheme = theme.formatScheme;

  switch (type) {
    case 'fill': {
      // Indices > 1000 reference background fill styles
      if (idx > 1000) {
        const bgIdx = idx - 1001;
        return scheme.bgFillStyles[bgIdx];
      }
      const fillIdx = idx - 1;
      return scheme.fillStyles[fillIdx];
    }

    case 'bgFill': {
      const bgIdx = idx - 1;
      return scheme.bgFillStyles[bgIdx];
    }

    case 'line': {
      const lineIdx = idx - 1;
      return scheme.lineStyles[lineIdx];
    }

    case 'effect': {
      const effectIdx = idx - 1;
      return scheme.effectStyles[effectIdx];
    }

    default:
      return undefined;
  }
}
