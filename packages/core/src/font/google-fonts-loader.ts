/**
 * Google Fonts CDN loader.
 *
 * Dynamically loads fonts from Google Fonts when they are referenced in a
 * PPTX but not available locally or embedded. This is common for Google
 * Slides presentations which use Google Fonts extensively.
 *
 * Fonts are loaded by injecting a `<link>` element for the Google Fonts
 * CSS API, which handles WOFF2 delivery and subsetting automatically.
 */

import { hasBundledFont } from './bundled-font-loader.js';

/** Set of known Google Fonts families commonly used in presentations. */
const GOOGLE_FONTS = new Set([
  'Arimo',
  'Barlow',
  'Comfortaa',
  'Courier Prime',
  'Fira Code',
  'Lato',
  'Montserrat',
  'Noto Sans',
  'Noto Sans Symbols',
  'Noto Serif',
  'Open Sans',
  'Oswald',
  'Play',
  'Playfair Display',
  'Poppins',
  'Raleway',
  'Roboto',
  'Roboto Mono',
  'Roboto Slab',
  'Source Code Pro',
  'Source Sans Pro',
  'Tinos',
  'Ubuntu',
]);

/** Track which fonts have already been requested to avoid duplicate loads. */
const loadedFonts = new Set<string>();

/**
 * Check if a font family is a known Google Font.
 */
export function isGoogleFont(family: string): boolean {
  return GOOGLE_FONTS.has(family);
}

/**
 * Load a single Google Font family with specified weights.
 *
 * @param family - Font family name (e.g. "Roboto Slab").
 * @param weights - Weight values to load (default: [400, 700]).
 * @returns true if the font link was injected (or already loaded).
 */
export async function loadGoogleFont(
  family: string,
  weights: number[] = [400, 700]
): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (loadedFonts.has(family)) return true;
  // Skip CDN fetch if this family has a bundled WOFF2.
  if (hasBundledFont(family)) return false;

  loadedFonts.add(family);

  const weightStr = weights.join(';');
  const encodedFamily = encodeURIComponent(family);
  const url = `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@${weightStr}&display=swap`;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;

  return new Promise<boolean>((resolve) => {
    link.onload = () => resolve(true);
    link.onerror = () => resolve(false);
    document.head.appendChild(link);
  });
}

/**
 * Batch-load multiple Google Fonts families.
 *
 * Filters the input to only known Google Fonts, skips already-loaded fonts,
 * and loads all remaining in parallel.
 *
 * @param families - Font family names to attempt loading.
 * @returns Map of family name → success boolean.
 */
export async function loadGoogleFonts(families: string[]): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  const toLoad = families.filter((f) => {
    if (!GOOGLE_FONTS.has(f)) return false;
    if (loadedFonts.has(f)) {
      results.set(f, true);
      return false;
    }
    return true;
  });

  if (toLoad.length === 0) return results;

  const promises = toLoad.map(async (family) => {
    const ok = await loadGoogleFont(family);
    results.set(family, ok);
  });

  await Promise.all(promises);
  return results;
}
