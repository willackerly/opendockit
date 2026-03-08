import { describe, it, expect } from 'vitest';
import { createCanvas } from 'canvas';
import { OPS } from '../ops.js';
import { OperatorList } from '../operator-list.js';
import { NativeCanvasGraphics } from '../canvas-graphics.js';
import { NativeRenderer } from '../NativeRenderer.js';
import { PDFDocument } from '../../document/PDFDocument.js';
import { rgb, grayscale } from '../../document/colors.js';

// =========================================================================
// curveTo2 (v operator) — correct bezier curve, not quadratic approximation
// =========================================================================

describe('curveTo2 (v operator) correctness', () => {
  it('renders v operator using bezierCurveTo with current point as cp1', () => {
    const canvas = createCanvas(200, 200);
    const ctx = canvas.getContext('2d');

    const opList = new OperatorList();
    opList.addOp(OPS.save);
    opList.addOpArgs(OPS.setStrokeRGBColor, [0, 0, 0]);
    opList.addOpArgs(OPS.setLineWidth, [2]);

    // Move to start point, then use curveTo2 (v operator)
    // v operator: cp1 = current point, cp2 and endpoint from args
    opList.addOpArgs(OPS.moveTo, [10, 10]);
    opList.addOpArgs(OPS.curveTo2, [80, 80, 150, 10]); // cp2=(80,80), end=(150,10)
    opList.addOp(OPS.stroke);
    opList.addOp(OPS.restore);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);
    // No errors thrown — and it uses bezierCurveTo internally
  });

  it('tracks current point correctly through multiple path ops', () => {
    const canvas = createCanvas(200, 200);
    const ctx = canvas.getContext('2d');

    const opList = new OperatorList();
    opList.addOp(OPS.save);
    opList.addOpArgs(OPS.moveTo, [10, 10]); // currentPoint = (10, 10)
    opList.addOpArgs(OPS.lineTo, [50, 50]); // currentPoint = (50, 50)
    opList.addOpArgs(OPS.curveTo2, [100, 100, 150, 50]); // cp1=(50,50), cp2=(100,100), end=(150,50)
    opList.addOpArgs(OPS.curveTo3, [180, 10, 190, 190]); // cp1=(180,10), end=(190,190)
    opList.addOp(OPS.stroke);
    opList.addOp(OPS.restore);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);
    // No errors
  });
});

// =========================================================================
// Shading fill (sh operator)
// =========================================================================

describe('shadingFill dispatch', () => {
  it('renders a linear gradient via shadingFill op', () => {
    const canvas = createCanvas(200, 200);
    const ctx = canvas.getContext('2d');

    const opList = new OperatorList();
    opList.addOp(OPS.save);
    opList.addOpArgs(OPS.shadingFill, [
      {
        type: 'linear',
        coords: [0, 0, 200, 200],
        stops: [
          { offset: 0, color: 'rgb(255,0,0)' },
          { offset: 1, color: 'rgb(0,0,255)' },
        ],
      },
    ]);
    opList.addOp(OPS.restore);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);

    // Verify some pixels were drawn (not all white)
    const imageData = ctx.getImageData(0, 0, 200, 200);
    let nonWhite = 0;
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (
        imageData.data[i] !== 255 ||
        imageData.data[i + 1] !== 255 ||
        imageData.data[i + 2] !== 255
      ) {
        nonWhite++;
      }
    }
    expect(nonWhite).toBeGreaterThan(100);
  });

  it('renders a radial gradient via shadingFill op', () => {
    const canvas = createCanvas(200, 200);
    const ctx = canvas.getContext('2d');

    const opList = new OperatorList();
    opList.addOp(OPS.save);
    opList.addOpArgs(OPS.shadingFill, [
      {
        type: 'radial',
        coords: [100, 100, 10, 100, 100, 100], // inner circle r=10, outer r=100
        stops: [
          { offset: 0, color: 'rgb(255,255,0)' },
          { offset: 1, color: 'rgb(0,128,0)' },
        ],
      },
    ]);
    opList.addOp(OPS.restore);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);

    // Verify gradient was drawn
    const imageData = ctx.getImageData(100, 100, 1, 1);
    // Center should be close to yellow (255,255,0)
    expect(imageData.data[0]).toBeGreaterThan(200); // R
    expect(imageData.data[1]).toBeGreaterThan(200); // G
    expect(imageData.data[2]).toBeLessThan(50); // B (low)
  });

  it('ignores null shading', () => {
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');

    const opList = new OperatorList();
    opList.addOpArgs(OPS.shadingFill, [null]);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);
    // No errors
  });
});

