/**
 * @opendockit/pdf/pdfa — PDF/A compliance utilities.
 *
 * Re-exports PDF/A functionality from @opendockit/pdf-signer/pdfa.
 */

export {
  applyPDFAConformance,
  generateXMPMetadata,
  buildSRGBICCProfile,
} from '@opendockit/pdf-signer/pdfa';

export type {
  PDFALevel,
  XMPMetadataOptions,
} from '@opendockit/pdf-signer/pdfa';
