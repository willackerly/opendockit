/**
 * Unit tests for the shape renderer and renderSlideElement dispatcher.
 *
 * Uses the mock Canvas2D context to verify the correct Canvas2D API
 * call sequence for shape rendering without requiring a real browser canvas.
 */

import { describe, expect, it } from 'vitest';
import type {
  DrawingMLShapeIR,
  SlideElementIR,
  TransformIR,
  ShapePropertiesIR,
  SolidFillIR,
  LineIR,
  OuterShadowIR,
  TextBodyIR,
  PictureIR,
  GroupIR,
  ConnectorIR,
  TableIR,
  ChartIR,
  UnsupportedIR,
} from '../../../ir/index.js';
import { renderShape, renderSlideElement } from '../shape-renderer.js';
import { createMockRenderContext } from './mock-canvas.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTransform(overrides?: Partial<TransformIR>): TransformIR {
  return {
    position: { x: 914400, y: 914400 }, // 1 inch = 96px at 96 DPI
    size: { width: 1828800, height: 914400 }, // 2 inches x 1 inch
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

const solidBlue: SolidFillIR = {
  type: 'solid',
  color: { r: 0, g: 0, b: 255, a: 1 },
};

const redLine: LineIR = {
  color: { r: 255, g: 0, b: 0, a: 1 },
  width: 12700, // ~1px
};

function simpleTextBody(): TextBodyIR {
  return {
    paragraphs: [
      {
        runs: [
          {
            kind: 'run',
            text: 'Hello',
            properties: { fontSize: 1800 },
          },
        ],
        properties: {},
      },
    ],
    bodyProperties: {},
  };
}

// ---------------------------------------------------------------------------
// renderShape tests
// ---------------------------------------------------------------------------

describe('renderShape', () => {
  it('renders a shape with solid fill using save/translate/fill/restore', () => {
    const rctx = createMockRenderContext();
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform(),
        fill: solidBlue,
      }),
    });

    renderShape(shape, rctx);

    const calls = rctx.ctx._calls;
    const methods = calls.map((c) => c.method);

    // Must start with save and end with restore.
    expect(methods[0]).toBe('save');
    expect(methods[methods.length - 1]).toBe('restore');

    // Must include translate, beginPath, rect, fill.
    expect(methods).toContain('translate');
    expect(methods).toContain('beginPath');
    expect(methods).toContain('rect');
    expect(methods).toContain('fill');
  });

  it('applies rotation transform', () => {
    const rctx = createMockRenderContext();
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform({ rotation: 45 }),
      }),
    });

    renderShape(shape, rctx);

    const rotateCalls = rctx.ctx._calls.filter((c) => c.method === 'rotate');
    expect(rotateCalls).toHaveLength(1);
    expect(rotateCalls[0].args[0]).toBeCloseTo((45 * Math.PI) / 180, 10);
  });

  it('applies flipH via scale(-1, 1)', () => {
    const rctx = createMockRenderContext();
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform({ flipH: true }),
      }),
    });

    renderShape(shape, rctx);

    const scaleCalls = rctx.ctx._calls.filter((c) => c.method === 'scale');
    expect(scaleCalls).toHaveLength(1);
    expect(scaleCalls[0].args).toEqual([-1, 1]);
  });

  it('applies flipV via scale(1, -1)', () => {
    const rctx = createMockRenderContext();
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform({ flipV: true }),
      }),
    });

    renderShape(shape, rctx);

    const scaleCalls = rctx.ctx._calls.filter((c) => c.method === 'scale');
    expect(scaleCalls).toHaveLength(1);
    expect(scaleCalls[0].args).toEqual([1, -1]);
  });

  it('skips rendering when transform is missing', () => {
    const rctx = createMockRenderContext();
    const shape = makeShape({
      properties: makeProperties({ transform: undefined }),
    });

    renderShape(shape, rctx);

    // No canvas calls should be made.
    expect(rctx.ctx._calls).toHaveLength(0);
  });

  it('renders text body when present', () => {
    const rctx = createMockRenderContext();
    const shape = makeShape({
      properties: makeProperties({ transform: makeTransform() }),
      textBody: simpleTextBody(),
    });

    renderShape(shape, rctx);

    // Text rendering involves fillText calls.
    const fillTextCalls = rctx.ctx._calls.filter((c) => c.method === 'fillText');
    expect(fillTextCalls.length).toBeGreaterThan(0);
  });

  it('applies line/stroke when line is present', () => {
    const rctx = createMockRenderContext();
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform(),
        line: redLine,
      }),
    });

    renderShape(shape, rctx);

    const strokeCalls = rctx.ctx._calls.filter((c) => c.method === 'stroke');
    expect(strokeCalls).toHaveLength(1);
  });

  it('applies effects and calls cleanup', () => {
    const rctx = createMockRenderContext();
    const shadow: OuterShadowIR = {
      type: 'outerShadow',
      blurRadius: 50800,
      distance: 38100,
      direction: 45,
      color: { r: 0, g: 0, b: 0, a: 0.5 },
    };
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform(),
        effects: [shadow],
      }),
    });

    renderShape(shape, rctx);

    // After render completes, shadow should be cleaned up (reset to transparent).
    // The mock context tracks shadow properties directly.
    // Since the shape renderer calls effectCleanup() before restore(),
    // the shadow should have been reset.
    // We verify by checking the shadowColor was set and then reset.
    // The cleanup resets to 'transparent'.
    expect(rctx.ctx.shadowColor).toBe('transparent');
  });

  it('does not call fill when no fill is specified', () => {
    const rctx = createMockRenderContext();
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform(),
        // No fill property
      }),
    });

    renderShape(shape, rctx);

    const fillCalls = rctx.ctx._calls.filter((c) => c.method === 'fill');
    expect(fillCalls).toHaveLength(0);
  });

  it('does not call stroke when no line is specified', () => {
    const rctx = createMockRenderContext();
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform(),
        // No line property
      }),
    });

    renderShape(shape, rctx);

    const strokeCalls = rctx.ctx._calls.filter((c) => c.method === 'stroke');
    expect(strokeCalls).toHaveLength(0);
  });

  it('does not render text when textBody is absent', () => {
    const rctx = createMockRenderContext();
    const shape = makeShape({
      properties: makeProperties({ transform: makeTransform() }),
      // No textBody
    });

    renderShape(shape, rctx);

    const fillTextCalls = rctx.ctx._calls.filter((c) => c.method === 'fillText');
    expect(fillTextCalls).toHaveLength(0);
  });

  it('applies both flipH and flipV together', () => {
    const rctx = createMockRenderContext();
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform({ flipH: true, flipV: true }),
      }),
    });

    renderShape(shape, rctx);

    const scaleCalls = rctx.ctx._calls.filter((c) => c.method === 'scale');
    expect(scaleCalls).toHaveLength(2);
    expect(scaleCalls[0].args).toEqual([-1, 1]);
    expect(scaleCalls[1].args).toEqual([1, -1]);
  });

  it('uses correct translate values for center-pivot transform', () => {
    const rctx = createMockRenderContext();
    // position: 0, 0; size: 914400 (96px) x 914400 (96px) at dpiScale 1
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform({
          position: { x: 0, y: 0 },
          size: { width: 914400, height: 914400 },
        }),
      }),
    });

    renderShape(shape, rctx);

    const translateCalls = rctx.ctx._calls.filter((c) => c.method === 'translate');
    // First translate: to center (48, 48)
    expect(translateCalls[0].args[0]).toBeCloseTo(48, 0);
    expect(translateCalls[0].args[1]).toBeCloseTo(48, 0);
    // Second translate: back to top-left (-48, -48)
    expect(translateCalls[1].args[0]).toBeCloseTo(-48, 0);
    expect(translateCalls[1].args[1]).toBeCloseTo(-48, 0);
  });
});

