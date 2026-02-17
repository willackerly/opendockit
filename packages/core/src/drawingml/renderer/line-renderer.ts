/**
 * Line renderer — applies DrawingML line/stroke properties to a Canvas2D context.
 *
 * Handles stroke color, width, dash patterns, cap styles, join styles, and
 * line-end arrows. The stroke is applied to whatever path is currently
 * defined on the context.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.8.35 (ln — Line Properties)
 */

import type { DashStyle, LineEnd, LineIR, ResolvedColor } from '../../ir/index.js';
import type { RenderContext } from './render-context.js';
import { emuToScaledPx } from './render-context.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a ResolvedColor as a CSS rgba() string. */
function colorToRgba(c: ResolvedColor): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
}

/**
 * Map an OOXML LineCap to the Canvas2D `lineCap` property value.
 *
 * OOXML "flat" corresponds to Canvas2D "butt". The other values
 * ("round", "square") map directly.
 */
function mapLineCap(cap: 'flat' | 'round' | 'square'): CanvasLineCap {
  if (cap === 'flat') return 'butt';
  return cap;
}

/**
 * Map an OOXML LineJoin to the Canvas2D `lineJoin` property value.
 * All values map directly.
 */
function mapLineJoin(join: 'round' | 'bevel' | 'miter'): CanvasLineJoin {
  return join;
}

/**
 * Compute a dash array for the given dash style.
 *
 * Dash segment lengths are expressed as multiples of the line width,
 * following the OOXML spec's proportional dash definitions.
 *
 * @param style - The OOXML dash preset name.
 * @param w     - The line width in pixels (used as the base unit).
 * @returns An array of dash/gap lengths for `ctx.setLineDash()`.
 */
function dashArray(style: DashStyle, w: number): number[] {
  // Ensure a minimum width so dashes are visible even for hairlines.
  const u = Math.max(w, 1);

  switch (style) {
    case 'solid':
      return [];
    case 'dash':
      return [4 * u, 3 * u];
    case 'dot':
      return [u, u];
    case 'dashDot':
      return [4 * u, 3 * u, u, 3 * u];
    case 'lgDash':
      return [8 * u, 3 * u];
    case 'lgDashDot':
      return [8 * u, 3 * u, u, 3 * u];
    case 'lgDashDotDot':
      return [8 * u, 3 * u, u, 3 * u, u, 3 * u];
    case 'sysDash':
      return [3 * u, u];
    case 'sysDot':
      return [u, u];
    case 'sysDashDot':
      return [3 * u, u, u, u];
    case 'sysDashDotDot':
      return [3 * u, u, u, u, u, u];
  }
}

/**
 * Resolve a line-end size descriptor to a multiplier of line width.
 */
function endSizeMultiplier(size: 'sm' | 'med' | 'lg' | undefined): number {
  switch (size) {
    case 'sm':
      return 2;
    case 'lg':
      return 5;
    case 'med':
    default:
      return 3;
  }
}

/**
 * Draw a line-end arrow at the given point.
 *
 * @param ctx  - The Canvas2D context.
 * @param end  - Line end descriptor (type, width, length).
 * @param x    - X position of the line endpoint.
 * @param y    - Y position of the line endpoint.
 * @param angle - Direction the line is heading at this endpoint (radians).
 * @param lineWidth - Stroke width in pixels.
 * @param color - Stroke color string.
 */
function drawLineEnd(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  end: LineEnd,
  x: number,
  y: number,
  angle: number,
  lineWidth: number,
  color: string
): void {
  if (end.type === 'none') return;

  const wMul = endSizeMultiplier(end.width);
  const lMul = endSizeMultiplier(end.length);
  const halfW = (wMul * lineWidth) / 2;
  const len = lMul * lineWidth;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.beginPath();

  switch (end.type) {
    case 'triangle':
    case 'stealth':
    case 'arrow': {
      ctx.moveTo(0, 0);
      ctx.lineTo(-len, -halfW);
      ctx.lineTo(-len, halfW);
      ctx.closePath();
      break;
    }
    case 'diamond': {
      const halfLen = len / 2;
      ctx.moveTo(0, 0);
      ctx.lineTo(-halfLen, -halfW);
      ctx.lineTo(-len, 0);
      ctx.lineTo(-halfLen, halfW);
      ctx.closePath();
      break;
    }
    case 'oval': {
      ctx.ellipse(-len / 2, 0, len / 2, halfW, 0, 0, 2 * Math.PI);
      break;
    }
  }

  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Default line width in EMU (0.75 pt = 9525 EMU). */
const DEFAULT_LINE_WIDTH_EMU = 9525;

/**
 * Apply line/stroke properties to the canvas context and stroke the current path.
 *
 * If the line has no color, the function returns without stroking to match
 * OOXML behavior where an absent line color means "no outline."
 *
 * @param lineIR - The line IR to apply.
 * @param rctx   - The shared render context.
 */
export function applyLine(lineIR: LineIR, rctx: RenderContext): void {
  const { ctx } = rctx;

  // No color means no visible line.
  if (!lineIR.color) return;

  const strokeColor = colorToRgba(lineIR.color);
  ctx.strokeStyle = strokeColor;

  // Convert width from EMU to scaled pixels.
  const widthEmu = lineIR.width ?? DEFAULT_LINE_WIDTH_EMU;
  const widthPx = emuToScaledPx(widthEmu, rctx);
  ctx.lineWidth = widthPx;

  // Line cap.
  if (lineIR.cap) {
    ctx.lineCap = mapLineCap(lineIR.cap);
  }

  // Line join.
  if (lineIR.join) {
    ctx.lineJoin = mapLineJoin(lineIR.join);
  }

  // Dash pattern.
  const dash = lineIR.dashStyle ?? 'solid';
  ctx.setLineDash(dashArray(dash, widthPx));

  // Stroke the path.
  ctx.stroke();
}

/**
 * Draw line-end decorations (arrowheads) at the given endpoints.
 *
 * This is separate from {@link applyLine} because arrow drawing requires
 * knowing the exact endpoint coordinates and heading angles, which are
 * determined by the geometry renderer.
 *
 * @param lineIR  - The line IR containing head/tail end descriptors.
 * @param rctx    - The shared render context.
 * @param head    - Head endpoint position and heading angle (radians).
 * @param tail    - Tail endpoint position and heading angle (radians).
 */
export function drawLineEnds(
  lineIR: LineIR,
  rctx: RenderContext,
  head: { x: number; y: number; angle: number },
  tail: { x: number; y: number; angle: number }
): void {
  if (!lineIR.color) return;

  const { ctx } = rctx;
  const strokeColor = colorToRgba(lineIR.color);
  const widthEmu = lineIR.width ?? DEFAULT_LINE_WIDTH_EMU;
  const widthPx = emuToScaledPx(widthEmu, rctx);

  if (lineIR.headEnd && lineIR.headEnd.type !== 'none') {
    drawLineEnd(ctx, lineIR.headEnd, head.x, head.y, head.angle, widthPx, strokeColor);
  }

  if (lineIR.tailEnd && lineIR.tailEnd.type !== 'none') {
    drawLineEnd(ctx, lineIR.tailEnd, tail.x, tail.y, tail.angle, widthPx, strokeColor);
  }
}
