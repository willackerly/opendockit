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
 *     -> for each slide:
 *        -> renderSlideToPdf() -> ContentStreamBuilder
 *        -> wireFontsToPage() -> page /Resources /Font wired
 *        -> ContentStreamBuilder.toBytes() -> PDFPage content stream
 *     -> PDFDocument.save() -> Uint8Array (PDF bytes)
 *
 * Font handling:
 * - Text runs are rendered via PDF standard fonts (Helvetica, Times, Courier)
 *   mapped from the presentation's CSS font families
 * - Font resources are properly declared in each page's /Resources
 * - Text is encoded using WinAnsiEncoding for correct glyph rendering
 */

import { PDFDocument } from '@opendockit/pdf-signer';
import { emuToPt } from '@opendockit/core';
import type { PresentationIR, EnrichedSlideData } from '../model/index.js';
import { renderSlideToPdf, buildFontLookup } from './pdf-slide-renderer.js';
import { collectFontsFromPresentation } from './pdf-font-collector.js';
import { embedFontsForPdf, wireFontsToPage } from './pdf-font-embedder.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Options for PDF export. */
export interface PdfExportOptions {
  /** DPI for rasterized elements (default: 150). Not yet used. */
  dpi?: number;
  /** Include slide notes as PDF annotations? (default: false). Not yet implemented. */
  includeNotes?: boolean;
}

/** Result of a PDF export operation. */
export interface PdfExportResult {
  /** The PDF file as bytes. */
  bytes: Uint8Array;
  /** Number of pages (slides) exported. */
  pageCount: number;
  /** Number of unique fonts embedded (or mapped to standard fonts). */
  fontCount: number;
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
 * 3. For each slide: render content, wire fonts, inject stream
 * 4. Save the PDF
 *
 * @param presentation - The parsed presentation IR (slide dimensions, theme, etc.)
 * @param slides - Enriched slide data for each slide to export (slide + layout + master chain)
 * @param options - Optional export configuration
 * @returns PDF bytes and metadata
 */
export async function exportPresentationToPdf(
  presentation: PresentationIR,
  slides: EnrichedSlideData[],
  _options?: PdfExportOptions
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

  // 6. For each slide, create a page and render content
  for (let i = 0; i < slides.length; i++) {
    const slideData = slides[i];

    // Create a page with the slide dimensions
    const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);

    // Wire font resources into the page's /Resources /Font dictionary
    const pageDict = page._nativePageDict!;
    wireFontsToPage(pageDict, embeddedFonts, pdfDoc);

    // Render slide content to PDF operators (with font context for text)
    const builder = renderSlideToPdf(slideData, pageWidthPt, pageHeightPt, fontCtx);

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

  // 7. Save and return the PDF bytes
  const bytes = await pdfDoc.save();

  return {
    bytes,
    pageCount: slides.length,
    fontCount: embeddedFonts.length,
  };
}
