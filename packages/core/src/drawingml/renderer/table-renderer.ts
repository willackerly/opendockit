/**
 * Table renderer — renders DrawingML tables to a Canvas2D context.
 *
 * Takes a TableIR and renders a grid of cells with backgrounds, borders,
 * and text content. Handles column widths from the table grid, row heights,
 * and cell spanning (gridSpan/rowSpan).
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 21.1.3.13 (CT_Table)
 */

import type { TableIR, LineIR, ResolvedColor } from '../../ir/index.js';
import type { RenderContext } from './render-context.js';
import { emuToScaledPx } from './render-context.js';
import { applyFill } from './fill-renderer.js';
import { renderTextBody } from './text-renderer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a ResolvedColor as a CSS rgba() string. */
function colorToRgba(c: ResolvedColor): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
}

/**
 * Draw a single border line on the canvas.
 *
 * @param ctx - The Canvas2D context.
 * @param line - The line IR describing color and width.
 * @param x1 - Start X coordinate.
 * @param y1 - Start Y coordinate.
 * @param x2 - End X coordinate.
 * @param y2 - End Y coordinate.
 * @param rctx - The render context for unit conversion.
 */
function drawBorderLine(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  line: LineIR,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rctx: RenderContext
): void {
  if (!line.color) return;

  ctx.beginPath();
  ctx.strokeStyle = colorToRgba(line.color);
  const widthEmu = line.width ?? 9525; // default 0.75pt
  ctx.lineWidth = emuToScaledPx(widthEmu, rctx);
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a table to the Canvas2D context.
 *
 * Pipeline:
 * 1. Extract position and size from the table's transform.
 * 2. Compute column widths (from grid or equal distribution).
 * 3. For each row and cell:
 *    a. Calculate cell bounds, accounting for gridSpan/rowSpan.
 *    b. Fill cell background.
 *    c. Draw cell borders.
 *    d. Render cell text body.
 * 4. Skip hMerge/vMerge continuation cells.
 *
 * @param table - The table IR to render.
 * @param rctx  - The shared render context.
 */
export function renderTable(table: TableIR, rctx: RenderContext): void {
  const { ctx } = rctx;
  const transform = table.properties.transform;
  if (!transform) return;

  const tableX = emuToScaledPx(transform.position.x, rctx);
  const tableY = emuToScaledPx(transform.position.y, rctx);
  const frameW = emuToScaledPx(transform.size.width, rctx);
  const frameH = emuToScaledPx(transform.size.height, rctx);

  if (table.rows.length === 0) return;

  // Determine column count from the first row or the grid.
  const numCols = table.columnWidths?.length ?? table.rows[0]?.cells.length ?? 0;
  if (numCols === 0) return;

  // Compute column widths in pixels.
  // Use tblGrid column widths directly (EMU → px) when available.
  // The graphicFrame extent is unreliable — Google Slides exports often set
  // a default placeholder (e.g. 3000000×3000000) that is smaller than the
  // actual table grid. The tblGrid widths are the authoritative source.
  let colWidthsPx: number[];
  if (table.columnWidths && table.columnWidths.length > 0) {
    const totalGridEmu = table.columnWidths.reduce((s, w) => s + w, 0);
    if (totalGridEmu > 0) {
      colWidthsPx = table.columnWidths.map((w) => emuToScaledPx(w, rctx));
    } else {
      colWidthsPx = Array(numCols).fill(frameW / numCols) as number[];
    }
  } else {
    colWidthsPx = Array(numCols).fill(frameW / numCols) as number[];
  }

  // Compute row heights in pixels.
  // Use row heights directly (EMU → px) when available.
  const totalRowHeightEmu = table.rows.reduce((s, r) => s + r.height, 0);
  let rowHeightsPx: number[];
  if (totalRowHeightEmu > 0) {
    rowHeightsPx = table.rows.map((r) => emuToScaledPx(r.height, rctx));
  } else {
    const numRows = table.rows.length;
    rowHeightsPx = Array(numRows).fill(frameH / numRows) as number[];
  }

  // Precompute cumulative X offsets for columns.
  const colXOffsets: number[] = [0];
  for (let c = 0; c < colWidthsPx.length; c++) {
    colXOffsets.push(colXOffsets[c] + colWidthsPx[c]);
  }

  // Precompute cumulative Y offsets for rows.
  const rowYOffsets: number[] = [0];
  for (let r = 0; r < rowHeightsPx.length; r++) {
    rowYOffsets.push(rowYOffsets[r] + rowHeightsPx[r]);
  }

  ctx.save();

  // Render each cell.
  for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
    const row = table.rows[rowIdx];

    for (let colIdx = 0; colIdx < row.cells.length; colIdx++) {
      const cell = row.cells[colIdx];

      // Skip continuation cells — they are covered by the spanning cell.
      if (cell.hMerge || cell.vMerge) {
        continue;
      }

      // Calculate cell bounds.
      const cellX = tableX + colXOffsets[colIdx];
      const cellY = tableY + rowYOffsets[rowIdx];

      // Width: sum of spanned columns.
      const spanCols = cell.gridSpan ?? 1;
      let cellW = 0;
      for (let s = 0; s < spanCols && colIdx + s < colWidthsPx.length; s++) {
        cellW += colWidthsPx[colIdx + s];
      }

      // Height: sum of spanned rows.
      const spanRows = cell.rowSpan ?? 1;
      let cellH = 0;
      for (let s = 0; s < spanRows && rowIdx + s < rowHeightsPx.length; s++) {
        cellH += rowHeightsPx[rowIdx + s];
      }

      // Fill cell background.
      if (cell.fill && cell.fill.type !== 'none') {
        ctx.beginPath();
        ctx.rect(cellX, cellY, cellW, cellH);
        applyFill(cell.fill, rctx, { x: cellX, y: cellY, width: cellW, height: cellH });
      }

      // Draw cell borders.
      if (cell.borders) {
        if (cell.borders.left) {
          drawBorderLine(ctx, cell.borders.left, cellX, cellY, cellX, cellY + cellH, rctx);
        }
        if (cell.borders.right) {
          drawBorderLine(
            ctx,
            cell.borders.right,
            cellX + cellW,
            cellY,
            cellX + cellW,
            cellY + cellH,
            rctx
          );
        }
        if (cell.borders.top) {
          drawBorderLine(ctx, cell.borders.top, cellX, cellY, cellX + cellW, cellY, rctx);
        }
        if (cell.borders.bottom) {
          drawBorderLine(
            ctx,
            cell.borders.bottom,
            cellX,
            cellY + cellH,
            cellX + cellW,
            cellY + cellH,
            rctx
          );
        }
      }

      // Render text body.
      // Table cells use <a:tcPr> margins (marL/marR/marT/marB), NOT the
      // large default shape body insets (91440 EMU = 0.1in).  When the cell's
      // <a:bodyPr> omits inset attributes, the text renderer would apply the
      // shape default, which consumes rows that are only ~93k EMU tall.
      // Override undefined insets to 0 so text actually renders.
      if (cell.textBody) {
        const bp = cell.textBody.bodyProperties;
        const cellTextBody = {
          ...cell.textBody,
          bodyProperties: {
            ...bp,
            leftInset: bp.leftInset ?? 0,
            rightInset: bp.rightInset ?? 0,
            topInset: bp.topInset ?? 0,
            bottomInset: bp.bottomInset ?? 0,
          },
        };
        renderTextBody(cellTextBody, rctx, {
          x: cellX,
          y: cellY,
          width: cellW,
          height: cellH,
        });
      }
    }
  }

  ctx.restore();
}
