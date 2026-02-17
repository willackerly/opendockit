/**
 * Background renderer for PPTX slides.
 *
 * Fills the entire slide area with the background fill from the slide IR.
 * Falls back to white (#FFFFFF) when no background or no fill is specified.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 19.3.1.1-2 (bg, bgPr)
 */

import type { BackgroundIR } from '../model/index.js';
import type { RenderContext } from '@opendockit/core/drawingml/renderer';
import type { FillIR, GradientFillIR, ResolvedColor } from '@opendockit/core';

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
 * Angle is in degrees, measured clockwise from the top edge (OOXML convention).
 */
function linearGradientEndpoints(
  angle: number,
  width: number,
  height: number
): [x0: number, y0: number, x1: number, y1: number] {
  const cx = width / 2;
  const cy = height / 2;
  const rad = ((angle - 90) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfW = width / 2;
  const halfH = height / 2;
  const len = Math.abs(halfW * cos) + Math.abs(halfH * sin);
  const dx = cos * len;
  const dy = sin * len;
  return [cx - dx, cy - dy, cx + dx, cy + dy];
}

/**
 * Apply a gradient fill directly to a rectangular area on the canvas.
 */
function fillGradient(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  fillIR: GradientFillIR,
  width: number,
  height: number
): void {
  let gradient: CanvasGradient;

  if (fillIR.kind === 'linear') {
    const angle = fillIR.angle ?? 0;
    const [x0, y0, x1, y1] = linearGradientEndpoints(angle, width, height);
    gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  } else {
    // Radial and path gradients: centered radial gradient.
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.max(width, height) / 2;
    gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  }

  for (const stop of fillIR.stops) {
    gradient.addColorStop(stop.position, colorToRgba(stop.color));
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a slide background onto the canvas.
 *
 * Fills the entire slide area with the resolved background fill, or
 * white (#FFFFFF) if no background fill is specified.
 *
 * @param background - The slide background IR (may be undefined).
 * @param rctx       - The shared render context.
 * @param width      - Slide width in pixels (already scaled for DPI).
 * @param height     - Slide height in pixels (already scaled for DPI).
 */
export function renderBackground(
  background: BackgroundIR | undefined,
  rctx: RenderContext,
  width: number,
  height: number
): void {
  const { ctx } = rctx;

  // No background or no fill: default to white.
  if (!background?.fill || background.fill.type === 'none') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const fill: FillIR = background.fill;

  switch (fill.type) {
    case 'solid': {
      ctx.fillStyle = colorToRgba(fill.color);
      ctx.fillRect(0, 0, width, height);
      break;
    }

    case 'gradient': {
      fillGradient(ctx, fill, width, height);
      break;
    }

    case 'pattern': {
      // Simplified: use the foreground color for the entire background.
      ctx.fillStyle = colorToRgba(fill.foreground);
      ctx.fillRect(0, 0, width, height);
      break;
    }

    case 'picture': {
      // Picture background fills require async image loading.
      // Fall back to white for now; the viewport layer will handle
      // pre-loading images and re-rendering when they become available.
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      break;
    }
  }
}
