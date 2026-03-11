/**
 * Tests for PDF font embedding in the export pipeline.
 *
 * Covers:
 * - Font collection from presentation IR
 * - Font embedding into PDF documents
 * - Font resource wiring into PDF pages
 * - Text rendering with embedded fonts
 * - Standard font fallback mapping
 */

import { describe, expect, it } from 'vitest';
import { exportPresentationToPdf } from '../pdf-exporter.js';
import { collectFontsFromPresentation } from '../pdf-font-collector.js';
import { embedFontsForPdf, getStandardFontName } from '../pdf-font-embedder.js';
import { buildFontLookup, renderSlideToPdf } from '../pdf-slide-renderer.js';
import { PDFDocument } from '@opendockit/pdf-signer';
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
  TransformIR,
  ShapePropertiesIR,
  TextBodyIR,
  ParagraphIR,
  RunIR,
  CharacterPropertiesIR,
  TableIR,
  TableRowIR,
  GroupIR,
} from '@opendockit/core';

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

function makePresentation(
  slideCount: number,
  overrides?: Partial<PresentationIR>
): PresentationIR {
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

function makeProperties(
  overrides?: Partial<ShapePropertiesIR>
): ShapePropertiesIR {
  return {
    effects: [],
    ...overrides,
  };
}

function makeRun(
  text: string,
  charProps?: Partial<CharacterPropertiesIR>
): RunIR {
  return {
    kind: 'run',
    text,
    properties: {
      fontSize: 1800, // 18pt
      fontFamily: 'Calibri',
      ...charProps,
    },
  };
}

function makeTextBody(runs: RunIR[]): TextBodyIR {
  return {
    paragraphs: [
      {
        runs,
        properties: {},
      },
    ],
    bodyProperties: {},
  };
}

function makeShapeWithText(
  text: string,
  fontFamily?: string,
  bold?: boolean,
  italic?: boolean
): DrawingMLShapeIR {
  return {
    kind: 'shape',
    properties: makeProperties({ transform: makeTransform() }),
    textBody: makeTextBody([
      makeRun(text, { fontFamily, bold, italic }),
    ]),
  };
}

// ---------------------------------------------------------------------------
// collectFontsFromPresentation tests
// ---------------------------------------------------------------------------

describe('collectFontsFromPresentation', () => {
  it('returns empty array for slides with no text', () => {
    const slides = [makeEnriched()];
    const result = collectFontsFromPresentation(slides);
    expect(result).toEqual([]);
  });

  it('collects fonts from slide text runs', () => {
    const slides = [
      makeEnriched({
        elements: [makeShapeWithText('Hello', 'Arial')],
      }),
    ];
    const result = collectFontsFromPresentation(slides);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      family: 'Arial',
      bold: false,
      italic: false,
    });
  });

  it('collects bold and italic variants', () => {
    const slides = [
      makeEnriched({
        elements: [
          makeShapeWithText('Normal', 'Arial'),
          makeShapeWithText('Bold', 'Arial', true, false),
          makeShapeWithText('Italic', 'Arial', false, true),
          makeShapeWithText('BoldItalic', 'Arial', true, true),
        ],
      }),
    ];
    const result = collectFontsFromPresentation(slides);
    expect(result).toHaveLength(4);
    expect(result.map((f) => `${f.bold}|${f.italic}`).sort()).toEqual([
      'false|false',
      'false|true',
      'true|false',
      'true|true',
    ]);
  });

  it('deduplicates identical font variants', () => {
    const slides = [
      makeEnriched({
        elements: [
          makeShapeWithText('Hello', 'Calibri'),
          makeShapeWithText('World', 'Calibri'),
          makeShapeWithText('More', 'calibri'), // case-insensitive
        ],
      }),
    ];
    const result = collectFontsFromPresentation(slides);
    expect(result).toHaveLength(1);
  });

  it('collects fonts from multiple font families', () => {
    const slides = [
      makeEnriched({
        elements: [
          makeShapeWithText('Sans', 'Arial'),
          makeShapeWithText('Serif', 'Times New Roman'),
          makeShapeWithText('Mono', 'Courier New'),
        ],
      }),
    ];
    const result = collectFontsFromPresentation(slides);
    expect(result).toHaveLength(3);
    const families = result.map((f) => f.family).sort();
    expect(families).toEqual(['Arial', 'Courier New', 'Times New Roman']);
  });

  it('collects fonts from master and layout elements', () => {
    const slides = [
      makeEnriched(
        {},
        {
          elements: [makeShapeWithText('Layout', 'Georgia')],
        },
        {
          elements: [makeShapeWithText('Master', 'Cambria')],
        }
      ),
    ];
    const result = collectFontsFromPresentation(slides);
    expect(result).toHaveLength(2);
    const families = result.map((f) => f.family).sort();
    expect(families).toEqual(['Cambria', 'Georgia']);
  });

  it('resolves theme font references (+mj-lt, +mn-lt)', () => {
    const theme = createMinimalTheme();
    const slides = [
      makeEnriched({
        elements: [
          makeShapeWithText('Major', '+mj-lt'),
          makeShapeWithText('Minor', '+mn-lt'),
        ],
      }),
    ];
    const result = collectFontsFromPresentation(slides, theme);
    expect(result).toHaveLength(2);
    const families = result.map((f) => f.family).sort();
    expect(families).toEqual(['Calibri', 'Calibri Light']);
  });

  it('collects fonts from table cells', () => {
    const table: TableIR = {
      kind: 'table',
      properties: makeProperties({ transform: makeTransform() }),
      rows: [
        {
          height: 457200,
          cells: [
            {
              textBody: makeTextBody([
                makeRun('Cell text', { fontFamily: 'Georgia' }),
              ]),
            },
          ],
        },
      ],
    };
    const slides = [makeEnriched({ elements: [table] })];
    const result = collectFontsFromPresentation(slides);
    expect(result).toHaveLength(1);
    expect(result[0].family).toBe('Georgia');
  });

  it('collects fonts from group children', () => {
    const group: GroupIR = {
      kind: 'group',
      properties: makeProperties({ transform: makeTransform() }),
      childOffset: { x: 0, y: 0 },
      childExtent: { width: 1828800, height: 914400 },
      children: [makeShapeWithText('Grouped', 'Roboto')],
    };
    const slides = [makeEnriched({ elements: [group] })];
    const result = collectFontsFromPresentation(slides);
    expect(result).toHaveLength(1);
    expect(result[0].family).toBe('Roboto');
  });

  it('collects fonts from endParaProperties', () => {
    const shape: DrawingMLShapeIR = {
      kind: 'shape',
      properties: makeProperties({ transform: makeTransform() }),
      textBody: {
        paragraphs: [
          {
            runs: [],
            properties: {},
            endParaProperties: {
              fontFamily: 'Montserrat',
              fontSize: 2400,
            },
          },
        ],
        bodyProperties: {},
      },
    };
    const slides = [makeEnriched({ elements: [shape] })];
    const result = collectFontsFromPresentation(slides);
    expect(result).toHaveLength(1);
    expect(result[0].family).toBe('Montserrat');
  });

  it('uses latin typeface when fontFamily is not set', () => {
    const slides = [
      makeEnriched({
        elements: [
          {
            kind: 'shape',
            properties: makeProperties({ transform: makeTransform() }),
            textBody: makeTextBody([
              {
                kind: 'run',
                text: 'Latin font',
                properties: {
                  latin: 'Lato',
                  fontSize: 1800,
                },
              },
            ]),
          } as DrawingMLShapeIR,
        ],
      }),
    ];
    const result = collectFontsFromPresentation(slides);
    expect(result).toHaveLength(1);
    expect(result[0].family).toBe('Lato');
  });
});