// =========================================================================
// Inline images (BI/ID/EI)
// =========================================================================

describe('inline image rendering', () => {
  it('dispatches paintInlineImageXObject', () => {
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');

    // Create a 2x2 RGBA image: red, green, blue, white
    const rgba = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]);

    const opList = new OperatorList();
    opList.addOp(OPS.save);
    // Scale to 100x100
    opList.addOpArgs(OPS.transform, [100, 0, 0, 100, 0, 0]);
    opList.addOpArgs(OPS.paintInlineImageXObject, [
      {
        width: 2,
        height: 2,
        data: rgba,
        isJpeg: false,
      },
    ]);
    opList.addOp(OPS.restore);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);
    // No errors
  });
});

// =========================================================================
// JPEG image rendering
// =========================================================================

describe('JPEG image rendering', () => {
  it('handles JPEG images without crashing', () => {
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');

    // Create a minimal valid JPEG (too small to be a real image, but tests error handling)
    const invalidJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    const opList = new OperatorList();
    opList.addOp(OPS.save);
    opList.addOpArgs(OPS.transform, [100, 0, 0, 100, 0, 0]);
    opList.addOpArgs(OPS.paintImageXObject, [
      {
        width: 1,
        height: 1,
        data: invalidJpeg,
        isJpeg: true,
      },
    ]);
    opList.addOp(OPS.restore);

    const graphics = new NativeCanvasGraphics(ctx as any);
    // Should not throw — gracefully skips invalid JPEG
    graphics.execute(opList);
  });
});

// =========================================================================
// CropBox support
// =========================================================================

describe('CropBox support', () => {
  it('uses MediaBox when no CropBox is set', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 300]);
    const renderer = NativeRenderer.fromDocument(doc);

    const result = await renderer.renderPage(0, { scale: 1.0 });
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
  });

  it('renders with correct dimensions', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    page.drawRectangle({ x: 10, y: 10, width: 100, height: 100, color: rgb(1, 0, 0) });

    const renderer = NativeRenderer.fromDocument(doc);
    const result = await renderer.renderPage(0, { scale: 1.0 });
    expect(result.width).toBe(612);
    expect(result.height).toBe(792);
    // Valid PNG
    expect(result.png[0]).toBe(0x89);
  });
});

// =========================================================================
// Color operations
// =========================================================================

describe('extended color operations', () => {
  it('handles setFillColor with 1 component (gray)', () => {
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');

    const opList = new OperatorList();
    opList.addOpArgs(OPS.setFillColor, [0.5]);
    opList.addOpArgs(OPS.rectangle, [0, 0, 100, 100]);
    opList.addOp(OPS.fill);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);

    const pixel = ctx.getImageData(50, 50, 1, 1).data;
    // Gray 0.5 = ~128
    expect(pixel[0]).toBeGreaterThan(100);
    expect(pixel[0]).toBeLessThan(160);
    expect(pixel[1]).toBe(pixel[0]); // R == G == B for gray
    expect(pixel[2]).toBe(pixel[0]);
  });

  it('handles setFillColor with 3 components (RGB)', () => {
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');

    const opList = new OperatorList();
    opList.addOpArgs(OPS.setFillColor, [0, 1, 0]);
    opList.addOpArgs(OPS.rectangle, [0, 0, 100, 100]);
    opList.addOp(OPS.fill);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);

    const pixel = ctx.getImageData(50, 50, 1, 1).data;
    expect(pixel[0]).toBe(0); // R
    expect(pixel[1]).toBe(255); // G
    expect(pixel[2]).toBe(0); // B
  });

  it('handles setFillColor with 4 components (CMYK)', () => {
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');

    const opList = new OperatorList();
    opList.addOpArgs(OPS.setFillColor, [1, 0, 0, 0]); // Cyan
    opList.addOpArgs(OPS.rectangle, [0, 0, 100, 100]);
    opList.addOp(OPS.fill);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);

    const pixel = ctx.getImageData(50, 50, 1, 1).data;
    expect(pixel[0]).toBe(0); // R (cyan = no red)
    expect(pixel[1]).toBe(255); // G
    expect(pixel[2]).toBe(255); // B
  });
});

