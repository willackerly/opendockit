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
 *     -> for each slide: renderSlideToPdf() -> ContentStreamBuilder
 *     -> ContentStreamBuilder.toBytes() -> PDFPage content stream
 *     -> PDFDocument.save() -> Uint8Array (PDF bytes)
 *
 * Limitations of this initial implementation:
 * - Text is not rendered (requires font embedding/subsetting)
 * - Images are shown as light gray placeholders
 * - Gradients are approximated as solid fills (first stop color)
 * - Effects (shadows, glow) are not rendered
 * - Tables are shown as gray rectangles
 * - Only rectangular shapes are rendered (custom geometry is ignored)
 *
 * These limitations will be lifted incrementally as the RenderBackend
 * abstraction is completed and font/image embedding is wired in.
 */

import { PDFDocument } from '@opendockit/pdf-signer';
import { emuToPt } from '@opendockit/core';
import type { PresentationIR, EnrichedSlideData } from '../model/index.js';
import { renderSlideToPdf } from './pdf-slide-renderer.js';

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

  // 3. For each slide, create a page and render content
  for (let i = 0; i < slides.length; i++) {
    const slideData = slides[i];

    // Create a page with the slide dimensions
    const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);

    // Render slide content to PDF operators
    const builder = renderSlideToPdf(slideData, pageWidthPt, pageHeightPt);

    // Get the content stream bytes and inject into the page
    const contentBytes = builder.toBytes();

    // Use the page's internal method to push the content stream.
    // PDFPage._pushContentStream is private, but we can use the
    // document context to create a stream and add it to the page.
    const ctx = pdfDoc._nativeCtx;
    const streamRef = ctx.createStream(contentBytes);

    // Add the stream reference to the page's /Contents array.
    // The page was just created by addPage(), so /Contents is an
    // empty COSArray (see NativeDocumentContext.addPage()).
    const pageDict = page._nativePageDict!;
    const contents = pageDict.getItem('Contents');
    if (contents && 'add' in contents) {
      (contents as { add(ref: unknown): void }).add(streamRef);
    }
  }

  // 4. Save and return the PDF bytes
  const bytes = await pdfDoc.save();

  return {
    bytes,
    pageCount: slides.length,
  };
}
