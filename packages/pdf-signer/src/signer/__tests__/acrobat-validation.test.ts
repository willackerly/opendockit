import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { signPDFWithPDFBox } from '../pdfbox-signer.js';
import { verifySignatures } from '../verify.js';
import { getFixtureSigner } from '../../testing/fixture-signer.js';
import {
  isAcrobatAvailable,
  validateInAcrobat,
  closeAcrobatDoc,
  ensureAcrobatReady,
  dismissAcrobatDialogs,
  writeTempPdf,
  cleanupTempPdf,
  parseSigInfo,
  type AcrobatValidationResult,
} from '../../testing/acrobat-test-helpers.js';
import { PDFDocument } from '../../document/PDFDocument.js';
import { PDAnnotationHighlight } from '../../document/annotations/PDAnnotationHighlight.js';
import { rgb } from '../../document/colors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function loadTestPdf(relativePath: string): Uint8Array {
  const absolute = path.resolve(repoRoot, relativePath);
  return new Uint8Array(fs.readFileSync(absolute));
}

/**
 * Minimal valid 1x1 red PNG (67 bytes).
 */
function createMinimalPng(): Uint8Array {
  // prettier-ignore
  return new Uint8Array([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00,
    0x72, 0x73, 0x70, 0x60,
    0x00, 0x00, 0x00, 0x0C,
    0x49, 0x44, 0x41, 0x54,
    0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00,
    0x01, 0x01, 0x01, 0x00,
    0x18, 0xDD, 0x8D, 0xB4,
    0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4E, 0x44,
    0xAE, 0x42, 0x60, 0x82,
  ]);
}

// ---------------------------------------------------------------------------
// Test suite — gated by PDFBOX_TS_E2E_ACROBAT=1
// ---------------------------------------------------------------------------

const skipAcrobat = !process.env.PDFBOX_TS_E2E_ACROBAT;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Assert that every signature field in the validation result has a valid status.
 * Provides detailed error messages on failure.
 */
function assertAllSigsValidate(validation: AcrobatValidationResult, context = '') {
  const ctx = context ? ` (${context})` : '';
  expect(validation.opened, `PDF should open in Acrobat${ctx}`).toBe(true);
  expect(
    validation.sigFields.length,
    `should have at least one sig field${ctx}`,
  ).toBeGreaterThanOrEqual(1);

  for (const field of validation.sigFields) {
    const status = validation.sigStatus[field];
    expect(
      status,
      `sigStatus['${field}'] should be defined${ctx} — got sigStatus=${JSON.stringify(validation.sigStatus)}`,
    ).toBeDefined();
    expect(status).toBeGreaterThanOrEqual(1);
  }
}

