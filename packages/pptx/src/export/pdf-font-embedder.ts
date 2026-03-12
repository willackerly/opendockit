/**
 * PDF Font Embedder — embeds fonts into a PDF document for text rendering.
 *
 * Takes font keys discovered by the font collector and embeds them into
 * the PDF document via the pdf-signer's font embedding infrastructure.
 *
 * For bundled fonts (42 families), loads TTF bytes and embeds them as
 * Type0/CIDFontType2 with Identity-H encoding. Falls back to PDF standard
 * fonts (Helvetica, Times-Roman, Courier) when no TTF is available.
 *
 * Architecture:
 *   FontKey[] -> for each:
 *     -> loadTTF(family, bold, italic)
 *     -> if TTF: parseTrueType() -> computeFontFlags() -> embedCustomFont()
 *     -> else: embedStandardFont() (Helvetica/Times/Courier fallback)
 *     -> create RegisteredPdfFont for PDFBackend
 *     -> wire font refs into page /Resources /Font dictionary
 *
 * @module pdf-font-embedder
 */

import type { RegisteredPdfFont } from '@opendockit/render';
import type { PDFDocument } from '@opendockit/pdf-signer';
import {
  parseTrueType,
  computeFontFlags,
  subsetTrueTypeFont,
} from '@opendockit/pdf-signer';
import type { TrueTypeFontInfo } from '@opendockit/pdf-signer';
import { loadTTF, subsetFont } from '@opendockit/core/font';
import type { FontKey } from './pdf-font-collector.js';

// ---------------------------------------------------------------------------
// Standard font mapping (fallback when no TTF bundle available)
// ---------------------------------------------------------------------------

const STANDARD_FONT_MAP: Record<string, string> = {
  // Sans-serif families -> Helvetica
  'arial': 'Helvetica',
  'helvetica': 'Helvetica',
  'calibri': 'Helvetica',
  'calibri light': 'Helvetica',
  'carlito': 'Helvetica',
  'liberation sans': 'Helvetica',
  'liberation sans narrow': 'Helvetica',
  'arimo': 'Helvetica',
  'sans-serif': 'Helvetica',
  'open sans': 'Helvetica',
  'open sans extrabold': 'Helvetica',
  'lato': 'Helvetica',
  'lato light': 'Helvetica',
  'noto sans': 'Helvetica',
  'noto sans symbols': 'Helvetica',
  'roboto': 'Helvetica',
  'montserrat': 'Helvetica',
  'poppins': 'Helvetica',
  'raleway': 'Helvetica',
  'barlow': 'Helvetica',
  'barlow light': 'Helvetica',
  'barlow medium': 'Helvetica',
  'ubuntu': 'Helvetica',
  'source sans pro': 'Helvetica',
  'selawik': 'Helvetica',
  'selawik light': 'Helvetica',
  'selawik semibold': 'Helvetica',
  'selawik semilight': 'Helvetica',
  'segoe ui': 'Helvetica',
  'segoe ui light': 'Helvetica',
  'segoe ui semibold': 'Helvetica',
  'segoe ui semilight': 'Helvetica',
  'arial narrow': 'Helvetica',
  'play': 'Helvetica',
  'oswald': 'Helvetica',
  'comfortaa': 'Helvetica',
  'comfortaa light': 'Helvetica',

  // Serif families -> Times-Roman
  'times new roman': 'Times-Roman',
  'times': 'Times-Roman',
  'georgia': 'Times-Roman',
  'cambria': 'Times-Roman',
  'caladea': 'Times-Roman',
  'tinos': 'Times-Roman',
  'liberation serif': 'Times-Roman',
  'gelasio': 'Times-Roman',
  'noto serif': 'Times-Roman',
  'playfair display': 'Times-Roman',
  'roboto slab': 'Times-Roman',
  'roboto slab light': 'Times-Roman',
  'roboto slab medium': 'Times-Roman',
  'roboto slab semibold': 'Times-Roman',
  'serif': 'Times-Roman',
  'palatino linotype': 'Times-Roman',
  'bookman old style': 'Times-Roman',
  'century schoolbook': 'Times-Roman',
  'tex gyre bonum': 'Times-Roman',
  'tex gyre pagella': 'Times-Roman',
  'tex gyre schola': 'Times-Roman',

  // Monospace families -> Courier
  'courier new': 'Courier',
  'courier': 'Courier',
  'courier prime': 'Courier',
  'liberation mono': 'Courier',
  'fira code': 'Courier',
  'roboto mono': 'Courier',
  'source code pro': 'Courier',
  'monospace': 'Courier',
};

/**
 * Get the PDF standard font base name for a given family/bold/italic combination.
 */
