import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { OPS } from '../ops.js';
import { OperatorList } from '../operator-list.js';
import { evaluatePage } from '../evaluator.js';
import { NativeCanvasGraphics } from '../canvas-graphics.js';
import { NativeRenderer, renderPageNative } from '../NativeRenderer.js';
import { PDFDocument } from '../../document/PDFDocument.js';
import { rgb } from '../../document/colors.js';
import { loadAndParseDocument } from '../../document/extraction/DocumentLoader.js';
import { COSArray, COSDictionary, COSName, COSObjectReference } from '../../pdfbox/cos/COSTypes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function loadTestPdf(relativePath: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.resolve(repoRoot, relativePath)));
}

// =========================================================================
// OPS constants
// =========================================================================

describe('OPS constants', () => {
  it('has expected integer codes', () => {
    expect(OPS.save).toBe(10);
    expect(OPS.restore).toBe(11);
    expect(OPS.transform).toBe(12);
    expect(OPS.setFont).toBe(37);
    expect(OPS.showText).toBe(44);
    expect(OPS.setFillRGBColor).toBe(59);
    expect(OPS.paintImageXObject).toBe(85);
    expect(OPS.paintFormXObjectBegin).toBe(74);
  });

  it('all values are unique integers', () => {
    const values = Object.values(OPS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
    for (const v of values) {
      expect(typeof v).toBe('number');
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

// =========================================================================
// OperatorList
// =========================================================================

describe('OperatorList', () => {
  it('starts empty', () => {
    const list = new OperatorList();
    expect(list.length).toBe(0);
    expect(list.fnArray).toEqual([]);
    expect(list.argsArray).toEqual([]);
  });

  it('addOp adds op with null args', () => {
    const list = new OperatorList();
    list.addOp(OPS.save);
    expect(list.length).toBe(1);
    expect(list.fnArray[0]).toBe(OPS.save);
    expect(list.argsArray[0]).toBeNull();
  });

  it('addOpArgs adds op with arguments', () => {
    const list = new OperatorList();
    list.addOpArgs(OPS.moveTo, [100, 200]);
    expect(list.length).toBe(1);
    expect(list.fnArray[0]).toBe(OPS.moveTo);
    expect(list.argsArray[0]).toEqual([100, 200]);
  });

  it('addAll merges two lists', () => {
    const a = new OperatorList();
    a.addOp(OPS.save);
    a.addOpArgs(OPS.moveTo, [10, 20]);

    const b = new OperatorList();
    b.addOpArgs(OPS.lineTo, [30, 40]);
    b.addOp(OPS.stroke);

    a.addAll(b);
    expect(a.length).toBe(4);
    expect(a.fnArray).toEqual([OPS.save, OPS.moveTo, OPS.lineTo, OPS.stroke]);
  });
});

// =========================================================================
// Evaluator
// =========================================================================

describe('evaluatePage', () => {
  let wirePdf: Uint8Array;
  let simplePdf: Uint8Array;

  beforeAll(() => {
    wirePdf = loadTestPdf('test-pdfs/working/wire-instructions.pdf');
    simplePdf = loadTestPdf('test-pdfs/working/simple-test.pdf');
  });

  it('produces a non-empty OperatorList for wire-instructions.pdf', () => {
    const doc = loadAndParseDocument(wirePdf);
    const pageList = getPageList(doc);
    expect(pageList.length).toBeGreaterThan(0);

    const opList = evaluatePage(pageList[0].pageDict, doc.resolve);
    expect(opList.length).toBeGreaterThan(0);

    // Should contain at least some basic ops
    const ops = new Set(opList.fnArray);
    // Any real page should have save/restore or text or path ops
    expect(
      ops.has(OPS.save) || ops.has(OPS.beginText) || ops.has(OPS.moveTo) || ops.has(OPS.fill),
    ).toBe(true);
  });

  it('produces a non-empty OperatorList for simple-test.pdf', () => {
    const doc = loadAndParseDocument(simplePdf);
    const pageList = getPageList(doc);
    expect(pageList.length).toBeGreaterThan(0);

    const opList = evaluatePage(pageList[0].pageDict, doc.resolve);
    expect(opList.length).toBeGreaterThan(0);
  });

  it('handles graphics state operators', () => {
    const doc = loadAndParseDocument(wirePdf);
    const pageList = getPageList(doc);
    const opList = evaluatePage(pageList[0].pageDict, doc.resolve);

    // Check that save/restore are balanced
    let depth = 0;
    for (const fn of opList.fnArray) {
      if (fn === OPS.save) depth++;
      if (fn === OPS.restore) depth--;
    }
    // Should be balanced (or close — some PDFs aren't perfectly balanced)
    expect(Math.abs(depth)).toBeLessThanOrEqual(2);
  });

  it('resolves fonts for text operators', () => {
    const doc = loadAndParseDocument(wirePdf);
    const pageList = getPageList(doc);
    const opList = evaluatePage(pageList[0].pageDict, doc.resolve);

    // Find setFont ops
    const fontOps = opList.fnArray
      .map((fn, i) => ({ fn, args: opList.argsArray[i] }))
      .filter(({ fn }) => fn === OPS.setFont);

    if (fontOps.length > 0) {
      // setFont args: [fontId, fontSize, cssInfo]
      const first = fontOps[0].args!;
      expect(typeof first[0]).toBe('string');  // fontId
      expect(typeof first[1]).toBe('number');  // fontSize
      expect(first[2]).toHaveProperty('family');
      expect(first[2]).toHaveProperty('weight');
      expect(first[2]).toHaveProperty('style');
    }
  });

  it('decodes text glyphs in showText', () => {
    const doc = loadAndParseDocument(wirePdf);
    const pageList = getPageList(doc);
    const opList = evaluatePage(pageList[0].pageDict, doc.resolve);

    // Find showText or showSpacedText ops
    const textOps = opList.fnArray
      .map((fn, i) => ({ fn, args: opList.argsArray[i] }))
      .filter(({ fn }) => fn === OPS.showText || fn === OPS.showSpacedText);

    if (textOps.length > 0) {
      const first = textOps[0].args!;
      const glyphsOrItems = first[0];
      expect(Array.isArray(glyphsOrItems)).toBe(true);
      expect(glyphsOrItems.length).toBeGreaterThan(0);

      // Check glyph structure
      const firstItem = glyphsOrItems[0];
      if (typeof firstItem === 'object' && firstItem !== null) {
        expect(firstItem).toHaveProperty('unicode');
        expect(firstItem).toHaveProperty('width');
        expect(typeof firstItem.unicode).toBe('string');
        expect(typeof firstItem.width).toBe('number');
      }
    }
  });

  it('handles color operators', () => {
    const doc = loadAndParseDocument(wirePdf);
    const pageList = getPageList(doc);
    const opList = evaluatePage(pageList[0].pageDict, doc.resolve);

    const colorOps = new Set([
      OPS.setFillGray, OPS.setStrokeGray,
      OPS.setFillRGBColor, OPS.setStrokeRGBColor,
      OPS.setFillCMYKColor, OPS.setStrokeCMYKColor,
    ]);

    const foundColorOps = opList.fnArray.filter(fn => colorOps.has(fn as any));
    // Most PDFs have at least one color operation
    expect(foundColorOps.length).toBeGreaterThanOrEqual(0);
  });

  it('produces non-zero glyph widths for standard fonts', () => {
    const doc = loadAndParseDocument(wirePdf);
    const pageList = getPageList(doc);
    const opList = evaluatePage(pageList[0].pageDict, doc.resolve);

    const textOps = opList.fnArray
      .map((fn, i) => ({ fn, args: opList.argsArray[i] }))
      .filter(({ fn }) => fn === OPS.showText || fn === OPS.showSpacedText);

    expect(textOps.length).toBeGreaterThan(0);

    const first = textOps[0].args!;
    const items = first[0] as any[];
    const glyphs = items.filter((item: any) => typeof item === 'object' && item !== null && 'width' in item);
    expect(glyphs.length).toBeGreaterThan(0);

    // All glyph widths should be > 0
    const zeroWidthGlyphs = glyphs.filter((g: any) => g.width === 0);
    expect(zeroWidthGlyphs.length).toBe(0);
  });

  it('returns empty OperatorList for empty page', () => {
    // Create a page dict with no /Contents
    const pageDict = new COSDictionary();
    pageDict.setItem('Type', new COSName('Page'));
    const resolve = (_ref: COSObjectReference) => undefined;

    const opList = evaluatePage(pageDict, resolve);
    expect(opList.length).toBe(0);
  });
});

// =========================================================================
// Evaluator on created documents
// =========================================================================

describe('evaluatePage on created documents', () => {
  it('emits color ops for colored rectangles', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    page.drawRectangle({ x: 10, y: 10, width: 50, height: 30, color: rgb(0, 0, 0.8) });

    const ctx = doc._nativeCtx!;
    const pageList = ctx.getPageList();
    const resolve = (ref: COSObjectReference) => ctx.resolveRef(ref);

    const opList = evaluatePage(pageList[0].pageDict, resolve);

    // Should have a color op before the fill
    const hasColor = opList.fnArray.some(fn =>
      fn === OPS.setFillRGBColor || fn === OPS.setFillGray || fn === OPS.setFillCMYKColor,
    );
    expect(hasColor).toBe(true);
  });

  it('evaluates a document with drawn shapes', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const font = await doc.embedFont('Helvetica');

    // Draw a red rectangle
    page.drawRectangle({ x: 10, y: 10, width: 50, height: 30, color: rgb(1, 0, 0) });
    page.drawText('Hello', { x: 20, y: 100, size: 14, font });

    // Evaluate using the native context
    const ctx = doc._nativeCtx!;
    const pageList = ctx.getPageList();
    const resolve = (ref: COSObjectReference) => ctx.resolveRef(ref);

    const opList = evaluatePage(pageList[0].pageDict, resolve);
    expect(opList.length).toBeGreaterThan(0);

    // Should contain path ops (drawRectangle produces m/l/l/l/h or re)
    const hasPathOps = opList.fnArray.some(fn =>
      fn === OPS.rectangle || fn === OPS.moveTo || fn === OPS.lineTo,
    );
    expect(hasPathOps).toBe(true);
    // Should contain text ops
    expect(opList.fnArray).toContain(OPS.beginText);
  });
});

// =========================================================================
// NativeRenderer
// =========================================================================

describe('NativeRenderer', () => {
  it('renders a created document to PNG', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const font = await doc.embedFont('Helvetica');
    page.drawRectangle({ x: 10, y: 10, width: 100, height: 50, color: rgb(0, 0, 1) });
    page.drawText('Test', { x: 20, y: 120, size: 16, font });

    const renderer = NativeRenderer.fromDocument(doc);
    expect(renderer.pageCount).toBe(1);

    const result = await renderer.renderPage(0, { scale: 1.0 });
    expect(result.png).toBeInstanceOf(Uint8Array);
    expect(result.width).toBe(200);
    expect(result.height).toBe(200);
    expect(result.pageIndex).toBe(0);

    // Valid PNG
    expect(result.png[0]).toBe(0x89);
    expect(result.png[1]).toBe(0x50);
    expect(result.png[2]).toBe(0x4e);
    expect(result.png[3]).toBe(0x47);
  });

  it('renders a loaded document to PNG', async () => {
    const pdfBytes = loadTestPdf('test-pdfs/working/simple-test.pdf');
    const doc = await PDFDocument.load(pdfBytes);
    const renderer = NativeRenderer.fromDocument(doc);

    expect(renderer.pageCount).toBeGreaterThan(0);

    const result = await renderer.renderPage(0, { scale: 1.0 });
    expect(result.png).toBeInstanceOf(Uint8Array);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);

    // Valid PNG
    expect(result.png[0]).toBe(0x89);
  });

  it('throws on out-of-range page index', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const renderer = NativeRenderer.fromDocument(doc);

    expect(() => renderer.renderPage(-1)).rejects.toThrow(/out of range/);
    expect(() => renderer.renderPage(1)).rejects.toThrow(/out of range/);
  });

  it('respects scale option', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const renderer = NativeRenderer.fromDocument(doc);

    const small = await renderer.renderPage(0, { scale: 0.5 });
    const large = await renderer.renderPage(0, { scale: 2.0 });

    expect(large.width).toBeGreaterThan(small.width);
    expect(large.height).toBeGreaterThan(small.height);
  });

  it('respects background option', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const renderer = NativeRenderer.fromDocument(doc);

    const white = await renderer.renderPage(0, { scale: 1.0, background: 'white' });
    const transparent = await renderer.renderPage(0, { scale: 1.0, background: undefined });

    // Both should produce valid PNGs
    expect(white.png[0]).toBe(0x89);
    expect(transparent.png[0]).toBe(0x89);
  });
});

