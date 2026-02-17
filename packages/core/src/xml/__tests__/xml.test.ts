import { describe, it, expect } from 'vitest';
import { parseXml, type XmlElement } from '../fast-parser.js';

// ---------------------------------------------------------------------------
// Test fixtures — real OOXML fragments
// ---------------------------------------------------------------------------

const SHAPE_XML = `
<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:nvSpPr>
    <p:cNvPr id="2" name="Title 1"/>
    <p:cNvSpPr>
      <a:spLocks noGrp="1"/>
    </p:cNvSpPr>
    <p:nvPr/>
  </p:nvSpPr>
  <p:spPr>
    <a:xfrm>
      <a:off x="457200" y="274638"/>
      <a:ext cx="8229600" cy="1143000"/>
    </a:xfrm>
    <a:prstGeom prst="rect">
      <a:avLst/>
    </a:prstGeom>
  </p:spPr>
</p:sp>`;

const TEXT_WITH_RUNS_XML = `
<a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:r>
    <a:rPr lang="en-US" b="1" dirty="0"/>
    <a:t>Hello </a:t>
  </a:r>
  <a:r>
    <a:rPr lang="en-US" dirty="0"/>
    <a:t>World</a:t>
  </a:r>
</a:p>`;

const SOLID_FILL_XML = `
<a:solidFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:srgbClr val="FF0000">
    <a:alpha val="50000"/>
  </a:srgbClr>
</a:solidFill>`;

const GRADIENT_FILL_XML = `
<a:gradFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" flip="none" rotWithShape="1">
  <a:gsLst>
    <a:gs pos="0">
      <a:srgbClr val="FF0000"/>
    </a:gs>
    <a:gs pos="50000">
      <a:srgbClr val="00FF00"/>
    </a:gs>
    <a:gs pos="100000">
      <a:srgbClr val="0000FF"/>
    </a:gs>
  </a:gsLst>
  <a:lin ang="5400000" scaled="1"/>
</a:gradFill>`;

const SELF_CLOSING_XML = `<a:off xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" x="100" y="200"/>`;

const TEXT_ELEMENT_XML = `
<a:t xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">Hello World</a:t>`;

const MULTIPLE_SAME_TAG_XML = `
<a:avLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:gd name="adj1" fmla="val 50000"/>
  <a:gd name="adj2" fmla="val 25000"/>
  <a:gd name="adj3" fmla="val 75000"/>
</a:avLst>`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseXml', () => {
  it('returns the root element', () => {
    const el = parseXml(SELF_CLOSING_XML);
    expect(el.name).toBe('a:off');
  });

  it('throws on empty input', () => {
    expect(() => parseXml('')).toThrow();
  });

  it('throws on whitespace-only input', () => {
    expect(() => parseXml('   ')).toThrow();
  });
});

describe('XmlElement.attr', () => {
  it('reads attribute values', () => {
    const el = parseXml(SELF_CLOSING_XML);
    expect(el.attr('x')).toBe('100');
    expect(el.attr('y')).toBe('200');
  });

  it('returns undefined for missing attributes', () => {
    const el = parseXml(SELF_CLOSING_XML);
    expect(el.attr('z')).toBeUndefined();
  });
});

