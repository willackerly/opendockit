/**
 * Fill renderer — applies DrawingML fill styles to a Canvas2D context.
 *
 * Handles solid, gradient, pattern, and picture fills. The fill is applied
 * to whatever path is currently defined on the context (the caller is
 * responsible for building the path before calling {@link applyFill}).
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.8 (Fill Properties)
 */

import type { FillIR } from '../../ir/index.js';
import { colorToRgba } from '../../ir/index.js';
import type { RenderContext } from './render-context.js';

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

  // Convert OOXML angle (clockwise from top, 0°=top-to-bottom) to standard
  // math radians. In Canvas2D coords (Y down), angle 0° → direction (0, +1),
  // 90° → (+1, 0), etc. Standard math: subtract 90 and negate for CW→CCW.
  const rad = (-(angle - 90) * Math.PI) / 180;

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
  const { backend } = rctx;

  switch (fillIR.type) {
    case 'solid': {
      backend.fillStyle = colorToRgba(fillIR.color);
      path ? backend.fill(path) : backend.fill();
      break;
    }

    case 'gradient': {
      let gradient: CanvasGradient;

      if (fillIR.kind === 'linear') {
        const angle = fillIR.angle ?? 0;
        const [x0, y0, x1, y1] = linearGradientEndpoints(angle, bounds);
        gradient = backend.createLinearGradient(x0, y0, x1, y1);
      } else {
        // Radial and path gradients: create a radial gradient centered in bounds.
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const radius = Math.max(bounds.width, bounds.height) / 2;
        gradient = backend.createRadialGradient(cx, cy, 0, cx, cy, radius);
      }

      for (const stop of fillIR.stops) {
        gradient.addColorStop(stop.position, colorToRgba(stop.color));
      }

      backend.fillStyle = gradient;
      path ? backend.fill(path) : backend.fill();
      break;
    }

    case 'pattern': {
      // Simplified: fill with the foreground color. Full pattern rendering
      // (creating pattern canvases for each preset) is deferred.
      rctx.diagnostics?.emit({
        category: 'partial-rendering',
        severity: 'info',
        message: `Pattern fill "${fillIR.preset}" rendered as solid foreground color`,
        context: { slideNumber: rctx.slideNumber, elementType: 'fill' },
      });
      backend.fillStyle = colorToRgba(fillIR.foreground);
      path ? backend.fill(path) : backend.fill();
      break;
    }

    case 'picture': {
      // Picture fills require async image loading from the media cache.
      // For now, skip — the picture-renderer will handle image fills.
      rctx.diagnostics?.emit({
        category: 'partial-rendering',
        severity: 'warning',
        message: 'Picture fill not yet implemented; skipped',
        context: { slideNumber: rctx.slideNumber, elementType: 'fill' },
      });
      break;
    }

    case 'none': {
      // No fill — do nothing.
      break;
    }
  }
}
