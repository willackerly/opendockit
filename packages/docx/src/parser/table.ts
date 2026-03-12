/**
 * Table parser — extracts structure and formatting from `<w:tbl>` elements.
 *
 * Parses table properties, grid column widths, rows, cells, and cell
 * properties including borders, margins, and merge information.
 *
 * Reference: ECMA-376, Part 1, Section 17.4 (Tables).
 */

import type { XmlElement } from '@opendockit/core';
import { dxaToPt } from '@opendockit/core';
import type {
  TableIR,
  TableRowIR,
  TableCellIR,
  BorderIR,
  BordersIR,
  CellMarginsIR,
} from '../model/document-ir.js';
import { parseParagraph } from './paragraph.js';

/** Default cell margin in points (115 twips ≈ 5.75pt). */
const DEFAULT_CELL_MARGIN_LR = dxaToPt(115);

/** Default cell margin top/bottom in points (0 twips). */
const DEFAULT_CELL_MARGIN_TB = 0;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a `<w:tbl>` element into a {@link TableIR}.
 */
export function parseTable(tblEl: XmlElement): TableIR {
  const table: TableIR = {
    rows: [],
    gridColWidths: [],
  };

  // Parse table properties
  const tblPr = tblEl.child('w:tblPr');
  if (tblPr !== undefined) {
    parseTableProperties(tblPr, table);
  }

  // Parse grid column definitions
  const tblGrid = tblEl.child('w:tblGrid');
  if (tblGrid !== undefined) {
    table.gridColWidths = parseTableGrid(tblGrid);
  }

  // Parse rows
  for (const child of tblEl.children) {
    if (child.is('w:tr')) {
      table.rows.push(parseTableRow(child, table));
    }
  }

  // Resolve horizontal merge spans
  resolveHorizontalMerges(table);

  return table;
}

// ---------------------------------------------------------------------------
// Table properties
// ---------------------------------------------------------------------------

function parseTableProperties(tblPr: XmlElement, table: TableIR): void {
  // Table width: <w:tblW w:w="5000" w:type="pct|dxa|auto"/>
  const tblW = tblPr.child('w:tblW');
  if (tblW !== undefined) {
    const wVal = tblW.attr('w:w');
    const wType = tblW.attr('w:type');
    if (wVal !== undefined) {
      const num = parseInt(wVal, 10);
      if (!Number.isNaN(num) && (wType === 'dxa' || wType === undefined)) {
        table.width = dxaToPt(num);
      }
      // Percentage widths are resolved at layout time
    }
  }

  // Table alignment: <w:jc w:val="center"/>
  const jc = tblPr.child('w:jc');
  if (jc !== undefined) {
    const val = jc.attr('w:val');
    if (val === 'center') table.alignment = 'center';
    else if (val === 'right' || val === 'end') table.alignment = 'right';
    else table.alignment = 'left';
  }

  // Table borders: <w:tblBorders>
  const tblBorders = tblPr.child('w:tblBorders');
  if (tblBorders !== undefined) {
    table.borders = parseBorders(tblBorders);
  }

  // Default cell margins: <w:tblCellMar>
  const tblCellMar = tblPr.child('w:tblCellMar');
  if (tblCellMar !== undefined) {
    table.defaultCellMargins = parseCellMargins(tblCellMar);
  }
}

// ---------------------------------------------------------------------------
// Table grid
// ---------------------------------------------------------------------------

