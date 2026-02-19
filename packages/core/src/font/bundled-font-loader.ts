/**
 * Bundled WOFF2 font loader.
 *
 * Loads fonts from base64-encoded WOFF2 data bundled in the npm package.
 * Uses dynamic imports so bundlers can code-split per-family.
 *
 * Substitute mappings are handled transparently: requesting "Calibri"
 * loads the Carlito module and registers the font under "Calibri".
 */

import { loadFont } from './font-loader.js';
import { BUNDLED_FONTS } from './data/woff2/manifest.js';

/** Track which families have been loaded. */
const loadedFamilies = new Set<string>();

/**
 * Check if a font family has bundled WOFF2 data available.
 *
 * Checks both the original family name and substitute mappings
 * (e.g., "Calibri" → Carlito bundle, "Arial" → Liberation Sans bundle).
 */
export function hasBundledFont(family: string): boolean {
  return family.toLowerCase() in BUNDLED_FONTS;
}

/**
 * Decode a base64 string to an ArrayBuffer.
 */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binaryStr = atob(b64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

/** Variant name → FontFace descriptors. */
const VARIANT_DESCRIPTORS: Record<string, FontFaceDescriptors> = {
  regular: {},
  bold: { weight: 'bold' },
  italic: { style: 'italic' },
  boldItalic: { weight: 'bold', style: 'italic' },
};

/**
 * Load a single bundled font family.
 *
 * Dynamically imports the WOFF2 module, decodes base64 data, and
 * registers each variant via the FontFace API.
 *
 * The font is registered under `registerAs` from the manifest —
 * for substitutes this is the Office font name (e.g., "Calibri").
 *
 * @param family - Font family name (e.g., "Calibri", "Roboto").
 * @returns true if at least one variant was loaded.
 */
export async function loadBundledFont(family: string): Promise<boolean> {
  if (typeof document === 'undefined') return false;

  const key = family.toLowerCase();
  if (loadedFamilies.has(key)) return true;

  const entry = BUNDLED_FONTS[key];
  if (!entry) return false;

  loadedFamilies.add(key);

  try {
    // Dynamic import for code splitting — bundlers will create a separate chunk.
    const mod = await import(/* @vite-ignore */ entry.module);

    const results = await Promise.all(
      entry.variants.map(async (variant) => {
        const b64: string | undefined = mod[variant];
        if (!b64) return false;

        try {
          const buffer = base64ToArrayBuffer(b64);
          const descriptors = VARIANT_DESCRIPTORS[variant] ?? {};
          return loadFont(entry.registerAs, buffer, descriptors);
        } catch {
          return false;
        }
      })
    );

    return results.some(Boolean);
  } catch {
    // Module import failed — font not available.
    loadedFamilies.delete(key);
    return false;
  }
}

/**
 * Load bundled fonts for all applicable families.
 *
 * Filters input to only families with bundled data, skips already-loaded
 * families, and loads all remaining in parallel.
 *
 * @param families - Font family names to attempt loading.
 * @returns Map of family name → success boolean (only for bundled families).
 */
export async function loadBundledFonts(families: string[]): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  const toLoad = families.filter((f) => {
    const key = f.toLowerCase();
    if (!(key in BUNDLED_FONTS)) return false;
    if (loadedFamilies.has(key)) {
      results.set(f, true);
      return false;
    }
    return true;
  });

  if (toLoad.length === 0) return results;

  await Promise.all(
    toLoad.map(async (family) => {
      const ok = await loadBundledFont(family);
      results.set(family, ok);
    })
  );

  return results;
}