// ---------------------------------------------------------------------------
// getStandardFontName tests
// ---------------------------------------------------------------------------

describe('getStandardFontName', () => {
  it('maps sans-serif families to Helvetica', () => {
    expect(getStandardFontName('Arial', false, false)).toBe('Helvetica');
    expect(getStandardFontName('Calibri', false, false)).toBe('Helvetica');
    expect(getStandardFontName('Roboto', false, false)).toBe('Helvetica');
  });

  it('maps serif families to Times-Roman', () => {
    expect(getStandardFontName('Times New Roman', false, false)).toBe(
      'Times-Roman'
    );
    expect(getStandardFontName('Georgia', false, false)).toBe('Times-Roman');
    expect(getStandardFontName('Cambria', false, false)).toBe('Times-Roman');
  });

  it('maps monospace families to Courier', () => {
    expect(getStandardFontName('Courier New', false, false)).toBe('Courier');
    expect(getStandardFontName('Fira Code', false, false)).toBe('Courier');
  });

  it('applies bold/italic variants for Helvetica', () => {
    expect(getStandardFontName('Arial', true, false)).toBe('Helvetica-Bold');
    expect(getStandardFontName('Arial', false, true)).toBe(
      'Helvetica-Oblique'
    );
    expect(getStandardFontName('Arial', true, true)).toBe(
      'Helvetica-BoldOblique'
    );
  });

  it('applies bold/italic variants for Times-Roman', () => {
    expect(getStandardFontName('Times New Roman', true, false)).toBe(
      'Times-Bold'
    );
    expect(getStandardFontName('Times New Roman', false, true)).toBe(
      'Times-Italic'
    );
    expect(getStandardFontName('Times New Roman', true, true)).toBe(
      'Times-BoldItalic'
    );
  });

  it('applies bold/italic variants for Courier', () => {
    expect(getStandardFontName('Courier New', true, false)).toBe(
      'Courier-Bold'
    );
    expect(getStandardFontName('Courier New', false, true)).toBe(
      'Courier-Oblique'
    );
    expect(getStandardFontName('Courier New', true, true)).toBe(
      'Courier-BoldOblique'
    );
  });

  it('falls back to Helvetica for unknown families', () => {
    expect(getStandardFontName('Papyrus', false, false)).toBe('Helvetica');
    expect(getStandardFontName('Comic Sans MS', true, false)).toBe(
      'Helvetica-Bold'
    );
  });

  it('is case-insensitive', () => {
    expect(getStandardFontName('ARIAL', false, false)).toBe('Helvetica');
    expect(getStandardFontName('times new roman', false, false)).toBe(
      'Times-Roman'
    );
  });
});