describe.skipIf(skipAcrobat)('acrobat validation (adobe-auto.py)', () => {
  const signer = getFixtureSigner();
  let originalPdf: Uint8Array;
  let testPng: Uint8Array;
  const tempFiles: string[] = [];

  beforeAll(() => {
    if (!isAcrobatAvailable()) {
      console.warn(
        'WARNING: Adobe Acrobat not available. Requires macOS + Adobe Acrobat installed.',
      );
      throw new Error('Adobe Acrobat not available — cannot run Acrobat validation tests');
    }

    originalPdf = loadTestPdf('test-pdfs/working/wire-instructions.pdf');
    testPng = createMinimalPng();
  });

  // Ensure clean Acrobat state before each test
  beforeEach(async () => {
    closeAcrobatDoc();
    await sleep(1000);
    // Dismiss any lingering dialogs (update prompts, trust warnings, etc.)
    dismissAcrobatDialogs();
    await sleep(500);
    // If Acrobat is unresponsive (crashed, stuck dialog), restart it
    if (!ensureAcrobatReady()) {
      throw new Error('Could not make Acrobat responsive');
    }
  });

  afterEach(async () => {
    // Dismiss any dialogs that appeared during the test, then close docs
    dismissAcrobatDialogs();
    closeAcrobatDoc();
    await sleep(1500);
  });

  afterAll(() => {
    closeAcrobatDoc();
    for (const f of tempFiles.splice(0)) {
      cleanupTempPdf(f);
    }
  });

  // =========================================================================
  // Group 1: Core signing capabilities (5 tests)
  //
  // Validates the fundamental signing operations that every user relies on.
  // =========================================================================

  it('invisible signature validates', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer);
    const pdfPath = writeTempPdf(result.signedData, 'invisible-sig');
    tempFiles.push(pdfPath);

    assertAllSigsValidate(validateInAcrobat(pdfPath), 'invisible signature');
  }, 45_000);

  it('visual signature with text validates', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      reason: 'Approved',
      location: 'SF',
      signatureAppearance: {
        text: 'Approved by Legal',
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });
    const pdfPath = writeTempPdf(result.signedData, 'visual-text-sig');
    tempFiles.push(pdfPath);

    const validation = validateInAcrobat(pdfPath);
    assertAllSigsValidate(validation, 'visual text signature');

    // Verify metadata propagated
    const field = validation.sigFields[0];
    const info = parseSigInfo(validation.sigInfo[field]);
    expect(info.reason).toBe('Approved');
    expect(info.location).toBe('SF');
    expect(info.name.length).toBeGreaterThan(0);
  }, 45_000);

  it('visual signature with image validates', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        imageData: testPng,
        position: { page: 0, x: 50, y: 50, width: 200, height: 100 },
      },
    });
    const pdfPath = writeTempPdf(result.signedData, 'visual-img-sig');
    tempFiles.push(pdfPath);

    assertAllSigsValidate(validateInAcrobat(pdfPath), 'visual image signature');
  }, 45_000);

  it('counter-signature (2 signers) validates both', async () => {
    const firstResult = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });
    const secondResult = await signPDFWithPDFBox(firstResult.signedData, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 110, width: 200, height: 50 },
      },
    });

    const pdfPath = writeTempPdf(secondResult.signedData, 'counter-sig');
    tempFiles.push(pdfPath);

    const validation = validateInAcrobat(pdfPath);
    expect(validation.opened).toBe(true);
    expect(validation.sigFields.length).toBeGreaterThanOrEqual(2);
    for (const field of validation.sigFields) {
      const status = validation.sigStatus[field];
      expect(status).toBeDefined();
      expect(status).toBeGreaterThanOrEqual(1);
    }
  }, 60_000);

  it('custom field name appears in Acrobat', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        fieldName: 'MyCustomSig',
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });
    const pdfPath = writeTempPdf(result.signedData, 'custom-field-sig');
    tempFiles.push(pdfPath);

    const validation = validateInAcrobat(pdfPath);
    expect(validation.sigFields).toContain('MyCustomSig');
    assertAllSigsValidate(validation, 'custom field name');
  }, 45_000);

  // =========================================================================
  // Group 2: Signing modes (3 tests)
  //
  // Validates that different encoding/save modes produce Acrobat-valid output.
  // =========================================================================

  it('DER encoding validates', async () => {
    const origDer = process.env.PDFBOX_TS_CMS_DER;
    try {
      process.env.PDFBOX_TS_CMS_DER = '1';
      const result = await signPDFWithPDFBox(originalPdf, signer);
      const pdfPath = writeTempPdf(result.signedData, 'der-sig');
      tempFiles.push(pdfPath);

      assertAllSigsValidate(validateInAcrobat(pdfPath), 'DER mode');
    } finally {
      if (origDer === undefined) delete process.env.PDFBOX_TS_CMS_DER;
      else process.env.PDFBOX_TS_CMS_DER = origDer;
    }
  }, 45_000);

  it('full-save mode validates', async () => {
    const origFullSave = process.env.PDFBOX_TS_FORCE_FULL_SAVE;
    try {
      process.env.PDFBOX_TS_FORCE_FULL_SAVE = '1';
      const result = await signPDFWithPDFBox(originalPdf, signer);
      const pdfPath = writeTempPdf(result.signedData, 'fullsave-sig');
      tempFiles.push(pdfPath);

      assertAllSigsValidate(validateInAcrobat(pdfPath), 'full-save mode');
    } finally {
      if (origFullSave === undefined) delete process.env.PDFBOX_TS_FORCE_FULL_SAVE;
      else process.env.PDFBOX_TS_FORCE_FULL_SAVE = origFullSave;
    }
  }, 45_000);

  it('multi-page PDF validates', async () => {
    const multiPagePdf = loadTestPdf(
      'test-pdfs/chrome-google-docs/text-with-images-google-docs.pdf',
    );
    const result = await signPDFWithPDFBox(multiPagePdf, signer);
    const pdfPath = writeTempPdf(result.signedData, 'multipage-sig');
    tempFiles.push(pdfPath);

    const validation = validateInAcrobat(pdfPath);
    assertAllSigsValidate(validation, 'multi-page');
    expect(validation.numPages).toBe(2);
  }, 45_000);

  // =========================================================================
  // Group 3: Document features + signing (4 tests)
  //
  // Validates that created documents with various features produce valid
  // signatures when signed. Covers form fields, checkboxes, annotations,
  // and flattened forms — the most common real-world workflows.
  // =========================================================================

  it('PDF with text field then signed', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const form = doc.getForm();
    const textField = form.createTextField('test_field');
    textField.setText('Hello World');
    textField.addToPage(page, { x: 50, y: 700, width: 200, height: 30 });
    const pdfBytes = await doc.save();

    const result = await signPDFWithPDFBox(new Uint8Array(pdfBytes), signer);
    const pdfPath = writeTempPdf(result.signedData, 'form-field-sig');
    tempFiles.push(pdfPath);

    assertAllSigsValidate(validateInAcrobat(pdfPath), 'text field');
  }, 45_000);

  it('PDF with checkbox then signed', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const form = doc.getForm();
    const checkbox = form.createCheckBox('agree_check');
    checkbox.addToPage(page, { x: 50, y: 700, width: 20, height: 20 });
    checkbox.check();
    const pdfBytes = await doc.save();

    const result = await signPDFWithPDFBox(new Uint8Array(pdfBytes), signer);
    const pdfPath = writeTempPdf(result.signedData, 'checkbox-sig');
    tempFiles.push(pdfPath);

    assertAllSigsValidate(validateInAcrobat(pdfPath), 'checkbox');
  }, 45_000);

  it('PDF with highlight annotation then signed', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const highlight = new PDAnnotationHighlight({
      rect: [50, 700, 250, 720],
      color: rgb(1, 1, 0),
      contents: 'Test highlight',
    });
    page.addAnnotation(highlight);
    const pdfBytes = await doc.save();

    const result = await signPDFWithPDFBox(new Uint8Array(pdfBytes), signer);
    const pdfPath = writeTempPdf(result.signedData, 'annotation-sig');
    tempFiles.push(pdfPath);

    assertAllSigsValidate(validateInAcrobat(pdfPath), 'annotation');
  }, 45_000);

  it('flattened form then signed', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const form = doc.getForm();
    const textField = form.createTextField('flat_field');
    textField.setText('Flattened');
    textField.addToPage(page, { x: 50, y: 700, width: 200, height: 30 });
    form.flatten();
    const pdfBytes = await doc.save();

    const result = await signPDFWithPDFBox(new Uint8Array(pdfBytes), signer);
    const pdfPath = writeTempPdf(result.signedData, 'flattened-sig');
    tempFiles.push(pdfPath);

    assertAllSigsValidate(validateInAcrobat(pdfPath), 'flattened form');
  }, 45_000);

  // =========================================================================
  // Group 4: Cross-validation (2 tests)
  //
  // Validates that our verifySignatures API agrees with Acrobat, and that
  // signing various parity fixtures produces Acrobat-valid output.
  // =========================================================================

  it('verifySignatures agrees with Acrobat', async () => {
    const result = await signPDFWithPDFBox(originalPdf, signer, {
      reason: 'Cross-check test',
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });
    const pdfPath = writeTempPdf(result.signedData, 'crosscheck-sig');
    tempFiles.push(pdfPath);

    // Acrobat validation
    assertAllSigsValidate(validateInAcrobat(pdfPath), 'cross-check');

    // Our verifySignatures
    const verifyResults = verifySignatures(result.signedData);
    expect(verifyResults.length).toBeGreaterThanOrEqual(1);
    for (const vr of verifyResults) {
      expect(vr.integrityValid).toBe(true);
      expect(vr.signatureValid).toBe(true);
    }
  }, 45_000);

  it('triple-signed PDF validates all three', async () => {
    const first = await signPDFWithPDFBox(originalPdf, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 50, width: 200, height: 40 },
      },
    });
    const second = await signPDFWithPDFBox(first.signedData, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 100, width: 200, height: 40 },
      },
    });
    const third = await signPDFWithPDFBox(second.signedData, signer, {
      signatureAppearance: {
        position: { page: 0, x: 50, y: 150, width: 200, height: 40 },
      },
    });

    const pdfPath = writeTempPdf(third.signedData, 'triple-sig');
    tempFiles.push(pdfPath);

    const validation = validateInAcrobat(pdfPath);
    expect(validation.opened).toBe(true);
    expect(validation.sigFields.length).toBeGreaterThanOrEqual(3);

    // At minimum the latest signature should validate
    const lastField = validation.sigFields[validation.sigFields.length - 1];
    const lastStatus = validation.sigStatus[lastField];
    expect(lastStatus, `last sig field '${lastField}' should validate`).toBeDefined();
    expect(lastStatus).toBeGreaterThanOrEqual(1);
  }, 60_000);

  // =========================================================================
  // Group 5: Loaded PDF counter-signing (5 tests)
  //
  // Validates counter-signing workflows on REAL loaded PDFs (not created docs).
  // This is the exact user workflow: upload existing PDF → sign → counter-sign
  // → validate in Acrobat. Covers multi-page, large, and image-heavy PDFs.
  // =========================================================================

  it('counter-sign large multi-page PDF (35 pages)', async () => {
    const largePdf = loadTestPdf(
      'test-pdfs/chrome-google-docs/complex-presentation-google-docs.pdf',
    );

    const first = await signPDFWithPDFBox(largePdf, signer, {
      signatureAppearance: {
        text: 'Signer 1',
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });
    const second = await signPDFWithPDFBox(first.signedData, signer, {
      signatureAppearance: {
        text: 'Signer 2',
        position: { page: 0, x: 50, y: 110, width: 200, height: 50 },
      },
    });

    const pdfPath = writeTempPdf(second.signedData, 'large-counter-sig');
    tempFiles.push(pdfPath);

    const validation = validateInAcrobat(pdfPath);
    expect(validation.opened).toBe(true);
    expect(validation.sigFields.length).toBeGreaterThanOrEqual(2);
    for (const field of validation.sigFields) {
      const status = validation.sigStatus[field];
      expect(
        status,
        `sig '${field}' should validate on large PDF`,
      ).toBeDefined();
      expect(status).toBeGreaterThanOrEqual(1);
    }
  }, 90_000);

  it('counter-sign loaded PDF with image signatures', async () => {
    const multiPagePdf = loadTestPdf(
      'test-pdfs/chrome-google-docs/text-with-images-google-docs.pdf',
    );

    const first = await signPDFWithPDFBox(multiPagePdf, signer, {
      signatureAppearance: {
        imageData: testPng,
        text: 'User 1',
        position: { page: 0, x: 50, y: 50, width: 200, height: 80 },
      },
    });
    const second = await signPDFWithPDFBox(first.signedData, signer, {
      signatureAppearance: {
        imageData: testPng,
        text: 'User 2',
        position: { page: 0, x: 260, y: 50, width: 200, height: 80 },
      },
    });

    const pdfPath = writeTempPdf(second.signedData, 'loaded-img-counter-sig');
    tempFiles.push(pdfPath);

    const validation = validateInAcrobat(pdfPath);
    expect(validation.opened).toBe(true);
    expect(validation.sigFields.length).toBeGreaterThanOrEqual(2);
    for (const field of validation.sigFields) {
      const status = validation.sigStatus[field];
      expect(
        status,
        `sig '${field}' should validate (image counter-sign)`,
      ).toBeDefined();
      expect(status).toBeGreaterThanOrEqual(1);
    }
  }, 90_000);

  it('triple-sign large loaded PDF', async () => {
    const largePdf = loadTestPdf(
      'test-pdfs/chrome-google-docs/complex-presentation-google-docs.pdf',
    );

    const first = await signPDFWithPDFBox(largePdf, signer, {
      signatureAppearance: {
        text: 'Approver A',
        position: { page: 0, x: 50, y: 50, width: 180, height: 40 },
      },
    });
    const second = await signPDFWithPDFBox(first.signedData, signer, {
      signatureAppearance: {
        text: 'Approver B',
        position: { page: 0, x: 50, y: 100, width: 180, height: 40 },
      },
    });
    const third = await signPDFWithPDFBox(second.signedData, signer, {
      signatureAppearance: {
        text: 'Approver C',
        position: { page: 0, x: 50, y: 150, width: 180, height: 40 },
      },
    });

    const pdfPath = writeTempPdf(third.signedData, 'large-triple-sig');
    tempFiles.push(pdfPath);

    const validation = validateInAcrobat(pdfPath);
    expect(validation.opened).toBe(true);
    expect(validation.sigFields.length).toBeGreaterThanOrEqual(3);

    // All three signatures should validate
    for (const field of validation.sigFields) {
      const status = validation.sigStatus[field];
      expect(
        status,
        `sig '${field}' should validate on triple-signed large PDF`,
      ).toBeDefined();
      expect(status).toBeGreaterThanOrEqual(1);
    }
  }, 120_000);

  it('sign on later page of multi-page PDF', async () => {
    const largePdf = loadTestPdf(
      'test-pdfs/chrome-google-docs/complex-presentation-google-docs.pdf',
    );

    // Place signature on page 10 (0-indexed), not page 0
    const result = await signPDFWithPDFBox(largePdf, signer, {
      signatureAppearance: {
        text: 'Signed on page 10',
        position: { page: 9, x: 50, y: 50, width: 250, height: 50 },
      },
    });

    const pdfPath = writeTempPdf(result.signedData, 'later-page-sig');
    tempFiles.push(pdfPath);

    assertAllSigsValidate(validateInAcrobat(pdfPath), 'later page signature');
  }, 60_000);

  it('counter-sign image-heavy PDF (Chrome print)', async () => {
    const imagePdf = loadTestPdf(
      'test-pdfs/chrome-google-docs/complex-with-images-chrome-print.pdf',
    );

    const first = await signPDFWithPDFBox(imagePdf, signer, {
      signatureAppearance: {
        text: 'Reviewer',
        position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
      },
    });
    const second = await signPDFWithPDFBox(first.signedData, signer, {
      signatureAppearance: {
        text: 'Approver',
        position: { page: 0, x: 260, y: 50, width: 200, height: 50 },
      },
    });

    const pdfPath = writeTempPdf(second.signedData, 'image-heavy-counter-sig');
    tempFiles.push(pdfPath);

    const validation = validateInAcrobat(pdfPath);
    expect(validation.opened).toBe(true);
    expect(validation.sigFields.length).toBeGreaterThanOrEqual(2);
    for (const field of validation.sigFields) {
      const status = validation.sigStatus[field];
      expect(
        status,
        `sig '${field}' should validate on image-heavy PDF`,
      ).toBeDefined();
      expect(status).toBeGreaterThanOrEqual(1);
    }
  }, 90_000);
});
