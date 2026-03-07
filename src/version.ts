import packageJson from '../package.json' with { type: 'json' };

/**
 * Exposes the published package version at runtime so consumers can log/debug.
 */
export const PDFBOX_TS_VERSION = packageJson.version;

/**
 * Helper for callers that prefer a function form (e.g. to avoid tree shaking).
 */
export function getPdfboxTsVersion(): string {
  return PDFBOX_TS_VERSION;
}
