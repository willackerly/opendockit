/**
 * Tests for font subsetting in the PDF export pipeline.
 *
 * Covers:
 * - collectFontsWithCodepoints() — codepoint tracking
 * - Font subsetting integration in embedFontsForPdf()
 * - Subsetted fonts are smaller than full fonts
 * - Subsetted fonts are still parseable
 */

import { describe, expect, it } from 'vitest';
import {
  collectFontsWithCodepoints,
  collectFontsFromPresentation,
} from '../pdf-font-collector.js';
import { embedFontsForPdf } from '../pdf-font-embedder.js';
import { PDFDocument, parseTrueType } from '@opendockit/pdf-signer';
import { loadTTF } from '@opendockit/core/font';
import { subsetTrueTypeFont } from '@opendockit/pdf-signer';
import type {
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
  RunIR,
  CharacterPropertiesIR,
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
      fontSize: 1800,
      fontFamily: 'Carlito',
      ...charProps,
    },
  };
}

function makeTextBody(runs: RunIR[]): TextBodyIR {
  return {
    paragraphs: [{ runs, properties: {} }],
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
// collectFontsWithCodepoints tests
// ---------------------------------------------------------------------------

describe('collectFontsWithCodepoints', () => {
  it('returns fontKeys identical to collectFontsFromPresentation', () => {
    const slides: EnrichedSlideData[] = [
      makeEnriched({
        elements: [
          makeShapeWithText('Hello', 'Carlito'),
          makeShapeWithText('World', 'Tinos', true),
        ],
      }),
    ];

    const withCp = collectFontsWithCodepoints(slides);
    const without = collectFontsFromPresentation(slides);

    expect(withCp.fontKeys).toEqual(without);
  });

  it('tracks codepoints from text runs', () => {
    const slides: EnrichedSlideData[] = [
      makeEnriched({
        elements: [makeShapeWithText('ABC', 'Carlito')],
      }),
    ];

    const result = collectFontsWithCodepoints(slides);
    const key = 'carlito|false|false';
    const cpSet = result.usedCodepoints.get(key);

    expect(cpSet).toBeDefined();
    expect(cpSet!.has(65)).toBe(true); // A
    expect(cpSet!.has(66)).toBe(true); // B
    expect(cpSet!.has(67)).toBe(true); // C
    expect(cpSet!.size).toBe(3);
  });

  it('deduplicates codepoints across multiple runs', () => {
    const slides: EnrichedSlideData[] = [
      makeEnriched({
        elements: [
          makeShapeWithText('AAA', 'Carlito'),
          makeShapeWithText('ABA', 'Carlito'),
        ],
      }),
    ];

    const result = collectFontsWithCodepoints(slides);
    const cpSet = result.usedCodepoints.get('carlito|false|false');

    expect(cpSet).toBeDefined();
    expect(cpSet!.has(65)).toBe(true); // A
    expect(cpSet!.has(66)).toBe(true); // B
    expect(cpSet!.size).toBe(2);
  });

  it('tracks codepoints per font variant separately', () => {
    const slides: EnrichedSlideData[] = [
      makeEnriched({
        elements: [
          makeShapeWithText('AB', 'Carlito', false, false),
          makeShapeWithText('CD', 'Carlito', true, false),
        ],
      }),
    ];

    const result = collectFontsWithCodepoints(slides);
    const regular = result.usedCodepoints.get('carlito|false|false');
    const bold = result.usedCodepoints.get('carlito|true|false');

    expect(regular).toBeDefined();
    expect(bold).toBeDefined();
    expect(regular!.has(65)).toBe(true); // A
    expect(regular!.has(66)).toBe(true); // B
    expect(bold!.has(67)).toBe(true); // C
    expect(bold!.has(68)).toBe(true); // D
  });

  it('handles accented characters', () => {
    const slides: EnrichedSlideData[] = [
      makeEnriched({
        elements: [makeShapeWithText('café', 'Carlito')],
      }),
    ];

    const result = collectFontsWithCodepoints(slides);
    const cpSet = result.usedCodepoints.get('carlito|false|false');

    expect(cpSet).toBeDefined();
    expect(cpSet!.has(99)).toBe(true);  // c
    expect(cpSet!.has(97)).toBe(true);  // a
    expect(cpSet!.has(102)).toBe(true); // f
    expect(cpSet!.has(233)).toBe(true); // é
  });

  it('handles empty text runs', () => {
    const slides: EnrichedSlideData[] = [
      makeEnriched({
        elements: [makeShapeWithText('', 'Carlito')],
      }),
    ];

    const result = collectFontsWithCodepoints(slides);
    const cpSet = result.usedCodepoints.get('carlito|false|false');

    expect(cpSet).toBeDefined();
    expect(cpSet!.size).toBe(0);
  });

  it('resolves theme font placeholders', () => {
    const theme = createMinimalTheme();
    const slides: EnrichedSlideData[] = [
      makeEnriched({
        elements: [
          {
            kind: 'shape',
            properties: makeProperties({ transform: makeTransform() }),
            textBody: makeTextBody([
              makeRun('Title', { fontFamily: '+mj-lt' }),
            ]),
          } as DrawingMLShapeIR,
        ],
      }),
    ];

    const result = collectFontsWithCodepoints(slides, theme);
    // +mj-lt resolves to 'Calibri Light' from theme
    const key = 'calibri light|false|false';
    expect(result.usedCodepoints.has(key)).toBe(true);
    const cpSet = result.usedCodepoints.get(key)!;
    expect(cpSet.has(84)).toBe(true); // T
  });
});

// ---------------------------------------------------------------------------
// Subsetting integration tests
// ---------------------------------------------------------------------------

describe('font subsetting integration', () => {
  it('subsetted Carlito is smaller than full Carlito', async () => {
    const fullBytes = await loadTTF('Carlito', false, false);
    expect(fullBytes).not.toBeNull();

    const info = parseTrueType(fullBytes!);
    // Subset to just A, B, C
    const usedGlyphIds = new Set<number>();
    for (const cp of [65, 66, 67]) {
      const gid = info.cmap.get(cp);
      if (gid !== undefined) usedGlyphIds.add(gid);
    }

    const subsetResult = subsetTrueTypeFont(fullBytes!, usedGlyphIds);
    expect(subsetResult.bytes.length).toBeLessThan(fullBytes!.length);
    // Subset should be significantly smaller (< 50% of full)
    expect(subsetResult.bytes.length).toBeLessThan(fullBytes!.length * 0.5);
  });

  it('subsetted font is still parseable', async () => {
    const fullBytes = await loadTTF('Carlito', false, false);
    expect(fullBytes).not.toBeNull();

    const info = parseTrueType(fullBytes!);
    const usedGlyphIds = new Set<number>();
    for (const cp of [65, 66, 67, 97, 98, 99]) {
      const gid = info.cmap.get(cp);
      if (gid !== undefined) usedGlyphIds.add(gid);
    }

    const subsetResult = subsetTrueTypeFont(fullBytes!, usedGlyphIds);
    const subsetInfo = parseTrueType(subsetResult.bytes);

    expect(subsetInfo.unitsPerEm).toBe(info.unitsPerEm);
    expect(subsetInfo.postScriptName).toBeDefined();
  });

  it('embedFontsForPdf produces smaller results with subsetting', async () => {
    const fontKeys = [
      { family: 'Carlito', bold: false, italic: false },
    ];

    // Embed without subsetting (no codepoints)
    const pdfDoc1 = await PDFDocument.create({ updateMetadata: false });
    const resultNoSubset = await embedFontsForPdf(fontKeys, pdfDoc1);

    // Embed with subsetting (only ABC codepoints)
    const pdfDoc2 = await PDFDocument.create({ updateMetadata: false });
    const usedCodepoints = new Map<string, Set<number>>();
    usedCodepoints.set('carlito|false|false', new Set([65, 66, 67]));
    const resultWithSubset = await embedFontsForPdf(fontKeys, pdfDoc2, usedCodepoints);

    // Both should produce results
    expect(resultNoSubset.length).toBe(1);
    expect(resultWithSubset.length).toBe(1);
    expect(resultNoSubset[0].isStandard).toBe(false);
    expect(resultWithSubset[0].isStandard).toBe(false);

    // Subsetted PDF should be smaller
    const bytes1 = await pdfDoc1.save();
    const bytes2 = await pdfDoc2.save();
    expect(bytes2.length).toBeLessThan(bytes1.length);
  });

  it('subsetting preserves text encoding', async () => {
    const fontKeys = [
      { family: 'Carlito', bold: false, italic: false },
    ];

    const pdfDoc = await PDFDocument.create({ updateMetadata: false });
    const usedCodepoints = new Map<string, Set<number>>();
    usedCodepoints.set('carlito|false|false', new Set([72, 101, 108, 111])); // H,e,l,o
    const results = await embedFontsForPdf(fontKeys, pdfDoc, usedCodepoints);

    expect(results.length).toBe(1);
    const font = results[0].registeredFont;

    // encodeText should return non-empty hex string for "Hello"
    const encoded = font.encodeText('Hello');
    expect(encoded.length).toBeGreaterThan(0);
    // CID encoding: 4 hex chars per glyph, "Hello" = 5 glyphs = 20 hex chars
    expect(encoded.length).toBe(20);
  });

  it('falls back to full font when codepoints map is empty', async () => {
    const fontKeys = [
      { family: 'Carlito', bold: false, italic: false },
    ];

    const pdfDoc = await PDFDocument.create({ updateMetadata: false });
    const usedCodepoints = new Map<string, Set<number>>();
    usedCodepoints.set('carlito|false|false', new Set<number>());

    const results = await embedFontsForPdf(fontKeys, pdfDoc, usedCodepoints);
    expect(results.length).toBe(1);
    expect(results[0].isStandard).toBe(false);
  });

  it('falls back to standard font for non-bundled fonts', async () => {
    const fontKeys = [
      { family: 'Papyrus', bold: false, italic: false },
    ];

    const pdfDoc = await PDFDocument.create({ updateMetadata: false });
    const results = await embedFontsForPdf(fontKeys, pdfDoc);

    expect(results.length).toBe(1);
    expect(results[0].isStandard).toBe(true);
  });
});