// ---------------------------------------------------------------------------
// embedFontsForPdf tests
// ---------------------------------------------------------------------------

describe('embedFontsForPdf', () => {
  it('returns empty array for no fonts', async () => {
    const pdfDoc = await PDFDocument.create({ updateMetadata: false });
    const results = await embedFontsForPdf([], pdfDoc);
    expect(results).toEqual([]);
  });

  it('assigns unique resource names (F1, F2, ...)', async () => {
    const pdfDoc = await PDFDocument.create({ updateMetadata: false });
    const fontKeys = [
      { family: 'Arial', bold: false, italic: false },
      { family: 'Times New Roman', bold: false, italic: false },
      { family: 'Courier New', bold: false, italic: false },
    ];
    const results = await embedFontsForPdf(fontKeys, pdfDoc);
    expect(results.map((r) => r.resourceName)).toEqual(['F1', 'F2', 'F3']);
  });

  it('creates RegisteredPdfFont with text encoding', async () => {
    const pdfDoc = await PDFDocument.create({ updateMetadata: false });
    const results = await embedFontsForPdf(
      [{ family: 'Arial', bold: false, italic: false }],
      pdfDoc
    );
    const font = results[0].registeredFont;

    // encodeText should return non-empty hex string
    const encoded = font.encodeText('Hello');
    expect(encoded.length).toBeGreaterThan(0);
    // Should be all hex characters
    expect(encoded).toMatch(/^[0-9A-Fa-f]+$/);
  });

  it('creates RegisteredPdfFont with width measurement', async () => {
    const pdfDoc = await PDFDocument.create({ updateMetadata: false });
    const results = await embedFontsForPdf(
      [{ family: 'Arial', bold: false, italic: false }],
      pdfDoc
    );
    const font = results[0].registeredFont;

    // Width should be proportional to text length and font size
    const width10 = font.measureWidth('Hello', 10);
    const width20 = font.measureWidth('Hello', 20);
    expect(width20).toBeCloseTo(width10 * 2, 5);

    // Longer text should be wider
    const widthShort = font.measureWidth('Hi', 12);
    const widthLong = font.measureWidth('Hello World', 12);
    expect(widthLong).toBeGreaterThan(widthShort);
  });

  it('embeds bundled fonts as custom (not standard)', async () => {
    // Skip if companion package not installed (no TTF data available)
    const { loadTTF } = await import('@opendockit/core/font');
    const testBytes = await loadTTF('Arial', false, false);
    if (!testBytes) return;

    const pdfDoc = await PDFDocument.create({ updateMetadata: false });
    const results = await embedFontsForPdf(
      [
        { family: 'Arial', bold: false, italic: false },
        { family: 'Georgia', bold: false, italic: false },
      ],
      pdfDoc
    );
    // Fonts with TTF bundles should be embedded as custom Type0 fonts
    expect(results.some((r) => !r.isStandard)).toBe(true);
  });

  it('falls back to standard font when no TTF available', async () => {
    const pdfDoc = await PDFDocument.create({ updateMetadata: false });
    const results = await embedFontsForPdf(
      [{ family: 'Papyrus', bold: false, italic: false }],
      pdfDoc
    );
    // Papyrus has no TTF bundle — should fall back to standard font
    expect(results[0].isStandard).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: exportPresentationToPdf with text
// ---------------------------------------------------------------------------

describe('exportPresentationToPdf with text', () => {
  it('returns fontCount for exported presentations', async () => {
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        elements: [
          makeShapeWithText('Hello World', 'Arial'),
          makeShapeWithText('Bold text', 'Arial', true),
        ],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides);
    expect(result.fontCount).toBe(2); // Arial regular + Arial bold
  });

  it('includes /Font resource in PDF output', async () => {
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        elements: [makeShapeWithText('Hello', 'Arial')],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides);
    const pdfText = new TextDecoder().decode(result.bytes);

    // The PDF should contain a /Font dictionary reference
    expect(pdfText).toContain('/Font');
  });

  it('includes font resource names in PDF output', async () => {
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        elements: [makeShapeWithText('Hello', 'Arial')],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides);
    const pdfText = new TextDecoder().decode(result.bytes);

    // The PDF should contain font resource references like /F1
    expect(pdfText).toContain('/F1');
  });

  it('includes embedded font for Arial text', async () => {
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        elements: [makeShapeWithText('Hello', 'Arial')],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides);
    const pdfText = new TextDecoder().decode(result.bytes);

    // Should contain font definition (either custom Type0 or standard Type1)
    expect(pdfText).toContain('/Font');
    expect(pdfText).toContain('/F1');
  });

  it('produces PDF with text that can be loaded back', async () => {
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        elements: [makeShapeWithText('Test text content', 'Calibri')],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides);

    // Round-trip: load the exported PDF
    const loaded = await PDFDocument.load(result.bytes, {
      updateMetadata: false,
    });
    expect(loaded.getPageCount()).toBe(1);
  });

  it('handles presentations with multiple font families', async () => {
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        elements: [
          makeShapeWithText('Sans', 'Arial'),
          makeShapeWithText('Serif', 'Times New Roman'),
          makeShapeWithText('Mono', 'Courier New'),
        ],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides);
    expect(result.fontCount).toBe(3);

    const pdfText = new TextDecoder().decode(result.bytes);
    // All three fonts should be embedded (either as custom Type0 or standard Type1)
    expect(pdfText).toContain('/F1');
    expect(pdfText).toContain('/F2');
    expect(pdfText).toContain('/F3');
  });

  it('handles empty presentation (zero fonts)', async () => {
    const pres = makePresentation(1);
    const slides = [makeEnriched()];

    const result = await exportPresentationToPdf(pres, slides);
    expect(result.fontCount).toBe(0);
    // Still produces valid PDF
    const header = new TextDecoder().decode(result.bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('deduplicates fonts across multiple slides', async () => {
    const pres = makePresentation(3);
    const slides = [
      makeEnriched({
        elements: [makeShapeWithText('Slide 1', 'Calibri')],
      }),
      makeEnriched({
        elements: [makeShapeWithText('Slide 2', 'Calibri')],
      }),
      makeEnriched({
        elements: [makeShapeWithText('Slide 3', 'Calibri')],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides);
    // All three slides use Calibri regular -- should be deduplicated to 1 font
    expect(result.fontCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildFontLookup tests
// ---------------------------------------------------------------------------

describe('buildFontLookup', () => {
  it('returns undefined for empty font list', async () => {
    const ctx = buildFontLookup([]);
    const result = ctx.lookup('Arial', false, false);
    expect(result).toBeUndefined();
  });

  it('looks up fonts by exact family/bold/italic match', async () => {
    const pdfDoc = await PDFDocument.create({ updateMetadata: false });
    const fontKeys = [
      { family: 'Arial', bold: false, italic: false },
      { family: 'Arial', bold: true, italic: false },
    ];
    const embedded = await embedFontsForPdf(fontKeys, pdfDoc);
    const ctx = buildFontLookup(embedded);

    const regular = ctx.lookup('Arial', false, false);
    expect(regular).toBeDefined();
    expect(regular!.resourceName).toBe('F1');

    const bold = ctx.lookup('Arial', true, false);
    expect(bold).toBeDefined();
    expect(bold!.resourceName).toBe('F2');
  });

  it('is case-insensitive', async () => {
    const pdfDoc = await PDFDocument.create({ updateMetadata: false });
    const embedded = await embedFontsForPdf(
      [{ family: 'Arial', bold: false, italic: false }],
      pdfDoc
    );
    const ctx = buildFontLookup(embedded);

    expect(ctx.lookup('ARIAL', false, false)).toBeDefined();
    expect(ctx.lookup('arial', false, false)).toBeDefined();
  });

  it('falls back to family-only match', async () => {
    const pdfDoc = await PDFDocument.create({ updateMetadata: false });
    const embedded = await embedFontsForPdf(
      [{ family: 'Arial', bold: false, italic: false }],
      pdfDoc
    );
    const ctx = buildFontLookup(embedded);

    // Bold variant not registered, but family match available
    const result = ctx.lookup('Arial', true, false);
    expect(result).toBeDefined();
    expect(result!.resourceName).toBe('F1');
  });

  it('carries theme for font resolution', () => {
    const theme = createMinimalTheme();
    const ctx = buildFontLookup([], theme);
    expect(ctx.theme).toBe(theme);
  });
});

// ---------------------------------------------------------------------------
// Text rendering in content stream
// ---------------------------------------------------------------------------

describe('text rendering in content stream', () => {
  it('generates text operators (BT/ET) for shapes with text', async () => {
    const pdfDoc = await PDFDocument.create({ updateMetadata: false });
    const fontKeys = [{ family: 'Arial', bold: false, italic: false }];
    const embedded = await embedFontsForPdf(fontKeys, pdfDoc);
    const fontCtx = buildFontLookup(embedded);

    const slide = makeEnriched({
      elements: [makeShapeWithText('Hello World', 'Arial')],
    });

    const builder = renderSlideToPdf(slide, 720, 540, fontCtx);
    const bytes = builder.toBytes();
    const content = new TextDecoder().decode(bytes);

    // Should contain BT (begin text) and ET (end text) operators
    expect(content).toContain('BT');
    expect(content).toContain('ET');
  });

  it('includes font selection operator (Tf) in content stream', async () => {
    const pdfDoc = await PDFDocument.create({ updateMetadata: false });
    const fontKeys = [{ family: 'Arial', bold: false, italic: false }];
    const embedded = await embedFontsForPdf(fontKeys, pdfDoc);
    const fontCtx = buildFontLookup(embedded);

    const slide = makeEnriched({
      elements: [makeShapeWithText('Test', 'Arial')],
    });

    const builder = renderSlideToPdf(slide, 720, 540, fontCtx);
    const bytes = builder.toBytes();
    const content = new TextDecoder().decode(bytes);

    // Should contain /F1 18 Tf (font name + size + Tf operator)
    expect(content).toMatch(/\/F1\s+18\s+Tf/);
  });

  it('includes hex-encoded text in content stream (Tj operator)', async () => {
    const pdfDoc = await PDFDocument.create({ updateMetadata: false });
    const fontKeys = [{ family: 'Arial', bold: false, italic: false }];
    const embedded = await embedFontsForPdf(fontKeys, pdfDoc);
    const fontCtx = buildFontLookup(embedded);

    const slide = makeEnriched({
      elements: [makeShapeWithText('AB', 'Arial')],
    });

    const builder = renderSlideToPdf(slide, 720, 540, fontCtx);
    const bytes = builder.toBytes();
    const content = new TextDecoder().decode(bytes);

    // Text should be hex-encoded (either WinAnsi 2-char or CID 4-char per glyph)
    expect(content).toMatch(/<[0-9A-Fa-f]+>/);
    expect(content).toContain('Tj');
  });

  it('renders text with correct color', async () => {
    const pdfDoc = await PDFDocument.create({ updateMetadata: false });
    const fontKeys = [{ family: 'Arial', bold: false, italic: false }];
    const embedded = await embedFontsForPdf(fontKeys, pdfDoc);
    const fontCtx = buildFontLookup(embedded);

    const redColor: ResolvedColor = { r: 255, g: 0, b: 0, a: 1 };
    const slide = makeEnriched({
      elements: [
        {
          kind: 'shape',
          properties: makeProperties({ transform: makeTransform() }),
          textBody: makeTextBody([
            makeRun('Red text', { fontFamily: 'Arial', color: redColor }),
          ]),
        } as DrawingMLShapeIR,
      ],
    });

    const builder = renderSlideToPdf(slide, 720, 540, fontCtx);
    const bytes = builder.toBytes();
    const content = new TextDecoder().decode(bytes);

    // Should contain "1 0 0 rg" for red fill color
    expect(content).toMatch(/1\s+0\s+0\s+rg/);
  });

  it('does not render text when no font context is provided', () => {
    const slide = makeEnriched({
      elements: [makeShapeWithText('No font ctx', 'Arial')],
    });

    const builder = renderSlideToPdf(slide, 720, 540);
    const bytes = builder.toBytes();
    const content = new TextDecoder().decode(bytes);

    // Without font context, no text operators should be emitted
    expect(content).not.toContain('Tj');
  });

  it('renders text in exported PDF with text operators', async () => {
    const pres = makePresentation(1);
    const slides = [
      makeEnriched({
        elements: [makeShapeWithText('Export test', 'Arial')],
      }),
    ];

    const result = await exportPresentationToPdf(pres, slides);
    const pdfText = new TextDecoder().decode(result.bytes);

    // The final PDF should contain text operators from the rendered content
    expect(pdfText).toContain('BT');
    expect(pdfText).toContain('Tj');
    expect(pdfText).toContain('ET');
  });

  it('renders multiple text runs with different fonts', async () => {
    const pdfDoc = await PDFDocument.create({ updateMetadata: false });
    const fontKeys = [
      { family: 'Arial', bold: false, italic: false },
      { family: 'Times New Roman', bold: false, italic: false },
    ];
    const embedded = await embedFontsForPdf(fontKeys, pdfDoc);
    const fontCtx = buildFontLookup(embedded);

    const slide = makeEnriched({
      elements: [
        {
          kind: 'shape',
          properties: makeProperties({ transform: makeTransform() }),
          textBody: {
            paragraphs: [
              {
                runs: [
                  makeRun('Sans ', { fontFamily: 'Arial' }),
                  makeRun('Serif', { fontFamily: 'Times New Roman' }),
                ],
                properties: {},
              },
            ],
            bodyProperties: {},
          },
        } as DrawingMLShapeIR,
      ],
    });

    const builder = renderSlideToPdf(slide, 720, 540, fontCtx);
    const bytes = builder.toBytes();
    const content = new TextDecoder().decode(bytes);

    // Both font references should appear
    expect(content).toMatch(/\/F1\s+\d+\s+Tf/);
    expect(content).toMatch(/\/F2\s+\d+\s+Tf/);
  });
});
