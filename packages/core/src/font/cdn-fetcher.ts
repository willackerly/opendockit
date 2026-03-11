/**
 * CDN font fetchers for Fontsource and Google Fonts.
 *
 * Uses only built-in browser APIs (fetch, DOM). No external dependencies.
 * Both functions return null/false on any error — callers fall through
 * to the next source in the resolution chain.
 */

const FONTSOURCE_BASE = 'https://cdn.jsdelivr.net/fontsource/fonts';
const FETCH_TIMEOUT_MS = 5000;

/**
 * Fetch a WOFF2 binary from the Fontsource CDN (served via jsDelivr).
 *
 * URL pattern: `{base}/{id}@latest/{subset}-{weight}-{style}.woff2`
 *
 * Returns the font binary on success, or null on any error (404, timeout, network).
 */
export async function fetchFromFontsource(
  fontsourceId: string,
  weight: number = 400,
  style: string = 'normal',
  subset: string = 'latin',
): Promise<ArrayBuffer | null> {
  const url = `${FONTSOURCE_BASE}/${fontsourceId}@latest/${subset}-${weight}-${style}.woff2`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return res.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Load a font via the Google Fonts CSS API by injecting a `<link>` stylesheet.
 *
 * Google handles WOFF2 delivery and unicode-range subsetting automatically.
 * Returns true if the link was injected, false in Node.js or on error.
 */
export async function fetchFromGoogleFonts(
  family: string,
  weights: number[] = [400, 700],
): Promise<boolean> {
  if (typeof document === 'undefined') return false;

  const weightStr = weights.join(';');
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weightStr}&display=swap`;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;

  return new Promise<boolean>((resolve) => {
    link.onload = () => resolve(true);
    link.onerror = () => resolve(false);
    document.head.appendChild(link);
  });
}
