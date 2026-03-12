import { describe, it, expect } from 'vitest';
import { parseXml } from '@opendockit/core';
import { parseTable } from '../table.js';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function tblXml(inner: string): string {
  return `<w:tbl ${NS}>${inner}</w:tbl>`;
}

describe('parseTable', () => {
  it('should parse grid column widths from w:tblGrid', () => {
    const tbl = parseXml(
      tblXml(
        '<w:tblGrid><w:gridCol w:w="2880"/><w:gridCol w:w="4320"/></w:tblGrid>' +
          '<w:tr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr>'
      )
    );

    const result = parseTable(tbl);

    // 2880 twips = 144pt, 4320 twips = 216pt
    expect(result.gridColWidths).toHaveLength(2);
    expect(result.gridColWidths[0]).toBeCloseTo(144, 0);
    expect(result.gridColWidths[1]).toBeCloseTo(216, 0);
  });

  it('should parse rows and cells', () => {
    const tbl = parseXml(
      tblXml(
        '<w:tblGrid><w:gridCol w:w="2880"/></w:tblGrid>' +
          '<w:tr><w:tc><w:p/></w:tc></w:tr>' +
          '<w:tr><w:tc><w:p/></w:tc></w:tr>'
      )
    );

    const result = parseTable(tbl);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].cells).toHaveLength(1);
    expect(result.rows[1].cells).toHaveLength(1);
  });

  it('should parse table borders', () => {
    const tbl = parseXml(
      tblXml(
        '<w:tblPr><w:tblBorders>' +
          '<w:top w:val="single" w:sz="8" w:color="FF0000"/>' +
          '<w:bottom w:val="single" w:sz="4" w:color="000000"/>' +
          '</w:tblBorders></w:tblPr>' +
          '<w:tblGrid><w:gridCol w:w="2880"/></w:tblGrid>' +
          '<w:tr><w:tc><w:p/></w:tc></w:tr>'
      )
    );

    const result = parseTable(tbl);

    expect(result.borders).toBeDefined();
    expect(result.borders!.top).toBeDefined();
    expect(result.borders!.top!.width).toBe(1); // 8/8 = 1pt
    expect(result.borders!.top!.color).toBe('FF0000');
    expect(result.borders!.bottom!.width).toBe(0.5); // 4/8 = 0.5pt
  });

  it('should parse cell gridSpan for horizontal merge', () => {
    const tbl = parseXml(
      tblXml(
        '<w:tblGrid><w:gridCol w:w="1440"/><w:gridCol w:w="1440"/><w:gridCol w:w="1440"/></w:tblGrid>' +
          '<w:tr>' +
          '<w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p/></w:tc>' +
          '<w:tc><w:p/></w:tc>' +
          '</w:tr>'
      )
    );

    const result = parseTable(tbl);

    expect(result.rows[0].cells[0].colSpan).toBe(2);
    expect(result.rows[0].cells[1].colSpan).toBe(1);
  });

  it('should parse vMerge for vertical merge', () => {
    const tbl = parseXml(
      tblXml(
        '<w:tblGrid><w:gridCol w:w="2880"/></w:tblGrid>' +
          '<w:tr><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p/></w:tc></w:tr>' +
          '<w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc></w:tr>'
      )
    );

    const result = parseTable(tbl);

    expect(result.rows[0].cells[0].vMerge).toBe('restart');
    expect(result.rows[1].cells[0].vMerge).toBe('continue');
  });

  it('should parse row height properties', () => {
    const tbl = parseXml(
      tblXml(
        '<w:tblGrid><w:gridCol w:w="2880"/></w:tblGrid>' +
          '<w:tr><w:trPr><w:trHeight w:val="720" w:hRule="exact"/></w:trPr>' +
          '<w:tc><w:p/></w:tc></w:tr>'
      )
    );

    const result = parseTable(tbl);

    expect(result.rows[0].minHeight).toBeCloseTo(36, 0); // 720 twips = 36pt
    expect(result.rows[0].exactHeight).toBe(true);
  });

  it('should parse table alignment', () => {
    const tbl = parseXml(
      tblXml(
        '<w:tblPr><w:jc w:val="center"/></w:tblPr>' +
          '<w:tblGrid><w:gridCol w:w="2880"/></w:tblGrid>' +
          '<w:tr><w:tc><w:p/></w:tc></w:tr>'
      )
    );

    const result = parseTable(tbl);
    expect(result.alignment).toBe('center');
  });

  it('should ignore nil/none borders', () => {
    const tbl = parseXml(
      tblXml(
        '<w:tblPr><w:tblBorders>' +
          '<w:top w:val="none"/>' +
          '<w:bottom w:val="nil"/>' +
          '</w:tblBorders></w:tblPr>' +
          '<w:tblGrid><w:gridCol w:w="2880"/></w:tblGrid>' +
          '<w:tr><w:tc><w:p/></w:tc></w:tr>'
      )
    );

    const result = parseTable(tbl);

    expect(result.borders?.top).toBeUndefined();
    expect(result.borders?.bottom).toBeUndefined();
  });

  it('should ensure cells always have at least one paragraph', () => {
    const tbl = parseXml(
      tblXml('<w:tblGrid><w:gridCol w:w="2880"/></w:tblGrid>' + '<w:tr><w:tc></w:tc></w:tr>')
    );

    const result = parseTable(tbl);

    expect(result.rows[0].cells[0].paragraphs).toHaveLength(1);
    expect(result.rows[0].cells[0].paragraphs[0].runs).toHaveLength(0);
  });

  it('should parse table width', () => {
    const tbl = parseXml(
      tblXml(
        '<w:tblPr><w:tblW w:w="9360" w:type="dxa"/></w:tblPr>' +
          '<w:tblGrid><w:gridCol w:w="4680"/><w:gridCol w:w="4680"/></w:tblGrid>' +
          '<w:tr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr>'
      )
    );

    const result = parseTable(tbl);

    expect(result.width).toBeCloseTo(468, 0); // 9360 twips = 468pt
  });

  it('should parse cell vertical alignment', () => {
    const tbl = parseXml(
      tblXml(
        '<w:tblGrid><w:gridCol w:w="2880"/></w:tblGrid>' +
          '<w:tr><w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr><w:p/></w:tc></w:tr>'
      )
    );

    const result = parseTable(tbl);

    expect(result.rows[0].cells[0].vAlign).toBe('center');
  });

  it('should parse cell text content', () => {
    const tbl = parseXml(
      tblXml(
        '<w:tblGrid><w:gridCol w:w="2880"/></w:tblGrid>' +
          '<w:tr><w:tc><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:tc></w:tr>'
      )
    );

    const result = parseTable(tbl);

    expect(result.rows[0].cells[0].paragraphs[0].runs[0].text).toBe('Hello');
  });
});
