/**
 * Phase 5 tests: Native document creation pipeline.
 *
 * Validates that PDFDocument.create() → native mode → save() produces
 * valid PDFs without touching pdf-lib. Tests cover:
 * - Document creation and metadata
 * - Page management (add, insert, remove)
 * - Font embedding (native Type1 standard fonts)
 * - Image embedding (native JPEG + PNG)
 * - Content stream generation
 * - Round-trip: native create → save → load (via pdf-lib) → verify
 * - NativeDocumentContext internals
 * - NativePDFWriter serialization
 */

import { describe, it, expect } from 'vitest';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  cmyk,
  grayscale,
  PageSizes,
  degrees,
} from '../index.js';
import { NativeDocumentContext } from '../NativeDocumentContext.js';
import { NativePDFWriter } from '../NativePDFWriter.js';
import * as pako from 'pako';

// Valid 1x1 red PNG (RGB, 8-bit, correct Adler-32)
const RED_1x1_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65,
  84, 120, 156, 99, 248, 207, 192, 0, 0, 3, 1, 1, 0, 201, 254, 146, 239, 0, 0, 0,
  0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

// Minimal valid JPEG (1x1, RGB)
function createMinimalJpeg(): Uint8Array {
  // SOI + APP0 + SOF0 + SOS + image data + EOI
  // This is the smallest valid JPEG that parsers accept
  return new Uint8Array([
    0xFF, 0xD8, // SOI
    0xFF, 0xE0, 0x00, 0x10, // APP0 marker, length=16
    0x4A, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // JFIF header
    0xFF, 0xDB, 0x00, 0x43, 0x00, // DQT marker, length=67
    // Quantization table (64 entries, all 1 for simplicity)
    ...new Array(64).fill(1),
    0xFF, 0xC0, 0x00, 0x0B, // SOF0 marker, length=11
    0x08, // precision = 8 bits
    0x00, 0x01, // height = 1
    0x00, 0x01, // width = 1
    0x01, // components = 1 (grayscale for simplicity)
    0x01, 0x11, 0x00, // component 1: id=1, h/v sampling=1/1, quant table=0
    0xFF, 0xC4, 0x00, 0x1F, 0x00, // DHT marker, length=31 (DC table 0)
    0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B,
    0xFF, 0xC4, 0x00, 0xB5, 0x10, // DHT marker (AC table 0)
    0x00, 0x02, 0x01, 0x03, 0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
    0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08, 0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0,
    0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
    0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
    0x6A, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7,
    0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5,
    0xC6, 0xC7, 0xC8, 0xC9, 0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
    0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7, 0xF8,
    0xF9, 0xFA,
    0xFF, 0xDA, 0x00, 0x08, // SOS marker, length=8
    0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, // SOS header
    0x7B, 0x40, // Scan data (minimal)
    0xFF, 0xD9, // EOI
  ]);
}

