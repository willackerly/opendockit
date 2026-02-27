/**
 * Unit tests for font inheritance through the text defaults pipeline.
 *
 * Tests buildTextDefaults() and mergeListStyles() with synthetic data to
 * verify the master → layout → shape font resolution chain works correctly.
 * No real PPTX file needed — fast synthetic tests.
 */

import { describe, expect, it } from 'vitest';
import type {
  SlideElementIR,
  DrawingMLShapeIR,
  ListStyleIR,
  ShapePropertiesIR,
  TransformIR,
} from '@opendockit/core';
import type {
  SlideMasterIR,
  SlideLayoutIR,
  SlideIR,
  EnrichedSlideData,
} from '../../model/index.js';
import { buildTextDefaults, mergeListStyles } from '../slide-renderer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeEnriched(
  slideElements: SlideElementIR[],
  layoutOverrides?: Partial<SlideLayoutIR>,
  masterOverrides?: Partial<SlideMasterIR>
): EnrichedSlideData {
  return {
    slide: {
      partUri: '/ppt/slides/slide1.xml',
      elements: slideElements,
      layoutPartUri: '/ppt/slideLayouts/slideLayout1.xml',
      masterPartUri: '/ppt/slideMasters/slideMaster1.xml',
    },
    layout: { ...emptyLayout, ...layoutOverrides },
    master: { ...emptyMaster, ...masterOverrides },
  };
}

/** Make a ListStyleIR that sets fontFamily at level 0. */
function makeFontLstStyle(fontFamily: string): ListStyleIR {
  return {
    levels: {
      0: {
        defaultCharacterProperties: { fontFamily },
      },
    },
  };
}

