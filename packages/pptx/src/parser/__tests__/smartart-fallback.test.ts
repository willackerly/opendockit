import { describe, it, expect, vi } from 'vitest';
import { parseXml } from '@opendockit/core';
import type { ThemeIR, SlideElementIR, UnsupportedIR } from '@opendockit/core';
import type { OpcPackage } from '@opendockit/core/opc';
import type { RelationshipMap, Relationship } from '@opendockit/core/opc';
import { resolveSmartArtFallbacks } from '../smartart-fallback.js';
import type { SlideIR } from '../../model/index.js';

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
// Helper: mock OPC package
// ---------------------------------------------------------------------------

const DIAGRAM_DRAWING_REL_TYPE =
  'http://schemas.microsoft.com/office/2007/relationships/diagramDrawing';

const DSP_NS = [
  'xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
].join(' ');

function createMockPkg(opts: {
  drawingXml?: string;
  drawingPartUri?: string;
  diagramDrawingRels?: Relationship[];
}): OpcPackage {
  const drawingPartUri = opts.drawingPartUri ?? '/ppt/diagrams/drawing1.xml';
  const diagramDrawingRels = opts.diagramDrawingRels ?? [
    {
      id: 'rId6',
      type: DIAGRAM_DRAWING_REL_TYPE,
      target: drawingPartUri,
    },
  ];

  const mockRelMap: RelationshipMap = {
    getById: (id: string) => diagramDrawingRels.find((r) => r.id === id),
    getByType: (type: string) => diagramDrawingRels.filter((r) => r.type === type),
    all: () => diagramDrawingRels,
  };

  return {
    getPart: vi.fn(),
    getPartText: vi.fn(),
    getPartXml: vi.fn().mockImplementation(async (uri: string) => {
      if (uri === drawingPartUri && opts.drawingXml) {
        return parseXml(opts.drawingXml);
      }
      throw new Error(`Part not found: ${uri}`);
    }),
    getPartRelationships: vi.fn().mockResolvedValue(mockRelMap),
    getRootRelationships: vi.fn(),
    getContentTypes: vi.fn(),
    listParts: vi.fn().mockReturnValue([]),
    resolveRelTarget: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Helper: slide XML with diagram graphicFrame
// ---------------------------------------------------------------------------

const SLIDE_XML_NS = [
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"',
].join(' ');

function makeSlideXmlWithDiagram(
  xOff = '2032000',
  yOff = '719666',
  cx = '8128000',
  cy = '5418667'
) {
  return parseXml(`
    <p:sld ${SLIDE_XML_NS}>
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
              <p:cNvPr id="4" name="Diagram 3"/>
              <p:cNvGraphicFramePr/>
              <p:nvPr/>
            </p:nvGraphicFramePr>
            <p:xfrm>
              <a:off x="${xOff}" y="${yOff}"/>
              <a:ext cx="${cx}" cy="${cy}"/>
            </p:xfrm>
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram">
                <dgm:relIds r:dm="rId2" r:lo="rId3" r:qs="rId4" r:cs="rId5"/>
              </a:graphicData>
            </a:graphic>
          </p:graphicFrame>
        </p:spTree>
      </p:cSld>
    </p:sld>
  `);
}

function makeDrawingXml() {
  return `
    <dsp:drawing ${DSP_NS}>
      <dsp:spTree>
        <dsp:nvGrpSpPr>
          <dsp:cNvPr id="0" name=""/>
          <dsp:cNvGrpSpPr/>
        </dsp:nvGrpSpPr>
        <dsp:grpSpPr/>
        <dsp:sp>
          <dsp:nvSpPr>
            <dsp:cNvPr id="1" name="Box 1"/>
            <dsp:cNvSpPr/>
          </dsp:nvSpPr>
          <dsp:spPr>
            <a:xfrm>
              <a:off x="100000" y="200000"/>
              <a:ext cx="300000" cy="400000"/>
            </a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            <a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>
          </dsp:spPr>
          <dsp:txBody>
            <a:bodyPr wrap="square" anchor="ctr"/>
            <a:lstStyle/>
            <a:p>
              <a:r><a:rPr lang="en-US" sz="1200"/><a:t>Hello</a:t></a:r>
            </a:p>
          </dsp:txBody>
        </dsp:sp>
        <dsp:sp>
          <dsp:nvSpPr>
            <dsp:cNvPr id="2" name="Box 2"/>
            <dsp:cNvSpPr/>
          </dsp:nvSpPr>
          <dsp:spPr>
            <a:xfrm>
              <a:off x="500000" y="200000"/>
              <a:ext cx="300000" cy="400000"/>
            </a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            <a:solidFill><a:srgbClr val="0000FF"/></a:solidFill>
          </dsp:spPr>
        </dsp:sp>
      </dsp:spTree>
    </dsp:drawing>
  `;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveSmartArtFallbacks', () => {
  const theme = minimalTheme();

  it('replaces unsupported diagram graphicFrame with group containing fallback shapes', async () => {
    const slideXml = makeSlideXmlWithDiagram();
    const slide: SlideIR = {
      partUri: '/ppt/slides/slide1.xml',
      elements: [
        {
          kind: 'unsupported',
          elementType: 'p:graphicFrame',
          reason: 'Graphic frame content (table/chart/SmartArt) not yet supported',
        },
      ],
      layoutPartUri: '/ppt/slideLayouts/slideLayout1.xml',
      masterPartUri: '/ppt/slideMasters/slideMaster1.xml',
    };

    const pkg = createMockPkg({ drawingXml: makeDrawingXml() });

    await resolveSmartArtFallbacks(slide, slideXml, pkg, '/ppt/slides/slide1.xml', theme);

    // Should have replaced the unsupported entry with a group
    expect(slide.elements).toHaveLength(1);
    expect(slide.elements[0].kind).toBe('group');

    if (slide.elements[0].kind === 'group') {
      const group = slide.elements[0];

      // Group should have the graphicFrame's transform
      expect(group.properties.transform).toEqual({
        position: { x: 2032000, y: 719666 },
        size: { width: 8128000, height: 5418667 },
      });

      // Group should contain 2 fallback shapes
      expect(group.children).toHaveLength(2);
      expect(group.children[0].kind).toBe('shape');
      expect(group.children[1].kind).toBe('shape');

      if (group.children[0].kind === 'shape') {
        expect(group.children[0].name).toBe('Box 1');
        expect(group.children[0].textBody).toBeDefined();
      }

      if (group.children[1].kind === 'shape') {
        expect(group.children[1].name).toBe('Box 2');
      }

      // Child coordinate space should encompass all shapes
      expect(group.childOffset).toEqual({ x: 100000, y: 200000 });
      expect(group.childExtent).toEqual({
        width: 700000, // 800000 - 100000
        height: 400000, // 600000 - 200000
      });
    }
  });

  it('does nothing when no unsupported graphicFrames exist', async () => {
    const slideXml = parseXml(`
      <p:sld ${SLIDE_XML_NS}>
        <p:cSld>
          <p:spTree>
            <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
            <p:grpSpPr/>
          </p:spTree>
        </p:cSld>
      </p:sld>
    `);

    const elements: SlideElementIR[] = [{ kind: 'shape', properties: { effects: [] } }];
    const slide: SlideIR = {
      partUri: '/ppt/slides/slide1.xml',
      elements,
      layoutPartUri: '',
      masterPartUri: '',
    };

    const pkg = createMockPkg({ drawingXml: makeDrawingXml() });

    await resolveSmartArtFallbacks(slide, slideXml, pkg, '/ppt/slides/slide1.xml', theme);

    // Should not have modified the elements
    expect(slide.elements).toHaveLength(1);
    expect(slide.elements[0].kind).toBe('shape');
  });

  it('handles missing drawing part gracefully', async () => {
    const slideXml = makeSlideXmlWithDiagram();
    const unsupported: UnsupportedIR = {
      kind: 'unsupported',
      elementType: 'p:graphicFrame',
      reason: 'test',
    };
    const slide: SlideIR = {
      partUri: '/ppt/slides/slide1.xml',
      elements: [unsupported],
      layoutPartUri: '',
      masterPartUri: '',
    };

    // Package that throws when trying to read the drawing part
    const pkg = createMockPkg({});

    await resolveSmartArtFallbacks(slide, slideXml, pkg, '/ppt/slides/slide1.xml', theme);

    // Should remain unsupported (no crash)
    expect(slide.elements).toHaveLength(1);
    expect(slide.elements[0].kind).toBe('unsupported');
  });

  it('handles empty drawing part gracefully', async () => {
    const slideXml = makeSlideXmlWithDiagram();
    const slide: SlideIR = {
      partUri: '/ppt/slides/slide1.xml',
      elements: [
        {
          kind: 'unsupported',
          elementType: 'p:graphicFrame',
          reason: 'test',
        },
      ],
      layoutPartUri: '',
      masterPartUri: '',
    };

    // Drawing with no shapes
    const pkg = createMockPkg({
      drawingXml: `
        <dsp:drawing ${DSP_NS}>
          <dsp:spTree>
            <dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr>
            <dsp:grpSpPr/>
          </dsp:spTree>
        </dsp:drawing>
      `,
    });

    await resolveSmartArtFallbacks(slide, slideXml, pkg, '/ppt/slides/slide1.xml', theme);

    // Should remain unsupported (empty drawing = no shapes to render)
    expect(slide.elements).toHaveLength(1);
    expect(slide.elements[0].kind).toBe('unsupported');
  });

  it('skips non-diagram graphicFrames (charts, OLE)', async () => {
    const slideXml = parseXml(`
      <p:sld ${SLIDE_XML_NS}>
        <p:cSld>
          <p:spTree>
            <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
            <p:grpSpPr/>
            <p:graphicFrame>
              <p:nvGraphicFramePr>
                <p:cNvPr id="2" name="Chart 1"/>
                <p:cNvGraphicFramePr/>
                <p:nvPr/>
              </p:nvGraphicFramePr>
              <p:xfrm>
                <a:off x="0" y="0"/>
                <a:ext cx="1000000" cy="1000000"/>
              </p:xfrm>
              <a:graphic>
                <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/>
              </a:graphic>
            </p:graphicFrame>
          </p:spTree>
        </p:cSld>
      </p:sld>
    `);

    const slide: SlideIR = {
      partUri: '/ppt/slides/slide1.xml',
      elements: [
        {
          kind: 'unsupported',
          elementType: 'p:graphicFrame',
          reason: 'chart not supported',
        },
      ],
      layoutPartUri: '',
      masterPartUri: '',
    };

    const pkg = createMockPkg({ drawingXml: makeDrawingXml() });

    await resolveSmartArtFallbacks(slide, slideXml, pkg, '/ppt/slides/slide1.xml', theme);

    // Should remain unsupported (chart, not diagram)
    expect(slide.elements).toHaveLength(1);
    expect(slide.elements[0].kind).toBe('unsupported');
  });

  it('handles no diagramDrawing relationships gracefully', async () => {
    const slideXml = makeSlideXmlWithDiagram();
    const slide: SlideIR = {
      partUri: '/ppt/slides/slide1.xml',
      elements: [
        {
          kind: 'unsupported',
          elementType: 'p:graphicFrame',
          reason: 'test',
        },
      ],
      layoutPartUri: '',
      masterPartUri: '',
    };

    // No diagram drawing relationships
    const pkg = createMockPkg({ diagramDrawingRels: [] });

    await resolveSmartArtFallbacks(slide, slideXml, pkg, '/ppt/slides/slide1.xml', theme);

    // Should remain unsupported
    expect(slide.elements).toHaveLength(1);
    expect(slide.elements[0].kind).toBe('unsupported');
  });

  it('preserves non-graphicFrame elements alongside resolved SmartArt', async () => {
    const slideXml = parseXml(`
      <p:sld ${SLIDE_XML_NS}>
        <p:cSld>
          <p:spTree>
            <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
            <p:grpSpPr/>
            <p:sp>
              <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
              <p:spPr/>
            </p:sp>
            <p:graphicFrame>
              <p:nvGraphicFramePr>
                <p:cNvPr id="3" name="Diagram"/>
                <p:cNvGraphicFramePr/>
                <p:nvPr/>
              </p:nvGraphicFramePr>
              <p:xfrm>
                <a:off x="0" y="0"/>
                <a:ext cx="5000000" cy="3000000"/>
              </p:xfrm>
              <a:graphic>
                <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram">
                  <dgm:relIds r:dm="rId2" r:lo="rId3" r:qs="rId4" r:cs="rId5"/>
                </a:graphicData>
              </a:graphic>
            </p:graphicFrame>
          </p:spTree>
        </p:cSld>
      </p:sld>
    `);

    const slide: SlideIR = {
      partUri: '/ppt/slides/slide1.xml',
      elements: [
        { kind: 'shape', properties: { effects: [] }, name: 'Title' },
        {
          kind: 'unsupported',
          elementType: 'p:graphicFrame',
          reason: 'test',
        },
      ],
      layoutPartUri: '',
      masterPartUri: '',
    };

    const pkg = createMockPkg({ drawingXml: makeDrawingXml() });

    await resolveSmartArtFallbacks(slide, slideXml, pkg, '/ppt/slides/slide1.xml', theme);

    // First element should still be the shape
    expect(slide.elements).toHaveLength(2);
    expect(slide.elements[0].kind).toBe('shape');

    // Second element should now be a group (resolved SmartArt)
    expect(slide.elements[1].kind).toBe('group');
  });
});
