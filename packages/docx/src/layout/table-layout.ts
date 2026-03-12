/**
 * Table layout engine for DOCX rendering.
 *
 * Handles column width resolution, row height calculation,
 * cell text layout, merged cells, and border rendering.
 *
 * Key concepts:
 * - Column widths come from `<w:tblGrid>` (in twips, already converted to pt)
 * - Cell text is laid out using the existing line breaker
 * - Row height = max cell content height in the row (respecting minHeight)
 * - Horizontal merges use `colSpan`; vertical merges use `vMerge`
 * - Cell borders override table borders (border collapse)
 *
 * All coordinates and dimensions are in typographic points (1/72").
 */

import type {
  TableIR,
  TableCellIR,
  BorderIR,
  BordersIR,
  CellMarginsIR,
} from '../model/document-ir.js';
import { breakParagraphIntoLines } from './line-breaker.js';
import type {
  TextMeasurer,
  LayoutLine,
  TableLayoutResult,
  LayoutTableRow,
  LayoutTableCell,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default cell margin left/right in points (115 twips). */
const DEFAULT_CELL_MARGIN_LR = 5.75;

/** Default cell margin top/bottom in points. */
const DEFAULT_CELL_MARGIN_TB = 0;

/** Default spacing after a table in points. */
export const DEFAULT_TABLE_SPACING_AFTER = 8;

/** Minimum row height when no content (one line of default text). */
const MIN_ROW_HEIGHT = 11 * 1.15; // 11pt * 1.15 line spacing

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Lay out a table within the given available width.
 *
 * @param table - The parsed table IR.
 * @param availableWidth - Available width for the table in points.
 * @param measurer - Text measurement provider.
 * @returns Complete table layout with positioned cells.
 */
export function layoutTable(
  table: TableIR,
  availableWidth: number,
  measurer: TextMeasurer
): TableLayoutResult {
  // 1. Resolve column widths
  const columnWidths = resolveColumnWidths(table, availableWidth);
  const tableWidth = columnWidths.reduce((s, w) => s + w, 0);

  // 2. Build vertical merge map
  const vMergeMap = buildVerticalMergeMap(table);

  // 3. Lay out each row
  const rows: LayoutTableRow[] = [];
  let y = 0;

  for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
    const rowIR = table.rows[rowIdx];
    const cells: LayoutTableCell[] = [];
    let maxCellHeight = rowIR.minHeight ?? MIN_ROW_HEIGHT;
    let colIdx = 0;

    for (const cellIR of rowIR.cells) {
      // Skip vMerge continue cells for height calculation
      const isVMergeContinue = cellIR.vMerge === 'continue';
      const colSpan = cellIR.colSpan;

      // Calculate cell width from column widths
      const cellWidth = sumColumnWidths(columnWidths, colIdx, colSpan);

      // Resolve cell margins
      const margins = resolveCellMargins(cellIR, table);

      // Available text width inside the cell
      const textWidth = Math.max(0, cellWidth - margins.left - margins.right);

      // Lay out cell text
      let lines: LayoutLine[] = [];
      let contentHeight = 0;

      if (!isVMergeContinue) {
        lines = layoutCellText(cellIR, textWidth, measurer);
        contentHeight = lines.reduce((sum, l) => sum + l.height, 0) + margins.top + margins.bottom;
      }

      // Resolve cell borders
      const borders = resolveCellBorders(
        cellIR,
        table,
        rowIdx,
        colIdx,
        table.rows.length,
        columnWidths.length
      );

      // Calculate cell X position
      const cellX = sumColumnWidths(columnWidths, 0, colIdx);

      // Resolve row span
      const rowSpan = isVMergeContinue ? 0 : getVerticalSpan(vMergeMap, rowIdx, colIdx);

      cells.push({
        colIndex: colIdx,
        colSpan,
        rowSpan,
        x: cellX,
        y: 0, // relative to row, set later
        width: cellWidth,
        height: contentHeight, // adjusted later for row height
        lines,
        borders,
      });

      if (!isVMergeContinue && contentHeight > maxCellHeight) {
        maxCellHeight = contentHeight;
      }

      colIdx += colSpan;
    }

    // Apply exact/minimum height
    const rowHeight = rowIR.exactHeight ? (rowIR.minHeight ?? maxCellHeight) : maxCellHeight;

    // Update cell heights to match row height
    for (const cell of cells) {
      cell.height = rowHeight;
      cell.y = y;
    }

    rows.push({
      height: rowHeight,
      y,
      cells,
    });

    y += rowHeight;
  }

  // Adjust heights for vertically merged cells
  adjustVerticalMergeHeights(rows, vMergeMap);

  return {
    width: tableWidth,
    height: y,
    columnWidths,
    rows,
  };
}

