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

export { extractFontFromEot, deobfuscateOdttf } from './eot-parser.js';

export { isGoogleFont, loadGoogleFont, loadGoogleFonts } from './google-fonts-loader.js';

export {
  hasOflSubstitute,
  getOflSubstituteFamily,
  loadOflSubstitute,
  loadOflSubstitutes,
} from './font-cdn-loader.js';

export {
  hasBundledFont,
  loadBundledFont,
  loadBundledFonts,
} from './bundled-font-loader.js';

export {
  hasTTFBundle,
  loadTTF,
  clearTTFCache,
} from './ttf-loader.js';

export { FontResolver } from './font-resolver.js';
export { FontCache } from './font-cache.js';
export { fetchFromFontsource, fetchFromGoogleFonts } from './cdn-fetcher.js';
export type {
  FontConfig,
  FontRegistration,
  FontSource,
  FontResolutionStatus,
  FontProgressEvent,
} from './font-config.js';
export {
  SUBSTITUTION_REGISTRY,
  type SubstitutionEntry,
} from './substitution-table.js';

export { subsetFont, isSubsetAvailable } from './subset.js';
