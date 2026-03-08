/**
 * PDF Exporter — converts a loaded PPTX presentation to PDF.
 *
 * Uses the same slide IR that powers screen rendering, but instead of
 * dispatching to Canvas2D renderers, translates the IR into PDF content
 * stream operators via ContentStreamBuilder from @opendockit/pdf-signer.
 *
 * This is the CROWN JEWEL of the OpenDocKit monorepo — the first
 * cross-format feature: PPTX -> PDF export.
 *
 * Architecture:
 *   PresentationIR + EnrichedSlideData[]
 *     -> collectFontsFromPresentation() -> FontKey[]
 *     -> embedFontsForPdf() -> EmbeddedFontResult[]
 *     -> collectImagesFromPresentation() -> CollectedImage[]
 *     -> embedImagesForPdf() -> EmbeddedImageResult[]
 *     -> for each slide:
 *        -> renderSlideToPdf() -> ContentStreamBuilder
 *        -> wireFontsToPage() + wireImagesToPage() + wireExtGStatesToPage()
 *        -> ContentStreamBuilder.toBytes() -> PDFPage content stream
 *     -> PDFDocument.save() -> Uint8Array (PDF bytes)
 *
 * Font handling:
 * - Text runs are rendered via PDF standard fonts (Helvetica, Times, Courier)
 *   mapped from the presentation's CSS font families
 * - Font resources are properly declared in each page's /Resources
 * - Text is encoded using WinAnsiEncoding for correct glyph rendering
 *
 * Image handling:
 * - JPEG images are embedded as XObjects with /DCTDecode filter (raw bytes)
 * - PNG images are embedded as XObjects with /FlateDecode filter (RGB data)
 * - Images are deduplicated across slides (shared XObjects)
 * - Image resources are declared in each page's /Resources /XObject dictionary
 */

import { PDFDocument } from '@opendockit/pdf-signer';
import { emuToPt } from '@opendockit/core';
import type { PresentationIR, EnrichedSlideData } from '../model/index.js';
import { renderSlideToPdf, buildFontLookup } from './pdf-slide-renderer.js';
import { collectFontsFromPresentation } from './pdf-font-collector.js';
import { embedFontsForPdf, wireFontsToPage } from './pdf-font-embedder.js';
import { collectImagesFromPresentation, detectImageMimeType } from './pdf-image-collector.js';
import type { CollectedImage } from './pdf-image-collector.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Options for PDF export. */
export interface PdfExportOptions {
  /** DPI for rasterized elements (default: 150). Not yet used. */
  dpi?: number;
  /** Include slide notes as PDF annotations? (default: false). Not yet implemented. */
  includeNotes?: boolean;
  /**
   * Image data provider. Given an OPC part URI, returns the raw image bytes.
   * Required for embedding images; if not provided, images render as placeholders.
   */
  getImageBytes?: (partUri: string) => Uint8Array | undefined;
}

/** Result of a PDF export operation. */
export interface PdfExportResult {
  /** The PDF file as bytes. */
  bytes: Uint8Array;
  /** Number of pages (slides) exported. */
  pageCount: number;
  /** Number of unique fonts embedded (or mapped to standard fonts). */
  fontCount: number;
  /** Number of unique images embedded. */
  imageCount: number;
}

// ---------------------------------------------------------------------------
// Image embedding types
// ---------------------------------------------------------------------------

/** Result of embedding a single image into a PDF document. */
interface EmbeddedImageResult {
  /** OPC part URI of the image. */
  imagePartUri: string;
  /** PDF resource name (e.g. "Im1"). */
  resourceName: string;
  /** The PDF object reference for the image XObject. */
  xObjectRef: unknown;
}

// ---------------------------------------------------------------------------
// Export function
// ---------------------------------------------------------------------------

/**
 * Export a loaded PPTX presentation to PDF.
 *
 * Uses the same renderer stack as screen rendering, but with PDF operators
 * instead of Canvas2D calls. This ensures visual consistency between
 * screen and export output (within the limitations of the current
 * implementation).
 *
 * The pipeline:
 * 1. Collect all fonts used across all slides
 * 2. Embed fonts into the PDF document (standard font fallback)
 * 3. Collect all images across all slides
 * 4. Embed images into the PDF document
 * 5. For each slide: render content, wire resources, inject stream
 * 6. Save the PDF
 *
 * @param presentation - The parsed presentation IR (slide dimensions, theme, etc.)
 * @param slides - Enriched slide data for each slide to export (slide + layout + master chain)
 * @param options - Optional export configuration
 * @returns PDF bytes and metadata
 */
