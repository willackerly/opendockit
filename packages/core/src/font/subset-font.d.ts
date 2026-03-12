/**
 * Type declarations for the optional `subset-font` npm package.
 *
 * This module wraps HarfBuzz's hb-subset via WASM to subset font binaries
 * down to only the glyphs for specified characters. It is dynamically
 * imported at runtime and may not be installed.
 */
declare module 'subset-font' {
  interface SubsetFontOptions {
    targetFormat?: 'truetype' | 'woff2' | 'sfnt';
  }

  export default function subsetFont(
    font: Buffer | Uint8Array,
    text: string,
    options?: SubsetFontOptions,
  ): Promise<Buffer>;
}
