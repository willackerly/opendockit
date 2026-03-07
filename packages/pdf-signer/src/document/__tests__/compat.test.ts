/**
 * Compatibility tests: verify our wrapper layer produces identical results to pdf-lib.
 *
 * These tests create PDFs via the pdfbox-ts unified API and verify they work correctly.
 * They do NOT compare against direct pdf-lib usage (structural typing makes them identical),
 * but rather ensure the wrapper delegation doesn't break anything.
 */

import { describe, it, expect } from 'vitest';
import {
  PDFDocument,
  rgb,
  cmyk,
  grayscale,
  degrees,
  radians,
  StandardFonts,
  PageSizes,
  ColorTypes,
  RotationTypes,
  ParseSpeeds,
  BlendMode,
  LineCapStyle,
  TextRenderingMode,
  TextAlignment,
  AFRelationship,
} from '../index.js';

describe('document wrapper compatibility', () => {
  describe('PDFDocument create + save round-trip', () => {
    it('should create, add pages, and save', async () => {
      const doc = await PDFDocument.create();
      expect(doc).toBeDefined();

      const page = doc.addPage(PageSizes.Letter);
      expect(page).toBeDefined();
      expect(page.getWidth()).toBe(612);
      expect(page.getHeight()).toBe(792);

      const bytes = await doc.save();
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(0);
    });

    it('should load a saved PDF and read metadata', async () => {
      const doc = await PDFDocument.create();
      doc.setTitle('Test Title');
      doc.setAuthor('Test Author');
      doc.setSubject('Test Subject');
      doc.setCreator('pdfbox-ts compat test');
      doc.addPage();

      const bytes = await doc.save();
      const loaded = await PDFDocument.load(bytes);

      expect(loaded.getTitle()).toBe('Test Title');
      expect(loaded.getAuthor()).toBe('Test Author');
      expect(loaded.getSubject()).toBe('Test Subject');
      expect(loaded.getCreator()).toBe('pdfbox-ts compat test');
      expect(loaded.getPageCount()).toBe(1);
    });
  });

  describe('PDFPage drawing operations', () => {
    it('should draw text with embedded font', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const font = await doc.embedFont(StandardFonts.Helvetica);

      page.drawText('Hello from pdfbox-ts!', {
        x: 50,
        y: 700,
        size: 24,
        font,
        color: rgb(0, 0, 0),
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('should draw rectangles with colors', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();

      page.drawRectangle({
        x: 50,
        y: 600,
        width: 200,
        height: 100,
        color: rgb(0.95, 0.95, 0.95),
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('should draw lines', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();

      page.drawLine({
        start: { x: 50, y: 700 },
        end: { x: 300, y: 700 },
        thickness: 2,
        color: rgb(1, 0, 0),
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });
  });

  describe('PDFFont wrapper', () => {
    it('should measure text width', async () => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);

      expect(font.name).toBe('Helvetica');
      const width = font.widthOfTextAtSize('Hello', 12);
      expect(width).toBeGreaterThan(0);
      expect(font.heightAtSize(12)).toBeGreaterThan(0);
      expect(font.sizeAtHeight(12)).toBeGreaterThan(0);
    });
  });

  describe('PDFForm wrapper', () => {
    it('should access form from loaded document', async () => {
      const tmp = await PDFDocument.create();
      tmp.addPage();
      const bytes = await tmp.save();
      const doc = await PDFDocument.load(bytes);
      const form = doc.getForm();
      expect(form).toBeDefined();
      expect(form.getFields()).toEqual([]);
    });

    it('should create text fields natively', async () => {
      const doc = await PDFDocument.create();
      doc.addPage();
      const form = doc.getForm();
      const field = form.createTextField('test.field');
      expect(field.getName()).toBe('test.field');
    });
  });

  describe('native types', () => {
    it('should create colors correctly', () => {
      const red = rgb(1, 0, 0);
      expect(red.type).toBe(ColorTypes.RGB);
      expect(red.red).toBe(1);
      expect(red.green).toBe(0);
      expect(red.blue).toBe(0);

      const gray = grayscale(0.5);
      expect(gray.type).toBe(ColorTypes.Grayscale);
      expect(gray.gray).toBe(0.5);

      const c = cmyk(0, 1, 1, 0);
      expect(c.type).toBe(ColorTypes.CMYK);
      expect(c.cyan).toBe(0);
      expect(c.magenta).toBe(1);
    });

    it('should create rotations correctly', () => {
      const d = degrees(90);
      expect(d.type).toBe(RotationTypes.Degrees);
      expect(d.angle).toBe(90);

      const r = radians(Math.PI);
      expect(r.type).toBe(RotationTypes.Radians);
      expect(r.angle).toBe(Math.PI);
    });

    it('should have all standard fonts', () => {
      expect(StandardFonts.Helvetica).toBe('Helvetica');
      expect(StandardFonts.TimesRoman).toBe('Times-Roman');
      expect(StandardFonts.Courier).toBe('Courier');
    });

    it('should have page sizes', () => {
      expect(PageSizes.Letter).toEqual([612, 792]);
      expect(PageSizes.A4).toEqual([595.28, 841.89]);
    });

    it('should have option enums', () => {
      expect(ParseSpeeds.Fastest).toBe(Infinity);
      expect(BlendMode.Normal).toBe('Normal');
      expect(LineCapStyle.Butt).toBe(0);
      expect(TextRenderingMode.Fill).toBe(0);
      expect(TextAlignment.Left).toBe(0);
      expect(AFRelationship.Source).toBe('Source');
    });
  });

  describe('multi-page operations', () => {
    it('should copy pages between documents', async () => {
      const tmpSrc = await PDFDocument.create();
      tmpSrc.addPage(PageSizes.Letter);
      tmpSrc.addPage(PageSizes.A4);
      const srcBytes = await tmpSrc.save();
      const src = await PDFDocument.load(srcBytes);

      const tmpDst = await PDFDocument.create();
      tmpDst.addPage();
      const dstBytes = await tmpDst.save();
      const dst = await PDFDocument.load(dstBytes);

      const [copiedPage] = await dst.copyPages(src, [0]);
      dst.addPage(copiedPage);

      expect(dst.getPageCount()).toBe(2); // 1 original + 1 copied
      const page = dst.getPage(1);
      expect(page.getWidth()).toBe(612);
    });

    it('should insert pages at specific index', async () => {
      const doc = await PDFDocument.create();
      doc.addPage(PageSizes.Letter);
      doc.addPage(PageSizes.Letter);
      doc.insertPage(1, PageSizes.A4);

      expect(doc.getPageCount()).toBe(3);
      const middle = doc.getPage(1);
      expect(Math.round(middle.getWidth())).toBe(595);
    });
  });

  describe('context and catalog access', () => {
    it('should expose native context for signer bridge (loaded docs)', async () => {
      // Phase 6: loaded docs are now native — signer uses _nativeCtx directly
      const tmp = await PDFDocument.create();
      tmp.addPage();
      const bytes = await tmp.save();
      const doc = await PDFDocument.load(bytes);

      // Native docs expose _nativeCtx, not pdf-lib context/catalog
      expect(doc._nativeCtx).toBeDefined();
      expect(doc._nativeCtx!.catalog).toBeDefined();
      expect(doc._nativeCtx!.catalogRef).toBeDefined();
    });
  });
});
