/**
 * PDF Font Embedder — embeds fonts into a PDF document for text rendering.
 *
 * Takes font keys discovered by the font collector and embeds them into
 * the PDF document via the pdf-signer's font embedding infrastructure.
 * Currently uses PDF standard fonts (Helvetica, Times-Roman, Courier) as
 * fallback since the bundled fonts are WOFF2 format and require decoding
 * to raw TTF before they can be embedded.
 *
 * Architecture:
 *   FontKey[] -> resolve to standard font mapping
 *     -> embed via NativeDocumentContext.embedStandardFont()
 *     -> create RegisteredPdfFont for PDFBackend
 *     -> wire font refs into page /Resources /Font dictionary
 *
 * @module pdf-font-embedder
 */

import type { RegisteredPdfFont } from '@opendockit/render';
import type { PDFDocument } from '@opendockit/pdf-signer';
import type { FontKey } from './pdf-font-collector.js';

// ---------------------------------------------------------------------------
// Standard font mapping
// ---------------------------------------------------------------------------

/**
 * Map of CSS font family names (lowercase) to PDF standard font base names.
 *
 * PDF defines 14 standard fonts that do not require embedding:
 * - Helvetica (regular, bold, oblique, bold-oblique)
 * - Times-Roman (regular, bold, italic, bold-italic)
 * - Courier (regular, bold, oblique, bold-oblique)
 * - Symbol, ZapfDingbats
 */
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
// WinAnsi encoding for standard fonts
// ---------------------------------------------------------------------------

/**
 * Standard font average character widths (in PDF units per 1000).
 * Courier is fixed-width at 600.
 */
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
 * Encode a text string as hex using WinAnsiEncoding for standard fonts.
 * Characters outside the WinAnsi range are replaced with bullet (0x95).
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
 * For each FontKey, maps to the nearest PDF standard font and embeds it.
 * Returns RegisteredPdfFont objects for PDFBackend.registerFont() and
 * stored font references for wiring into page /Resources.
 *
 * Deduplicates: if multiple FontKeys map to the same standard font name,
 * they share the same PDF font object but get unique resource names.
 *
 * @param fontKeys - Unique font variants to embed
 * @param pdfDoc - The PDFDocument to embed fonts into
 * @returns Array of EmbeddedFontResult (one per font key)
 */
export function embedFontsForPdf(
  fontKeys: FontKey[],
  pdfDoc: PDFDocument
): EmbeddedFontResult[] {
  const ctx = pdfDoc._nativeCtx;
  const results: EmbeddedFontResult[] = [];

  // Cache: standard font name -> COSObjectReference (opaque)
  const standardFontRefCache = new Map<string, unknown>();

  let fontCounter = 1;

  for (const fontKey of fontKeys) {
    const resourceName = `F${fontCounter++}`;

    // TRACKED-TASK: WOFF2->TTF decoding for custom font embedding — see TODO.md "Code Debt"
    const standardName = getStandardFontName(
      fontKey.family,
      fontKey.bold,
      fontKey.italic
    );

    let fontRef = standardFontRefCache.get(standardName);
    if (!fontRef) {
      fontRef = ctx.embedStandardFont(standardName);
      standardFontRefCache.set(standardName, fontRef);
    }

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
 *
 * Directly manipulates the COS dictionary objects via duck-typing to add
 * font references to the page's /Resources /Font dictionary. This avoids
 * depending on specific NativeDocumentContext methods that may not be in
 * the compiled dist/ yet.
 *
 * The COS objects (COSDictionary) support:
 * - getItem(key: string): COSBase | undefined
 * - setItem(key: string, value: COSBase): void
 * - setDirect(direct: boolean): void
 *
 * @param pageDict - The page's COSDictionary (from pdfDoc.addPage()._nativePageDict)
 * @param embeddedFonts - Pre-embedded font results from embedFontsForPdf()
 */
export function wireFontsToPage(
  pageDict: unknown,
  embeddedFonts: EmbeddedFontResult[],
  _pdfDoc: PDFDocument
): void {
  if (embeddedFonts.length === 0) return;

  // Access the /Resources dictionary (addPage() always creates one)
  const pd = pageDict as { getItem(k: string): any; setItem(k: string, v: any): void };
  const resources = pd.getItem('Resources');
  if (!resources || typeof resources.getItem !== 'function') return;

  // Get or create the /Font sub-dictionary
  let fontDict = resources.getItem('Font');
  if (!fontDict || typeof fontDict.setItem !== 'function') {
    // Need to create a new COSDictionary for /Font.
    // We can't import COSDictionary directly, but we can create one
    // by cloning the pattern from an existing empty dict.
    // The resources dict itself is a COSDictionary -- let's access
    // its constructor to create a new instance.
    const FontDictCtor = resources.constructor;
    fontDict = new FontDictCtor();
    if (typeof fontDict.setDirect === 'function') {
      fontDict.setDirect(true);
    }
    resources.setItem('Font', fontDict);
  }

  // Add each font reference
  for (const ef of embeddedFonts) {
    fontDict.setItem(ef.resourceName, ef._fontRef);
  }
}
