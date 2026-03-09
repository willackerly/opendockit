/**
 * TTF font loader — loads raw TrueType font bytes for PDF embedding.
 *
 * Uses dynamic imports to load base64-encoded TTF data from bundled modules.
 * Each module is code-split so only fonts actually needed for PDF export
 * are loaded. Decoded bytes are cached for repeated access.
 *
 * @module ttf-loader
 */

import { BUNDLED_TTF_FONTS } from './data/ttf/manifest.js';

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/** family|bold|italic → decoded Uint8Array */
const cache = new Map<string, Uint8Array>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if a TTF bundle is available for a font family.
 */
export function hasTTFBundle(family: string): boolean {
  return family.toLowerCase() in BUNDLED_TTF_FONTS;
}

/**
 * Resolve a manifest module path to a URL relative to this file.
 *
 * Same pattern as bundled-font-loader.ts — handles Vite dev (.ts)
 * vs production build (.js) path differences.
 */
function resolveModuleUrl(manifestModule: string): string {
  const relativePath = manifestModule.replace('./', './data/ttf/');
  const url = new URL(relativePath, import.meta.url);
  // Vite dev server serves source .ts files, not compiled .js
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    return url.href.replace(/\.js(\?.*)?$/, '.ts$1');
  }
  return url.href;
}

/**
 * Decode a base64 string to a Uint8Array.
 */
function base64ToUint8Array(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binaryStr = atob(b64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }
  // Node.js fallback
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/**
 * Resolve a variant key from bold/italic flags.
 */
function resolveVariant(
  bold: boolean,
  italic: boolean,
  availableVariants: string[]
): string | null {
  const target = bold && italic ? 'boldItalic' : bold ? 'bold' : italic ? 'italic' : 'regular';
  if (availableVariants.includes(target)) return target;

  // Fallback cascade (mirrors FontMetricsDB._resolveFace logic)
  if (target === 'boldItalic') {
    if (availableVariants.includes('bold')) return 'bold';
    if (availableVariants.includes('italic')) return 'italic';
    if (availableVariants.includes('regular')) return 'regular';
  }

  if (availableVariants.includes('regular')) return 'regular';
  return availableVariants[0] ?? null;
}

/**
 * Load raw TrueType font bytes for PDF embedding.
 *
 * Dynamically imports the TTF module, base64-decodes the data, and caches
 * the result. Returns `null` if no TTF bundle is available for the font.
 *
 * @param family - Font family name (e.g., "Carlito", "Calibri", "Roboto")
 * @param bold - Whether to load the bold variant
 * @param italic - Whether to load the italic variant
 * @returns Raw TTF bytes as Uint8Array, or null if unavailable
 */
export async function loadTTF(
  family: string,
  bold: boolean,
  italic: boolean
): Promise<Uint8Array | null> {
  const key = `${family.toLowerCase()}|${bold}|${italic}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const entry = BUNDLED_TTF_FONTS[family.toLowerCase()];
  if (!entry) return null;

  const variant = resolveVariant(bold, italic, entry.variants);
  if (!variant) return null;

  try {
    const url = resolveModuleUrl(entry.module);
    const mod = await import(/* @vite-ignore */ url);
    const b64: string | undefined = mod[variant];
    if (!b64) return null;

    const bytes = base64ToUint8Array(b64);
    cache.set(key, bytes);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Clear the TTF cache. Useful for testing.
 */
export function clearTTFCache(): void {
  cache.clear();
}
