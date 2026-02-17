/**
 * Shape renderer — orchestrates DrawingML shape rendering on Canvas2D.
 *
 * This is the main composition layer that coordinates the independent
 * renderers from Fan-Out 2: transform, effects, geometry, fill, line,
 * and text. Each shape follows the rendering pipeline:
 *
 *   save -> transform -> effects -> geometry path -> fill -> line -> cleanup -> text -> restore
 *
 * Also provides {@link renderSlideElement} which dispatches any
 * {@link SlideElementIR} to the appropriate renderer by its `kind`.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.2 (Shape)
 */

import type {
  DrawingMLShapeIR,
  SlideElementIR,
  TableIR,
  ChartIR,
  UnsupportedIR,
  FillIR,
  LineIR,
  EffectIR,
} from '../../ir/index.js';
import type { RenderContext } from './render-context.js';
import { emuToScaledPx } from './render-context.js';
import { applyFill } from './fill-renderer.js';
import { applyLine } from './line-renderer.js';
import { applyEffects } from './effect-renderer.js';
import { renderTextBody } from './text-renderer.js';
import { renderPicture } from './picture-renderer.js';
import { renderGroup } from './group-renderer.js';
import { renderTable as renderTableImpl } from './table-renderer.js';
import { renderConnector } from './connector-renderer.js';
import { resolveFormatStyle } from '../../theme/index.js';

// ---------------------------------------------------------------------------
// Placeholder rendering
// ---------------------------------------------------------------------------

/**
 * Render a grey placeholder box with a label for unsupported element types.
 *
 * Used for tables, charts, and unrecognized elements that do not yet
 * have full rendering support.
 */
function renderPlaceholderBox(
  rctx: RenderContext,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string
): void {
  const { ctx } = rctx;
  ctx.save();
  ctx.fillStyle = '#F0F0F0';
  ctx.strokeStyle = '#CCC';
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#999';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.restore();
}

/**
 * Extract position and size in pixels from a transform, returning null
 * if the element has no transform.
 */
function extractTransformPx(
  element: {
    properties: {
      transform?: { position: { x: number; y: number }; size: { width: number; height: number } };
    };
  },
  rctx: RenderContext
): { x: number; y: number; w: number; h: number } | null {
  const transform = element.properties.transform;
  if (!transform) return null;
  return {
    x: emuToScaledPx(transform.position.x, rctx),
    y: emuToScaledPx(transform.position.y, rctx),
    w: emuToScaledPx(transform.size.width, rctx),
    h: emuToScaledPx(transform.size.height, rctx),
  };
}

/**
 * Render a table element using the full table renderer.
 */
function renderTable(table: TableIR, rctx: RenderContext): void {
  renderTableImpl(table, rctx);
}

/**
 * Render a chart element as a placeholder box.
 */
function renderChart(chart: ChartIR, rctx: RenderContext): void {
  const px = extractTransformPx(chart, rctx);
  if (!px) return;
  renderPlaceholderBox(rctx, px.x, px.y, px.w, px.h, 'Chart');
}

/**
 * Render an unsupported element as a placeholder box.
 */
function renderUnsupported(element: UnsupportedIR, rctx: RenderContext): void {
  if (!element.bounds) return;
  const x = emuToScaledPx(element.bounds.x, rctx);
  const y = emuToScaledPx(element.bounds.y, rctx);
  const w = emuToScaledPx(element.bounds.width, rctx);
  const h = emuToScaledPx(element.bounds.height, rctx);
  renderPlaceholderBox(rctx, x, y, w, h, element.elementType);
}

// ---------------------------------------------------------------------------
// Style reference resolution
// ---------------------------------------------------------------------------

/**
 * Resolve effective fill for a shape.
 *
 * Inline fill takes precedence over style reference fill. A fill of
 * `{ type: 'none' }` is treated as "no fill specified" for precedence
 * purposes only when a style reference exists — explicit noFill in
 * inline properties is an intentional override.
 */
function resolveEffectiveFill(shape: DrawingMLShapeIR, rctx: RenderContext): FillIR | undefined {
  // Inline fill present — use it
  if (shape.properties.fill) {
    return shape.properties.fill;
  }

  // Fall back to style reference
  if (shape.style?.fillRef && shape.style.fillRef.idx > 0) {
    const resolved = resolveFormatStyle(shape.style.fillRef.idx, 'fill', rctx.theme);
    return resolved as FillIR | undefined;
  }

  return undefined;
}

/**
 * Resolve effective line for a shape.
 *
 * Inline line takes precedence over style reference line.
 */
