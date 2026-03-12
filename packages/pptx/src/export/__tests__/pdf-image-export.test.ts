/**
 * Tests for PDF image embedding, gradient shading, and transparency
 * in the PPTX -> PDF export pipeline.
 *
 * Verifies:
 * - Image collector finds PictureIR elements across slide layers
 * - Image MIME type detection from magic bytes
 * - JPEG and PNG images are embedded as XObjects in the exported PDF
 * - Gradient fills produce pattern references in content streams
 * - ExtGState transparency is tracked by PDFBackend
 * - Existing exporter and font embedding tests still pass (run separately)
 */

import { describe, expect, it } from 'vitest';
import { exportPresentationToPdf } from '../pdf-exporter.js';
import {
  collectImagesFromSlide,
  collectImagesFromPresentation,
  detectImageMimeType,
} from '../pdf-image-collector.js';
import {
  renderSlideToPdf,
  renderBackgroundToPdf,
  ShadingCollector,
} from '../pdf-slide-renderer.js';
import { ContentStreamBuilder } from '@opendockit/pdf-signer';
import { PDFBackend, PDFGradient } from '@opendockit/render';
import type {
  PresentationIR,
  SlideIR,
  SlideLayoutIR,
  SlideMasterIR,
  ThemeIR,
  ResolvedColor,
  DrawingMLShapeIR,
  PictureIR,
  PictureFillIR,
  TransformIR,
  ShapePropertiesIR,
  GradientFillIR,
  GroupIR,
} from '@opendockit/core';
import type { EnrichedSlideData } from '../../model/index.js';
import { EMU_PER_PT } from '@opendockit/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const black: ResolvedColor = { r: 0, g: 0, b: 0, a: 1 };
const white: ResolvedColor = { r: 255, g: 255, b: 255, a: 1 };

function createMinimalTheme(): ThemeIR {
  return {
    name: 'Test Theme',
    colorScheme: {
      dk1: black,
      lt1: white,
      dk2: black,
      lt2: white,
      accent1: { r: 79, g: 129, b: 189, a: 1 },
      accent2: { r: 192, g: 80, b: 77, a: 1 },
      accent3: { r: 155, g: 187, b: 89, a: 1 },
      accent4: { r: 128, g: 100, b: 162, a: 1 },
      accent5: { r: 75, g: 172, b: 198, a: 1 },
      accent6: { r: 247, g: 150, b: 70, a: 1 },
      hlink: { r: 0, g: 0, b: 255, a: 1 },
      folHlink: { r: 128, g: 0, b: 128, a: 1 },
    },
    fontScheme: {
      majorLatin: 'Calibri Light',
      minorLatin: 'Calibri',
    },
    formatScheme: {
      fillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
      lineStyles: [{}, {}, {}],
      effectStyles: [[], [], []],
      bgFillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
    },
  };
}

const SLIDE_WIDTH_EMU = 12192000;
const SLIDE_HEIGHT_EMU = 6858000;

function makePresentation(slideCount: number, overrides?: Partial<PresentationIR>): PresentationIR {
  const slides: PresentationIR['slides'] = [];
  for (let i = 0; i < slideCount; i++) {
    slides.push({
      index: i,
      partUri: `/ppt/slides/slide${i + 1}.xml`,
      layoutPartUri: '/ppt/slideLayouts/slideLayout1.xml',
      masterPartUri: '/ppt/slideMasters/slideMaster1.xml',
      relationshipId: `rId${i + 2}`,
    });
  }
  return {
    slideWidth: SLIDE_WIDTH_EMU,
    slideHeight: SLIDE_HEIGHT_EMU,
    slideCount,
    slides,
    theme: createMinimalTheme(),
    ...overrides,
  };
}

const emptyMaster: SlideMasterIR = {
  partUri: '/ppt/slideMasters/slideMaster1.xml',
  elements: [],
  colorMap: {},
};

const emptyLayout: SlideLayoutIR = {
  partUri: '/ppt/slideLayouts/slideLayout1.xml',
  elements: [],
  masterPartUri: '/ppt/slideMasters/slideMaster1.xml',
};

function makeSlide(overrides?: Partial<SlideIR>): SlideIR {
  return {
    partUri: '/ppt/slides/slide1.xml',
    elements: [],
    layoutPartUri: '/ppt/slideLayouts/slideLayout1.xml',
    masterPartUri: '/ppt/slideMasters/slideMaster1.xml',
    ...overrides,
  };
}

function makeEnriched(
  slideOverrides?: Partial<SlideIR>,
  layoutOverrides?: Partial<SlideLayoutIR>,
  masterOverrides?: Partial<SlideMasterIR>
): EnrichedSlideData {
  return {
    slide: makeSlide(slideOverrides),
    layout: { ...emptyLayout, ...layoutOverrides },
    master: { ...emptyMaster, ...masterOverrides },
  };
}

function makeTransform(overrides?: Partial<TransformIR>): TransformIR {
  return {
    position: { x: 914400, y: 914400 },
    size: { width: 1828800, height: 914400 },
    ...overrides,
  };
}

