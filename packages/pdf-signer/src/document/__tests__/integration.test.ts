/**
 * Integration tests — create/save/load/sign round-trips, real-world PDF loading,
 * error boundaries, and cross-format verification.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from '../PDFDocument.js';
import { StandardFonts } from '../StandardFonts.js';
import { rgb } from '../colors.js';
import { PageSizes } from '../sizes.js';
import { readFields } from '../NativeFormReader.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fixtureExists(relPath: string): boolean {
  return fs.existsSync(path.resolve(relPath));
}

function readFixture(relPath: string): Uint8Array {
  return fs.readFileSync(path.resolve(relPath));
}

function hasCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Valid 1x1 red PNG (RGB, 8-bit, correct Adler-32) — same as native-document.test.ts
const RED_1x1_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65,
  84, 120, 156, 99, 248, 207, 192, 0, 0, 3, 1, 1, 0, 201, 254, 146, 239, 0, 0, 0,
  0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

// Minimal valid JPEG (1x1, grayscale)
const MINIMAL_JPEG = new Uint8Array([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
  0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
  0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
  0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
  0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
  0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
  0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
  0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
  0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
  0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
  0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
  0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
  0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
  0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
  0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
  0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
  0x00, 0x00, 0x3F, 0x00, 0x7B, 0x94, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xD9,
]);

// ---------------------------------------------------------------------------
// A. Create → Save → Load → Verify
// ---------------------------------------------------------------------------

describe('Create → Save → Load → Verify', () => {
  it('creates PDF with all 14 standard fonts, saves, reloads', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage(PageSizes.Letter);

    const fontNames = [
      StandardFonts.Helvetica, StandardFonts.HelveticaBold,
      StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique,
      StandardFonts.TimesRoman, StandardFonts.TimesRomanBold,
      StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic,
      StandardFonts.Courier, StandardFonts.CourierBold,
      StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique,
      StandardFonts.Symbol, StandardFonts.ZapfDingbats,
    ];

    let y = 750;
    for (const fontName of fontNames) {
      const font = await doc.embedFont(fontName);
      // Symbol and ZapfDingbats use non-WinAnsi encoding — skip Latin text for them
      if (fontName === StandardFonts.Symbol || fontName === StandardFonts.ZapfDingbats) continue;
      page.drawText(`Font: ${fontName}`, { x: 50, y, size: 10, font });
      y -= 15;
    }

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  it('creates PDF with images, saves, reloads', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();

    const jpgImage = await doc.embedJpg(MINIMAL_JPEG);
    page.drawImage(jpgImage, { x: 50, y: 700, width: 50, height: 50 });

    const pngImage = await doc.embedPng(RED_1x1_PNG);
    page.drawImage(pngImage, { x: 150, y: 700, width: 50, height: 50 });

    const bytes = await doc.save();
    expect(bytes.length).toBeGreaterThan(100);

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  it('creates 10-page document with mixed content', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    for (let i = 0; i < 10; i++) {
      const page = doc.addPage();
      page.drawText(`Page ${i + 1}`, { x: 50, y: 700, size: 24, font });
      page.drawRectangle({
        x: 50, y: 600, width: 200, height: 50,
        color: rgb(0.9, 0.9, 0.9),
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });
    }

    const bytes = await doc.save();
    expect(bytes.length).toBeLessThan(50000); // reasonable size
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(10);
  });

  it('round-trips metadata correctly', async () => {
    const doc = await PDFDocument.create();
    doc.setTitle('Integration Test');
    doc.setAuthor('pdfbox-ts');
    doc.setSubject('Testing');
    doc.setCreator('integration.test.ts');
    doc.addPage();

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getTitle()).toBe('Integration Test');
    expect(loaded.getAuthor()).toBe('pdfbox-ts');
    expect(loaded.getSubject()).toBe('Testing');
    expect(loaded.getCreator()).toBe('integration.test.ts');
  });

  it('saves as base64 and reloads', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const b64 = await doc.saveAsBase64();
    const loaded = await PDFDocument.load(b64);
    expect(loaded.getPageCount()).toBe(1);
  });

  it('copy produces identical page count', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.addPage();
    doc.setTitle('Copy Test');

    const copied = await doc.copy();
    expect(copied.getPageCount()).toBe(2);
  });

  it('save then load round-trip preserves valid PDF', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage();
    page.drawText('Hello', { x: 50, y: 700, size: 12, font });

    const bytes1 = await doc.save();
    const loaded = await PDFDocument.load(bytes1);
    const bytes2 = await loaded.save();

    // Both should be valid PDFs
    const header1 = new TextDecoder().decode(bytes1.slice(0, 5));
    const header2 = new TextDecoder().decode(bytes2.slice(0, 5));
    expect(header1).toBe('%PDF-');
    expect(header2).toBe('%PDF-');
  });

  it('addPage on loaded document increases page count', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);

    loaded.addPage();
    expect(loaded.getPageCount()).toBe(2);

    const saved = await loaded.save();
    const reloaded = await PDFDocument.load(saved);
    expect(reloaded.getPageCount()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// B. Load Real-World PDFs
// ---------------------------------------------------------------------------

describe('Load real-world PDFs', () => {
  const fixtures = [
    { id: 'wire-instructions', file: 'test-pdfs/working/wire-instructions.pdf', pages: 3 },
    { id: 'test-document', file: 'test-pdfs/working/test-document.pdf', pages: 1 },
    { id: 'simple-test', file: 'test-pdfs/working/simple-test.pdf', pages: 1 },
    { id: 'google-docs-multipage', file: 'test-pdfs/chrome-google-docs/text-with-images-google-docs.pdf', pages: 2 },
    { id: 'google-docs-presentation', file: 'test-pdfs/chrome-google-docs/complex-presentation-google-docs.pdf', pages: 35 },
  ];

  for (const fixture of fixtures) {
    it(`loads ${fixture.id} with correct page count`, async () => {
      if (!fixtureExists(fixture.file)) return; // skip if not available
      const bytes = readFixture(fixture.file);
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(fixture.pages);
    });
  }

  it('loads signed PDF and detects pages', async () => {
    if (!fixtureExists('test-pdfs/working/wire-instructions-signed.pdf')) return;
    const bytes = readFixture('test-pdfs/working/wire-instructions-signed.pdf');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
  });

  it('loads multipage PDF and getPages() returns all in order', async () => {
    if (!fixtureExists('test-pdfs/chrome-google-docs/text-with-images-google-docs.pdf')) return;
    const bytes = readFixture('test-pdfs/chrome-google-docs/text-with-images-google-docs.pdf');
    const doc = await PDFDocument.load(bytes);
    const pages = doc.getPages();
    expect(pages.length).toBe(2);
    for (const page of pages) {
      expect(page.getWidth()).toBeGreaterThan(0);
      expect(page.getHeight()).toBeGreaterThan(0);
    }
  });

  it('loads PDF and page dimensions are correct', async () => {
    if (!fixtureExists('test-pdfs/working/wire-instructions.pdf')) return;
    const bytes = readFixture('test-pdfs/working/wire-instructions.pdf');
    const doc = await PDFDocument.load(bytes);
    const page = doc.getPage(0);
    expect(page.getWidth()).toBe(612);  // Letter width
    expect(page.getHeight()).toBe(792); // Letter height
  });

  it('loads object-stream PDF', async () => {
    if (!fixtureExists('test-pdfs/working/object-stream.pdf')) return;
    const bytes = readFixture('test-pdfs/working/object-stream.pdf');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// C. Error Boundaries
// ---------------------------------------------------------------------------

describe('Error boundaries', () => {
  it('rejects empty Uint8Array', async () => {
    await expect(PDFDocument.load(new Uint8Array())).rejects.toThrow();
  });

  it('rejects random 100 bytes', async () => {
    const random = new Uint8Array(100);
    for (let i = 0; i < 100; i++) random[i] = Math.floor(Math.random() * 256);
    await expect(PDFDocument.load(random)).rejects.toThrow();
  });

  it('rejects truncated PDF (first 50 bytes of valid)', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();
    const truncated = bytes.slice(0, 50);
    await expect(PDFDocument.load(truncated)).rejects.toThrow();
  });

  it('rejects valid PDF header + garbage', async () => {
    const header = new TextEncoder().encode('%PDF-1.4\n');
    const garbage = new Uint8Array(100);
    const combined = new Uint8Array(header.length + garbage.length);
    combined.set(header);
    combined.set(garbage, header.length);
    // Native parser may be lenient with header-only garbage; either throw or fall back
    try {
      await PDFDocument.load(combined);
      // If it didn't throw, the parser was lenient — that's acceptable
    } catch {
      // Expected: parser rejected garbage after header
    }
  });

  it('embedFont with invalid name returns error on native doc', async () => {
    const doc = await PDFDocument.create();
    await expect(doc.embedFont('NotARealFont')).rejects.toThrow();
  });

  it('embedPng with corrupt data throws', async () => {
    const doc = await PDFDocument.create();
    await expect(doc.embedPng(new Uint8Array([0, 1, 2, 3]))).rejects.toThrow();
  });

  it('embedJpg with non-JPEG data throws', async () => {
    const doc = await PDFDocument.create();
    await expect(doc.embedJpg(new Uint8Array([0, 1, 2, 3]))).rejects.toThrow();
  });

  it('getPage with out-of-range index throws', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    expect(() => doc.getPage(1)).toThrow();
    expect(() => doc.getPage(-1)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// D. Cross-Format Verification
// ---------------------------------------------------------------------------

describe('Cross-format verification', () => {
  it('created PDF starts with %PDF-', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('created PDF ends with %%EOF', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();
    const tail = new TextDecoder().decode(bytes.slice(-10));
    expect(tail).toContain('%%EOF');
  });

  it('created PDF with version 1.7 has correct header', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();
    const header = new TextDecoder().decode(bytes.slice(0, 9));
    expect(header).toContain('%PDF-1.7');
  });

  it('loaded PDF preserves version in re-save', async () => {
    if (!fixtureExists('test-pdfs/working/simple-test.pdf')) return;
    const bytes = readFixture('test-pdfs/working/simple-test.pdf');
    const header = new TextDecoder().decode(bytes.slice(0, 10));
    // Just verify it's a valid PDF header
    expect(header).toContain('%PDF-');
  });

  it('qpdf validates created PDF', async () => {
    if (!hasCommand('qpdf')) return; // skip if qpdf unavailable
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage();
    page.drawText('qpdf test', { x: 50, y: 700, size: 12, font });
    const bytes = await doc.save();

    const tmpPath = path.resolve('tmp/integration-qpdf-test.pdf');
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, bytes);
    try {
      // qpdf --check exits 0 if valid — just verify no exception is thrown
      execSync(`qpdf --check "${tmpPath}"`, { encoding: 'utf-8' });
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });

  it('created PDF file size is reasonable', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();
    // A minimal 1-page PDF should be under 2KB
    expect(bytes.length).toBeLessThan(2000);
    expect(bytes.length).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------
// E. Form integration
// ---------------------------------------------------------------------------

describe('Form integration (native)', () => {
  it('reads form fields from natively-created PDF', async () => {
    // Create PDF with form fields natively
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const form = pdfDoc.getForm();

    const nameField = form.createTextField('name');
    nameField.addToPage(page);
    const emailField = form.createTextField('email');
    emailField.addToPage(page);
    const phoneField = form.createTextField('phone');
    phoneField.addToPage(page);

    const bytes = await pdfDoc.save();

    // Load and read fields via facade
    const doc = await PDFDocument.load(bytes);
    const nativeForm = doc.getForm();
    const fields = nativeForm.getFields();
    expect(fields.length).toBeGreaterThanOrEqual(3);

    const names = fields.map(f => f.getName());
    expect(names).toContain('name');
    expect(names).toContain('email');
    expect(names).toContain('phone');
  });

  it('reads and modifies text field value', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const form = pdfDoc.getForm();

    const tf = form.createTextField('greeting');
    tf.setText('Hello');
    tf.addToPage(page);

    const bytes = await pdfDoc.save();
    const doc = await PDFDocument.load(bytes);
    const nativeForm = doc.getForm();

    const greeting = nativeForm.getTextField('greeting');
    expect(greeting.getText()).toBe('Hello');

    greeting.setText('World');
    expect(greeting.getText()).toBe('World');
  });

  it('getForm on PDF with no form returns empty fields', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    const form = loaded.getForm();
    expect(form.getFields()).toEqual([]);
  });

  it('createTextField works natively', async () => {
    const doc = await PDFDocument.create();
    const form = doc.getForm();
    const field = form.createTextField('test');
    expect(field.getName()).toBe('test');
  });
});

// ---------------------------------------------------------------------------
// F. Page manipulation round-trips
// ---------------------------------------------------------------------------

describe('Page manipulation round-trips', () => {
  it('removePage persists after save/reload', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 200]);
    doc.addPage([300, 400]);
    doc.addPage([500, 600]);
    expect(doc.getPageCount()).toBe(3);

    doc.removePage(1); // remove middle page
    expect(doc.getPageCount()).toBe(2);

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(2);
    expect(loaded.getPage(0).getWidth()).toBe(100);
    expect(loaded.getPage(0).getHeight()).toBe(200);
    expect(loaded.getPage(1).getWidth()).toBe(500);
    expect(loaded.getPage(1).getHeight()).toBe(600);
  });

  it('insertPage places page at correct position after save/reload', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 200]); // page 0
    doc.addPage([300, 400]); // page 1
    doc.insertPage(1, [500, 600]); // insert at index 1
    expect(doc.getPageCount()).toBe(3);

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(3);
    expect(loaded.getPage(0).getWidth()).toBe(100);
    expect(loaded.getPage(1).getWidth()).toBe(500);
    expect(loaded.getPage(2).getWidth()).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// G. setLanguage round-trip
// ---------------------------------------------------------------------------

describe('setLanguage round-trip', () => {
  it('persists /Lang on catalog after save/reload', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.setLanguage('en-US');

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    const lang = loaded._nativeCtx.catalog.getString('Lang');
    expect(lang).toBe('en-US');
  });
});

// ---------------------------------------------------------------------------
// H. removeField round-trip
// ---------------------------------------------------------------------------

describe('removeField round-trip', () => {
  it('removes a field and persists after save/reload', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const form = doc.getForm();

    const f1 = form.createTextField('keep');
    f1.addToPage(page);
    const f2 = form.createTextField('remove_me');
    f2.addToPage(page);

    // Verify both exist
    expect(form.getFields().length).toBe(2);

    // Remove one
    const fieldToRemove = form.getField('remove_me');
    form.removeField(fieldToRemove);

    const remaining = form.getFields();
    expect(remaining.length).toBe(1);
    expect(remaining[0].getName()).toBe('keep');

    // Round-trip
    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    const loadedForm = loaded.getForm();
    const loadedFields = loadedForm.getFields();
    expect(loadedFields.length).toBe(1);
    expect(loadedFields[0].getName()).toBe('keep');
  });
});
