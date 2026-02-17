/**
 * Unit tests for the DrawingML table parser.
 *
 * Tests parseTable, parseTableRow, parseTableCell, and
 * parseTableCellBorders with various XML configurations.
 */

import { describe, it, expect } from 'vitest';
import { parseTable, parseTableRow, parseTableCell, parseTableCellBorders } from '../table.js';
import { parseXml } from '../../../xml/index.js';
import type { ThemeIR } from '../../../ir/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Helper: minimal theme for color resolution
// ═══════════════════════════════════════════════════════════════════════════

function minimalTheme(): ThemeIR {
  return {
    name: 'Test Theme',
    colorScheme: {
      dk1: { r: 0, g: 0, b: 0, a: 1 },
      lt1: { r: 255, g: 255, b: 255, a: 1 },
      dk2: { r: 68, g: 84, b: 106, a: 1 },
      lt2: { r: 231, g: 230, b: 230, a: 1 },
      accent1: { r: 68, g: 114, b: 196, a: 1 },
      accent2: { r: 237, g: 125, b: 49, a: 1 },
      accent3: { r: 165, g: 165, b: 165, a: 1 },
      accent4: { r: 255, g: 192, b: 0, a: 1 },
      accent5: { r: 91, g: 155, b: 213, a: 1 },
      accent6: { r: 112, g: 173, b: 71, a: 1 },
      hlink: { r: 5, g: 99, b: 193, a: 1 },
      folHlink: { r: 149, g: 79, b: 114, a: 1 },
    },
    fontScheme: {
      majorLatin: 'Calibri Light',
      minorLatin: 'Calibri',
    },
    formatScheme: {
      fillStyles: [
        { type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } },
        { type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } },
        { type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } },
      ],
      lineStyles: [{}, {}, {}],
      effectStyles: [[], [], []],
      bgFillStyles: [
        { type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 } },
        { type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 } },
        { type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 } },
      ],
    },
  };
}

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';

// ═══════════════════════════════════════════════════════════════════════════
// parseTable tests
// ═══════════════════════════════════════════════════════════════════════════