/** Make a ListStyleIR that sets fontFamily at a specific level. */
function makeFontLstStyleAtLevel(fontFamily: string, level: number): ListStyleIR {
  return {
    levels: {
      [level]: {
        defaultCharacterProperties: { fontFamily },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests: mergeListStyles (pure function)
// ---------------------------------------------------------------------------

describe('mergeListStyles', () => {
  it('returns undefined when both inputs are undefined', () => {
    expect(mergeListStyles(undefined, undefined)).toBeUndefined();
  });

  it('returns lower when higher is undefined', () => {
    const lower = makeFontLstStyle('Arial');
    expect(mergeListStyles(undefined, lower)).toBe(lower);
  });

  it('returns higher when lower is undefined', () => {
    const higher = makeFontLstStyle('Georgia');
    expect(mergeListStyles(higher, undefined)).toBe(higher);
  });

  it('higher font overrides lower font at same level', () => {
    const lower = makeFontLstStyle('Arial');
    const higher = makeFontLstStyle('Georgia');
    const merged = mergeListStyles(higher, lower)!;
    expect(merged.levels[0]?.defaultCharacterProperties?.fontFamily).toBe('Georgia');
  });

  it('preserves lower level when higher does not define it', () => {
    const lower: ListStyleIR = {
      levels: {
        0: { defaultCharacterProperties: { fontFamily: 'Arial' } },
        1: { defaultCharacterProperties: { fontFamily: 'Times New Roman' } },
      },
    };
    const higher: ListStyleIR = {
      levels: {
        0: { defaultCharacterProperties: { fontFamily: 'Georgia' } },
      },
    };
    const merged = mergeListStyles(higher, lower)!;
    // Level 0 overridden by higher
    expect(merged.levels[0]?.defaultCharacterProperties?.fontFamily).toBe('Georgia');
    // Level 1 preserved from lower
    expect(merged.levels[1]?.defaultCharacterProperties?.fontFamily).toBe('Times New Roman');
  });

  it('merges character properties within a level', () => {
    const lower: ListStyleIR = {
      levels: {
        0: { defaultCharacterProperties: { fontFamily: 'Arial', fontSize: 1800 } },
      },
    };
    const higher: ListStyleIR = {
      levels: {
        0: { defaultCharacterProperties: { fontFamily: 'Georgia' } },
      },
    };
    const merged = mergeListStyles(higher, lower)!;
    // fontFamily from higher, fontSize preserved from lower
    expect(merged.levels[0]?.defaultCharacterProperties?.fontFamily).toBe('Georgia');
    expect(merged.levels[0]?.defaultCharacterProperties?.fontSize).toBe(1800);
  });

  it('merges defPPr from both', () => {
    const lower: ListStyleIR = {
      defPPr: { defaultCharacterProperties: { fontFamily: 'Arial' } },
      levels: {},
    };
    const higher: ListStyleIR = {
      defPPr: { defaultCharacterProperties: { fontFamily: 'Verdana' } },
      levels: {},
    };
    const merged = mergeListStyles(higher, lower)!;
    expect(merged.defPPr?.defaultCharacterProperties?.fontFamily).toBe('Verdana');
  });
});

// ---------------------------------------------------------------------------
// Tests: buildTextDefaults (font inheritance chain)
// ---------------------------------------------------------------------------

describe('buildTextDefaults', () => {
  it('returns master txStyles.bodyStyle font when shape has no lstStyle', () => {
    const element = makeShape({ placeholderType: 'body' });
    const data = makeEnriched([element], {}, {
      txStyles: {
        bodyStyle: makeFontLstStyle('Calibri'),
      },
    });

    const defaults = buildTextDefaults(element, data)!;
    expect(defaults.levels[0]?.defaultCharacterProperties?.fontFamily).toBe('Calibri');
  });

  it('layout placeholder lstStyle overrides master bodyStyle', () => {
    const layoutBody = makeShape({
      placeholderType: 'body',
      textBody: {
        paragraphs: [],
        bodyProperties: {},
        listStyle: makeFontLstStyle('Georgia'),
      },
    });

    const slideBody = makeShape({ placeholderType: 'body' });

    const data = makeEnriched(
      [slideBody],
      { elements: [layoutBody] },
      { txStyles: { bodyStyle: makeFontLstStyle('Calibri') } }
    );

    const defaults = buildTextDefaults(slideBody, data)!;
    expect(defaults.levels[0]?.defaultCharacterProperties?.fontFamily).toBe('Georgia');
  });

  it('shape lstStyle overrides layout lstStyle', () => {
    const layoutBody = makeShape({
      placeholderType: 'body',
      textBody: {
        paragraphs: [],
        bodyProperties: {},
        listStyle: makeFontLstStyle('Georgia'),
      },
    });

    const slideBody = makeShape({
      placeholderType: 'body',
      textBody: {
        paragraphs: [],
        bodyProperties: {},
        listStyle: makeFontLstStyle('Roboto'),
      },
    });

    const data = makeEnriched(
      [slideBody],
      { elements: [layoutBody] },
      { txStyles: { bodyStyle: makeFontLstStyle('Calibri') } }
    );

    const defaults = buildTextDefaults(slideBody, data)!;
    expect(defaults.levels[0]?.defaultCharacterProperties?.fontFamily).toBe('Roboto');
  });

  it('per-level font inheritance (level 0 vs level 1)', () => {
    const masterBody = makeFontLstStyleAtLevel('Arial', 0);
    // Add level 1 to master
    masterBody.levels[1] = { defaultCharacterProperties: { fontFamily: 'Times New Roman' } };

    const layoutBody = makeShape({
      placeholderType: 'body',
      textBody: {
        paragraphs: [],
        bodyProperties: {},
        listStyle: makeFontLstStyleAtLevel('Georgia', 0),
        // Does NOT override level 1
      },
    });

    const slideBody = makeShape({ placeholderType: 'body' });

    const data = makeEnriched(
      [slideBody],
      { elements: [layoutBody] },
      { txStyles: { bodyStyle: masterBody } }
    );

    const defaults = buildTextDefaults(slideBody, data)!;
    // Level 0: layout overrides master
    expect(defaults.levels[0]?.defaultCharacterProperties?.fontFamily).toBe('Georgia');
    // Level 1: preserved from master (layout doesn't define level 1)
    expect(defaults.levels[1]?.defaultCharacterProperties?.fontFamily).toBe('Times New Roman');
  });

  it('subtitle falls back to master body placeholder when no subTitle exists', () => {
    // Master has a body placeholder with specific font
    const masterBody = makeShape({
      placeholderType: 'body',
      textBody: {
        paragraphs: [],
        bodyProperties: {},
        listStyle: makeFontLstStyle('Lato'),
      },
    });

    // No subTitle placeholder in master — subtitle should fall back to body
    const slideSubtitle = makeShape({ placeholderType: 'subTitle' });

    const data = makeEnriched(
      [slideSubtitle],
      {},
      {
        elements: [masterBody],
        txStyles: { titleStyle: makeFontLstStyle('Calibri Light') },
      }
    );

    const defaults = buildTextDefaults(slideSubtitle, data)!;
    // Should get Lato from master body placeholder, merged with titleStyle
    expect(defaults.levels[0]?.defaultCharacterProperties?.fontFamily).toBe('Lato');
  });

  it('table gets otherStyle font', () => {
    const tableElement: SlideElementIR = {
      kind: 'table',
      properties: makeProperties({ transform: makeTransform() }),
      rows: [],
    };

    const data = makeEnriched([tableElement], {}, {
      txStyles: { otherStyle: makeFontLstStyle('Arial') },
    });

    const defaults = buildTextDefaults(tableElement, data)!;
    expect(defaults.levels[0]?.defaultCharacterProperties?.fontFamily).toBe('Arial');
  });

  it('returns undefined for non-shape, non-table elements', () => {
    const pictureElement: SlideElementIR = {
      kind: 'picture',
      imagePartUri: '/ppt/media/image1.png',
      properties: makeProperties({ transform: makeTransform() }),
      nonVisualProperties: { name: 'Picture 1' },
    };

    const data = makeEnriched([pictureElement], {}, {});
    expect(buildTextDefaults(pictureElement, data)).toBeUndefined();
  });

  it('non-placeholder shape gets otherStyle font', () => {
    // Shapes without a placeholder type get "otherStyle" category
    const shape = makeShape({
      // No placeholderType
    });

    const data = makeEnriched([shape], {}, {
      txStyles: { otherStyle: makeFontLstStyle('Courier New') },
    });

    const defaults = buildTextDefaults(shape, data)!;
    expect(defaults.levels[0]?.defaultCharacterProperties?.fontFamily).toBe('Courier New');
  });

  it('title placeholder gets titleStyle font', () => {
    const title = makeShape({ placeholderType: 'title' });
    const data = makeEnriched([title], {}, {
      txStyles: { titleStyle: makeFontLstStyle('Calibri Light') },
    });

    const defaults = buildTextDefaults(title, data)!;
    expect(defaults.levels[0]?.defaultCharacterProperties?.fontFamily).toBe('Calibri Light');
  });

  it('ctrTitle placeholder gets titleStyle font', () => {
    const ctrTitle = makeShape({ placeholderType: 'ctrTitle' });
    const data = makeEnriched([ctrTitle], {}, {
      txStyles: { titleStyle: makeFontLstStyle('Calibri Light') },
    });

    const defaults = buildTextDefaults(ctrTitle, data)!;
    expect(defaults.levels[0]?.defaultCharacterProperties?.fontFamily).toBe('Calibri Light');
  });

  it('full four-level chain resolves correctly', () => {
    // Build the full chain: master txStyles → master placeholder → layout → shape
    const masterTitlePh = makeShape({
      placeholderType: 'title',
      textBody: {
        paragraphs: [],
        bodyProperties: {},
        listStyle: {
          levels: {
            0: { defaultCharacterProperties: { fontFamily: 'Master-Ph-Font', bold: true } },
          },
        },
      },
    });

    const layoutTitlePh = makeShape({
      placeholderType: 'title',
      textBody: {
        paragraphs: [],
        bodyProperties: {},
        listStyle: {
          levels: {
            0: { defaultCharacterProperties: { fontFamily: 'Layout-Font' } },
            // Does not set bold — should inherit from master placeholder
          },
        },
      },
    });

    const slideTitle = makeShape({
      placeholderType: 'title',
      textBody: {
        paragraphs: [],
        bodyProperties: {},
        // No lstStyle — inherits from layout → master
      },
    });

    const data = makeEnriched(
      [slideTitle],
      { elements: [layoutTitlePh] },
      {
        elements: [masterTitlePh],
        txStyles: {
          titleStyle: {
            levels: {
              0: {
                defaultCharacterProperties: { fontFamily: 'TxStyles-Font', fontSize: 4400 },
              },
            },
          },
        },
      }
    );

    const defaults = buildTextDefaults(slideTitle, data)!;
    // Layout font wins over master placeholder and txStyles
    expect(defaults.levels[0]?.defaultCharacterProperties?.fontFamily).toBe('Layout-Font');
    // Bold from master placeholder is merged in (layout doesn't override it)
    expect(defaults.levels[0]?.defaultCharacterProperties?.bold).toBe(true);
    // fontSize from txStyles is merged in (neither layout nor master ph override it)
    expect(defaults.levels[0]?.defaultCharacterProperties?.fontSize).toBe(4400);
  });
});
