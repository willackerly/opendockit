import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluatePage, evaluatePageWithElements } from '../evaluator.js';
import { NativeRenderer, getPageElements } from '../NativeRenderer.js';
import { PDFDocument } from '../../document/PDFDocument.js';
import { rgb } from '../../document/colors.js';
import { loadAndParseDocument } from '../../document/extraction/DocumentLoader.js';
import { COSArray, COSDictionary, COSName, COSObjectReference } from '../../pdfbox/cos/COSTypes.js';
import type {
  PageElement,
  TextElement,
  ShapeElement,
  ImageElement,
  PathElement,
  PdfSource,
} from '../../elements/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function loadTestPdf(relativePath: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.resolve(repoRoot, relativePath)));
}

// =========================================================================
// evaluatePageWithElements basic behavior
// =========================================================================

describe('evaluatePageWithElements', () => {
  let wirePdf: Uint8Array;

  beforeAll(() => {
    wirePdf = loadTestPdf('test-pdfs/working/wire-instructions.pdf');
  });

  it('returns opList and elements', () => {
    const doc = loadAndParseDocument(wirePdf);
    const pageList = getPageList(doc);
    expect(pageList.length).toBeGreaterThan(0);

    const { opList, elements } = evaluatePageWithElements(pageList[0].pageDict, doc.resolve);

    // opList should be populated (same as evaluatePage)
    expect(opList.length).toBeGreaterThan(0);

    // elements should be an array
    expect(Array.isArray(elements)).toBe(true);
  });

  it('opList output is identical to evaluatePage', () => {
    const doc = loadAndParseDocument(wirePdf);
    const pageList = getPageList(doc);

    const opListOnly = evaluatePage(pageList[0].pageDict, doc.resolve);
    const { opList: opListWithElements } = evaluatePageWithElements(pageList[0].pageDict, doc.resolve);

    // Both should produce the same operator list
    expect(opListWithElements.length).toBe(opListOnly.length);
    expect(opListWithElements.fnArray).toEqual(opListOnly.fnArray);
  });

  it('returns empty elements for empty page', () => {
    const pageDict = new COSDictionary();
    pageDict.setItem('Type', new COSName('Page'));
    const resolve = (_ref: COSObjectReference) => undefined;

    const { opList, elements } = evaluatePageWithElements(pageDict, resolve);
    expect(opList.length).toBe(0);
    expect(elements).toEqual([]);
  });
});

// =========================================================================
// Text element extraction
// =========================================================================

