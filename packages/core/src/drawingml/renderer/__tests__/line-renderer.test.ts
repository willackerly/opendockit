/**
 * Unit tests for the line renderer.
 *
 * Uses a mock Canvas2D context to verify that the correct Canvas2D API
 * calls are made for line/stroke rendering without requiring a real canvas.
 */

import { describe, expect, it } from 'vitest';
import type { LineIR } from '../../../ir/index.js';
import { applyLine } from '../line-renderer.js';
import { createMockRenderContext } from './mock-canvas.js';

describe('applyLine', () => {
  // -------------------------------------------------------------------------
  // Basic stroke
  // -------------------------------------------------------------------------

  describe('basic stroke', () => {
    it('sets strokeStyle and lineWidth, then strokes', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {
        color: { r: 255, g: 0, b: 0, a: 1 },
        width: 12700, // 1 pt = 12700 EMU
      };

      applyLine(line, rctx);

      expect(rctx.ctx.strokeStyle).toBe('rgba(255, 0, 0, 1)');
      // 12700 EMU at 96 DPI, dpiScale=1: 12700 * 96 / 914400 ~= 1.333
      expect(rctx.ctx.lineWidth).toBeCloseTo(1.333, 2);
      expect(rctx.ctx._calls).toContainEqual({ method: 'stroke', args: [] });
    });

    it('converts line width from EMU to scaled pixels', () => {
      const rctx = createMockRenderContext(undefined, 2);
      const line: LineIR = {
        color: { r: 0, g: 0, b: 0, a: 1 },
        width: 12700,
      };

      applyLine(line, rctx);

      // 12700 EMU at 96*2=192 DPI: 12700 * 192 / 914400 ~= 2.667
      expect(rctx.ctx.lineWidth).toBeCloseTo(2.667, 2);
    });

    it('uses default width (9525 EMU) when width is undefined', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {
        color: { r: 0, g: 0, b: 0, a: 1 },
      };

      applyLine(line, rctx);

      // 9525 EMU at 96 DPI: 9525 * 96 / 914400 = 1.0
      expect(rctx.ctx.lineWidth).toBeCloseTo(1.0, 2);
      expect(rctx.ctx._calls).toContainEqual({ method: 'stroke', args: [] });
    });
  });

  // -------------------------------------------------------------------------
  // No color
  // -------------------------------------------------------------------------

  describe('no color', () => {
    it('does not stroke when color is undefined', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = { width: 12700 };

      applyLine(line, rctx);

      const strokeCalls = rctx.ctx._calls.filter((c) => c.method === 'stroke');
      expect(strokeCalls).toHaveLength(0);
    });

    it('does not crash with an empty LineIR', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {};

      expect(() => applyLine(line, rctx)).not.toThrow();
      const strokeCalls = rctx.ctx._calls.filter((c) => c.method === 'stroke');
      expect(strokeCalls).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Line cap mapping
  // -------------------------------------------------------------------------

  describe('line cap mapping', () => {
    it('maps "flat" to "butt"', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {
        color: { r: 0, g: 0, b: 0, a: 1 },
        cap: 'flat',
      };

      applyLine(line, rctx);

      expect(rctx.ctx.lineCap).toBe('butt');
    });

    it('maps "round" to "round"', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {
        color: { r: 0, g: 0, b: 0, a: 1 },
        cap: 'round',
      };

      applyLine(line, rctx);

      expect(rctx.ctx.lineCap).toBe('round');
    });

    it('maps "square" to "square"', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {
        color: { r: 0, g: 0, b: 0, a: 1 },
        cap: 'square',
      };

      applyLine(line, rctx);

      expect(rctx.ctx.lineCap).toBe('square');
    });
  });

  // -------------------------------------------------------------------------
  // Line join mapping
  // -------------------------------------------------------------------------

  describe('line join mapping', () => {
    it('maps "round" to "round"', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {
        color: { r: 0, g: 0, b: 0, a: 1 },
        join: 'round',
      };

      applyLine(line, rctx);

      expect(rctx.ctx.lineJoin).toBe('round');
    });

    it('maps "bevel" to "bevel"', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {
        color: { r: 0, g: 0, b: 0, a: 1 },
        join: 'bevel',
      };

      applyLine(line, rctx);

      expect(rctx.ctx.lineJoin).toBe('bevel');
    });

    it('maps "miter" to "miter"', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {
        color: { r: 0, g: 0, b: 0, a: 1 },
        join: 'miter',
      };

      applyLine(line, rctx);

      expect(rctx.ctx.lineJoin).toBe('miter');
    });
  });

  // -------------------------------------------------------------------------
  // Dash styles
  // -------------------------------------------------------------------------

  describe('dash styles', () => {
    it('sets empty dash array for "solid"', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {
        color: { r: 0, g: 0, b: 0, a: 1 },
        dashStyle: 'solid',
      };

      applyLine(line, rctx);

      const dashCall = rctx.ctx._calls.find((c) => c.method === 'setLineDash');
      expect(dashCall).toBeDefined();
      expect(dashCall!.args[0]).toEqual([]);
    });

    it('sets correct dash array for "dash"', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {
        color: { r: 0, g: 0, b: 0, a: 1 },
        width: 9525, // 1 px at 96 DPI
        dashStyle: 'dash',
      };

      applyLine(line, rctx);

      const dashCall = rctx.ctx._calls.find((c) => c.method === 'setLineDash');
      expect(dashCall).toBeDefined();
      const w = rctx.ctx.lineWidth;
      expect(dashCall!.args[0]).toEqual([4 * w, 3 * w]);
    });

    it('sets correct dash array for "dot"', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {
        color: { r: 0, g: 0, b: 0, a: 1 },
        width: 9525,
        dashStyle: 'dot',
      };

      applyLine(line, rctx);

      const dashCall = rctx.ctx._calls.find((c) => c.method === 'setLineDash');
      const w = rctx.ctx.lineWidth;
      expect(dashCall!.args[0]).toEqual([w, w]);
    });

    it('sets correct dash array for "dashDot"', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {
        color: { r: 0, g: 0, b: 0, a: 1 },
        width: 9525,
        dashStyle: 'dashDot',
      };

      applyLine(line, rctx);

      const dashCall = rctx.ctx._calls.find((c) => c.method === 'setLineDash');
      const w = rctx.ctx.lineWidth;
      expect(dashCall!.args[0]).toEqual([4 * w, 3 * w, w, 3 * w]);
    });

    it('sets correct dash array for "lgDash"', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {
        color: { r: 0, g: 0, b: 0, a: 1 },
        width: 9525,
        dashStyle: 'lgDash',
      };

      applyLine(line, rctx);

      const dashCall = rctx.ctx._calls.find((c) => c.method === 'setLineDash');
      const w = rctx.ctx.lineWidth;
      expect(dashCall!.args[0]).toEqual([8 * w, 3 * w]);
    });

    it('sets correct dash array for "lgDashDot"', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {
        color: { r: 0, g: 0, b: 0, a: 1 },
        width: 9525,
        dashStyle: 'lgDashDot',
      };

      applyLine(line, rctx);

      const dashCall = rctx.ctx._calls.find((c) => c.method === 'setLineDash');
      const w = rctx.ctx.lineWidth;
      expect(dashCall!.args[0]).toEqual([8 * w, 3 * w, w, 3 * w]);
    });

    it('sets correct dash array for "lgDashDotDot"', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {
        color: { r: 0, g: 0, b: 0, a: 1 },
        width: 9525,
        dashStyle: 'lgDashDotDot',
      };

      applyLine(line, rctx);

      const dashCall = rctx.ctx._calls.find((c) => c.method === 'setLineDash');
      const w = rctx.ctx.lineWidth;
      expect(dashCall!.args[0]).toEqual([8 * w, 3 * w, w, 3 * w, w, 3 * w]);
    });

    it('defaults to solid (empty array) when dashStyle is undefined', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {
        color: { r: 0, g: 0, b: 0, a: 1 },
      };

      applyLine(line, rctx);

      const dashCall = rctx.ctx._calls.find((c) => c.method === 'setLineDash');
      expect(dashCall).toBeDefined();
      expect(dashCall!.args[0]).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Alpha
  // -------------------------------------------------------------------------

  describe('alpha', () => {
    it('includes alpha in strokeStyle rgba', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {
        color: { r: 100, g: 150, b: 200, a: 0.75 },
      };

      applyLine(line, rctx);

      expect(rctx.ctx.strokeStyle).toBe('rgba(100, 150, 200, 0.75)');
    });
  });

  // -------------------------------------------------------------------------
  // Combined properties
  // -------------------------------------------------------------------------

  describe('combined properties', () => {
    it('applies all line properties together', () => {
      const rctx = createMockRenderContext();
      const line: LineIR = {
        color: { r: 0, g: 0, b: 0, a: 1 },
        width: 25400, // 2pt
        dashStyle: 'dashDot',
        cap: 'round',
        join: 'bevel',
      };

      applyLine(line, rctx);

      expect(rctx.ctx.strokeStyle).toBe('rgba(0, 0, 0, 1)');
      expect(rctx.ctx.lineCap).toBe('round');
      expect(rctx.ctx.lineJoin).toBe('bevel');
      expect(rctx.ctx._calls).toContainEqual({ method: 'stroke', args: [] });

      const dashCall = rctx.ctx._calls.find((c) => c.method === 'setLineDash');
      expect(dashCall).toBeDefined();
      // Dash array should be non-empty for dashDot
      const dashArr = dashCall!.args[0] as number[];
      expect(dashArr.length).toBeGreaterThan(0);
    });
  });
});
