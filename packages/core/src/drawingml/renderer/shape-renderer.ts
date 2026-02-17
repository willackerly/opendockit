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
  ConnectorIR,
  TableIR,
  ChartIR,
  UnsupportedIR,
} from '../../ir/index.js';
import type { RenderContext } from './render-context.js';
import { emuToScaledPx } from './render-context.js';
import { applyFill } from './fill-renderer.js';
import { applyLine } from './line-renderer.js';
import { applyEffects } from './effect-renderer.js';
import { renderTextBody } from './text-renderer.js';
import { renderPicture } from './picture-renderer.js';
import { renderGroup } from './group-renderer.js';

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

// ---------------------------------------------------------------------------
// Connector rendering
// ---------------------------------------------------------------------------

/**
 * Render a connector as a simple line between its bounding box endpoints.
 *
 * Full connector routing (via connection sites on connected shapes) is
 * deferred. For now, we draw a straight line from top-left to
 * bottom-right of the connector's bounding box.
 */
function renderConnector(connector: ConnectorIR, rctx: RenderContext): void {
  const px = extractTransformPx(connector, rctx);
  if (!px) return;

  const { ctx } = rctx;
  const { x, y, w, h } = px;

  ctx.save();

  // Build a simple line path between opposite corners.
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y + h);

  if (connector.properties.line) {
    applyLine(connector.properties.line, rctx);
  }

  ctx.restore();
}

/**
 * Render a table element as a placeholder box.
 */
function renderTable(table: TableIR, rctx: RenderContext): void {
  const px = extractTransformPx(table, rctx);
  if (!px) return;
  renderPlaceholderBox(rctx, px.x, px.y, px.w, px.h, 'Table');
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
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a single DrawingML shape to the canvas.
 *
 * Orchestrates the full rendering pipeline:
 * 1. Extract and validate transform
 * 2. Save canvas state
 * 3. Apply transform (translate, rotate, flip)
 * 4. Apply effects (shadow, glow)
 * 5. Build geometry path (preset or default rect)
 * 6. Apply fill
 * 7. Apply line/stroke
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

  // -- Effects (applied before drawing) --
  const effectCleanup = applyEffects(shape.properties.effects, rctx, bounds);

  // -- Geometry path --
  // If a path builder is available for preset geometries, use it.
  // Otherwise, fall back to a simple rectangle path.
  ctx.beginPath();
  ctx.rect(0, 0, w, h);

  // -- Fill --
  if (shape.properties.fill) {
    applyFill(shape.properties.fill, rctx, bounds);
  }

  // -- Line/Stroke --
  if (shape.properties.line) {
    applyLine(shape.properties.line, rctx);
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