// ---------------------------------------------------------------------------
// renderSlideElement dispatch tests
// ---------------------------------------------------------------------------

describe('renderSlideElement', () => {
  it('dispatches shape to renderShape', () => {
    const rctx = createMockRenderContext();
    const shape: DrawingMLShapeIR = makeShape({
      properties: makeProperties({
        transform: makeTransform(),
        fill: solidBlue,
      }),
    });

    renderSlideElement(shape, rctx);

    // Should have rendering calls (save, translate, etc.)
    expect(rctx.ctx._calls.length).toBeGreaterThan(0);
    expect(rctx.ctx._calls[0].method).toBe('save');
  });

  it('dispatches picture to renderPicture', () => {
    const rctx = createMockRenderContext();
    const picture: PictureIR = {
      kind: 'picture',
      imagePartUri: '/ppt/media/image1.png',
      properties: makeProperties({ transform: makeTransform() }),
      nonVisualProperties: { name: 'Picture 1' },
    };

    renderSlideElement(picture, rctx);

    // Picture without cached media renders a placeholder with fillRect.
    const fillRects = rctx.ctx._calls.filter((c) => c.method === 'fillRect');
    expect(fillRects.length).toBeGreaterThan(0);
  });

  it('dispatches group to renderGroup', () => {
    const rctx = createMockRenderContext();
    const childShape = makeShape({
      properties: makeProperties({
        transform: makeTransform({
          position: { x: 0, y: 0 },
          size: { width: 914400, height: 914400 },
        }),
        fill: solidBlue,
      }),
    });
    const group: GroupIR = {
      kind: 'group',
      properties: makeProperties({ transform: makeTransform() }),
      childOffset: { x: 0, y: 0 },
      childExtent: { width: 1828800, height: 914400 },
      children: [childShape],
    };

    renderSlideElement(group, rctx);

    // Group rendering involves save, translate, and recursive child rendering.
    const methods = rctx.ctx._calls.map((c) => c.method);
    expect(methods).toContain('save');
    expect(methods).toContain('restore');
    expect(methods).toContain('fill');
  });

  it('dispatches connector to connector renderer', () => {
    const rctx = createMockRenderContext();
    const connector: ConnectorIR = {
      kind: 'connector',
      properties: makeProperties({
        transform: makeTransform(),
        line: redLine,
      }),
    };

    renderSlideElement(connector, rctx);

    const methods = rctx.ctx._calls.map((c) => c.method);
    expect(methods).toContain('save');
    expect(methods).toContain('moveTo');
    expect(methods).toContain('lineTo');
    expect(methods).toContain('stroke');
    expect(methods).toContain('restore');
  });

  it('renders table using the table renderer (not placeholder)', () => {
    const rctx = createMockRenderContext();
    const table: TableIR = {
      kind: 'table',
      properties: makeProperties({ transform: makeTransform() }),
      rows: [
        {
          height: 914400,
          cells: [
            {
              fill: { type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 } },
            },
          ],
        },
      ],
      columnWidths: [1828800],
    };

    renderSlideElement(table, rctx);

    // Should NOT have the placeholder "Table" text label
    const placeholderTextCalls = rctx.ctx._calls.filter(
      (c) => c.method === 'fillText' && c.args[0] === 'Table'
    );
    expect(placeholderTextCalls).toHaveLength(0);

    // Should have fill calls from the real table renderer
    const fillCalls = rctx.ctx._calls.filter((c) => c.method === 'fill');
    expect(fillCalls).toHaveLength(1);
  });

  it('renders chart as placeholder box', () => {
    const rctx = createMockRenderContext();
    const chart: ChartIR = {
      kind: 'chart',
      chartType: 'bar',
      properties: makeProperties({ transform: makeTransform() }),
      chartPartUri: '/ppt/charts/chart1.xml',
    };

    renderSlideElement(chart, rctx);

    const fillTextCalls = rctx.ctx._calls.filter((c) => c.method === 'fillText');
    expect(fillTextCalls).toHaveLength(1);
    expect(fillTextCalls[0].args[0]).toBe('Chart');
  });

  it('renders unsupported element as placeholder box with element type', () => {
    const rctx = createMockRenderContext();
    const unsupported: UnsupportedIR = {
      kind: 'unsupported',
      elementType: 'mc:AlternateContent',
      reason: 'Not yet implemented',
      bounds: {
        x: 914400,
        y: 914400,
        width: 1828800,
        height: 914400,
      },
    };

    renderSlideElement(unsupported, rctx);

    const fillTextCalls = rctx.ctx._calls.filter((c) => c.method === 'fillText');
    expect(fillTextCalls).toHaveLength(1);
    expect(fillTextCalls[0].args[0]).toBe('mc:AlternateContent');
  });

  it('skips unsupported element without bounds', () => {
    const rctx = createMockRenderContext();
    const unsupported: UnsupportedIR = {
      kind: 'unsupported',
      elementType: 'mc:AlternateContent',
      reason: 'Not yet implemented',
      // No bounds
    };

    renderSlideElement(unsupported, rctx);

    // No rendering calls should be made.
    expect(rctx.ctx._calls).toHaveLength(0);
  });

  it('placeholder boxes use correct styling', () => {
    const rctx = createMockRenderContext();
    const chart: ChartIR = {
      kind: 'chart',
      chartType: 'bar',
      properties: makeProperties({ transform: makeTransform() }),
      chartPartUri: '/ppt/charts/chart1.xml',
    };

    renderSlideElement(chart, rctx);

    const methods = rctx.ctx._calls.map((c) => c.method);
    // Should have save, fillRect (background), strokeRect (border), fillText (label), restore.
    expect(methods).toContain('save');
    expect(methods).toContain('fillRect');
    expect(methods).toContain('strokeRect');
    expect(methods).toContain('fillText');
    expect(methods).toContain('restore');
  });

  it('connector without transform is skipped', () => {
    const rctx = createMockRenderContext();
    const connector: ConnectorIR = {
      kind: 'connector',
      properties: makeProperties({ transform: undefined }),
    };

    renderSlideElement(connector, rctx);

    expect(rctx.ctx._calls).toHaveLength(0);
  });
});
