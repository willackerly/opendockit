/**
 * Unit tests for the table renderer.
 *
 * Uses the mock Canvas2D context to verify the correct Canvas2D API
 * call sequence for table rendering without requiring a real browser canvas.
 */

import { describe, it, expect } from 'vitest';
import type {
  TableIR,
  TableRowIR,
  TableCellIR,
  TransformIR,
  ShapePropertiesIR,
  SolidFillIR,
  LineIR,
  TextBodyIR,
} from '../../../ir/index.js';
import { renderTable } from '../table-renderer.js';
import { createMockRenderContext } from './mock-canvas.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTransform(overrides?: Partial<TransformIR>): TransformIR {
  return {
    position: { x: 914400, y: 914400 }, // 1 inch
    size: { width: 5486400, height: 1828800 }, // 6 inches x 2 inches
    ...overrides,
  };
}

function makeProperties(overrides?: Partial<ShapePropertiesIR>): ShapePropertiesIR {
  return {
    effects: [],
    ...overrides,
  };
}

const solidRed: SolidFillIR = {
  type: 'solid',
  color: { r: 255, g: 0, b: 0, a: 1 },
};

const solidBlue: SolidFillIR = {
  type: 'solid',
  color: { r: 0, g: 0, b: 255, a: 1 },
};

const blackBorder: LineIR = {
  color: { r: 0, g: 0, b: 0, a: 1 },
  width: 12700,
};

function simpleTextBody(text: string): TextBodyIR {
  return {
    paragraphs: [
      {
        runs: [
          {
            kind: 'run',
            text,
            properties: { fontSize: 1200 },
          },
        ],
        properties: {},
      },
    ],
    bodyProperties: {},
  };
}

function makeCell(overrides?: Partial<TableCellIR>): TableCellIR {
  return { ...overrides };
}

function makeRow(height: number, cells: TableCellIR[]): TableRowIR {
  return { height, cells };
}

