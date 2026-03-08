/**
 * Connector renderer — renders DrawingML connectors to a Canvas2D context.
 *
 * Connectors are lines (straight, bent, or curved) that connect shapes on a
 * slide. This renderer extracts the start/end points from the connector's
 * transform, determines the connector type from its preset geometry name,
 * and draws the appropriate path.
 *
 * Supported preset geometries:
 * - `straightConnector1` — simple straight line
 * - `bentConnector2`..`bentConnector5` — lines with right-angle bends
 * - `curvedConnector2`..`curvedConnector5` — lines with bezier curves
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 20.1.9.16 (cxnSp)
 */

import type { ConnectorIR } from '../../ir/index.js';
import type { RenderContext } from './render-context.js';
import { emuToScaledPx } from './render-context.js';
import type { RenderBackend } from './render-backend.js';
import { applyLine, drawLineEnds } from './line-renderer.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Determine the connector type from the preset geometry name.
 *
 * Returns 'straight', 'bent', or 'curved' based on the preset name.
 * Defaults to 'straight' for unknown or absent geometries.
 */
function getConnectorType(connector: ConnectorIR): 'straight' | 'bent' | 'curved' {
  const geom = connector.properties.geometry;
  if (!geom || geom.kind !== 'preset') return 'straight';

  const name = geom.name;
  if (name.startsWith('bentConnector')) return 'bent';
  if (name.startsWith('curvedConnector')) return 'curved';
  return 'straight';
}

/**
 * Draw a straight connector line from start to end.
 */
function drawStraightConnector(
  backend: RenderBackend,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  backend.beginPath();
  backend.moveTo(x, y);
  backend.lineTo(x + w, y + h);
}

/**
 * Draw a bent (right-angle) connector between two points.
 *
 * Uses a simple midpoint routing strategy:
 * - If the connector is more horizontal than vertical, the bend occurs
 *   at the horizontal midpoint.
 * - Otherwise, the bend occurs at the vertical midpoint.
 *
 * This produces an L-shaped or Z-shaped path depending on the geometry.
 */
function drawBentConnector(
  backend: RenderBackend,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  backend.beginPath();
  const startX = x;
  const startY = y;
  const endX = x + w;
  const endY = y + h;

  if (Math.abs(w) >= Math.abs(h)) {
    // Horizontal-dominant: go right to midpoint, then turn and go to end.
    const midX = startX + w / 2;
    backend.moveTo(startX, startY);
    backend.lineTo(midX, startY);
    backend.lineTo(midX, endY);
    backend.lineTo(endX, endY);
  } else {
    // Vertical-dominant: go down to midpoint, then turn and go to end.
    const midY = startY + h / 2;
    backend.moveTo(startX, startY);
    backend.lineTo(startX, midY);
    backend.lineTo(endX, midY);
    backend.lineTo(endX, endY);
  }
}

/**
 * Draw a curved connector using a cubic bezier curve.
 *
 * Uses a simple S-curve strategy with control points at the midpoint,
 * offset horizontally or vertically depending on the connector's aspect ratio.
 */
function drawCurvedConnector(
  backend: RenderBackend,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  backend.beginPath();
  const startX = x;
  const startY = y;
  const endX = x + w;
  const endY = y + h;

  if (Math.abs(w) >= Math.abs(h)) {
    // Horizontal-dominant: S-curve with horizontal control points.
    const midX = startX + w / 2;
    backend.moveTo(startX, startY);
    backend.bezierCurveTo(midX, startY, midX, endY, endX, endY);
  } else {
    // Vertical-dominant: S-curve with vertical control points.
    const midY = startY + h / 2;
    backend.moveTo(startX, startY);
    backend.bezierCurveTo(startX, midY, endX, midY, endX, endY);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a connector shape to the canvas.
 *
 * Determines the connector type (straight, bent, curved) from its preset
 * geometry, draws the appropriate path, and applies line styling and
 * arrowhead decorations.
 *
 * @param connector - The connector IR to render.
 * @param rctx      - The shared render context.
 */
export function renderConnector(connector: ConnectorIR, rctx: RenderContext): void {
  const transform = connector.properties.transform;
  if (!transform) return;

  const { backend } = rctx;
  const x = emuToScaledPx(transform.position.x, rctx);
  const y = emuToScaledPx(transform.position.y, rctx);
  const w = emuToScaledPx(transform.size.width, rctx);
  const h = emuToScaledPx(transform.size.height, rctx);

  // Emit diagnostic for non-snapped connectors — the connector has no
  // connection reference to a shape, so endpoints are absolute positions
  // rather than dynamically following the connected shapes.
  if (!connector.startConnection && !connector.endConnection) {
    rctx.diagnostics?.emit({
      category: 'partial-rendering',
      severity: 'info',
      message: 'Connector has no snapped endpoints; rendered with absolute positions',
      context: { slideNumber: rctx.slideNumber, elementType: 'connector' },
    });
  }

  backend.save();

  // Apply rotation and flips if present.
  if (transform.rotation || transform.flipH || transform.flipV) {
    backend.translate(x + w / 2, y + h / 2);
    if (transform.rotation) {
      backend.rotate((transform.rotation * Math.PI) / 180);
    }
    if (transform.flipH) {
      backend.scale(-1, 1);
    }
    if (transform.flipV) {
      backend.scale(1, -1);
    }
    backend.translate(-(x + w / 2), -(y + h / 2));
  }

  // Draw the connector path based on its type.
  const connectorType = getConnectorType(connector);
  switch (connectorType) {
    case 'straight':
      drawStraightConnector(backend, x, y, w, h);
      break;
    case 'bent':
      drawBentConnector(backend, x, y, w, h);
      break;
    case 'curved':
      drawCurvedConnector(backend, x, y, w, h);
      break;
  }

  // Apply line styling and stroke.
  if (connector.properties.line) {
    applyLine(connector.properties.line, rctx);
  }

  // Draw arrowheads if present.
  if (connector.properties.line) {
    const line = connector.properties.line;
    if (line.headEnd || line.tailEnd) {
      const startX = x;
      const startY = y;
      const endX = x + w;
      const endY = y + h;
      const angle = Math.atan2(h, w);

      drawLineEnds(
        line,
        rctx,
        {
          x: startX,
          y: startY,
          angle: angle + Math.PI, // Points away from the start
        },
        {
          x: endX,
          y: endY,
          angle, // Points away from the end
        }
      );
    }
  }

  backend.restore();
}
