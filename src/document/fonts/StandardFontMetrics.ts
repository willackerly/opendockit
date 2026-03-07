/**
 * Standard PDF font metrics — text measurement without pdf-lib.
 *
 * Provides widthOfTextAtSize, heightAtSize, sizeAtHeight matching
 * pdf-lib's StandardFontEmbedder behavior exactly.
 */

import type { FontEncoding } from './encoding.js';

// ---------------------------------------------------------------------------
// Data types (used by generated font data files)
// ---------------------------------------------------------------------------

export interface FontMetricsData {
  name: string;
  ascender: number | undefined;
  descender: number | undefined;
  fontBBox: [number, number, number, number];
  widths: Record<string, number>;
  kerns: Record<string, Record<string, number>>;
}

// ---------------------------------------------------------------------------
// Font registry — lazy-loaded, cached
// ---------------------------------------------------------------------------

type FontLoader = () => FontMetricsData;
const registry = new Map<string, FontLoader>();
const cache = new Map<string, StandardFontMetrics>();
let fontsRegistered = false;

/**
 * Register a font data loader. Called by registerAllStandardFonts().
 * Lazy: the actual data module is only imported when first used.
 */
export function registerFont(name: string, loader: FontLoader): void {
  registry.set(name, loader);
}

/**
 * Ensure all 14 standard fonts are registered. Called lazily on first access.
 * This keeps the 1.1 MB of font metric data out of bundles that never use
 * StandardFontMetrics (e.g. sign-only or extraction-only imports).
 */
function ensureFontsRegistered(): void {
  if (fontsRegistered) return;
  fontsRegistered = true;
  // Import is static (resolved at bundle time) but the function call is deferred.
  // Tree-shaking works because this entire module (StandardFontMetrics) can be
  // dropped if never referenced — and with it, the register.ts chain.
  registerAllStandardFonts();
}

// Static import — bundled only when StandardFontMetrics module itself is included.
// Previously this was a side-effect import in fonts/index.ts and PDFFont.ts,
// which forced all consumers to bundle 1.1 MB of font data.
import { registerAllStandardFonts } from './register.js';

// ---------------------------------------------------------------------------
// StandardFontMetrics class
// ---------------------------------------------------------------------------

export class StandardFontMetrics {
  readonly name: string;
  private readonly data: FontMetricsData;

  private constructor(data: FontMetricsData) {
    this.name = data.name;
    this.data = data;
  }

  /**
   * Load metrics for a standard font. Synchronous, cached.
   * @throws if the font name is not a known standard font.
   */
  static load(fontName: string): StandardFontMetrics {
    ensureFontsRegistered();
    const cached = cache.get(fontName);
    if (cached) return cached;

    const loader = registry.get(fontName);
    if (!loader) {
      throw new Error(`Unknown standard font: "${fontName}". Known fonts: ${[...registry.keys()].join(', ')}`);
    }

    const data = loader();
    const metrics = new StandardFontMetrics(data);
    cache.set(fontName, metrics);
    return metrics;
  }

  /**
   * Check whether a font name is a registered standard font.
   */
  static isStandardFont(fontName: string): boolean {
    ensureFontsRegistered();
    return registry.has(fontName);
  }

  /**
   * Get the width of a glyph by name. Returns 250 if not found
   * (matches pdf-lib's default fallback).
   */
  widthOfGlyph(glyphName: string): number {
    return this.data.widths[glyphName] ?? 250;
  }

  /**
   * Get the X-axis kerning amount for a glyph pair.
   * Returns 0 if no kern pair exists.
   */
  getKerning(leftGlyph: string, rightGlyph: string): number {
    return this.data.kerns[leftGlyph]?.[rightGlyph] ?? 0;
  }

  /**
   * Measure the width of text at a given font size.
   * Matches pdf-lib's `StandardFontEmbedder.widthOfTextAtSize()` exactly:
   *   for each char: encode → lookup glyph width → add kern pair → sum → scale by size/1000
   */
  widthOfTextAtSize(
    text: string,
    size: number,
    encoding: FontEncoding,
  ): number {
    const codePoints = Array.from(text);
    let totalWidth = 0;

    for (let i = 0; i < codePoints.length; i++) {
      const codePoint = codePoints[i].codePointAt(0)!;
      const glyph = encoding.encode(codePoint);
      const nextCodePoint = codePoints[i + 1]?.codePointAt(0);
      const nextGlyphName = nextCodePoint != null
        ? encoding.encode(nextCodePoint).name
        : undefined;

      const width = this.widthOfGlyph(glyph.name);
      const kern = nextGlyphName
        ? this.getKerning(glyph.name, nextGlyphName)
        : 0;

      totalWidth += width + kern;
    }

    return totalWidth * (size / 1000);
  }

  /**
   * Get the height of the font at a given size.
   * Matches pdf-lib's `StandardFontEmbedder.heightOfFontAtSize()`.
   */
  heightAtSize(size: number, options?: { descender?: boolean }): number {
    const descender = options?.descender ?? true;

    const yTop = this.data.ascender || this.data.fontBBox[3];
    const yBottom = this.data.descender || this.data.fontBBox[1];

    let height = yTop - yBottom;
    if (!descender) height += this.data.descender || 0;

    return (height / 1000) * size;
  }

  /**
   * Get the font size that would produce the given height.
   * Matches pdf-lib's `StandardFontEmbedder.sizeOfFontAtHeight()`.
   */
  sizeAtHeight(height: number): number {
    const yTop = this.data.ascender || this.data.fontBBox[3];
    const yBottom = this.data.descender || this.data.fontBBox[1];
    return (1000 * height) / (yTop - yBottom);
  }

  /** The ascender value in font units (1000 = 1em). Falls back to fontBBox top. */
  get ascender(): number {
    return this.data.ascender ?? this.data.fontBBox[3];
  }

  /** The descender value in font units (negative). Falls back to fontBBox bottom. */
  get descender(): number {
    return this.data.descender ?? this.data.fontBBox[1];
  }

  /** The font bounding box. */
  get fontBBox(): [number, number, number, number] {
    return this.data.fontBBox;
  }
}