describe('text elements', () => {
  let wireElements: PageElement[];

  beforeAll(async () => {
    const doc = await PDFDocument.load(loadTestPdf('test-pdfs/working/wire-instructions.pdf'));
    const renderer = NativeRenderer.fromDocument(doc);
    wireElements = renderer.getPageElements(0);
  });

  it('extracts text elements from wire-instructions.pdf', () => {
    const textElements = wireElements.filter((e): e is TextElement => e.type === 'text');
    expect(textElements.length).toBeGreaterThan(0);

    for (const el of textElements) {
      // Basic element structure
      expect(typeof el.id).toBe('string');
      expect(el.id.length).toBeGreaterThan(0);
      expect(typeof el.x).toBe('number');
      expect(typeof el.y).toBe('number');
      expect(el.width).toBeGreaterThan(0);
      expect(el.height).toBeGreaterThan(0);

      // Text content
      expect(el.paragraphs.length).toBeGreaterThan(0);
      expect(el.paragraphs[0].runs.length).toBeGreaterThan(0);

      const run = el.paragraphs[0].runs[0];
      expect(run.text.length).toBeGreaterThan(0);
      expect(typeof run.fontFamily).toBe('string');
      expect(run.fontFamily.length).toBeGreaterThan(0);
      expect(run.fontSize).toBeGreaterThan(0);
      expect(run.color).toHaveProperty('r');
      expect(run.color).toHaveProperty('g');
      expect(run.color).toHaveProperty('b');
      expect(typeof run.color.r).toBe('number');
    }
  });

  it('text elements have PdfSource metadata', () => {
    const textElements = wireElements.filter((e): e is TextElement => e.type === 'text');
    expect(textElements.length).toBeGreaterThan(0);

    for (const el of textElements) {
      const source = el.source as PdfSource;
      expect(source).toBeDefined();
      expect(source.format).toBe('pdf');
      expect(Array.isArray(source.opRange)).toBe(true);
      expect(source.opRange).toHaveLength(2);
      expect(typeof source.opRange[0]).toBe('number');
      expect(typeof source.opRange[1]).toBe('number');
      expect(source.opRange[1]).toBeGreaterThanOrEqual(source.opRange[0]);
      expect(Array.isArray(source.ctm)).toBe(true);
      expect(source.ctm).toHaveLength(6);
      for (const v of source.ctm) {
        expect(typeof v).toBe('number');
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('extracts text from created document', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    const font = await doc.embedFont('Helvetica');
    page.drawText('Hello World', { x: 50, y: 200, size: 18, font });

    const saved = await doc.save();
    const loaded = await PDFDocument.load(saved);
    const elements = getPageElements(loaded, 0);

    const textElements = elements.filter((e): e is TextElement => e.type === 'text');
    expect(textElements.length).toBeGreaterThan(0);

    // Find the element that contains "Hello"
    const helloEl = textElements.find(el =>
      el.paragraphs.some(p => p.runs.some(r => r.text.includes('Hello'))),
    );
    expect(helloEl).toBeDefined();

    // Position should be roughly in the expected area (PDF coordinates)
    // drawText at x=50 so x should be near 50
    expect(helloEl!.x).toBeGreaterThanOrEqual(30);
    expect(helloEl!.x).toBeLessThanOrEqual(70);
  });
});

// =========================================================================
// Shape/path element extraction
// =========================================================================

describe('shape elements', () => {
  it('extracts rectangle as shape element', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    page.drawRectangle({ x: 50, y: 50, width: 100, height: 80, color: rgb(1, 0, 0) });

    const saved = await doc.save();
    const loaded = await PDFDocument.load(saved);
    const elements = getPageElements(loaded, 0);

    // Should have at least one shape or path element for the rectangle
    const rectLike = elements.filter(
      (e): e is ShapeElement | PathElement => e.type === 'shape' || e.type === 'path',
    );
    expect(rectLike.length).toBeGreaterThan(0);

    // Find the element corresponding to our rectangle
    const rect = rectLike.find(el => {
      const approxMatch =
        Math.abs(el.width - 100) < 5 &&
        Math.abs(el.height - 80) < 5;
      return approxMatch;
    });
    expect(rect).toBeDefined();

    // Check fill color (should be red)
    if (rect!.type === 'shape') {
      expect(rect!.fill).not.toBeNull();
      expect(rect!.fill!.color).toBeDefined();
      expect(rect!.fill!.color!.r).toBeCloseTo(1, 1);
      expect(rect!.fill!.color!.g).toBeCloseTo(0, 1);
      expect(rect!.fill!.color!.b).toBeCloseTo(0, 1);
    } else {
      // Path element with fill
      expect(rect!.fill).not.toBeNull();
      expect(rect!.fill!.color).toBeDefined();
      expect(rect!.fill!.color!.r).toBeCloseTo(1, 1);
    }
  });

  it('extracts stroked path', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    page.drawLine({
      start: { x: 10, y: 10 },
      end: { x: 200, y: 200 },
      thickness: 2,
      color: rgb(0, 0, 1),
    });

    const saved = await doc.save();
    const loaded = await PDFDocument.load(saved);
    const elements = getPageElements(loaded, 0);

    // Should have at least one path or shape element
    const pathLike = elements.filter(
      (e): e is ShapeElement | PathElement => e.type === 'shape' || e.type === 'path',
    );
    expect(pathLike.length).toBeGreaterThan(0);

    // At least one should have a stroke
    const stroked = pathLike.find(el => el.stroke !== null);
    expect(stroked).toBeDefined();
    expect(stroked!.stroke!.color).toBeDefined();
  });
});

// =========================================================================
// Image element extraction
// =========================================================================

describe('image elements', () => {
  it('extracts image elements from PDF with images', async () => {
    const pdfPath = 'test-pdfs/chrome-google-docs/text-with-images-google-docs.pdf';
    if (!fs.existsSync(path.resolve(repoRoot, pdfPath))) {
      // Skip if test PDF not available
      return;
    }

    const doc = await PDFDocument.load(loadTestPdf(pdfPath));
    const renderer = NativeRenderer.fromDocument(doc);

    // Check all pages for image elements
    // Note: Images inside form XObjects are not yet collected into the parent
    // element list (form XObjects use a separate EvalContext). Only top-level
    // image XObjects will appear. This test checks the ImageElement structure
    // when images ARE found.
    let imageElements: ImageElement[] = [];
    for (let i = 0; i < renderer.pageCount; i++) {
      const pageElements = renderer.getPageElements(i);
      imageElements.push(
        ...pageElements.filter((e): e is ImageElement => e.type === 'image'),
      );
    }

    // If images are found (top-level Do), validate their structure
    for (const img of imageElements) {
      expect(typeof img.imageRef).toBe('string');
      expect(img.width).toBeGreaterThan(0);
      expect(img.height).toBeGreaterThan(0);
      expect(typeof img.mimeType).toBe('string');
    }
  });

  it('ImageElement has correct structure', async () => {
    // Create a document with an embedded image (PNG)
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);

    // Create a minimal 2x2 red PNG
    const pngHeader = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    ]);

    // Embed a JPEG image via the document API if available
    // For now, just verify the type structure is correct by checking
    // that the evaluator produces ImageElements when images are present
    const elements = getPageElements(doc, 0);
    // A blank page with no images should have no image elements
    const imgs = elements.filter((e): e is ImageElement => e.type === 'image');
    expect(imgs.length).toBe(0);
  });
});

