/**
 * Unit tests for the connector renderer.
 *
 * Uses a mock Canvas2D context to verify that renderConnector produces the
 * correct Canvas2D API calls for straight, bent, and curved connector
 * geometries.
 */

import { describe, expect, it } from 'vitest';
import type {
  ConnectorIR,
  TransformIR,
  ShapePropertiesIR,
  LineIR,
  PresetGeometryIR,
} from '../../../ir/index.js';
import { renderConnector } from '../connector-renderer.js';
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

const redLine: LineIR = {
  color: { r: 255, g: 0, b: 0, a: 1 },
  width: 12700,
};

function makeConnector(overrides?: Partial<ConnectorIR>): ConnectorIR {
  return {
    kind: 'connector',
    properties: makeProperties({ transform: makeTransform(), line: redLine }),
    ...overrides,
  };
}

function filterCalls(calls: Array<{ method: string; args: unknown[] }>, method: string) {
  return calls.filter((c) => c.method === method);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderConnector', () => {
  // -----------------------------------------------------------------------
  // Basic rendering
  // -----------------------------------------------------------------------

  it('renders a straight connector with moveTo and lineTo', () => {
    const rctx = createMockRenderContext();
    const connector = makeConnector();

    renderConnector(connector, rctx);

    const methods = rctx.ctx._calls.map((c) => c.method);
    expect(methods).toContain('save');
    expect(methods).toContain('beginPath');
    expect(methods).toContain('moveTo');
    expect(methods).toContain('lineTo');
    expect(methods).toContain('stroke');
    expect(methods).toContain('restore');
  });

  it('skips rendering when transform is missing', () => {
    const rctx = createMockRenderContext();
    const connector = makeConnector({
      properties: makeProperties({ transform: undefined }),
    });

    renderConnector(connector, rctx);

    expect(rctx.ctx._calls).toHaveLength(0);
  });

  it('applies line styling and strokes the path', () => {
    const rctx = createMockRenderContext();
    const connector = makeConnector();

    renderConnector(connector, rctx);

    const strokeCalls = filterCalls(rctx.ctx._calls, 'stroke');
    expect(strokeCalls).toHaveLength(1);
    expect(rctx.ctx.strokeStyle).toBe('rgba(255, 0, 0, 1)');
  });

  // -----------------------------------------------------------------------
  // Straight connector geometry
  // -----------------------------------------------------------------------

  it('renders straightConnector1 as a simple line', () => {
    const rctx = createMockRenderContext();
    const geom: PresetGeometryIR = { kind: 'preset', name: 'straightConnector1' };
    const connector = makeConnector({
      properties: makeProperties({
        transform: makeTransform(),
        line: redLine,
        geometry: geom,
      }),
    });

    renderConnector(connector, rctx);

    const moveToCalls = filterCalls(rctx.ctx._calls, 'moveTo');
    const lineToCalls = filterCalls(rctx.ctx._calls, 'lineTo');
    expect(moveToCalls).toHaveLength(1);
    expect(lineToCalls).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // Bent connector geometry
  // -----------------------------------------------------------------------

  it('renders bentConnector3 with right-angle bends', () => {
    const rctx = createMockRenderContext();
    const geom: PresetGeometryIR = { kind: 'preset', name: 'bentConnector3' };
    const connector = makeConnector({
      properties: makeProperties({
        transform: makeTransform(),
        line: redLine,
        geometry: geom,
      }),
    });

    renderConnector(connector, rctx);

    const moveToCalls = filterCalls(rctx.ctx._calls, 'moveTo');
    const lineToCalls = filterCalls(rctx.ctx._calls, 'lineTo');
    // Bent connector: 1 moveTo + 3 lineTo (start -> mid -> mid -> end)
    expect(moveToCalls).toHaveLength(1);
    expect(lineToCalls).toHaveLength(3);
  });

  it('renders bentConnector2 with right-angle bends', () => {
    const rctx = createMockRenderContext();
    const geom: PresetGeometryIR = { kind: 'preset', name: 'bentConnector2' };
    const connector = makeConnector({
      properties: makeProperties({
        transform: makeTransform(),
        line: redLine,
        geometry: geom,
      }),
    });

    renderConnector(connector, rctx);

    const moveToCalls = filterCalls(rctx.ctx._calls, 'moveTo');
    expect(moveToCalls).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // Curved connector geometry
  // -----------------------------------------------------------------------

  it('renders curvedConnector3 with bezier curves', () => {
    const rctx = createMockRenderContext();
    const geom: PresetGeometryIR = { kind: 'preset', name: 'curvedConnector3' };
    const connector = makeConnector({
      properties: makeProperties({
        transform: makeTransform(),
        line: redLine,
        geometry: geom,
      }),
    });

    renderConnector(connector, rctx);

    const methods = rctx.ctx._calls.map((c) => c.method);
    expect(methods).toContain('moveTo');
    expect(methods).toContain('bezierCurveTo');
  });

  // -----------------------------------------------------------------------
  // Default geometry (no preset)
  // -----------------------------------------------------------------------

  it('defaults to straight connector when no geometry is specified', () => {
    const rctx = createMockRenderContext();
    const connector = makeConnector({
      properties: makeProperties({
        transform: makeTransform(),
        line: redLine,
        // No geometry
      }),
    });

    renderConnector(connector, rctx);

    const moveToCalls = filterCalls(rctx.ctx._calls, 'moveTo');
    const lineToCalls = filterCalls(rctx.ctx._calls, 'lineTo');
    // Straight connector: 1 moveTo + 1 lineTo
    expect(moveToCalls).toHaveLength(1);
    expect(lineToCalls).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // No line styling
  // -----------------------------------------------------------------------

  it('does not stroke when no line is specified', () => {
    const rctx = createMockRenderContext();
    const connector = makeConnector({
      properties: makeProperties({
        transform: makeTransform(),
        // No line
      }),
    });

    renderConnector(connector, rctx);

    const strokeCalls = filterCalls(rctx.ctx._calls, 'stroke');
    expect(strokeCalls).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Rotation and flips
  // -----------------------------------------------------------------------

  it('applies rotation transform', () => {
    const rctx = createMockRenderContext();
    const connector = makeConnector({
      properties: makeProperties({
        transform: makeTransform({ rotation: 90 }),
        line: redLine,
      }),
    });

    renderConnector(connector, rctx);

    const rotateCalls = filterCalls(rctx.ctx._calls, 'rotate');
    expect(rotateCalls).toHaveLength(1);
    expect(rotateCalls[0].args[0]).toBeCloseTo((90 * Math.PI) / 180, 10);
  });

  it('applies flipH via scale(-1, 1)', () => {
    const rctx = createMockRenderContext();
    const connector = makeConnector({
      properties: makeProperties({
        transform: makeTransform({ flipH: true }),
        line: redLine,
      }),
    });

    renderConnector(connector, rctx);

    const scaleCalls = filterCalls(rctx.ctx._calls, 'scale');
    expect(scaleCalls.some((c) => c.args[0] === -1 && c.args[1] === 1)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Vertical-dominant bent connector
  // -----------------------------------------------------------------------

  it('renders vertical-dominant bent connector with vertical-first routing', () => {
    const rctx = createMockRenderContext();
    const geom: PresetGeometryIR = { kind: 'preset', name: 'bentConnector3' };
    // Height > width to trigger vertical-dominant path.
    const connector = makeConnector({
      properties: makeProperties({
        transform: makeTransform({
          position: { x: 0, y: 0 },
          size: { width: 914400, height: 1828800 }, // 1 inch x 2 inches
        }),
        line: redLine,
        geometry: geom,
      }),
    });

    renderConnector(connector, rctx);

    const lineToCalls = filterCalls(rctx.ctx._calls, 'lineTo');
    // Should still have 3 lineTo for bent routing.
    expect(lineToCalls).toHaveLength(3);
  });
});