function makeProperties(overrides?: Partial<ShapePropertiesIR>): ShapePropertiesIR {
  return {
    effects: [],
    ...overrides,
  };
}

function makePicture(imagePartUri: string, overrides?: Partial<PictureIR>): PictureIR {
  return {
    kind: 'picture',
    imagePartUri,
    properties: makeProperties({ transform: makeTransform() }),
    nonVisualProperties: { name: 'Picture 1' },
    ...overrides,
  };
}

function makeShape(overrides?: Partial<DrawingMLShapeIR>): DrawingMLShapeIR {
  return {
    kind: 'shape',
    properties: makeProperties({ transform: makeTransform() }),
    ...overrides,
  };
}

/**
 * Create a minimal valid JPEG byte sequence (smallest possible JPEG).
 * 1x1 pixel, red.
 */
function createMinimalJpeg(): Uint8Array {
  // Minimal JPEG: SOI + APP0 + DQT + SOF0 + DHT + SOS + data + EOI
  // This is a precomputed 1x1 red pixel JPEG
  return new Uint8Array([
    0xff,
    0xd8, // SOI
    0xff,
    0xe0, // APP0 marker
    0x00,
    0x10, // Length = 16
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00, // "JFIF\0"
    0x01,
    0x01, // Version 1.1
    0x00, // Aspect ratio units
    0x00,
    0x01, // X density
    0x00,
    0x01, // Y density
    0x00,
    0x00, // No thumbnail
    0xff,
    0xdb, // DQT marker
    0x00,
    0x43, // Length = 67
    0x00, // Table 0, 8-bit precision
    // Quantization table (64 bytes, all 1s for simplicity)
    ...new Array(64).fill(0x01),
    0xff,
    0xc0, // SOF0 marker (baseline)
    0x00,
    0x0b, // Length = 11
    0x08, // Precision: 8 bits
    0x00,
    0x01, // Height: 1
    0x00,
    0x01, // Width: 1
    0x01, // Components: 1 (grayscale for simplicity)
    0x01,
    0x11,
    0x00, // Component 1: ID=1, sampling=1x1, quant table=0
    0xff,
    0xc4, // DHT marker
    0x00,
    0x1f, // Length = 31
    0x00, // DC table 0
    // Minimal Huffman table
    0x00,
    0x01,
    0x05,
    0x01,
    0x01,
    0x01,
    0x01,
    0x01,
    0x01,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x01,
    0x02,
    0x03,
    0x04,
    0x05,
    0x06,
    0x07,
    0x08,
    0x09,
    0x0a,
    0x0b,
    0xff,
    0xda, // SOS marker
    0x00,
    0x08, // Length = 8
    0x01, // Components: 1
    0x01,
    0x00, // Component 1: DC table 0, AC table 0
    0x00,
    0x3f,
    0x00, // Spectral selection
    0x7b,
    0x40, // Encoded data (minimal)
    0xff,
    0xd9, // EOI
  ]);
}

/**
 * Create a minimal valid PNG byte sequence (1x1 pixel, red).
 */
function createMinimalPng(): Uint8Array {
  // Minimal PNG: signature + IHDR + IDAT + IEND
  return new Uint8Array([
    // PNG signature
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    // IHDR chunk
    0x00,
    0x00,
    0x00,
    0x0d, // Length: 13
    0x49,
    0x48,
    0x44,
    0x52, // "IHDR"
    0x00,
    0x00,
    0x00,
    0x01, // Width: 1
    0x00,
    0x00,
    0x00,
    0x01, // Height: 1
    0x08, // Bit depth: 8
    0x02, // Color type: 2 (RGB)
    0x00, // Compression: 0
    0x00, // Filter: 0
    0x00, // Interlace: 0
    0x1e,
    0x92,
    0x6e,
    0x05, // CRC
    // IDAT chunk (deflated pixel data: filter byte 0 + RGB ff,00,00)
    0x00,
    0x00,
    0x00,
    0x0c, // Length: 12
    0x49,
    0x44,
    0x41,
    0x54, // "IDAT"
    0x08,
    0xd7,
    0x63,
    0xf8,
    0xcf,
    0xc0,
    0x00,
    0x00,
    0x01,
    0x01,
    0x01,
    0x00, // CRC (approximate)
    // IEND chunk
    0x00,
    0x00,
    0x00,
    0x00, // Length: 0
    0x49,
    0x45,
    0x4e,
    0x44, // "IEND"
    0xae,
    0x42,
    0x60,
    0x82, // CRC
  ]);
}

// ---------------------------------------------------------------------------
// Image Collector Tests
// ---------------------------------------------------------------------------

