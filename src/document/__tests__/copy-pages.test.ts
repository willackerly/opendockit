/**
 * Tests for copyPages() — deep-cloning pages between PDF documents.
 *
 * Covers:
 *   - Single page copy
 *   - Multi-page copy
 *   - Copy pages with content (text, images, fonts)
 *   - Structural verification (MediaBox, Contents, Resources)
 *   - Round-trip: copy → save → load → verify
 *   - Out-of-bounds index errors
 *   - Copy from loaded document (not just created)
 *   - Page independence (modifying copy doesn't affect source)
 */

import { describe, it, expect } from 'vitest';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PageSizes,
} from '../index.js';
import {
  COSDictionary,
  COSArray,
  COSObjectReference,
  COSName,
} from '../../pdfbox/cos/COSTypes.js';

// Valid 1x1 red PNG (RGB, 8-bit, correct Adler-32)
const RED_1x1_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65,
  84, 120, 156, 99, 248, 207, 192, 0, 0, 3, 1, 1, 0, 201, 254, 146, 239, 0, 0, 0,
  0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

describe('copyPages()', () => {
  describe('basic copy operations', () => {
    it('copies a single page from one doc to another', async () => {
      const src = await PDFDocument.create();
      src.addPage([400, 300]);

      const dst = await PDFDocument.create();
      const [copied] = await dst.copyPages(src, [0]);

      expect(copied).toBeDefined();
      expect(copied._nativePageDict).toBeInstanceOf(COSDictionary);
      expect(copied._nativePageRef).toBeInstanceOf(COSObjectReference);

      // Page is not yet in dst
      expect(dst.getPageCount()).toBe(0);

      // Add it
      dst.addPage(copied);
      expect(dst.getPageCount()).toBe(1);
      expect(dst.getPage(0).getWidth()).toBe(400);
      expect(dst.getPage(0).getHeight()).toBe(300);
    });

    it('copies multiple pages', async () => {
      const src = await PDFDocument.create();
      src.addPage([100, 200]);
      src.addPage([300, 400]);
      src.addPage([500, 600]);

      const dst = await PDFDocument.create();
      const copied = await dst.copyPages(src, [0, 1, 2]);

      expect(copied.length).toBe(3);

      for (const page of copied) {
        dst.addPage(page);
      }
      expect(dst.getPageCount()).toBe(3);
      expect(dst.getPage(0).getWidth()).toBe(100);
      expect(dst.getPage(1).getWidth()).toBe(300);
      expect(dst.getPage(2).getWidth()).toBe(500);
    });

    it('copies specific pages by index', async () => {
      const src = await PDFDocument.create();
      src.addPage([100, 200]); // index 0
      src.addPage([300, 400]); // index 1
      src.addPage([500, 600]); // index 2

      const dst = await PDFDocument.create();
      const [page2] = await dst.copyPages(src, [2]);
      dst.addPage(page2);

      expect(dst.getPageCount()).toBe(1);
      expect(dst.getPage(0).getWidth()).toBe(500);
      expect(dst.getPage(0).getHeight()).toBe(600);
    });

    it('copies pages in reverse order', async () => {
      const src = await PDFDocument.create();
      src.addPage([100, 200]);
      src.addPage([300, 400]);

      const dst = await PDFDocument.create();
      const copied = await dst.copyPages(src, [1, 0]);

      dst.addPage(copied[0]);
      dst.addPage(copied[1]);

      expect(dst.getPage(0).getWidth()).toBe(300);
      expect(dst.getPage(1).getWidth()).toBe(100);
    });

    it('copies same page index multiple times', async () => {
      const src = await PDFDocument.create();
      src.addPage([400, 300]);

      const dst = await PDFDocument.create();
      const copied = await dst.copyPages(src, [0, 0]);

      expect(copied.length).toBe(2);
      dst.addPage(copied[0]);
      dst.addPage(copied[1]);

      expect(dst.getPageCount()).toBe(2);
      expect(dst.getPage(0).getWidth()).toBe(400);
      expect(dst.getPage(1).getWidth()).toBe(400);
    });
  });

  describe('content preservation', () => {
    it('copies page with text content', async () => {
      const src = await PDFDocument.create();
      const page = src.addPage();
      const font = await src.embedFont(StandardFonts.Helvetica);
      page.drawText('Hello World', { x: 50, y: 700, size: 24, font });

      const dst = await PDFDocument.create();
      const [copied] = await dst.copyPages(src, [0]);
      dst.addPage(copied);

      // Save and reload to verify structural integrity
      const bytes = await dst.save();
      const loaded = await PDFDocument.load(bytes);
      expect(loaded.getPageCount()).toBe(1);
      expect(loaded.getPage(0).getWidth()).toBe(612); // Letter default
    });

    it('copies page with embedded image', async () => {
      const src = await PDFDocument.create();
      const page = src.addPage();
      const image = await src.embedPng(RED_1x1_PNG);
      page.drawImage(image, { x: 50, y: 500, width: 100, height: 100 });

      const dst = await PDFDocument.create();
      const [copied] = await dst.copyPages(src, [0]);
      dst.addPage(copied);

      const bytes = await dst.save();
      const loaded = await PDFDocument.load(bytes);
      expect(loaded.getPageCount()).toBe(1);
    });

    it('copies page with multiple fonts', async () => {
      const src = await PDFDocument.create();
      const page = src.addPage();
      const helv = await src.embedFont(StandardFonts.Helvetica);
      const courier = await src.embedFont(StandardFonts.Courier);

      page.drawText('Helvetica', { x: 50, y: 700, size: 18, font: helv });
      page.drawText('Courier', { x: 50, y: 660, size: 18, font: courier });

      const dst = await PDFDocument.create();
      const [copied] = await dst.copyPages(src, [0]);
      dst.addPage(copied);

      const bytes = await dst.save();
      const loaded = await PDFDocument.load(bytes);
      expect(loaded.getPageCount()).toBe(1);
    });

    it('copies page with shapes', async () => {
      const src = await PDFDocument.create();
      const page = src.addPage();
      page.drawRectangle({
        x: 50, y: 600, width: 200, height: 100,
        color: rgb(1, 0, 0),
        borderColor: rgb(0, 0, 0),
        borderWidth: 2,
      });
      page.drawLine({
        start: { x: 50, y: 500 },
        end: { x: 250, y: 500 },
        thickness: 3,
      });

      const dst = await PDFDocument.create();
      const [copied] = await dst.copyPages(src, [0]);
      dst.addPage(copied);

      const bytes = await dst.save();
      const loaded = await PDFDocument.load(bytes);
      expect(loaded.getPageCount()).toBe(1);
    });
  });

  describe('structural verification', () => {
    it('cloned page has correct /Type /Page', async () => {
      const src = await PDFDocument.create();
      src.addPage();

      const dst = await PDFDocument.create();
      const [copied] = await dst.copyPages(src, [0]);

      const typeVal = copied._nativePageDict!.getCOSName('Type');
      expect(typeVal).toBeDefined();
      expect(typeVal!.getName()).toBe('Page');
    });

    it('cloned page has /Parent pointing to dst pages tree', async () => {
      const src = await PDFDocument.create();
      src.addPage();

      const dst = await PDFDocument.create();
      const [copied] = await dst.copyPages(src, [0]);

      const parentVal = copied._nativePageDict!.getItem('Parent');
      expect(parentVal).toBeInstanceOf(COSObjectReference);
      expect((parentVal as COSObjectReference).objectNumber).toBe(
        dst._nativeCtx!.pagesRef.objectNumber,
      );
    });

    it('cloned page preserves MediaBox', async () => {
      const src = await PDFDocument.create();
      src.addPage([595.28, 841.89]); // A4

      const dst = await PDFDocument.create();
      const [copied] = await dst.copyPages(src, [0]);
      dst.addPage(copied);

      const { width, height } = copied.getSize();
      expect(Math.abs(width - 595.28)).toBeLessThan(0.01);
      expect(Math.abs(height - 841.89)).toBeLessThan(0.01);
    });

    it('cloned page has independent Resources dictionary', async () => {
      const src = await PDFDocument.create();
      const srcPage = src.addPage();
      const font = await src.embedFont(StandardFonts.Helvetica);
      srcPage.drawText('test', { x: 50, y: 700, size: 12, font });

      const dst = await PDFDocument.create();
      const [copied] = await dst.copyPages(src, [0]);

      // Both should have Resources
      const srcResources = srcPage._nativePageDict!.getItem('Resources');
      const dstResources = copied._nativePageDict!.getItem('Resources');
      expect(srcResources).toBeDefined();
      expect(dstResources).toBeDefined();

      // They should be different objects (not same reference)
      expect(srcResources).not.toBe(dstResources);
    });

    it('cloned page has Contents', async () => {
      const src = await PDFDocument.create();
      const page = src.addPage();
      const font = await src.embedFont(StandardFonts.Helvetica);
      page.drawText('content', { x: 50, y: 700, size: 12, font });

      const dst = await PDFDocument.create();
      const [copied] = await dst.copyPages(src, [0]);

      const contents = copied._nativePageDict!.getItem('Contents');
      expect(contents).toBeDefined();
    });
  });

  describe('round-trip (save/load)', () => {
    it('merged document round-trips correctly', async () => {
      // Create source with 2 pages of different sizes
      const src = await PDFDocument.create();
      src.addPage([400, 300]);
      src.addPage([800, 600]);

      // Create destination with its own page
      const dst = await PDFDocument.create();
      dst.addPage([100, 100]);

      // Copy both pages from src
      const copied = await dst.copyPages(src, [0, 1]);
      dst.addPage(copied[0]);
      dst.addPage(copied[1]);

      // Save and reload
      const bytes = await dst.save();
      const loaded = await PDFDocument.load(bytes);

      expect(loaded.getPageCount()).toBe(3);
      expect(loaded.getPage(0).getWidth()).toBe(100);
      expect(loaded.getPage(1).getWidth()).toBe(400);
      expect(loaded.getPage(2).getWidth()).toBe(800);
    });

    it('copies from a loaded document', async () => {
      // Create and save a source document
      const original = await PDFDocument.create();
      const page = original.addPage([500, 400]);
      const font = await original.embedFont(StandardFonts.Helvetica);
      page.drawText('From loaded', { x: 50, y: 300, size: 24, font });
      const srcBytes = await original.save();

      // Load it back
      const src = await PDFDocument.load(srcBytes);
      expect(src.getPageCount()).toBe(1);

      // Copy into a new document
      const dst = await PDFDocument.create();
      const [copied] = await dst.copyPages(src, [0]);
      dst.addPage(copied);

      // Save and verify
      const dstBytes = await dst.save();
      const loaded = await PDFDocument.load(dstBytes);
      expect(loaded.getPageCount()).toBe(1);
      expect(loaded.getPage(0).getWidth()).toBe(500);
      expect(loaded.getPage(0).getHeight()).toBe(400);
    });

    it('copies between two loaded documents', async () => {
      // Create src
      const doc1 = await PDFDocument.create();
      doc1.addPage([111, 222]);
      const bytes1 = await doc1.save();

      // Create dst with a page
      const doc2 = await PDFDocument.create();
      doc2.addPage([333, 444]);
      const bytes2 = await doc2.save();

      // Load both
      const src = await PDFDocument.load(bytes1);
      const dst = await PDFDocument.load(bytes2);

      // Copy
      const [copied] = await dst.copyPages(src, [0]);
      dst.addPage(copied);

      const result = await dst.save();
      const loaded = await PDFDocument.load(result);

      expect(loaded.getPageCount()).toBe(2);
      expect(loaded.getPage(0).getWidth()).toBe(333);
      expect(loaded.getPage(1).getWidth()).toBe(111);
    });

    it('merged document with content is valid after round-trip', async () => {
      // Create src with rich content
      const src = await PDFDocument.create();
      const p1 = src.addPage(PageSizes.Letter);
      const helv = await src.embedFont(StandardFonts.Helvetica);
      p1.drawText('Page 1 from source', { x: 50, y: 700, size: 24, font: helv });
      p1.drawRectangle({ x: 50, y: 600, width: 200, height: 50, color: rgb(0.9, 0.9, 1) });

      const p2 = src.addPage(PageSizes.A4);
      p2.drawText('Page 2 from source', { x: 50, y: 700, size: 24, font: helv });

      // Create dst
      const dst = await PDFDocument.create();
      dst.setTitle('Merged Document');
      const dstPage = dst.addPage();
      const courier = await dst.embedFont(StandardFonts.Courier);
      dstPage.drawText('Destination page', { x: 50, y: 700, size: 18, font: courier });

      // Copy both src pages
      const copied = await dst.copyPages(src, [0, 1]);
      dst.addPage(copied[0]);
      dst.addPage(copied[1]);

      // Save and verify
      const bytes = await dst.save();
      const loaded = await PDFDocument.load(bytes);

      expect(loaded.getPageCount()).toBe(3);
      expect(loaded.getTitle()).toBe('Merged Document');
      expect(loaded.getPage(0).getWidth()).toBe(612); // Letter (dst)
      expect(loaded.getPage(1).getWidth()).toBe(612); // Letter (src p1)
      expect(Math.round(loaded.getPage(2).getWidth())).toBe(595); // A4 (src p2)
    });
  });

  describe('error handling', () => {
    it('throws for negative index', async () => {
      const src = await PDFDocument.create();
      src.addPage();

      const dst = await PDFDocument.create();
      expect(() => dst.copyPages(src, [-1])).rejects.toThrow(/out of bounds/);
    });

    it('throws for index >= page count', async () => {
      const src = await PDFDocument.create();
      src.addPage(); // only index 0

      const dst = await PDFDocument.create();
      expect(() => dst.copyPages(src, [1])).rejects.toThrow(/out of bounds/);
    });

    it('throws for index on empty document', async () => {
      const src = await PDFDocument.create();

      const dst = await PDFDocument.create();
      expect(() => dst.copyPages(src, [0])).rejects.toThrow(/out of bounds/);
    });
  });

  describe('page independence', () => {
    it('modifying copied page does not affect source', async () => {
      const src = await PDFDocument.create();
      src.addPage([400, 300]);

      const dst = await PDFDocument.create();
      const [copied] = await dst.copyPages(src, [0]);
      dst.addPage(copied);

      // Modify the copied page
      copied.setSize(100, 100);

      // Source should be unchanged
      expect(src.getPage(0).getWidth()).toBe(400);
      expect(src.getPage(0).getHeight()).toBe(300);

      // Copied page should be changed
      expect(dst.getPage(0).getWidth()).toBe(100);
      expect(dst.getPage(0).getHeight()).toBe(100);
    });

    it('adding content to copied page does not affect source', async () => {
      const src = await PDFDocument.create();
      const srcPage = src.addPage();
      const srcFont = await src.embedFont(StandardFonts.Helvetica);
      srcPage.drawText('original', { x: 50, y: 700, size: 12, font: srcFont });

      // Count source content streams
      const srcContents = srcPage._nativePageDict!.getItem('Contents');
      const srcContentCount = srcContents instanceof COSArray ? srcContents.size() : 0;

      const dst = await PDFDocument.create();
      const [copied] = await dst.copyPages(src, [0]);
      dst.addPage(copied);

      // Add more content to copied page
      const dstFont = await dst.embedFont(StandardFonts.Courier);
      copied.drawText('added', { x: 50, y: 600, size: 12, font: dstFont });

      // Source content count should be unchanged
      const srcContentsAfter = srcPage._nativePageDict!.getItem('Contents');
      const srcContentCountAfter = srcContentsAfter instanceof COSArray ? srcContentsAfter.size() : 0;
      expect(srcContentCountAfter).toBe(srcContentCount);
    });
  });

  describe('edge cases', () => {
    it('copies page with no content streams', async () => {
      const src = await PDFDocument.create();
      src.addPage([300, 200]); // blank page, no drawing

      const dst = await PDFDocument.create();
      const [copied] = await dst.copyPages(src, [0]);
      dst.addPage(copied);

      const bytes = await dst.save();
      const loaded = await PDFDocument.load(bytes);
      expect(loaded.getPageCount()).toBe(1);
      expect(loaded.getPage(0).getWidth()).toBe(300);
    });

    it('copies empty indices array', async () => {
      const src = await PDFDocument.create();
      src.addPage();

      const dst = await PDFDocument.create();
      const copied = await dst.copyPages(src, []);

      expect(copied).toEqual([]);
    });

    it('merge two single-page documents', async () => {
      const doc1 = await PDFDocument.create();
      const p1 = doc1.addPage([100, 100]);
      const f1 = await doc1.embedFont(StandardFonts.Helvetica);
      p1.drawText('Doc 1', { x: 10, y: 80, size: 12, font: f1 });

      const doc2 = await PDFDocument.create();
      const p2 = doc2.addPage([200, 200]);
      const f2 = await doc2.embedFont(StandardFonts.Courier);
      p2.drawText('Doc 2', { x: 10, y: 180, size: 12, font: f2 });

      // Merge both into a new doc
      const merged = await PDFDocument.create();
      const [c1] = await merged.copyPages(doc1, [0]);
      const [c2] = await merged.copyPages(doc2, [0]);
      merged.addPage(c1);
      merged.addPage(c2);

      const bytes = await merged.save();
      const loaded = await PDFDocument.load(bytes);

      expect(loaded.getPageCount()).toBe(2);
      expect(loaded.getPage(0).getWidth()).toBe(100);
      expect(loaded.getPage(1).getWidth()).toBe(200);
    });
  });
});
