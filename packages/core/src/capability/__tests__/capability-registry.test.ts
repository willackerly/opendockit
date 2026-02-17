/**
 * Comprehensive tests for the Capability Registry module.
 *
 * Covers:
 *   - Registration and routing
 *   - Priority resolution (higher wins)
 *   - Immediate vs deferred categorization
 *   - Render plan generation with stats
 *   - Coverage report
 *   - Grey-box rendering (mock Canvas2D)
 *   - Edge cases: empty registry, no match, duplicate registration
 */

import { describe, expect, it } from 'vitest';
import { CapabilityRegistry } from '../registry.js';
import type { RendererRegistration, RenderVerdict } from '../registry.js';
import type { RenderPlan } from '../render-plan.js';
import type { CoverageReport } from '../coverage-report.js';
import { renderGreyBox } from '../grey-box.js';
import type {
  SlideElementIR,
  DrawingMLShapeIR,
  PictureIR,
  ConnectorIR,
  TableIR,
  GroupIR,
  ChartIR,
  UnsupportedIR,
  BoundingBox,
} from '../../ir/index.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeShape(name?: string): DrawingMLShapeIR {
  return {
    kind: 'shape',
    id: '1',
    name: name ?? 'Shape 1',
    properties: { effects: [] },
  };
}

function makePicture(): PictureIR {
  return {
    kind: 'picture',
    imagePartUri: '/ppt/media/image1.png',
    properties: { effects: [] },
    nonVisualProperties: { name: 'Picture 1' },
  };
}

function makeConnector(): ConnectorIR {
  return {
    kind: 'connector',
    properties: { effects: [] },
  };
}

function makeTable(): TableIR {
  return {
    kind: 'table',
    properties: { effects: [] },
    rows: [],
  };
}

function makeGroup(): GroupIR {
  return {
    kind: 'group',
    properties: { effects: [] },
    childOffset: { x: 0, y: 0 },
    childExtent: { width: 100, height: 100 },
    children: [],
  };
}

function makeChart(): ChartIR {
  return {
    kind: 'chart',
    chartType: 'bar',
    properties: { effects: [] },
    chartPartUri: '/ppt/charts/chart1.xml',
  };
}

function makeUnsupported(): UnsupportedIR {
  return {
    kind: 'unsupported',
    elementType: 'mc:AlternateContent',
    reason: 'Not yet implemented',
  };
}

/** Renderer that handles all shapes. */
function shapeRenderer(overrides?: Partial<RendererRegistration>): RendererRegistration {
  return {
    id: 'ts-shape',
    kind: 'immediate',
    canRender: (el) => el.kind === 'shape',
    priority: 0,
    ...overrides,
  };
}

/** Renderer that handles all pictures. */
function pictureRenderer(overrides?: Partial<RendererRegistration>): RendererRegistration {
  return {
    id: 'ts-picture',
    kind: 'immediate',
    canRender: (el) => el.kind === 'picture',
    priority: 0,
    ...overrides,
  };
}