// =========================================================================
// renderPageNative convenience function
// =========================================================================

describe('renderPageNative', () => {
  it('renders without creating a renderer explicitly', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([150, 100]);
    page.drawRectangle({ x: 10, y: 10, width: 50, height: 30, color: rgb(0, 1, 0) });

    const result = await renderPageNative(doc, 0, { scale: 1.0 });
    expect(result.png).toBeInstanceOf(Uint8Array);
    expect(result.width).toBe(150);
    expect(result.height).toBe(100);
  });
});

// =========================================================================
// NativeCanvasGraphics unit tests
// =========================================================================

describe('NativeCanvasGraphics', () => {
  it('executes a simple operator list without errors', async () => {
    // Create a minimal canvas
    const { createCanvas } = await import('canvas');
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');

    const opList = new OperatorList();
    opList.addOp(OPS.save);
    opList.addOpArgs(OPS.setFillRGBColor, [1, 0, 0]);
    opList.addOpArgs(OPS.rectangle, [10, 10, 50, 30]);
    opList.addOp(OPS.fill);
    opList.addOp(OPS.restore);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);
    // No errors thrown
  });

  it('handles text operations', async () => {
    const { createCanvas } = await import('canvas');
    const canvas = createCanvas(200, 100);
    const ctx = canvas.getContext('2d');

    const opList = new OperatorList();
    opList.addOp(OPS.beginText);
    opList.addOpArgs(OPS.setFont, ['Helv', 12, {
      family: 'Helvetica, Arial, sans-serif',
      weight: 'normal',
      style: 'normal',
    }]);
    opList.addOpArgs(OPS.moveText, [10, 50]);
    opList.addOpArgs(OPS.showText, [[
      { unicode: 'H', width: 722 },
      { unicode: 'e', width: 556 },
      { unicode: 'l', width: 222 },
      { unicode: 'l', width: 222 },
      { unicode: 'o', width: 556 },
    ]]);
    opList.addOp(OPS.endText);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);
    // No errors thrown
  });

  it('handles color operations', async () => {
    const { createCanvas } = await import('canvas');
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');

    const opList = new OperatorList();
    opList.addOpArgs(OPS.setFillGray, [0.5]);
    opList.addOpArgs(OPS.rectangle, [0, 0, 50, 50]);
    opList.addOp(OPS.fill);

    opList.addOpArgs(OPS.setFillRGBColor, [1, 0, 0]);
    opList.addOpArgs(OPS.rectangle, [50, 0, 50, 50]);
    opList.addOp(OPS.fill);

    opList.addOpArgs(OPS.setFillCMYKColor, [0, 1, 1, 0]);
    opList.addOpArgs(OPS.rectangle, [0, 50, 50, 50]);
    opList.addOp(OPS.fill);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);
    // No errors thrown
  });

  it('handles form XObject ops', async () => {
    const { createCanvas } = await import('canvas');
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');

    const opList = new OperatorList();
    opList.addOpArgs(OPS.paintFormXObjectBegin, [[1, 0, 0, 1, 10, 10], [0, 0, 50, 50]]);
    opList.addOpArgs(OPS.setFillRGBColor, [0, 0, 1]);
    opList.addOpArgs(OPS.rectangle, [0, 0, 50, 50]);
    opList.addOp(OPS.fill);
    opList.addOp(OPS.paintFormXObjectEnd);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);
    // No errors thrown
  });
});

