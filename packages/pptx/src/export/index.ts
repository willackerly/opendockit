/**
 * PPTX Export — barrel export for PDF export functionality.
 *
 * Provides the cross-format PPTX -> PDF export pipeline.
 */

export { exportPresentationToPdf } from './pdf-exporter.js';
export type { PdfExportOptions, PdfExportResult } from './pdf-exporter.js';

export { collectFontsFromPresentation } from './pdf-font-collector.js';
export type { FontKey } from './pdf-font-collector.js';

export { embedFontsForPdf, wireFontsToPage, getStandardFontName } from './pdf-font-embedder.js';
export type { EmbeddedFontResult } from './pdf-font-embedder.js';

export { buildFontLookup } from './pdf-slide-renderer.js';
export type { FontLookupContext } from './pdf-slide-renderer.js';
