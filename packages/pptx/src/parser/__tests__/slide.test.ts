import { describe, it, expect } from 'vitest';
import { parseXml } from '@opendockit/core';
import type { ThemeIR } from '@opendockit/core';
import { parseSlide } from '../slide.js';

// ---------------------------------------------------------------------------
// Helper: minimal theme
// ---------------------------------------------------------------------------

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
      fillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
      lineStyles: [{}, {}, {}],
      effectStyles: [[], [], []],
      bgFillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseSlide', () => {
  it('parses a slide with shapes', () => {
    const xml = parseXml(`
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title 1"/>
          <p:cNvSpPr/>
          <p:nvPr>
            <p:ph type="title"/>
          </p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="457200" y="274638"/>
            <a:ext cx="8229600" cy="1143000"/>
          </a:xfrm>
          <a:prstGeom prst="rect"/>
        </p:spPr>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Content 2"/>
          <p:cNvSpPr/>
          <p:nvPr>
            <p:ph idx="1"/>
          </p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="457200" y="1600200"/>
            <a:ext cx="8229600" cy="4525963"/>
          </a:xfrm>
        </p:spPr>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`);

    const result = parseSlide(
      xml,
      '/ppt/slides/slide1.xml',
      '/ppt/slideLayouts/slideLayout1.xml',
      '/ppt/slideMasters/slideMaster1.xml',
      minimalTheme()
    );

    expect(result.partUri).toBe('/ppt/slides/slide1.xml');
    expect(result.layoutPartUri).toBe('/ppt/slideLayouts/slideLayout1.xml');
    expect(result.masterPartUri).toBe('/ppt/slideMasters/slideMaster1.xml');
    expect(result.elements).toHaveLength(2);

    // First shape: Title
    const title = result.elements[0];
    expect(title.kind).toBe('shape');
    if (title.kind === 'shape') {
      expect(title.id).toBe('2');
      expect(title.name).toBe('Title 1');
      expect(title.placeholderType).toBe('title');
      expect(title.properties.transform?.position).toEqual({ x: 457200, y: 274638 });
      expect(title.properties.transform?.size).toEqual({ width: 8229600, height: 1143000 });
    }

    // Second shape: Content with placeholder index
    const content = result.elements[1];
    expect(content.kind).toBe('shape');
    if (content.kind === 'shape') {
      expect(content.id).toBe('3');
      expect(content.name).toBe('Content 2');
      expect(content.placeholderIndex).toBe(1);
    }
  });

  it('parses a slide with background', () => {
    const xml = parseXml(`
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg>
      <p:bgPr>
        <a:solidFill>
          <a:srgbClr val="FF0000"/>
        </a:solidFill>
      </p:bgPr>
    </p:bg>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
</p:sld>`);

    const result = parseSlide(
      xml,
      '/ppt/slides/slide1.xml',
      '/ppt/slideLayouts/slideLayout1.xml',
      '/ppt/slideMasters/slideMaster1.xml',
      minimalTheme()
    );

    expect(result.background).toBeDefined();
    expect(result.background?.fill).toBeDefined();
    expect(result.background?.fill?.type).toBe('solid');
    if (result.background?.fill?.type === 'solid') {
      expect(result.background.fill.color).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    }
  });

  it('parses slide color map override', () => {
    const xml = parseXml(`
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:overrideClrMapping bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2"
      accent1="accent1" accent2="accent2" accent3="accent3"
      accent4="accent4" accent5="accent5" accent6="accent6"
      hlink="hlink" folHlink="folHlink"/>
  </p:clrMapOvr>
</p:sld>`);

    const result = parseSlide(
      xml,
      '/ppt/slides/slide1.xml',
      '/ppt/slideLayouts/slideLayout1.xml',
      '/ppt/slideMasters/slideMaster1.xml',
      minimalTheme()
    );

    expect(result.colorMap).toBeDefined();
    expect(result.colorMap?.bg1).toBe('dk1');
    expect(result.colorMap?.tx1).toBe('lt1');
  });

  it('returns empty elements for slide with empty shape tree', () => {
    const xml = parseXml(`
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
</p:sld>`);

    const result = parseSlide(
      xml,
      '/ppt/slides/slide1.xml',
      '/ppt/slideLayouts/slideLayout1.xml',
      '/ppt/slideMasters/slideMaster1.xml',
      minimalTheme()
    );

    expect(result.elements).toEqual([]);
    expect(result.background).toBeUndefined();
    expect(result.colorMap).toBeUndefined();
  });

  it('handles master color map override (inheriting from master)', () => {
    const xml = parseXml(`
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:sld>`);

    const result = parseSlide(
      xml,
      '/ppt/slides/slide1.xml',
      '/ppt/slideLayouts/slideLayout1.xml',
      '/ppt/slideMasters/slideMaster1.xml',
      minimalTheme()
    );

    // masterClrMapping means "use master's color map" — returns undefined
    expect(result.colorMap).toBeUndefined();
  });
});