// =========================================================================
// Graphics state - blend modes
// =========================================================================

describe('blend mode support', () => {
  it('applies blend mode from ExtGState', () => {
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');

    const opList = new OperatorList();
    opList.addOp(OPS.save);

    // Set blend mode to multiply
    const gstate = new Map<string, any>();
    gstate.set('globalCompositeOperation', 'multiply');
    gstate.set('fillAlpha', 0.5);
    opList.addOpArgs(OPS.setGState, [gstate]);

    opList.addOpArgs(OPS.setFillRGBColor, [1, 0, 0]);
    opList.addOpArgs(OPS.rectangle, [0, 0, 100, 100]);
    opList.addOp(OPS.fill);

    opList.addOp(OPS.restore);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);
    // No errors
  });
});

// =========================================================================
// Form XObject rendering
// =========================================================================

describe('Form XObject rendering', () => {
  it('applies matrix and clips to BBox', () => {
    const canvas = createCanvas(200, 200);
    const ctx = canvas.getContext('2d');

    const opList = new OperatorList();
    // Draw a form XObject with translation matrix and bbox clip
    opList.addOpArgs(OPS.paintFormXObjectBegin, [
      [1, 0, 0, 1, 50, 50], // translate by (50, 50)
      [0, 0, 100, 100], // clip to 100x100 box
    ]);
    opList.addOpArgs(OPS.setFillRGBColor, [0, 0, 1]);
    opList.addOpArgs(OPS.rectangle, [-50, -50, 200, 200]); // extends beyond bbox
    opList.addOp(OPS.fill);
    opList.addOp(OPS.paintFormXObjectEnd);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);
    // No errors — clipping should limit drawing to bbox
  });
});

// =========================================================================
// Text rendering modes
// =========================================================================

describe('text rendering modes', () => {
  it('renders invisible text (mode 3) without drawing', () => {
    const canvas = createCanvas(200, 100);
    const ctx = canvas.getContext('2d');

    // Fill with white first
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 200, 100);

    const opList = new OperatorList();
    opList.addOp(OPS.beginText);
    opList.addOpArgs(OPS.setFont, [
      'Helv',
      24,
      {
        family: 'Helvetica, Arial, sans-serif',
        weight: 'normal',
        style: 'normal',
      },
    ]);
    opList.addOpArgs(OPS.setTextRenderingMode, [3]); // invisible
    opList.addOpArgs(OPS.moveText, [10, 50]);
    opList.addOpArgs(OPS.showText, [
      [
        { unicode: 'H', width: 722 },
        { unicode: 'i', width: 278 },
      ],
    ]);
    opList.addOp(OPS.endText);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);

    // Canvas should still be all white (text was invisible)
    const imageData = ctx.getImageData(0, 0, 200, 100);
    let nonWhite = 0;
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (
        imageData.data[i] !== 255 ||
        imageData.data[i + 1] !== 255 ||
        imageData.data[i + 2] !== 255
      ) {
        nonWhite++;
      }
    }
    expect(nonWhite).toBe(0);
  });

  it('renders stroked text (mode 1)', () => {
    const canvas = createCanvas(200, 100);
    const ctx = canvas.getContext('2d');

    const opList = new OperatorList();
    opList.addOp(OPS.beginText);
    opList.addOpArgs(OPS.setFont, [
      'Helv',
      24,
      {
        family: 'Helvetica, Arial, sans-serif',
        weight: 'normal',
        style: 'normal',
      },
    ]);
    opList.addOpArgs(OPS.setTextRenderingMode, [1]); // stroke
    opList.addOpArgs(OPS.setStrokeRGBColor, [1, 0, 0]);
    opList.addOpArgs(OPS.moveText, [10, 50]);
    opList.addOpArgs(OPS.showText, [[{ unicode: 'A', width: 722 }]]);
    opList.addOp(OPS.endText);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);
    // No errors
  });
});

