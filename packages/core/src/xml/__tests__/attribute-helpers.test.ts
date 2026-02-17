import { describe, it, expect } from 'vitest';
import { parseXml } from '../fast-parser.js';
import {
  parseBoolAttr,
  parseIntAttr,
  parseFloatAttr,
  parseOptionalInt,
  parseEnumAttr,
  parsePercentage,
  parseAngle,
  parseCoordinate,
} from '../attribute-helpers.js';

// Helper to create an element with specific attributes
function makeEl(attrs: Record<string, string>) {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  const xml = `<test ${attrStr}/>`;
  return parseXml(xml);
}

// ---------------------------------------------------------------------------
// parseBoolAttr
// ---------------------------------------------------------------------------

describe('parseBoolAttr', () => {
  it('parses "1" as true', () => {
    const el = makeEl({ b: '1' });
    expect(parseBoolAttr(el, 'b')).toBe(true);
  });

  it('parses "true" as true', () => {
    const el = makeEl({ b: 'true' });
    expect(parseBoolAttr(el, 'b')).toBe(true);
  });

  it('parses "on" as true', () => {
    const el = makeEl({ b: 'on' });
    expect(parseBoolAttr(el, 'b')).toBe(true);
  });

  it('parses "0" as false', () => {
    const el = makeEl({ b: '0' });
    expect(parseBoolAttr(el, 'b')).toBe(false);
  });

  it('parses "false" as false', () => {
    const el = makeEl({ b: 'false' });
    expect(parseBoolAttr(el, 'b')).toBe(false);
  });

  it('parses "off" as false', () => {
    const el = makeEl({ b: 'off' });
    expect(parseBoolAttr(el, 'b')).toBe(false);
  });

  it('returns false for missing attribute (default)', () => {
    const el = makeEl({});
    expect(parseBoolAttr(el, 'b')).toBe(false);
  });

  it('returns custom default for missing attribute', () => {
    const el = makeEl({});
    expect(parseBoolAttr(el, 'b', true)).toBe(true);
  });

  it('is case-insensitive', () => {
    const el = makeEl({ b: 'True' });
    expect(parseBoolAttr(el, 'b')).toBe(true);

    const el2 = makeEl({ b: 'FALSE' });
    expect(parseBoolAttr(el2, 'b')).toBe(false);
  });

  it('returns default for unrecognised values', () => {
    const el = makeEl({ b: 'maybe' });
    expect(parseBoolAttr(el, 'b')).toBe(false);
    expect(parseBoolAttr(el, 'b', true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseIntAttr
// ---------------------------------------------------------------------------

describe('parseIntAttr', () => {
  it('parses positive integers', () => {
    const el = makeEl({ x: '457200' });
    expect(parseIntAttr(el, 'x')).toBe(457200);
  });

  it('parses negative integers', () => {
    const el = makeEl({ x: '-100' });
    expect(parseIntAttr(el, 'x')).toBe(-100);
  });

  it('parses zero', () => {
    const el = makeEl({ x: '0' });
    expect(parseIntAttr(el, 'x')).toBe(0);
  });

  it('returns undefined for missing attribute', () => {
    const el = makeEl({});
    expect(parseIntAttr(el, 'x')).toBeUndefined();
  });

  it('returns undefined for non-numeric value', () => {
    const el = makeEl({ x: 'abc' });
    expect(parseIntAttr(el, 'x')).toBeUndefined();
  });

  it('truncates float values to int', () => {
    const el = makeEl({ x: '12.7' });
    expect(parseIntAttr(el, 'x')).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// parseFloatAttr
// ---------------------------------------------------------------------------

describe('parseFloatAttr', () => {
  it('parses float values', () => {
    const el = makeEl({ val: '3.14' });
    expect(parseFloatAttr(el, 'val')).toBeCloseTo(3.14);
  });

  it('parses integer values as floats', () => {
    const el = makeEl({ val: '42' });
    expect(parseFloatAttr(el, 'val')).toBe(42);
  });

  it('parses negative floats', () => {
    const el = makeEl({ val: '-0.5' });
    expect(parseFloatAttr(el, 'val')).toBeCloseTo(-0.5);
  });

  it('returns undefined for missing attribute', () => {
    const el = makeEl({});
    expect(parseFloatAttr(el, 'val')).toBeUndefined();
  });

  it('returns undefined for non-numeric value', () => {
    const el = makeEl({ val: 'abc' });
    expect(parseFloatAttr(el, 'val')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseOptionalInt
// ---------------------------------------------------------------------------

describe('parseOptionalInt', () => {
  it('parses present integer', () => {
    const el = makeEl({ sz: '2400' });
    expect(parseOptionalInt(el, 'sz', 1200)).toBe(2400);
  });

  it('returns default for missing attribute', () => {
    const el = makeEl({});
    expect(parseOptionalInt(el, 'sz', 1200)).toBe(1200);
  });

  it('returns default for invalid value', () => {
    const el = makeEl({ sz: 'abc' });
    expect(parseOptionalInt(el, 'sz', 1200)).toBe(1200);
  });
});

// ---------------------------------------------------------------------------
// parseEnumAttr
// ---------------------------------------------------------------------------

describe('parseEnumAttr', () => {
  const FILL_TYPES = ['solid', 'gradient', 'pattern', 'none'] as const;

  it('returns value when in allowed set', () => {
    const el = makeEl({ fill: 'solid' });
    expect(parseEnumAttr(el, 'fill', FILL_TYPES)).toBe('solid');
  });

  it('returns undefined when value not in allowed set', () => {
    const el = makeEl({ fill: 'hatch' });
    expect(parseEnumAttr(el, 'fill', FILL_TYPES)).toBeUndefined();
  });

  it('returns undefined when attribute is missing', () => {
    const el = makeEl({});
    expect(parseEnumAttr(el, 'fill', FILL_TYPES)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parsePercentage
// ---------------------------------------------------------------------------

describe('parsePercentage', () => {
  it('converts 100000 to 1.0', () => {
    const el = makeEl({ val: '100000' });
    expect(parsePercentage(el, 'val')).toBeCloseTo(1.0);
  });

  it('converts 50000 to 0.5', () => {
    const el = makeEl({ val: '50000' });
    expect(parsePercentage(el, 'val')).toBeCloseTo(0.5);
  });

  it('converts 0 to 0.0', () => {
    const el = makeEl({ val: '0' });
    expect(parsePercentage(el, 'val')).toBeCloseTo(0.0);
  });

  it('converts 75000 to 0.75', () => {
    const el = makeEl({ val: '75000' });
    expect(parsePercentage(el, 'val')).toBeCloseTo(0.75);
  });

  it('returns undefined for missing attribute', () => {
    const el = makeEl({});
    expect(parsePercentage(el, 'val')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseAngle
// ---------------------------------------------------------------------------

describe('parseAngle', () => {
  it('converts 5400000 to 90 degrees', () => {
    const el = makeEl({ ang: '5400000' });
    expect(parseAngle(el, 'ang')).toBeCloseTo(90);
  });

  it('converts 0 to 0 degrees', () => {
    const el = makeEl({ ang: '0' });
    expect(parseAngle(el, 'ang')).toBeCloseTo(0);
  });

  it('converts 21600000 to 360 degrees', () => {
    const el = makeEl({ ang: '21600000' });
    expect(parseAngle(el, 'ang')).toBeCloseTo(360);
  });

  it('converts 2700000 to 45 degrees', () => {
    const el = makeEl({ ang: '2700000' });
    expect(parseAngle(el, 'ang')).toBeCloseTo(45);
  });

  it('returns undefined for missing attribute', () => {
    const el = makeEl({});
    expect(parseAngle(el, 'ang')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseCoordinate
// ---------------------------------------------------------------------------

describe('parseCoordinate', () => {
  it('parses EMU values', () => {
    const el = makeEl({ x: '914400' });
    expect(parseCoordinate(el, 'x')).toBe(914400);
  });

  it('parses zero', () => {
    const el = makeEl({ x: '0' });
    expect(parseCoordinate(el, 'x')).toBe(0);
  });

  it('returns undefined for missing attribute', () => {
    const el = makeEl({});
    expect(parseCoordinate(el, 'x')).toBeUndefined();
  });

  it('parses negative EMU values', () => {
    const el = makeEl({ x: '-457200' });
    expect(parseCoordinate(el, 'x')).toBe(-457200);
  });
});

// ---------------------------------------------------------------------------
// Integration: attribute helpers with real OOXML fragments
// ---------------------------------------------------------------------------

describe('attribute helpers with real OOXML', () => {
  it('reads xfrm coordinates', () => {
    const xml = `
<a:xfrm xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:off x="457200" y="274638"/>
  <a:ext cx="8229600" cy="1143000"/>
</a:xfrm>`;
    const xfrm = parseXml(xml);
    const off = xfrm.child('a:off')!;
    expect(parseCoordinate(off, 'x')).toBe(457200);
    expect(parseCoordinate(off, 'y')).toBe(274638);

    const ext = xfrm.child('a:ext')!;
    expect(parseCoordinate(ext, 'cx')).toBe(8229600);
    expect(parseCoordinate(ext, 'cy')).toBe(1143000);
  });

  it('reads gradient fill angle', () => {
    const xml = `
<a:lin xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ang="5400000" scaled="1"/>`;
    const lin = parseXml(xml);
    expect(parseAngle(lin, 'ang')).toBeCloseTo(90);
    expect(parseBoolAttr(lin, 'scaled')).toBe(true);
  });

  it('reads text run properties', () => {
    const xml = `
<a:rPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       lang="en-US" sz="2400" b="1" i="0" dirty="0"/>`;
    const rPr = parseXml(xml);
    expect(parseBoolAttr(rPr, 'b')).toBe(true);
    expect(parseBoolAttr(rPr, 'i')).toBe(false);
    expect(parseIntAttr(rPr, 'sz')).toBe(2400);
    expect(parseEnumAttr(rPr, 'lang', ['en-US', 'de-DE'] as const)).toBe('en-US');
  });

  it('reads alpha percentage', () => {
    const xml = `<a:alpha xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="50000"/>`;
    const alpha = parseXml(xml);
    expect(parsePercentage(alpha, 'val')).toBeCloseTo(0.5);
  });
});
