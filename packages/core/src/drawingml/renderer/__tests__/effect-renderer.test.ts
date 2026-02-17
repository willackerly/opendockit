import { describe, it, expect } from 'vitest';
import { applyEffects } from '../effect-renderer.js';
import { createMockContext, createMockRenderContext } from './mock-canvas.js';
import type { EffectIR, OuterShadowIR, GlowIR } from '../../../ir/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BOUNDS = { x: 0, y: 0, width: 100, height: 80 };

function outerShadow(overrides?: Partial<OuterShadowIR>): OuterShadowIR {
  return {
    type: 'outerShadow',
    blurRadius: 50800, // ~4px at 96 DPI
    distance: 38100, // ~3px at 96 DPI
    direction: 45,
    color: { r: 0, g: 0, b: 0, a: 0.5 },
    ...overrides,
  };
}

function glow(overrides?: Partial<GlowIR>): GlowIR {
  return {
    type: 'glow',
    radius: 63500, // ~5px at 96 DPI
    color: { r: 255, g: 215, b: 0, a: 0.8 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applyEffects', () => {
  it('is a no-op for an empty effects array', () => {
    const ctx = createMockContext();
    const rctx = createMockRenderContext(ctx);

    const cleanup = applyEffects([], rctx, BOUNDS);
    cleanup();

    // No shadow properties should have been set.
    expect(ctx.shadowColor).toBe('transparent');
    expect(ctx.shadowBlur).toBe(0);
    expect(ctx.shadowOffsetX).toBe(0);
    expect(ctx.shadowOffsetY).toBe(0);
  });

  describe('outerShadow', () => {
    it('sets shadow properties on the canvas context', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const effect = outerShadow();

      applyEffects([effect], rctx, BOUNDS);

      expect(ctx.shadowColor).toBe('rgba(0, 0, 0, 0.5)');
      expect(ctx.shadowBlur).toBeGreaterThan(0);
    });

    it('calculates shadow offset from distance and direction', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      // Direction 0 = shadow to the right.
      const effect = outerShadow({ direction: 0, distance: 914400 }); // 1 inch = 96px

      applyEffects([effect], rctx, BOUNDS);

      // At 0 degrees, offset should be purely horizontal.
      expect(ctx.shadowOffsetX).toBeCloseTo(96, 0);
      expect(ctx.shadowOffsetY).toBeCloseTo(0, 0);
    });

    it('calculates offset for 90-degree direction (downward)', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const effect = outerShadow({ direction: 90, distance: 914400 });

      applyEffects([effect], rctx, BOUNDS);

      expect(ctx.shadowOffsetX).toBeCloseTo(0, 0);
      expect(ctx.shadowOffsetY).toBeCloseTo(96, 0);
    });

    it('calculates offset for 45-degree direction (diagonal)', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const effect = outerShadow({ direction: 45, distance: 914400 });

      applyEffects([effect], rctx, BOUNDS);

      const expected = 96 * Math.cos(Math.PI / 4);
      expect(ctx.shadowOffsetX).toBeCloseTo(expected, 1);
      expect(ctx.shadowOffsetY).toBeCloseTo(expected, 1);
    });
  });

  describe('cleanup function', () => {
    it('resets shadow properties to defaults', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const effect = outerShadow();

      const cleanup = applyEffects([effect], rctx, BOUNDS);

      // Shadow should be set.
      expect(ctx.shadowColor).not.toBe('transparent');

      cleanup();

      // Shadow should be reset.
      expect(ctx.shadowColor).toBe('transparent');
      expect(ctx.shadowBlur).toBe(0);
      expect(ctx.shadowOffsetX).toBe(0);
      expect(ctx.shadowOffsetY).toBe(0);
    });

    it('is a no-op function when no effects were applied', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);

      const cleanup = applyEffects([], rctx, BOUNDS);

      // Should not throw, and shadow should remain at defaults.
      cleanup();
      expect(ctx.shadowColor).toBe('transparent');
    });
  });

  describe('glow', () => {
    it('approximates glow as shadow with zero offset', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const effect = glow();

      applyEffects([effect], rctx, BOUNDS);

      expect(ctx.shadowColor).toBe('rgba(255, 215, 0, 0.8)');
      expect(ctx.shadowBlur).toBeGreaterThan(0);
      expect(ctx.shadowOffsetX).toBe(0);
      expect(ctx.shadowOffsetY).toBe(0);
    });
  });

  describe('multiple effects', () => {
    it('applies only the first applicable effect (outerShadow wins)', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const shadow = outerShadow();
      const glowEffect = glow();

      applyEffects([shadow, glowEffect], rctx, BOUNDS);

      // Outer shadow color should be used, not glow color.
      expect(ctx.shadowColor).toBe('rgba(0, 0, 0, 0.5)');
    });

    it('falls through to glow when only glow is present', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const glowEffect = glow();

      applyEffects([glowEffect], rctx, BOUNDS);

      expect(ctx.shadowColor).toBe('rgba(255, 215, 0, 0.8)');
    });
  });

  describe('unsupported effects', () => {
    it('innerShadow does not crash', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const effects: EffectIR[] = [
        {
          type: 'innerShadow',
          blurRadius: 50800,
          distance: 38100,
          direction: 45,
          color: { r: 0, g: 0, b: 0, a: 0.5 },
        },
      ];

      const cleanup = applyEffects(effects, rctx, BOUNDS);
      cleanup();

      // Should remain at defaults since inner shadow is not applied.
      expect(ctx.shadowColor).toBe('transparent');
    });

    it('reflection does not crash', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const effects: EffectIR[] = [
        {
          type: 'reflection',
          blurRadius: 0,
          startOpacity: 0.5,
          endOpacity: 0,
          distance: 0,
          direction: 90,
          fadeDirection: 90,
        },
      ];

      const cleanup = applyEffects(effects, rctx, BOUNDS);
      cleanup();

      expect(ctx.shadowColor).toBe('transparent');
    });

    it('softEdge does not crash', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const effects: EffectIR[] = [
        {
          type: 'softEdge',
          radius: 50800,
        },
      ];

      const cleanup = applyEffects(effects, rctx, BOUNDS);
      cleanup();

      expect(ctx.shadowColor).toBe('transparent');
    });

    it('glow is applied when preceded by unsupported effects', () => {
      const ctx = createMockContext();
      const rctx = createMockRenderContext(ctx);
      const effects: EffectIR[] = [
        {
          type: 'innerShadow',
          blurRadius: 50800,
          distance: 38100,
          direction: 45,
          color: { r: 0, g: 0, b: 0, a: 0.5 },
        },
        {
          type: 'softEdge',
          radius: 50800,
        },
        glow(),
      ];

      applyEffects(effects, rctx, BOUNDS);

      // Glow should be applied since inner shadow and soft edge are skipped.
      expect(ctx.shadowColor).toBe('rgba(255, 215, 0, 0.8)');
      expect(ctx.shadowBlur).toBeGreaterThan(0);
    });
  });

  describe('DPI scaling', () => {
    it('scales blur and offset by DPI factor', () => {
      const ctx = createMockContext();
      const rctx1x = createMockRenderContext(ctx, 1);
      const effect = outerShadow({ direction: 0, distance: 914400, blurRadius: 914400 });

      applyEffects([effect], rctx1x, BOUNDS);
      const blur1x = ctx.shadowBlur;
      const offset1x = ctx.shadowOffsetX;

      // Reset and test at 2x DPI.
      const ctx2 = createMockContext();
      const rctx2x = createMockRenderContext(ctx2, 2);
      applyEffects([effect], rctx2x, BOUNDS);

      expect(ctx2.shadowBlur).toBeCloseTo(blur1x * 2, 1);
      expect(ctx2.shadowOffsetX).toBeCloseTo(offset1x * 2, 1);
    });
  });
});
