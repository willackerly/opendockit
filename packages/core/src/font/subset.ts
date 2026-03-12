/**
 * Font subsetting via HarfBuzz hb-subset (WASM).
 *
 * Wraps the `subset-font` npm package to reduce font binaries to only
 * the glyphs used in a document. This typically achieves 80-95% size
 * reduction for fonts embedded in PDFs.
 *
 * Falls back gracefully if subset-font is not available.
 *
 * @module subset
 */

/**
 * Subset a font binary to only include the specified characters.
 *
 * @param fontBuffer - The original font file (TTF/OTF/WOFF2)
 * @param characters - String containing all characters that should be preserved
 * @param options - Optional: target format ('truetype' | 'woff2')
 * @returns Subsetted font buffer, or original buffer if subsetting fails
 */
export async function subsetFont(
  fontBuffer: ArrayBuffer | Uint8Array,
  characters: string,
  options?: { targetFormat?: 'truetype' | 'woff2' },
): Promise<Uint8Array> {
  try {
    // Dynamic import so it's truly optional
    const mod = await import('subset-font');
    const subsetFontImpl = mod.default;
    const input =
      fontBuffer instanceof Uint8Array ? fontBuffer : new Uint8Array(fontBuffer);
    const result = await subsetFontImpl(input, characters, {
      targetFormat: options?.targetFormat ?? 'truetype',
    });
    return new Uint8Array(result);
  } catch {
    // subset-font not available or subsetting failed -- return original
    return fontBuffer instanceof Uint8Array
      ? fontBuffer
      : new Uint8Array(fontBuffer);
  }
}

/**
 * Check if hb-subset is available.
 */
export async function isSubsetAvailable(): Promise<boolean> {
  try {
    await import('subset-font');
    return true;
  } catch {
    return false;
  }
}
