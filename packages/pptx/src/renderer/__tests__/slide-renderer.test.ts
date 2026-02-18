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

    const data = makeEnriched(
      { elements: [slideTitle] },
      {},
      { elements: [masterTitle] }
    );

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

    const data = makeEnriched(
      { elements: [slideTitle] },
      {},
      { elements: [masterDecorative] }
    );

    renderSlide(data, rctx, 960, 540);

    // Both render — decorative master shape is not a placeholder
    const saveCalls = rctx.ctx._calls.filter((c) => c.method === 'save');
    expect(saveCalls).toHaveLength(2);
  });
});
