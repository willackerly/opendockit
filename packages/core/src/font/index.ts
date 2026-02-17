/**
 * Font system — substitution, metrics, and loading.
 *
 * Re-exports all public API from:
 * - {@link ./substitution-table} — font name resolution and substitution
 * - {@link ./font-metrics} — text width estimation and line height
 * - {@link ./font-loader} — font availability and dynamic loading
 */

export { getFontSubstitution, resolveFontName } from './substitution-table.js';

export { estimateTextWidth, getLineHeight, getAverageCharWidthRatio } from './font-metrics.js';

export { isFontAvailable, loadFont, ensureFontLoaded } from './font-loader.js';
