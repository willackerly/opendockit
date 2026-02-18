/**
 * Fill renderer — applies DrawingML fill styles to a Canvas2D context.
 *
 * Handles solid, gradient, pattern, and picture fills. The fill is applied
 * to whatever path is currently defined on the context (the caller is
 * responsible for building the path before calling {@link applyFill}).
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.8 (Fill Properties)
 */

import type { FillIR, ResolvedColor } from '../../ir/index.js';
import type { RenderContext } from './render-context.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a ResolvedColor as a CSS rgba() string. */
function colorToRgba(c: ResolvedColor): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
}

/**
 * Compute linear gradient start/end points from an angle and bounding box.
 *
 * The angle is in degrees, measured clockwise from the top edge (OOXML
 * convention). 0 = top-to-bottom, 90 = left-to-right, 180 = bottom-to-top,
 * 270 = right-to-left.
 */
function linearGradientEndpoints(
  angle: number,
  bounds: { x: number; y: number; width: number; height: number }
): [x0: number, y0: number, x1: number, y1: number] {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;

  // Convert OOXML angle (clockwise from top) to standard math radians
  // (counter-clockwise from right): subtract 90 to rotate, negate for CW.
  const rad = ((angle - 90) * Math.PI) / 180;

  // The gradient line must span the full bounding box diagonal projection.
  // Use the half-diagonal projected onto the gradient direction.
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfW = bounds.width / 2;
  const halfH = bounds.height / 2;
  const len = Math.abs(halfW * cos) + Math.abs(halfH * sin);

  const dx = cos * len;
  const dy = sin * len;

  return [cx - dx, cy - dy, cx + dx, cy + dy];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply a fill to the current path on the canvas context.
 *
 * Sets `fillStyle` and calls `fill()`. For `NoFill`, does nothing.
 *
 * When a `path` (Path2D) is provided, the fill is applied to that path
 * instead of the current context path. This is used when shapes have
 * preset or custom geometry that was built as a Path2D.
 *
 * @param fillIR - The fill IR to apply.
 * @param rctx   - The shared render context.
 * @param bounds - The bounding rectangle of the shape being filled (in
 *                 canvas pixel coordinates, already scaled).
 * @param path   - Optional Path2D to fill instead of the current context path.
 */
export function applyFill(
  fillIR: FillIR,
  rctx: RenderContext,
  bounds: { x: number; y: number; width: number; height: number },
  path?: Path2D
): void {
  const { ctx } = rctx;

  switch (fillIR.type) {
    case 'solid': {
      ctx.fillStyle = colorToRgba(fillIR.color);
      path ? ctx.fill(path) : ctx.fill();
      break;
    }

    case 'gradient': {
      let gradient: CanvasGradient;

      if (fillIR.kind === 'linear') {
        const angle = fillIR.angle ?? 0;
        const [x0, y0, x1, y1] = linearGradientEndpoints(angle, bounds);
        gradient = ctx.createLinearGradient(x0, y0, x1, y1);
      } else {
        // Radial and path gradients: create a radial gradient centered in bounds.
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const radius = Math.max(bounds.width, bounds.height) / 2;
        gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      }

      for (const stop of fillIR.stops) {
        gradient.addColorStop(stop.position, colorToRgba(stop.color));
      }

      ctx.fillStyle = gradient;
      path ? ctx.fill(path) : ctx.fill();
      break;
    }

    case 'pattern': {
      // Simplified: fill with the foreground color. Full pattern rendering
      // (creating pattern canvases for each preset) is deferred.
      ctx.fillStyle = colorToRgba(fillIR.foreground);
      path ? ctx.fill(path) : ctx.fill();
      break;
    }

    case 'picture': {
      // Picture fills require async image loading from the media cache.
      // For now, skip — the picture-renderer will handle image fills.
      break;
    }

    case 'none': {
      // No fill — do nothing.
      break;
    }
  }
}
