import { describe, it, expect } from 'vitest';
import { parseXml } from '../../../xml/index.js';
import { parseRun, parseCharacterProperties, parseLineBreak } from '../run.js';
import type { ThemeIR } from '../../../ir/index.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const TEST_THEME: ThemeIR = {
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
    majorEastAsia: 'MS Gothic',
    minorEastAsia: 'MS Mincho',
    majorComplexScript: 'Arial',
    minorComplexScript: 'Times New Roman',
  },
  formatScheme: {
    fillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
    lineStyles: [{}, {}, {}],
    effectStyles: [[], [], []],
    bgFillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
  },
};

// ---------------------------------------------------------------------------
// Tests: parseRun
// ---------------------------------------------------------------------------

describe('parseRun', () => {
  it('parses a basic run with text', () => {
    const el = parseXml(`<a:r ${NS}><a:t>Hello World</a:t></a:r>`);
    const run = parseRun(el, TEST_THEME);

    expect(run.kind).toBe('run');
    expect(run.text).toBe('Hello World');
    expect(run.properties).toEqual({});
  });

  it('parses an empty run (no text content)', () => {
    const el = parseXml(`<a:r ${NS}><a:rPr lang="en-US"/><a:t></a:t></a:r>`);
    const run = parseRun(el, TEST_THEME);

    expect(run.kind).toBe('run');
    expect(run.text).toBe('');
  });

  it('parses a run without a:rPr element', () => {
    const el = parseXml(`<a:r ${NS}><a:t>No props</a:t></a:r>`);
    const run = parseRun(el, TEST_THEME);

    expect(run.kind).toBe('run');
    expect(run.text).toBe('No props');
    expect(run.properties).toEqual({});
  });

  it('parses character properties from run', () => {
    const el = parseXml(
      `<a:r ${NS}><a:rPr lang="en-US" sz="2400" b="1" i="1"/><a:t>Styled</a:t></a:r>`
    );
    const run = parseRun(el, TEST_THEME);

    expect(run.properties.fontSize).toBe(2400);
    expect(run.properties.bold).toBe(true);
    expect(run.properties.italic).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: parseCharacterProperties
// ---------------------------------------------------------------------------

describe('parseCharacterProperties', () => {
  it('parses bold and italic', () => {
    const el = parseXml(`<a:rPr ${NS} b="1" i="1"/>`);
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.bold).toBe(true);
    expect(props.italic).toBe(true);
  });

  it('parses bold=false and italic=false', () => {
    const el = parseXml(`<a:rPr ${NS} b="0" i="0"/>`);
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.bold).toBe(false);
    expect(props.italic).toBe(false);
  });

  it('omits bold/italic when not specified', () => {
    const el = parseXml(`<a:rPr ${NS} lang="en-US"/>`);
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.bold).toBeUndefined();
    expect(props.italic).toBeUndefined();
  });

  it('parses font size in hundredths of a point', () => {
    const el = parseXml(`<a:rPr ${NS} sz="1800"/>`);
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.fontSize).toBe(1800);
  });

  it('parses underline style (single)', () => {
    const el = parseXml(`<a:rPr ${NS} u="sng"/>`);
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.underline).toBe('single');
  });

  it('parses underline style (double)', () => {
    const el = parseXml(`<a:rPr ${NS} u="dbl"/>`);
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.underline).toBe('double');
  });

  it('parses underline style (wavy)', () => {
    const el = parseXml(`<a:rPr ${NS} u="wavy"/>`);
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.underline).toBe('wavy');
  });

  it('parses underline style (heavy)', () => {
    const el = parseXml(`<a:rPr ${NS} u="heavy"/>`);
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.underline).toBe('heavy');
  });

  it('parses underline none', () => {
    const el = parseXml(`<a:rPr ${NS} u="none"/>`);
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.underline).toBe('none');
  });

  it('parses underline wavyDouble', () => {
    const el = parseXml(`<a:rPr ${NS} u="wavyDbl"/>`);
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.underline).toBe('wavyDouble');
  });

  it('parses single strikethrough', () => {
    const el = parseXml(`<a:rPr ${NS} strike="sngStrike"/>`);
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.strikethrough).toBe('single');
  });

  it('parses double strikethrough', () => {
    const el = parseXml(`<a:rPr ${NS} strike="dblStrike"/>`);
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.strikethrough).toBe('double');
  });

  it('parses no strikethrough', () => {
    const el = parseXml(`<a:rPr ${NS} strike="noStrike"/>`);
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.strikethrough).toBe('none');
  });

  it('parses baseline (superscript)', () => {
    const el = parseXml(`<a:rPr ${NS} baseline="30000"/>`);
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.baseline).toBe(30);
  });

  it('parses baseline (subscript)', () => {
    const el = parseXml(`<a:rPr ${NS} baseline="-25000"/>`);
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.baseline).toBe(-25);
  });

  it('parses letter spacing in hundredths of a point', () => {
    const el = parseXml(`<a:rPr ${NS} spc="100"/>`);
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.spacing).toBe(100);
  });

  it('parses run color from solidFill', () => {
    const el = parseXml(
      `<a:rPr ${NS}><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr>`
    );
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.color).toBeDefined();
    expect(props.color!.r).toBe(255);
    expect(props.color!.g).toBe(0);
    expect(props.color!.b).toBe(0);
  });

  it('parses run color from scheme color', () => {
    const el = parseXml(
      `<a:rPr ${NS}><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:rPr>`
    );
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.color).toBeDefined();
    expect(props.color!.r).toBe(68);
    expect(props.color!.g).toBe(114);
    expect(props.color!.b).toBe(196);
  });

  it('parses latin font reference', () => {
    const el = parseXml(
      `<a:rPr ${NS}><a:latin typeface="Arial"/></a:rPr>`
    );
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.latin).toBe('Arial');
    expect(props.fontFamily).toBe('Arial');
  });

  it('parses east asian font reference', () => {
    const el = parseXml(
      `<a:rPr ${NS}><a:ea typeface="MS Gothic"/></a:rPr>`
    );
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.eastAsian).toBe('MS Gothic');
  });

  it('parses complex script font reference', () => {
    const el = parseXml(
      `<a:rPr ${NS}><a:cs typeface="Times New Roman"/></a:rPr>`
    );
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.complexScript).toBe('Times New Roman');
  });

  it('resolves major Latin theme font reference', () => {
    const el = parseXml(
      `<a:rPr ${NS}><a:latin typeface="+mj-lt"/></a:rPr>`
    );
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.latin).toBe('+mj-lt');
    expect(props.fontFamily).toBe('Calibri Light');
  });

  it('resolves minor Latin theme font reference', () => {
    const el = parseXml(
      `<a:rPr ${NS}><a:latin typeface="+mn-lt"/></a:rPr>`
    );
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.latin).toBe('+mn-lt');
    expect(props.fontFamily).toBe('Calibri');
  });

  it('resolves major East Asian theme font reference', () => {
    const el = parseXml(
      `<a:rPr ${NS}><a:latin typeface="+mj-ea"/></a:rPr>`
    );
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.latin).toBe('+mj-ea');
    expect(props.fontFamily).toBe('MS Gothic');
  });

  it('does not set fontFamily for empty latin typeface', () => {
    const el = parseXml(
      `<a:rPr ${NS}><a:latin typeface=""/></a:rPr>`
    );
    const props = parseCharacterProperties(el, TEST_THEME);

    // Empty string typeface is not set
    expect(props.latin).toBeUndefined();
    expect(props.fontFamily).toBeUndefined();
  });

  it('parses all character properties together', () => {
    const el = parseXml(
      `<a:rPr ${NS} sz="2400" b="1" i="1" u="sng" strike="sngStrike" baseline="30000" spc="50">
        <a:solidFill><a:srgbClr val="0000FF"/></a:solidFill>
        <a:latin typeface="Arial"/>
        <a:ea typeface="MS Gothic"/>
        <a:cs typeface="Times New Roman"/>
      </a:rPr>`
    );
    const props = parseCharacterProperties(el, TEST_THEME);

    expect(props.fontSize).toBe(2400);
    expect(props.bold).toBe(true);
    expect(props.italic).toBe(true);
    expect(props.underline).toBe('single');
    expect(props.strikethrough).toBe('single');
    expect(props.baseline).toBe(30);
    expect(props.spacing).toBe(50);
    expect(props.color!.r).toBe(0);
    expect(props.color!.g).toBe(0);
    expect(props.color!.b).toBe(255);
    expect(props.latin).toBe('Arial');
    expect(props.eastAsian).toBe('MS Gothic');
    expect(props.complexScript).toBe('Times New Roman');
    expect(props.fontFamily).toBe('Arial');
  });
});

// ---------------------------------------------------------------------------
// Tests: parseLineBreak
// ---------------------------------------------------------------------------

describe('parseLineBreak', () => {
  it('parses a line break element', () => {
    const el = parseXml(`<a:br ${NS}><a:rPr lang="en-US" sz="1800"/></a:br>`);
    const lb = parseLineBreak(el, TEST_THEME);

    expect(lb.kind).toBe('lineBreak');
    expect(lb.properties.fontSize).toBe(1800);
  });

  it('parses a line break without properties', () => {
    const el = parseXml(`<a:br ${NS}/>`);
    const lb = parseLineBreak(el, TEST_THEME);

    expect(lb.kind).toBe('lineBreak');
    expect(lb.properties).toEqual({});
  });

  it('parses line break with bold property', () => {
    const el = parseXml(`<a:br ${NS}><a:rPr b="1" sz="2400"/></a:br>`);
    const lb = parseLineBreak(el, TEST_THEME);

    expect(lb.kind).toBe('lineBreak');
    expect(lb.properties.bold).toBe(true);
    expect(lb.properties.fontSize).toBe(2400);
  });
});
