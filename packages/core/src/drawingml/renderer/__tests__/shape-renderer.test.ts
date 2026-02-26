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
  StyleReferenceIR,
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

  it('chart grey box includes hatch lines and border', () => {
    const rctx = createMockRenderContext();
    const chart: ChartIR = {
      kind: 'chart',
      chartType: 'bar',
      properties: makeProperties({ transform: makeTransform() }),
      chartPartUri: '/ppt/charts/chart1.xml',
    };

    renderSlideElement(chart, rctx);

    const methods = rctx.ctx._calls.map((c) => c.method);
    // renderGreyBox draws: save, fillRect, clip, hatch lines, strokeRect, fillText, restore
    expect(methods).toContain('save');
    expect(methods).toContain('fillRect');
    expect(methods).toContain('clip');
    expect(methods).toContain('strokeRect');
    expect(methods).toContain('fillText');
    expect(methods).toContain('restore');
    // Hatch lines produce moveTo/lineTo pairs
    expect(methods).toContain('moveTo');
    expect(methods).toContain('lineTo');
  });

  it('chart shows loading indicator when module is loading', () => {
    const rctx = createMockRenderContext();
    rctx.loadingModuleKinds = new Set(['chart']);
    const chart: ChartIR = {
      kind: 'chart',
      chartType: 'bar',
      properties: makeProperties({ transform: makeTransform() }),
      chartPartUri: '/ppt/charts/chart1.xml',
    };

    renderSlideElement(chart, rctx);

    const fillTextCalls = rctx.ctx._calls.filter((c) => c.method === 'fillText');
    expect(fillTextCalls).toHaveLength(1);
    expect(fillTextCalls[0].args[0]).toContain('loading');
  });

  it('chart shows static label when module is not loading', () => {
    const rctx = createMockRenderContext();
    // No loadingModuleKinds set
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

// ---------------------------------------------------------------------------
// Style reference merge tests
// ---------------------------------------------------------------------------

describe('renderShape — style reference resolution', () => {
  /**
   * Create a render context whose theme format scheme has real fill/line
   * styles so that style reference resolution produces visible results.
   */
  function createStyledRenderContext() {
    const rctx = createMockRenderContext();
    rctx.theme.formatScheme.fillStyles = [
      { type: 'solid', color: { r: 100, g: 150, b: 200, a: 1 } },
      { type: 'solid', color: { r: 200, g: 100, b: 50, a: 1 } },
      { type: 'solid', color: { r: 50, g: 200, b: 100, a: 1 } },
    ];
    rctx.theme.formatScheme.lineStyles = [
      { width: 6350, color: { r: 0, g: 0, b: 0, a: 1 } },
      { width: 12700, color: { r: 128, g: 128, b: 128, a: 1 } },
      { width: 19050, color: { r: 255, g: 255, b: 255, a: 1 } },
    ];
    rctx.theme.fontScheme.majorLatin = 'Calibri Light';
    rctx.theme.fontScheme.minorLatin = 'Calibri';
    return rctx;
  }

  it('uses theme fill from style reference when no inline fill', () => {
    const rctx = createStyledRenderContext();
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform(),
        // No inline fill
      }),
      style: {
        fillRef: { idx: 1, color: { r: 68, g: 114, b: 196, a: 1 } },
      },
    });

    renderShape(shape, rctx);

    // The shape should have a fill call because fillRef idx=1 resolves
    // to the first fill style (solid { r: 100, g: 150, b: 200 }).
    const fillCalls = rctx.ctx._calls.filter((c) => c.method === 'fill');
    expect(fillCalls).toHaveLength(1);
  });

  it('inline fill overrides style reference fill', () => {
    const rctx = createStyledRenderContext();
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform(),
        fill: solidBlue, // Inline fill present
      }),
      style: {
        fillRef: { idx: 1, color: { r: 68, g: 114, b: 196, a: 1 } },
      },
    });

    renderShape(shape, rctx);

    const fillCalls = rctx.ctx._calls.filter((c) => c.method === 'fill');
    expect(fillCalls).toHaveLength(1);

    // The fillStyle should be the inline blue, not the theme fill.
    // Solid blue = rgba(0, 0, 255, 1)
    expect(rctx.ctx.fillStyle).toContain('0, 0, 255');
  });

  it('uses theme line from style reference when no inline line', () => {
    const rctx = createStyledRenderContext();
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform(),
        // No inline line
      }),
      style: {
        lnRef: { idx: 2, color: { r: 68, g: 114, b: 196, a: 1 } },
      },
    });

    renderShape(shape, rctx);

    // The shape should have a stroke call because lnRef idx=2 resolves
    // to the second line style.
    const strokeCalls = rctx.ctx._calls.filter((c) => c.method === 'stroke');
    expect(strokeCalls).toHaveLength(1);
  });

  it('inline line overrides style reference line', () => {
    const rctx = createStyledRenderContext();
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform(),
        line: redLine, // Inline line present
      }),
      style: {
        lnRef: { idx: 1, color: { r: 68, g: 114, b: 196, a: 1 } },
      },
    });

    renderShape(shape, rctx);

    const strokeCalls = rctx.ctx._calls.filter((c) => c.method === 'stroke');
    expect(strokeCalls).toHaveLength(1);

    // The strokeStyle should be the inline red line color.
    expect(rctx.ctx.strokeStyle).toContain('255, 0, 0');
  });

  it('does not apply style fill when fillRef idx is 0', () => {
    const rctx = createStyledRenderContext();
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform(),
      }),
      style: {
        fillRef: { idx: 0, color: { r: 68, g: 114, b: 196, a: 1 } },
      },
    });

    renderShape(shape, rctx);

    const fillCalls = rctx.ctx._calls.filter((c) => c.method === 'fill');
    expect(fillCalls).toHaveLength(0);
  });

  it('does not apply style line when lnRef idx is 0', () => {
    const rctx = createStyledRenderContext();
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform(),
      }),
      style: {
        lnRef: { idx: 0, color: { r: 68, g: 114, b: 196, a: 1 } },
      },
    });

    renderShape(shape, rctx);

    const strokeCalls = rctx.ctx._calls.filter((c) => c.method === 'stroke');
    expect(strokeCalls).toHaveLength(0);
  });

  it('shape without style or inline properties renders without fill or stroke', () => {
    const rctx = createStyledRenderContext();
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform(),
      }),
      // No style, no inline fill/line
    });

    renderShape(shape, rctx);

    const fillCalls = rctx.ctx._calls.filter((c) => c.method === 'fill');
    const strokeCalls = rctx.ctx._calls.filter((c) => c.method === 'stroke');
    expect(fillCalls).toHaveLength(0);
    expect(strokeCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// spAutoFit tests
// ---------------------------------------------------------------------------

describe('renderShape — spAutoFit (shape auto-fit)', () => {
  /**
   * Create a text body with spAutoFit enabled and zero insets so the full
   * shape width is available for text layout.
   *
   * Uses many paragraphs to ensure the text overflows the declared shape
   * height, forcing spAutoFit to expand the shape.
   */
  function makeSpAutoFitTextBody(
    overrides?: Partial<TextBodyIR['bodyProperties']>,
    paragraphCount = 5
  ): TextBodyIR {
    const paragraphs = [];
    for (let i = 0; i < paragraphCount; i++) {
      paragraphs.push({
        runs: [
          {
            kind: 'run' as const,
            text: 'This is a line of text that should take up space',
            properties: { fontSize: 1800 },
          },
        ],
        properties: {},
      });
    }
    return {
      paragraphs,
      bodyProperties: {
        autoFit: 'spAutoFit',
        leftInset: 0,
        rightInset: 0,
        topInset: 0,
        bottomInset: 0,
        ...overrides,
      },
    };
  }

  it('expands shape height when text overflows', () => {
    const rctx = createMockRenderContext();
    // Small shape: 200px wide x 10px tall (will overflow with 5 paragraphs).
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform({
          size: { width: 9144000, height: 91440 }, // ~960px wide, ~9.6px tall
        }),
        fill: solidBlue,
      }),
      textBody: makeSpAutoFitTextBody(),
    });

    renderShape(shape, rctx);

    // The fallback rect call should use expanded height, not the original 9.6px.
    // Find the rect call that draws the shape background.
    const rectCalls = rctx.ctx._calls.filter((c) => c.method === 'rect');
    expect(rectCalls.length).toBeGreaterThan(0);
    // The rect height (4th arg, index 3) should be larger than the
    // original 9.6px (91440 EMU at dpiScale 1).
    const bgRect = rectCalls[0];
    const rectHeight = bgRect.args[3] as number;
    expect(rectHeight).toBeGreaterThan(9.6);
  });

  it('does not shrink shape height when text fits', () => {
    const rctx = createMockRenderContext();
    // Large shape: 960px wide x 960px tall (text easily fits).
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform({
          size: { width: 9144000, height: 9144000 }, // ~960px x ~960px
        }),
        fill: solidBlue,
      }),
      textBody: makeSpAutoFitTextBody({}, 1), // Single paragraph
    });

    renderShape(shape, rctx);

    // The rect height should remain at the original 960px.
    const rectCalls = rctx.ctx._calls.filter((c) => c.method === 'rect');
    expect(rectCalls.length).toBeGreaterThan(0);
    const bgRect = rectCalls[0];
    const rectHeight = bgRect.args[3] as number;
    // Original height is 9144000 EMU = 960px at dpiScale 1.
    expect(rectHeight).toBeCloseTo(960, 0);
  });

  it('does not change width', () => {
    const rctx = createMockRenderContext();
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform({
          size: { width: 9144000, height: 91440 }, // 960px wide, 9.6px tall
        }),
        fill: solidBlue,
      }),
      textBody: makeSpAutoFitTextBody(),
    });

    renderShape(shape, rctx);

    // Width of the rect call should remain at the original 960px.
    const rectCalls = rctx.ctx._calls.filter((c) => c.method === 'rect');
    expect(rectCalls.length).toBeGreaterThan(0);
    const bgRect = rectCalls[0];
    const rectWidth = bgRect.args[2] as number;
    expect(rectWidth).toBeCloseTo(960, 0);
  });

  it('does not affect shapes without spAutoFit', () => {
    const rctx = createMockRenderContext();
    // Same small shape, but autoFit is 'none'.
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform({
          size: { width: 9144000, height: 91440 }, // 960px wide, 9.6px tall
        }),
        fill: solidBlue,
      }),
      textBody: {
        paragraphs: [
          {
            runs: [
              {
                kind: 'run' as const,
                text: 'This is a line of text that should take up space',
                properties: { fontSize: 1800 },
              },
            ],
            properties: {},
          },
          {
            runs: [
              {
                kind: 'run' as const,
                text: 'Another line',
                properties: { fontSize: 1800 },
              },
            ],
            properties: {},
          },
        ],
        bodyProperties: {
          autoFit: 'none',
          leftInset: 0,
          rightInset: 0,
          topInset: 0,
          bottomInset: 0,
        },
      },
    });

    renderShape(shape, rctx);

    // The rect height should remain at the original 9.6px (no expansion).
    const rectCalls = rctx.ctx._calls.filter((c) => c.method === 'rect');
    expect(rectCalls.length).toBeGreaterThan(0);
    const bgRect = rectCalls[0];
    const rectHeight = bgRect.args[3] as number;
    expect(rectHeight).toBeCloseTo(9.6, 0);
  });

  it('does not affect shapes with shrink autoFit', () => {
    const rctx = createMockRenderContext();
    const shape = makeShape({
      properties: makeProperties({
        transform: makeTransform({
          size: { width: 9144000, height: 91440 }, // 960px wide, 9.6px tall
        }),
        fill: solidBlue,
      }),
      textBody: {
        paragraphs: [
          {
            runs: [
              {
                kind: 'run' as const,
                text: 'Text',
                properties: { fontSize: 1800 },
              },
            ],
            properties: {},
          },
        ],
        bodyProperties: {
          autoFit: 'shrink',
          leftInset: 0,
          rightInset: 0,
          topInset: 0,
          bottomInset: 0,
        },
      },
    });

    renderShape(shape, rctx);

    // The rect height should remain at the original 9.6px (no expansion).
    const rectCalls = rctx.ctx._calls.filter((c) => c.method === 'rect');
    expect(rectCalls.length).toBeGreaterThan(0);
    const bgRect = rectCalls[0];
    const rectHeight = bgRect.args[3] as number;
    expect(rectHeight).toBeCloseTo(9.6, 0);
  });
});