export function getStandardFontName(
  family: string,
  bold: boolean,
  italic: boolean
): string {
  const baseFont = STANDARD_FONT_MAP[family.toLowerCase()] ?? 'Helvetica';

  if (baseFont === 'Helvetica') {
    if (bold && italic) return 'Helvetica-BoldOblique';
    if (bold) return 'Helvetica-Bold';
    if (italic) return 'Helvetica-Oblique';
    return 'Helvetica';
  }

  if (baseFont === 'Times-Roman') {
    if (bold && italic) return 'Times-BoldItalic';
    if (bold) return 'Times-Bold';
    if (italic) return 'Times-Italic';
    return 'Times-Roman';
  }

  if (baseFont === 'Courier') {
    if (bold && italic) return 'Courier-BoldOblique';
    if (bold) return 'Courier-Bold';
    if (italic) return 'Courier-Oblique';
    return 'Courier';
  }

  return baseFont;
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

/** Standard font average widths (PDF units per 1000). */
const STANDARD_FONT_AVG_WIDTH: Record<string, number> = {
  'Helvetica': 530,
  'Helvetica-Bold': 560,
  'Helvetica-Oblique': 530,
  'Helvetica-BoldOblique': 560,
  'Times-Roman': 500,
  'Times-Bold': 520,
  'Times-Italic': 500,
  'Times-BoldItalic': 520,
  'Courier': 600,
  'Courier-Bold': 600,
  'Courier-Oblique': 600,
  'Courier-BoldOblique': 600,
};

/**
 * Encode text as hex using WinAnsiEncoding (1 byte per char, 2 hex chars).
 */
function encodeWinAnsiHex(text: string): string {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const byte = code < 256 ? code : 0x95;
    parts.push(byte.toString(16).padStart(2, '0').toUpperCase());
  }
  return parts.join('');
}

/**
 * Create a CID text encoder using TrueType cmap.
 *
 * Maps Unicode codepoints to glyph IDs via the font's cmap table,
 * then encodes each glyph ID as 2 bytes (4 hex chars) for Identity-H encoding.
 */
function createCIDEncoder(info: TrueTypeFontInfo): (text: string) => string {
  return (text: string): string => {
    const parts: string[] = [];
    for (let i = 0; i < text.length; i++) {
      const cp = text.codePointAt(i)!;
      const glyphId = info.cmap.get(cp) ?? 0;
      parts.push(glyphId.toString(16).padStart(4, '0').toUpperCase());
      if (cp > 0xffff) i++; // skip low surrogate
    }
    return parts.join('');
  };
}

/**
 * Create a width measurer using TrueType advance widths.
 *
 * Uses per-glyph advance widths from the parsed font for accurate
 * text measurement instead of average-width heuristics.
 */
