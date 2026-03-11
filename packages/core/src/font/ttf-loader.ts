/**
 * TTF font loader — loads raw TrueType font bytes for PDF embedding.
 *
 * Loads TTF data from the @opendockit/fonts companion package when installed.
 * If the companion package is not available, returns null.
 * Decoded bytes are cached for repeated access.
 *
 * @module ttf-loader
 */

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
  ttf: Record<string, { file: string; size: number }>;
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
// Cache
// ---------------------------------------------------------------------------

/** family|bold|italic -> decoded Uint8Array */
const cache = new Map<string, Uint8Array>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if a TTF bundle is available for a font family.
 *
 * Returns true only if the @opendockit/fonts companion package has been
 * detected and contains TTF data for the requested family.
 */
export function hasTTFBundle(family: string): boolean {
  if (!cachedManifest) return false;
  const entry = cachedManifest.families[family.toLowerCase()];
  if (!entry) return false;
  return Object.keys(entry.ttf).length > 0;
}

/**
 * Resolve a variant key from bold/italic flags.
 */
function resolveVariant(
  bold: boolean,
  italic: boolean,
  availableVariants: string[],
): string | null {
  const target =
    bold && italic
      ? 'boldItalic'
      : bold
        ? 'bold'
        : italic
          ? 'italic'
          : 'regular';
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
 * Fetches TTF from the @opendockit/fonts companion package, and caches
 * the result. Returns `null` if the companion is not installed or if
 * no TTF bundle is available for the font.
 *
 * @param family - Font family name (e.g., "Carlito", "Calibri", "Roboto")
 * @param bold - Whether to load the bold variant
 * @param italic - Whether to load the italic variant
 * @returns Raw TTF bytes as Uint8Array, or null if unavailable
 */
export async function loadTTF(
  family: string,
  bold: boolean,
  italic: boolean,
): Promise<Uint8Array | null> {
  const key = `${family.toLowerCase()}|${bold}|${italic}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const companion = await getCompanion();
  if (!companion) return null;

  const entry = companion.manifest.families[family.toLowerCase()];
  if (!entry) return null;

  const availableVariants = Object.keys(entry.ttf);
  const variant = resolveVariant(bold, italic, availableVariants);
  if (!variant) return null;

  const ttfEntry = entry.ttf[variant];
  if (!ttfEntry) return null;

  try {
    const url = new URL(ttfEntry.file, companion.basePath).href;
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
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
