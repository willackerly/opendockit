/**
 * Unit tests for the fill renderer.
 *
 * Uses a mock Canvas2D context to verify that the correct Canvas2D API
 * calls are made for each fill type without requiring a real browser canvas.
 */

import { describe, expect, it } from 'vitest';
import type {
  FillIR,
  GradientFillIR,
  NoFill,
  PatternFillIR,
  PictureFillIR,
  SolidFillIR,
} from '../../../ir/index.js';
import { applyFill } from '../fill-renderer.js';
import { createMockRenderContext } from './mock-canvas.js';

const bounds = { x: 10, y: 20, width: 200, height: 100 };

describe('applyFill', () => {
  // -------------------------------------------------------------------------
  // Solid fill
  // -------------------------------------------------------------------------

  describe('solid fill', () => {
    it('sets fillStyle to rgba and calls fill()', () => {
      const rctx = createMockRenderContext();
      const fill: SolidFillIR = {
        type: 'solid',
        color: { r: 255, g: 128, b: 0, a: 1 },
      };

      applyFill(fill, rctx, bounds);

      expect(rctx.ctx.fillStyle).toBe('rgba(255, 128, 0, 1)');
      expect(rctx.ctx._calls).toContainEqual({ method: 'fill', args: [] });
    });

    it('handles semi-transparent alpha', () => {
      const rctx = createMockRenderContext();
      const fill: SolidFillIR = {
        type: 'solid',
        color: { r: 0, g: 0, b: 255, a: 0.5 },
      };

      applyFill(fill, rctx, bounds);

      expect(rctx.ctx.fillStyle).toBe('rgba(0, 0, 255, 0.5)');
    });

    it('handles fully transparent alpha', () => {
      const rctx = createMockRenderContext();
      const fill: SolidFillIR = {
        type: 'solid',
        color: { r: 0, g: 0, b: 0, a: 0 },
      };

      applyFill(fill, rctx, bounds);

      expect(rctx.ctx.fillStyle).toBe('rgba(0, 0, 0, 0)');
      expect(rctx.ctx._calls).toContainEqual({ method: 'fill', args: [] });
    });
  });

  // -------------------------------------------------------------------------
  // Gradient fill
  // -------------------------------------------------------------------------

  describe('gradient fill', () => {
    it('creates a linear gradient with stops', () => {
      const rctx = createMockRenderContext();
      const fill: GradientFillIR = {
        type: 'gradient',
        kind: 'linear',
        angle: 90,
        stops: [
          { position: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
          { position: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
        ],
      };

      applyFill(fill, rctx, bounds);

      expect(rctx.ctx._gradients).toHaveLength(1);
      expect(rctx.ctx._gradients[0].type).toBe('linear');
      expect(rctx.ctx._gradients[0].stops).toHaveLength(2);
      expect(rctx.ctx._gradients[0].stops[0]).toEqual({
        offset: 0,
        color: 'rgba(255, 0, 0, 1)',
      });
      expect(rctx.ctx._gradients[0].stops[1]).toEqual({
        offset: 1,
        color: 'rgba(0, 0, 255, 1)',
      });
      expect(rctx.ctx._calls).toContainEqual({ method: 'fill', args: [] });
    });

    it('defaults angle to 0 when undefined', () => {
      const rctx = createMockRenderContext();
      const fill: GradientFillIR = {
        type: 'gradient',
        kind: 'linear',
        stops: [{ position: 0, color: { r: 0, g: 0, b: 0, a: 1 } }],
      };

      applyFill(fill, rctx, bounds);

      expect(rctx.ctx._gradients).toHaveLength(1);
      expect(rctx.ctx._gradients[0].type).toBe('linear');
    });

    it('creates a radial gradient centered in bounds', () => {
      const rctx = createMockRenderContext();
      const fill: GradientFillIR = {
        type: 'gradient',
        kind: 'radial',
        stops: [
          { position: 0, color: { r: 255, g: 255, b: 255, a: 1 } },
          { position: 1, color: { r: 0, g: 0, b: 0, a: 1 } },
        ],
      };

      applyFill(fill, rctx, bounds);

      expect(rctx.ctx._gradients).toHaveLength(1);
      const g = rctx.ctx._gradients[0];
      expect(g.type).toBe('radial');
      // Center: (10 + 200/2, 20 + 100/2) = (110, 70)
      expect(g.args[0]).toBe(110); // cx
      expect(g.args[1]).toBe(70); // cy
      expect(g.args[2]).toBe(0); // inner radius
      expect(g.args[3]).toBe(110); // cx
      expect(g.args[4]).toBe(70); // cy
      expect(g.args[5]).toBe(100); // outer radius = max(200, 100) / 2
      expect(g.stops).toHaveLength(2);
    });

    it('creates a radial gradient for path kind', () => {
      const rctx = createMockRenderContext();
      const fill: GradientFillIR = {
        type: 'gradient',
        kind: 'path',
        stops: [{ position: 0, color: { r: 128, g: 128, b: 128, a: 1 } }],
      };

      applyFill(fill, rctx, bounds);

      expect(rctx.ctx._gradients).toHaveLength(1);
      expect(rctx.ctx._gradients[0].type).toBe('radial');
    });

    it('handles multiple gradient stops', () => {
      const rctx = createMockRenderContext();
      const fill: GradientFillIR = {
        type: 'gradient',
        kind: 'linear',
        angle: 45,
        stops: [
          { position: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
          { position: 0.5, color: { r: 0, g: 255, b: 0, a: 1 } },
          { position: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
        ],
      };

      applyFill(fill, rctx, bounds);

      expect(rctx.ctx._gradients[0].stops).toHaveLength(3);
      expect(rctx.ctx._gradients[0].stops[1].offset).toBe(0.5);
    });
  });

  // -------------------------------------------------------------------------
  // Pattern fill
  // -------------------------------------------------------------------------

  describe('pattern fill', () => {
    it('falls back to foreground color without crashing', () => {
      const rctx = createMockRenderContext();
      const fill: PatternFillIR = {
        type: 'pattern',
        preset: 'dkHorz',
        foreground: { r: 100, g: 50, b: 25, a: 1 },
        background: { r: 255, g: 255, b: 255, a: 1 },
      };

      applyFill(fill, rctx, bounds);

      expect(rctx.ctx.fillStyle).toBe('rgba(100, 50, 25, 1)');
      expect(rctx.ctx._calls).toContainEqual({ method: 'fill', args: [] });
    });
  });

  // -------------------------------------------------------------------------
  // Picture fill
  // -------------------------------------------------------------------------

  describe('picture fill', () => {
    it('does not crash (skipped for now)', () => {
      const rctx = createMockRenderContext();
      const fill: PictureFillIR = {
        type: 'picture',
        imagePartUri: '/ppt/media/image1.png',
        stretch: true,
      };

      applyFill(fill, rctx, bounds);

      // Should not call fill() — picture fills are deferred.
      const fillCalls = rctx.ctx._calls.filter((c) => c.method === 'fill');
      expect(fillCalls).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // No fill
  // -------------------------------------------------------------------------

  describe('no fill', () => {
    it('does not call fill()', () => {
      const rctx = createMockRenderContext();
      const fill: NoFill = { type: 'none' };

      applyFill(fill, rctx, bounds);

      const fillCalls = rctx.ctx._calls.filter((c) => c.method === 'fill');
      expect(fillCalls).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Exhaustiveness
  // -------------------------------------------------------------------------

  describe('exhaustiveness', () => {
    it('handles every FillIR type without throwing', () => {
      const rctx = createMockRenderContext();
      const fills: FillIR[] = [
        { type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } },
        { type: 'gradient', kind: 'linear', angle: 0, stops: [] },
        {
          type: 'pattern',
          preset: 'pct5',
          foreground: { r: 0, g: 0, b: 0, a: 1 },
          background: { r: 255, g: 255, b: 255, a: 1 },
        },
        { type: 'picture', imagePartUri: '/img.png' },
        { type: 'none' },
      ];

      for (const fill of fills) {
        expect(() => applyFill(fill, rctx, bounds)).not.toThrow();
      }
    });
  });
});
