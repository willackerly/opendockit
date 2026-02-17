/**
 * Apply DrawingML effects to a Canvas2D context.
 *
 * Effects (shadows, glow, reflection, soft edge) are applied before the
 * shape is drawn, and cleaned up afterward via the returned cleanup function.
 *
 * Canvas2D limitations:
 * - Only one shadow can be active at a time (we use the first outer shadow).
 * - Inner shadows have no native support (skipped).
 * - Reflection requires drawing the shape twice with transforms (skipped).
 * - Soft edge requires offscreen compositing (skipped).
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.8 (Effect Properties)
 */

import type { EffectIR, GlowIR, OuterShadowIR } from '../../ir/index.js';
import type { RenderContext } from './render-context.js';
import { emuToScaledPx } from './render-context.js';

/**
 * Format a ResolvedColor as a CSS rgba() string for Canvas2D.
 */
function colorToRgba(color: { r: number; g: number; b: number; a: number }): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
}

/**
 * Apply an outer shadow effect to the canvas context.
 *
 * Maps OOXML outer shadow properties to Canvas2D shadow properties:
 * - blurRadius -> shadowBlur
 * - distance + direction -> shadowOffsetX / shadowOffsetY
 * - color -> shadowColor
 */
function applyOuterShadow(effect: OuterShadowIR, rctx: RenderContext): void {
  const { ctx } = rctx;
  const blurPx = emuToScaledPx(effect.blurRadius, rctx);
  const distPx = emuToScaledPx(effect.distance, rctx);

  // OOXML direction is in degrees: 0 = right, 90 = bottom (clockwise).
  // Canvas2D offset: positive X = right, positive Y = down.
  const dirRad = (effect.direction * Math.PI) / 180;

  ctx.shadowColor = colorToRgba(effect.color);
  ctx.shadowBlur = blurPx;
  ctx.shadowOffsetX = distPx * Math.cos(dirRad);
  ctx.shadowOffsetY = distPx * Math.sin(dirRad);
}

/**
 * Apply a glow effect approximation using Canvas2D shadow properties.
 *
 * Glow is approximated as a shadow with zero offset and the glow radius
 * as the blur value. This produces a similar visual halo around the shape.
 */
function applyGlow(effect: GlowIR, rctx: RenderContext): void {
  const { ctx } = rctx;
  const radiusPx = emuToScaledPx(effect.radius, rctx);

  ctx.shadowColor = colorToRgba(effect.color);
  ctx.shadowBlur = radiusPx;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Apply effects before rendering a shape.
 *
 * Sets shadow, filter, and other properties on the canvas context.
 * Call this BEFORE drawing the shape path.
 *
 * @returns A cleanup function to call after drawing. It resets shadow
 *          properties to their defaults so subsequent draws are unaffected.
 */
export function applyEffects(
  effects: EffectIR[],
  rctx: RenderContext,
  _bounds: { x: number; y: number; width: number; height: number }
): () => void {
  const { ctx } = rctx;

  if (effects.length === 0) {
    return () => {};
  }

  // Canvas2D only supports a single shadow at a time. We prioritize:
  // 1. First outerShadow (most common, best Canvas2D support)
  // 2. First glow (approximated as zero-offset shadow)
  // Inner shadows, reflections, and soft edges are not supported by Canvas2D
  // and are silently skipped.

  let applied = false;

  for (const effect of effects) {
    if (applied) break;

    switch (effect.type) {
      case 'outerShadow':
        applyOuterShadow(effect, rctx);
        applied = true;
        break;

      case 'glow':
        applyGlow(effect, rctx);
        applied = true;
        break;

      case 'innerShadow':
        // Canvas2D has no native inner shadow support. An inner shadow
        // can be faked using clip + inverted path + shadow, but this is
        // complex and deferred to a future WASM-accelerated path.
        break;

      case 'reflection':
        // Reflection requires drawing the shape a second time with a
        // vertical flip, gradient alpha mask, and offset. Deferred to
        // Phase 4 (WASM compositing).
        break;

      case 'softEdge':
        // Soft edge feathering requires per-pixel alpha manipulation,
        // best handled via OffscreenCanvas or WASM. Deferred.
        break;
    }
  }

  if (!applied) {
    return () => {};
  }

  return () => {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  };
}
