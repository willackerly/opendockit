import { loadFont } from '@opendockit/core/font';
import type { FontManifest } from './types.js';

// The manifest is a JSON file at the package root
import manifest from '../manifest.json' with { type: 'json' };

export type { FontManifest, FontFamilyEntry, FontVariantEntry } from './types.js';

/** Get the companion package manifest. */
export function getManifest(): FontManifest {
  return manifest as FontManifest;
}

/**
 * Get the base path to font files in the companion package.
 * Uses import.meta.url to resolve relative to the installed package location.
 */
export function getBasePath(): string {
  return new URL('..', import.meta.url).href;
}

/**
 * Register font families for offline rendering.
 *
 * With no arguments, registers ALL families from manifest.
 * With a family list, registers only those families.
 *
 * Loads WOFF2 files and registers via the FontFace API.
 * No-op in Node.js (no FontFace API).
 */
export async function registerOfflineFonts(
  families?: string[],
): Promise<void> {
  if (typeof FontFace === 'undefined') return;

  const m = manifest as FontManifest;
  const basePath = getBasePath();

  const toRegister = families
    ? families
        .map((f) => f.toLowerCase())
        .filter((f) => f in m.families)
    : Object.keys(m.families);

  await Promise.all(
    toRegister.map(async (key) => {
      const entry = m.families[key];
      const registerName = entry.substituteFor || entry.displayName;

      // Load each WOFF2 variant
      await Promise.all(
        Object.entries(entry.woff2).map(async ([variantKey, variant]) => {
          try {
            const url = new URL(variant.file, basePath).href;
            const response = await fetch(url);
            if (!response.ok) return;
            const buffer = await response.arrayBuffer();

            // Parse weight and style from variant key: "latin-400-normal"
            const parts = variantKey.split('-');
            const weight = parts[1] || '400';
            const style = parts[2] || 'normal';

            const descriptors: FontFaceDescriptors = {};
            if (weight !== '400') descriptors.weight = weight;
            if (style !== 'normal') descriptors.style = style;

            await loadFont(registerName, buffer, descriptors);
          } catch {
            // Font variant failed to load — continue with others
          }
        }),
      );
    }),
  );
}
