/**
 * PDFFont — native-only font wrapper.
 *
 * Supports standard fonts (Type1) and TrueType custom fonts (Type0/CIDFontType2).
 * All measurement and encoding is handled natively without pdf-lib.
 */

import { StandardFontMetrics } from './fonts/StandardFontMetrics.js';
import type { FontEncoding } from './fonts/encoding.js';
import { encodingForFont, encodeTextToHex } from './fonts/encoding.js';
import type { COSObjectReference } from '../pdfbox/cos/COSTypes.js';
import type { NativeDocumentContext } from './NativeDocumentContext.js';
import { parseTrueType } from './fonts/TrueTypeParser.js';
import type { TrueTypeFontInfo } from './fonts/TrueTypeParser.js';
import { computeFontFlags } from './fonts/FontFlags.js';

export class PDFFont {
  /** @internal — COS object reference */
  readonly _nativeRef?: COSObjectReference;
  /** @internal — font name */
  private readonly _nativeName?: string;

  /** @internal */
  private _nativeMetrics?: StandardFontMetrics;
  /** @internal */
  private _nativeEncoding?: FontEncoding;

  /** @internal — TrueType font info (custom font mode) */
  private _ttfInfo?: TrueTypeFontInfo;
  /** @internal — whether this is a custom embedded font */
  private _isCustomFont = false;

  /** @internal */
  constructor(
    nativeRef: COSObjectReference,
    nativeName: string,
    metrics?: StandardFontMetrics,
    encoding?: FontEncoding,
  ) {
    this._nativeRef = nativeRef;
    this._nativeName = nativeName;
    this._nativeMetrics = metrics;
    this._nativeEncoding = encoding;
  }

  /** @internal — create a native standard font */
  static _createNativeStandard(
    fontName: string,
    ctx: NativeDocumentContext,
  ): PDFFont {
    const metrics = StandardFontMetrics.load(fontName);
    const encoding = encodingForFont(fontName);
    const ref = ctx.embedStandardFont(fontName);
    return new PDFFont(ref, fontName, metrics, encoding);
  }

  /**
   * @internal — create a native custom font from TrueType bytes.
   * Parses the TTF, embeds as Type0/CIDFontType2, returns PDFFont with custom metrics.
   */
  static _createNativeCustom(
    bytes: Uint8Array,
    ctx: NativeDocumentContext,
  ): PDFFont {
    const info = parseTrueType(bytes);

    // Compute and set font flags
    info.flags = computeFontFlags(
      info as TrueTypeFontInfo & { _isItalic?: boolean; _isSerif?: boolean },
    );

    const ref = ctx.embedCustomFont(info);
    const font = new PDFFont(ref, info.postScriptName);
    font._ttfInfo = info;
    font._isCustomFont = true;
    return font;
  }

  get ref(): COSObjectReference | undefined {
    return this._nativeRef;
  }

  get name(): string {
    return this._nativeName!;
  }

  encodeText(_text: string): never {
    throw new Error(
      'PDFFont.encodeText() is not available. Use encodeTextToHex() instead.',
    );
  }

  /**
   * Encode text to a hex string for use in content stream operators.
   * Standard fonts: 1-byte encoding (2 hex chars per character).
   * Custom fonts: 2-byte glyph IDs (4 hex chars per character) via cmap.
   * Returns raw hex characters without angle brackets.
   */
  encodeTextToHex(text: string): string {
    if (this._isCustomFont && this._ttfInfo) {
      return encodeCustomTextToHex(text, this._ttfInfo.cmap);
    }
    if (this._nativeEncoding) {
      return encodeTextToHex(text, this._nativeEncoding);
    }
    throw new Error('No encoding available for this font.');
  }

  widthOfTextAtSize(text: string, size: number): number {
    if (this._isCustomFont && this._ttfInfo) {
      return customWidthOfTextAtSize(text, size, this._ttfInfo);
    }
    if (this._nativeMetrics && this._nativeEncoding) {
      return this._nativeMetrics.widthOfTextAtSize(text, size, this._nativeEncoding);
    }
    throw new Error('No metrics available for this font.');
  }

  heightAtSize(size: number, options?: { descender?: boolean }): number {
    if (this._isCustomFont && this._ttfInfo) {
      return customHeightAtSize(size, this._ttfInfo, options);
    }
    if (this._nativeMetrics) {
      return this._nativeMetrics.heightAtSize(size, options);
    }
    throw new Error('No metrics available for this font.');
  }

  sizeAtHeight(height: number): number {
    if (this._isCustomFont && this._ttfInfo) {
      return customSizeAtHeight(height, this._ttfInfo);
    }
    if (this._nativeMetrics) {
      return this._nativeMetrics.sizeAtHeight(height);
    }
    throw new Error('No metrics available for this font.');
  }

  getCharacterSet(): number[] {
    if (this._isCustomFont && this._ttfInfo) {
      return Array.from(this._ttfInfo.cmap.keys()).sort((a, b) => a - b);
    }
    throw new Error(
      'PDFFont.getCharacterSet() is not available for standard fonts.',
    );
  }

  async embed(): Promise<void> {
    // Native fonts don't need explicit embedding
  }
}

// ---------------------------------------------------------------------------
// Custom font helpers
// ---------------------------------------------------------------------------

/**
 * Encode text to hex using TrueType cmap (2-byte glyph IDs).
 * Characters not in the font use glyph 0 (.notdef).
 */
function encodeCustomTextToHex(
  text: string,
  cmap: Map<number, number>,
): string {
  const codePoints = Array.from(text);
  const hexCodes: string[] = new Array(codePoints.length);
  for (let i = 0; i < codePoints.length; i++) {
    const cp = codePoints[i].codePointAt(0)!;
    const glyphId = cmap.get(cp) ?? 0; // .notdef for missing
    hexCodes[i] = glyphId.toString(16).toUpperCase().padStart(4, '0');
  }
  return hexCodes.join('');
}

/**
 * Measure text width at a given size using TrueType metrics.
 */
function customWidthOfTextAtSize(
  text: string,
  size: number,
  info: TrueTypeFontInfo,
): number {
  const codePoints = Array.from(text);
  const scale = 1000 / info.unitsPerEm;
  let totalWidth = 0;

  for (let i = 0; i < codePoints.length; i++) {
    const cp = codePoints[i].codePointAt(0)!;
    const glyphId = info.cmap.get(cp) ?? 0;
    const advance = glyphId < info.advanceWidths.length
      ? info.advanceWidths[glyphId]
      : 0;
    totalWidth += advance * scale;
  }

  return totalWidth * (size / 1000);
}

/**
 * Get the height of the font at a given size.
 */
function customHeightAtSize(
  size: number,
  info: TrueTypeFontInfo,
  options?: { descender?: boolean },
): number {
  const descender = options?.descender ?? true;
  const scale = 1000 / info.unitsPerEm;
  const yTop = info.ascender * scale;
  const yBottom = info.descender * scale;

  let height = yTop - yBottom;
  if (!descender) height += info.descender * scale;

  return (height / 1000) * size;
}

/**
 * Get the font size that would produce the given height.
 */
function customSizeAtHeight(
  height: number,
  info: TrueTypeFontInfo,
): number {
  const scale = 1000 / info.unitsPerEm;
  const yTop = info.ascender * scale;
  const yBottom = info.descender * scale;
  return (1000 * height) / (yTop - yBottom);
}
