import { describe, it, expect } from 'vitest';
import { parseXml } from '@opendockit/core';
import { parseRun, parseRunProperties } from '../run.js';

/** Helper: wrap run XML in a minimal document so parseXml can find the element. */
function runXml(innerXml: string): string {
  return `<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${innerXml}</w:r>`;
}

describe('parseRun', () => {
  it('should extract plain text from w:t', () => {
    const el = parseXml(runXml('<w:t>Hello World</w:t>'));
    const run = parseRun(el);
    expect(run.text).toBe('Hello World');
  });

  it('should concatenate multiple w:t elements', () => {
    const el = parseXml(runXml('<w:t>Hello</w:t><w:t> World</w:t>'));
    const run = parseRun(el);
    expect(run.text).toBe('Hello World');
  });

  it('should handle empty runs', () => {
    const el = parseXml(runXml(''));
    const run = parseRun(el);
    expect(run.text).toBe('');
  });

  it('should convert w:br to newline', () => {
    const el = parseXml(runXml('<w:t>Line 1</w:t><w:br/><w:t>Line 2</w:t>'));
    const run = parseRun(el);
    expect(run.text).toBe('Line 1\nLine 2');
  });

  it('should convert w:tab to tab character', () => {
    const el = parseXml(runXml('<w:t>Col1</w:t><w:tab/><w:t>Col2</w:t>'));
    const run = parseRun(el);
    expect(run.text).toBe('Col1\tCol2');
  });

  it('should parse bold property (bare element)', () => {
    const el = parseXml(runXml('<w:rPr><w:b/></w:rPr><w:t>Bold</w:t>'));
    const run = parseRun(el);
    expect(run.bold).toBe(true);
  });

  it('should parse bold property with val="true"', () => {
    const el = parseXml(runXml('<w:rPr><w:b w:val="true"/></w:rPr><w:t>Bold</w:t>'));
    const run = parseRun(el);
    expect(run.bold).toBe(true);
  });

  it('should parse bold=false with val="0"', () => {
    const el = parseXml(runXml('<w:rPr><w:b w:val="0"/></w:rPr><w:t>Not Bold</w:t>'));
    const run = parseRun(el);
    expect(run.bold).toBe(false);
  });

  it('should parse bold=false with val="false"', () => {
    const el = parseXml(runXml('<w:rPr><w:b w:val="false"/></w:rPr><w:t>Not Bold</w:t>'));
    const run = parseRun(el);
    expect(run.bold).toBe(false);
  });

  it('should parse italic property', () => {
    const el = parseXml(runXml('<w:rPr><w:i/></w:rPr><w:t>Italic</w:t>'));
    const run = parseRun(el);
    expect(run.italic).toBe(true);
  });

  it('should parse underline with val="single"', () => {
    const el = parseXml(runXml('<w:rPr><w:u w:val="single"/></w:rPr><w:t>Underline</w:t>'));
    const run = parseRun(el);
    expect(run.underline).toBe(true);
  });

  it('should not set underline for val="none"', () => {
    const el = parseXml(runXml('<w:rPr><w:u w:val="none"/></w:rPr><w:t>No underline</w:t>'));
    const run = parseRun(el);
    expect(run.underline).toBe(false);
  });

  it('should parse strikethrough', () => {
    const el = parseXml(runXml('<w:rPr><w:strike/></w:rPr><w:t>Struck</w:t>'));
    const run = parseRun(el);
    expect(run.strikethrough).toBe(true);
  });

  it('should parse font size from half-points', () => {
    // 24 half-points = 12pt
    const el = parseXml(runXml('<w:rPr><w:sz w:val="24"/></w:rPr><w:t>12pt</w:t>'));
    const run = parseRun(el);
    expect(run.fontSize).toBe(12);
  });

  it('should parse font size of 48 half-points as 24pt', () => {
    const el = parseXml(runXml('<w:rPr><w:sz w:val="48"/></w:rPr><w:t>24pt</w:t>'));
    const run = parseRun(el);
    expect(run.fontSize).toBe(24);
  });

  it('should parse font family from w:rFonts ascii', () => {
    const el = parseXml(runXml('<w:rPr><w:rFonts w:ascii="Arial"/></w:rPr><w:t>Arial</w:t>'));
    const run = parseRun(el);
    expect(run.fontFamily).toBe('Arial');
  });

  it('should fall back to hAnsi when ascii is not present', () => {
    const el = parseXml(
      runXml('<w:rPr><w:rFonts w:hAnsi="Times New Roman"/></w:rPr><w:t>TNR</w:t>')
    );
    const run = parseRun(el);
    expect(run.fontFamily).toBe('Times New Roman');
  });

  it('should parse text color', () => {
    const el = parseXml(runXml('<w:rPr><w:color w:val="FF0000"/></w:rPr><w:t>Red</w:t>'));
    const run = parseRun(el);
    expect(run.color).toBe('FF0000');
  });

  it('should ignore auto color', () => {
    const el = parseXml(runXml('<w:rPr><w:color w:val="auto"/></w:rPr><w:t>Auto</w:t>'));
    const run = parseRun(el);
    expect(run.color).toBeUndefined();
  });

  it('should parse superscript', () => {
    const el = parseXml(runXml('<w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>sup</w:t>'));
    const run = parseRun(el);
    expect(run.superscript).toBe(true);
    expect(run.subscript).toBeUndefined();
  });

  it('should parse subscript', () => {
    const el = parseXml(runXml('<w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>sub</w:t>'));
    const run = parseRun(el);
    expect(run.subscript).toBe(true);
    expect(run.superscript).toBeUndefined();
  });

  it('should parse multiple run properties together', () => {
    const el = parseXml(
      runXml(
        '<w:rPr>' +
          '<w:b/>' +
          '<w:i/>' +
          '<w:sz w:val="28"/>' +
          '<w:rFonts w:ascii="Calibri"/>' +
          '<w:color w:val="0000FF"/>' +
          '</w:rPr>' +
          '<w:t>Styled</w:t>'
      )
    );
    const run = parseRun(el);
    expect(run.bold).toBe(true);
    expect(run.italic).toBe(true);
    expect(run.fontSize).toBe(14);
    expect(run.fontFamily).toBe('Calibri');
    expect(run.color).toBe('0000FF');
  });

  it('should return no formatting when rPr is absent', () => {
    const el = parseXml(runXml('<w:t>Plain</w:t>'));
    const run = parseRun(el);
    expect(run.bold).toBeUndefined();
    expect(run.italic).toBeUndefined();
    expect(run.underline).toBeUndefined();
    expect(run.fontSize).toBeUndefined();
    expect(run.fontFamily).toBeUndefined();
    expect(run.color).toBeUndefined();
  });
});

describe('parseRunProperties', () => {
  it('should return empty object for undefined input', () => {
    const result = parseRunProperties(undefined);
    expect(result).toEqual({});
  });

  it('should parse standalone rPr element', () => {
    const el = parseXml(
      '<w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:b/><w:sz w:val="32"/>' +
        '</w:rPr>'
    );
    const result = parseRunProperties(el);
    expect(result.bold).toBe(true);
    expect(result.fontSize).toBe(16);
  });
});
