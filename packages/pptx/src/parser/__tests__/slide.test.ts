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

  it('parses a shape with solid fill and text body via core parsers', () => {
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
          <p:cNvPr id="4" name="Filled Box"/>
          <p:cNvSpPr/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="100000" y="200000"/>
            <a:ext cx="3000000" cy="1500000"/>
          </a:xfrm>
          <a:prstGeom prst="roundRect">
            <a:avLst>
              <a:gd name="adj" fmla="val 16667"/>
            </a:avLst>
          </a:prstGeom>
          <a:solidFill>
            <a:srgbClr val="0070C0"/>
          </a:solidFill>
          <a:ln w="25400">
            <a:solidFill>
              <a:srgbClr val="002060"/>
            </a:solidFill>
          </a:ln>
        </p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square" anchor="ctr"/>
          <a:p>
            <a:r>
              <a:rPr lang="en-US" sz="2400" b="1"/>
              <a:t>Hello World</a:t>
            </a:r>
          </a:p>
        </p:txBody>
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

    expect(result.elements).toHaveLength(1);
    const shape = result.elements[0];
    expect(shape.kind).toBe('shape');

    if (shape.kind === 'shape') {
      // Transform
      expect(shape.properties.transform?.position).toEqual({ x: 100000, y: 200000 });
      expect(shape.properties.transform?.size).toEqual({ width: 3000000, height: 1500000 });

      // Geometry — preset with adjust value
      expect(shape.properties.geometry).toBeDefined();
      expect(shape.properties.geometry?.kind).toBe('preset');
      if (shape.properties.geometry?.kind === 'preset') {
        expect(shape.properties.geometry.name).toBe('roundRect');
        expect(shape.properties.geometry.adjustValues).toEqual({ adj: 16667 });
      }

      // Fill — solid blue
      expect(shape.properties.fill).toBeDefined();
      expect(shape.properties.fill?.type).toBe('solid');
      if (shape.properties.fill?.type === 'solid') {
        expect(shape.properties.fill.color).toEqual({ r: 0, g: 112, b: 192, a: 1 });
      }

      // Line — 25400 EMU, dark blue
      expect(shape.properties.line).toBeDefined();
      expect(shape.properties.line?.width).toBe(25400);
      expect(shape.properties.line?.color).toEqual({ r: 0, g: 32, b: 96, a: 1 });

      // Text body
      expect(shape.textBody).toBeDefined();
      expect(shape.textBody?.paragraphs).toHaveLength(1);
      const run = shape.textBody?.paragraphs[0]?.runs[0];
      expect(run?.kind).toBe('run');
      if (run?.kind === 'run') {
        expect(run.text).toBe('Hello World');
        expect(run.properties.fontSize).toBe(2400);
        expect(run.properties.bold).toBe(true);
      }
    }
  });

  it('parses a graphic frame containing a table', () => {
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
      <p:graphicFrame>
        <p:nvGraphicFramePr>
          <p:cNvPr id="5" name="Table 4"/>
          <p:cNvGraphicFramePr/>
          <p:nvPr/>
        </p:nvGraphicFramePr>
        <p:xfrm>
          <a:off x="500000" y="1000000"/>
          <a:ext cx="8000000" cy="3000000"/>
        </p:xfrm>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
            <a:tbl>
              <a:tblGrid>
                <a:gridCol w="4000000"/>
                <a:gridCol w="4000000"/>
              </a:tblGrid>
              <a:tr h="600000">
                <a:tc>
                  <a:txBody>
                    <a:bodyPr/>
                    <a:p>
                      <a:r>
                        <a:rPr lang="en-US"/>
                        <a:t>Cell A1</a:t>
                      </a:r>
                    </a:p>
                  </a:txBody>
                  <a:tcPr/>
                </a:tc>
                <a:tc>
                  <a:txBody>
                    <a:bodyPr/>
                    <a:p>
                      <a:r>
                        <a:rPr lang="en-US"/>
                        <a:t>Cell B1</a:t>
                      </a:r>
                    </a:p>
                  </a:txBody>
                  <a:tcPr/>
                </a:tc>
              </a:tr>
            </a:tbl>
          </a:graphicData>
        </a:graphic>
      </p:graphicFrame>
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

    expect(result.elements).toHaveLength(1);
    const table = result.elements[0];
    expect(table.kind).toBe('table');

    if (table.kind === 'table') {
      // Transform from p:xfrm
      expect(table.properties.transform?.position).toEqual({ x: 500000, y: 1000000 });
      expect(table.properties.transform?.size).toEqual({ width: 8000000, height: 3000000 });

      // Column widths
      expect(table.columnWidths).toEqual([4000000, 4000000]);

      // Rows and cells
      expect(table.rows).toHaveLength(1);
      expect(table.rows[0].height).toBe(600000);
      expect(table.rows[0].cells).toHaveLength(2);

      // Cell text content
      const cellA1 = table.rows[0].cells[0];
      expect(cellA1.textBody?.paragraphs[0]?.runs[0]).toMatchObject({
        kind: 'run',
        text: 'Cell A1',
      });
    }
  });

  it('keeps unsupported graphic frames for non-table content', () => {
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
      <p:graphicFrame>
        <p:nvGraphicFramePr>
          <p:cNvPr id="6" name="Chart 5"/>
          <p:cNvGraphicFramePr/>
          <p:nvPr/>
        </p:nvGraphicFramePr>
        <p:xfrm>
          <a:off x="100000" y="100000"/>
          <a:ext cx="5000000" cy="3000000"/>
        </p:xfrm>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
            <!-- chart data would be here -->
          </a:graphicData>
        </a:graphic>
      </p:graphicFrame>
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

    expect(result.elements).toHaveLength(1);
    const el = result.elements[0];
    expect(el.kind).toBe('unsupported');
    if (el.kind === 'unsupported') {
      expect(el.elementType).toBe('p:graphicFrame');
    }
  });

  it('parses a connector with full properties via core parsers', () => {
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
      <p:cxnSp>
        <p:nvCxnSpPr>
          <p:cNvPr id="7" name="Connector 6"/>
          <p:cNvCxnSpPr>
            <a:stCxn id="2" idx="3"/>
            <a:endCxn id="3" idx="1"/>
          </p:cNvCxnSpPr>
          <p:nvPr/>
        </p:nvCxnSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="300000" y="400000"/>
            <a:ext cx="2000000" cy="500000"/>
          </a:xfrm>
          <a:prstGeom prst="straightConnector1"/>
          <a:ln w="12700">
            <a:solidFill>
              <a:srgbClr val="FF0000"/>
            </a:solidFill>
          </a:ln>
        </p:spPr>
      </p:cxnSp>
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

    expect(result.elements).toHaveLength(1);
    const connector = result.elements[0];
    expect(connector.kind).toBe('connector');

    if (connector.kind === 'connector') {
      // Transform
      expect(connector.properties.transform?.position).toEqual({ x: 300000, y: 400000 });
      expect(connector.properties.transform?.size).toEqual({ width: 2000000, height: 500000 });

      // Line properties parsed via core
      expect(connector.properties.line?.width).toBe(12700);
      expect(connector.properties.line?.color).toEqual({ r: 255, g: 0, b: 0, a: 1 });

      // Connection references
      expect(connector.startConnection).toEqual({ shapeId: '2', connectionSiteIndex: 3 });
      expect(connector.endConnection).toEqual({ shapeId: '3', connectionSiteIndex: 1 });
    }
  });
});
