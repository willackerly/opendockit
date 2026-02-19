/**
 * OFL substitute font loader via CDN.
 *
 * Loads metric-compatible OFL substitutes for common Microsoft Office fonts
 * from jsDelivr (Fontsource packages). This provides a legal, freely
 * redistributable path to accurate rendering without bundling font files
 * in the npm package.
 *
 * Substitute mappings:
 * - Calibri → Carlito
 * - Cambria → Caladea
 */

import { loadFont } from './font-loader.js';
import { hasBundledFont } from './bundled-font-loader.js';

interface SubstituteEntry {
  /** The OFL font family name to register as. */
  substituteFamily: string;
  /** CDN URLs keyed by variant descriptor. */
  variants: Record<string, { url: string; weight?: string; style?: string }>;
}

/** Maps Office font families to their OFL substitutes and CDN URLs. */
const OFL_SUBSTITUTES: Record<string, SubstituteEntry> = {
  Calibri: {
    substituteFamily: 'Carlito',
    variants: {
      regular: {
        url: 'https://cdn.jsdelivr.net/fontsource/fonts/carlito@latest/latin-400-normal.woff2',
      },
      bold: {
        url: 'https://cdn.jsdelivr.net/fontsource/fonts/carlito@latest/latin-700-normal.woff2',
        weight: 'bold',
      },
      italic: {
        url: 'https://cdn.jsdelivr.net/fontsource/fonts/carlito@latest/latin-400-italic.woff2',
        style: 'italic',
      },
      boldItalic: {
        url: 'https://cdn.jsdelivr.net/fontsource/fonts/carlito@latest/latin-700-italic.woff2',
        weight: 'bold',
        style: 'italic',
      },
    },
  },
  Cambria: {
    substituteFamily: 'Caladea',
    variants: {
      regular: {
        url: 'https://cdn.jsdelivr.net/fontsource/fonts/caladea@latest/latin-400-normal.woff2',
      },
      bold: {
        url: 'https://cdn.jsdelivr.net/fontsource/fonts/caladea@latest/latin-700-normal.woff2',
        weight: 'bold',
      },
      italic: {
        url: 'https://cdn.jsdelivr.net/fontsource/fonts/caladea@latest/latin-400-italic.woff2',
        style: 'italic',
      },
      boldItalic: {
        url: 'https://cdn.jsdelivr.net/fontsource/fonts/caladea@latest/latin-700-italic.woff2',
        weight: 'bold',
        style: 'italic',
      },
    },
  },
};

/** Track which substitutes have been loaded. */
const loadedSubstitutes = new Set<string>();

/**
 * Check if a font family has an OFL substitute available.
 */
export function hasOflSubstitute(family: string): boolean {
  return family in OFL_SUBSTITUTES;
}

/**
 * Get the OFL substitute family name for an Office font.
 * Returns undefined if no substitute is available.
 */
export function getOflSubstituteFamily(family: string): string | undefined {
  return OFL_SUBSTITUTES[family]?.substituteFamily;
}

/**
 * Load the OFL substitute for an Office font family from CDN.
 *
 * Downloads WOFF2 files from jsDelivr and registers them via the FontFace API
 * under the *original* Office font name. This way Canvas2D will use the
 * substitute transparently when the text renderer requests "Calibri".
 *
 * @param family - The Office font family name (e.g. "Calibri").
 * @returns true if at least one variant was loaded.
 */
export async function loadOflSubstitute(family: string): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (loadedSubstitutes.has(family)) return true;
  // Skip CDN fetch if this family has a bundled WOFF2.
  if (hasBundledFont(family)) return false;

  const entry = OFL_SUBSTITUTES[family];
  if (!entry) return false;

  loadedSubstitutes.add(family);

  const results = await Promise.all(
    Object.values(entry.variants).map(async (variant) => {
      try {
        const response = await fetch(variant.url);
        if (!response.ok) return false;
        const buffer = await response.arrayBuffer();
        const descriptors: FontFaceDescriptors = {};
        if (variant.weight) descriptors.weight = variant.weight;
        if (variant.style) descriptors.style = variant.style;
        // Register under the original Office font name for transparent substitution.
        return loadFont(family, buffer, descriptors);
      } catch {
        return false;
      }
    })
  );

  return results.some(Boolean);
}

/**
 * Load OFL substitutes for all applicable font families.
 *
 * @param families - Font families referenced in the document.
 * @returns Map of family name → success boolean (only for families with substitutes).
 */
export async function loadOflSubstitutes(families: string[]): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  const toLoad = families.filter((f) => {
    if (!(f in OFL_SUBSTITUTES)) return false;
    if (loadedSubstitutes.has(f)) {
      results.set(f, true);
      return false;
    }
    return true;
  });

  if (toLoad.length === 0) return results;

  await Promise.all(
    toLoad.map(async (family) => {
      const ok = await loadOflSubstitute(family);
      results.set(family, ok);
    })
  );

  return results;
}