function makeTable(
  rows: TableRowIR[],
  columnWidths?: number[],
  transformOverrides?: Partial<TransformIR>
): TableIR {
  return {
    kind: 'table',
    properties: makeProperties({ transform: makeTransform(transformOverrides) }),
    rows,
    columnWidths,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderTable', () => {
  it('renders a basic 2x2 table with cell fills', () => {
    const rctx = createMockRenderContext();
    const table = makeTable(
      [
        makeRow(914400, [makeCell({ fill: solidRed }), makeCell({ fill: solidBlue })]),
        makeRow(914400, [makeCell({ fill: solidBlue }), makeCell({ fill: solidRed })]),
      ],
      [2743200, 2743200] // 3 inches each
    );

    renderTable(table, rctx);

    const calls = rctx.ctx._calls;
    const methods = calls.map((c) => c.method);

    // Should save and restore context
    expect(methods[0]).toBe('save');
    expect(methods[methods.length - 1]).toBe('restore');

    // Should have fill calls for the 4 cells
    const fillCalls = calls.filter((c) => c.method === 'fill');
    expect(fillCalls).toHaveLength(4);
  });

  it('skips rendering when transform is missing', () => {
    const rctx = createMockRenderContext();
    const table: TableIR = {
      kind: 'table',
      properties: makeProperties({ transform: undefined }),
      rows: [makeRow(914400, [makeCell()])],
    };

    renderTable(table, rctx);

    expect(rctx.ctx._calls).toHaveLength(0);
  });

  it('skips rendering when table has no rows', () => {
    const rctx = createMockRenderContext();
    const table = makeTable([], [2743200, 2743200]);

    renderTable(table, rctx);

    expect(rctx.ctx._calls).toHaveLength(0);
  });

  it('draws cell borders', () => {
    const rctx = createMockRenderContext();
    const table = makeTable(
      [
        makeRow(914400, [
          makeCell({
            borders: {
              left: blackBorder,
              right: blackBorder,
              top: blackBorder,
              bottom: blackBorder,
            },
          }),
        ]),
      ],
      [5486400]
    );

    renderTable(table, rctx);

    const calls = rctx.ctx._calls;

    // Each border draws: beginPath, moveTo, lineTo, stroke = 4 calls per border
    // 4 borders x 4 calls = 16 border-related calls
    const strokeCalls = calls.filter((c) => c.method === 'stroke');
    expect(strokeCalls).toHaveLength(4); // one stroke per border line

    const moveToCalls = calls.filter((c) => c.method === 'moveTo');
    expect(moveToCalls).toHaveLength(4);

    const lineToCalls = calls.filter((c) => c.method === 'lineTo');
    expect(lineToCalls).toHaveLength(4);
  });

  it('renders text body in cells', () => {
    const rctx = createMockRenderContext();
    const table = makeTable(
      [
        makeRow(914400, [
          makeCell({ textBody: simpleTextBody('Hello') }),
          makeCell({ textBody: simpleTextBody('World') }),
        ]),
      ],
      [2743200, 2743200]
    );

    renderTable(table, rctx);

    const fillTextCalls = rctx.ctx._calls.filter((c) => c.method === 'fillText');
    // Should have at least 2 fillText calls (one per cell text)
    expect(fillTextCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('skips hMerge continuation cells', () => {
    const rctx = createMockRenderContext();
    const table = makeTable(
      [makeRow(914400, [makeCell({ fill: solidRed, gridSpan: 2 }), makeCell({ hMerge: true })])],
      [2743200, 2743200]
    );

    renderTable(table, rctx);

    // Only 1 fill call — the hMerge cell is skipped
    const fillCalls = rctx.ctx._calls.filter((c) => c.method === 'fill');
    expect(fillCalls).toHaveLength(1);
  });

  it('skips vMerge continuation cells', () => {
    const rctx = createMockRenderContext();
    const table = makeTable(
      [
        makeRow(914400, [makeCell({ fill: solidRed, rowSpan: 2 })]),
        makeRow(914400, [makeCell({ vMerge: true })]),
      ],
      [5486400]
    );

    renderTable(table, rctx);

    // Only 1 fill call — the vMerge cell is skipped
    const fillCalls = rctx.ctx._calls.filter((c) => c.method === 'fill');
    expect(fillCalls).toHaveLength(1);
  });

  it('does not fill when cell has no fill', () => {
    const rctx = createMockRenderContext();
    const table = makeTable([makeRow(914400, [makeCell()])], [5486400]);

    renderTable(table, rctx);

    const fillCalls = rctx.ctx._calls.filter((c) => c.method === 'fill');
    expect(fillCalls).toHaveLength(0);
  });

  it('does not fill when cell has noFill', () => {
    const rctx = createMockRenderContext();
    const table = makeTable([makeRow(914400, [makeCell({ fill: { type: 'none' } })])], [5486400]);

    renderTable(table, rctx);

    const fillCalls = rctx.ctx._calls.filter((c) => c.method === 'fill');
    expect(fillCalls).toHaveLength(0);
  });

  it('distributes columns equally when no columnWidths are provided', () => {
    const rctx = createMockRenderContext();
    const table = makeTable(
      [makeRow(914400, [makeCell({ fill: solidRed }), makeCell({ fill: solidBlue })])]
      // No columnWidths
    );

    renderTable(table, rctx);

    // Should still render both cells
    const fillCalls = rctx.ctx._calls.filter((c) => c.method === 'fill');
    expect(fillCalls).toHaveLength(2);

    // Verify rect calls: two cells, each should be half the table width
    const rectCalls = rctx.ctx._calls.filter((c) => c.method === 'rect');
    expect(rectCalls).toHaveLength(2);

    // At dpiScale=1: tableW = 5486400 EMU / 9525 = 576px
    // Each column = 288px
    const firstRectW = rectCalls[0].args[2] as number;
    const secondRectW = rectCalls[1].args[2] as number;
    expect(firstRectW).toBeCloseTo(secondRectW, 1);
  });

  it('handles gridSpan cell width correctly', () => {
    const rctx = createMockRenderContext();
    const table = makeTable(
      [makeRow(914400, [makeCell({ fill: solidRed, gridSpan: 2 }), makeCell({ hMerge: true })])],
      [2743200, 2743200] // Two equal columns
    );

    renderTable(table, rctx);

    // The spanning cell should have a rect with width = full table width
    const rectCalls = rctx.ctx._calls.filter((c) => c.method === 'rect');
    expect(rectCalls).toHaveLength(1);

    // At dpiScale=1: total table width = 5486400 EMU, each col = 2743200
    // gridSpan=2 means cell spans both columns = full width
    const cellRectW = rectCalls[0].args[2] as number;
    // Table width in px = 5486400 / 9525 = 576
    expect(cellRectW).toBeCloseTo(576, 0);
  });

  it('handles rowSpan cell height correctly', () => {
    const rctx = createMockRenderContext();
    const table = makeTable(
      [
        makeRow(914400, [makeCell({ fill: solidRed, rowSpan: 2 })]),
        makeRow(914400, [makeCell({ vMerge: true })]),
      ],
      [5486400]
    );

    renderTable(table, rctx);

    // The spanning cell should have a rect with height = both rows
    const rectCalls = rctx.ctx._calls.filter((c) => c.method === 'rect');
    expect(rectCalls).toHaveLength(1);

    const cellRectH = rectCalls[0].args[3] as number;
    // Table height = 1828800 EMU, total row EMU = 914400 + 914400 = 1828800
    // So each row is half the table height: 192/2 * 2 = 192
    // Full height in px = 1828800 / 9525 = ~192
    expect(cellRectH).toBeCloseTo(192, 0);
  });
});

// ---------------------------------------------------------------------------
// Integration with renderSlideElement
// ---------------------------------------------------------------------------

describe('renderTable via renderSlideElement', () => {
  it('dispatches table to the real table renderer (not placeholder)', async () => {
    // Import the shape renderer to test dispatch
    const { renderSlideElement } = await import('../shape-renderer.js');
    const rctx = createMockRenderContext();

    const table: TableIR = {
      kind: 'table',
      properties: makeProperties({ transform: makeTransform() }),
      rows: [makeRow(914400, [makeCell({ fill: solidRed }), makeCell({ fill: solidBlue })])],
      columnWidths: [2743200, 2743200],
    };

    renderSlideElement(table, rctx);

    const calls = rctx.ctx._calls;

    // Should NOT render the placeholder "Table" text label
    const fillTextCalls = calls.filter((c) => c.method === 'fillText' && c.args[0] === 'Table');
    expect(fillTextCalls).toHaveLength(0);

    // Should have actual fill calls for cell backgrounds
    const fillCalls = calls.filter((c) => c.method === 'fill');
    expect(fillCalls).toHaveLength(2);
  });
});