describe('XmlElement.child', () => {
  it('finds a direct child by tag name', () => {
    const el = parseXml(SHAPE_XML);
    const nvSpPr = el.child('p:nvSpPr');
    expect(nvSpPr).toBeDefined();
    expect(nvSpPr!.name).toBe('p:nvSpPr');
  });

  it('returns undefined for missing children', () => {
    const el = parseXml(SHAPE_XML);
    expect(el.child('p:txBody')).toBeUndefined();
  });

  it('supports chained navigation', () => {
    const el = parseXml(SHAPE_XML);
    const off = el.child('p:spPr')?.child('a:xfrm')?.child('a:off');
    expect(off).toBeDefined();
    expect(off!.attr('x')).toBe('457200');
    expect(off!.attr('y')).toBe('274638');
  });

  it('navigates deeply nested elements', () => {
    const el = parseXml(SHAPE_XML);
    const ext = el.child('p:spPr')?.child('a:xfrm')?.child('a:ext');
    expect(ext).toBeDefined();
    expect(ext!.attr('cx')).toBe('8229600');
    expect(ext!.attr('cy')).toBe('1143000');
  });

  it('finds preset geometry attributes', () => {
    const el = parseXml(SHAPE_XML);
    const prstGeom = el.child('p:spPr')?.child('a:prstGeom');
    expect(prstGeom).toBeDefined();
    expect(prstGeom!.attr('prst')).toBe('rect');
  });
});

describe('XmlElement.children', () => {
  it('returns only element children (no text nodes)', () => {
    const el = parseXml(SHAPE_XML);
    const children = el.children;
    expect(children.length).toBe(2); // p:nvSpPr, p:spPr
    expect(children[0].name).toBe('p:nvSpPr');
    expect(children[1].name).toBe('p:spPr');
  });

  it('returns empty array when there are no children', () => {
    const el = parseXml(SELF_CLOSING_XML);
    expect(el.children).toEqual([]);
  });
});

describe('XmlElement.allChildren', () => {
  it('returns all children matching a tag name', () => {
    const el = parseXml(MULTIPLE_SAME_TAG_XML);
    const gds = el.allChildren('a:gd');
    expect(gds.length).toBe(3);
    expect(gds[0].attr('name')).toBe('adj1');
    expect(gds[1].attr('name')).toBe('adj2');
    expect(gds[2].attr('name')).toBe('adj3');
  });

  it('returns empty array when no children match', () => {
    const el = parseXml(MULTIPLE_SAME_TAG_XML);
    expect(el.allChildren('a:nonexistent')).toEqual([]);
  });
});

describe('XmlElement.text', () => {
  it('extracts text content', () => {
    const el = parseXml(TEXT_ELEMENT_XML);
    expect(el.text()).toBe('Hello World');
  });

  it('returns empty string when no text content', () => {
    const el = parseXml(SELF_CLOSING_XML);
    expect(el.text()).toBe('');
  });
});

describe('XmlElement.is', () => {
  it('returns true for matching tag name', () => {
    const el = parseXml(SELF_CLOSING_XML);
    expect(el.is('a:off')).toBe(true);
  });

  it('returns false for non-matching tag name', () => {
    const el = parseXml(SELF_CLOSING_XML);
    expect(el.is('a:ext')).toBe(false);
  });
});

describe('solid fill parsing', () => {
  it('navigates solid fill with color transforms', () => {
    const el = parseXml(SOLID_FILL_XML);
    expect(el.name).toBe('a:solidFill');

    const srgbClr = el.child('a:srgbClr');
    expect(srgbClr).toBeDefined();
    expect(srgbClr!.attr('val')).toBe('FF0000');

    const alpha = srgbClr!.child('a:alpha');
    expect(alpha).toBeDefined();
    expect(alpha!.attr('val')).toBe('50000');
  });
});

describe('gradient fill parsing (order preserved)', () => {
  it('preserves gradient stop order', () => {
    const el = parseXml(GRADIENT_FILL_XML);
    expect(el.name).toBe('a:gradFill');
    expect(el.attr('flip')).toBe('none');
    expect(el.attr('rotWithShape')).toBe('1');

    const gsLst = el.child('a:gsLst');
    expect(gsLst).toBeDefined();

    const stops = gsLst!.allChildren('a:gs');
    expect(stops.length).toBe(3);

    // Verify order is preserved
    expect(stops[0].attr('pos')).toBe('0');
    expect(stops[0].child('a:srgbClr')!.attr('val')).toBe('FF0000');

    expect(stops[1].attr('pos')).toBe('50000');
    expect(stops[1].child('a:srgbClr')!.attr('val')).toBe('00FF00');

    expect(stops[2].attr('pos')).toBe('100000');
    expect(stops[2].child('a:srgbClr')!.attr('val')).toBe('0000FF');
  });

  it('finds lin element with angle', () => {
    const el = parseXml(GRADIENT_FILL_XML);
    const lin = el.child('a:lin');
    expect(lin).toBeDefined();
    expect(lin!.attr('ang')).toBe('5400000');
    expect(lin!.attr('scaled')).toBe('1');
  });
});

