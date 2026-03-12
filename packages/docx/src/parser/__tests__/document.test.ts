import { describe, it, expect } from 'vitest';
import { parseXml } from '@opendockit/core';
import { parseDocumentFromXml } from '../document.js';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function bodyXml(inner: string): string {
  return `<w:body ${NS}>${inner}</w:body>`;
}

describe('parseDocumentFromXml', () => {
  it('should parse a single paragraph into one section', () => {
    const body = parseXml(bodyXml('<w:p><w:r><w:t>Hello</w:t></w:r></w:p>'));
    const doc = parseDocumentFromXml(body);
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].paragraphs).toHaveLength(1);
    expect(doc.sections[0].paragraphs[0].runs[0].text).toBe('Hello');
  });

  it('should use default page dimensions when no sectPr', () => {
    const body = parseXml(bodyXml('<w:p><w:r><w:t>Hello</w:t></w:r></w:p>'));
    const doc = parseDocumentFromXml(body);
    // US Letter defaults
    expect(doc.sections[0].pageWidth).toBe(612);
    expect(doc.sections[0].pageHeight).toBe(792);
  });

  it('should parse final section properties from body-level sectPr', () => {
    const body = parseXml(
      bodyXml(
        '<w:p><w:r><w:t>Content</w:t></w:r></w:p>' +
          '<w:sectPr>' +
          '<w:pgSz w:w="11906" w:h="16838"/>' +
          '<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/>' +
          '</w:sectPr>'
      )
    );
    const doc = parseDocumentFromXml(body);
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].pageWidth).toBeCloseTo(595.3, 1); // A4
    expect(doc.sections[0].marginTop).toBe(36);
  });

  it('should split into sections based on mid-document sectPr', () => {
    const body = parseXml(
      bodyXml(
        // Section 1: paragraph with section break
        '<w:p>' +
          '<w:pPr><w:sectPr>' +
          '<w:pgSz w:w="12240" w:h="15840"/>' +
          '</w:sectPr></w:pPr>' +
          '<w:r><w:t>Section 1</w:t></w:r>' +
          '</w:p>' +
          // Section 2: paragraph with final section properties
          '<w:p><w:r><w:t>Section 2</w:t></w:r></w:p>' +
          '<w:sectPr>' +
          '<w:pgSz w:w="11906" w:h="16838"/>' +
          '</w:sectPr>'
      )
    );
    const doc = parseDocumentFromXml(body);
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[0].paragraphs[0].runs[0].text).toBe('Section 1');
    expect(doc.sections[0].pageWidth).toBe(612); // Letter
    expect(doc.sections[1].paragraphs[0].runs[0].text).toBe('Section 2');
    expect(doc.sections[1].pageWidth).toBeCloseTo(595.3, 1); // A4
  });

  it('should handle empty body with one default section', () => {
    const body = parseXml(bodyXml(''));
    const doc = parseDocumentFromXml(body);
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].paragraphs).toHaveLength(0);
  });

  it('should handle multiple paragraphs', () => {
    const body = parseXml(
      bodyXml(
        '<w:p><w:r><w:t>Para 1</w:t></w:r></w:p>' +
          '<w:p><w:r><w:t>Para 2</w:t></w:r></w:p>' +
          '<w:p><w:r><w:t>Para 3</w:t></w:r></w:p>'
      )
    );
    const doc = parseDocumentFromXml(body);
    expect(doc.sections[0].paragraphs).toHaveLength(3);
  });

  it('should parse styles when provided', () => {
    const body = parseXml(bodyXml('<w:p><w:r><w:t>Content</w:t></w:r></w:p>'));
    const styles = parseXml(
      `<w:styles ${NS}>` +
        '<w:style w:type="paragraph" w:styleId="Normal">' +
        '<w:name w:val="Normal"/>' +
        '</w:style>' +
        '</w:styles>'
    );
    const doc = parseDocumentFromXml(body, styles);
    expect(doc.styles.size).toBe(1);
    expect(doc.styles.get('Normal')?.name).toBe('Normal');
  });

  it('should parse doc defaults from styles', () => {
    const body = parseXml(bodyXml('<w:p><w:r><w:t>Content</w:t></w:r></w:p>'));
    const styles = parseXml(
      `<w:styles ${NS}>` +
        '<w:docDefaults>' +
        '<w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr></w:rPrDefault>' +
        '</w:docDefaults>' +
        '</w:styles>'
    );
    const doc = parseDocumentFromXml(body, styles);
    expect(doc.defaultStyle?.runProperties?.fontSize).toBe(11);
  });

  it('should have empty styles when no styles XML provided', () => {
    const body = parseXml(bodyXml('<w:p><w:r><w:t>Content</w:t></w:r></w:p>'));
    const doc = parseDocumentFromXml(body);
    expect(doc.styles.size).toBe(0);
    expect(doc.defaultStyle).toBeUndefined();
  });

  it('should parse tables into blocks array', () => {
    const body = parseXml(
      bodyXml(
        '<w:p><w:r><w:t>Before</w:t></w:r></w:p>' +
          '<w:tbl>' +
          '<w:tblGrid><w:gridCol w:w="4320"/></w:tblGrid>' +
          '<w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr>' +
          '</w:tbl>' +
          '<w:p><w:r><w:t>After</w:t></w:r></w:p>'
      )
    );
    const doc = parseDocumentFromXml(body);

    expect(doc.sections).toHaveLength(1);
    const section = doc.sections[0];

    // paragraphs array should only contain paragraphs (not table content)
    expect(section.paragraphs).toHaveLength(2);
    expect(section.paragraphs[0].runs[0].text).toBe('Before');
    expect(section.paragraphs[1].runs[0].text).toBe('After');

    // blocks array should have paragraph, table, paragraph
    expect(section.blocks).toHaveLength(3);
    expect(section.blocks[0].kind).toBe('paragraph');
    expect(section.blocks[1].kind).toBe('table');
    expect(section.blocks[2].kind).toBe('paragraph');

    // Verify table content
    const tableBlock = section.blocks[1];
    if (tableBlock.kind === 'table') {
      expect(tableBlock.table.rows).toHaveLength(1);
      expect(tableBlock.table.rows[0].cells[0].paragraphs[0].runs[0].text).toBe('Cell');
    }
  });

  it('should handle document with only a table', () => {
    const body = parseXml(
      bodyXml(
        '<w:tbl>' +
          '<w:tblGrid><w:gridCol w:w="2880"/></w:tblGrid>' +
          '<w:tr><w:tc><w:p/></w:tc></w:tr>' +
          '</w:tbl>'
      )
    );
    const doc = parseDocumentFromXml(body);

    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].paragraphs).toHaveLength(0);
    expect(doc.sections[0].blocks).toHaveLength(1);
    expect(doc.sections[0].blocks[0].kind).toBe('table');
  });
});
