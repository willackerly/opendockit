import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGuideContext, evaluateGuides, getPresetGeometry } from '../index.js';

/**
 * Path builder tests.
 *
 * Path2D is NOT available in Node.js, so we:
 * 1. Test that build functions return null when Path2D is unavailable
 * 2. Test guide evaluation / coordinate resolution logic independently
 * 3. Test tracing logic with a mock Path2D that records commands
 */

// ═══════════════════════════════════════════════════════════════════════════
// Mock Path2D that records method calls
// ═══════════════════════════════════════════════════════════════════════════

class MockPath2D {
  readonly calls: Array<{ method: string; args: number[] }> = [];

  moveTo(x: number, y: number): void {
    this.calls.push({ method: 'moveTo', args: [x, y] });
  }

  lineTo(x: number, y: number): void {
    this.calls.push({ method: 'lineTo', args: [x, y] });
  }

  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    this.calls.push({ method: 'bezierCurveTo', args: [x1, y1, x2, y2, x, y] });
  }

  quadraticCurveTo(x1: number, y1: number, x: number, y: number): void {
    this.calls.push({ method: 'quadraticCurveTo', args: [x1, y1, x, y] });
  }

  ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    counterclockwise: boolean
  ): void {
    this.calls.push({
      method: 'ellipse',
      args: [cx, cy, rx, ry, rotation, startAngle, endAngle, counterclockwise ? 1 : 0],
    });
  }

  closePath(): void {
    this.calls.push({ method: 'closePath', args: [] });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests: build functions return null in Node.js
// ═══════════════════════════════════════════════════════════════════════════

describe('buildPresetPath (no Path2D)', () => {
  it('returns null when Path2D is not available', async () => {
    const { buildPresetPath } = await import('../path-builder.js');
    const result = buildPresetPath('rect', 100, 100);
    expect(result).toBeNull();
  });
});

describe('buildCustomPath (no Path2D)', () => {
  it('returns null when Path2D is not available', async () => {
    const { buildCustomPath } = await import('../path-builder.js');
    const result = buildCustomPath(
      {
        kind: 'custom',
        guides: [],
        paths: [
          {
            commands: [
              { kind: 'moveTo', x: 0, y: 0 },
              { kind: 'lineTo', x: 100, y: 100 },
              { kind: 'close' },
            ],
          },
        ],
      },
      100,
      100
    );
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests: build functions with mocked Path2D
// ═══════════════════════════════════════════════════════════════════════════

describe('buildPresetPath (with mocked Path2D)', () => {
  let mockInstances: MockPath2D[];

  beforeEach(() => {
    mockInstances = [];
    // Install mock Path2D on globalThis
    (globalThis as any).Path2D = class extends MockPath2D {
      constructor() {
        super();
        mockInstances.push(this);
      }
    };
  });

  afterEach(() => {
    delete (globalThis as any).Path2D;
  });

  it('builds a rect preset at 100x80', async () => {
    // Re-import to pick up the mock
    const mod = await import('../path-builder.js');
    const result = mod.buildPresetPath('rect', 100, 80);

    expect(result).not.toBeNull();
    expect(mockInstances).toHaveLength(1);

    const mock = mockInstances[0];
    // rect preset: moveTo(0,0), lineTo(100,0), lineTo(100,80), lineTo(0,80), close
    expect(mock.calls).toHaveLength(5);
    expect(mock.calls[0]).toEqual({ method: 'moveTo', args: [0, 0] });
    expect(mock.calls[1]).toEqual({ method: 'lineTo', args: [100, 0] });
    expect(mock.calls[2]).toEqual({ method: 'lineTo', args: [100, 80] });
    expect(mock.calls[3]).toEqual({ method: 'lineTo', args: [0, 80] });
    expect(mock.calls[4]).toEqual({ method: 'closePath', args: [] });
  });

  it('returns null for unknown preset', async () => {
    const mod = await import('../path-builder.js');
    const result = mod.buildPresetPath('nonExistentShape', 100, 100);
    expect(result).toBeNull();
  });

  it('applies adjust value overrides', async () => {
    const mod = await import('../path-builder.js');
    // roundRect uses adj to control corner radius
    const result = mod.buildPresetPath('roundRect', 200, 100, { adj: 0 });
    expect(result).not.toBeNull();

    // With adj=0, the rounded rect should have zero corner radius,
    // effectively becoming a regular rectangle with arcTo commands using 0 radii
    const mock = mockInstances[0];
    expect(mock.calls.length).toBeGreaterThan(0);
  });
});

describe('buildCustomPath (with mocked Path2D)', () => {
  let mockInstances: MockPath2D[];

  beforeEach(() => {
    mockInstances = [];
    (globalThis as any).Path2D = class extends MockPath2D {
      constructor() {
        super();
        mockInstances.push(this);
      }
    };
  });

  afterEach(() => {
    delete (globalThis as any).Path2D;
  });

  it('builds a custom triangle', async () => {
    const mod = await import('../path-builder.js');
    const result = mod.buildCustomPath(
      {
        kind: 'custom',
        guides: [],
        paths: [
          {
            commands: [
              { kind: 'moveTo', x: 50, y: 0 },
              { kind: 'lineTo', x: 100, y: 100 },
              { kind: 'lineTo', x: 0, y: 100 },
              { kind: 'close' },
            ],
          },
        ],
      },
      200,
      200
    );

    expect(result).not.toBeNull();
    const mock = mockInstances[0];
    // No path coordinate space defined, so scale = 1
    expect(mock.calls[0]).toEqual({ method: 'moveTo', args: [50, 0] });
    expect(mock.calls[1]).toEqual({ method: 'lineTo', args: [100, 100] });
    expect(mock.calls[2]).toEqual({ method: 'lineTo', args: [0, 100] });
    expect(mock.calls[3]).toEqual({ method: 'closePath', args: [] });
  });

  it('scales from path coordinate space to shape space', async () => {
    const mod = await import('../path-builder.js');
    const result = mod.buildCustomPath(
      {
        kind: 'custom',
        guides: [],
        paths: [
          {
            width: 100,
            height: 100,
            commands: [
              { kind: 'moveTo', x: 0, y: 0 },
              { kind: 'lineTo', x: 100, y: 0 },
              { kind: 'lineTo', x: 100, y: 100 },
              { kind: 'close' },
            ],
          },
        ],
      },
      200,
      300
    );

    expect(result).not.toBeNull();
    const mock = mockInstances[0];
    // scaleX = 200/100 = 2, scaleY = 300/100 = 3
    expect(mock.calls[0]).toEqual({ method: 'moveTo', args: [0, 0] });
    expect(mock.calls[1]).toEqual({ method: 'lineTo', args: [200, 0] });
    expect(mock.calls[2]).toEqual({ method: 'lineTo', args: [200, 300] });
    expect(mock.calls[3]).toEqual({ method: 'closePath', args: [] });
  });

  it('handles cubic bezier commands', async () => {
    const mod = await import('../path-builder.js');
    mod.buildCustomPath(
      {
        kind: 'custom',
        guides: [],
        paths: [
          {
            commands: [
              { kind: 'moveTo', x: 0, y: 0 },
              {
                kind: 'cubicBezierTo',
                x1: 10,
                y1: 20,
                x2: 30,
                y2: 40,
                x: 50,
                y: 60,
              },
            ],
          },
        ],
      },
      100,
      100
    );

    const mock = mockInstances[0];
    expect(mock.calls[1]).toEqual({
      method: 'bezierCurveTo',
      args: [10, 20, 30, 40, 50, 60],
    });
  });

  it('handles quad bezier commands', async () => {
    const mod = await import('../path-builder.js');
    mod.buildCustomPath(
      {
        kind: 'custom',
        guides: [],
        paths: [
          {
            commands: [
              { kind: 'moveTo', x: 0, y: 0 },
              { kind: 'quadBezierTo', x1: 50, y1: 100, x: 100, y: 0 },
            ],
          },
        ],
      },
      100,
      100
    );

    const mock = mockInstances[0];
    expect(mock.calls[1]).toEqual({
      method: 'quadraticCurveTo',
      args: [50, 100, 100, 0],
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests: tracePresetPath with mock
// ═══════════════════════════════════════════════════════════════════════════

describe('tracePresetPath', () => {
  it('resolves guide references and traces onto path', async () => {
    const mod = await import('../path-builder.js');

    const path2d = new MockPath2D();
    const ctx = createGuideContext(100, 80);

    // Simulate rect preset commands: moveTo(l,t), lnTo(r,t), lnTo(r,b), lnTo(l,b), close
    const commands = [
      { type: 'moveTo' as const, x: 'l', y: 't' },
      { type: 'lnTo' as const, x: 'r', y: 't' },
      { type: 'lnTo' as const, x: 'r', y: 'b' },
      { type: 'lnTo' as const, x: 'l', y: 'b' },
      { type: 'close' as const },
    ];

    mod.tracePresetPath(path2d as any, commands, ctx, undefined, undefined, 100, 80);

    expect(path2d.calls).toHaveLength(5);
    expect(path2d.calls[0]).toEqual({ method: 'moveTo', args: [0, 0] });
    expect(path2d.calls[1]).toEqual({ method: 'lineTo', args: [100, 0] });
    expect(path2d.calls[2]).toEqual({ method: 'lineTo', args: [100, 80] });
    expect(path2d.calls[3]).toEqual({ method: 'lineTo', args: [0, 80] });
    expect(path2d.calls[4]).toEqual({ method: 'closePath', args: [] });
  });

  it('scales coordinates when path has explicit dimensions', async () => {
    const mod = await import('../path-builder.js');

    const path2d = new MockPath2D();
    const ctx = createGuideContext(200, 100);

    const commands = [
      { type: 'moveTo' as const, x: '0', y: '0' },
      { type: 'lnTo' as const, x: '100', y: '50' },
    ];

    // Path coords are in a 100x50 space, shape is 200x100
    mod.tracePresetPath(path2d as any, commands, ctx, 100, 50, 200, 100);

    expect(path2d.calls[0]).toEqual({ method: 'moveTo', args: [0, 0] });
    // scaleX = 200/100 = 2, scaleY = 100/50 = 2
    expect(path2d.calls[1]).toEqual({ method: 'lineTo', args: [200, 100] });
  });

  it('traces cubic bezier from preset commands', async () => {
    const mod = await import('../path-builder.js');

    const path2d = new MockPath2D();
    const ctx = createGuideContext(100, 100);

    const commands = [
      { type: 'moveTo' as const, x: '0', y: '0' },
      {
        type: 'cubicBezTo' as const,
        pts: [
          { x: '10', y: '20' },
          { x: '30', y: '40' },
          { x: '50', y: '60' },
        ],
      },
    ];

    mod.tracePresetPath(path2d as any, commands, ctx, undefined, undefined, 100, 100);

    expect(path2d.calls[1]).toEqual({
      method: 'bezierCurveTo',
      args: [10, 20, 30, 40, 50, 60],
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests: guide evaluation for preset geometries
// ═══════════════════════════════════════════════════════════════════════════

describe('guide evaluation for presets', () => {
  it('evaluates rect preset guides at 100x100', () => {
    const preset = getPresetGeometry('rect');
    expect(preset).toBeDefined();
    expect(preset!.gdLst).toHaveLength(0);

    const ctx = createGuideContext(100, 100);
    // rect has no guides, but built-ins should work
    expect(ctx.get('w')).toBe(100);
    expect(ctx.get('h')).toBe(100);
    expect(ctx.get('l')).toBe(0);
    expect(ctx.get('t')).toBe(0);
    expect(ctx.get('r')).toBe(100);
    expect(ctx.get('b')).toBe(100);
  });

  it('evaluates roundRect preset guides', () => {
    const preset = getPresetGeometry('roundRect');
    expect(preset).toBeDefined();

    // Use default adj = 16667
    const ctx = createGuideContext(1000, 800, { adj: 16667 });
    evaluateGuides(preset!.gdLst, ctx);

    // a = pin(0, adj, 50000) = 16667
    expect(ctx.get('a')).toBe(16667);

    // x1 = ss * a / 100000
    // ss = min(1000, 800) = 800
    // x1 = 800 * 16667 / 100000 = 133.336
    expect(ctx.get('x1')).toBeCloseTo(133.336, 2);

    // x2 = r - x1 = 1000 - 133.336 = 866.664
    expect(ctx.get('x2')).toBeCloseTo(866.664, 2);
  });

  it('resolves guide references from context', () => {
    const ctx = createGuideContext(500, 300);

    // hc = w/2 = 250
    expect(ctx.get('hc')).toBe(250);

    // vc = h/2 = 150
    expect(ctx.get('vc')).toBe(150);

    // wd2 = w/2 = 250
    expect(ctx.get('wd2')).toBe(250);

    // hd2 = h/2 = 150
    expect(ctx.get('hd2')).toBe(150);

    // ss = min(500, 300) = 300
    expect(ctx.get('ss')).toBe(300);
  });
});