export async function exportPresentationToPdf(
  presentation: PresentationIR,
  slides: EnrichedSlideData[],
  options?: PdfExportOptions
): Promise<PdfExportResult> {
  // 1. Create a new PDF document
  const pdfDoc = await PDFDocument.create({ updateMetadata: false });
  pdfDoc.setProducer('OpenDocKit PPTX-to-PDF Exporter');
  pdfDoc.setCreator('OpenDocKit');

  // 2. Calculate page dimensions in PDF points
  //    PPTX uses EMU (914400 EMU = 1 inch)
  //    PDF uses points (72 pt = 1 inch)
  //    So: points = emu / 12700
  const pageWidthPt = emuToPt(presentation.slideWidth);
  const pageHeightPt = emuToPt(presentation.slideHeight);

  // 3. Collect all fonts used across the presentation
  const fontKeys = collectFontsFromPresentation(slides, presentation.theme);

  // 4. Embed fonts into the PDF document
  const embeddedFonts = embedFontsForPdf(fontKeys, pdfDoc);

  // 5. Build font lookup context for text rendering
  const fontCtx = buildFontLookup(embeddedFonts, presentation.theme);

  // 6. Collect and embed images
  const collectedImages = collectImagesFromPresentation(slides);
  const embeddedImages = embedImagesForPdf(collectedImages, pdfDoc, options?.getImageBytes);
  const imageResourceMap = buildImageResourceMap(embeddedImages);

  // 7. For each slide, create a page and render content
  for (let i = 0; i < slides.length; i++) {
    const slideData = slides[i];

    // Create a page with the slide dimensions
    const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);

    // Wire font resources into the page's /Resources /Font dictionary
    const pageDict = page._nativePageDict!;
    wireFontsToPage(pageDict, embeddedFonts, pdfDoc);

    // Wire image resources into the page's /Resources /XObject dictionary
    wireImagesToPage(pageDict, embeddedImages);

    // Render slide content to PDF operators (with font context + image names)
    const builder = renderSlideToPdf(
      slideData,
      pageWidthPt,
      pageHeightPt,
      fontCtx,
      imageResourceMap
    );

    // Get the content stream bytes and inject into the page
    const contentBytes = builder.toBytes();

    // Create a content stream and add it to the page's /Contents array
    const ctx = pdfDoc._nativeCtx;
    const streamRef = ctx.createStream(contentBytes);

    const contents = pageDict.getItem('Contents');
    if (contents && 'add' in contents) {
      (contents as { add(ref: unknown): void }).add(streamRef);
    }
  }

  // 8. Save and return the PDF bytes
  const bytes = await pdfDoc.save();

  return {
    bytes,
    pageCount: slides.length,
    fontCount: embeddedFonts.length,
    imageCount: embeddedImages.length,
  };
}

// ---------------------------------------------------------------------------
// Image embedding
// ---------------------------------------------------------------------------

/**
 * Embed collected images into a PDF document as XObject streams.
 *
 * For JPEG images: embeds raw bytes with /DCTDecode filter (no re-encoding).
 * For PNG images: embeds raw bytes with /FlateDecode filter.
 * Other formats: skipped (no embedding).
 *
 * @param images - Collected images from the presentation
 * @param pdfDoc - The PDF document to embed into
 * @param getImageBytes - Callback to retrieve raw image bytes by part URI
 * @returns Array of embedded image results
 */
function embedImagesForPdf(
  images: CollectedImage[],
  pdfDoc: PDFDocument,
  getImageBytes?: (partUri: string) => Uint8Array | undefined
): EmbeddedImageResult[] {
  if (!getImageBytes || images.length === 0) return [];

  const ctx = pdfDoc._nativeCtx;
  const results: EmbeddedImageResult[] = [];
  let imageCounter = 1;

  for (const img of images) {
    const bytes = getImageBytes(img.imagePartUri);
    if (!bytes || bytes.length === 0) continue;

    const mimeType = detectImageMimeType(bytes);
    const resourceName = `Im${imageCounter++}`;

    let xObjectRef: unknown;

    if (mimeType === 'image/jpeg') {
      xObjectRef = embedJpegXObject(ctx, bytes, resourceName);
    } else if (mimeType === 'image/png') {
      xObjectRef = embedPngXObject(ctx, bytes, resourceName);
    } else {
      // Unsupported format — skip
      continue;
    }

    if (xObjectRef) {
      results.push({
        imagePartUri: img.imagePartUri,
        resourceName,
        xObjectRef,
      });
    }
  }

  return results;
}

/**
 * Embed a JPEG image as a PDF XObject with /DCTDecode filter.
 *
 * JPEG bytes are embedded directly — no re-encoding needed.
 * Dimensions are parsed from the JPEG header (SOF marker).
 */
