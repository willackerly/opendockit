/**
 * Tests for flattenForms option in signPDFWithPDFBox.
 *
 * Verifies that when flattenForms: true is passed, all form fields are
 * flattened (baked into page content) before signing, making them
 * non-editable in the signed PDF.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { signPDFWithPDFBox } from '../pdfbox-signer';
import { getFixtureSigner } from '../../testing/fixture-signer';
import { PDFDocument } from '../../document/PDFDocument.js';

const signer = getFixtureSigner();

/**
 * Create a simple PDF with form fields (text field + checkbox) and return
 * the serialized bytes. The fields have visible rects so flattening
 * actually bakes content.
 */
async function createPdfWithFormFields(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const form = doc.getForm();

  // Create a text field
  const tf = form.createTextField('FullName');
  tf.setText('Alice Smith');
  tf.addToPage(page, { x: 50, y: 700, width: 200, height: 24 });

  // Create a checkbox
  const cb = form.createCheckBox('Agree');
  cb.check();
  cb.addToPage(page, { x: 50, y: 660, width: 12, height: 12 });

  return await doc.save();
}

/** Check whether a PDF has fillable AcroForm fields by scanning for /FT entries. */
function hasFillableFields(pdfBytes: Uint8Array): boolean {
  const text = new TextDecoder('latin1').decode(pdfBytes);
  // AcroForm fields have /FT (field type) entries — /FT /Tx, /FT /Btn, etc.
  // After flattening, the /Fields array is empty and widget annotations are removed.
  // Look for /Fields array with content (non-empty).
  const fieldsMatch = text.match(/\/Fields\s*\[([^\]]*)\]/);
  if (!fieldsMatch) return false;
  // If /Fields array is empty or contains only whitespace, no fillable fields
  const fieldsContent = fieldsMatch[1].trim();
  return fieldsContent.length > 0;
}

/** Count /FT (field type) entries — indicates form field definitions. */
function countFieldTypes(pdfBytes: Uint8Array): number {
  const text = new TextDecoder('latin1').decode(pdfBytes);
  const matches = text.match(/\/FT\s*\/(?:Tx|Btn|Ch|Sig)/g);
  return matches ? matches.length : 0;
}

describe('flattenForms option', () => {
  let pdfWithForms: Uint8Array;

  beforeAll(async () => {
    pdfWithForms = await createPdfWithFormFields();
  });

  it('should flatten form fields when flattenForms: true', async () => {
    const result = await signPDFWithPDFBox(pdfWithForms, signer, {
      flattenForms: true,
      signatureAppearance: {
        position: { page: 0, x: 50, y: 500, width: 200, height: 50 },
      },
    });

    expect(result.signedData).toBeInstanceOf(Uint8Array);
    expect(result.signedData.length).toBeGreaterThan(0);

    // After flattening + signing, the signed PDF should have no fillable fields
    // (The /Sig field from the signature itself is added after flattening)
    expect(hasFillableFields(result.signedData)).toBe(false);
  });

  it('should preserve form fields when flattenForms is false (default)', async () => {
    const result = await signPDFWithPDFBox(pdfWithForms, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 500, width: 200, height: 50 },
      },
    });

    expect(result.signedData).toBeInstanceOf(Uint8Array);

    // The original form fields (/FT /Tx and /FT /Btn) should still be present.
    // The signer adds /FT /Sig, so total field types should be >= 3.
    const fieldCount = countFieldTypes(result.signedData);
    expect(fieldCount).toBeGreaterThanOrEqual(3);
  });

  it('should produce a valid signature after flattening', async () => {
    const result = await signPDFWithPDFBox(pdfWithForms, signer, {
      flattenForms: true,
      signatureAppearance: {
        position: { page: 0, x: 50, y: 500, width: 200, height: 50 },
      },
    });

    // Verify the result has proper signature info
    expect(result.signatureInfo).toBeDefined();
    expect(result.signatureInfo.byteRange).toHaveLength(4);
    expect(result.signatureInfo.byteRange[0]).toBe(0);
    expect(result.signatureInfo.signatureSize).toBeGreaterThan(0);
    expect(result.signatureInfo.signedBy).toBe('pdfbox-ts Fixture');
  });

  it('should not flatten when flattenForms is explicitly false', async () => {
    const result = await signPDFWithPDFBox(pdfWithForms, signer, {
      flattenForms: false,
      signatureAppearance: {
        position: { page: 0, x: 50, y: 500, width: 200, height: 50 },
      },
    });

    // Fields should still be present (text + checkbox + signature)
    const fieldCount = countFieldTypes(result.signedData);
    expect(fieldCount).toBeGreaterThanOrEqual(3);
  });

  it('should handle PDFs with no form fields gracefully', async () => {
    // Create a PDF without any form fields
    const emptyDoc = await PDFDocument.create();
    emptyDoc.addPage();
    const emptyPdf = await emptyDoc.save();

    // Should not throw even though there are no fields to flatten
    const result = await signPDFWithPDFBox(emptyPdf, signer, {
      flattenForms: true,
      signatureAppearance: {
        position: { page: 0, x: 50, y: 500, width: 200, height: 50 },
      },
    });

    expect(result.signedData).toBeInstanceOf(Uint8Array);
    expect(result.signatureInfo.signatureSize).toBeGreaterThan(0);
  });
});