function resolveEffectiveLine(shape: DrawingMLShapeIR, rctx: RenderContext): LineIR | undefined {
  // Inline line present — use it
  if (shape.properties.line) {
    return shape.properties.line;
  }

  // Fall back to style reference
  if (shape.style?.lnRef && shape.style.lnRef.idx > 0) {
    const resolved = resolveFormatStyle(shape.style.lnRef.idx, 'line', rctx.theme);
    if (resolved) {
      const styleLine = resolved as LineIR;
      // Apply the style reference color if the resolved line has no color
      if (!styleLine.color && shape.style.lnRef.color) {
        return { ...styleLine, color: shape.style.lnRef.color };
      }
      return styleLine;
    }
  }

  return undefined;
}

/**
 * Resolve effective effects for a shape.
 *
 * Inline effects take precedence over style reference effects.
 */
function resolveEffectiveEffects(shape: DrawingMLShapeIR, rctx: RenderContext): EffectIR[] {
  // Inline effects present and non-empty — use them
  if (shape.properties.effects.length > 0) {
    return shape.properties.effects;
  }

  // Fall back to style reference
  if (shape.style?.effectRef && shape.style.effectRef.idx > 0) {
    const resolved = resolveFormatStyle(shape.style.effectRef.idx, 'effect', rctx.theme);
    if (resolved) {
      return resolved as EffectIR[];
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a single DrawingML shape to the canvas.
 *
 * Orchestrates the full rendering pipeline:
 * 1. Extract and validate transform
 * 2. Save canvas state
 * 3. Apply transform (translate, rotate, flip)
 * 4. Apply effects (shadow, glow) — merged with style references
 * 5. Build geometry path (preset or default rect)
 * 6. Apply fill — merged with style references
 * 7. Apply line/stroke — merged with style references
 * 8. Call effect cleanup
 * 9. Render text body
 * 10. Restore canvas state
 */
export function renderShape(shape: DrawingMLShapeIR, rctx: RenderContext): void {
  const { ctx } = rctx;
  const transform = shape.properties.transform;

  // No transform means nothing to render — the shape has no position or size.
  if (!transform) return;

  const { position, size, rotation, flipH, flipV } = transform;
  const x = emuToScaledPx(position.x, rctx);
  const y = emuToScaledPx(position.y, rctx);
  const w = emuToScaledPx(size.width, rctx);
  const h = emuToScaledPx(size.height, rctx);

  ctx.save();

  // -- Transform: translate to center, rotate, flip, translate back --
  ctx.translate(x + w / 2, y + h / 2);
  if (rotation) {
    ctx.rotate((rotation * Math.PI) / 180);
  }
  if (flipH) {
    ctx.scale(-1, 1);
  }
  if (flipV) {
    ctx.scale(1, -1);
  }
  ctx.translate(-w / 2, -h / 2);

  // Bounds in the local coordinate space (post-transform origin is at 0,0).
  const bounds = { x: 0, y: 0, width: w, height: h };

  // -- Resolve effective properties (inline takes precedence over style refs) --
  const effectiveFill = resolveEffectiveFill(shape, rctx);
  const effectiveLine = resolveEffectiveLine(shape, rctx);
  const effectiveEffects = resolveEffectiveEffects(shape, rctx);

  // -- Effects (applied before drawing) --
  const effectCleanup = applyEffects(effectiveEffects, rctx, bounds);

  // -- Geometry path --
  // If a path builder is available for preset geometries, use it.
  // Otherwise, fall back to a simple rectangle path.
  ctx.beginPath();
  ctx.rect(0, 0, w, h);

  // -- Fill --
  if (effectiveFill) {
    applyFill(effectiveFill, rctx, bounds);
  }

  // -- Line/Stroke --
  if (effectiveLine) {
    applyLine(effectiveLine, rctx);
  }

  // -- Effect cleanup --
  effectCleanup();

  // -- Text body --
  if (shape.textBody) {
    renderTextBody(shape.textBody, rctx, bounds);
  }

  ctx.restore();
}

/**
 * Render any slide element by dispatching on its `kind` discriminant.
 *
 * This is the main entry point for rendering a heterogeneous list of
 * slide elements. It delegates to the appropriate specialized renderer
 * for each element type.
 */
export function renderSlideElement(element: SlideElementIR, rctx: RenderContext): void {
  switch (element.kind) {
    case 'shape':
      renderShape(element, rctx);
      break;
    case 'picture':
      renderPicture(element, rctx);
      break;
    case 'group':
      renderGroup(element, rctx);
      break;
    case 'connector':
      renderConnector(element, rctx);
      break;
    case 'table':
      renderTable(element, rctx);
      break;
    case 'chart':
      renderChart(element, rctx);
      break;
    case 'unsupported':
      renderUnsupported(element, rctx);
      break;
  }
}