describe('collectImagesFromSlide', () => {
  it('collects picture elements from slide layer', () => {
    const slideData = makeEnriched({
      elements: [makePicture('/ppt/media/image1.png')],
    });

    const images = collectImagesFromSlide(slideData);

    expect(images).toHaveLength(1);
    expect(images[0].imagePartUri).toBe('/ppt/media/image1.png');
  });

  it('collects pictures from master layer', () => {
    const slideData = makeEnriched({}, {}, { elements: [makePicture('/ppt/media/logo.png')] });

    const images = collectImagesFromSlide(slideData);

    expect(images).toHaveLength(1);
    expect(images[0].imagePartUri).toBe('/ppt/media/logo.png');
  });

  it('collects pictures from layout layer', () => {
    const slideData = makeEnriched({}, { elements: [makePicture('/ppt/media/layout-bg.jpg')] });

    const images = collectImagesFromSlide(slideData);

    expect(images).toHaveLength(1);
    expect(images[0].imagePartUri).toBe('/ppt/media/layout-bg.jpg');
  });

  it('deduplicates images by part URI', () => {
    const slideData = makeEnriched({
      elements: [makePicture('/ppt/media/image1.png'), makePicture('/ppt/media/image1.png')],
    });

    const images = collectImagesFromSlide(slideData);

    expect(images).toHaveLength(1);
  });

  it('collects pictures from group children', () => {
    const group: GroupIR = {
      kind: 'group',
      properties: makeProperties({ transform: makeTransform() }),
      childOffset: { x: 0, y: 0 },
      childExtent: { width: 1828800, height: 914400 },
      children: [makePicture('/ppt/media/group-image.png')],
    };

    const slideData = makeEnriched({
      elements: [group],
    });

    const images = collectImagesFromSlide(slideData);

    expect(images).toHaveLength(1);
    expect(images[0].imagePartUri).toBe('/ppt/media/group-image.png');
  });

  it('skips master images when showMasterSp is false', () => {
    const slideData = makeEnriched(
      {},
      { showMasterSp: false },
      { elements: [makePicture('/ppt/media/master-logo.png')] }
    );

    const images = collectImagesFromSlide(slideData);

    expect(images).toHaveLength(0);
  });

  it('returns empty array for slides with no pictures', () => {
    const slideData = makeEnriched({
      elements: [makeShape()],
    });

    const images = collectImagesFromSlide(slideData);

    expect(images).toHaveLength(0);
  });

  it('records EMU dimensions from the picture transform', () => {
    const slideData = makeEnriched({
      elements: [
        makePicture('/ppt/media/image1.png', {
          properties: makeProperties({
            transform: makeTransform({
              size: { width: 3657600, height: 2743200 },
            }),
          }),
        }),
      ],
    });

    const images = collectImagesFromSlide(slideData);

    expect(images[0].widthEmu).toBe(3657600);
    expect(images[0].heightEmu).toBe(2743200);
  });
});

describe('collectImagesFromPresentation', () => {
  it('deduplicates across multiple slides', () => {
    const slides = [
      makeEnriched({ elements: [makePicture('/ppt/media/shared.png')] }),
      makeEnriched({ elements: [makePicture('/ppt/media/shared.png')] }),
      makeEnriched({ elements: [makePicture('/ppt/media/unique.jpg')] }),
    ];

    const images = collectImagesFromPresentation(slides);

    expect(images).toHaveLength(2);
    const uris = images.map((i) => i.imagePartUri);
    expect(uris).toContain('/ppt/media/shared.png');
    expect(uris).toContain('/ppt/media/unique.jpg');
  });
});

// ---------------------------------------------------------------------------
// MIME type detection
// ---------------------------------------------------------------------------

describe('detectImageMimeType', () => {
  it('detects JPEG from magic bytes', () => {
    const jpeg = createMinimalJpeg();
    expect(detectImageMimeType(jpeg)).toBe('image/jpeg');
  });

  it('detects PNG from magic bytes', () => {
    const png = createMinimalPng();
    expect(detectImageMimeType(png)).toBe('image/png');
  });

  it('detects GIF from magic bytes', () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(detectImageMimeType(gif)).toBe('image/gif');
  });

  it('detects BMP from magic bytes', () => {
    const bmp = new Uint8Array([0x42, 0x4d, 0x00, 0x00]);
    expect(detectImageMimeType(bmp)).toBe('image/bmp');
  });

  it('returns octet-stream for unknown formats', () => {
    const unknown = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
    expect(detectImageMimeType(unknown)).toBe('application/octet-stream');
  });

  it('returns octet-stream for empty bytes', () => {
    expect(detectImageMimeType(new Uint8Array([]))).toBe('application/octet-stream');
  });
});

// ---------------------------------------------------------------------------
// PDF Export with Images
// ---------------------------------------------------------------------------

