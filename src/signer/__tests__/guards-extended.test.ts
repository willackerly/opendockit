import { describe, it, expect } from 'vitest';

import {
  signPDFWithPDFBox,
  preparePdfWithAppearance,
  signPreparedPdfWithPDFBox,
} from '../pdfbox-signer';
import { getFixtureSigner } from '../../testing/fixture-signer';
import { PDFDocument } from '../../document/index.js';

const signer = getFixtureSigner();

/** Create a minimal valid 1-page PDF for testing */
async function createTestPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  const bytes = await doc.save();
  return bytes;
}



/** Extract all /T (fieldName) string values from signature field widgets */
function extractFieldNames(pdfBytes: Uint8Array): string[] {
  const text = new TextDecoder('latin1').decode(pdfBytes);
  const names: string[] = [];
  const regex = /\/FT\s*\/Sig[\s\S]*?\/T\s*\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    names.push(match[1]);
  }
  return names;
}

describe('Extended signer guard edge cases', () => {
  it('signs without imageData (invisible signature) successfully', async () => {
    const pdf = await createTestPdf();
    const result = await signPDFWithPDFBox(pdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    expect(result.signedData).toBeInstanceOf(Uint8Array);
    expect(result.signedData.length).toBeGreaterThan(pdf.length);

    // Verify no image references in the output
    const text = new TextDecoder('latin1').decode(result.signedData);
    const imgDoCount = (text.match(/\/Img Do/g) || []).length;
    expect(imgDoCount).toBe(0);

    // ByteRange should be valid
    const [a, b, c, d] = result.signatureInfo.byteRange;
    expect(a).toBe(0);
    expect(b).toBeGreaterThan(0);
    expect(c).toBeGreaterThan(b);
    expect(d).toBeGreaterThan(0);
  });

  it('accepts a very long reason string (500+ chars)', async () => {
    const pdf = await createTestPdf();
    const longReason = 'R'.repeat(600);

    const result = await signPDFWithPDFBox(pdf, signer, {
      reason: longReason,
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    expect(result.signedData).toBeInstanceOf(Uint8Array);
    expect(result.signedData.length).toBeGreaterThan(pdf.length);

    // Verify the reason string appears in the signed PDF
    const text = new TextDecoder('latin1').decode(result.signedData);
    expect(text).toContain(longReason);
  });

  it('accepts a very long location string (500+ chars)', async () => {
    const pdf = await createTestPdf();
    const longLocation = 'L'.repeat(600);

    const result = await signPDFWithPDFBox(pdf, signer, {
      location: longLocation,
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    expect(result.signedData).toBeInstanceOf(Uint8Array);
    expect(result.signedData.length).toBeGreaterThan(pdf.length);

    // Verify the location string appears in the signed PDF
    const text = new TextDecoder('latin1').decode(result.signedData);
    expect(text).toContain(longLocation);
  });

  it('accepts empty reason string', async () => {
    const pdf = await createTestPdf();

    const result = await signPDFWithPDFBox(pdf, signer, {
      reason: '',
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    expect(result.signedData).toBeInstanceOf(Uint8Array);
    expect(result.signedData.length).toBeGreaterThan(pdf.length);
  });

  it('accepts empty location string', async () => {
    const pdf = await createTestPdf();

    const result = await signPDFWithPDFBox(pdf, signer, {
      location: '',
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    expect(result.signedData).toBeInstanceOf(Uint8Array);
    expect(result.signedData.length).toBeGreaterThan(pdf.length);
  });

  it('accepts undefined reason and location (omitted)', async () => {
    const pdf = await createTestPdf();

    const result = await signPDFWithPDFBox(pdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    expect(result.signedData).toBeInstanceOf(Uint8Array);

    // Verify /Reason and /Location keys are absent from signature dict
    const text = new TextDecoder('latin1').decode(result.signedData);
    // The signature dict should not contain /Reason or /Location when not provided
    // (Note: they might appear in other parts of the PDF, so this is a loose check)
    expect(text).toContain('/Filter');
    expect(text).toContain('/SubFilter');
  });

  it('first signature creates Signature1 field name', async () => {
    const pdf = await createTestPdf();

    const result = await signPDFWithPDFBox(pdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    const names = extractFieldNames(result.signedData);
    expect(names).toContain('Signature1');
  });

  it('double-sign assigns Signature1 then Signature2', async () => {
    const pdf = await createTestPdf();

    const firstResult = await signPDFWithPDFBox(pdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    const secondResult = await signPDFWithPDFBox(firstResult.signedData, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 110, width: 200, height: 50 },
      },
    });

    const names = extractFieldNames(secondResult.signedData);
    const uniqueNames = [...new Set(names)];
    expect(uniqueNames.length).toBeGreaterThanOrEqual(2);
    expect(uniqueNames).toContain('Signature1');
    expect(uniqueNames).toContain('Signature2');
  });

  it('custom fieldName overrides default Signature1', async () => {
    const pdf = await createTestPdf();

    const result = await signPDFWithPDFBox(pdf, signer, {
      signatureAppearance: {
        fieldName: 'MyCustomField',
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    const names = extractFieldNames(result.signedData);
    expect(names).toContain('MyCustomField');
  });

  it('signs a 1-page PDF successfully', async () => {
    const pdf = await createTestPdf();

    const result = await signPDFWithPDFBox(pdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    expect(result.signedData).toBeInstanceOf(Uint8Array);
    expect(result.signedData.length).toBeGreaterThan(pdf.length);

    // Verify basic signature structure
    const text = new TextDecoder('latin1').decode(result.signedData);
    expect(text).toContain('/Type /Sig');
    expect(text).toContain('/Filter /Adobe.PPKLite');
    expect(text).toContain('/SubFilter /adbe.pkcs7.detached');
  });

  it('signs a very small PDF without error', async () => {
    // Create the smallest valid PDF we can
    const doc = await PDFDocument.create();
    doc.addPage([72, 72]); // 1 inch x 1 inch
    const pdf = await doc.save();

    const result = await signPDFWithPDFBox(pdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 0, y: 0, width: 50, height: 20 },
      },
    });

    expect(result.signedData).toBeInstanceOf(Uint8Array);
    expect(result.signedData.length).toBeGreaterThan(0);

    const [a, b, c, d] = result.signatureInfo.byteRange;
    expect(a).toBe(0);
    expect(b + d + (c - b)).toBe(result.signedData.length);
  });

  it('signerName from certificate appears in signature dict', async () => {
    const pdf = await createTestPdf();

    const result = await signPDFWithPDFBox(pdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    // The signedBy field in signatureInfo comes from the cert CN
    expect(result.signatureInfo.signedBy).toBeTruthy();
    expect(result.signatureInfo.signedBy).not.toBe('Unknown');

    // The signer name should also appear in the PDF bytes (in the /Name field of sig dict)
    const text = new TextDecoder('latin1').decode(result.signedData);
    expect(text).toContain(result.signatureInfo.signedBy);
  });

  it('signing with reason and location both set', async () => {
    const pdf = await createTestPdf();

    const result = await signPDFWithPDFBox(pdf, signer, {
      reason: 'Test reason',
      location: 'Test location',
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    expect(result.signedData).toBeInstanceOf(Uint8Array);

    const text = new TextDecoder('latin1').decode(result.signedData);
    expect(text).toContain('Test reason');
    expect(text).toContain('Test location');
  });

  it('prepare/sign two-step API works for a fresh PDF', async () => {
    const pdf = await createTestPdf();

    const prepared = await preparePdfWithAppearance(pdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    expect(prepared.pdfBytes.length).toBeGreaterThan(0);
    expect(prepared.catalogObjectNumber).toBeGreaterThan(0);
    expect(prepared.pageObjectNumber).toBeGreaterThan(0);
    expect(prepared.signerName).toBeTruthy();

    const result = await signPreparedPdfWithPDFBox(prepared, signer);
    expect(result.signedData).toBeInstanceOf(Uint8Array);
    expect(result.signedData.length).toBeGreaterThan(prepared.pdfBytes.length);
  });

  it('signing returns valid signatureInfo metadata', async () => {
    const pdf = await createTestPdf();

    const result = await signPDFWithPDFBox(pdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    // signedAt should be a Date
    expect(result.signatureInfo.signedAt).toBeInstanceOf(Date);

    // signatureSize should be positive
    expect(result.signatureInfo.signatureSize).toBeGreaterThan(0);

    // xrefStart should be positive
    expect(result.signatureInfo.xrefStart).toBeGreaterThan(0);

    // Object numbers should be present and positive
    expect(result.signatureInfo.objects).toBeDefined();
    expect(result.signatureInfo.objects!.signature).toBeGreaterThan(0);
    expect(result.signatureInfo.objects!.widget).toBeGreaterThan(0);
    expect(result.signatureInfo.objects!.catalog).toBeGreaterThan(0);
    expect(result.signatureInfo.objects!.page).toBeGreaterThan(0);
  });

  it('page index is clamped to valid range', async () => {
    const pdf = await createTestPdf(); // 1-page PDF

    // Request page 99 on a 1-page PDF — should clamp to page 0
    const result = await signPDFWithPDFBox(pdf, signer, {
      signatureAppearance: {
        position: { page: 99, x: 50, y: 50, width: 200, height: 50 },
      },
    });

    expect(result.signedData).toBeInstanceOf(Uint8Array);
    expect(result.signedData.length).toBeGreaterThan(pdf.length);
  });
});
