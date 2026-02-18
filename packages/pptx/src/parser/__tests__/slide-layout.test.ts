import { describe, it, expect } from 'vitest';
import { parseXml } from '@opendockit/core';
import type { ThemeIR } from '@opendockit/core';
import { parseSlideLayout } from '../slide-layout.js';

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
// Helpers
// ---------------------------------------------------------------------------

function makeLayoutXml(attrs: string = '', body: string = ''): string {
  return `
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             ${attrs}>
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
  ${body}
</p:sldLayout>`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseSlideLayout', () => {
  it('parses a minimal layout with no showMasterSp attribute', () => {
    const xml = parseXml(makeLayoutXml());
    const result = parseSlideLayout(
      xml,
      '/ppt/slideLayouts/slideLayout1.xml',
      '/ppt/slideMasters/slideMaster1.xml',
      minimalTheme()
    );

    expect(result.partUri).toBe('/ppt/slideLayouts/slideLayout1.xml');
    expect(result.masterPartUri).toBe('/ppt/slideMasters/slideMaster1.xml');
    expect(result.elements).toEqual([]);
    expect(result.showMasterSp).toBeUndefined();
  });

  it('parses showMasterSp="0" as false', () => {
    const xml = parseXml(makeLayoutXml('showMasterSp="0"'));
    const result = parseSlideLayout(
      xml,
      '/ppt/slideLayouts/slideLayout1.xml',
      '/ppt/slideMasters/slideMaster1.xml',
      minimalTheme()
    );

    expect(result.showMasterSp).toBe(false);
  });

  it('parses showMasterSp="false" as false', () => {
    const xml = parseXml(makeLayoutXml('showMasterSp="false"'));
    const result = parseSlideLayout(
      xml,
      '/ppt/slideLayouts/slideLayout1.xml',
      '/ppt/slideMasters/slideMaster1.xml',
      minimalTheme()
    );

    expect(result.showMasterSp).toBe(false);
  });

  it('parses showMasterSp="1" as undefined (default true)', () => {
    const xml = parseXml(makeLayoutXml('showMasterSp="1"'));
    const result = parseSlideLayout(
      xml,
      '/ppt/slideLayouts/slideLayout1.xml',
      '/ppt/slideMasters/slideMaster1.xml',
      minimalTheme()
    );

    // "1" = true = default behavior, stored as undefined
    expect(result.showMasterSp).toBeUndefined();
  });

  it('parses layout with shapes in the shape tree', () => {
    const xml = parseXml(`
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
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
        </p:spPr>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sldLayout>`);

    const result = parseSlideLayout(
      xml,
      '/ppt/slideLayouts/slideLayout1.xml',
      '/ppt/slideMasters/slideMaster1.xml',
      minimalTheme()
    );

    expect(result.elements).toHaveLength(1);
    const title = result.elements[0];
    expect(title.kind).toBe('shape');
    if (title.kind === 'shape') {
      expect(title.placeholderType).toBe('title');
    }
  });

  it('parses layout with color map override', () => {
    const body = `
  <p:clrMapOvr>
    <a:overrideClrMapping bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2"
      accent1="accent1" accent2="accent2" accent3="accent3"
      accent4="accent4" accent5="accent5" accent6="accent6"
      hlink="hlink" folHlink="folHlink"/>
  </p:clrMapOvr>`;
    const xml = parseXml(makeLayoutXml('', body));
    const result = parseSlideLayout(
      xml,
      '/ppt/slideLayouts/slideLayout1.xml',
      '/ppt/slideMasters/slideMaster1.xml',
      minimalTheme()
    );

    expect(result.colorMap).toBeDefined();
    expect(result.colorMap?.bg1).toBe('dk1');
    expect(result.colorMap?.tx1).toBe('lt1');
  });
});
