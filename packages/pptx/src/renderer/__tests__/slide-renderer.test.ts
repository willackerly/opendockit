/**
 * Unit tests for the slide renderer.
 *
 * Verifies that renderSlide correctly orchestrates background rendering
 * and element rendering in the right order.
 */

import { describe, expect, it } from 'vitest';
import type {
  SlideIR,
  SlideLayoutIR,
  SlideMasterIR,
  EnrichedSlideData,
  BackgroundIR,
} from '../../model/index.js';
import type {
  DrawingMLShapeIR,
  ShapePropertiesIR,
  TransformIR,
  SolidFillIR,
  SlideElementIR,
} from '@opendockit/core';
import { renderSlide } from '../slide-renderer.js';
import { createMockRenderContext } from './mock-canvas.js';

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

const solidBlue: SolidFillIR = {
  type: 'solid',
  color: { r: 0, g: 0, b: 255, a: 1 },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderSlide', () => {
  it('renders white background for empty slide with no background', () => {
    const rctx = createMockRenderContext();
    const data = makeEnriched();

    renderSlide(data, rctx, 960, 540);

    // Should set fill to white and fill the full rectangle.
    expect(rctx.ctx.fillStyle).toBe('#FFFFFF');
    const fillRects = rctx.ctx._calls.filter((c) => c.method === 'fillRect');
    expect(fillRects).toHaveLength(1);
    expect(fillRects[0].args).toEqual([0, 0, 960, 540]);
  });

  it('renders background before elements', () => {
    const rctx = createMockRenderContext();
    const data = makeEnriched({
      background: {
        fill: { type: 'solid', color: { r: 50, g: 100, b: 150, a: 1 } },
      },
      elements: [
        makeShape({
          properties: makeProperties({
            transform: makeTransform(),
            fill: solidBlue,
          }),
        }),
      ],
    });

    renderSlide(data, rctx, 960, 540);

    const calls = rctx.ctx._calls;

    // Background fillRect should come before the shape's save/translate.
    const fillRectIdx = calls.findIndex((c) => c.method === 'fillRect');
    const shapeSaveIdx = calls.findIndex((c) => c.method === 'save');
    expect(fillRectIdx).toBeLessThan(shapeSaveIdx);
  });

  it('renders all elements in order', () => {
    const rctx = createMockRenderContext();
    const shape1 = makeShape({
      properties: makeProperties({
        transform: makeTransform({ position: { x: 0, y: 0 } }),
        fill: solidBlue,
      }),
    });
    const shape2 = makeShape({
      properties: makeProperties({
        transform: makeTransform({ position: { x: 914400, y: 914400 } }),
        fill: { type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 } },
      }),
    });

    const data = makeEnriched({ elements: [shape1, shape2] });
    renderSlide(data, rctx, 960, 540);

    // Both shapes should be rendered: we should see two save/restore pairs
    // (one pair for each shape — the background uses fillRect directly).
    const saveCalls = rctx.ctx._calls.filter((c) => c.method === 'save');
    const restoreCalls = rctx.ctx._calls.filter((c) => c.method === 'restore');
    expect(saveCalls).toHaveLength(2);
    expect(restoreCalls).toHaveLength(2);
  });

  it('renders empty slide with no elements', () => {
    const rctx = createMockRenderContext();
    const data = makeEnriched({ elements: [] });

    renderSlide(data, rctx, 960, 540);

    // Only background rendering: one fillRect, no save/restore.
    const calls = rctx.ctx._calls;
    const fillRects = calls.filter((c) => c.method === 'fillRect');
    const saves = calls.filter((c) => c.method === 'save');
    expect(fillRects).toHaveLength(1);
    expect(saves).toHaveLength(0);
  });

  it('renders slide with background and multiple element types', () => {
    const rctx = createMockRenderContext();
    const elements: SlideElementIR[] = [
      makeShape({
        properties: makeProperties({
          transform: makeTransform(),
          fill: solidBlue,
        }),
      }),
      {
        kind: 'unsupported',
        elementType: 'mc:AlternateContent',
        reason: 'Test',
        bounds: { x: 0, y: 0, width: 914400, height: 914400 },
      },
    ];

    const bg: BackgroundIR = {
      fill: { type: 'solid', color: { r: 200, g: 200, b: 200, a: 1 } },
    };

    const data = makeEnriched({ elements, background: bg });
    renderSlide(data, rctx, 960, 540);

    // Background + shape + unsupported placeholder all rendered.
    const fillRects = rctx.ctx._calls.filter((c) => c.method === 'fillRect');
    expect(fillRects.length).toBeGreaterThanOrEqual(2); // bg + placeholder
  });

  it('uses provided slide dimensions', () => {
    const rctx = createMockRenderContext();
    const data = makeEnriched();

    renderSlide(data, rctx, 1920, 1080);

    const fillRects = rctx.ctx._calls.filter((c) => c.method === 'fillRect');
    expect(fillRects[0].args).toEqual([0, 0, 1920, 1080]);
  });

  it('renders master background when slide and layout have none', () => {
    const rctx = createMockRenderContext();
    const data = makeEnriched(
      {}, // slide — no background
      {}, // layout — no background
      {
        background: {
          fill: { type: 'solid', color: { r: 100, g: 0, b: 0, a: 1 } },
        },
      }
    );

    renderSlide(data, rctx, 960, 540);

    expect(rctx.ctx.fillStyle).toBe('rgba(100, 0, 0, 1)');
  });

  it('renders master and layout elements behind slide elements', () => {
    const rctx = createMockRenderContext();
    const masterShape = makeShape({
      properties: makeProperties({
        transform: makeTransform({ position: { x: 0, y: 0 } }),
        fill: { type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 } },
      }),
    });
    const layoutShape = makeShape({
      properties: makeProperties({
        transform: makeTransform({ position: { x: 100, y: 100 } }),
        fill: { type: 'solid', color: { r: 0, g: 255, b: 0, a: 1 } },
      }),
    });
    const slideShape = makeShape({
      properties: makeProperties({
        transform: makeTransform({ position: { x: 200, y: 200 } }),
        fill: solidBlue,
      }),
    });

    const data = makeEnriched(
      { elements: [slideShape] },
      { elements: [layoutShape] },
      { elements: [masterShape] }
    );

    renderSlide(data, rctx, 960, 540);

    // Three shapes rendered = three save/restore pairs
    const saveCalls = rctx.ctx._calls.filter((c) => c.method === 'save');
    expect(saveCalls).toHaveLength(3);
  });

  it('filters master placeholder when slide has same placeholder type', () => {
    const rctx = createMockRenderContext();
    const masterTitle = makeShape({
      placeholderType: 'title',
      properties: makeProperties({
        transform: makeTransform({ position: { x: 0, y: 0 } }),
        fill: { type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 } },
      }),
    });
    const slideTitle = makeShape({
      placeholderType: 'title',
      properties: makeProperties({
        transform: makeTransform({ position: { x: 0, y: 0 } }),
        fill: solidBlue,
      }),
    });

    const data = makeEnriched({ elements: [slideTitle] }, {}, { elements: [masterTitle] });

    renderSlide(data, rctx, 960, 540);

    // Only slide title renders — master title is filtered out
    const saveCalls = rctx.ctx._calls.filter((c) => c.method === 'save');
    expect(saveCalls).toHaveLength(1);
  });

  it('renders non-placeholder master elements alongside slide placeholders', () => {
    const rctx = createMockRenderContext();
    const masterDecorative = makeShape({
      // No placeholderType/Index — decorative shape, always renders
      properties: makeProperties({
        transform: makeTransform({ position: { x: 0, y: 0 } }),
        fill: { type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 } },
      }),
    });
    const slideTitle = makeShape({
      placeholderType: 'title',
      properties: makeProperties({
        transform: makeTransform({ position: { x: 0, y: 0 } }),
        fill: solidBlue,
      }),
    });

    const data = makeEnriched({ elements: [slideTitle] }, {}, { elements: [masterDecorative] });

    renderSlide(data, rctx, 960, 540);

    // Both render — decorative master shape is not a placeholder
    const saveCalls = rctx.ctx._calls.filter((c) => c.method === 'save');
    expect(saveCalls).toHaveLength(2);
  });

  it('skips all master elements when layout has showMasterSp=false', () => {
    const rctx = createMockRenderContext();
    const masterShape = makeShape({
      properties: makeProperties({
        transform: makeTransform({ position: { x: 0, y: 0 } }),
        fill: { type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 } },
      }),
    });
    const slideShape = makeShape({
      properties: makeProperties({
        transform: makeTransform({ position: { x: 200, y: 200 } }),
        fill: solidBlue,
      }),
    });

    const data = makeEnriched(
      { elements: [slideShape] },
      { showMasterSp: false },
      { elements: [masterShape] }
    );

    renderSlide(data, rctx, 960, 540);

    // Only slide shape renders — master shape is hidden by showMasterSp=false
    const saveCalls = rctx.ctx._calls.filter((c) => c.method === 'save');
    expect(saveCalls).toHaveLength(1);
  });

  it('inherits text defaults from layout placeholder lstStyle', () => {
    const rctx = createMockRenderContext();

    // Layout has a title placeholder with lstStyle specifying white text
    const layoutTitle = makeShape({
      placeholderType: 'title',
      textBody: {
        paragraphs: [],
        bodyProperties: {},
        listStyle: {
          levels: {
            0: {
              defaultCharacterProperties: {
                color: { r: 255, g: 255, b: 255, a: 1, type: 'raw' as const },
              },
            },
          },
        },
      },
      properties: makeProperties({ transform: makeTransform() }),
    });

    // Slide title placeholder has no lstStyle — should inherit from layout
    const slideTitle = makeShape({
      placeholderType: 'title',
      properties: makeProperties({ transform: makeTransform() }),
    });

    const data = makeEnriched(
      { elements: [slideTitle] },
      { elements: [layoutTitle] },
      {
        txStyles: {
          titleStyle: {
            levels: {
              0: {
                defaultCharacterProperties: {
                  fontSize: 4400,
                },
              },
            },
          },
        },
      }
    );

    renderSlide(data, rctx, 960, 540);

    // textDefaults should have been set during rendering with layout lstStyle merged
    // The slide title should have been rendered (1 save/restore pair)
    const saveCalls = rctx.ctx._calls.filter((c) => c.method === 'save');
    expect(saveCalls).toHaveLength(1);

    // Verify rctx.textDefaults was restored to undefined after rendering
    expect(rctx.textDefaults).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Placeholder property inheritance
  // -------------------------------------------------------------------------

  it('inherits transform from layout placeholder when slide has none', () => {
    const rctx = createMockRenderContext();

    const layoutTitle = makeShape({
      placeholderType: 'title',
      properties: makeProperties({
        transform: makeTransform({ position: { x: 500, y: 600 } }),
        fill: { type: 'solid', color: { r: 0, g: 255, b: 0, a: 1 } },
      }),
    });

    // Slide title has NO transform — should inherit layout's
    const slideTitle = makeShape({
      placeholderType: 'title',
      properties: makeProperties({
        // No transform, no fill — both should come from layout
      }),
    });

    const data = makeEnriched({ elements: [slideTitle] }, { elements: [layoutTitle] });

    renderSlide(data, rctx, 960, 540);

    // Should render (1 save/restore pair) — inheriting layout's transform
    const saveCalls = rctx.ctx._calls.filter((c) => c.method === 'save');
    expect(saveCalls).toHaveLength(1);

    // The translate call should use the layout's position
    const translateCalls = rctx.ctx._calls.filter((c) => c.method === 'translate');
    expect(translateCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('inherits fill from master placeholder when slide and layout have none', () => {
    const rctx = createMockRenderContext();
    const masterFill: SolidFillIR = {
      type: 'solid',
      color: { r: 100, g: 50, b: 25, a: 1 },
    };

    const masterTitle = makeShape({
      placeholderType: 'title',
      properties: makeProperties({
        transform: makeTransform(),
        fill: masterFill,
      }),
    });

    // Layout has placeholder but no fill
    const layoutTitle = makeShape({
      placeholderType: 'title',
      properties: makeProperties({
        transform: makeTransform(),
      }),
    });

    // Slide has placeholder but no fill — should inherit from master (through layout)
    const slideTitle = makeShape({
      placeholderType: 'title',
      properties: makeProperties({
        transform: makeTransform(),
      }),
    });

    const data = makeEnriched(
      { elements: [slideTitle] },
      { elements: [layoutTitle] },
      { elements: [masterTitle] }
    );

    renderSlide(data, rctx, 960, 540);

    // Should render the shape — fillStyle is set as a property, not a tracked call.
    // The fill renderer sets ctx.fillStyle = 'rgba(100, 50, 25, 1)'.
    expect(String(rctx.ctx.fillStyle)).toContain('100');
  });

  it('slide fill overrides layout fill for same placeholder', () => {
    const rctx = createMockRenderContext();

    const layoutTitle = makeShape({
      placeholderType: 'title',
      properties: makeProperties({
        transform: makeTransform(),
        fill: { type: 'solid', color: { r: 0, g: 255, b: 0, a: 1 } },
      }),
    });

    // Slide has explicit fill — should NOT inherit from layout
    const slideTitle = makeShape({
      placeholderType: 'title',
      properties: makeProperties({
        transform: makeTransform(),
        fill: solidBlue,
      }),
    });

    const data = makeEnriched({ elements: [slideTitle] }, { elements: [layoutTitle] });

    renderSlide(data, rctx, 960, 540);

    // Should use slide's blue fill, not layout's green.
    // Last fillStyle set should contain blue (0, 0, 255), not green (0, 255, 0).
    expect(String(rctx.ctx.fillStyle)).toContain('0, 0, 255');
  });

  it('does not apply inheritance to non-placeholder shapes', () => {
    const rctx = createMockRenderContext();

    // Master decorative shape (not a placeholder)
    const masterDeco = makeShape({
      properties: makeProperties({
        transform: makeTransform(),
        fill: { type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 } },
      }),
    });

    // Slide non-placeholder with no fill — should NOT inherit from master
    const slideShape = makeShape({
      properties: makeProperties({
        transform: makeTransform(),
        // No fill
      }),
    });

    const data = makeEnriched({ elements: [slideShape] }, {}, { elements: [masterDeco] });

    renderSlide(data, rctx, 960, 540);

    // Both shapes render
    const saveCalls = rctx.ctx._calls.filter((c) => c.method === 'save');
    expect(saveCalls).toHaveLength(2);
  });

  it('inherits body properties (insets) from layout placeholder', () => {
    const rctx = createMockRenderContext();

    const layoutBody = makeShape({
      placeholderType: 'body',
      properties: makeProperties({ transform: makeTransform() }),
      textBody: {
        paragraphs: [],
        bodyProperties: {
          leftInset: 91440,
          topInset: 45720,
          wrap: 'square' as const,
        },
      },
    });

    const slideBody = makeShape({
      placeholderType: 'body',
      properties: makeProperties({ transform: makeTransform() }),
      textBody: {
        paragraphs: [
          {
            runs: [{ kind: 'run' as const, text: 'Hello', properties: {} }],
            properties: {},
          },
        ],
        bodyProperties: {
          // No insets — should inherit from layout
        },
      },
    });

    const data = makeEnriched({ elements: [slideBody] }, { elements: [layoutBody] });

    // Should not throw — the inherited body properties should be present
    expect(() => renderSlide(data, rctx, 960, 540)).not.toThrow();
  });

  it('inherits style reference from layout when slide has none', () => {
    const rctx = createMockRenderContext();

    const layoutTitle = makeShape({
      placeholderType: 'title',
      properties: makeProperties({ transform: makeTransform() }),
      style: {
        fillRef: { index: 0 },
        lineRef: { index: 0 },
        effectRef: { index: 0 },
        fontRef: { index: 'minor' },
      },
    });

    const slideTitle = makeShape({
      placeholderType: 'title',
      properties: makeProperties({ transform: makeTransform() }),
      // No style — should inherit from layout
    });

    const data = makeEnriched({ elements: [slideTitle] }, { elements: [layoutTitle] });

    expect(() => renderSlide(data, rctx, 960, 540)).not.toThrow();
  });

  it('renders master elements when layout has showMasterSp=undefined (default true)', () => {
    const rctx = createMockRenderContext();
    const masterShape = makeShape({
      properties: makeProperties({
        transform: makeTransform({ position: { x: 0, y: 0 } }),
        fill: { type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 } },
      }),
    });
    const slideShape = makeShape({
      properties: makeProperties({
        transform: makeTransform({ position: { x: 200, y: 200 } }),
        fill: solidBlue,
      }),
    });

    const data = makeEnriched(
      { elements: [slideShape] },
      {
        /* showMasterSp absent = default true */
      },
      { elements: [masterShape] }
    );

    renderSlide(data, rctx, 960, 540);

    // Both master and slide shapes render
    const saveCalls = rctx.ctx._calls.filter((c) => c.method === 'save');
    expect(saveCalls).toHaveLength(2);
  });
});