describe('parseTable', () => {
  const theme = minimalTheme();

  it('parses a basic 2x2 table with column widths', () => {
    const xml = parseXml(`
      <a:tbl ${NS}>
        <a:tblPr firstRow="1" bandRow="1"/>
        <a:tblGrid>
          <a:gridCol w="3048000"/>
          <a:gridCol w="3048000"/>
        </a:tblGrid>
        <a:tr h="370840">
          <a:tc>
            <a:txBody>
              <a:bodyPr/>
              <a:p><a:r><a:t>A1</a:t></a:r></a:p>
            </a:txBody>
            <a:tcPr/>
          </a:tc>
          <a:tc>
            <a:txBody>
              <a:bodyPr/>
              <a:p><a:r><a:t>B1</a:t></a:r></a:p>
            </a:txBody>
            <a:tcPr/>
          </a:tc>
        </a:tr>
        <a:tr h="370840">
          <a:tc>
            <a:txBody>
              <a:bodyPr/>
              <a:p><a:r><a:t>A2</a:t></a:r></a:p>
            </a:txBody>
            <a:tcPr/>
          </a:tc>
          <a:tc>
            <a:txBody>
              <a:bodyPr/>
              <a:p><a:r><a:t>B2</a:t></a:r></a:p>
            </a:txBody>
            <a:tcPr/>
          </a:tc>
        </a:tr>
      </a:tbl>
    `);

    const table = parseTable(xml, theme);

    expect(table.kind).toBe('table');
    expect(table.rows).toHaveLength(2);
    expect(table.columnWidths).toEqual([3048000, 3048000]);

    // First row
    expect(table.rows[0].height).toBe(370840);
    expect(table.rows[0].cells).toHaveLength(2);
    expect(table.rows[0].cells[0].textBody).toBeDefined();
    expect(table.rows[0].cells[1].textBody).toBeDefined();

    // Second row
    expect(table.rows[1].height).toBe(370840);
    expect(table.rows[1].cells).toHaveLength(2);
  });

  it('parses table style GUID', () => {
    const xml = parseXml(`
      <a:tbl ${NS}>
        <a:tblPr>
          <a:tblStyle val="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>
        </a:tblPr>
        <a:tblGrid>
          <a:gridCol w="3048000"/>
        </a:tblGrid>
        <a:tr h="370840">
          <a:tc><a:tcPr/></a:tc>
        </a:tr>
      </a:tbl>
    `);

    const table = parseTable(xml, theme);
    expect(table.tableStyle).toBe('{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}');
  });

  it('handles missing tblGrid gracefully', () => {
    const xml = parseXml(`
      <a:tbl ${NS}>
        <a:tblPr/>
        <a:tr h="370840">
          <a:tc><a:tcPr/></a:tc>
        </a:tr>
      </a:tbl>
    `);

    const table = parseTable(xml, theme);
    expect(table.columnWidths).toBeUndefined();
    expect(table.rows).toHaveLength(1);
  });

  it('handles missing tblPr gracefully', () => {
    const xml = parseXml(`
      <a:tbl ${NS}>
        <a:tblGrid>
          <a:gridCol w="1000000"/>
        </a:tblGrid>
        <a:tr h="200000">
          <a:tc><a:tcPr/></a:tc>
        </a:tr>
      </a:tbl>
    `);

    const table = parseTable(xml, theme);
    expect(table.tableStyle).toBeUndefined();
    expect(table.rows).toHaveLength(1);
    expect(table.columnWidths).toEqual([1000000]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parseTableRow tests
// ═══════════════════════════════════════════════════════════════════════════

describe('parseTableRow', () => {
  const theme = minimalTheme();

  it('parses row height and cells', () => {
    const xml = parseXml(`
      <a:tr ${NS} h="500000">
        <a:tc>
          <a:txBody>
            <a:bodyPr/>
            <a:p><a:r><a:t>Cell 1</a:t></a:r></a:p>
          </a:txBody>
          <a:tcPr/>
        </a:tc>
        <a:tc>
          <a:txBody>
            <a:bodyPr/>
            <a:p><a:r><a:t>Cell 2</a:t></a:r></a:p>
          </a:txBody>
          <a:tcPr/>
        </a:tc>
      </a:tr>
    `);

    const row = parseTableRow(xml, theme);
    expect(row.height).toBe(500000);
    expect(row.cells).toHaveLength(2);
  });

  it('defaults height to 0 if missing', () => {
    const xml = parseXml(`
      <a:tr ${NS}>
        <a:tc><a:tcPr/></a:tc>
      </a:tr>
    `);

    const row = parseTableRow(xml, theme);
    expect(row.height).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parseTableCell tests
// ═══════════════════════════════════════════════════════════════════════════

describe('parseTableCell', () => {
  const theme = minimalTheme();

  it('parses text body', () => {
    const xml = parseXml(`
      <a:tc ${NS}>
        <a:txBody>
          <a:bodyPr/>
          <a:p><a:r><a:t>Hello</a:t></a:r></a:p>
        </a:txBody>
        <a:tcPr/>
      </a:tc>
    `);

    const cell = parseTableCell(xml, theme);
    expect(cell.textBody).toBeDefined();
    expect(cell.textBody!.paragraphs).toHaveLength(1);
  });

  it('parses cell fill (solid)', () => {
    const xml = parseXml(`
      <a:tc ${NS}>
        <a:tcPr>
          <a:solidFill>
            <a:srgbClr val="FF0000"/>
          </a:solidFill>
        </a:tcPr>
      </a:tc>
    `);

    const cell = parseTableCell(xml, theme);
    expect(cell.fill).toBeDefined();
    expect(cell.fill!.type).toBe('solid');
    if (cell.fill!.type === 'solid') {
      expect(cell.fill.color.r).toBe(255);
      expect(cell.fill.color.g).toBe(0);
      expect(cell.fill.color.b).toBe(0);
    }
  });

  it('parses gridSpan for horizontal merge', () => {
    const xml = parseXml(`
      <a:tc ${NS} gridSpan="3">
        <a:txBody>
          <a:bodyPr/>
          <a:p><a:r><a:t>Merged</a:t></a:r></a:p>
        </a:txBody>
        <a:tcPr/>
      </a:tc>
    `);

    const cell = parseTableCell(xml, theme);
    expect(cell.gridSpan).toBe(3);
  });

  it('parses rowSpan for vertical merge', () => {
    const xml = parseXml(`
      <a:tc ${NS} rowSpan="2">
        <a:txBody>
          <a:bodyPr/>
          <a:p><a:r><a:t>Vertical</a:t></a:r></a:p>
        </a:txBody>
        <a:tcPr/>
      </a:tc>
    `);

    const cell = parseTableCell(xml, theme);
    expect(cell.rowSpan).toBe(2);
  });

  it('parses hMerge continuation cell', () => {
    const xml = parseXml(`
      <a:tc ${NS} hMerge="1">
        <a:tcPr/>
      </a:tc>
    `);

    const cell = parseTableCell(xml, theme);
    expect(cell.hMerge).toBe(true);
  });

  it('parses vMerge continuation cell', () => {
    const xml = parseXml(`
      <a:tc ${NS} vMerge="1">
        <a:tcPr/>
      </a:tc>
    `);

    const cell = parseTableCell(xml, theme);
    expect(cell.vMerge).toBe(true);
  });

  it('does not set gridSpan when value is 1', () => {
    const xml = parseXml(`
      <a:tc ${NS} gridSpan="1">
        <a:tcPr/>
      </a:tc>
    `);

    const cell = parseTableCell(xml, theme);
    expect(cell.gridSpan).toBeUndefined();
  });

  it('handles cell without text body', () => {
    const xml = parseXml(`
      <a:tc ${NS}>
        <a:tcPr/>
      </a:tc>
    `);

    const cell = parseTableCell(xml, theme);
    expect(cell.textBody).toBeUndefined();
  });

  it('handles cell without tcPr', () => {
    const xml = parseXml(`
      <a:tc ${NS}>
        <a:txBody>
          <a:bodyPr/>
          <a:p><a:r><a:t>No props</a:t></a:r></a:p>
        </a:txBody>
      </a:tc>
    `);

    const cell = parseTableCell(xml, theme);
    expect(cell.textBody).toBeDefined();
    expect(cell.fill).toBeUndefined();
    expect(cell.borders).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parseTableCellBorders tests
// ═══════════════════════════════════════════════════════════════════════════

describe('parseTableCellBorders', () => {
  const theme = minimalTheme();

  it('parses all four borders', () => {
    const xml = parseXml(`
      <a:tcPr ${NS}>
        <a:lnL w="12700">
          <a:solidFill><a:srgbClr val="000000"/></a:solidFill>
        </a:lnL>
        <a:lnR w="12700">
          <a:solidFill><a:srgbClr val="000000"/></a:solidFill>
        </a:lnR>
        <a:lnT w="12700">
          <a:solidFill><a:srgbClr val="000000"/></a:solidFill>
        </a:lnT>
        <a:lnB w="12700">
          <a:solidFill><a:srgbClr val="000000"/></a:solidFill>
        </a:lnB>
      </a:tcPr>
    `);

    const borders = parseTableCellBorders(xml, theme);
    expect(borders).toBeDefined();
    expect(borders!.left).toBeDefined();
    expect(borders!.right).toBeDefined();
    expect(borders!.top).toBeDefined();
    expect(borders!.bottom).toBeDefined();

    expect(borders!.left!.width).toBe(12700);
    expect(borders!.left!.color).toBeDefined();
    expect(borders!.left!.color!.r).toBe(0);
    expect(borders!.left!.color!.g).toBe(0);
    expect(borders!.left!.color!.b).toBe(0);
  });

  it('parses partial borders (only top and bottom)', () => {
    const xml = parseXml(`
      <a:tcPr ${NS}>
        <a:lnT w="25400">
          <a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>
        </a:lnT>
        <a:lnB w="25400">
          <a:solidFill><a:srgbClr val="0000FF"/></a:solidFill>
        </a:lnB>
      </a:tcPr>
    `);

    const borders = parseTableCellBorders(xml, theme);
    expect(borders).toBeDefined();
    expect(borders!.left).toBeUndefined();
    expect(borders!.right).toBeUndefined();
    expect(borders!.top).toBeDefined();
    expect(borders!.bottom).toBeDefined();

    expect(borders!.top!.width).toBe(25400);
    expect(borders!.top!.color!.r).toBe(255);
    expect(borders!.bottom!.color!.b).toBe(255);
  });

  it('returns undefined when no border elements are present', () => {
    const xml = parseXml(`
      <a:tcPr ${NS}>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
      </a:tcPr>
    `);

    const borders = parseTableCellBorders(xml, theme);
    expect(borders).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Integration: merged cells in a full table
// ═══════════════════════════════════════════════════════════════════════════

describe('parseTable with merged cells', () => {
  const theme = minimalTheme();

  it('parses table with gridSpan and hMerge continuation cells', () => {
    const xml = parseXml(`
      <a:tbl ${NS}>
        <a:tblPr/>
        <a:tblGrid>
          <a:gridCol w="1000000"/>
          <a:gridCol w="1000000"/>
          <a:gridCol w="1000000"/>
        </a:tblGrid>
        <a:tr h="300000">
          <a:tc gridSpan="2">
            <a:txBody>
              <a:bodyPr/>
              <a:p><a:r><a:t>Merged A1-B1</a:t></a:r></a:p>
            </a:txBody>
            <a:tcPr/>
          </a:tc>
          <a:tc hMerge="1">
            <a:tcPr/>
          </a:tc>
          <a:tc>
            <a:txBody>
              <a:bodyPr/>
              <a:p><a:r><a:t>C1</a:t></a:r></a:p>
            </a:txBody>
            <a:tcPr/>
          </a:tc>
        </a:tr>
      </a:tbl>
    `);

    const table = parseTable(xml, theme);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].cells).toHaveLength(3);

    // First cell spans 2 columns
    expect(table.rows[0].cells[0].gridSpan).toBe(2);
    expect(table.rows[0].cells[0].textBody).toBeDefined();

    // Second cell is a continuation
    expect(table.rows[0].cells[1].hMerge).toBe(true);

    // Third cell is normal
    expect(table.rows[0].cells[2].gridSpan).toBeUndefined();
    expect(table.rows[0].cells[2].textBody).toBeDefined();
  });

  it('parses table with rowSpan and vMerge continuation cells', () => {
    const xml = parseXml(`
      <a:tbl ${NS}>
        <a:tblPr/>
        <a:tblGrid>
          <a:gridCol w="2000000"/>
          <a:gridCol w="2000000"/>
        </a:tblGrid>
        <a:tr h="300000">
          <a:tc rowSpan="2">
            <a:txBody>
              <a:bodyPr/>
              <a:p><a:r><a:t>Spans 2 rows</a:t></a:r></a:p>
            </a:txBody>
            <a:tcPr/>
          </a:tc>
          <a:tc>
            <a:txBody>
              <a:bodyPr/>
              <a:p><a:r><a:t>B1</a:t></a:r></a:p>
            </a:txBody>
            <a:tcPr/>
          </a:tc>
        </a:tr>
        <a:tr h="300000">
          <a:tc vMerge="1">
            <a:tcPr/>
          </a:tc>
          <a:tc>
            <a:txBody>
              <a:bodyPr/>
              <a:p><a:r><a:t>B2</a:t></a:r></a:p>
            </a:txBody>
            <a:tcPr/>
          </a:tc>
        </a:tr>
      </a:tbl>
    `);

    const table = parseTable(xml, theme);
    expect(table.rows).toHaveLength(2);

    // First row, first cell spans 2 rows
    expect(table.rows[0].cells[0].rowSpan).toBe(2);

    // Second row, first cell is a continuation
    expect(table.rows[1].cells[0].vMerge).toBe(true);
  });
});
