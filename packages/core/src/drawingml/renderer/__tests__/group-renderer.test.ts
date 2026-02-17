/**
 * Unit tests for the group renderer.
 *
 * Uses the mock Canvas2D context to verify the correct Canvas2D API
 * call sequence for group rendering and child coordinate space mapping.
 */

import { describe, expect, it } from 'vitest';
import type {
  DrawingMLShapeIR,
  GroupIR,
  TransformIR,
  ShapePropertiesIR,
  SolidFillIR,
  SlideElementIR,
} from '../../../ir/index.js';
import { renderGroup } from '../group-renderer.js';
import { createMockRenderContext } from './mock-canvas.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTransform(overrides?: Partial<TransformIR>): TransformIR {
  return {
    position: { x: 914400, y: 914400 }, // 1 inch = 96px
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

const solidBlue: SolidFillIR = {
  type: 'solid',
  color: { r: 0, g: 0, b: 255, a: 1 },
};

function makeChildShape(overrides?: Partial<DrawingMLShapeIR>): DrawingMLShapeIR {
  return {
    kind: 'shape',
    properties: makeProperties({
      transform: makeTransform({
        position: { x: 0, y: 0 },
        size: { width: 914400, height: 914400 },
      }),
      fill: solidBlue,
    }),
    ...overrides,
  };
}

function makeGroup(overrides?: Partial<GroupIR>): GroupIR {
  return {
    kind: 'group',
    properties: makeProperties({ transform: makeTransform() }),
    childOffset: { x: 0, y: 0 },
    childExtent: { width: 1828800, height: 914400 },
    children: [makeChildShape()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderGroup', () => {
  it('renders a group with child shapes', () => {
    const rctx = createMockRenderContext();
    const group = makeGroup();

    renderGroup(group, rctx);

    const methods = rctx.ctx._calls.map((c) => c.method);
    // Group rendering should include save/restore and child fill.
    expect(methods[0]).toBe('save');
    expect(methods[methods.length - 1]).toBe('restore');
    // Child shape should be rendered (it has a fill).
    expect(methods).toContain('fill');
  });

  it('applies group transform before rendering children', () => {
    const rctx = createMockRenderContext();
    const group = makeGroup();

    renderGroup(group, rctx);

    const calls = rctx.ctx._calls;
    const methods = calls.map((c) => c.method);

    // The first call should be save (group save).
    expect(methods[0]).toBe('save');

    // Translate should appear before any child rendering (fill, stroke).
    const firstTranslate = methods.indexOf('translate');
    const firstFill = methods.indexOf('fill');
    expect(firstTranslate).toBeLessThan(firstFill);
  });

  it('applies child coordinate space mapping with scale', () => {
    const rctx = createMockRenderContext();
    // Group is 2in x 1in, child space is 4in x 2in
    // -> scaleX = 2/4 = 0.5, scaleY = 1/2 = 0.5
    const group = makeGroup({
      properties: makeProperties({
        transform: makeTransform({
          position: { x: 0, y: 0 },
          size: { width: 1828800, height: 914400 }, // 2in x 1in
        }),
      }),
      childOffset: { x: 0, y: 0 },
      childExtent: { width: 3657600, height: 1828800 }, // 4in x 2in
    });

    renderGroup(group, rctx);

    const scaleCalls = rctx.ctx._calls.filter((c) => c.method === 'scale');
    // Should have one scale call for child space mapping.
    expect(scaleCalls.length).toBeGreaterThanOrEqual(1);
    // The child space scale should be 0.5, 0.5.
    const childScale = scaleCalls[scaleCalls.length - 1];
    expect(childScale.args[0]).toBeCloseTo(0.5, 5);
    expect(childScale.args[1]).toBeCloseTo(0.5, 5);
  });

  it('renders children recursively', () => {
    const rctx = createMockRenderContext();
    const child1 = makeChildShape();
    const child2 = makeChildShape({
      properties: makeProperties({
        transform: makeTransform({
          position: { x: 914400, y: 0 },
          size: { width: 914400, height: 914400 },
        }),
        fill: { type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 } },
      }),
    });
    const group = makeGroup({ children: [child1, child2] });

    renderGroup(group, rctx);

    // Both children should produce fill calls.
    const fillCalls = rctx.ctx._calls.filter((c) => c.method === 'fill');
    expect(fillCalls).toHaveLength(2);
  });

  it('handles nested groups correctly', () => {
    const rctx = createMockRenderContext();
    const innerGroup: GroupIR = {
      kind: 'group',
      properties: makeProperties({
        transform: makeTransform({
          position: { x: 0, y: 0 },
          size: { width: 914400, height: 914400 },
        }),
      }),
      childOffset: { x: 0, y: 0 },
      childExtent: { width: 914400, height: 914400 },
      children: [makeChildShape()],
    };
    const outerGroup = makeGroup({
      children: [innerGroup as SlideElementIR],
    });

    renderGroup(outerGroup, rctx);

    // Should have multiple save/restore pairs (outer group + inner group + child shape).
    const saveCalls = rctx.ctx._calls.filter((c) => c.method === 'save');
    const restoreCalls = rctx.ctx._calls.filter((c) => c.method === 'restore');
    expect(saveCalls.length).toBeGreaterThanOrEqual(3); // outer + inner + child shape
    expect(saveCalls.length).toBe(restoreCalls.length);
  });

  it('does not crash with empty children array', () => {
    const rctx = createMockRenderContext();
    const group = makeGroup({ children: [] });

    expect(() => renderGroup(group, rctx)).not.toThrow();

    // Should still have save/restore for the group transform.
    const methods = rctx.ctx._calls.map((c) => c.method);
    expect(methods[0]).toBe('save');
    expect(methods[methods.length - 1]).toBe('restore');
  });

  it('skips rendering when group has no transform', () => {
    const rctx = createMockRenderContext();
    const group = makeGroup({
      properties: makeProperties({ transform: undefined }),
    });

    renderGroup(group, rctx);

    expect(rctx.ctx._calls).toHaveLength(0);
  });

  it('applies rotation to group transform', () => {
    const rctx = createMockRenderContext();
    const group = makeGroup({
      properties: makeProperties({
        transform: makeTransform({ rotation: 90 }),
      }),
      children: [],
    });

    renderGroup(group, rctx);

    const rotateCalls = rctx.ctx._calls.filter((c) => c.method === 'rotate');
    expect(rotateCalls).toHaveLength(1);
    expect(rotateCalls[0].args[0]).toBeCloseTo((90 * Math.PI) / 180, 10);
  });

  it('applies flipH and flipV to group transform', () => {
    const rctx = createMockRenderContext();
    const group = makeGroup({
      properties: makeProperties({
        transform: makeTransform({ flipH: true, flipV: true }),
      }),
      children: [],
    });

    renderGroup(group, rctx);

    const scaleCalls = rctx.ctx._calls.filter((c) => c.method === 'scale');
    // flipH: scale(-1, 1), flipV: scale(1, -1), then child space scale
    expect(scaleCalls.length).toBeGreaterThanOrEqual(2);
    expect(scaleCalls[0].args).toEqual([-1, 1]);
    expect(scaleCalls[1].args).toEqual([1, -1]);
  });

  it('handles non-zero child offset', () => {
    const rctx = createMockRenderContext();
    const group = makeGroup({
      properties: makeProperties({
        transform: makeTransform({
          position: { x: 0, y: 0 },
          size: { width: 914400, height: 914400 },
        }),
      }),
      childOffset: { x: 914400, y: 914400 }, // 1 inch offset
      childExtent: { width: 914400, height: 914400 },
    });

    renderGroup(group, rctx);

    // Should include translate calls for child offset mapping.
    const translateCalls = rctx.ctx._calls.filter((c) => c.method === 'translate');
    // At least 3 translates: center, back, and child offset
    expect(translateCalls.length).toBeGreaterThanOrEqual(3);
  });
});
