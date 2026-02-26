import { describe, it, expect } from 'vitest';
import { parseDiagramDrawing, parseDiagramShapeTree } from '../diagram-drawing.js';
import { parseXml } from '../../../xml/index.js';
import type { ThemeIR } from '../../../ir/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Helper: minimal theme for color resolution
// ═══════════════════════════════════════════════════════════════════════════

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
      fillStyles: [
        { type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } },
        { type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } },
        { type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } },
      ],
      lineStyles: [{}, {}, {}],
      effectStyles: [[], [], []],
      bgFillStyles: [
        { type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 } },
        { type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 } },
        { type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 } },
      ],
    },
  };
}

// Namespace declarations for diagram drawing XML
const DSP_NS = [
  'xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram"',
  'xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
].join(' ');

// ═══════════════════════════════════════════════════════════════════════════
// Tests: parseDiagramDrawing
// ═══════════════════════════════════════════════════════════════════════════

describe('parseDiagramDrawing', () => {
  const theme = minimalTheme();

  it('parses a drawing with multiple shapes', () => {
    const xml = parseXml(`
      <dsp:drawing ${DSP_NS}>
        <dsp:spTree>
          <dsp:nvGrpSpPr>
            <dsp:cNvPr id="0" name=""/>
            <dsp:cNvGrpSpPr/>
          </dsp:nvGrpSpPr>
          <dsp:grpSpPr/>
          <dsp:sp modelId="{GUID-1}">
            <dsp:nvSpPr>
              <dsp:cNvPr id="1" name="Shape 1"/>
              <dsp:cNvSpPr/>
            </dsp:nvSpPr>
            <dsp:spPr>
              <a:xfrm>
                <a:off x="100000" y="200000"/>
                <a:ext cx="300000" cy="400000"/>
              </a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              <a:solidFill>
                <a:srgbClr val="FF0000"/>
              </a:solidFill>
            </dsp:spPr>
          </dsp:sp>
          <dsp:sp modelId="{GUID-2}">
            <dsp:nvSpPr>
              <dsp:cNvPr id="2" name="Shape 2"/>
              <dsp:cNvSpPr/>
            </dsp:nvSpPr>
            <dsp:spPr>
              <a:xfrm>
                <a:off x="500000" y="600000"/>
                <a:ext cx="700000" cy="800000"/>
              </a:xfrm>
              <a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>
            </dsp:spPr>
          </dsp:sp>
        </dsp:spTree>
      </dsp:drawing>
    `);

    const elements = parseDiagramDrawing(xml, theme);

    expect(elements).toHaveLength(2);

    // First shape
    expect(elements[0].kind).toBe('shape');
    if (elements[0].kind === 'shape') {
      expect(elements[0].id).toBe('1');
      expect(elements[0].name).toBe('Shape 1');
      expect(elements[0].properties.transform).toEqual({
        position: { x: 100000, y: 200000 },
        size: { width: 300000, height: 400000 },
      });
      expect(elements[0].properties.fill).toEqual({
        type: 'solid',
        color: { r: 255, g: 0, b: 0, a: 1 },
      });
      expect(elements[0].properties.geometry).toMatchObject({
        kind: 'preset',
        name: 'rect',
      });
    }

    // Second shape
    expect(elements[1].kind).toBe('shape');
    if (elements[1].kind === 'shape') {
      expect(elements[1].id).toBe('2');
      expect(elements[1].name).toBe('Shape 2');
      expect(elements[1].properties.transform).toEqual({
        position: { x: 500000, y: 600000 },
        size: { width: 700000, height: 800000 },
      });
      expect(elements[1].properties.geometry).toMatchObject({
        kind: 'preset',
        name: 'ellipse',
      });
    }
  });

  it('parses shape with text body', () => {
    const xml = parseXml(`
      <dsp:drawing ${DSP_NS}>
        <dsp:spTree>
          <dsp:nvGrpSpPr>
            <dsp:cNvPr id="0" name=""/>
            <dsp:cNvGrpSpPr/>
          </dsp:nvGrpSpPr>
          <dsp:grpSpPr/>
          <dsp:sp>
            <dsp:nvSpPr>
              <dsp:cNvPr id="0" name=""/>
              <dsp:cNvSpPr/>
            </dsp:nvSpPr>
            <dsp:spPr>
              <a:xfrm>
                <a:off x="0" y="0"/>
                <a:ext cx="1000000" cy="500000"/>
              </a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            </dsp:spPr>
            <dsp:txBody>
              <a:bodyPr wrap="square" anchor="ctr"/>
              <a:lstStyle/>
              <a:p>
                <a:r>
                  <a:rPr lang="en-US" sz="1200"/>
                  <a:t>Hello SmartArt</a:t>
                </a:r>
              </a:p>
            </dsp:txBody>
          </dsp:sp>
        </dsp:spTree>
      </dsp:drawing>
    `);

    const elements = parseDiagramDrawing(xml, theme);

    expect(elements).toHaveLength(1);
    expect(elements[0].kind).toBe('shape');
    if (elements[0].kind === 'shape') {
      expect(elements[0].textBody).toBeDefined();
      expect(elements[0].textBody!.paragraphs).toHaveLength(1);
      expect(elements[0].textBody!.paragraphs[0].runs).toHaveLength(1);
      const run = elements[0].textBody!.paragraphs[0].runs[0];
      expect(run.kind).toBe('run');
      if (run.kind === 'run') {
        expect(run.text).toBe('Hello SmartArt');
        expect(run.properties.fontSize).toBe(1200);
      }
    }
  });

  it('parses shape with style reference', () => {
    const xml = parseXml(`
      <dsp:drawing ${DSP_NS}>
        <dsp:spTree>
          <dsp:nvGrpSpPr>
            <dsp:cNvPr id="0" name=""/>
            <dsp:cNvGrpSpPr/>
          </dsp:nvGrpSpPr>
          <dsp:grpSpPr/>
          <dsp:sp>
            <dsp:nvSpPr>
              <dsp:cNvPr id="0" name=""/>
              <dsp:cNvSpPr/>
            </dsp:nvSpPr>
            <dsp:spPr>
              <a:xfrm>
                <a:off x="0" y="0"/>
                <a:ext cx="1000000" cy="500000"/>
              </a:xfrm>
            </dsp:spPr>
            <dsp:style>
              <a:lnRef idx="2">
                <a:schemeClr val="accent1"/>
              </a:lnRef>
              <a:fillRef idx="1">
                <a:schemeClr val="accent1"/>
              </a:fillRef>
              <a:effectRef idx="0">
                <a:schemeClr val="accent1"/>
              </a:effectRef>
              <a:fontRef idx="minor">
                <a:schemeClr val="lt1"/>
              </a:fontRef>
            </dsp:style>
          </dsp:sp>
        </dsp:spTree>
      </dsp:drawing>
    `);

    const elements = parseDiagramDrawing(xml, theme);

    expect(elements).toHaveLength(1);
    expect(elements[0].kind).toBe('shape');
    if (elements[0].kind === 'shape') {
      expect(elements[0].style).toBeDefined();
      expect(elements[0].style!.lnRef).toMatchObject({
        idx: 2,
        color: { r: 68, g: 114, b: 196, a: 1 },
      });
      expect(elements[0].style!.fillRef).toMatchObject({
        idx: 1,
        color: { r: 68, g: 114, b: 196, a: 1 },
      });
      expect(elements[0].style!.fontRef).toMatchObject({
        idx: 'minor',
        color: { r: 255, g: 255, b: 255, a: 1 },
      });
    }
  });

  it('returns empty array when no spTree exists', () => {
    const xml = parseXml(`<dsp:drawing ${DSP_NS}></dsp:drawing>`);
    const elements = parseDiagramDrawing(xml, theme);
    expect(elements).toHaveLength(0);
  });

  it('returns empty array when spTree has no shapes', () => {
    const xml = parseXml(`
      <dsp:drawing ${DSP_NS}>
        <dsp:spTree>
          <dsp:nvGrpSpPr>
            <dsp:cNvPr id="0" name=""/>
            <dsp:cNvGrpSpPr/>
          </dsp:nvGrpSpPr>
          <dsp:grpSpPr/>
        </dsp:spTree>
      </dsp:drawing>
    `);

    const elements = parseDiagramDrawing(xml, theme);
    expect(elements).toHaveLength(0);
  });

  it('skips metadata elements in shape tree', () => {
    const xml = parseXml(`
      <dsp:drawing ${DSP_NS}>
        <dsp:spTree>
          <dsp:nvGrpSpPr>
            <dsp:cNvPr id="0" name=""/>
            <dsp:cNvGrpSpPr/>
          </dsp:nvGrpSpPr>
          <dsp:grpSpPr/>
          <dsp:extLst/>
          <dsp:sp>
            <dsp:nvSpPr>
              <dsp:cNvPr id="1" name="Shape"/>
              <dsp:cNvSpPr/>
            </dsp:nvSpPr>
            <dsp:spPr>
              <a:xfrm>
                <a:off x="0" y="0"/>
                <a:ext cx="100" cy="100"/>
              </a:xfrm>
            </dsp:spPr>
          </dsp:sp>
        </dsp:spTree>
      </dsp:drawing>
    `);

    const elements = parseDiagramDrawing(xml, theme);
    expect(elements).toHaveLength(1);
    expect(elements[0].kind).toBe('shape');
  });

  it('parses shapes with line properties', () => {
    const xml = parseXml(`
      <dsp:drawing ${DSP_NS}>
        <dsp:spTree>
          <dsp:nvGrpSpPr>
            <dsp:cNvPr id="0" name=""/>
            <dsp:cNvGrpSpPr/>
          </dsp:nvGrpSpPr>
          <dsp:grpSpPr/>
          <dsp:sp>
            <dsp:nvSpPr>
              <dsp:cNvPr id="0" name=""/>
              <dsp:cNvSpPr/>
            </dsp:nvSpPr>
            <dsp:spPr>
              <a:xfrm>
                <a:off x="0" y="0"/>
                <a:ext cx="1000000" cy="500000"/>
              </a:xfrm>
              <a:ln w="12700">
                <a:solidFill>
                  <a:srgbClr val="0000FF"/>
                </a:solidFill>
              </a:ln>
            </dsp:spPr>
          </dsp:sp>
        </dsp:spTree>
      </dsp:drawing>
    `);

    const elements = parseDiagramDrawing(xml, theme);

    expect(elements).toHaveLength(1);
    expect(elements[0].kind).toBe('shape');
    if (elements[0].kind === 'shape') {
      expect(elements[0].properties.line).toBeDefined();
      expect(elements[0].properties.line!.width).toBe(12700);
      expect(elements[0].properties.line!.color).toEqual({
        r: 0,
        g: 0,
        b: 255,
        a: 1,
      });
    }
  });

  it('excludes empty-name shapes from name property', () => {
    const xml = parseXml(`
      <dsp:drawing ${DSP_NS}>
        <dsp:spTree>
          <dsp:nvGrpSpPr>
            <dsp:cNvPr id="0" name=""/>
            <dsp:cNvGrpSpPr/>
          </dsp:nvGrpSpPr>
          <dsp:grpSpPr/>
          <dsp:sp>
            <dsp:nvSpPr>
              <dsp:cNvPr id="0" name=""/>
              <dsp:cNvSpPr/>
            </dsp:nvSpPr>
            <dsp:spPr>
              <a:xfrm>
                <a:off x="0" y="0"/>
                <a:ext cx="100" cy="100"/>
              </a:xfrm>
            </dsp:spPr>
          </dsp:sp>
        </dsp:spTree>
      </dsp:drawing>
    `);

    const elements = parseDiagramDrawing(xml, theme);
    expect(elements).toHaveLength(1);
    if (elements[0].kind === 'shape') {
      // Empty name should not be set on the shape
      expect(elements[0].name).toBeUndefined();
    }
  });
});

describe('parseDiagramShapeTree', () => {
  const theme = minimalTheme();

  it('parses a standalone shape tree element', () => {
    const xml = parseXml(`
      <dsp:spTree ${DSP_NS}>
        <dsp:nvGrpSpPr>
          <dsp:cNvPr id="0" name=""/>
          <dsp:cNvGrpSpPr/>
        </dsp:nvGrpSpPr>
        <dsp:grpSpPr/>
        <dsp:sp>
          <dsp:nvSpPr>
            <dsp:cNvPr id="1" name="Test"/>
            <dsp:cNvSpPr/>
          </dsp:nvSpPr>
          <dsp:spPr>
            <a:xfrm>
              <a:off x="0" y="0"/>
              <a:ext cx="500000" cy="500000"/>
            </a:xfrm>
          </dsp:spPr>
        </dsp:sp>
      </dsp:spTree>
    `);

    const elements = parseDiagramShapeTree(xml, theme);

    expect(elements).toHaveLength(1);
    expect(elements[0].kind).toBe('shape');
    if (elements[0].kind === 'shape') {
      expect(elements[0].id).toBe('1');
      expect(elements[0].name).toBe('Test');
    }
  });
});
