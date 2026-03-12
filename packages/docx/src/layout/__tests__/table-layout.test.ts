import { describe, it, expect } from 'vitest';
import { layoutTable } from '../table-layout.js';
import type { TableIR, TableCellIR, TableRowIR, ParagraphIR } from '../../model/document-ir.js';
import type { TextMeasurer, TextMeasurement } from '../types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Fixed-width measurer: each character is 6pt wide, ascent=8pt, descent=2pt.
 * Font size doesn't affect width (simplifies test assertions).
 */
const fixedMeasurer: TextMeasurer = {
  measureText(text: string, _fontString: string): TextMeasurement {
    return {
      width: text.length * 6,
      ascent: 8,
      descent: 2,
    };
  },
};

function makeCell(text: string, overrides?: Partial<TableCellIR>): TableCellIR {
  return {
    paragraphs: [makePara(text)],
    colSpan: 1,
    ...overrides,
  };
}

function makePara(text: string, overrides?: Partial<ParagraphIR>): ParagraphIR {
  return {
    runs: text ? [{ text }] : [],
    ...overrides,
  };
}

function makeRow(cells: TableCellIR[], overrides?: Partial<TableRowIR>): TableRowIR {
  return { cells, ...overrides };
}

function makeTable(
  rows: TableRowIR[],
  gridColWidths: number[],
  overrides?: Partial<TableIR>
): TableIR {
  return {
    rows,
    gridColWidths,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('layoutTable', () => {
  describe('single cell table', () => {
    it('should layout a single cell with correct width and height', () => {
      const table = makeTable([makeRow([makeCell('Hello')])], [200]);

      const result = layoutTable(table, 468, fixedMeasurer);

      expect(result.width).toBe(200);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].cells).toHaveLength(1);

      const cell = result.rows[0].cells[0];
      expect(cell.width).toBe(200);
      expect(cell.x).toBe(0);
      expect(cell.colIndex).toBe(0);
      expect(cell.colSpan).toBe(1);
      expect(cell.rowSpan).toBe(1);
    });

    it('should have lines from the cell text', () => {
      const table = makeTable([makeRow([makeCell('Hello')])], [200]);

      const result = layoutTable(table, 468, fixedMeasurer);
      const cell = result.rows[0].cells[0];

      expect(cell.lines.length).toBeGreaterThan(0);
      expect(cell.lines[0].runs.length).toBeGreaterThan(0);
      expect(cell.lines[0].runs[0].text).toBe('Hello');
    });
  });

  describe('multi-column table', () => {
    it('should use column widths from tblGrid', () => {
      const table = makeTable(
        [makeRow([makeCell('A'), makeCell('B'), makeCell('C')])],
        [100, 150, 200]
      );

      const result = layoutTable(table, 468, fixedMeasurer);

      expect(result.columnWidths).toEqual([100, 150, 200]);
      expect(result.width).toBe(450);

      expect(result.rows[0].cells[0].x).toBe(0);
      expect(result.rows[0].cells[0].width).toBe(100);

      expect(result.rows[0].cells[1].x).toBe(100);
      expect(result.rows[0].cells[1].width).toBe(150);

      expect(result.rows[0].cells[2].x).toBe(250);
      expect(result.rows[0].cells[2].width).toBe(200);
    });
  });

  describe('auto-width columns', () => {
    it('should distribute evenly when no tblGrid', () => {
      const table = makeTable(
        [makeRow([makeCell('A'), makeCell('B')])],
        [] // no grid
      );

      const result = layoutTable(table, 400, fixedMeasurer);

      expect(result.columnWidths).toHaveLength(2);
      expect(result.columnWidths[0]).toBe(200);
      expect(result.columnWidths[1]).toBe(200);
      expect(result.width).toBe(400);
    });
  });

  describe('cell with multi-line text', () => {
    it('should expand row height for wrapping text', () => {
      // "A B C D E F G H I J" = many words that will wrap in a narrow column
      const longText = 'word1 word2 word3 word4 word5 word6';
      const table = makeTable(
        [makeRow([makeCell(longText), makeCell('Short')])],
        [50, 200] // first column is narrow — text will wrap
      );

      const result = layoutTable(table, 468, fixedMeasurer);
      const row = result.rows[0];

      // The narrow cell should have multiple lines
      const narrowCell = row.cells[0];
      expect(narrowCell.lines.length).toBeGreaterThan(1);

      // Row height should accommodate the tallest cell
      expect(row.height).toBeGreaterThan(0);
      // Both cells should have the same height (row height)
      expect(row.cells[0].height).toBe(row.cells[1].height);
    });
  });

  describe('horizontal merge', () => {
    it('should span cell across multiple columns', () => {
      const table = makeTable(
        [
          makeRow([makeCell('Merged', { colSpan: 2 }), makeCell('Normal')]),
          makeRow([makeCell('A'), makeCell('B'), makeCell('C')]),
        ],
        [100, 100, 100]
      );

      const result = layoutTable(table, 468, fixedMeasurer);

      // First row: merged cell should span 200pt
      const mergedCell = result.rows[0].cells[0];
      expect(mergedCell.colSpan).toBe(2);
      expect(mergedCell.width).toBe(200);
      expect(mergedCell.x).toBe(0);

      // Normal cell after merge
      const normalCell = result.rows[0].cells[1];
      expect(normalCell.x).toBe(200);
      expect(normalCell.width).toBe(100);
    });
  });

  describe('vertical merge', () => {
    it('should span cell across multiple rows', () => {
      const table = makeTable(
        [
          makeRow([makeCell('Merged', { vMerge: 'restart' }), makeCell('Row 1')]),
          makeRow([makeCell('', { vMerge: 'continue' }), makeCell('Row 2')]),
        ],
        [100, 200]
      );

      const result = layoutTable(table, 468, fixedMeasurer);

      expect(result.rows).toHaveLength(2);

      // The restart cell should have rowSpan > 1
      const mergedCell = result.rows[0].cells[0];
      expect(mergedCell.rowSpan).toBe(2);

      // Its height should span both rows
      const totalRowHeight = result.rows[0].height + result.rows[1].height;
      expect(mergedCell.height).toBe(totalRowHeight);
    });
  });

  describe('table borders', () => {
    it('should apply table-level borders to edge cells', () => {
      const table = makeTable(
        [makeRow([makeCell('A'), makeCell('B')]), makeRow([makeCell('C'), makeCell('D')])],
        [100, 100],
        {
          borders: {
            top: { width: 1, color: '000000', style: 'single' },
            bottom: { width: 1, color: '000000', style: 'single' },
            left: { width: 1, color: '000000', style: 'single' },
            right: { width: 1, color: '000000', style: 'single' },
            insideH: { width: 0.5, color: '888888', style: 'single' },
            insideV: { width: 0.5, color: '888888', style: 'single' },
          },
        }
      );

      const result = layoutTable(table, 468, fixedMeasurer);

      // Top-left cell: top and left are outer borders, bottom and right are inside
      const topLeft = result.rows[0].cells[0];
      expect(topLeft.borders.top?.width).toBe(1);
      expect(topLeft.borders.left?.width).toBe(1);
      expect(topLeft.borders.bottom?.width).toBe(0.5); // insideH
      expect(topLeft.borders.right?.width).toBe(0.5); // insideV

      // Bottom-right cell: bottom and right are outer borders
      const bottomRight = result.rows[1].cells[1];
      expect(bottomRight.borders.bottom?.width).toBe(1);
      expect(bottomRight.borders.right?.width).toBe(1);
      expect(bottomRight.borders.top?.width).toBe(0.5); // insideH
      expect(bottomRight.borders.left?.width).toBe(0.5); // insideV
    });

    it('should override table borders with cell borders', () => {
      const table = makeTable(
        [
          makeRow([
            makeCell('A', {
              borders: {
                top: { width: 3, color: 'FF0000', style: 'double' },
              },
            }),
          ]),
        ],
        [200],
        {
          borders: {
            top: { width: 1, color: '000000', style: 'single' },
          },
        }
      );

      const result = layoutTable(table, 468, fixedMeasurer);
      const cell = result.rows[0].cells[0];

      // Cell border should override table border
      expect(cell.borders.top?.width).toBe(3);
      expect(cell.borders.top?.color).toBe('FF0000');
    });
  });

  describe('table wider than page', () => {
    it('should clamp column widths to available width', () => {
      const table = makeTable(
        [makeRow([makeCell('A'), makeCell('B')])],
        [300, 300] // total 600pt, but only 400pt available
      );

      const result = layoutTable(table, 400, fixedMeasurer);

      expect(result.width).toBeCloseTo(400, 1);
      // Columns should be scaled proportionally
      expect(result.columnWidths[0]).toBeCloseTo(200, 1);
      expect(result.columnWidths[1]).toBeCloseTo(200, 1);
    });
  });

  describe('empty cells', () => {
    it('should have minimum height for empty cells', () => {
      const table = makeTable([makeRow([makeCell('')])], [200]);

      const result = layoutTable(table, 468, fixedMeasurer);

      expect(result.rows[0].height).toBeGreaterThan(0);
    });
  });

  describe('row minimum height', () => {
    it('should respect minHeight from row properties', () => {
      const table = makeTable([makeRow([makeCell('Short')], { minHeight: 100 })], [200]);

      const result = layoutTable(table, 468, fixedMeasurer);

      expect(result.rows[0].height).toBe(100);
    });

    it('should expand beyond minHeight if content is taller', () => {
      const longText = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10';
      const table = makeTable(
        [makeRow([makeCell(longText)], { minHeight: 5 })],
        [40] // very narrow — lots of wrapping
      );

      const result = layoutTable(table, 468, fixedMeasurer);

      expect(result.rows[0].height).toBeGreaterThan(5);
    });

    it('should use exact height when specified', () => {
      const table = makeTable(
        [makeRow([makeCell('Text')], { minHeight: 50, exactHeight: true })],
        [200]
      );

      const result = layoutTable(table, 468, fixedMeasurer);

      expect(result.rows[0].height).toBe(50);
    });
  });

  describe('multiple rows', () => {
    it('should stack rows vertically', () => {
      const table = makeTable(
        [makeRow([makeCell('Row 1')]), makeRow([makeCell('Row 2')]), makeRow([makeCell('Row 3')])],
        [200]
      );

      const result = layoutTable(table, 468, fixedMeasurer);

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].y).toBe(0);
      expect(result.rows[1].y).toBe(result.rows[0].height);
      expect(result.rows[2].y).toBe(result.rows[0].height + result.rows[1].height);

      // Total height should be sum of row heights
      const totalHeight = result.rows.reduce((s, r) => s + r.height, 0);
      expect(result.height).toBe(totalHeight);
    });
  });

  describe('table with no rows', () => {
    it('should return zero height for empty table', () => {
      const table = makeTable([], [100, 100]);

      const result = layoutTable(table, 468, fixedMeasurer);

      expect(result.height).toBe(0);
      expect(result.rows).toHaveLength(0);
    });
  });
});
