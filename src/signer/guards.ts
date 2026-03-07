import type { TrailerInfo } from '../pdfbox';
import { UnsupportedPdfFeatureError } from '../errors/UnsupportedPdfFeatureError';

export function ensureSupportedTrailerFeatures(trailer: TrailerInfo): void {
  if (trailer.encryptRef) {
    throw new UnsupportedPdfFeatureError({
      feature: 'encrypted-document',
      message: `PDF is encrypted (trailer /Encrypt points to object ${trailer.encryptRef.objectNumber} ${trailer.encryptRef.generation} R). Decrypt the PDF first using PDFDocument.load(bytes, { password: 'xxx' }), then save() to get decrypted bytes before signing.`,
      recommendation:
        "Load the encrypted PDF with a password, save it as unencrypted, then sign the unencrypted version.",
      context: { encryptRef: trailer.encryptRef },
    });
  }
}

export function ensureValidObjectRef(objectNumber: number, label: string): void {
  if (!Number.isFinite(objectNumber) || objectNumber <= 0) {
    throw new UnsupportedPdfFeatureError({
      feature: 'missing-object-ref',
      message: `Could not resolve object number for ${label}.`,
      recommendation:
        "Port the full trailer/object walker from PDFBox (COSParser/COSDocument) so indirect references can be discovered reliably.",
      context: { label, objectNumber },
    });
  }
}