/** Deferred WASM renderer for charts. */
function chartWasmRenderer(overrides?: Partial<RendererRegistration>): RendererRegistration {
  return {
    id: 'wasm-chart',
    kind: 'deferred',
    canRender: (el) => el.kind === 'chart',
    priority: 0,
    moduleId: 'chart-wasm',
    estimatedBytes: 512_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Canvas2D context
// ---------------------------------------------------------------------------

interface MockCall {
  method: string;
  args: unknown[];
}

function createMockCtx(): CanvasRenderingContext2D & { _calls: MockCall[] } {
  const calls: MockCall[] = [];

  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '10px sans-serif',
    textAlign: 'start' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,

    save: () => calls.push({ method: 'save', args: [] }),
    restore: () => calls.push({ method: 'restore', args: [] }),
    fillRect: (x: number, y: number, w: number, h: number) =>
      calls.push({ method: 'fillRect', args: [x, y, w, h] }),
    strokeRect: (x: number, y: number, w: number, h: number) =>
      calls.push({ method: 'strokeRect', args: [x, y, w, h] }),
    fillText: (text: string, x: number, y: number) =>
      calls.push({ method: 'fillText', args: [text, x, y] }),
    beginPath: () => calls.push({ method: 'beginPath', args: [] }),
    rect: (x: number, y: number, w: number, h: number) =>
      calls.push({ method: 'rect', args: [x, y, w, h] }),
    clip: () => calls.push({ method: 'clip', args: [] }),
    moveTo: (x: number, y: number) => calls.push({ method: 'moveTo', args: [x, y] }),
    lineTo: (x: number, y: number) => calls.push({ method: 'lineTo', args: [x, y] }),
    stroke: () => calls.push({ method: 'stroke', args: [] }),
    measureText: (text: string) => {
      // Simple mock: 7px per character
      return { width: text.length * 7 };
    },

    _calls: calls,
  } as unknown as CanvasRenderingContext2D & { _calls: MockCall[] };

  return ctx;
}

// ---------------------------------------------------------------------------
// Registration and routing
// ---------------------------------------------------------------------------

describe('CapabilityRegistry — registration and routing', () => {
  it('routes a shape to a registered shape renderer', () => {
    const registry = new CapabilityRegistry();
    registry.register(shapeRenderer());

    const verdict = registry.route(makeShape());
    expect(verdict.status).toBe('immediate');
    expect(verdict.renderer?.id).toBe('ts-shape');
    expect(verdict.reason).toBeUndefined();
  });

  it('routes a picture to a registered picture renderer', () => {
    const registry = new CapabilityRegistry();
    registry.register(pictureRenderer());

    const verdict = registry.route(makePicture());
    expect(verdict.status).toBe('immediate');
    expect(verdict.renderer?.id).toBe('ts-picture');
  });

  it('returns unsupported when no renderer matches', () => {
    const registry = new CapabilityRegistry();
    registry.register(shapeRenderer());

    const verdict = registry.route(makePicture());
    expect(verdict.status).toBe('unsupported');
    expect(verdict.renderer).toBeUndefined();
    expect(verdict.reason).toContain('picture');
  });

  it('routes a chart to a deferred WASM renderer', () => {
    const registry = new CapabilityRegistry();
    registry.register(chartWasmRenderer());

    const verdict = registry.route(makeChart());
    expect(verdict.status).toBe('deferred');
    expect(verdict.renderer?.id).toBe('wasm-chart');
    expect(verdict.renderer?.moduleId).toBe('chart-wasm');
  });

  it('returns unsupported for elements of kind "unsupported"', () => {
    const registry = new CapabilityRegistry();
    registry.register(shapeRenderer());

    const verdict = registry.route(makeUnsupported());
    expect(verdict.status).toBe('unsupported');
    expect(verdict.reason).toContain('unsupported');
  });
});

// ---------------------------------------------------------------------------
// Priority resolution
// ---------------------------------------------------------------------------

describe('CapabilityRegistry — priority resolution', () => {
  it('selects the higher-priority renderer when multiple match', () => {
    const registry = new CapabilityRegistry();

    registry.register(shapeRenderer({ id: 'ts-shape-basic', priority: 0 }));
    registry.register(shapeRenderer({ id: 'ts-shape-advanced', priority: 10 }));

    const verdict = registry.route(makeShape());
    expect(verdict.renderer?.id).toBe('ts-shape-advanced');
  });

  it('selects the higher-priority renderer regardless of registration order', () => {
    const registry = new CapabilityRegistry();

    // Register high-priority first, then low-priority
    registry.register(shapeRenderer({ id: 'ts-shape-advanced', priority: 10 }));
    registry.register(shapeRenderer({ id: 'ts-shape-basic', priority: 0 }));

    const verdict = registry.route(makeShape());
    expect(verdict.renderer?.id).toBe('ts-shape-advanced');
  });

  it('uses default priority of 0 when not specified', () => {
    const registry = new CapabilityRegistry();

    registry.register(shapeRenderer({ id: 'ts-shape-default', priority: undefined }));
    registry.register(shapeRenderer({ id: 'ts-shape-positive', priority: 1 }));

    const verdict = registry.route(makeShape());
    expect(verdict.renderer?.id).toBe('ts-shape-positive');
  });

  it('prefers higher-priority deferred over lower-priority immediate', () => {
    const registry = new CapabilityRegistry();

    registry.register({
      id: 'ts-chart-basic',
      kind: 'immediate',
      canRender: (el) => el.kind === 'chart',
      priority: 0,
    });
    registry.register(chartWasmRenderer({ priority: 10 }));

    const verdict = registry.route(makeChart());
    expect(verdict.renderer?.id).toBe('wasm-chart');
    expect(verdict.status).toBe('deferred');
  });

  it('selects the first registered renderer when priorities are equal', () => {
    const registry = new CapabilityRegistry();

    // Both have priority 5 — the first one registered wins because
    // we use strict greater-than comparison
    registry.register(shapeRenderer({ id: 'first', priority: 5 }));
    registry.register(shapeRenderer({ id: 'second', priority: 5 }));

    const verdict = registry.route(makeShape());
    expect(verdict.renderer?.id).toBe('first');
  });

  it('handles negative priorities', () => {
    const registry = new CapabilityRegistry();

    registry.register(shapeRenderer({ id: 'negative', priority: -10 }));
    registry.register(shapeRenderer({ id: 'zero', priority: 0 }));

    const verdict = registry.route(makeShape());
    expect(verdict.renderer?.id).toBe('zero');
  });
});

// ---------------------------------------------------------------------------
// Render plan generation
// ---------------------------------------------------------------------------

describe('CapabilityRegistry — planRender', () => {
  it('categorizes elements into immediate, deferred, and unsupported', () => {
    const registry = new CapabilityRegistry();
    registry.register(shapeRenderer());
    registry.register(pictureRenderer());
    registry.register(chartWasmRenderer());

    const elements: SlideElementIR[] = [
      makeShape(),
      makePicture(),
      makeChart(),
      makeTable(), // no renderer registered
      makeConnector(), // no renderer registered
    ];

    const plan = registry.planRender(elements);

    expect(plan.immediate).toHaveLength(2);
    expect(plan.deferred).toHaveLength(1);
    expect(plan.unsupported).toHaveLength(2);

    // Verify immediate entries
    expect(plan.immediate[0].renderer.id).toBe('ts-shape');
    expect(plan.immediate[0].element.kind).toBe('shape');
    expect(plan.immediate[1].renderer.id).toBe('ts-picture');
    expect(plan.immediate[1].element.kind).toBe('picture');

    // Verify deferred entry
    expect(plan.deferred[0].renderer.id).toBe('wasm-chart');
    expect(plan.deferred[0].moduleId).toBe('chart-wasm');
    expect(plan.deferred[0].estimatedBytes).toBe(512_000);

    // Verify unsupported entries
    expect(plan.unsupported[0].element.kind).toBe('table');
    expect(plan.unsupported[0].reason).toContain('table');
    expect(plan.unsupported[1].element.kind).toBe('connector');
  });

  it('produces correct stats', () => {
    const registry = new CapabilityRegistry();
    registry.register(shapeRenderer());
    registry.register(chartWasmRenderer());

    const elements: SlideElementIR[] = [
      makeShape(),
      makeShape('Shape 2'),
      makeChart(),
      makeTable(),
    ];

    const plan = registry.planRender(elements);

    expect(plan.stats).toEqual({
      total: 4,
      immediate: 2,
      deferred: 1,
      unsupported: 1,
    });
  });

  it('returns empty plan for empty input', () => {
    const registry = new CapabilityRegistry();
    registry.register(shapeRenderer());

    const plan = registry.planRender([]);

    expect(plan.immediate).toHaveLength(0);
    expect(plan.deferred).toHaveLength(0);
    expect(plan.unsupported).toHaveLength(0);
    expect(plan.stats).toEqual({
      total: 0,
      immediate: 0,
      deferred: 0,
      unsupported: 0,
    });
  });

  it('marks everything unsupported with empty registry', () => {
    const registry = new CapabilityRegistry();

    const elements: SlideElementIR[] = [makeShape(), makePicture()];
    const plan = registry.planRender(elements);

    expect(plan.immediate).toHaveLength(0);
    expect(plan.deferred).toHaveLength(0);
    expect(plan.unsupported).toHaveLength(2);
    expect(plan.stats.unsupported).toBe(2);
  });

  it('uses "unknown" moduleId when deferred renderer lacks moduleId', () => {
    const registry = new CapabilityRegistry();
    registry.register({
      id: 'wasm-table',
      kind: 'deferred',
      canRender: (el) => el.kind === 'table',
      // No moduleId or estimatedBytes
    });

    const plan = registry.planRender([makeTable()]);
    expect(plan.deferred[0].moduleId).toBe('unknown');
    expect(plan.deferred[0].estimatedBytes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Coverage report
// ---------------------------------------------------------------------------

describe('CapabilityRegistry — generateCoverageReport', () => {
  it('generates per-element coverage status', () => {
    const registry = new CapabilityRegistry();
    registry.register(shapeRenderer());
    registry.register(chartWasmRenderer());

    const elements: SlideElementIR[] = [makeShape(), makeChart(), makeTable()];
    const report = registry.generateCoverageReport(elements);

    expect(report.entries).toHaveLength(3);

    // Shape — immediate
    expect(report.entries[0].status).toBe('immediate');
    expect(report.entries[0].rendererId).toBe('ts-shape');
    expect(report.entries[0].reason).toBeUndefined();

    // Chart — deferred
    expect(report.entries[1].status).toBe('deferred');
    expect(report.entries[1].rendererId).toBe('wasm-chart');

    // Table — unsupported
    expect(report.entries[2].status).toBe('unsupported');
    expect(report.entries[2].rendererId).toBeUndefined();
    expect(report.entries[2].reason).toContain('table');
  });

  it('produces correct summary counts', () => {
    const registry = new CapabilityRegistry();
    registry.register(shapeRenderer());
    registry.register(pictureRenderer());

    const elements: SlideElementIR[] = [
      makeShape(),
      makeShape('Shape 2'),
      makePicture(),
      makeChart(),
      makeTable(),
    ];
    const report = registry.generateCoverageReport(elements);

    expect(report.summary).toEqual({
      total: 5,
      immediate: 3,
      deferred: 0,
      unsupported: 2,
    });
  });

  it('handles empty elements', () => {
    const registry = new CapabilityRegistry();
    const report = registry.generateCoverageReport([]);

    expect(report.entries).toHaveLength(0);
    expect(report.summary).toEqual({
      total: 0,
      immediate: 0,
      deferred: 0,
      unsupported: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// Grey-box rendering
// ---------------------------------------------------------------------------

describe('renderGreyBox', () => {
  it('renders a grey box with fill, hatch, border, and label', () => {
    const ctx = createMockCtx();
    const bounds: BoundingBox = { x: 10, y: 20, width: 200, height: 100 };

    renderGreyBox(ctx, bounds, 'chart');

    // Should have save/restore pairs
    const methods = ctx._calls.map((c) => c.method);
    expect(methods.filter((m) => m === 'save').length).toBeGreaterThanOrEqual(1);
    expect(methods.filter((m) => m === 'restore').length).toBeGreaterThanOrEqual(1);

    // Should fill a rectangle (the background)
    const fillRects = ctx._calls.filter((c) => c.method === 'fillRect');
    expect(fillRects.length).toBeGreaterThanOrEqual(1);
    expect(fillRects[0].args).toEqual([10, 20, 200, 100]);

    // Should stroke a rectangle (the border)
    const strokeRects = ctx._calls.filter((c) => c.method === 'strokeRect');
    expect(strokeRects.length).toBeGreaterThanOrEqual(1);

    // Should render text
    const fillTexts = ctx._calls.filter((c) => c.method === 'fillText');
    expect(fillTexts.length).toBe(1);
    expect(fillTexts[0].args[0]).toBe('chart');
    // Label centered: x + width/2 = 110, y + height/2 = 70
    expect(fillTexts[0].args[1]).toBe(110);
    expect(fillTexts[0].args[2]).toBe(70);
  });

  it('draws hatch lines', () => {
    const ctx = createMockCtx();
    const bounds: BoundingBox = { x: 0, y: 0, width: 100, height: 50 };

    renderGreyBox(ctx, bounds, 'test');

    // Should have moveTo/lineTo pairs for hatch lines
    const moveToCount = ctx._calls.filter((c) => c.method === 'moveTo').length;
    const lineToCount = ctx._calls.filter((c) => c.method === 'lineTo').length;
    expect(moveToCount).toBeGreaterThan(0);
    expect(lineToCount).toBeGreaterThan(0);
    // Hatch lines come in pairs
    expect(moveToCount).toBe(lineToCount);
  });

  it('clips hatch lines to bounds', () => {
    const ctx = createMockCtx();
    const bounds: BoundingBox = { x: 50, y: 50, width: 100, height: 80 };

    renderGreyBox(ctx, bounds, 'clipped');

    // Should use clip
    const clips = ctx._calls.filter((c) => c.method === 'clip');
    expect(clips.length).toBeGreaterThanOrEqual(1);
  });

  it('does nothing for zero-size bounds', () => {
    const ctx = createMockCtx();

    renderGreyBox(ctx, { x: 10, y: 10, width: 0, height: 100 }, 'empty');
    expect(ctx._calls).toHaveLength(0);

    renderGreyBox(ctx, { x: 10, y: 10, width: 100, height: 0 }, 'empty');
    expect(ctx._calls).toHaveLength(0);
  });

  it('does nothing for negative-size bounds', () => {
    const ctx = createMockCtx();

    renderGreyBox(ctx, { x: 0, y: 0, width: -10, height: 50 }, 'negative');
    expect(ctx._calls).toHaveLength(0);
  });

  it('respects dpiScale parameter', () => {
    const ctx = createMockCtx();
    const bounds: BoundingBox = { x: 0, y: 0, width: 200, height: 100 };

    renderGreyBox(ctx, bounds, 'scaled', 2);

    // The hatch lines and border should use scaled lineWidth
    // We can't check lineWidth directly from calls, but we can verify
    // the function ran without error
    const fillTexts = ctx._calls.filter((c) => c.method === 'fillText');
    expect(fillTexts.length).toBe(1);
  });

  it('handles very small bounds gracefully', () => {
    const ctx = createMockCtx();
    const bounds: BoundingBox = { x: 0, y: 0, width: 5, height: 5 };

    // Should not throw
    renderGreyBox(ctx, bounds, 'This is a very long label that will not fit');

    // Background fill should still be drawn
    const fillRects = ctx._calls.filter((c) => c.method === 'fillRect');
    expect(fillRects.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('CapabilityRegistry — edge cases', () => {
  it('empty registry returns unsupported for any element', () => {
    const registry = new CapabilityRegistry();
    const verdict = registry.route(makeShape());
    expect(verdict.status).toBe('unsupported');
  });

  it('handles duplicate registrations (same ID registered twice)', () => {
    const registry = new CapabilityRegistry();
    registry.register(shapeRenderer({ id: 'ts-shape', priority: 0 }));
    registry.register(shapeRenderer({ id: 'ts-shape', priority: 5 }));

    // The second registration (higher priority) should win
    const verdict = registry.route(makeShape());
    expect(verdict.renderer?.id).toBe('ts-shape');
    // It picks the priority-5 one
    expect(verdict.renderer?.priority).toBe(5);
  });

  it('handles a renderer that claims to handle everything', () => {
    const registry = new CapabilityRegistry();
    registry.register({
      id: 'catch-all',
      kind: 'immediate',
      canRender: () => true,
      priority: -100,
    });
    registry.register(shapeRenderer({ priority: 10 }));

    // Shape should go to the specialized renderer (higher priority)
    const shapeVerdict = registry.route(makeShape());
    expect(shapeVerdict.renderer?.id).toBe('ts-shape');

    // Table should fall through to catch-all
    const tableVerdict = registry.route(makeTable());
    expect(tableVerdict.renderer?.id).toBe('catch-all');
    expect(tableVerdict.status).toBe('immediate');
  });

  it('renderer canRender receives the full element', () => {
    const registry = new CapabilityRegistry();
    let receivedElement: SlideElementIR | undefined;

    registry.register({
      id: 'spy',
      kind: 'immediate',
      canRender: (el) => {
        receivedElement = el;
        return el.kind === 'shape';
      },
    });

    const shape = makeShape('Spy Target');
    registry.route(shape);

    expect(receivedElement).toBe(shape);
    expect(receivedElement?.kind).toBe('shape');
    if (receivedElement?.kind === 'shape') {
      expect(receivedElement.name).toBe('Spy Target');
    }
  });

  it('handles a canRender that throws', () => {
    const registry = new CapabilityRegistry();
    registry.register({
      id: 'broken',
      kind: 'immediate',
      canRender: () => {
        throw new Error('renderer broke');
      },
    });

    // The registry does not catch errors — they propagate
    expect(() => registry.route(makeShape())).toThrow('renderer broke');
  });

  it('works with all SlideElementIR kinds', () => {
    const registry = new CapabilityRegistry();
    registry.register({
      id: 'all-kinds',
      kind: 'immediate',
      canRender: () => true,
    });

    const allKinds: SlideElementIR[] = [
      makeShape(),
      makePicture(),
      makeGroup(),
      makeConnector(),
      makeTable(),
      makeChart(),
      makeUnsupported(),
    ];

    const plan = registry.planRender(allKinds);
    expect(plan.stats.total).toBe(7);
    expect(plan.stats.immediate).toBe(7);
    expect(plan.stats.deferred).toBe(0);
    expect(plan.stats.unsupported).toBe(0);
  });

  it('plan preserves element order', () => {
    const registry = new CapabilityRegistry();
    registry.register(shapeRenderer());

    const elements: SlideElementIR[] = [
      makeShape('First'),
      makeShape('Second'),
      makeShape('Third'),
    ];

    const plan = registry.planRender(elements);
    expect(plan.immediate[0].element.kind).toBe('shape');
    expect((plan.immediate[0].element as DrawingMLShapeIR).name).toBe('First');
    expect((plan.immediate[1].element as DrawingMLShapeIR).name).toBe('Second');
    expect((plan.immediate[2].element as DrawingMLShapeIR).name).toBe('Third');
  });

  it('coverage report preserves element order', () => {
    const registry = new CapabilityRegistry();
    registry.register(shapeRenderer());
    registry.register(pictureRenderer());

    const elements: SlideElementIR[] = [makeShape(), makePicture(), makeTable()];

    const report = registry.generateCoverageReport(elements);
    expect(report.entries[0].element.kind).toBe('shape');
    expect(report.entries[1].element.kind).toBe('picture');
    expect(report.entries[2].element.kind).toBe('table');
  });
});