function createCIDMeasurer(
  info: TrueTypeFontInfo
): (text: string, sizePt: number) => number {
  return (text: string, sizePt: number): number => {
    let totalWidth = 0;
    for (let i = 0; i < text.length; i++) {
      const cp = text.codePointAt(i)!;
      const glyphId = info.cmap.get(cp) ?? 0;
      const advance = info.advanceWidths[glyphId] ?? 0;
      totalWidth += advance;
      if (cp > 0xffff) i++;
    }
    // Convert from font units to points
    return (totalWidth / info.unitsPerEm) * sizePt;
  };
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Result of embedding a single font into a PDF document. */
export interface EmbeddedFontResult {
  /** The font key this was embedded for. */
  fontKey: FontKey;
  /** The registered font for PDFBackend. */
  registeredFont: RegisteredPdfFont;
  /** PDF resource name (e.g. "F1"). */
  resourceName: string;
  /** Whether this is a standard font (no embedding needed). */
  isStandard: boolean;
  /** Internal: the font object reference (opaque, for wiring to pages). */
  _fontRef: unknown;
}

// ---------------------------------------------------------------------------
// Font embedding
// ---------------------------------------------------------------------------

/**
 * Embed all collected fonts into a PDF document.
 *
 * For each FontKey, attempts to load TTF bytes from the bundled font
 * modules. If available, parses the TrueType data, subsets to only
 * used glyphs, and embeds as a Type0/CIDFontType2 composite font
 * with Identity-H encoding.
 * Falls back to standard PDF fonts if no TTF is available.
 *
 * @param fontKeys - Unique font variants to embed
 * @param pdfDoc - The PDFDocument to embed fonts into
 * @param usedCodepoints - Optional codepoint sets per font key (for subsetting)
 * @returns Array of EmbeddedFontResult (one per font key)
 */
export async function embedFontsForPdf(
  fontKeys: FontKey[],
  pdfDoc: PDFDocument,
  usedCodepoints?: Map<string, Set<number>>
): Promise<EmbeddedFontResult[]> {
  const ctx = pdfDoc._nativeCtx;
  const results: EmbeddedFontResult[] = [];

  let fontCounter = 1;

  for (const fontKey of fontKeys) {
    const resourceName = `F${fontCounter++}`;

    // Try to load TTF bytes for custom font embedding
    const ttfBytes = await loadTTF(fontKey.family, fontKey.bold, fontKey.italic);

    if (ttfBytes) {
      // Custom font embedding via Type0/CIDFontType2
      try {
        // Parse full font first to get cmap for codepoint→glyphId mapping
        const fullInfo = parseTrueType(ttfBytes);

        // Determine which bytes to embed: subset if we have codepoint data
        let embedBytes = ttfBytes;
        const cpKey = `${fontKey.family.toLowerCase()}|${fontKey.bold}|${fontKey.italic}`;
        const codepoints = usedCodepoints?.get(cpKey);

        if (codepoints && codepoints.size > 0) {
          // Build the character string for hb-subset
          const chars = String.fromCodePoint(...codepoints);

          // Try hb-subset (WASM) first — produces better subsets
          let hbSubsetted = false;
          try {
            const subsetted = await subsetFont(ttfBytes, chars, {
              targetFormat: 'truetype',
            });
            // Only use if it actually reduced the size
            if (subsetted.length < ttfBytes.length) {
              embedBytes = subsetted;
              hbSubsetted = true;
            }
          } catch {
            // hb-subset not available or failed
          }

          // Fallback: basic TS subsetter from pdf-signer
          if (!hbSubsetted) {
            const usedGlyphIds = new Set<number>();
            for (const cp of codepoints) {
              const gid = fullInfo.cmap.get(cp);
              if (gid !== undefined) usedGlyphIds.add(gid);
            }

            if (usedGlyphIds.size > 0) {
              try {
                const subsetResult = subsetTrueTypeFont(ttfBytes, usedGlyphIds);
                embedBytes = subsetResult.bytes;
              } catch {
                // Fall back to full font if subsetting fails
              }
            }
          }
        }

        // Parse the (possibly subsetted) bytes for embedding
        const info = parseTrueType(embedBytes);
        info.flags = computeFontFlags(
          info as TrueTypeFontInfo & { _isItalic?: boolean; _isSerif?: boolean }
        );
        const fontRef = ctx.embedCustomFont(info);

        // Always use full font's cmap for encoding (maps Unicode→original glyph IDs)
        // but if subsetted, the glyph IDs are remapped. For Identity-H encoding,
        // we need to use the subsetted font's cmap.
        const registeredFont: RegisteredPdfFont = {
          resourceName,
          encodeText: createCIDEncoder(info),
          measureWidth: createCIDMeasurer(info),
        };

        results.push({
          fontKey,
          registeredFont,
          resourceName,
          isStandard: false,
          _fontRef: fontRef,
        });
        continue;
      } catch {
        // Fall through to standard font if parsing fails
      }
    }

    // Fallback: standard PDF font
    const standardName = getStandardFontName(
      fontKey.family,
      fontKey.bold,
      fontKey.italic
    );

    const fontRef = ctx.embedStandardFont(standardName);
    const avgWidth = STANDARD_FONT_AVG_WIDTH[standardName] ?? 530;

    const registeredFont: RegisteredPdfFont = {
      resourceName,
      encodeText: encodeWinAnsiHex,
      measureWidth: (text: string, sizePt: number): number => {
        return text.length * avgWidth * sizePt / 1000;
      },
    };

    results.push({
      fontKey,
      registeredFont,
      resourceName,
      isStandard: true,
      _fontRef: fontRef,
    });
  }

  return results;
}

/**
 * Wire embedded font resources into a page's /Resources /Font dictionary.
 */
export function wireFontsToPage(
  pageDict: unknown,
  embeddedFonts: EmbeddedFontResult[],
  _pdfDoc: PDFDocument
): void {
  if (embeddedFonts.length === 0) return;

  const pd = pageDict as { getItem(k: string): any; setItem(k: string, v: any): void };
  const resources = pd.getItem('Resources');
  if (!resources || typeof resources.getItem !== 'function') return;

  let fontDict = resources.getItem('Font');
  if (!fontDict || typeof fontDict.setItem !== 'function') {
    const FontDictCtor = resources.constructor;
    fontDict = new FontDictCtor();
    if (typeof fontDict.setDirect === 'function') {
      fontDict.setDirect(true);
    }
    resources.setItem('Font', fontDict);
  }

  for (const ef of embeddedFonts) {
    fontDict.setItem(ef.resourceName, ef._fontRef);
  }
}