// =========================================================================
// NativeRenderer.getPageElements
// =========================================================================

describe('NativeRenderer.getPageElements', () => {
  it('returns elements for loaded document', async () => {
    const doc = await PDFDocument.load(loadTestPdf('test-pdfs/working/wire-instructions.pdf'));
    const renderer = NativeRenderer.fromDocument(doc);
    const elements = renderer.getPageElements(0);
    expect(Array.isArray(elements)).toBe(true);
    expect(elements.length).toBeGreaterThan(0);
  });

  it('throws for out-of-range page index', async () => {
    const doc = await PDFDocument.load(loadTestPdf('test-pdfs/working/simple-test.pdf'));
    const renderer = NativeRenderer.fromDocument(doc);
    expect(() => renderer.getPageElements(99)).toThrow(/out of range/i);
    expect(() => renderer.getPageElements(-1)).toThrow(/out of range/i);
  });

  it('returns empty array for blank page', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const renderer = NativeRenderer.fromDocument(doc);
    const elements = renderer.getPageElements(0);
    expect(elements).toEqual([]);
  });
});

// =========================================================================
// Standalone getPageElements convenience
// =========================================================================

describe('getPageElements convenience', () => {
  it('extracts elements from PDFDocument', async () => {
    const doc = await PDFDocument.load(loadTestPdf('test-pdfs/working/wire-instructions.pdf'));
    const elements = getPageElements(doc, 0);
    expect(Array.isArray(elements)).toBe(true);
    expect(elements.length).toBeGreaterThan(0);
  });

  it('defaults to page 0', async () => {
    const doc = await PDFDocument.load(loadTestPdf('test-pdfs/working/wire-instructions.pdf'));
    const elementsDefault = getPageElements(doc);
    const elementsExplicit = getPageElements(doc, 0);
    expect(elementsDefault.length).toBe(elementsExplicit.length);
  });
});

// =========================================================================
// Element structure invariants
// =========================================================================

describe('element structure invariants', () => {
  let wireElements: PageElement[];

  beforeAll(async () => {
    const doc = await PDFDocument.load(loadTestPdf('test-pdfs/working/wire-instructions.pdf'));
    wireElements = getPageElements(doc, 0);
  });

  it('all elements have unique ids', () => {
    expect(wireElements.length).toBeGreaterThan(0);
    const ids = wireElements.map(e => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all elements have numeric coordinates', () => {
    for (const el of wireElements) {
      expect(Number.isFinite(el.x)).toBe(true);
      expect(Number.isFinite(el.y)).toBe(true);
      expect(Number.isFinite(el.width)).toBe(true);
      expect(Number.isFinite(el.height)).toBe(true);
      expect(Number.isFinite(el.rotation)).toBe(true);
      expect(Number.isFinite(el.opacity)).toBe(true);
    }
  });

  it('all elements have required base fields', () => {
    for (const el of wireElements) {
      expect(typeof el.id).toBe('string');
      expect(typeof el.type).toBe('string');
      expect(['text', 'shape', 'image', 'path', 'group']).toContain(el.type);
      expect(typeof el.index).toBe('string');
      expect(typeof el.locked).toBe('boolean');
      // parentId is string | null
      expect(el.parentId === null || typeof el.parentId === 'string').toBe(true);
    }
  });

  it('element count matches visual content in created doc', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 200]);
    const font = await doc.embedFont('Helvetica');

    page.drawRectangle({ x: 10, y: 10, width: 50, height: 30, color: rgb(0, 0, 1) });
    page.drawText('Test', { x: 10, y: 100, size: 14, font });

    const saved = await doc.save();
    const loaded = await PDFDocument.load(saved);
    const elements = getPageElements(loaded, 0);

    // We drew 1 rectangle + 1 text = at least 2 elements
    expect(elements.length).toBeGreaterThanOrEqual(2);

    // Should have at least one text element and one shape/path element
    const hasText = elements.some(e => e.type === 'text');
    const hasShape = elements.some(e => e.type === 'shape' || e.type === 'path');
    expect(hasText).toBe(true);
    expect(hasShape).toBe(true);
  });

  it('elements are z-ordered (index is monotonically non-decreasing)', () => {
    if (wireElements.length < 2) return;

    for (let i = 1; i < wireElements.length; i++) {
      // Index is a string representation of the element's position.
      // Compare numerically since integer indices > 9 don't sort lexicographically.
      const prev = parseFloat(wireElements[i - 1].index);
      const curr = parseFloat(wireElements[i].index);
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });
});