function parseTableGrid(tblGrid: XmlElement): number[] {
  const widths: number[] = [];
  for (const child of tblGrid.children) {
    if (child.is('w:gridCol')) {
      const wVal = child.attr('w:w');
      if (wVal !== undefined) {
        const dxa = parseInt(wVal, 10);
        if (!Number.isNaN(dxa)) {
          widths.push(dxaToPt(dxa));
        }
      }
    }
  }
  return widths;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function parseTableRow(trEl: XmlElement, table: TableIR): TableRowIR {
  const row: TableRowIR = { cells: [] };

  // Row properties: <w:trPr>
  const trPr = trEl.child('w:trPr');
  if (trPr !== undefined) {
    parseRowProperties(trPr, row);
  }

  // Parse cells
  for (const child of trEl.children) {
    if (child.is('w:tc')) {
      row.cells.push(parseTableCell(child, table));
    }
  }

  return row;
}

function parseRowProperties(trPr: XmlElement, row: TableRowIR): void {
  // Row height: <w:trHeight w:val="720" w:hRule="exact|atLeast|auto"/>
  const trHeight = trPr.child('w:trHeight');
  if (trHeight !== undefined) {
    const val = trHeight.attr('w:val');
    if (val !== undefined) {
      const dxa = parseInt(val, 10);
      if (!Number.isNaN(dxa)) {
        row.minHeight = dxaToPt(dxa);
        row.exactHeight = trHeight.attr('w:hRule') === 'exact';
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

function parseTableCell(tcEl: XmlElement, _table: TableIR): TableCellIR {
  const cell: TableCellIR = {
    paragraphs: [],
    colSpan: 1,
  };

  // Cell properties: <w:tcPr>
  const tcPr = tcEl.child('w:tcPr');
  if (tcPr !== undefined) {
    parseCellProperties(tcPr, cell);
  }

  // Parse paragraphs within the cell
  for (const child of tcEl.children) {
    if (child.is('w:p')) {
      cell.paragraphs.push(parseParagraph(child));
    }
  }

  // Ensure at least one empty paragraph (Word requires this)
  if (cell.paragraphs.length === 0) {
    cell.paragraphs.push({ runs: [] });
  }

  return cell;
}

function parseCellProperties(tcPr: XmlElement, cell: TableCellIR): void {
  // Cell width: <w:tcW w:w="2400" w:type="dxa"/>
  const tcW = tcPr.child('w:tcW');
  if (tcW !== undefined) {
    const wVal = tcW.attr('w:w');
    const wType = tcW.attr('w:type');
    if (wVal !== undefined) {
      const num = parseInt(wVal, 10);
      if (!Number.isNaN(num) && (wType === 'dxa' || wType === undefined)) {
        cell.width = dxaToPt(num);
      }
    }
  }

  // Horizontal merge: <w:hMerge w:val="restart|continue"/>
  // Also: <w:gridSpan w:val="2"/>
  const gridSpan = tcPr.child('w:gridSpan');
  if (gridSpan !== undefined) {
    const val = gridSpan.attr('w:val');
    if (val !== undefined) {
      const span = parseInt(val, 10);
      if (!Number.isNaN(span) && span > 0) {
        cell.colSpan = span;
      }
    }
  }

  const hMerge = tcPr.child('w:hMerge');
  if (hMerge !== undefined) {
    const val = hMerge.attr('w:val');
    cell.hMerge = val === 'continue' ? 'continue' : 'restart';
  }

  // Vertical merge: <w:vMerge w:val="restart|continue"/>
  const vMerge = tcPr.child('w:vMerge');
  if (vMerge !== undefined) {
    const val = vMerge.attr('w:val');
    // If w:vMerge is present with no val or val="continue", it continues a merge
    cell.vMerge = val === 'restart' ? 'restart' : 'continue';
  }

  // Cell borders: <w:tcBorders>
  const tcBorders = tcPr.child('w:tcBorders');
  if (tcBorders !== undefined) {
    cell.borders = parseBorders(tcBorders);
  }

  // Cell margins: <w:tcMar>
  const tcMar = tcPr.child('w:tcMar');
  if (tcMar !== undefined) {
    cell.margins = parseCellMargins(tcMar);
  }

  // Vertical alignment: <w:vAlign w:val="center"/>
  const vAlign = tcPr.child('w:vAlign');
  if (vAlign !== undefined) {
    const val = vAlign.attr('w:val');
    if (val === 'center') cell.vAlign = 'center';
    else if (val === 'bottom') cell.vAlign = 'bottom';
    else cell.vAlign = 'top';
  }
}

// ---------------------------------------------------------------------------
// Borders
// ---------------------------------------------------------------------------

function parseBorders(bordersEl: XmlElement): BordersIR {
  const borders: BordersIR = {};
  for (const side of ['top', 'bottom', 'left', 'right', 'insideH', 'insideV'] as const) {
    const sideEl = bordersEl.child(`w:${side}`);
    if (sideEl !== undefined) {
      const border = parseSingleBorder(sideEl);
      if (border !== undefined) {
        borders[side] = border;
      }
    }
  }
  return borders;
}

function parseSingleBorder(borderEl: XmlElement): BorderIR | undefined {
  const style = borderEl.attr('w:val');
  if (style === undefined || style === 'none' || style === 'nil') {
    return undefined;
  }

  // Border size is in eighths of a point
  const sz = borderEl.attr('w:sz');
  let width = 0.5; // default thin border
  if (sz !== undefined) {
    const eighths = parseInt(sz, 10);
    if (!Number.isNaN(eighths)) {
      width = eighths / 8;
    }
  }

  const color = borderEl.attr('w:color') ?? '000000';

  return { width, color, style };
}

// ---------------------------------------------------------------------------
// Cell margins
// ---------------------------------------------------------------------------

function parseCellMargins(marEl: XmlElement): CellMarginsIR {
  const margins: CellMarginsIR = {
    top: DEFAULT_CELL_MARGIN_TB,
    bottom: DEFAULT_CELL_MARGIN_TB,
    left: DEFAULT_CELL_MARGIN_LR,
    right: DEFAULT_CELL_MARGIN_LR,
  };

  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    // Cell margins use w:start/w:end in newer OOXML
    const sideEl =
      marEl.child(`w:${side}`) ??
      (side === 'left' ? marEl.child('w:start') : undefined) ??
      (side === 'right' ? marEl.child('w:end') : undefined);
    if (sideEl !== undefined) {
      const wVal = sideEl.attr('w:w');
      if (wVal !== undefined) {
        const dxa = parseInt(wVal, 10);
        if (!Number.isNaN(dxa)) {
          margins[side] = dxaToPt(dxa);
        }
      }
    }
  }

  return margins;
}

// ---------------------------------------------------------------------------
// Merge resolution
// ---------------------------------------------------------------------------

/**
 * Resolve hMerge markers into colSpan values.
 * When cells use hMerge="restart"/"continue" instead of gridSpan,
 * count continue cells and set the colSpan on the restart cell.
 */
function resolveHorizontalMerges(table: TableIR): void {
  for (const row of table.rows) {
    for (let i = 0; i < row.cells.length; i++) {
      const cell = row.cells[i];
      if (cell.hMerge === 'restart') {
        let span = 1;
        for (let j = i + 1; j < row.cells.length; j++) {
          if (row.cells[j].hMerge === 'continue') {
            span++;
          } else {
            break;
          }
        }
        cell.colSpan = span;
      }
    }
  }
}