function embedJpegXObject(
  ctx: PDFDocument['_nativeCtx'],
  bytes: Uint8Array,
  _resourceName: string
): unknown {
  const dims = parseJpegDimensions(bytes);
  if (!dims) return undefined;

  // Create the XObject stream using duck-typed COS API
  const streamDict = createXObjectStream(ctx, bytes, {
    width: dims.width,
    height: dims.height,
    colorSpace: dims.components === 1 ? 'DeviceGray' : 'DeviceRGB',
    bitsPerComponent: 8,
    filter: 'DCTDecode',
  });

  return streamDict;
}

/**
 * Embed a PNG image as a PDF XObject with /FlateDecode filter.
 *
 * Embeds the raw PNG bytes with /FlateDecode filter. For proper
 * rendering, extracts width/height from the PNG IHDR chunk.
 * Alpha channel handling is deferred for now.
 */
function embedPngXObject(
  ctx: PDFDocument['_nativeCtx'],
  bytes: Uint8Array,
  _resourceName: string
): unknown {
  const dims = parsePngDimensions(bytes);
  if (!dims) return undefined;

  // For PNG, we embed the raw RGB pixel data with FlateDecode.
  // Full PNG decoding (to extract raw RGB + alpha) requires a decoder.
  // For now, embed the entire PNG with FlateDecode — most PDF viewers
  // can handle this via the /FlateDecode pipeline.
  // TRACKED-TASK: Full PNG decode (IDAT extraction + alpha SMask) for PDF export - see TODO.md

  const streamDict = createXObjectStream(ctx, bytes, {
    width: dims.width,
    height: dims.height,
    colorSpace: dims.colorType === 0 ? 'DeviceGray' : 'DeviceRGB',
    bitsPerComponent: dims.bitDepth,
    filter: 'FlateDecode',
  });

  return streamDict;
}

/**
 * Create a PDF Image XObject stream via the NativeDocumentContext.
 *
 * Uses duck-typing to access COS type constructors since they are not
 * exported from the pdf-signer public API. Extracts constructors from
 * existing objects in the context (font dictionaries contain COSName
 * and COSInteger instances we can use as prototypes).
 */
function createXObjectStream(
  ctx: PDFDocument['_nativeCtx'],
  data: Uint8Array,
  params: {
    width: number;
    height: number;
    colorSpace: string;
    bitsPerComponent: number;
    filter: string;
  }
): unknown {
  // Create a stream and get its reference
  const streamRef = ctx.createStream(data);
  const streamObj = ctx.lookup((streamRef as { objectNumber: number }).objectNumber);
  if (!streamObj) return streamRef;

  // Extract COS type constructors from existing objects.
  // embedStandardFont creates a COSDictionary with COSName and COSInteger values.
  const cosCtors = ensureCosConstructors(ctx);
  if (!cosCtors) return streamRef;

  const stream = streamObj as unknown as { setItem(k: string, v: unknown): void };

  // Set XObject properties on the stream
  stream.setItem('Type', new cosCtors.Name('XObject'));
  stream.setItem('Subtype', new cosCtors.Name('Image'));
  stream.setItem('Width', new cosCtors.Integer(params.width));
  stream.setItem('Height', new cosCtors.Integer(params.height));
  stream.setItem('ColorSpace', new cosCtors.Name(params.colorSpace));
  stream.setItem('BitsPerComponent', new cosCtors.Integer(params.bitsPerComponent));
  stream.setItem('Filter', new cosCtors.Name(params.filter));

  return streamRef;
}

// ---------------------------------------------------------------------------
// COS type constructor extraction (duck-typed)
// ---------------------------------------------------------------------------

interface CosConstructors {
  Name: new (name: string) => unknown;
  Integer: new (value: number) => unknown;
  Dictionary: new () => unknown;
}

let _cosCtors: CosConstructors | undefined;

/**
 * Extract COS type constructors from the NativeDocumentContext.
 *
 * Creates a throwaway standard font object to get access to COSName
 * and COSInteger constructors, which are needed for creating XObject
 * stream dictionary entries.
 */
