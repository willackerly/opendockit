/**
 * Font resolution regression tests.
 *
 * Loads real PPTX fixtures through SlideKit, extracts fontFamily values from
 * all text runs, and asserts they match a hardcoded per-slide baseline. This
 * catches regressions in the font resolution pipeline (theme refs, master/layout
 * inheritance, per-run overrides).
 *
 * No Canvas2D or rendering needed — pure IR inspection.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { SlideKit } from '../slide-viewport.js';
import type { SlideElementIR, TextBodyIR } from '@opendockit/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract all fontFamily values from a text body (runs only, not endParaRPr). */
function extractFontsFromTextBody(textBody: TextBodyIR | undefined): string[] {
  if (!textBody) return [];
  const fonts: string[] = [];
  for (const para of textBody.paragraphs) {
    for (const run of para.runs) {
      if (run.kind === 'run') {
        if (run.properties.fontFamily) fonts.push(run.properties.fontFamily);
        if (run.properties.latin) fonts.push(run.properties.latin);
        if (run.properties.eastAsian) fonts.push(run.properties.eastAsian);
        if (run.properties.complexScript) fonts.push(run.properties.complexScript);
      }
    }
  }
  return fonts;
}

/** Recursively extract fonts from any element type (shape, table, group). */
function extractFontsFromElement(element: SlideElementIR): string[] {
  switch (element.kind) {
    case 'shape':
      return extractFontsFromTextBody(element.textBody);
    case 'table': {
      const fonts: string[] = [];
      for (const row of element.rows) {
        for (const cell of row.cells) {
          fonts.push(...extractFontsFromTextBody(cell.textBody));
        }
      }
      return fonts;
    }
    case 'group': {
      const fonts: string[] = [];
      for (const child of element.children) {
        fonts.push(...extractFontsFromElement(child));
      }
      return fonts;
    }
    default:
      return [];
  }
}

/** Collect sorted, deduplicated font set across all elements on a slide. */
function collectSlideFonts(
  elements: { element: SlideElementIR; layer: 'master' | 'layout' | 'slide' }[]
): string[] {
  const all = new Set<string>();
  for (const { element } of elements) {
    for (const f of extractFontsFromElement(element)) {
      all.add(f);
    }
  }
  return [...all].sort();
}