// ---------------------------------------------------------------------------
// Column width resolution
// ---------------------------------------------------------------------------

/**
 * Resolve column widths from the table grid.
 *
 * Uses gridCol values if available. If absent, distributes width evenly
 * across the number of columns inferred from the first row.
 */
function resolveColumnWidths(table: TableIR, availableWidth: number): number[] {
  if (table.gridColWidths.length > 0) {
    // Clamp total to available width if needed
    const total = table.gridColWidths.reduce((s, w) => s + w, 0);
    if (total > availableWidth && total > 0) {
      const scale = availableWidth / total;
      return table.gridColWidths.map((w) => w * scale);
    }
    return [...table.gridColWidths];
  }

  // No grid: infer column count from first row
  const numCols = inferColumnCount(table);
  if (numCols === 0) return [];

  const colWidth = availableWidth / numCols;
  return Array.from({ length: numCols }, () => colWidth);
}

/**
 * Infer the number of columns from the first row's cells and spans.
 */
function inferColumnCount(table: TableIR): number {
  if (table.rows.length === 0) return 0;
  let count = 0;
  for (const cell of table.rows[0].cells) {
    count += cell.colSpan;
  }
  return count;
}

/**
 * Sum column widths from startCol for span columns.
 */
function sumColumnWidths(widths: number[], startCol: number, span: number): number {
  let sum = 0;
  for (let i = startCol; i < Math.min(startCol + span, widths.length); i++) {
    sum += widths[i];
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Cell text layout
// ---------------------------------------------------------------------------

/**
 * Lay out all paragraphs within a cell.
 */
function layoutCellText(
  cell: TableCellIR,
  textWidth: number,
  measurer: TextMeasurer
): LayoutLine[] {
  const allLines: LayoutLine[] = [];
  let y = 0;

  for (const para of cell.paragraphs) {
    const lines = breakParagraphIntoLines(para, textWidth, measurer);

    for (const line of lines) {
      allLines.push({ ...line, y });
      y += line.height;
    }
  }

  return allLines;
}

// ---------------------------------------------------------------------------
// Cell margins
// ---------------------------------------------------------------------------

function resolveCellMargins(cell: TableCellIR, table: TableIR): CellMarginsIR {
  // Cell-level margins override table defaults
  if (cell.margins) return cell.margins;
  if (table.defaultCellMargins) return table.defaultCellMargins;

  return {
    top: DEFAULT_CELL_MARGIN_TB,
    bottom: DEFAULT_CELL_MARGIN_TB,
    left: DEFAULT_CELL_MARGIN_LR,
    right: DEFAULT_CELL_MARGIN_LR,
  };
}

// ---------------------------------------------------------------------------
// Border resolution (cell borders override table borders)
// ---------------------------------------------------------------------------

function resolveCellBorders(
  cell: TableCellIR,
  table: TableIR,
  rowIdx: number,
  colIdx: number,
  totalRows: number,
  totalCols: number
): { top?: BorderIR; bottom?: BorderIR; left?: BorderIR; right?: BorderIR } {
  const tableBorders = table.borders ?? {};
  const cellBorders = cell.borders ?? {};

  return {
    top:
      cellBorders.top ??
      resolveTableBorderForSide('top', tableBorders, rowIdx, colIdx, totalRows, totalCols),
    bottom:
      cellBorders.bottom ??
      resolveTableBorderForSide('bottom', tableBorders, rowIdx, colIdx, totalRows, totalCols),
    left:
      cellBorders.left ??
      resolveTableBorderForSide('left', tableBorders, rowIdx, colIdx, totalRows, totalCols),
    right:
      cellBorders.right ??
      resolveTableBorderForSide('right', tableBorders, rowIdx, colIdx, totalRows, totalCols),
  };
}

/**
 * Resolve which table-level border applies to a given cell side.
 *
 * - Edge cells get the table's outer border (top/bottom/left/right)
 * - Interior cells get insideH/insideV borders
 */
function resolveTableBorderForSide(
  side: 'top' | 'bottom' | 'left' | 'right',
  tableBorders: BordersIR,
  rowIdx: number,
  colIdx: number,
  totalRows: number,
  totalCols: number
): BorderIR | undefined {
  switch (side) {
    case 'top':
      return rowIdx === 0 ? tableBorders.top : tableBorders.insideH;
    case 'bottom':
      return rowIdx === totalRows - 1 ? tableBorders.bottom : tableBorders.insideH;
    case 'left':
      return colIdx === 0 ? tableBorders.left : tableBorders.insideV;
    case 'right':
      return colIdx === totalCols - 1 ? tableBorders.right : tableBorders.insideV;
  }
}

// ---------------------------------------------------------------------------
// Vertical merge tracking
// ---------------------------------------------------------------------------

/**
 * Map from "rowIdx:colIdx" to the number of rows this cell spans.
 * Only entries for cells that start a vertical merge (vMerge="restart") are included.
 */
type VerticalMergeMap = Map<string, number>;

function buildVerticalMergeMap(table: TableIR): VerticalMergeMap {
  const map: VerticalMergeMap = new Map();

  // For each column position, scan rows for vMerge restart/continue sequences
  if (table.rows.length === 0) return map;

  const numCols = table.gridColWidths.length || inferColumnCount(table);

  for (let col = 0; col < numCols; col++) {
    let mergeStartRow = -1;

    for (let row = 0; row < table.rows.length; row++) {
      const cell = getCellAtColumn(table.rows[row], col);
      if (!cell) continue;

      if (cell.vMerge === 'restart') {
        // Start a new merge
        if (mergeStartRow >= 0) {
          // Commit previous merge
          map.set(`${mergeStartRow}:${col}`, row - mergeStartRow);
        }
        mergeStartRow = row;
      } else if (cell.vMerge === 'continue') {
        // Continue existing merge — nothing to do
      } else {
        // No vMerge — commit any pending merge
        if (mergeStartRow >= 0) {
          map.set(`${mergeStartRow}:${col}`, row - mergeStartRow);
          mergeStartRow = -1;
        }
      }
    }

    // Commit final merge if it extends to the last row
    if (mergeStartRow >= 0) {
      map.set(`${mergeStartRow}:${col}`, table.rows.length - mergeStartRow);
    }
  }

  return map;
}

/**
 * Find the cell in a row that covers the given column index.
 */
function getCellAtColumn(row: { cells: TableCellIR[] }, colIdx: number): TableCellIR | undefined {
  let col = 0;
  for (const cell of row.cells) {
    if (col === colIdx) return cell;
    if (col > colIdx) return undefined;
    col += cell.colSpan;
  }
  return undefined;
}

/**
 * Get the vertical span for a cell at the given position.
 */
function getVerticalSpan(map: VerticalMergeMap, rowIdx: number, colIdx: number): number {
  return map.get(`${rowIdx}:${colIdx}`) ?? 1;
}

/**
 * Adjust cell heights for vertically merged cells to span multiple rows.
 */
function adjustVerticalMergeHeights(rows: LayoutTableRow[], vMergeMap: VerticalMergeMap): void {
  for (const [key, span] of vMergeMap) {
    if (span <= 1) continue;

    const [rowStr, colStr] = key.split(':');
    const startRow = parseInt(rowStr, 10);
    const colIdx = parseInt(colStr, 10);

    // Sum heights of all spanned rows
    let totalHeight = 0;
    for (let r = startRow; r < startRow + span && r < rows.length; r++) {
      totalHeight += rows[r].height;
    }

    // Find the cell in the start row and update its height
    for (const cell of rows[startRow].cells) {
      if (cell.colIndex === colIdx) {
        cell.height = totalHeight;
        cell.rowSpan = span;
        break;
      }
    }
  }
}
