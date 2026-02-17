/**
 * Table parser for DrawingML table elements.
 *
 * Parses `a:tbl` elements into {@link TableIR}, including table grid,
 * rows, cells, text bodies, fills, borders, and merge information.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 21.1.3.13 (CT_Table)
 */

import type { XmlElement } from '../../xml/index.js';
import type {
  ThemeIR,
  TableIR,
  TableRowIR,
  TableCellIR,
  TableCellBorders,
} from '../../ir/index.js';
import { parseIntAttr, parseBoolAttr } from '../../xml/index.js';
import { parseFill } from './fill.js';
import { parseLine } from './line.js';
import { parseTextBody } from './text-body.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a `<a:tbl>` element into a TableIR.
 *
 * Extracts the table grid (column widths), table properties (style),
 * and all rows with their cells.
 *
 * ```xml
 * <a:tbl>
 *   <a:tblPr firstRow="1" bandRow="1">
 *     <a:tblStyle val="{5C22544A-...}"/>
 *   </a:tblPr>
 *   <a:tblGrid>
 *     <a:gridCol w="3048000"/>
 *     <a:gridCol w="3048000"/>
 *   </a:tblGrid>
 *   <a:tr h="370840">...</a:tr>
 * </a:tbl>
 * ```
 */
export function parseTable(tblElement: XmlElement, theme: ThemeIR): TableIR {
  // Parse table properties
  const tblPr = tblElement.child('a:tblPr');
  let tableStyle: string | undefined;
  if (tblPr) {
    const tblStyleEl = tblPr.child('a:tblStyle');
    if (tblStyleEl) {
      tableStyle = tblStyleEl.attr('val');
    }
  }

  // Parse column widths from tblGrid
  const columnWidths: number[] = [];
  const tblGrid = tblElement.child('a:tblGrid');
  if (tblGrid) {
    for (const gridCol of tblGrid.allChildren('a:gridCol')) {
      const w = parseIntAttr(gridCol, 'w');
      columnWidths.push(w ?? 0);
    }
  }

  // Parse rows
  const rows = tblElement.allChildren('a:tr').map((tr) => parseTableRow(tr, theme));

  return {
    kind: 'table',
    properties: { effects: [] },
    rows,
    columnWidths: columnWidths.length > 0 ? columnWidths : undefined,
    tableStyle,
  };
}

/**
 * Parse a `<a:tr>` element into a TableRowIR.
 *
 * Extracts the row height and all cells.
 *
 * ```xml
 * <a:tr h="370840">
 *   <a:tc>...</a:tc>
 *   <a:tc gridSpan="2">...</a:tc>
 * </a:tr>
 * ```
 */
export function parseTableRow(trElement: XmlElement, theme: ThemeIR): TableRowIR {
  const height = parseIntAttr(trElement, 'h') ?? 0;
  const cells = trElement.allChildren('a:tc').map((tc) => parseTableCell(tc, theme));

  return {
    height,
    cells,
  };
}

/**
 * Parse a `<a:tc>` element into a TableCellIR.
 *
 * Extracts text body, fill, borders, and merge attributes.
 *
 * ```xml
 * <a:tc gridSpan="2" rowSpan="1" hMerge="1" vMerge="1">
 *   <a:txBody>...</a:txBody>
 *   <a:tcPr>
 *     <a:solidFill>...</a:solidFill>
 *     <a:lnL w="12700">...</a:lnL>
 *     <a:lnR>...</a:lnR>
 *     <a:lnT>...</a:lnT>
 *     <a:lnB>...</a:lnB>
 *   </a:tcPr>
 * </a:tc>
 * ```
 */
export function parseTableCell(tcElement: XmlElement, theme: ThemeIR): TableCellIR {
  const cell: TableCellIR = {};

  // Parse text body
  const txBody = tcElement.child('a:txBody');
  if (txBody) {
    cell.textBody = parseTextBody(txBody, theme);
  }

  // Parse cell properties
  const tcPr = tcElement.child('a:tcPr');
  if (tcPr) {
    // Cell fill
    const fill = parseFill(tcPr, theme);
    if (fill) {
      cell.fill = fill;
    }

    // Cell borders
    const borders = parseTableCellBorders(tcPr, theme);
    if (borders) {
      cell.borders = borders;
    }
  }

  // Merge attributes (on the <a:tc> element itself)
  const gridSpan = parseIntAttr(tcElement, 'gridSpan');
  if (gridSpan !== undefined && gridSpan > 1) {
    cell.gridSpan = gridSpan;
  }

  const rowSpan = parseIntAttr(tcElement, 'rowSpan');
  if (rowSpan !== undefined && rowSpan > 1) {
    cell.rowSpan = rowSpan;
  }

  const hMerge = parseBoolAttr(tcElement, 'hMerge');
  if (hMerge) {
    cell.hMerge = true;
  }

  const vMerge = parseBoolAttr(tcElement, 'vMerge');
  if (vMerge) {
    cell.vMerge = true;
  }

  return cell;
}

/**
 * Parse cell borders from a `<a:tcPr>` element.
 *
 * Looks for `a:lnL`, `a:lnR`, `a:lnT`, `a:lnB` children and parses
 * each as a {@link LineIR}.
 *
 * Returns `undefined` if no border elements are present.
 */
export function parseTableCellBorders(
  tcPrElement: XmlElement,
  theme: ThemeIR
): TableCellBorders | undefined {
  const lnL = tcPrElement.child('a:lnL');
  const lnR = tcPrElement.child('a:lnR');
  const lnT = tcPrElement.child('a:lnT');
  const lnB = tcPrElement.child('a:lnB');

  if (!lnL && !lnR && !lnT && !lnB) {
    return undefined;
  }

  const borders: TableCellBorders = {};

  if (lnL) {
    borders.left = parseLine(lnL, theme);
  }
  if (lnR) {
    borders.right = parseLine(lnR, theme);
  }
  if (lnT) {
    borders.top = parseLine(lnT, theme);
  }
  if (lnB) {
    borders.bottom = parseLine(lnB, theme);
  }

  return borders;
}
