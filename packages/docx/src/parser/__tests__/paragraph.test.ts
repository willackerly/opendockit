import { describe, it, expect } from 'vitest';
import { parseXml } from '@opendockit/core';
import { parseParagraph } from '../paragraph.js';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function paraXml(inner: string): string {
  return `<w:p ${NS}>${inner}</w:p>`;
}

describe('parseParagraph', () => {
  it('should parse a paragraph with a single run', () => {
    const el = parseXml(paraXml('<w:r><w:t>Hello</w:t></w:r>'));
    const para = parseParagraph(el);
    expect(para.runs).toHaveLength(1);
    expect(para.runs[0].text).toBe('Hello');
  });

  it('should parse a paragraph with multiple runs', () => {
    const el = parseXml(paraXml('<w:r><w:t>Hello </w:t></w:r><w:r><w:t>World</w:t></w:r>'));
    const para = parseParagraph(el);
    expect(para.runs).toHaveLength(2);
    expect(para.runs[0].text).toBe('Hello ');
    expect(para.runs[1].text).toBe('World');
  });

  it('should parse an empty paragraph', () => {
    const el = parseXml(paraXml(''));
    const para = parseParagraph(el);
    expect(para.runs).toHaveLength(0);
  });

  it('should parse center alignment', () => {
    const el = parseXml(
      paraXml('<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Centered</w:t></w:r>')
    );
    const para = parseParagraph(el);
    expect(para.alignment).toBe('center');
  });

  it('should parse right alignment', () => {
    const el = parseXml(paraXml('<w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>Right</w:t></w:r>'));
    const para = parseParagraph(el);
    expect(para.alignment).toBe('right');
  });

  it('should parse justify alignment from "both"', () => {
    const el = parseXml(
      paraXml('<w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:t>Justified</w:t></w:r>')
    );
    const para = parseParagraph(el);
    expect(para.alignment).toBe('justify');
  });

  it('should map "start" alignment to "left"', () => {
    const el = parseXml(paraXml('<w:pPr><w:jc w:val="start"/></w:pPr><w:r><w:t>Start</w:t></w:r>'));
    const para = parseParagraph(el);
    expect(para.alignment).toBe('left');
  });

  it('should map "end" alignment to "right"', () => {
    const el = parseXml(paraXml('<w:pPr><w:jc w:val="end"/></w:pPr><w:r><w:t>End</w:t></w:r>'));
    const para = parseParagraph(el);
    expect(para.alignment).toBe('right');
  });

  it('should parse spacing before and after in DXA', () => {
    // 240 DXA = 12pt, 120 DXA = 6pt
    const el = parseXml(
      paraXml(
        '<w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>' + '<w:r><w:t>Spaced</w:t></w:r>'
      )
    );
    const para = parseParagraph(el);
    expect(para.spacingBefore).toBe(12);
    expect(para.spacingAfter).toBe(6);
  });

  it('should parse auto line spacing (240 = 1.0x)', () => {
    const el = parseXml(
      paraXml(
        '<w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr>' +
          '<w:r><w:t>Single</w:t></w:r>'
      )
    );
    const para = parseParagraph(el);
    expect(para.lineSpacing).toBe(1.0);
  });

  it('should parse 1.5x line spacing (360 auto = 1.5x)', () => {
    const el = parseXml(
      paraXml(
        '<w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr>' + '<w:r><w:t>1.5x</w:t></w:r>'
      )
    );
    const para = parseParagraph(el);
    expect(para.lineSpacing).toBe(1.5);
  });

  it('should parse double line spacing (480 auto = 2.0x)', () => {
    const el = parseXml(
      paraXml(
        '<w:pPr><w:spacing w:line="480" w:lineRule="auto"/></w:pPr>' +
          '<w:r><w:t>Double</w:t></w:r>'
      )
    );
    const para = parseParagraph(el);
    expect(para.lineSpacing).toBe(2.0);
  });

  it('should default to auto lineRule when not specified', () => {
    const el = parseXml(
      paraXml('<w:pPr><w:spacing w:line="276"/></w:pPr>' + '<w:r><w:t>Default auto</w:t></w:r>')
    );
    const para = parseParagraph(el);
    expect(para.lineSpacing).toBeCloseTo(1.15, 2);
  });

  it('should parse left indentation in DXA', () => {
    // 720 DXA = 36pt (0.5 inch)
    const el = parseXml(
      paraXml('<w:pPr><w:ind w:left="720"/></w:pPr>' + '<w:r><w:t>Indented</w:t></w:r>')
    );
    const para = parseParagraph(el);
    expect(para.indentLeft).toBe(36);
  });

  it('should parse right indentation in DXA', () => {
    const el = parseXml(
      paraXml('<w:pPr><w:ind w:right="360"/></w:pPr>' + '<w:r><w:t>Right indent</w:t></w:r>')
    );
    const para = parseParagraph(el);
    expect(para.indentRight).toBe(18);
  });

  it('should parse first-line indent', () => {
    const el = parseXml(
      paraXml('<w:pPr><w:ind w:firstLine="360"/></w:pPr>' + '<w:r><w:t>First line</w:t></w:r>')
    );
    const para = parseParagraph(el);
    expect(para.indentFirstLine).toBe(18);
  });

  it('should parse hanging indent as negative first-line indent', () => {
    const el = parseXml(
      paraXml('<w:pPr><w:ind w:hanging="360"/></w:pPr>' + '<w:r><w:t>Hanging</w:t></w:r>')
    );
    const para = parseParagraph(el);
    expect(para.indentFirstLine).toBe(-18);
  });

  it('should parse w:start as alias for w:left', () => {
    const el = parseXml(
      paraXml('<w:pPr><w:ind w:start="720"/></w:pPr>' + '<w:r><w:t>Start indent</w:t></w:r>')
    );
    const para = parseParagraph(el);
    expect(para.indentLeft).toBe(36);
  });

  it('should parse style reference', () => {
    const el = parseXml(
      paraXml('<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' + '<w:r><w:t>Heading</w:t></w:r>')
    );
    const para = parseParagraph(el);
    expect(para.styleId).toBe('Heading1');
  });

  it('should parse numbering with bullet character', () => {
    const el = parseXml(
      paraXml(
        '<w:pPr><w:numPr>' +
          '<w:ilvl w:val="0"/>' +
          '<w:numId w:val="1"/>' +
          '</w:numPr></w:pPr>' +
          '<w:r><w:t>Bulleted item</w:t></w:r>'
      )
    );
    const para = parseParagraph(el);
    expect(para.numberingLevel).toBe(0);
    expect(para.bulletChar).toBe('\u2022');
  });

  it('should parse numbering at level 2', () => {
    const el = parseXml(
      paraXml(
        '<w:pPr><w:numPr>' +
          '<w:ilvl w:val="2"/>' +
          '<w:numId w:val="3"/>' +
          '</w:numPr></w:pPr>' +
          '<w:r><w:t>Level 2 item</w:t></w:r>'
      )
    );
    const para = parseParagraph(el);
    expect(para.numberingLevel).toBe(2);
  });

  it('should not add bullet for numId="0" (no numbering)', () => {
    const el = parseXml(
      paraXml(
        '<w:pPr><w:numPr>' +
          '<w:ilvl w:val="0"/>' +
          '<w:numId w:val="0"/>' +
          '</w:numPr></w:pPr>' +
          '<w:r><w:t>No bullet</w:t></w:r>'
      )
    );
    const para = parseParagraph(el);
    expect(para.bulletChar).toBeUndefined();
  });

  it('should handle paragraph with no properties', () => {
    const el = parseXml(paraXml('<w:r><w:t>Plain</w:t></w:r>'));
    const para = parseParagraph(el);
    expect(para.alignment).toBeUndefined();
    expect(para.spacingBefore).toBeUndefined();
    expect(para.spacingAfter).toBeUndefined();
    expect(para.lineSpacing).toBeUndefined();
    expect(para.indentLeft).toBeUndefined();
    expect(para.styleId).toBeUndefined();
  });
});