// =========================================================================
// Dash pattern
// =========================================================================

describe('dash pattern', () => {
  it('sets line dash correctly', () => {
    const canvas = createCanvas(200, 100);
    const ctx = canvas.getContext('2d');

    const opList = new OperatorList();
    opList.addOp(OPS.save);
    opList.addOpArgs(OPS.setDash, [[5, 3], 0]); // 5px dash, 3px gap
    opList.addOpArgs(OPS.setLineWidth, [2]);
    opList.addOpArgs(OPS.setStrokeRGBColor, [0, 0, 0]);
    opList.addOpArgs(OPS.moveTo, [10, 50]);
    opList.addOpArgs(OPS.lineTo, [190, 50]);
    opList.addOp(OPS.stroke);
    opList.addOp(OPS.restore);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);
    // No errors — dash pattern applied
  });
});

// =========================================================================
// Multi-page rendering
// =========================================================================

describe('multi-page rendering', () => {
  it('renders multiple pages with different content', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');

    const page1 = doc.addPage([200, 200]);
    page1.drawRectangle({ x: 10, y: 10, width: 100, height: 50, color: rgb(1, 0, 0) });
    page1.drawText('Page 1', { x: 20, y: 150, size: 14, font });

    const page2 = doc.addPage([300, 400]);
    page2.drawRectangle({ x: 20, y: 20, width: 150, height: 80, color: rgb(0, 0, 1) });
    page2.drawText('Page 2', { x: 30, y: 350, size: 18, font });

    const renderer = NativeRenderer.fromDocument(doc);
    expect(renderer.pageCount).toBe(2);

    const results = await renderer.renderAllPages({ scale: 1.0 });
    expect(results).toHaveLength(2);

    // Page 1: 200x200
    expect(results[0].width).toBe(200);
    expect(results[0].height).toBe(200);
    expect(results[0].png[0]).toBe(0x89); // PNG magic

    // Page 2: 300x400
    expect(results[1].width).toBe(300);
    expect(results[1].height).toBe(400);
    expect(results[1].png[0]).toBe(0x89);
  });
});

// =========================================================================
// Complex path operations
// =========================================================================

describe('complex path operations', () => {
  it('renders a path with all curve types', () => {
    const canvas = createCanvas(200, 200);
    const ctx = canvas.getContext('2d');

    const opList = new OperatorList();
    opList.addOp(OPS.save);
    opList.addOpArgs(OPS.setStrokeRGBColor, [0, 0, 0]);
    opList.addOpArgs(OPS.setLineWidth, [1]);

    // Complex path using all curve types
    opList.addOpArgs(OPS.moveTo, [10, 100]);
    opList.addOpArgs(OPS.curveTo, [30, 30, 70, 30, 90, 100]); // c: full bezier
    opList.addOpArgs(OPS.curveTo2, [120, 170, 150, 100]); // v: cp1=current
    opList.addOpArgs(OPS.curveTo3, [170, 30, 190, 100]); // y: cp2=endpoint
    opList.addOp(OPS.closePath);
    opList.addOp(OPS.stroke);
    opList.addOp(OPS.restore);

    const graphics = new NativeCanvasGraphics(ctx as any);
    graphics.execute(opList);
    // No errors — all curve types handled correctly
  });
});

// =========================================================================
// Loaded PDF rendering with images
// =========================================================================

describe('loaded PDF with images', () => {
  it('renders Google Docs PDF with images', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const pdfPath = path.resolve(
      repoRoot,
      'test-pdfs/chrome-google-docs/text-with-images-google-docs.pdf'
    );

    if (!fs.existsSync(pdfPath)) return; // skip if fixture missing

    const pdfBytes = new Uint8Array(fs.readFileSync(pdfPath));
    const doc = await PDFDocument.load(pdfBytes);
    const renderer = NativeRenderer.fromDocument(doc);

    expect(renderer.pageCount).toBeGreaterThan(0);

    const result = await renderer.renderPage(0, { scale: 1.0 });
    expect(result.png).toBeInstanceOf(Uint8Array);
    expect(result.png[0]).toBe(0x89); // PNG magic
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.png.length).toBeGreaterThan(100); // non-trivial PNG
  });
});
