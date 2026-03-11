/**
 * Bundled WOFF2 font loader.
 *
 * Loads fonts from the @opendockit/fonts companion package when installed.
 * If the companion package is not available, returns false (font not available
 * from bundle). CDN fallback loaders handle the online case.
 *
 * Substitute mappings are handled transparently: requesting "Calibri"
 * loads the Carlito WOFF2 and registers the font under "Calibri".
 */

import { loadFont } from './font-loader.js';

// ---------------------------------------------------------------------------
// Companion package detection
// ---------------------------------------------------------------------------

interface CompanionInfo {
  manifest: { families: Record<string, CompanionFamilyEntry> };
  basePath: string;
}

interface CompanionFamilyEntry {
  displayName: string;
  substituteFor?: string;
  woff2: Record<string, { file: string; size: number }>;
}

/** Cached companion detection promise — evaluated once. */
let companionPromise: Promise<CompanionInfo | null> | null = null;

/** Synchronous cache of the companion manifest (populated after first async detection). */
let cachedManifest: CompanionInfo['manifest'] | null = null;

async function getCompanion(): Promise<CompanionInfo | null> {
  if (!companionPromise) {
    companionPromise = (async () => {
      try {
        const mod = await import('@opendockit/fonts');
        const manifest = mod.getManifest();
        const basePath = mod.getBasePath();
        cachedManifest = manifest;
        return { manifest, basePath };
      } catch {
        return null;
      }
    })();
  }
  return companionPromise;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Track which families have been loaded. */
const loadedFamilies = new Set<string>();

/**
 * Check if a font family has bundled WOFF2 data available.
 *
 * Returns true only if the @opendockit/fonts companion package has been
 * detected and contains the requested family. Returns false if the companion
 * has not been detected yet (synchronous check — use loadBundledFont for
 * async detection).
 */
export function hasBundledFont(family: string): boolean {
  if (!cachedManifest) return false;
  return family.toLowerCase() in cachedManifest.families;
}

/**
 * Load a single bundled font family from the companion package.
 *
 * Dynamically detects the @opendockit/fonts companion package, fetches
 * raw WOFF2 files, and registers each variant via the FontFace API.
 *
 * The font is registered under the substituteFor name (for Office font
 * substitutes) or the displayName.
 *
 * @param family - Font family name (e.g., "Calibri", "Roboto").
 * @returns true if at least one variant was loaded.
 */
export async function loadBundledFont(family: string): Promise<boolean> {
  if (typeof document === 'undefined') return false;

  const key = family.toLowerCase();
  if (loadedFamilies.has(key)) return true;

  const companion = await getCompanion();
  if (!companion) return false;

  const entry = companion.manifest.families[key];
  if (!entry) return false;

  loadedFamilies.add(key);

  try {
    const registerName = entry.substituteFor || entry.displayName;

    const results = await Promise.all(
      Object.entries(entry.woff2).map(async ([variantKey, variant]) => {
        try {
          const url = new URL(variant.file, companion.basePath).href;
          const response = await fetch(url);
          if (!response.ok) return false;
          const buffer = await response.arrayBuffer();

          // Parse weight and style from variant key: "latin-400-normal"
          const parts = variantKey.split('-');
          const weight = parts[1] || '400';
          const style = parts[2] || 'normal';

          const descriptors: FontFaceDescriptors = {};
          if (weight !== '400') descriptors.weight = weight;
          if (style !== 'normal') descriptors.style = style;

          return loadFont(registerName, buffer, descriptors);
        } catch {
          return false;
        }
      }),
    );

    return results.some(Boolean);
  } catch {
    loadedFamilies.delete(key);
    return false;
  }
}

/**
 * Load bundled fonts for all applicable families.
 *
 * Filters input to only families available in the companion package,
 * skips already-loaded families, and loads all remaining in parallel.
 *
 * @param families - Font family names to attempt loading.
 * @returns Map of family name -> success boolean (only for available families).
 */
export async function loadBundledFonts(
  families: string[],
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  // Trigger companion detection early
  const companion = await getCompanion();

  const toLoad = families.filter((f) => {
    const key = f.toLowerCase();
    if (!companion || !(key in companion.manifest.families)) return false;
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
    }),
  );

  return results;
}