/** Extract a {fontFamily → count} map from run-level text on a single slide. */
function collectFontCounts(
  elements: { element: SlideElementIR; layer: 'master' | 'layout' | 'slide' }[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { element } of elements) {
    for (const f of extractFontsFromElement(element)) {
      counts[f] = (counts[f] || 0) + 1;
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Baselines — generated from census, cross-validated
// ---------------------------------------------------------------------------

/**
 * Expected per-slide font families for font-stress-test.pptx.
 * Slide index → sorted unique font names across all layers.
 */
const FONT_STRESS_EXPECTED: Record<number, string[]> = {
  0: ['Calibri'],
  1: [
    'Arial',
    'Arial Narrow',
    'Calibri',
    'Calibri Light',
    'Cambria',
    'Courier New',
    'Times New Roman',
  ],
  2: [
    'Bookman Old Style',
    'Calibri',
    'Century Schoolbook',
    'Georgia',
    'Palatino Linotype',
    'Segoe UI Light',
    'Segoe UI Semibold',
    'Segoe UI Semilight',
  ],
  3: [
    'Arimo',
    'Barlow',
    'Barlow Light',
    'Calibri',
    'Comfortaa',
    'Lato',
    'Lato Light',
    'Montserrat',
  ],
  4: [
    'Calibri',
    'Open Sans',
    'Oswald',
    'Poppins',
    'Raleway',
    'Roboto',
    'Source Sans Pro',
    'Ubuntu',
  ],
  5: [
    'Calibri',
    'Noto Serif',
    'Playfair Display',
    'Roboto Slab',
    'Roboto Slab Light',
    'Roboto Slab SemiBold',
    'Tinos',
  ],
  6: [
    'Calibri',
    'Courier Prime',
    'Fira Code',
    'Noto Sans Symbols',
    'Roboto Mono',
    'Source Code Pro',
  ],
  7: ['Arial', 'Calibri', 'Times New Roman'],
  8: [
    'Calibri',
    'Courier New',
    'Fira Code',
    'Lato Light',
    'Montserrat',
    'Noto Sans',
    'Noto Sans Symbols',
    'Poppins',
    'Raleway',
    'Roboto',
    'Roboto Mono',
    'Segoe UI',
    'Source Code Pro',
  ],
  9: ['Calibri'],
  10: ['Arial', 'Calibri'],
  11: ['Calibri', 'Times New Roman'],
  12: ['Calibri', 'Courier New'],
  13: ['Calibri', 'Georgia'],
  14: ['Calibri', 'Segoe UI'],
  15: ['Calibri', 'Roboto'],
  16: ['Calibri', 'Montserrat'],
  17: ['Calibri', 'Playfair Display'],
  18: ['Calibri', 'Fira Code'],
  19: ['Calibri', 'Noto Sans Symbols'],
};

/** Expected per-slide font families for basic-shapes.pptx. */
const BASIC_SHAPES_EXPECTED: Record<number, string[]> = {
  0: ['Calibri'],
  1: ['Calibri'],
  2: ['Calibri'],
};

// ---------------------------------------------------------------------------
// Fixture paths
// ---------------------------------------------------------------------------

const FONT_STRESS_PATH = resolve(__dirname, '../../../../../test-data/font-stress-test.pptx');
const BASIC_SHAPES_PATH = resolve(__dirname, '../../../../../test-data/basic-shapes.pptx');
const IC_CISO_PATH = resolve(
  __dirname,
  '../../../../../../pptx-pdf-comparisons/IC CISO Visit to Virtru.pptx'
);

// ---------------------------------------------------------------------------
// Tests: font-stress-test.pptx (primary regression suite)
// ---------------------------------------------------------------------------

describe('font regression: font-stress-test.pptx', () => {
  const hasFixture = existsSync(FONT_STRESS_PATH);
  let kit: SlideKit;
  let slideCount: number;

  beforeAll(async () => {
    if (!hasFixture) return;
    kit = new SlideKit({});
    const info = await kit.load(readFileSync(FONT_STRESS_PATH));
    slideCount = info.slideCount;
  });

  it.skipIf(!hasFixture)('loads all 20 slides', () => {
    expect(slideCount).toBe(20);
  });

  // Per-slide font census assertions
  for (let i = 0; i < 20; i++) {
    it.skipIf(!hasFixture)(`slide ${i} fonts match baseline`, async () => {
      const { elements } = await kit.getSlideElements(i);
      const actual = collectSlideFonts(elements);
      expect(actual).toEqual(FONT_STRESS_EXPECTED[i]);
    });
  }

  // Spot-check: slide 1 should have 7 distinct fonts (one per demo text block)
  it.skipIf(!hasFixture)('slide 1 has exactly 7 distinct fonts', async () => {
    const { elements } = await kit.getSlideElements(1);
    const fonts = collectSlideFonts(elements);
    expect(fonts).toHaveLength(7);
  });

  // Spot-check: slide 8 (mixed fonts slide) has the most fonts
  it.skipIf(!hasFixture)('slide 8 has the most fonts (13)', async () => {
    const { elements } = await kit.getSlideElements(8);
    const fonts = collectSlideFonts(elements);
    expect(fonts).toHaveLength(13);
  });

  // Spot-check: slides 9-19 each have exactly 1-2 fonts (Calibri + one other)
  for (let i = 9; i < 20; i++) {
    it.skipIf(!hasFixture)(
      `slide ${i} has at most 2 fonts (Calibri + feature font)`,
      async () => {
        const { elements } = await kit.getSlideElements(i);
        const fonts = collectSlideFonts(elements);
        expect(fonts.length).toBeLessThanOrEqual(2);
        expect(fonts).toContain('Calibri');
      }
    );
  }

  // Verify no empty font families sneak in
  it.skipIf(!hasFixture)('no empty fontFamily values across all slides', async () => {
    for (let i = 0; i < slideCount; i++) {
      const { elements } = await kit.getSlideElements(i);
      for (const { element } of elements) {
        const fonts = extractFontsFromElement(element);
        for (const f of fonts) {
          expect(f, `Empty font on slide ${i}`).not.toBe('');
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: basic-shapes.pptx (minimal sanity check)
// ---------------------------------------------------------------------------

describe('font regression: basic-shapes.pptx', () => {
  const hasFixture = existsSync(BASIC_SHAPES_PATH);
  let kit: SlideKit;
  let slideCount: number;

  beforeAll(async () => {
    if (!hasFixture) return;
    kit = new SlideKit({});
    const info = await kit.load(readFileSync(BASIC_SHAPES_PATH));
    slideCount = info.slideCount;
  });

  it.skipIf(!hasFixture)('loads all 3 slides', () => {
    expect(slideCount).toBe(3);
  });

  for (let i = 0; i < 3; i++) {
    it.skipIf(!hasFixture)(`slide ${i} fonts match baseline`, async () => {
      const { elements } = await kit.getSlideElements(i);
      const actual = collectSlideFonts(elements);
      expect(actual).toEqual(BASIC_SHAPES_EXPECTED[i]);
    });
  }

  // All slides should only use Calibri (no regressions introducing other fonts)
  it.skipIf(!hasFixture)('all slides use only Calibri', async () => {
    for (let i = 0; i < slideCount; i++) {
      const { elements } = await kit.getSlideElements(i);
      const fonts = collectSlideFonts(elements);
      for (const f of fonts) {
        expect(f, `Unexpected font "${f}" on slide ${i}`).toBe('Calibri');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// IC CISO baseline
// ---------------------------------------------------------------------------

/**
 * Expected per-slide font families for IC CISO Visit to Virtru.pptx.
 * 54 slides. Predominantly Barlow-family with Roboto Slab variants on
 * data-heavy slides and a few specialty fonts on the appendix.
 */
const IC_CISO_EXPECTED: Record<number, string[]> = {
  0: ['Barlow'],
  1: ['Barlow'],
  2: ['Barlow'],
  3: ['Barlow', 'Roboto Slab', 'Roboto Slab Light'],
  4: ['Barlow', 'Roboto Slab', 'Roboto Slab Light'],
  5: ['Barlow'],
  6: ['Barlow'],
  7: ['Barlow', 'Roboto Slab'],
  8: ['Barlow', 'Roboto Slab', 'Roboto Slab Light'],
  9: ['Barlow'],
  10: ['Barlow', 'Barlow Light', 'Roboto Slab'],
  11: ['Barlow', 'Roboto Slab'],
  12: ['Barlow', 'Roboto Slab', 'Roboto Slab Light'],
  13: ['Barlow'],
  14: ['Barlow', 'Barlow Light'],
  15: ['Barlow', 'Roboto Slab Light'],
  16: ['Barlow'],
  17: ['Barlow', 'Barlow Medium', 'Roboto Slab Light'],
  18: ['Barlow', 'Roboto Slab', 'Roboto Slab Light', 'Roboto Slab Medium', 'Roboto Slab SemiBold'],
  19: ['Barlow'],
  20: ['Barlow'],
  21: ['Barlow', 'Barlow Light'],
  22: ['Barlow'],
  23: ['Barlow'],
  24: ['Barlow'],
  25: ['Barlow'],
  26: ['Barlow'],
  27: ['Barlow'],
  28: ['Barlow', 'Roboto Slab'],
  29: ['Barlow'],
  30: ['Barlow', 'Barlow Light'],
  31: ['Barlow'],
  32: ['Barlow'],
  33: ['Barlow', 'Roboto Slab'],
  34: ['Barlow'],
  35: ['Barlow'],
  36: ['Barlow'],
  37: ['Barlow'],
  38: ['Barlow'],
  39: ['Barlow'],
  40: ['Barlow'],
  41: ['Barlow'],
  42: ['Barlow'],
  43: ['Barlow'],
  44: ['Barlow'],
  45: ['Barlow'],
  46: ['Barlow'],
  47: ['Barlow'],
  48: ['Barlow'],
  49: ['Barlow', 'Barlow Light'],
  50: ['Barlow'],
  51: ['Barlow', 'Barlow Light', 'Barlow Medium', 'Comfortaa Light', 'Noto Sans Symbols', 'Open Sans ExtraBold'],
  52: ['Barlow', 'Barlow Medium', 'Play', 'Roboto Slab Light'],
  53: ['Barlow'],
};

// ---------------------------------------------------------------------------
// Tests: IC CISO (skipped if file not present)
// ---------------------------------------------------------------------------

describe('font regression: IC CISO', () => {
  const hasFixture = existsSync(IC_CISO_PATH);
  let kit: SlideKit;
  let slideCount: number;

  beforeAll(async () => {
    if (!hasFixture) return;
    kit = new SlideKit({});
    const info = await kit.load(readFileSync(IC_CISO_PATH));
    slideCount = info.slideCount;
  });

  it.skipIf(!hasFixture)('loads all 54 slides', () => {
    expect(slideCount).toBe(54);
  });

  // Per-slide font census assertions
  for (let i = 0; i < 54; i++) {
    it.skipIf(!hasFixture)(`slide ${i} fonts match baseline`, async () => {
      const { elements } = await kit.getSlideElements(i);
      const actual = collectSlideFonts(elements);
      expect(actual).toEqual(IC_CISO_EXPECTED[i]);
    });
  }

  // Every slide should contain Barlow (it's the deck's primary font)
  it.skipIf(!hasFixture)('all slides use Barlow as primary font', async () => {
    for (let i = 0; i < slideCount; i++) {
      const { elements } = await kit.getSlideElements(i);
      const fonts = collectSlideFonts(elements);
      expect(fonts, `Slide ${i} missing Barlow`).toContain('Barlow');
    }
  });

  // Slide 18 has the richest Roboto Slab variant set (5 fonts total)
  it.skipIf(!hasFixture)('slide 18 has 5 fonts (richest Roboto Slab usage)', async () => {
    const { elements } = await kit.getSlideElements(18);
    const fonts = collectSlideFonts(elements);
    expect(fonts).toHaveLength(5);
    expect(fonts).toContain('Roboto Slab SemiBold');
  });

  // Slide 51 (appendix) has specialty fonts not seen elsewhere
  it.skipIf(!hasFixture)('slide 51 includes specialty fonts (Comfortaa, Noto Sans Symbols)', async () => {
    const { elements } = await kit.getSlideElements(51);
    const fonts = collectSlideFonts(elements);
    expect(fonts).toContain('Comfortaa Light');
    expect(fonts).toContain('Noto Sans Symbols');
    expect(fonts).toContain('Open Sans ExtraBold');
  });

  // No empty font families
  it.skipIf(!hasFixture)('no empty fontFamily values across all slides', async () => {
    for (let i = 0; i < slideCount; i++) {
      const { elements } = await kit.getSlideElements(i);
      for (const { element } of elements) {
        const fonts = extractFontsFromElement(element);
        for (const f of fonts) {
          expect(f, `Empty font on slide ${i}`).not.toBe('');
        }
      }
    }
  });
});