describe('Phase 5: Native document pipeline', () => {
  describe('isNative flag', () => {
    it('create() returns a native document', async () => {
      const doc = await PDFDocument.create();
      expect(doc.isNative).toBe(true);
      expect(doc._nativeCtx).toBeDefined();
    });

    it('load() returns a native document', async () => {
      const tmp = await PDFDocument.create();
      tmp.addPage();
      const bytes = await tmp.save();
      const doc = await PDFDocument.load(bytes);
      expect(doc.isNative).toBe(true);
      expect(doc._nativeCtx).toBeDefined();
    });
  });

  describe('metadata round-trip', () => {
    it('preserves title, author, subject, creator, producer', async () => {
      const doc = await PDFDocument.create();
      doc.setTitle('Native Title');
      doc.setAuthor('Native Author');
      doc.setSubject('Native Subject');
      doc.setCreator('pdfbox-ts Phase 5');
      doc.setKeywords(['native', 'pdf']);
      doc.addPage();

      const bytes = await doc.save();
      const loaded = await PDFDocument.load(bytes);

      expect(loaded.getTitle()).toBe('Native Title');
      expect(loaded.getAuthor()).toBe('Native Author');
      expect(loaded.getSubject()).toBe('Native Subject');
      expect(loaded.getCreator()).toBe('pdfbox-ts Phase 5');
      expect(loaded.getKeywords()).toBe('native, pdf');
    });

    it('has default producer and dates', async () => {
      const doc = await PDFDocument.create();
      doc.addPage();
      expect(doc.getProducer()).toBe('pdfbox-ts');
      expect(doc.getCreationDate()).toBeInstanceOf(Date);
      expect(doc.getModificationDate()).toBeInstanceOf(Date);
    });

    it('setCreationDate / setModificationDate round-trip', async () => {
      const doc = await PDFDocument.create();
      const date = new Date('2024-06-15T12:30:00Z');
      doc.setCreationDate(date);
      doc.setModificationDate(date);
      doc.addPage();

      const bytes = await doc.save();
      const loaded = await PDFDocument.load(bytes);

      const creation = loaded.getCreationDate()!;
      expect(creation.getUTCFullYear()).toBe(2024);
      expect(creation.getUTCMonth()).toBe(5); // June = 5
      expect(creation.getUTCDate()).toBe(15);
    });
  });

  describe('page management', () => {
    it('addPage with Letter size', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage(PageSizes.Letter);

      expect(doc.getPageCount()).toBe(1);
      expect(page.getWidth()).toBe(612);
      expect(page.getHeight()).toBe(792);
    });

    it('addPage with A4 size', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage(PageSizes.A4);

      expect(Math.round(page.getWidth())).toBe(595);
      expect(Math.round(page.getHeight())).toBe(842);
    });

    it('addPage with custom size', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([400, 300]);

      expect(page.getWidth()).toBe(400);
      expect(page.getHeight()).toBe(300);
    });

    it('getPages returns all pages', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([100, 200]);
      doc.addPage([300, 400]);
      doc.addPage([500, 600]);

      expect(doc.getPageCount()).toBe(3);
      const pages = doc.getPages();
      expect(pages.length).toBe(3);
      expect(pages[0].getWidth()).toBe(100);
      expect(pages[2].getWidth()).toBe(500);
    });

    it('getPage by index', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([100, 200]);
      doc.addPage([300, 400]);

      expect(doc.getPage(0).getWidth()).toBe(100);
      expect(doc.getPage(1).getWidth()).toBe(300);
    });

    it('getPage throws for out-of-range index', async () => {
      const doc = await PDFDocument.create();
      doc.addPage();

      expect(() => doc.getPage(5)).toThrow(/out of range/);
    });

    it('getPageIndices returns array of indices', async () => {
      const doc = await PDFDocument.create();
      doc.addPage();
      doc.addPage();
      doc.addPage();

      expect(doc.getPageIndices()).toEqual([0, 1, 2]);
    });

    it('insertPage at specific index', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([100, 100]); // index 0
      doc.addPage([300, 300]); // index 1
      doc.insertPage(1, [200, 200]); // insert at index 1

      expect(doc.getPageCount()).toBe(3);
      expect(doc.getPage(0).getWidth()).toBe(100);
      expect(doc.getPage(1).getWidth()).toBe(200);
      expect(doc.getPage(2).getWidth()).toBe(300);
    });

    it('removePage', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([100, 100]);
      doc.addPage([200, 200]);
      doc.addPage([300, 300]);

      doc.removePage(1); // remove middle

      expect(doc.getPageCount()).toBe(2);
      expect(doc.getPage(0).getWidth()).toBe(100);
      expect(doc.getPage(1).getWidth()).toBe(300);
    });

    it('multi-page document survives save/load', async () => {
      const doc = await PDFDocument.create();
      doc.addPage(PageSizes.Letter);
      doc.addPage(PageSizes.A4);
      doc.addPage([400, 300]);

      const bytes = await doc.save();
      const loaded = await PDFDocument.load(bytes);

      expect(loaded.getPageCount()).toBe(3);
      expect(loaded.getPage(0).getWidth()).toBe(612);
      expect(Math.round(loaded.getPage(1).getWidth())).toBe(595);
      expect(loaded.getPage(2).getWidth()).toBe(400);
    });
  });

  describe('native font embedding', () => {
    it('embedFont creates a native font for standard fonts', async () => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);

      expect(font.name).toBe('Helvetica');
      expect(font._nativeRef).toBeDefined();
      expect(font._nativeRef).toBeDefined();
    });

    it('all 14 standard fonts can be embedded natively', async () => {
      const doc = await PDFDocument.create();
      const fontNames = [
        StandardFonts.Helvetica,
        StandardFonts.HelveticaBold,
        StandardFonts.HelveticaOblique,
        StandardFonts.HelveticaBoldOblique,
        StandardFonts.Courier,
        StandardFonts.CourierBold,
        StandardFonts.CourierOblique,
        StandardFonts.CourierBoldOblique,
        StandardFonts.TimesRoman,
        StandardFonts.TimesRomanBold,
        StandardFonts.TimesRomanItalic,
        StandardFonts.TimesRomanBoldItalic,
        StandardFonts.Symbol,
        StandardFonts.ZapfDingbats,
      ];

      for (const name of fontNames) {
        const font = await doc.embedFont(name);
        expect(font.name).toBe(name);
        expect(font._nativeRef).toBeDefined();
      }
    });

    it('native font has correct measurement methods', async () => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);

      const width = font.widthOfTextAtSize('Hello', 12);
      expect(width).toBeGreaterThan(0);

      const height = font.heightAtSize(12);
      expect(height).toBeGreaterThan(0);

      const size = font.sizeAtHeight(12);
      expect(size).toBeGreaterThan(0);
    });

    it('native font encodeTextToHex produces valid hex', async () => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);

      const hex = font.encodeTextToHex('ABC');
      expect(hex).toBe('414243');
      expect(hex.length % 2).toBe(0);
      expect(/^[0-9A-F]+$/.test(hex)).toBe(true);
    });

    it('embedStandardFont (sync variant)', async () => {
      const doc = await PDFDocument.create();
      const font = doc.embedStandardFont(StandardFonts.Courier);

      expect(font.name).toBe('Courier');
      expect(font._nativeRef).toBeDefined();
    });

    it('non-standard font on native doc throws for invalid bytes', async () => {
      const doc = await PDFDocument.create();
      await expect(doc.embedFont(new Uint8Array([1, 2, 3]))).rejects.toThrow(
        /Invalid TrueType font|Unrecognized font signature/,
      );
    });
  });

  describe('native image embedding', () => {
    it('embedPng creates a native image', async () => {
      const doc = await PDFDocument.create();
      const image = await doc.embedPng(RED_1x1_PNG);

      expect(image.width).toBe(1);
      expect(image.height).toBe(1);
      expect(image._nativeRef).toBeDefined();
      expect(image._nativeRef).toBeDefined();
    });

    it('native image has correct scale/size methods', async () => {
      const doc = await PDFDocument.create();
      const image = await doc.embedPng(RED_1x1_PNG);

      expect(image.size()).toEqual({ width: 1, height: 1 });
      expect(image.scale(50)).toEqual({ width: 50, height: 50 });
      expect(image.scaleToFit(100, 200)).toEqual({ width: 100, height: 100 });
    });

    it('PNG image in PDF survives round-trip', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const image = await doc.embedPng(RED_1x1_PNG);

      page.drawImage(image, { x: 0, y: 0, width: 100, height: 100 });

      const bytes = await doc.save();
      const loaded = await PDFDocument.load(bytes);
      expect(loaded.getPageCount()).toBe(1);
    });

    it('embedJpg creates a native JPEG image', async () => {
      const doc = await PDFDocument.create();
      const jpeg = createMinimalJpeg();
      const image = await doc.embedJpg(jpeg);

      expect(image.width).toBe(1);
      expect(image.height).toBe(1);
      expect(image._nativeRef).toBeDefined();
    });
  });

  describe('NativeDocumentContext internals', () => {
    it('assigns sequential object numbers', () => {
      const ctx = new NativeDocumentContext();
      // Constructor creates catalog (1) and pages (2)
      expect(ctx.objectCount).toBe(3); // 0=free, 1=catalog, 2=pages

      const { pageRef } = ctx.addPage();
      expect(pageRef.objectNumber).toBe(3);
      expect(ctx.objectCount).toBe(4);
    });

    it('enumerateObjects returns sorted entries', () => {
      const ctx = new NativeDocumentContext();
      ctx.addPage();

      const entries = ctx.enumerateObjects();
      const objNums = entries.map(([num]) => num);
      expect(objNums).toEqual([...objNums].sort((a, b) => a - b));
    });

    it('lookup returns registered objects', () => {
      const ctx = new NativeDocumentContext();
      expect(ctx.lookup(1)).toBeDefined(); // catalog
      expect(ctx.lookup(2)).toBeDefined(); // pages
      expect(ctx.lookup(999)).toBeUndefined();
    });

    it('embedStandardFont creates Type1 font dict', () => {
      const ctx = new NativeDocumentContext();
      const ref = ctx.embedStandardFont('Helvetica');
      expect(ref.objectNumber).toBeGreaterThan(2);

      const dict = ctx.lookup(ref.objectNumber);
      expect(dict).toBeDefined();
    });

    it('createGraphicsState creates ExtGState dict', () => {
      const ctx = new NativeDocumentContext();
      const ref = ctx.createGraphicsState({ fillOpacity: 0.5 });
      expect(ref.objectNumber).toBeGreaterThan(2);
    });

    it('metadata sets info dict values', () => {
      const ctx = new NativeDocumentContext();
      ctx.setTitle('Test');
      ctx.setAuthor('Author');

      expect(ctx.getInfoString('Title')).toBe('Test');
      expect(ctx.getInfoString('Author')).toBe('Author');
      expect(ctx.infoRef).toBeDefined();
    });
  });

  describe('NativePDFWriter serialization', () => {
    it('produces valid PDF header', () => {
      const ctx = new NativeDocumentContext();
      ctx.addPage();
      const bytes = NativePDFWriter.write(ctx);
      const text = new TextDecoder().decode(bytes.slice(0, 10));
      expect(text).toContain('%PDF-1.7');
    });

    it('produces valid xref and trailer', () => {
      const ctx = new NativeDocumentContext();
      ctx.addPage();
      const bytes = NativePDFWriter.write(ctx);
      const text = new TextDecoder().decode(bytes);

      expect(text).toContain('xref');
      expect(text).toContain('trailer');
      expect(text).toContain('startxref');
      expect(text).toContain('%%EOF');
      expect(text).toContain('/Root');
      expect(text).toContain('/Size');
    });

    it('includes all registered objects', () => {
      const ctx = new NativeDocumentContext();
      ctx.addPage();
      ctx.addPage();
      ctx.embedStandardFont('Courier');

      const bytes = NativePDFWriter.write(ctx);
      const text = new TextDecoder().decode(bytes);

      // Should have obj markers for each registered object
      expect(text).toMatch(/1 0 obj/);
      expect(text).toMatch(/2 0 obj/);
      expect(text).toMatch(/3 0 obj/);
    });

    it('output can be parsed by pdf-lib', async () => {
      const ctx = new NativeDocumentContext();
      ctx.setTitle('Writer Test');
      ctx.addPage(612, 792);

      const bytes = NativePDFWriter.write(ctx);
      const doc = await PDFDocument.load(bytes);

      expect(doc.getPageCount()).toBe(1);
      expect(doc.getTitle()).toBe('Writer Test');
    });
  });

  describe('full pipeline: create → draw → save → load', () => {
    it('text + shapes document round-trips correctly', async () => {
      const doc = await PDFDocument.create();
      doc.setTitle('Full Pipeline Test');
      const page = doc.addPage(PageSizes.Letter);
      const font = await doc.embedFont(StandardFonts.Helvetica);

      page.drawRectangle({
        x: 50,
        y: 600,
        width: 500,
        height: 150,
        color: rgb(0.95, 0.95, 1),
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });

      page.drawText('Native Document', {
        x: 60,
        y: 720,
        size: 24,
        font,
        color: rgb(0, 0, 0.5),
      });

      page.drawLine({
        start: { x: 60, y: 710 },
        end: { x: 540, y: 710 },
        thickness: 1,
        color: grayscale(0.5),
      });

      page.drawText('Created entirely without pdf-lib!', {
        x: 60,
        y: 680,
        size: 12,
        font,
      });

      page.drawEllipse({
        x: 300,
        y: 400,
        xScale: 50,
        yScale: 30,
        color: cmyk(0, 1, 1, 0),
      });

      const bytes = await doc.save();
      const loaded = await PDFDocument.load(bytes);

      expect(loaded.getPageCount()).toBe(1);
      expect(loaded.getTitle()).toBe('Full Pipeline Test');
      expect(loaded.getPage(0).getWidth()).toBe(612);
    });

    it('multi-page with images round-trips', async () => {
      const doc = await PDFDocument.create();
      const image = await doc.embedPng(RED_1x1_PNG);

      const page1 = doc.addPage();
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      page1.drawText('Page 1', { x: 50, y: 700, size: 24, font });
      page1.drawImage(image, { x: 50, y: 500, width: 100, height: 100 });

      const page2 = doc.addPage(PageSizes.A4);
      page2.drawText('Page 2', { x: 50, y: 700, size: 24, font });

      const bytes = await doc.save();
      const loaded = await PDFDocument.load(bytes);

      expect(loaded.getPageCount()).toBe(2);
      expect(loaded.getPage(0).getWidth()).toBe(612); // Letter
      expect(Math.round(loaded.getPage(1).getWidth())).toBe(595); // A4
    });

    it('multiple fonts on same page', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();

      const fonts = await Promise.all([
        doc.embedFont(StandardFonts.Helvetica),
        doc.embedFont(StandardFonts.TimesRoman),
        doc.embedFont(StandardFonts.Courier),
      ]);

      let y = 700;
      for (const font of fonts) {
        page.drawText(`${font.name} text`, { x: 50, y, size: 14, font });
        y -= 30;
      }

      const bytes = await doc.save();
      const loaded = await PDFDocument.load(bytes);
      expect(loaded.getPageCount()).toBe(1);
    });

    it('graphics state (opacity/blend mode) round-trips', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();

      page.drawRectangle({
        x: 50,
        y: 600,
        width: 200,
        height: 100,
        color: rgb(1, 0, 0),
        opacity: 0.5,
      });

      const font = await doc.embedFont(StandardFonts.Helvetica);
      page.drawText('Semi-transparent', {
        x: 50,
        y: 500,
        size: 24,
        font,
        opacity: 0.3,
      });

      const bytes = await doc.save();
      const loaded = await PDFDocument.load(bytes);
      expect(loaded.getPageCount()).toBe(1);
    });

    it('setFont + drawText without explicit font option', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const font = await doc.embedFont(StandardFonts.Courier);

      page.setFont(font);
      page.drawText('Using page default font', { x: 50, y: 700, size: 14 });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('saveAsBase64 produces valid base64', async () => {
      const doc = await PDFDocument.create();
      doc.addPage();
      const b64 = await doc.saveAsBase64();

      expect(typeof b64).toBe('string');
      expect(b64.length).toBeGreaterThan(0);
      // Should be valid base64
      const decoded = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const text = new TextDecoder().decode(decoded.slice(0, 10));
      expect(text).toContain('%PDF');
    });
  });

  describe('legacy-only methods throw on native docs', () => {
    it('context throws on native docs', async () => {
      const doc = await PDFDocument.create();
      expect(() => doc.context).toThrow(/not available/);
    });

    it('catalog throws on native docs', async () => {
      const doc = await PDFDocument.create();
      expect(() => doc.catalog).toThrow(/not available/);
    });

    it('getForm returns native form on native docs', async () => {
      const doc = await PDFDocument.create();
      const form = doc.getForm();
      expect(form).toBeDefined();
      expect(form.getFields()).toEqual([]);
    });

    it('copyPages works on native docs', async () => {
      const doc = await PDFDocument.create();
      const src = await PDFDocument.create();
      src.addPage();
      const [copied] = await doc.copyPages(src, [0]);
      expect(copied).toBeDefined();
      expect(copied._nativePageDict).toBeDefined();
    });
  });

  describe('page setters in native mode', () => {
    it('setSize updates page dimensions', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage(PageSizes.Letter);

      page.setSize(400, 300);
      expect(page.getWidth()).toBe(400);
      expect(page.getHeight()).toBe(300);
    });

    it('setFont + setFontSize + setFontColor', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const font = await doc.embedFont(StandardFonts.Helvetica);

      page.setFont(font);
      page.setFontSize(18);
      page.setFontColor(rgb(1, 0, 0));

      page.drawText('Styled text', { x: 50, y: 700 });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });
  });
});
