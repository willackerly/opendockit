/**
 * Tests for the PDF export pipeline.
 *
 * Verifies that exportPresentationToPdf produces valid PDF documents
 * with correct page count and dimensions.
 */

import { describe, expect, it } from 'vitest';
import { exportPresentationToPdf } from '../pdf-exporter.js';
import type {
  PresentationIR,
  SlideIR,
  SlideLayoutIR,
  SlideMasterIR,
  EnrichedSlideData,
} from '../../model/index.js';
import type {
  ThemeIR,
  ResolvedColor,
  DrawingMLShapeIR,
  SolidFillIR,
  TransformIR,
  ShapePropertiesIR,
} from '@opendockit/core';
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

/** Standard widescreen 16:9 dimensions in EMU. */
const SLIDE_WIDTH_EMU = 12192000; // 960pt = 13.333in
const SLIDE_HEIGHT_EMU = 6858000; // 540pt = 7.5in

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

function makeShape(overrides?: Partial<DrawingMLShapeIR>): DrawingMLShapeIR {
  return {
    kind: 'shape',
    properties: makeProperties({ transform: makeTransform() }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('exportPresentationToPdf', () => {
  it('produces valid PDF bytes starting with %PDF-', async () => {
    const pres = makePresentation(1);
    const slides = [makeEnriched()];

    const result = await exportPresentationToPdf(pres, slides);

    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.bytes.length).toBeGreaterThan(0);

    // Check PDF magic header
    const header = new TextDecoder().decode(result.bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('returns correct page count for single slide', async () => {
    const pres = makePresentation(1);
    const slides = [makeEnriched()];

    const result = await exportPresentationToPdf(pres, slides);

    expect(result.pageCount).toBe(1);
  });

  it('returns correct page count for multiple slides', async () => {
    const pres = makePresentation(5);
    const slides = Array.from({ length: 5 }, () => makeEnriched());

    const result = await exportPresentationToPdf(pres, slides);

    expect(result.pageCount).toBe(5);
  });

  it('handles zero slides gracefully', async () => {
    const pres = makePresentation(0);
    const slides: EnrichedSlideData[] = [];

    const result = await exportPresentationToPdf(pres, slides);

    expect(result.pageCount).toBe(0);
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    // Still produces valid PDF header
    const header = new TextDecoder().decode(result.bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('creates pages with correct dimensions matching slide size', async () => {
    // 4:3 aspect ratio
    const pres = makePresentation(1, {
      slideWidth: 9144000, // 720pt
      slideHeight: 6858000, // 540pt
    });
    const slides = [makeEnriched()];

    const result = await exportPresentationToPdf(pres, slides);

    // Verify the PDF contains the MediaBox with the correct dimensions.
    // 9144000 EMU / 12700 = 720pt, 6858000 EMU / 12700 = 540pt
    const pdfText = new TextDecoder().decode(result.bytes);
    expect(pdfText).toContain('720');
    expect(pdfText).toContain('540');
  });

  it('renders solid fill backgrounds as colored rectangles', async () => {
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        background: {
          fill: {
            type: 'solid',
            color: { r: 0, g: 0, b: 255, a: 1 },
          },
        },
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides);

    // The PDF should contain RGB fill operators for blue (0 0 1 rg)
    const pdfText = new TextDecoder().decode(result.bytes);
    expect(pdfText).toContain('0 0 1 rg');
  });

  it('renders shapes with solid fills', async () => {
    const solidRed: SolidFillIR = {
      type: 'solid',
      color: { r: 255, g: 0, b: 0, a: 1 },
    };

    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        elements: [
          makeShape({
            properties: makeProperties({
              transform: makeTransform(),
              fill: solidRed,
            }),
          }),
        ],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides);

    // The PDF should contain RGB fill operators for red (1 0 0 rg)
    const pdfText = new TextDecoder().decode(result.bytes);
    expect(pdfText).toContain('1 0 0 rg');
  });

  it('renders shapes with outlines', async () => {
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        elements: [
          makeShape({
            properties: makeProperties({
              transform: makeTransform(),
              line: {
                color: { r: 0, g: 128, b: 0, a: 1 },
                width: EMU_PER_PT * 2, // 2pt line
              },
            }),
          }),
        ],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides);

    // Should contain stroke color (green)
    const pdfText = new TextDecoder().decode(result.bytes);
    // Green: approximately 0 0.502 0 RG (128/255 = 0.502)
    expect(pdfText).toContain('RG');
    // And line width
    expect(pdfText).toContain('2 w');
  });

  it('renders master and layout elements when showMasterSp is true', async () => {
    const solidBlue: SolidFillIR = {
      type: 'solid',
      color: { r: 0, g: 0, b: 255, a: 1 },
    };
    const solidRed: SolidFillIR = {
      type: 'solid',
      color: { r: 255, g: 0, b: 0, a: 1 },
    };

    const pres = makePresentation(1);
    const slides = [
      makeEnriched(
        {}, // slide
        {
          // layout
          elements: [
            makeShape({
              properties: makeProperties({
                transform: makeTransform(),
                fill: solidBlue,
              }),
            }),
          ],
        },
        {
          // master
          elements: [
            makeShape({
              properties: makeProperties({
                transform: makeTransform(),
                fill: solidRed,
              }),
            }),
          ],
        }
      ),
    ];

    const result = await exportPresentationToPdf(pres, slides);

    const pdfText = new TextDecoder().decode(result.bytes);
    // Both red (master) and blue (layout) fills should be present
    expect(pdfText).toContain('1 0 0 rg'); // red
    expect(pdfText).toContain('0 0 1 rg'); // blue
  });

  it('skips master elements when layout showMasterSp is false', async () => {
    const solidRed: SolidFillIR = {
      type: 'solid',
      color: { r: 255, g: 0, b: 0, a: 1 },
    };

    const pres = makePresentation(1);
    const slides = [
      makeEnriched(
        {}, // slide
        {
          // layout
          showMasterSp: false,
        },
        {
          // master with red fill
          elements: [
            makeShape({
              properties: makeProperties({
                transform: makeTransform(),
                fill: solidRed,
              }),
            }),
          ],
        }
      ),
    ];

    const result = await exportPresentationToPdf(pres, slides);

    const pdfText = new TextDecoder().decode(result.bytes);
    // Master's red fill should NOT be present (master elements suppressed)
    expect(pdfText).not.toContain('1 0 0 rg');
  });

  it('handles widescreen (16:9) slide dimensions correctly', async () => {
    const pres = makePresentation(1, {
      slideWidth: 12192000, // 960pt
      slideHeight: 6858000, // 540pt
    });
    const slides = [makeEnriched()];

    const result = await exportPresentationToPdf(pres, slides);

    const pdfText = new TextDecoder().decode(result.bytes);
    expect(pdfText).toContain('960');
    expect(pdfText).toContain('540');
  });

  it('handles standard (4:3) slide dimensions correctly', async () => {
    const pres = makePresentation(1, {
      slideWidth: 9144000, // 720pt
      slideHeight: 6858000, // 540pt
    });
    const slides = [makeEnriched()];

    const result = await exportPresentationToPdf(pres, slides);

    const pdfText = new TextDecoder().decode(result.bytes);
    expect(pdfText).toContain('720');
    expect(pdfText).toContain('540');
  });

  it('produces PDF that can be parsed back by PDFDocument.load', async () => {
    // This is a round-trip test: export PDF, then load it back
    const { PDFDocument } = await import('@opendockit/pdf-signer');

    const pres = makePresentation(3);
    const slides = Array.from({ length: 3 }, () => makeEnriched());

    const result = await exportPresentationToPdf(pres, slides);

    // Load the exported PDF back
    const loadedDoc = await PDFDocument.load(result.bytes, { updateMetadata: false });
    expect(loadedDoc.getPageCount()).toBe(3);

    // Verify page dimensions
    const page = loadedDoc.getPage(0);
    const { width, height } = page.getSize();
    expect(width).toBeCloseTo(960, 0); // 12192000 / 12700
    expect(height).toBeCloseTo(540, 0); // 6858000 / 12700
  });
});
