/**
 * Visual rendering tests for Phase 4: Native PDFPage drawing.
 *
 * Creates PDFs using native drawing methods, renders them with pdftoppm,
 * and verifies they render correctly via pixel-diff against reference snapshots.
 *
 * Gated by PDFBOX_TS_E2E_VISUAL=1 (uses pdftoppm + pixelmatch).
 */
import { describe, it, expect } from 'vitest';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  grayscale,
  degrees,
  PageSizes,
} from '../index.js';
import { PNG } from 'pngjs';
import {
  isPdftoppmAvailable,
  renderPdfPage,
  compareSnapshots,
  snapshotPath,
  readSnapshot,
  updateSnapshot,
  writeDiff,
  isUpdateMode,
} from '../../testing/visual-test-helpers.js';

// Minimal valid 1x1 red PNG (correct zlib Adler-32)
const RED_1x1_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65,
  84, 120, 156, 99, 248, 207, 192, 0, 0, 3, 1, 1, 0, 201, 254, 146, 239, 0, 0, 0,
  0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

const shouldRun =
  process.env.PDFBOX_TS_E2E_VISUAL === '1' && isPdftoppmAvailable();

describe.skipIf(!shouldRun)(
  'native drawing visual rendering',
  () => {
    it('native-drawn composite page renders correctly', async () => {
      const testName = 'native-drawing-composite';
      const doc = await PDFDocument.create();
      const page = doc.addPage(PageSizes.Letter);

      const helvetica = await doc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
      const times = await doc.embedFont(StandardFonts.TimesRoman);

      // Background
      page.drawRectangle({
        x: 30,
        y: 30,
        width: 552,
        height: 732,
        color: rgb(0.98, 0.98, 1),
        borderColor: rgb(0.5, 0.5, 0.5),
        borderWidth: 1,
      });

      // Title
      page.drawText('Native Drawing Test', {
        x: 50,
        y: 730,
        size: 28,
        font: helveticaBold,
        color: rgb(0, 0, 0.6),
      });

      // Separator
      page.drawLine({
        start: { x: 50, y: 720 },
        end: { x: 562, y: 720 },
        thickness: 2,
        color: rgb(0.3, 0.3, 0.3),
      });

      // Body text
      page.drawText(
        'This PDF was drawn entirely using native ContentStreamBuilder\n' +
          'operators — no pdf-lib drawing API was used for these shapes.',
        {
          x: 50,
          y: 695,
          size: 12,
          font: helvetica,
          lineHeight: 18,
        },
      );

      // Colored rectangles
      page.drawRectangle({
        x: 50,
        y: 580,
        width: 120,
        height: 80,
        color: rgb(1, 0.2, 0.2),
      });
      page.drawRectangle({
        x: 200,
        y: 580,
        width: 120,
        height: 80,
        color: rgb(0.2, 0.8, 0.2),
      });
      page.drawRectangle({
        x: 350,
        y: 580,
        width: 120,
        height: 80,
        color: rgb(0.2, 0.2, 1),
      });

      // Labels
      page.drawText('Red', {
        x: 90,
        y: 610,
        size: 16,
        font: helveticaBold,
        color: rgb(1, 1, 1),
      });
      page.drawText('Green', {
        x: 230,
        y: 610,
        size: 16,
        font: helveticaBold,
        color: rgb(1, 1, 1),
      });
      page.drawText('Blue', {
        x: 380,
        y: 610,
        size: 16,
        font: helveticaBold,
        color: rgb(1, 1, 1),
      });

      // Circles
      page.drawCircle({
        x: 110,
        y: 490,
        size: 40,
        color: rgb(1, 0.8, 0),
        borderColor: rgb(0, 0, 0),
        borderWidth: 2,
      });

      page.drawCircle({
        x: 260,
        y: 490,
        size: 40,
        color: rgb(0.6, 0, 0.8),
        borderColor: rgb(0, 0, 0),
        borderWidth: 2,
      });

      // Ellipse
      page.drawEllipse({
        x: 420,
        y: 490,
        xScale: 60,
        yScale: 30,
        color: rgb(0, 0.7, 0.7),
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });

      // Times Roman text
      page.drawText('Times Roman — serif font rendering', {
        x: 50,
        y: 420,
        size: 14,
        font: times,
        color: grayscale(0.3),
      });

      // Dashed border rectangle
      page.drawRectangle({
        x: 50,
        y: 350,
        width: 220,
        height: 50,
        borderColor: rgb(1, 0, 0),
        borderWidth: 2,
        borderDashArray: [8, 4],
      });

      page.drawText('Dashed border', {
        x: 100,
        y: 370,
        size: 12,
        font: helvetica,
      });

      // Image
      const image = await doc.embedPng(RED_1x1_PNG);
      page.drawImage(image, {
        x: 350,
        y: 350,
        width: 50,
        height: 50,
      });
      page.drawText('Embedded PNG', {
        x: 350,
        y: 335,
        size: 10,
        font: helvetica,
        color: grayscale(0.5),
      });

      // Rotated rectangle
      page.drawRectangle({
        x: 200,
        y: 250,
        width: 100,
        height: 60,
        color: rgb(0.9, 0.7, 0.3),
        rotate: degrees(15),
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });

      const bytes = await doc.save();
      const rendered = renderPdfPage(bytes, 1, 150);

      if (isUpdateMode()) {
        updateSnapshot(testName, rendered);
      } else {
        const reference = readSnapshot(testName);
        if (!reference) {
          updateSnapshot(testName, rendered);
          return;
        }
        const result = compareSnapshots(rendered, reference, 0.1, 1.0);
        if (!result.match) {
          writeDiff(testName, result.diffPng!);
          expect.fail(
            `Visual mismatch: ${result.mismatchPercent.toFixed(2)}% pixels differ (threshold: 1.0%)`,
          );
        }
      }
    });

    // -----------------------------------------------------------------
    // Page manipulation visual tests (no snapshots — pixel assertions)
    // -----------------------------------------------------------------

    it('removePage removes correct page from rendered output', async () => {
      // Create 3 pages with distinct full-page background colors
      const doc = await PDFDocument.create();
      const helvetica = await doc.embedFont(StandardFonts.Helvetica);

      // Page 0: red background
      const p0 = doc.addPage([200, 200]);
      p0.drawRectangle({ x: 0, y: 0, width: 200, height: 200, color: rgb(1, 0, 0) });
      p0.drawText('PAGE-A', { x: 50, y: 90, size: 20, font: helvetica, color: rgb(1, 1, 1) });

      // Page 1: green background (will be removed)
      const p1 = doc.addPage([200, 200]);
      p1.drawRectangle({ x: 0, y: 0, width: 200, height: 200, color: rgb(0, 1, 0) });
      p1.drawText('PAGE-B', { x: 50, y: 90, size: 20, font: helvetica, color: rgb(1, 1, 1) });

      // Page 2: blue background
      const p2 = doc.addPage([200, 200]);
      p2.drawRectangle({ x: 0, y: 0, width: 200, height: 200, color: rgb(0, 0, 1) });
      p2.drawText('PAGE-C', { x: 50, y: 90, size: 20, font: helvetica, color: rgb(1, 1, 1) });

      // Remove the green page
      doc.removePage(1);
      const bytes = await doc.save();

      // Render page 1 (should be blue, not green)
      const page1Png = renderPdfPage(bytes, 1, 72);
      const page2Png = renderPdfPage(bytes, 2, 72);

      // Parse and check center pixel of page 1 — should be red
      const img1 = PNG.sync.read(page1Png);
      const cx1 = Math.floor(img1.width / 2);
      const cy1 = Math.floor(img1.height / 2);
      const idx1 = (cy1 * img1.width + cx1) * 4;
      expect(img1.data[idx1]).toBeGreaterThan(200);     // R high
      expect(img1.data[idx1 + 1]).toBeLessThan(50);     // G low
      expect(img1.data[idx1 + 2]).toBeLessThan(50);     // B low

      // Center pixel of page 2 — should be blue
      const img2 = PNG.sync.read(page2Png);
      const cx2 = Math.floor(img2.width / 2);
      const cy2 = Math.floor(img2.height / 2);
      const idx2 = (cy2 * img2.width + cx2) * 4;
      expect(img2.data[idx2]).toBeLessThan(50);          // R low
      expect(img2.data[idx2 + 1]).toBeLessThan(50);      // G low
      expect(img2.data[idx2 + 2]).toBeGreaterThan(200);  // B high
    });

    it('insertPage places page at correct visual position', async () => {
      const doc = await PDFDocument.create();
      const helvetica = await doc.embedFont(StandardFonts.Helvetica);

      // Page 0: red
      const p0 = doc.addPage([200, 200]);
      p0.drawRectangle({ x: 0, y: 0, width: 200, height: 200, color: rgb(1, 0, 0) });
      p0.drawText('RED', { x: 70, y: 90, size: 20, font: helvetica, color: rgb(1, 1, 1) });

      // Page 1: blue
      const p1 = doc.addPage([200, 200]);
      p1.drawRectangle({ x: 0, y: 0, width: 200, height: 200, color: rgb(0, 0, 1) });
      p1.drawText('BLUE', { x: 60, y: 90, size: 20, font: helvetica, color: rgb(1, 1, 1) });

      // Insert green page at index 1 (between red and blue)
      const inserted = doc.insertPage(1, [200, 200]);
      inserted.drawRectangle({ x: 0, y: 0, width: 200, height: 200, color: rgb(0, 1, 0) });
      inserted.drawText('GREEN', { x: 50, y: 90, size: 20, font: helvetica, color: rgb(1, 1, 1) });

      const bytes = await doc.save();

      // Page 2 should be green (inserted) — sample top-left corner away from text
      const page2Png = renderPdfPage(bytes, 2, 72);
      const img = PNG.sync.read(page2Png);
      const idx = (5 * img.width + 5) * 4; // pixel (5,5) — clear of text
      expect(img.data[idx]).toBeLessThan(50);          // R low
      expect(img.data[idx + 1]).toBeGreaterThan(200);  // G high
      expect(img.data[idx + 2]).toBeLessThan(50);       // B low

      // Page 3 should be blue (pushed to end) — sample top-left corner
      const page3Png = renderPdfPage(bytes, 3, 72);
      const img3 = PNG.sync.read(page3Png);
      const idx3 = (5 * img3.width + 5) * 4;
      expect(img3.data[idx3]).toBeLessThan(50);
      expect(img3.data[idx3 + 1]).toBeLessThan(50);
      expect(img3.data[idx3 + 2]).toBeGreaterThan(200);  // B high
    });
  },
);
