/**
 * Theme Engine — barrel export.
 *
 * Re-exports the full public API for theme parsing and resolution:
 * - {@link parseTheme} — parse theme1.xml into ThemeIR
 * - {@link resolveColor} / {@link resolveColorFromParent} — resolve OOXML colors
 * - {@link resolveThemeFont} / {@link isThemeFontRef} — resolve font references
 * - {@link resolveFormatStyle} — resolve style matrix references
 */

export { parseTheme } from './theme-parser.js';

export { resolveColor, resolveColorFromParent } from './color-resolver.js';
export type { ColorContext } from './color-resolver.js';

export { resolveThemeFont, isThemeFontRef } from './font-resolver.js';

export { resolveFormatStyle } from './format-resolver.js';
export type { ResolvedFormatStyle } from './format-resolver.js';
