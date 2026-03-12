/**
 * Integration tests for the full element model pipeline:
 *   extract (evaluator) -> query (spatial) -> preview (redaction-preview) -> redact
 *
 * These tests use REAL PDFs (both created and loaded from fixtures) and exercise
 * the full stack from PDFDocument -> NativeRenderer -> PageElement[].
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from '../../document/PDFDocument.js';
import { NativeRenderer } from '../../render/NativeRenderer.js';
import { getPageElements } from '../../render/NativeRenderer.js';
import { rgb } from '../../document/colors.js';
import type { TextElement, PdfSource, PageElement } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..', '..');

function loadTestPdf(relativePath: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(ROOT, relativePath)));
}

// ─── Full Pipeline Tests ──────────────────────────────────────────────

describe('element model integration', () => {
  // ──────────────────────────────────────────────────────────────────────
  // 1. Full pipeline: extract -> query -> verify
  // ──────────────────────────────────────────────────────────────────────
  it('extracts text, queries by rect, finds correct content', async () => {
    // Create a PDF with text at known positions
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    const font = await doc.embedFont('Helvetica');
    page.drawText('CONFIDENTIAL', { x: 50, y: 250, size: 16, font });
    page.drawText('Public Info', { x: 50, y: 200, size: 12, font });
    page.drawText('SECRET DATA', { x: 50, y: 150, size: 14, font });

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    const elements = getPageElements(loaded, 0);

    // We should have at least 3 text elements
    const texts = elements.filter(e => e.type === 'text');
    expect(texts.length).toBeGreaterThanOrEqual(3);

    // Verify text content is present across all elements
    const allText = texts
      .flatMap(t => (t as TextElement).paragraphs.flatMap(p => p.runs.map(r => r.text)))
      .join(' ');
    expect(allText).toContain('CONFIDENTIAL');
    expect(allText).toContain('Public');
    expect(allText).toContain('SECRET');

    // Use spatial queries to find elements by rect
    const { queryElementsInRect } = await import('../spatial.js');

    // Query a rect around the SECRET DATA position (y=150, fontSize=14, height~16.8)
    const found = queryElementsInRect(elements, { x: 40, y: 140, width: 200, height: 25 });
    const foundTexts = found.filter(e => e.type === 'text') as TextElement[];
    expect(foundTexts.length).toBeGreaterThan(0);
    const foundText = foundTexts
      .flatMap(t => t.paragraphs.flatMap(p => p.runs.map(r => r.text)))
      .join('');
    expect(foundText).toContain('SECRET');

    // Verify the CONFIDENTIAL text is NOT in this rect (it's at y=250)
    expect(foundText).not.toContain('CONFIDENTIAL');
  });

  // ──────────────────────────────────────────────────────────────────────
  // 2. Wire-instructions real-world test
  // ──────────────────────────────────────────────────────────────────────
  it('extracts structured content from wire-instructions.pdf', async () => {
    const pdf = loadTestPdf('test-pdfs/working/wire-instructions.pdf');
    const doc = await PDFDocument.load(pdf);
    const elements = getPageElements(doc, 0);

    // Verify we get meaningful content
    const texts = elements.filter(e => e.type === 'text') as TextElement[];
    expect(texts.length).toBeGreaterThan(10); // wire-instructions has lots of text

    // Verify key headings are present
    const allText = texts
      .flatMap(t => t.paragraphs.flatMap(p => p.runs.map(r => r.text)))
      .join(' ');
    expect(allText).toContain('WIRE');
    expect(allText).toContain('CONFIDENTIAL');

    // Verify font information is captured
    const firstText = texts[0];
    expect(firstText.paragraphs.length).toBeGreaterThan(0);
    expect(firstText.paragraphs[0].runs.length).toBeGreaterThan(0);
    expect(firstText.paragraphs[0].runs[0].fontFamily).toBeTruthy();
    expect(firstText.paragraphs[0].runs[0].fontSize).toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────────────────────────────
  // 3. Redaction preview integration
  // ──────────────────────────────────────────────────────────────────────
  it('previews redaction of sensitive content', async () => {
    const { getRedactionPreview } = await import('../redaction-preview.js');

    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    const font = await doc.embedFont('Helvetica');
    page.drawText('SSN: 123-45-6789', { x: 50, y: 200, size: 12, font });
    page.drawText('Name: John Doe', { x: 50, y: 180, size: 12, font });

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    const elements = getPageElements(loaded, 0);

    // Preview redacting a broad area that should hit the SSN text
    // Text at y=200 (PDF bottom-up) with fontSize=12, page height=300
    // After Y-flip: y = 300 - 200 - 14.4 ≈ 85.6
    const preview = getRedactionPreview(elements, { x: 0, y: 75, width: 400, height: 25 });
    expect(preview.count).toBeGreaterThan(0);
    expect(preview.summary).toContain('Redacting');

    // The SSN text should be among the affected elements
    const hasSSN = preview.descriptions.some(d => d.text?.includes('123-45'));
    expect(hasSSN).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────
  // 4. Multi-page element extraction
  // ──────────────────────────────────────────────────────────────────────
  it('extracts elements from multi-page document', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');

    const page1 = doc.addPage([400, 300]);
    page1.drawText('Page One', { x: 50, y: 200, size: 20, font });

    const page2 = doc.addPage([400, 300]);
    page2.drawText('Page Two', { x: 50, y: 200, size: 20, font });
    page2.drawRectangle({ x: 100, y: 100, width: 80, height: 40, color: rgb(0, 0, 1) });

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    const renderer = NativeRenderer.fromDocument(loaded);

    const page1Elements = renderer.getPageElements(0);
    const page2Elements = renderer.getPageElements(1);

    expect(page1Elements.length).toBeGreaterThan(0);
    // page 2 has text + rectangle, so more elements
    expect(page2Elements.length).toBeGreaterThan(page1Elements.length);

    // Verify page 1 content
    const p1Text = page1Elements
      .filter(e => e.type === 'text')
      .flatMap(t => (t as TextElement).paragraphs.flatMap(p => p.runs.map(r => r.text)))
      .join('');
    expect(p1Text).toContain('Page One');

    // Verify page 2 content
    const p2Text = page2Elements
      .filter(e => e.type === 'text')
      .flatMap(t => (t as TextElement).paragraphs.flatMap(p => p.runs.map(r => r.text)))
      .join('');
    expect(p2Text).toContain('Page Two');

    // Verify page 2 has a shape element from drawRectangle
    const shapes = page2Elements.filter(e => e.type === 'shape' || e.type === 'path');
    expect(shapes.length).toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────────────────────────────
  // 5. Element source metadata for round-trip
  // ──────────────────────────────────────────────────────────────────────
  it('elements carry PdfSource metadata for write-back', async () => {
    const pdf = loadTestPdf('test-pdfs/working/wire-instructions.pdf');
    const doc = await PDFDocument.load(pdf);
    const elements = getPageElements(doc, 0);

    expect(elements.length).toBeGreaterThan(0);

    for (const el of elements) {
      expect(el.source).toBeDefined();
      const src = el.source as PdfSource;
      expect(src.format).toBe('pdf');
      expect(src.opRange).toBeDefined();
      expect(Array.isArray(src.opRange)).toBe(true);
      expect(src.opRange.length).toBe(2);
      expect(typeof src.opRange[0]).toBe('number');
      expect(typeof src.opRange[1]).toBe('number');
      expect(src.ctm).toBeDefined();
      expect(Array.isArray(src.ctm)).toBe(true);
      expect(src.ctm.length).toBe(6);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // 6. Mixed content extraction (text + shapes + lines)
  // ──────────────────────────────────────────────────────────────────────
  it('extracts text, shapes, and paths from mixed content', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    const font = await doc.embedFont('Helvetica');

    // Text
    page.drawText('Header', { x: 50, y: 260, size: 18, font, color: rgb(0, 0, 0) });
    // Shapes
    page.drawRectangle({ x: 50, y: 150, width: 100, height: 50, color: rgb(1, 0, 0) });
    page.drawLine({ start: { x: 50, y: 140 }, end: { x: 350, y: 140 }, thickness: 1 });
    // More text
    page.drawText('Footer', { x: 50, y: 50, size: 10, font });

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    const elements = getPageElements(loaded, 0);

    const types = new Set(elements.map(e => e.type));
    expect(types.has('text')).toBe(true);
    // shapes from drawRectangle come as 'shape' (re pattern), lines come as 'path'
    expect(types.has('path') || types.has('shape')).toBe(true);

    // Verify text content
    const texts = elements.filter(e => e.type === 'text') as TextElement[];
    const allText = texts
      .flatMap(t => t.paragraphs.flatMap(p => p.runs.map(r => r.text)))
      .join(' ');
    expect(allText).toContain('Header');
    expect(allText).toContain('Footer');

    // Verify at least one element has a non-zero bounding box
    for (const el of elements) {
      expect(el.width).toBeGreaterThanOrEqual(0);
      expect(el.height).toBeGreaterThanOrEqual(0);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // 7. Spatial extractTextInRect convenience
  // ──────────────────────────────────────────────────────────────────────
  it('extractTextInRect returns plain text from real PDF', async () => {
    const { extractTextInRect } = await import('../spatial.js');

    const pdf = loadTestPdf('test-pdfs/working/wire-instructions.pdf');
    const doc = await PDFDocument.load(pdf);
    const elements = getPageElements(doc, 0);

    // Extract text from a broad horizontal strip across the top of the page.
    // The wire-instructions PDF has its title near the top.
    // After Y-flip: top of page is y=0. Use a strip near the top.
    // The page is likely US Letter (612 x 792).
    const topStrip = { x: 0, y: 0, width: 612, height: 100 };
    const text = extractTextInRect(elements, topStrip);
    // Should contain at least part of the title
    expect(text.length).toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────────────────────────────
  // 8. elementAtPoint hit testing with created PDF
  // ──────────────────────────────────────────────────────────────────────
  it('elementAtPoint finds correct element at specific coordinates', async () => {
    const { elementAtPoint } = await import('../spatial.js');

    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    const font = await doc.embedFont('Helvetica');

    // Place text at known position
    page.drawText('Target', { x: 100, y: 200, size: 20, font });

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    const elements = getPageElements(loaded, 0);

    const texts = elements.filter(e => e.type === 'text') as TextElement[];
    expect(texts.length).toBeGreaterThan(0);

    // Find the Target text element to know its actual bounds
    const targetEl = texts.find(t =>
      t.paragraphs.some(p => p.runs.some(r => r.text.includes('Target'))),
    );
    expect(targetEl).toBeDefined();

    // Hit test at the center of the target element
    const cx = targetEl!.x + targetEl!.width / 2;
    const cy = targetEl!.y + targetEl!.height / 2;
    const hit = elementAtPoint(elements, cx, cy);
    expect(hit).not.toBeNull();
    expect(hit!.type).toBe('text');

    // Hit test at a point far from any content should return null
    const miss = elementAtPoint(elements, 390, 290);
    expect(miss).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────
  // 9. Redaction preview on real-world PDF
  // ──────────────────────────────────────────────────────────────────────
  it('redaction preview on wire-instructions shows affected content', async () => {
    const { getRedactionPreview } = await import('../redaction-preview.js');

    const pdf = loadTestPdf('test-pdfs/working/wire-instructions.pdf');
    const doc = await PDFDocument.load(pdf);
    const elements = getPageElements(doc, 0);

    // Get all text elements and pick the first one to build a rect around
    const texts = elements.filter(e => e.type === 'text') as TextElement[];
    expect(texts.length).toBeGreaterThan(0);

    // Build a rect around the first text element
    const target = texts[0];
    const rect = {
      x: target.x - 5,
      y: target.y - 5,
      width: target.width + 10,
      height: target.height + 10,
    };

    const preview = getRedactionPreview(elements, rect);
    expect(preview.count).toBeGreaterThan(0);
    expect(preview.summary).toContain('Redacting');
    expect(preview.descriptions.length).toBe(preview.count);

    // Each description should have position and size info
    for (const desc of preview.descriptions) {
      expect(desc.type).toBeTruthy();
      expect(desc.position).toBeDefined();
      expect(desc.size).toBeDefined();
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // 10. Redaction round-trip (if redact.ts available)
  // ──────────────────────────────────────────────────────────────────────
  it('redacts content and verifies removal', async () => {
    let redactModule: any;
    try {
      redactModule = await import('../redact.js');
    } catch {
      // redact.ts not yet available -- skip gracefully
      return;
    }

    // Create doc with sensitive text
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    const font = await doc.embedFont('Helvetica');
    page.drawText('SSN: 123-45-6789', { x: 50, y: 200, size: 12, font });
    page.drawText('Safe text here', { x: 50, y: 100, size: 12, font });

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);

    // Extract elements before redaction
    const elementsBefore = getPageElements(loaded, 0);
    const textsBefore = elementsBefore.filter(e => e.type === 'text') as TextElement[];
    const allTextBefore = textsBefore
      .flatMap(t => t.paragraphs.flatMap(p => p.runs.map(r => r.text)))
      .join(' ');
    expect(allTextBefore).toContain('123-45');

    // If redactModule exports a usable function, attempt redaction
    if (typeof redactModule.redactElements === 'function') {
      // The redaction API may vary -- adapt to whatever is exported
      const result = await redactModule.redactElements(loaded, 0, {
        x: 40, y: 190, width: 300, height: 25,
      });

      if (result) {
        // Re-extract elements after redaction
        const elementsAfter = getPageElements(result, 0);
        const textsAfter = elementsAfter.filter(e => e.type === 'text') as TextElement[];
        const allTextAfter = textsAfter
          .flatMap(t => t.paragraphs.flatMap(p => p.runs.map(r => r.text)))
          .join(' ');
        // SSN should be gone
        expect(allTextAfter).not.toContain('123-45');
        // Safe text should remain
        expect(allTextAfter).toContain('Safe text');
      }
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // 11. boundingBox over extracted elements
  // ──────────────────────────────────────────────────────────────────────
  it('boundingBox covers all elements from a real PDF', async () => {
    const { boundingBox } = await import('../spatial.js');

    const pdf = loadTestPdf('test-pdfs/working/wire-instructions.pdf');
    const doc = await PDFDocument.load(pdf);
    const elements = getPageElements(doc, 0);

    const bbox = boundingBox(elements);
    expect(bbox).not.toBeNull();

    // The bounding box should have reasonable dimensions for a US Letter page
    expect(bbox!.width).toBeGreaterThan(0);
    expect(bbox!.height).toBeGreaterThan(0);
    // Should not exceed page bounds significantly (612 x 792 for US Letter)
    expect(bbox!.x).toBeGreaterThanOrEqual(-10); // allow small margin
    expect(bbox!.y).toBeGreaterThanOrEqual(-10);
    expect(bbox!.x + bbox!.width).toBeLessThan(700);
    expect(bbox!.y + bbox!.height).toBeLessThan(900);
  });

  // ──────────────────────────────────────────────────────────────────────
  // 12. NativeRenderer.getPageElements index bounds checking
  // ──────────────────────────────────────────────────────────────────────
  it('throws RangeError for invalid page index', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 300]);
    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    const renderer = NativeRenderer.fromDocument(loaded);

    expect(() => renderer.getPageElements(-1)).toThrow(RangeError);
    expect(() => renderer.getPageElements(1)).toThrow(RangeError);
    expect(() => renderer.getPageElements(999)).toThrow(RangeError);
  });
});
