/**
 * Font resolver for OOXML theme font references.
 *
 * Resolves theme font references like `+mj-lt` (major Latin) and `+mn-lt`
 * (minor Latin) to concrete font family names from the theme's font scheme.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.4.1.16 (Theme Fonts)
 */

import type { ThemeIR } from '../ir/index.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Theme font reference mapping.
 *
 * Format: `+{mj|mn}-{lt|ea|cs}`
 * - mj = major font, mn = minor font
 * - lt = Latin, ea = East Asian, cs = Complex Script
 */
const FONT_REF_MAP: Record<string, (theme: ThemeIR) => string | undefined> = {
  '+mj-lt': (t) => t.fontScheme.majorLatin,
  '+mj-ea': (t) => t.fontScheme.majorEastAsia,
  '+mj-cs': (t) => t.fontScheme.majorComplexScript,
  '+mn-lt': (t) => t.fontScheme.minorLatin,
  '+mn-ea': (t) => t.fontScheme.minorEastAsia,
  '+mn-cs': (t) => t.fontScheme.minorComplexScript,
};

/**
 * Resolve a theme font reference to a concrete font family name.
 *
 * @param ref - A font reference string, e.g. `'+mj-lt'`, `'+mn-lt'`, or a
 *              direct font name like `'Arial'`.
 * @param theme - The resolved theme
 * @returns The concrete font name if `ref` is a theme reference and the
 *          font is defined; otherwise `undefined`.
 *
 * @example
 * ```ts
 * resolveThemeFont('+mj-lt', theme); // => 'Calibri Light'
 * resolveThemeFont('+mn-lt', theme); // => 'Calibri'
 * resolveThemeFont('Arial', theme);  // => undefined (not a theme ref)
 * ```
 */
export function resolveThemeFont(ref: string, theme: ThemeIR): string | undefined {
  const resolver = FONT_REF_MAP[ref];
  if (!resolver) {
    return undefined;
  }
  return resolver(theme);
}

/**
 * Check if a font name is a theme font reference.
 *
 * Theme font references start with `+mj-` (major) or `+mn-` (minor).
 *
 * @param fontName - The font name to check
 * @returns `true` if the name is a theme font reference
 *
 * @example
 * ```ts
 * isThemeFontRef('+mj-lt');  // => true
 * isThemeFontRef('+mn-ea');  // => true
 * isThemeFontRef('Arial');   // => false
 * ```
 */
export function isThemeFontRef(fontName: string): boolean {
  return fontName.startsWith('+mj-') || fontName.startsWith('+mn-');
}