describe('text with runs', () => {
  it('navigates text runs and their properties', () => {
    const el = parseXml(TEXT_WITH_RUNS_XML);
    expect(el.name).toBe('a:p');

    const runs = el.allChildren('a:r');
    expect(runs.length).toBe(2);

    // First run
    const rPr1 = runs[0].child('a:rPr');
    expect(rPr1).toBeDefined();
    expect(rPr1!.attr('lang')).toBe('en-US');
    expect(rPr1!.attr('b')).toBe('1');

    const t1 = runs[0].child('a:t');
    expect(t1).toBeDefined();
    expect(t1!.text()).toBe('Hello');

    // Second run
    const rPr2 = runs[1].child('a:rPr');
    expect(rPr2).toBeDefined();
    expect(rPr2!.attr('lang')).toBe('en-US');
    expect(rPr2!.attr('b')).toBeUndefined();

    const t2 = runs[1].child('a:t');
    expect(t2).toBeDefined();
    expect(t2!.text()).toBe('World');
  });
});

describe('edge cases', () => {
  it('handles XML with processing instruction', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<a:off xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" x="100" y="200"/>`;
    const el = parseXml(xml);
    expect(el.name).toBe('a:off');
    expect(el.attr('x')).toBe('100');
  });

  it('handles elements without namespace prefix', () => {
    const xml =
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>';
    const el = parseXml(xml);
    expect(el.name).toBe('Types');
    const def = el.child('Default');
    expect(def).toBeDefined();
    expect(def!.attr('Extension')).toBe('xml');
  });

  it('handles deeply nested structures', () => {
    const xml = `
<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:spPr>
    <a:xfrm>
      <a:off x="0" y="0"/>
    </a:xfrm>
    <a:solidFill>
      <a:schemeClr val="accent1">
        <a:lumMod val="75000"/>
        <a:lumOff val="25000"/>
      </a:schemeClr>
    </a:solidFill>
  </p:spPr>
</p:sp>`;
    const el = parseXml(xml);
    const schemeClr = el.child('p:spPr')?.child('a:solidFill')?.child('a:schemeClr');
    expect(schemeClr).toBeDefined();
    expect(schemeClr!.attr('val')).toBe('accent1');

    const lumMod = schemeClr!.child('a:lumMod');
    expect(lumMod).toBeDefined();
    expect(lumMod!.attr('val')).toBe('75000');

    const lumOff = schemeClr!.child('a:lumOff');
    expect(lumOff).toBeDefined();
    expect(lumOff!.attr('val')).toBe('25000');
  });

  it('child() only matches direct children, not descendants', () => {
    const el = parseXml(SHAPE_XML);
    // a:xfrm is a grandchild of p:sp, not a direct child
    expect(el.child('a:xfrm')).toBeUndefined();
  });

  it('handles multiple namespace declarations', () => {
    const xml = `
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr/>
    </p:spTree>
  </p:cSld>
</p:sld>`;
    const el = parseXml(xml);
    expect(el.name).toBe('p:sld');
    const cSld = el.child('p:cSld');
    expect(cSld).toBeDefined();
    const spTree = cSld!.child('p:spTree');
    expect(spTree).toBeDefined();
    const nvGrpSpPr = spTree!.child('p:nvGrpSpPr');
    expect(nvGrpSpPr).toBeDefined();
  });
});
