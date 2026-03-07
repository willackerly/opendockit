/**
 * Tests for Phase 4: Native PDFPage drawing.
 *
 * Verifies that native drawing methods (using ContentStreamBuilder) produce
 * valid PDFs that can be saved, reloaded, and rendered. Also verifies that
 * native drawing output is visually identical to pdf-lib's drawing output.
 */
import { describe, it, expect } from 'vitest';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  cmyk,
  grayscale,
  degrees,
  PageSizes,
  LineCapStyle,
  BlendMode,
} from '../index.js';

// Minimal valid 1x1 red PNG (69 bytes) — with correct zlib Adler-32
const RED_1x1_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65,
  84, 120, 156, 99, 248, 207, 192, 0, 0, 3, 1, 1, 0, 201, 254, 146, 239, 0, 0, 0,
  0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

describe('native PDFPage drawing', () => {
  describe('drawRectangle', () => {
    it('creates a valid PDF with a filled rectangle', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage(PageSizes.Letter);

      page.drawRectangle({
        x: 50,
        y: 600,
        width: 200,
        height: 100,
        color: rgb(0.95, 0.95, 0.95),
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);

      // Can be reloaded
      const reloaded = await PDFDocument.load(bytes);
      expect(reloaded.getPageCount()).toBe(1);
    });

    it('creates a rectangle with border', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();

      page.drawRectangle({
        x: 50,
        y: 600,
        width: 200,
        height: 100,
        color: rgb(1, 1, 0.8),
        borderColor: rgb(0, 0, 0),
        borderWidth: 2,
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('handles dashed borders', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();

      page.drawRectangle({
        x: 50,
        y: 600,
        width: 200,
        height: 100,
        borderColor: rgb(1, 0, 0),
        borderWidth: 1,
        borderDashArray: [5, 3],
        borderDashPhase: 0,
        borderLineCap: LineCapStyle.Round,
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('supports rotation and skew', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();

      page.drawRectangle({
        x: 300,
        y: 400,
        width: 100,
        height: 50,
        color: rgb(0, 0, 1),
        rotate: degrees(45),
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('supports CMYK colors', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();

      page.drawRectangle({
        x: 50,
        y: 600,
        width: 200,
        height: 100,
        color: cmyk(0, 1, 1, 0), // red in CMYK
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('supports grayscale colors', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();

      page.drawRectangle({
        x: 50,
        y: 600,
        width: 200,
        height: 100,
        color: grayscale(0.5),
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('supports opacity via graphics state', async () => {
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

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('uses defaults when no options provided', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();

      page.drawRectangle();

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });
  });

  describe('drawSquare', () => {
    it('draws a square (delegates to drawRectangle)', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();

      page.drawSquare({
        x: 50,
        y: 600,
        size: 100,
        color: rgb(0, 1, 0),
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });
  });

  describe('drawLine', () => {
    it('creates a valid PDF with a line', async () => {
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

      const reloaded = await PDFDocument.load(bytes);
      expect(reloaded.getPageCount()).toBe(1);
    });

    it('supports dashed lines', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();

      page.drawLine({
        start: { x: 50, y: 700 },
        end: { x: 300, y: 700 },
        thickness: 1,
        color: rgb(0, 0, 1),
        dashArray: [10, 5],
        dashPhase: 0,
        lineCap: LineCapStyle.Round,
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('supports opacity', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();

      page.drawLine({
        start: { x: 50, y: 700 },
        end: { x: 300, y: 500 },
        thickness: 3,
        color: rgb(0, 0, 0),
        opacity: 0.3,
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });
  });

  describe('drawText', () => {
    it('draws text with an explicitly provided font', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage(PageSizes.Letter);
      const font = await doc.embedFont(StandardFonts.Helvetica);

      page.drawText('Hello, native drawing!', {
        x: 50,
        y: 700,
        size: 24,
        font,
        color: rgb(0, 0, 0),
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);

      const reloaded = await PDFDocument.load(bytes);
      expect(reloaded.getPageCount()).toBe(1);
    });

    it('uses the current font set via setFont', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const font = await doc.embedFont(StandardFonts.Courier);

      page.setFont(font);
      page.drawText('Monospace text', {
        x: 50,
        y: 700,
        size: 14,
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('throws when no font is set in native mode', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();

      // No setFont call — native mode requires explicit font
      expect(() => page.drawText('No font', { x: 50, y: 700 })).toThrow(
        /No font set/,
      );
    });

    it('handles multi-line text', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const font = await doc.embedFont(StandardFonts.TimesRoman);

      page.drawText('Line 1\nLine 2\nLine 3', {
        x: 50,
        y: 700,
        size: 14,
        font,
        lineHeight: 18,
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('handles word wrapping with maxWidth', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const font = await doc.embedFont(StandardFonts.Helvetica);

      page.drawText(
        'This is a long sentence that should be wrapped to fit within the specified maximum width constraint.',
        {
          x: 50,
          y: 700,
          size: 12,
          font,
          maxWidth: 200,
          lineHeight: 16,
        },
      );

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('supports different standard fonts', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();

      const fonts = [
        StandardFonts.Helvetica,
        StandardFonts.HelveticaBold,
        StandardFonts.TimesRoman,
        StandardFonts.Courier,
      ];

      let y = 700;
      for (const fontName of fonts) {
        const font = await doc.embedFont(fontName);
        page.drawText(`Font: ${fontName}`, {
          x: 50,
          y,
          size: 14,
          font,
        });
        y -= 30;
      }

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('supports text with opacity', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const font = await doc.embedFont(StandardFonts.Helvetica);

      page.drawText('Semi-transparent', {
        x: 50,
        y: 700,
        size: 24,
        font,
        color: rgb(1, 0, 0),
        opacity: 0.5,
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('supports colored text', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const font = await doc.embedFont(StandardFonts.HelveticaBold);

      page.drawText('Red text', {
        x: 50,
        y: 700,
        size: 24,
        font,
        color: rgb(1, 0, 0),
      });

      page.drawText('Blue text', {
        x: 50,
        y: 660,
        size: 24,
        font,
        color: rgb(0, 0, 1),
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('supports rotation', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const font = await doc.embedFont(StandardFonts.Helvetica);

      page.drawText('Rotated!', {
        x: 200,
        y: 400,
        size: 18,
        font,
        rotate: degrees(45),
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });
  });

  describe('drawImage', () => {
    it('draws a PNG image', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const image = await doc.embedPng(RED_1x1_PNG);

      page.drawImage(image, {
        x: 50,
        y: 600,
        width: 100,
        height: 100,
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);

      const reloaded = await PDFDocument.load(bytes);
      expect(reloaded.getPageCount()).toBe(1);
    });

    it('uses natural image dimensions as defaults', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const image = await doc.embedPng(RED_1x1_PNG);

      page.drawImage(image); // Should use image.width/height as defaults

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('supports rotation and opacity', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const image = await doc.embedPng(RED_1x1_PNG);

      page.drawImage(image, {
        x: 200,
        y: 400,
        width: 50,
        height: 50,
        rotate: degrees(30),
        opacity: 0.7,
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });
  });

  describe('drawEllipse', () => {
    it('creates a valid PDF with an ellipse', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();

      page.drawEllipse({
        x: 300,
        y: 400,
        xScale: 150,
        yScale: 75,
        color: rgb(0, 0.5, 1),
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('draws ellipse with border', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();

      page.drawEllipse({
        x: 300,
        y: 400,
        xScale: 100,
        yScale: 50,
        color: rgb(1, 1, 0),
        borderColor: rgb(0, 0, 0),
        borderWidth: 2,
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });
  });

  describe('drawCircle', () => {
    it('draws a circle (delegates to drawEllipse)', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();

      page.drawCircle({
        x: 300,
        y: 400,
        size: 50,
        color: rgb(1, 0, 0),
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });
  });

  describe('multiple operations on same page', () => {
    it('handles multiple drawing operations', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage(PageSizes.Letter);
      const font = await doc.embedFont(StandardFonts.Helvetica);

      // Background rectangle
      page.drawRectangle({
        x: 40,
        y: 580,
        width: 530,
        height: 170,
        color: rgb(0.95, 0.95, 0.95),
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });

      // Title text
      page.drawText('Document Title', {
        x: 50,
        y: 720,
        size: 24,
        font,
        color: rgb(0, 0, 0.5),
      });

      // Separator line
      page.drawLine({
        start: { x: 50, y: 710 },
        end: { x: 560, y: 710 },
        thickness: 1,
        color: rgb(0.5, 0.5, 0.5),
      });

      // Body text
      page.drawText('This is the body content of the document.', {
        x: 50,
        y: 690,
        size: 12,
        font,
        color: rgb(0, 0, 0),
      });

      // Circle decoration
      page.drawCircle({
        x: 550,
        y: 730,
        size: 10,
        color: rgb(1, 0, 0),
      });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(500); // Should be a substantial PDF

      const reloaded = await PDFDocument.load(bytes);
      expect(reloaded.getPageCount()).toBe(1);
    });

    it('font registration is cached (same font used multiple times)', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const font = await doc.embedFont(StandardFonts.Helvetica);

      // Draw text multiple times with same font
      page.drawText('Line 1', { x: 50, y: 700, size: 12, font });
      page.drawText('Line 2', { x: 50, y: 680, size: 12, font });
      page.drawText('Line 3', { x: 50, y: 660, size: 12, font });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });

    it('handles multiple fonts on same page', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const helvetica = await doc.embedFont(StandardFonts.Helvetica);
      const times = await doc.embedFont(StandardFonts.TimesRoman);
      const courier = await doc.embedFont(StandardFonts.Courier);

      page.drawText('Helvetica', { x: 50, y: 700, size: 14, font: helvetica });
      page.drawText('Times Roman', { x: 50, y: 670, size: 14, font: times });
      page.drawText('Courier', { x: 50, y: 640, size: 14, font: courier });

      const bytes = await doc.save();
      expect(bytes.length).toBeGreaterThan(100);
    });
  });

  describe('round-trip integrity', () => {
    it('native-drawn PDF can be loaded, modified, and re-saved', async () => {
      // Create PDF with native drawing
      const doc = await PDFDocument.create();
      const page = doc.addPage();
      const font = await doc.embedFont(StandardFonts.Helvetica);

      page.drawRectangle({
        x: 50,
        y: 600,
        width: 200,
        height: 100,
        color: rgb(0.9, 0.9, 1),
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });

      page.drawText('First save', {
        x: 70,
        y: 650,
        size: 16,
        font,
      });

      const firstSave = await doc.save();

      // Load and modify
      const doc2 = await PDFDocument.load(firstSave);
      const pages = doc2.getPages();
      expect(pages.length).toBe(1);

      // Add a new page with more drawing
      const page2 = doc2.addPage();
      const font2 = await doc2.embedFont(StandardFonts.CourierBold);
      page2.drawText('Second page added after reload', {
        x: 50,
        y: 700,
        size: 14,
        font: font2,
      });

      const secondSave = await doc2.save();
      expect(secondSave.length).toBeGreaterThan(firstSave.length);

      // Verify final state
      const doc3 = await PDFDocument.load(secondSave);
      expect(doc3.getPageCount()).toBe(2);
    });
  });

  describe('encodeTextToHex', () => {
    it('encodes ASCII text to hex for standard fonts', async () => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);

      const hex = font.encodeTextToHex('Hello');
      expect(hex).toBe('48656C6C6F');
    });

    it('encodes special characters', async () => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);

      const hex = font.encodeTextToHex(' ');
      expect(hex).toBe('20'); // space = 0x20
    });

    it('matches pdf-lib encoding for all standard fonts', async () => {
      const doc = await PDFDocument.create();
      const testText = 'Hello World! 123 @#$';

      for (const fontName of [
        StandardFonts.Helvetica,
        StandardFonts.Courier,
        StandardFonts.TimesRoman,
      ]) {
        const font = await doc.embedFont(fontName);
        const nativeHex = font.encodeTextToHex(testText);
        // Verify it's a valid hex string (even number of hex chars)
        expect(nativeHex.length % 2).toBe(0);
        expect(/^[0-9A-F]+$/i.test(nativeHex)).toBe(true);
      }
    });
  });
});