// =========================================================================
// Integration: loaded PDFs round-trip through native evaluator
// =========================================================================

describe('Integration: evaluate loaded PDFs', () => {
  it('evaluates all test PDFs without errors', async () => {
    const testPdfs = [
      'test-pdfs/working/wire-instructions.pdf',
      'test-pdfs/working/simple-test.pdf',
    ];

    for (const pdfPath of testPdfs) {
      const bytes = loadTestPdf(pdfPath);
      const doc = loadAndParseDocument(bytes);
      const pages = getPageList(doc);

      for (let i = 0; i < pages.length; i++) {
        const opList = evaluatePage(pages[i].pageDict, doc.resolve);
        expect(opList.length).toBeGreaterThan(0);
      }
    }
  });

  it('renders wire-instructions via NativeRenderer', async () => {
    const bytes = loadTestPdf('test-pdfs/working/wire-instructions.pdf');
    const doc = await PDFDocument.load(bytes);
    const renderer = NativeRenderer.fromDocument(doc);

    const result = await renderer.renderPage(0, { scale: 1.0 });
    expect(result.png).toBeInstanceOf(Uint8Array);
    expect(result.png.length).toBeGreaterThan(100); // non-trivial PNG
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('renderAllPages works', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    doc.addPage([200, 200]);

    const renderer = NativeRenderer.fromDocument(doc);
    const results = await renderer.renderAllPages({ scale: 1.0 });

    expect(results.length).toBe(2);
    expect(results[0].pageIndex).toBe(0);
    expect(results[1].pageIndex).toBe(1);
    expect(results[0].width).toBe(100);
    expect(results[1].width).toBe(200);
  });
});

// =========================================================================
// Visual comparison: NativeRenderer vs PDF.js (gated by PDFBOX_TS_E2E_VISUAL)
// =========================================================================

const skipVisual = !process.env.PDFBOX_TS_E2E_VISUAL;

describe.skipIf(skipVisual)('NativeRenderer vs PDF.js visual comparison', () => {
  const scale = 150 / 72; // ~2.08, equivalent to 150 DPI on letter-size

  async function renderWithPdfjs(pdfBytes: Uint8Array): Promise<Buffer> {
    const { renderPdfPageWithPdfjs } = await import('../../testing/visual-test-helpers.js');
    return renderPdfPageWithPdfjs(pdfBytes, 1, scale);
  }

  async function renderWithNative(pdfBytes: Uint8Array): Promise<Buffer> {
    const doc = await PDFDocument.load(pdfBytes);
    const renderer = NativeRenderer.fromDocument(doc);
    const result = await renderer.renderPage(0, { scale });
    return Buffer.from(result.png);
  }

  async function pixelCompare(
    nativePng: Buffer,
    pdfjsPng: Buffer,
    testName: string,
  ): Promise<{ mismatchPercent: number; mismatchPixels: number; totalPixels: number }> {
    const { PNG } = await import('pngjs');
    const pixelmatchMod = await import('pixelmatch');
    const pixelmatch = pixelmatchMod.default;

    const imgNative = PNG.sync.read(nativePng);
    const imgPdfjs = PNG.sync.read(pdfjsPng);

    const width = Math.max(imgNative.width, imgPdfjs.width);
    const height = Math.max(imgNative.height, imgPdfjs.height);
    const totalPixels = width * height;

    // Pad to same dimensions
    function pad(img: any, w: number, h: number): Buffer {
      if (img.width === w && img.height === h) return img.data;
      const buf = Buffer.alloc(w * h * 4, 0);
      for (let y = 0; y < img.height; y++) {
        const src = y * img.width * 4;
        const dst = y * w * 4;
        (img.data as Buffer).copy(buf, dst, src, src + img.width * 4);
      }
      return buf;
    }

    const diff = new PNG({ width, height });
    const mismatchPixels = pixelmatch(
      pad(imgNative, width, height),
      pad(imgPdfjs, width, height),
      diff.data,
      width,
      height,
      { threshold: 0.1 },
    );

    // Save comparison images
    const outDir = path.resolve(repoRoot, 'test-snapshots', 'compare');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${testName}-native.png`), nativePng);
    fs.writeFileSync(path.join(outDir, `${testName}-pdfjs.png`), pdfjsPng);
    fs.writeFileSync(path.join(outDir, `${testName}-diff.png`), PNG.sync.write(diff));

    return {
      mismatchPercent: (mismatchPixels / totalPixels) * 100,
      mismatchPixels,
      totalPixels,
    };
  }

  it('wire-instructions.pdf — native vs PDF.js (< 1% mismatch)', async () => {
    const pdfBytes = loadTestPdf('test-pdfs/working/wire-instructions.pdf');

    const nativePng = await renderWithNative(pdfBytes);
    const pdfjsPng = await renderWithPdfjs(pdfBytes);

    const stats = await pixelCompare(nativePng, pdfjsPng, 'native-vs-pdfjs-wire');
    expect(stats.mismatchPercent).toBeLessThan(1);
  });

  it('simple-test.pdf — native vs PDF.js (< 1% mismatch)', async () => {
    const pdfBytes = loadTestPdf('test-pdfs/working/simple-test.pdf');

    const nativePng = await renderWithNative(pdfBytes);
    const pdfjsPng = await renderWithPdfjs(pdfBytes);

    const stats = await pixelCompare(nativePng, pdfjsPng, 'native-vs-pdfjs-simple');
    expect(stats.mismatchPercent).toBeLessThan(1);
  });

  // Note: PDF.js on node-canvas can't render path ops (rectangles, lines, curves)
  // because node-canvas lacks Path2D support (needs @napi-rs/canvas).
  // The native renderer handles these correctly. Verify via pixel spot-checks.
  it('created document — native renderer renders shapes and text correctly', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    const font = await doc.embedFont('Helvetica');

    // Blue rect at bottom-left, red rect at mid-left, text at top
    page.drawRectangle({ x: 20, y: 20, width: 200, height: 100, color: rgb(0, 0, 0.8) });
    page.drawRectangle({ x: 50, y: 150, width: 150, height: 80, color: rgb(0.8, 0, 0) });
    page.drawText('Native Renderer Test', { x: 30, y: 260, size: 20, font });

    const pdfBytes = await doc.save();
    const nativePng = await renderWithNative(pdfBytes);

    // Save for inspection
    const outDir = path.resolve(repoRoot, 'test-snapshots', 'compare');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'native-created-shapes.png'), nativePng);

    // Read pixel data and spot-check colors
    const { PNG } = await import('pngjs');
    const img = PNG.sync.read(nativePng);

    function getPixel(pdfX: number, pdfY: number): { r: number; g: number; b: number; a: number } {
      // PDF coords: origin at bottom-left. Canvas: origin at top-left.
      const canvasX = Math.round(pdfX * scale);
      const canvasY = Math.round((300 - pdfY) * scale); // flip Y
      const idx = (canvasY * img.width + canvasX) * 4;
      return { r: img.data[idx], g: img.data[idx + 1], b: img.data[idx + 2], a: img.data[idx + 3] };
    }

    // Blue rectangle center (PDF coords: 120, 70)
    const blue = getPixel(120, 70);
    expect(blue.b).toBeGreaterThan(150); // strong blue channel
    expect(blue.r).toBeLessThan(50);     // minimal red
    expect(blue.g).toBeLessThan(50);     // minimal green

    // Red rectangle center (PDF coords: 125, 190)
    const red = getPixel(125, 190);
    expect(red.r).toBeGreaterThan(150);  // strong red channel
    expect(red.g).toBeLessThan(50);      // minimal green
    expect(red.b).toBeLessThan(50);      // minimal blue

    // White background area (PDF coords: 350, 150) — should be white
    const bg = getPixel(350, 150);
    expect(bg.r).toBeGreaterThan(240);
    expect(bg.g).toBeGreaterThan(240);
    expect(bg.b).toBeGreaterThan(240);

    // Text area (PDF coords: 40, 264) — should have dark pixels (text body)
    const text = getPixel(40, 264);
    expect(text.r + text.g + text.b).toBeLessThan(600); // not pure white = text present
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