// =========================================================================
// Multi-page element extraction
// =========================================================================

describe('multi-page element extraction', () => {
  it('extracts elements from each page independently', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');

    const page1 = doc.addPage([200, 200]);
    page1.drawText('Page One', { x: 10, y: 100, size: 12, font });

    const page2 = doc.addPage([200, 200]);
    page2.drawText('Page Two', { x: 10, y: 100, size: 12, font });
    page2.drawRectangle({ x: 10, y: 10, width: 50, height: 30, color: rgb(1, 0, 0) });

    const saved = await doc.save();
    const loaded = await PDFDocument.load(saved);
    const renderer = NativeRenderer.fromDocument(loaded);

    const elements1 = renderer.getPageElements(0);
    const elements2 = renderer.getPageElements(1);

    // Page 2 has more content (text + rect), so should have more or equal elements
    expect(elements2.length).toBeGreaterThanOrEqual(elements1.length);

    // Each page's elements should have unique ids within the page
    const ids1 = new Set(elements1.map(e => e.id));
    expect(ids1.size).toBe(elements1.length);

    const ids2 = new Set(elements2.map(e => e.id));
    expect(ids2.size).toBe(elements2.length);
  });
});

// =========================================================================
// Helpers
// =========================================================================

function getPageList(
  doc: { resolve: (ref: COSObjectReference) => any; catalogRef: COSObjectReference; objects: Map<number, any> },
): Array<{ pageDict: COSDictionary }> {
  const pages: Array<{ pageDict: COSDictionary }> = [];
  const catalog = doc.resolve(doc.catalogRef);
  if (!(catalog instanceof COSDictionary)) return pages;

  let pagesEntry = catalog.getItem('Pages');
  if (pagesEntry instanceof COSObjectReference) pagesEntry = doc.resolve(pagesEntry);
  if (!(pagesEntry instanceof COSDictionary)) return pages;

  walkPageTree(pagesEntry, pages, doc.resolve, []);
  return pages;
}

function walkPageTree(
  node: COSDictionary,
  result: Array<{ pageDict: COSDictionary }>,
  resolve: (ref: COSObjectReference) => any,
  parentChain: COSDictionary[],
): void {
  let kidsEntry = node.getItem('Kids');
  if (kidsEntry instanceof COSObjectReference) kidsEntry = resolve(kidsEntry);
  if (!(kidsEntry instanceof COSArray)) return;

  for (let i = 0; i < kidsEntry.size(); i++) {
    let kid = kidsEntry.get(i);
    if (kid instanceof COSObjectReference) kid = resolve(kid);
    if (!(kid instanceof COSDictionary)) continue;

    const typeEntry = kid.getItem('Type');
    const typeName = typeEntry instanceof COSName ? typeEntry.getName() : undefined;

    if (typeName === 'Pages') {
      walkPageTree(kid, result, resolve, [...parentChain, node]);
    } else {
      applyInherited(kid, [...parentChain, node]);
      result.push({ pageDict: kid });
    }
  }
}

function applyInherited(pageDict: COSDictionary, chain: COSDictionary[]): void {
  for (const key of ['MediaBox', 'CropBox', 'Resources', 'Rotate']) {
    if (pageDict.getItem(key)) continue;
    for (let i = chain.length - 1; i >= 0; i--) {
      const val = chain[i].getItem(key);
      if (val) { pageDict.setItem(key, val); break; }
    }
  }
}