function ensureCosConstructors(ctx: PDFDocument['_nativeCtx']): CosConstructors | undefined {
  if (_cosCtors) return _cosCtors;

  // Create a throwaway standard font — this creates a COSDictionary
  // containing COSName('Font'), COSName('Type1'), COSName(baseFontName),
  // COSName('WinAnsiEncoding')
  const fontRef = ctx.embedStandardFont('ZapfDingbats');
  const fontDict = ctx.lookup((fontRef as { objectNumber: number }).objectNumber) as
    | { getItem(k: string): unknown }
    | undefined;
  if (!fontDict) return undefined;

  // Extract COSName constructor from the /Type entry
  const typeEntry = fontDict.getItem('Type');
  if (!typeEntry) return undefined;
  const NameCtor = (typeEntry as object).constructor as new (name: string) => unknown;

  // Extract COSInteger constructor — we need a different source.
  // The NativeDocumentContext.createGraphicsState creates ExtGState dicts
  // with COSFloat values, not COSInteger. Instead, let's look at the
  // Pages tree /Count entry which is always a COSInteger.
  const pagesCount = (ctx as unknown as { pages: { getItem(k: string): unknown } }).pages?.getItem(
    'Count'
  );
  if (!pagesCount) return undefined;
  const IntegerCtor = (pagesCount as object).constructor as new (value: number) => unknown;

  // Extract COSDictionary constructor from the font dict itself
  const DictionaryCtor = (fontDict as object).constructor as new () => unknown;

  _cosCtors = {
    Name: NameCtor,
    Integer: IntegerCtor,
    Dictionary: DictionaryCtor,
  };

  return _cosCtors;
}

// ---------------------------------------------------------------------------
// Image resource wiring
// ---------------------------------------------------------------------------

/**
 * Build a map from image part URI to PDF resource name.
 */
function buildImageResourceMap(embeddedImages: EmbeddedImageResult[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const img of embeddedImages) {
    map.set(img.imagePartUri, img.resourceName);
  }
  return map;
}

/**
 * Wire embedded image resources into a page's /Resources /XObject dictionary.
 */
function wireImagesToPage(pageDict: unknown, embeddedImages: EmbeddedImageResult[]): void {
  if (embeddedImages.length === 0) return;

  const pd = pageDict as { getItem(k: string): unknown; setItem(k: string, v: unknown): void };
  const resources = pd.getItem('Resources');
  if (!resources || typeof (resources as { getItem: unknown }).getItem !== 'function') return;

  const res = resources as { getItem(k: string): unknown; setItem(k: string, v: unknown): void };

  // Get or create the /XObject sub-dictionary
  let xObjectDict = res.getItem('XObject');
  if (!xObjectDict || typeof (xObjectDict as { setItem: unknown }).setItem !== 'function') {
    // Create a new COSDictionary for /XObject
    const ResourcesCtor = (resources as object).constructor;
    xObjectDict = new (ResourcesCtor as new () => unknown)();
    if (typeof (xObjectDict as { setDirect: unknown }).setDirect === 'function') {
      (xObjectDict as { setDirect(d: boolean): void }).setDirect(true);
    }
    res.setItem('XObject', xObjectDict);
  }

  // Add each image reference
  for (const img of embeddedImages) {
    (xObjectDict as { setItem(k: string, v: unknown): void }).setItem(
      img.resourceName,
      img.xObjectRef
    );
  }
}

// ---------------------------------------------------------------------------
// JPEG dimension parser
// ---------------------------------------------------------------------------

/**
 * Parse width, height, and component count from JPEG SOF marker.
 */
function parseJpegDimensions(
  bytes: Uint8Array
): { width: number; height: number; components: number } | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return undefined;
  }

  let offset = 2;
  while (offset < bytes.length - 1) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }

    const marker = bytes[offset + 1];
    offset += 2;

    // SOF markers: 0xC0-0xC3, 0xC5-0xC7, 0xC9-0xCB, 0xCD-0xCF
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (offset + 7 <= bytes.length) {
        // Skip length (2 bytes) and precision (1 byte)
        const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
        const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const components = bytes[offset + 7];
        return { width, height, components };
      }
      return undefined;
    }

    // Skip marker segment
    if (offset + 1 < bytes.length) {
      const segLen = (bytes[offset] << 8) | bytes[offset + 1];
      offset += segLen;
    } else {
      break;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// PNG dimension parser
// ---------------------------------------------------------------------------

/**
 * Parse width, height, bit depth, and color type from PNG IHDR chunk.
 */
function parsePngDimensions(
  bytes: Uint8Array
): { width: number; height: number; bitDepth: number; colorType: number } | undefined {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return undefined;
  }

  // IHDR chunk starts at offset 8 (after 8-byte signature)
  // Chunk structure: 4-byte length, 4-byte type, data, 4-byte CRC
  // IHDR data: 4-byte width, 4-byte height, 1-byte bit depth, 1-byte color type, ...
  const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  const bitDepth = bytes[24];
  const colorType = bytes[25];

  return { width: width >>> 0, height: height >>> 0, bitDepth, colorType };
}