describe('exportPresentationToPdf with images', () => {
  it('exports PDF with image XObjects when getImageBytes is provided', async () => {
    const jpeg = createMinimalJpeg();
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        elements: [makePicture('/ppt/media/image1.jpg')],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides, {
      getImageBytes: (partUri) => {
        if (partUri === '/ppt/media/image1.jpg') return jpeg;
        return undefined;
      },
    });

    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.imageCount).toBe(1);

    // The PDF should contain an XObject image reference
    const pdfText = new TextDecoder().decode(result.bytes);
    expect(pdfText).toContain('/XObject');
    expect(pdfText).toContain('/Im1');
    // Should have image properties
    expect(pdfText).toContain('/Subtype /Image');
    expect(pdfText).toContain('/DCTDecode');
  });

  it('exports PDF with PNG images', async () => {
    const png = createMinimalPng();
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        elements: [makePicture('/ppt/media/image1.png')],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides, {
      getImageBytes: (partUri) => {
        if (partUri === '/ppt/media/image1.png') return png;
        return undefined;
      },
    });

    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.imageCount).toBe(1);

    const pdfText = new TextDecoder().decode(result.bytes);
    expect(pdfText).toContain('/XObject');
    expect(pdfText).toContain('/Im1');
    expect(pdfText).toContain('/Subtype /Image');
    expect(pdfText).toContain('/FlateDecode');
  });

  it('renders placeholder when getImageBytes is not provided', async () => {
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        elements: [makePicture('/ppt/media/image1.jpg')],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides);

    expect(result.imageCount).toBe(0);
    // Should still produce a valid PDF
    const header = new TextDecoder().decode(result.bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('handles multiple images across slides', async () => {
    const jpeg = createMinimalJpeg();
    const png = createMinimalPng();
    const pres = makePresentation(2);
    const slides = [
      makeEnriched({
        elements: [makePicture('/ppt/media/photo.jpg')],
      }),
      makeEnriched({
        elements: [makePicture('/ppt/media/logo.png')],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides, {
      getImageBytes: (partUri) => {
        if (partUri === '/ppt/media/photo.jpg') return jpeg;
        if (partUri === '/ppt/media/logo.png') return png;
        return undefined;
      },
    });

    expect(result.imageCount).toBe(2);
    expect(result.pageCount).toBe(2);

    const pdfText = new TextDecoder().decode(result.bytes);
    expect(pdfText).toContain('/Im1');
    expect(pdfText).toContain('/Im2');
  });

  it('deduplicates shared images across slides', async () => {
    const jpeg = createMinimalJpeg();
    const pres = makePresentation(2);
    const slides = [
      makeEnriched({
        elements: [makePicture('/ppt/media/shared.jpg')],
      }),
      makeEnriched({
        elements: [makePicture('/ppt/media/shared.jpg')],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides, {
      getImageBytes: (partUri) => {
        if (partUri === '/ppt/media/shared.jpg') return jpeg;
        return undefined;
      },
    });

    // Only 1 unique image even though used on 2 slides
    expect(result.imageCount).toBe(1);
  });

  it('renders image Do operator in content stream', async () => {
    const jpeg = createMinimalJpeg();
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        elements: [makePicture('/ppt/media/image1.jpg')],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides, {
      getImageBytes: (partUri) => {
        if (partUri === '/ppt/media/image1.jpg') return jpeg;
        return undefined;
      },
    });

    const pdfText = new TextDecoder().decode(result.bytes);
    // Content stream should contain the Do operator for image rendering
    expect(pdfText).toContain('/Im1 Do');
  });
});

// ---------------------------------------------------------------------------
// PDFBackend Image Registration
// ---------------------------------------------------------------------------

describe('PDFBackend image registration', () => {
  it('registers and looks up images', () => {
    const backend = new PDFBackend(792);
    backend.registerImage('/ppt/media/img1.jpg', 'Im1', 800, 600);

    const img = backend.getRegisteredImage('/ppt/media/img1.jpg');
    expect(img).toBeDefined();
    expect(img!.resourceName).toBe('Im1');
    expect(img!.width).toBe(800);
    expect(img!.height).toBe(600);
  });

  it('drawRegisteredImage emits Do operator for registered image', () => {
    const backend = new PDFBackend(792);
    backend.registerImage('test-img', 'Im1', 100, 100);
    backend.drawRegisteredImage('test-img', 10, 20, 100, 50);

    const ops = backend.getOperators();
    expect(ops).toContain('/Im1 Do');
  });

  it('drawRegisteredImage emits placeholder for unregistered image', () => {
    const backend = new PDFBackend(792);
    backend.drawRegisteredImage('unknown-img', 10, 20, 100, 50);

    const ops = backend.getOperators();
    expect(ops).toContain('/ImgPlaceholder Do');
  });

  it('image resource declarations accumulate', () => {
    const backend = new PDFBackend(792);
    backend.addImageResourceDeclaration('/Im1 15 0 R');
    backend.addImageResourceDeclaration('/Im2 16 0 R');

    const decls = backend.getImageResourceDeclarations();
    expect(decls).toHaveLength(2);
    expect(decls).toContain('/Im1 15 0 R');
    expect(decls).toContain('/Im2 16 0 R');
  });
});

// ---------------------------------------------------------------------------
// PDFBackend Gradient Shading
// ---------------------------------------------------------------------------

describe('PDFBackend gradient shading', () => {
  it('records gradient shading with correct stops', () => {
    const backend = new PDFBackend(792);
    const grad = backend.createLinearGradient(0, 0, 100, 0) as unknown as PDFGradient;
    grad.addColorStop(0, '#FF0000');
    grad.addColorStop(0.5, '#00FF00');
    grad.addColorStop(1, '#0000FF');
    backend.fillStyle = grad as unknown as CanvasGradient;
    backend.fillRect(0, 0, 100, 50);

    const shadings = backend.getGradientShadings();
    expect(shadings).toHaveLength(1);
    expect(shadings[0].type).toBe('linear');
    expect(shadings[0].stops).toHaveLength(3);
    expect(shadings[0].stops[0].r).toBeCloseTo(1, 2); // red
    expect(shadings[0].stops[1].g).toBeCloseTo(1, 2); // #00FF00 = pure green
    expect(shadings[0].stops[2].b).toBeCloseTo(1, 2); // blue
  });

  it('records radial gradient shading', () => {
    const backend = new PDFBackend(792);
    const grad = backend.createRadialGradient(50, 50, 0, 50, 50, 50) as unknown as PDFGradient;
    grad.addColorStop(0, 'white');
    grad.addColorStop(1, 'black');
    backend.fillStyle = grad as unknown as CanvasGradient;
    backend.fillRect(0, 0, 100, 100);

    const shadings = backend.getGradientShadings();
    expect(shadings).toHaveLength(1);
    expect(shadings[0].type).toBe('radial');
    expect(shadings[0].coords).toEqual([50, 50, 0, 50, 50, 50]);
  });

  it('emits /Pattern cs and pattern name for gradient fills', () => {
    const backend = new PDFBackend(792);
    const grad = backend.createLinearGradient(0, 0, 100, 0) as unknown as PDFGradient;
    grad.addColorStop(0, '#FF0000');
    grad.addColorStop(1, '#0000FF');
    backend.fillStyle = grad as unknown as CanvasGradient;
    backend.fillRect(0, 0, 100, 50);

    const ops = backend.getOperators();
    const opsStr = ops.join('\n');
    expect(opsStr).toContain('/Pattern cs /P1 scn');
  });

  it('assigns unique pattern names for multiple gradients', () => {
    const backend = new PDFBackend(792);

    // First gradient
    const grad1 = backend.createLinearGradient(0, 0, 100, 0) as unknown as PDFGradient;
    grad1.addColorStop(0, 'red');
    grad1.addColorStop(1, 'blue');
    backend.fillStyle = grad1 as unknown as CanvasGradient;
    backend.fillRect(0, 0, 100, 50);

    // Second gradient
    const grad2 = backend.createLinearGradient(0, 0, 0, 100) as unknown as PDFGradient;
    grad2.addColorStop(0, 'green');
    grad2.addColorStop(1, 'yellow');
    backend.fillStyle = grad2 as unknown as CanvasGradient;
    backend.fillRect(0, 50, 100, 50);

    const shadings = backend.getGradientShadings();
    expect(shadings).toHaveLength(2);
    expect(shadings[0].patternName).toBe('P1');
    expect(shadings[1].patternName).toBe('P2');
  });
});

// ---------------------------------------------------------------------------
// PDFBackend ExtGState Transparency
// ---------------------------------------------------------------------------

describe('PDFBackend transparency', () => {
  it('emits ExtGState operator when globalAlpha changes', () => {
    const backend = new PDFBackend(792);
    backend.globalAlpha = 0.5;

    const ops = backend.getOperators();
    const opsStr = ops.join('\n');
    expect(opsStr).toContain('/GS1 gs');
  });

  it('tracks unique alpha values', () => {
    const backend = new PDFBackend(792);
    backend.globalAlpha = 0.5;
    backend.globalAlpha = 0.3;
    backend.globalAlpha = 0.5; // duplicate, should reuse GS1

    const entries = backend.getExtGStateEntries();
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.name === 'GS1')!.fillAlpha).toBeCloseTo(0.5, 3);
    expect(entries.find((e) => e.name === 'GS2')!.fillAlpha).toBeCloseTo(0.3, 3);
  });

  it('does not emit gs operator when alpha stays the same', () => {
    const backend = new PDFBackend(792);
    // Initial alpha is 1, setting to 1 should not emit gs
    backend.globalAlpha = 1;

    const ops = backend.getOperators();
    const hasGs = ops.some((op) => op.includes('gs'));
    expect(hasGs).toBe(false);
  });

  it('ExtGState entries are retrievable for resource wiring', () => {
    const backend = new PDFBackend(792);
    backend.globalAlpha = 0.7;

    const entries = backend.getExtGStateEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('GS1');
    expect(entries[0].fillAlpha).toBeCloseTo(0.7, 3);
    expect(entries[0].strokeAlpha).toBeCloseTo(0.7, 3);
  });

  it('ExtGState declarations accumulate', () => {
    const backend = new PDFBackend(792);
    backend.addExtGStateDeclaration('/GS1 20 0 R');
    backend.addExtGStateDeclaration('/GS2 21 0 R');

    const decls = backend.getExtGStateDeclarations();
    expect(decls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// PDF Export with Gradients
// ---------------------------------------------------------------------------

describe('exportPresentationToPdf with gradients', () => {
  it('produces valid PDF with gradient fill shapes', async () => {
    const gradientFill: GradientFillIR = {
      type: 'gradient',
      kind: 'linear',
      angle: 90,
      stops: [
        { position: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
        { position: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
      ],
    };

    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        elements: [
          makeShape({
            properties: makeProperties({
              transform: makeTransform(),
              fill: gradientFill,
            }),
          }),
        ],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides);

    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.bytes.length).toBeGreaterThan(0);

    // Should produce a valid PDF
    const header = new TextDecoder().decode(result.bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('produces valid PDF with gradient background', async () => {
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        background: {
          fill: {
            type: 'gradient',
            kind: 'linear',
            angle: 0,
            stops: [
              { position: 0, color: { r: 200, g: 200, b: 200, a: 1 } },
              { position: 1, color: { r: 100, g: 100, b: 100, a: 1 } },
            ],
          },
        },
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides);

    const header = new TextDecoder().decode(result.bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
    expect(result.pageCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Gradient Shading — Content Stream Operators
// ---------------------------------------------------------------------------

describe('gradient shading in content stream', () => {
  it('emits sh operator for linear gradient background', () => {
    const builder = new ContentStreamBuilder();
    const collector = new ShadingCollector();

    renderBackgroundToPdf(
      builder,
      {
        fill: {
          type: 'gradient',
          kind: 'linear',
          angle: 0,
          stops: [
            { position: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
          ],
        },
      },
      720,
      540,
      collector
    );

    const ops = builder.toString();
    // Should contain clip + shading paint operator
    expect(ops).toContain('W');
    expect(ops).toContain('/Sh1 sh');

    // Should have created a shading request
    const requests = collector.getRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].name).toBe('Sh1');
    expect(requests[0].type).toBe(2); // axial
    expect(requests[0].stops).toHaveLength(2);
  });

  it('emits sh operator for radial gradient background', () => {
    const builder = new ContentStreamBuilder();
    const collector = new ShadingCollector();

    renderBackgroundToPdf(
      builder,
      {
        fill: {
          type: 'gradient',
          kind: 'radial',
          stops: [
            { position: 0, color: { r: 255, g: 255, b: 255, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 0, a: 1 } },
          ],
        },
      },
      720,
      540,
      collector
    );

    const ops = builder.toString();
    expect(ops).toContain('/Sh1 sh');

    const requests = collector.getRequests();
    expect(requests[0].type).toBe(3); // radial
  });

  it('emits sh operator for gradient shape fill', () => {
    const slide = makeEnriched({
      elements: [
        makeShape({
          properties: makeProperties({
            transform: makeTransform(),
            fill: {
              type: 'gradient',
              kind: 'linear',
              angle: 45,
              stops: [
                { position: 0, color: { r: 0, g: 128, b: 0, a: 1 } },
                { position: 1, color: { r: 0, g: 0, b: 128, a: 1 } },
              ],
            },
          }),
        }),
      ],
    });

    const { builder, shadingRequests } = renderSlideToPdf(slide, 720, 540);
    const ops = builder.toString();

    // Background shading (default white) + shape gradient
    expect(ops).toContain('/Sh1 sh');
    expect(shadingRequests.length).toBeGreaterThanOrEqual(1);
  });

  it('creates multiple shading requests for multiple gradients', () => {
    const slide = makeEnriched({
      elements: [
        makeShape({
          properties: makeProperties({
            transform: makeTransform(),
            fill: {
              type: 'gradient',
              kind: 'linear',
              angle: 0,
              stops: [
                { position: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
                { position: 1, color: { r: 0, g: 255, b: 0, a: 1 } },
              ],
            },
          }),
        }),
        makeShape({
          properties: makeProperties({
            transform: makeTransform({
              position: { x: 2000000, y: 914400 },
            }),
            fill: {
              type: 'gradient',
              kind: 'radial',
              stops: [
                { position: 0, color: { r: 255, g: 255, b: 0, a: 1 } },
                { position: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
              ],
            },
          }),
        }),
      ],
    });

    const { shadingRequests } = renderSlideToPdf(slide, 720, 540);

    // Two gradient shapes -> two shading requests
    expect(shadingRequests.length).toBe(2);
    expect(shadingRequests[0].name).toBe('Sh1');
    expect(shadingRequests[1].name).toBe('Sh2');
  });

  it('converts gradient stop colors to 0-1 range', () => {
    const collector = new ShadingCollector();
    collector.addLinearGradient(0, 0, 100, 0, [
      { position: 0, color: { r: 128, g: 64, b: 255, a: 1 } },
      { position: 1, color: { r: 0, g: 128, b: 0, a: 1 } },
    ]);

    const req = collector.getRequests()[0];
    expect(req.stops[0].r).toBeCloseTo(128 / 255, 3);
    expect(req.stops[0].g).toBeCloseTo(64 / 255, 3);
    expect(req.stops[0].b).toBeCloseTo(1, 3);
    expect(req.stops[1].r).toBeCloseTo(0, 3);
    expect(req.stops[1].g).toBeCloseTo(128 / 255, 3);
    expect(req.stops[1].b).toBeCloseTo(0, 3);
  });

  it('handles multi-stop gradients (3+ stops)', () => {
    const slide = makeEnriched({
      elements: [
        makeShape({
          properties: makeProperties({
            transform: makeTransform(),
            fill: {
              type: 'gradient',
              kind: 'linear',
              angle: 0,
              stops: [
                { position: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
                { position: 0.5, color: { r: 0, g: 255, b: 0, a: 1 } },
                { position: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
              ],
            },
          }),
        }),
      ],
    });

    const { shadingRequests } = renderSlideToPdf(slide, 720, 540);
    const gradientReq = shadingRequests.find((r) => r.stops.length === 3);
    expect(gradientReq).toBeDefined();
    expect(gradientReq!.stops).toHaveLength(3);
  });

  it('falls back to solid fill when only 1 stop', () => {
    const builder = new ContentStreamBuilder();
    const collector = new ShadingCollector();

    renderBackgroundToPdf(
      builder,
      {
        fill: {
          type: 'gradient',
          kind: 'linear',
          stops: [{ position: 0, color: { r: 128, g: 128, b: 128, a: 1 } }],
        },
      },
      720,
      540,
      collector
    );

    const ops = builder.toString();
    // Should NOT have a shading operator — should be solid fill
    expect(ops).not.toContain('sh');
    // Should have rg (fill color)
    expect(ops).toContain('rg');
    expect(collector.getRequests()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Gradient Shading — Full PDF Export
// ---------------------------------------------------------------------------

describe('exportPresentationToPdf with gradient shading objects', () => {
  it('embeds shading dictionary in PDF for gradient fill shape', async () => {
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        elements: [
          makeShape({
            properties: makeProperties({
              transform: makeTransform(),
              fill: {
                type: 'gradient',
                kind: 'linear',
                angle: 90,
                stops: [
                  { position: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
                  { position: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
                ],
              },
            }),
          }),
        ],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides);
    const pdfText = new TextDecoder().decode(result.bytes);

    // PDF should contain a shading reference
    expect(pdfText).toContain('/Shading');
    expect(pdfText).toContain('/Sh1');
    // Content stream should have the sh operator
    expect(pdfText).toContain('/Sh1 sh');
    // Shading dictionary should have Type 2 (axial)
    expect(pdfText).toContain('/ShadingType 2');
    expect(pdfText).toContain('/ColorSpace /DeviceRGB');
    // Function type 2 (exponential interpolation)
    expect(pdfText).toContain('/FunctionType 2');
  });

  it('embeds stitching function for multi-stop gradient', async () => {
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        elements: [
          makeShape({
            properties: makeProperties({
              transform: makeTransform(),
              fill: {
                type: 'gradient',
                kind: 'linear',
                angle: 0,
                stops: [
                  { position: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
                  { position: 0.5, color: { r: 0, g: 255, b: 0, a: 1 } },
                  { position: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
                ],
              },
            }),
          }),
        ],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides);
    const pdfText = new TextDecoder().decode(result.bytes);

    // Should contain stitching function (Type 3)
    expect(pdfText).toContain('/FunctionType 3');
    // Should contain sub-functions (Type 2)
    expect(pdfText).toContain('/FunctionType 2');
    // Should contain /Bounds array
    expect(pdfText).toContain('/Bounds');
  });

  it('embeds radial shading for radial gradient', async () => {
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        elements: [
          makeShape({
            properties: makeProperties({
              transform: makeTransform(),
              fill: {
                type: 'gradient',
                kind: 'radial',
                stops: [
                  { position: 0, color: { r: 255, g: 255, b: 255, a: 1 } },
                  { position: 1, color: { r: 0, g: 0, b: 0, a: 1 } },
                ],
              },
            }),
          }),
        ],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides);
    const pdfText = new TextDecoder().decode(result.bytes);

    // Should contain Type 3 radial shading
    expect(pdfText).toContain('/ShadingType 3');
  });

  it('embeds shading for gradient background', async () => {
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        background: {
          fill: {
            type: 'gradient',
            kind: 'linear',
            angle: 0,
            stops: [
              { position: 0, color: { r: 200, g: 200, b: 200, a: 1 } },
              { position: 1, color: { r: 50, g: 50, b: 50, a: 1 } },
            ],
          },
        },
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides);
    const pdfText = new TextDecoder().decode(result.bytes);

    expect(pdfText).toContain('/Shading');
    expect(pdfText).toContain('/ShadingType 2');
    expect(pdfText).toContain('/Sh1 sh');
  });
});

// ---------------------------------------------------------------------------
// Picture Fill — Image Collector
// ---------------------------------------------------------------------------

describe('collectImagesFromSlide with picture fills', () => {
  it('collects images from shape picture fills', () => {
    const slideData = makeEnriched({
      elements: [
        makeShape({
          properties: makeProperties({
            transform: makeTransform(),
            fill: {
              type: 'picture',
              imagePartUri: '/ppt/media/texture.jpg',
            } as PictureFillIR,
          }),
        }),
      ],
    });

    const images = collectImagesFromSlide(slideData);
    expect(images.length).toBeGreaterThanOrEqual(1);
    expect(images.some((i) => i.imagePartUri === '/ppt/media/texture.jpg')).toBe(true);
  });

  it('collects images from background picture fills', () => {
    const slideData = makeEnriched({
      background: {
        fill: {
          type: 'picture',
          imagePartUri: '/ppt/media/bg-photo.jpg',
        } as PictureFillIR,
      },
    });

    const images = collectImagesFromSlide(slideData);
    expect(images.length).toBeGreaterThanOrEqual(1);
    expect(images.some((i) => i.imagePartUri === '/ppt/media/bg-photo.jpg')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Picture Fill — Content Stream & Export
// ---------------------------------------------------------------------------

describe('picture fill rendering', () => {
  it('emits Do operator for picture fill background when image is registered', () => {
    const builder = new ContentStreamBuilder();
    const imageMap = new Map([
      ['/ppt/media/bg.jpg', 'Im1'],
    ]);

    renderBackgroundToPdf(
      builder,
      {
        fill: {
          type: 'picture',
          imagePartUri: '/ppt/media/bg.jpg',
        } as PictureFillIR,
      },
      720,
      540,
      undefined,
      imageMap
    );

    const ops = builder.toString();
    // Should clip to background area and paint image
    expect(ops).toContain('W');
    expect(ops).toContain('/Im1 Do');
  });

  it('falls back to white fill when picture image is not registered', () => {
    const builder = new ContentStreamBuilder();

    renderBackgroundToPdf(
      builder,
      {
        fill: {
          type: 'picture',
          imagePartUri: '/ppt/media/missing.jpg',
        } as PictureFillIR,
      },
      720,
      540
    );

    const ops = builder.toString();
    // Should have white fill fallback
    expect(ops).toContain('1 1 1 rg');
    expect(ops).not.toContain('Do');
  });

  it('emits Do operator for shape picture fill', () => {
    const imageMap = new Map([
      ['/ppt/media/fill.jpg', 'Im2'],
    ]);

    const slide = makeEnriched({
      elements: [
        makeShape({
          properties: makeProperties({
            transform: makeTransform(),
            fill: {
              type: 'picture',
              imagePartUri: '/ppt/media/fill.jpg',
            } as PictureFillIR,
          }),
        }),
      ],
    });

    const { builder } = renderSlideToPdf(slide, 720, 540, undefined, imageMap);
    const ops = builder.toString();

    expect(ops).toContain('/Im2 Do');
  });

  it('exports PDF with picture fill background image', async () => {
    const jpeg = createMinimalJpeg();
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        background: {
          fill: {
            type: 'picture',
            imagePartUri: '/ppt/media/bg.jpg',
          } as PictureFillIR,
        },
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides, {
      getImageBytes: (partUri) => {
        if (partUri === '/ppt/media/bg.jpg') return jpeg;
        return undefined;
      },
    });

    expect(result.imageCount).toBe(1);
    const pdfText = new TextDecoder().decode(result.bytes);
    expect(pdfText).toContain('/Im1 Do');
  });

  it('exports PDF with shape picture fill image', async () => {
    const jpeg = createMinimalJpeg();
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        elements: [
          makeShape({
            properties: makeProperties({
              transform: makeTransform(),
              fill: {
                type: 'picture',
                imagePartUri: '/ppt/media/texture.jpg',
              } as PictureFillIR,
            }),
          }),
        ],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides, {
      getImageBytes: (partUri) => {
        if (partUri === '/ppt/media/texture.jpg') return jpeg;
        return undefined;
      },
    });

    expect(result.imageCount).toBe(1);
    const pdfText = new TextDecoder().decode(result.bytes);
    expect(pdfText).toContain('/Im1 Do');
    expect(pdfText).toContain('/Subtype /Image');
  });
});

// ---------------------------------------------------------------------------
// Backward Compatibility
// ---------------------------------------------------------------------------

describe('backward compatibility', () => {
  it('PdfExportResult includes imageCount field', async () => {
    const pres = makePresentation(1);
    const slides = [makeEnriched()];

    const result = await exportPresentationToPdf(pres, slides);

    expect(result).toHaveProperty('imageCount');
    expect(result.imageCount).toBe(0);
  });

  it('export still works without options parameter', async () => {
    const pres = makePresentation(1);
    const slides = [makeEnriched()];

    const result = await exportPresentationToPdf(pres, slides);

    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.pageCount).toBe(1);
  });
});
