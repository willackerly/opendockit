/**
 * Font system — substitution, metrics, loading, and precomputed metrics DB.
 *
 * Re-exports all public API from:
 * - {@link ./substitution-table} — font name resolution and substitution
 * - {@link ./font-metrics} — text width estimation and line height
 * - {@link ./font-loader} — font availability and dynamic loading
 * - {@link ./font-metrics-db} — precomputed font metrics database
 */

export { getFontSubstitution, resolveFontName } from './substitution-table.js';

export { estimateTextWidth, getLineHeight, getAverageCharWidthRatio } from './font-metrics.js';

export { isFontAvailable, loadFont, ensureFontLoaded } from './font-loader.js';

export { FontMetricsDB } from './font-metrics-db.js';
export type { FontFaceMetrics, FontMetricsBundle } from './font-metrics-db.js';
