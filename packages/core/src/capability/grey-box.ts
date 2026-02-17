/**
 * Grey-box fallback renderer for unsupported elements.
 *
 * Renders a hatched grey rectangle with a centered label, providing a
 * visible placeholder that communicates "this element exists but cannot
 * be rendered yet." Used by the progressive fidelity pipeline when no
 * renderer is registered for an element.
 */

import type { BoundingBox } from '../ir/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GREY_FILL = '#E0E0E0';
const HATCH_COLOR = '#C0C0C0';
const BORDER_COLOR = '#999999';
const LABEL_COLOR = '#666666';
const HATCH_SPACING = 12;
const BORDER_WIDTH = 1;
const FONT_SIZE_BASE = 12;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 16;
const LABEL_PADDING = 8;

// ---------------------------------------------------------------------------
// Grey-box renderer
// ---------------------------------------------------------------------------

/**
 * Render a grey-box placeholder for an unsupported element.
 *
 * Draws:
 * 1. A light grey filled rectangle
 * 2. Diagonal hatch lines for visual distinction
 * 3. A thin border
 * 4. A centered label (e.g. "chart", "OLE object")
 *
 * @param ctx       - Canvas 2D rendering context
 * @param bounds    - Bounding box for the placeholder (in canvas pixels)
 * @param label     - Human-readable label to display
 * @param dpiScale  - DPI scale factor (default 1)
 */
export function renderGreyBox(
  ctx: CanvasRenderingContext2D,
  bounds: BoundingBox,
  label: string,
  dpiScale: number = 1
): void {
  const { x, y, width, height } = bounds;

  if (width <= 0 || height <= 0) return;

  ctx.save();

  // 1. Grey fill
  ctx.fillStyle = GREY_FILL;
  ctx.fillRect(x, y, width, height);

  // 2. Diagonal hatch lines
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();

  ctx.strokeStyle = HATCH_COLOR;
  ctx.lineWidth = 1 * dpiScale;

  const spacing = HATCH_SPACING * dpiScale;
  const totalDiag = width + height;

  for (let d = -height; d < totalDiag; d += spacing) {
    ctx.beginPath();
    ctx.moveTo(x + d, y);
    ctx.lineTo(x + d + height, y + height);
    ctx.stroke();
  }

  ctx.restore();

  // 3. Border
  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth = BORDER_WIDTH * dpiScale;
  ctx.strokeRect(x, y, width, height);

  // 4. Centered label
  const fontSize = Math.max(
    MIN_FONT_SIZE * dpiScale,
    Math.min(MAX_FONT_SIZE * dpiScale, FONT_SIZE_BASE * dpiScale)
  );
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = LABEL_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Truncate label if it would overflow
  const maxLabelWidth = width - LABEL_PADDING * 2 * dpiScale;
  let displayLabel = label;
  if (maxLabelWidth > 0) {
    const measured = ctx.measureText(displayLabel);
    if (measured.width > maxLabelWidth) {
      // Truncate with ellipsis
      while (
        displayLabel.length > 1 &&
        ctx.measureText(displayLabel + '\u2026').width > maxLabelWidth
      ) {
        displayLabel = displayLabel.slice(0, -1);
      }
      displayLabel += '\u2026';
    }
    ctx.fillText(displayLabel, x + width / 2, y + height / 2);
  }

  ctx.restore();
}
