/**
 * pdfbox-ts/pdfa — PDF/A compliance utilities.
 *
 * Standalone entrypoint for applying PDF/A conformance to documents.
 */

export {
  applyPDFAConformance,
  generateXMPMetadata,
  buildSRGBICCProfile,
} from './document/pdfa/index.js';

export type {
  PDFALevel,
  XMPMetadataOptions,
} from './document/pdfa/index.js';
