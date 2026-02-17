import { describe, it, expect } from 'vitest';
import { parseGroup, parseShapeTreeChildren } from '../group.js';
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

// Namespace declarations reused across XML fragments
const NS = [
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
].join(' ');

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('parseGroup', () => {
  const theme = minimalTheme();

  // -----------------------------------------------------------------------
  // Group with child shapes
  // -----------------------------------------------------------------------
  it('parses group with child shapes', () => {
    const xml = parseXml(`
      <p:grpSp ${NS}>
        <p:nvGrpSpPr>
          <p:cNvPr id="2" name="Group 1"/>
          <p:cNvGrpSpPr/>
          <p:nvPr/>
        </p:nvGrpSpPr>
        <p:grpSpPr>
          <a:xfrm>
            <a:off x="0" y="0"/>
            <a:ext cx="9144000" cy="6858000"/>
            <a:chOff x="0" y="0"/>
            <a:chExt cx="9144000" cy="6858000"/>
          </a:xfrm>
        </p:grpSpPr>
        <p:sp>
          <p:nvSpPr>
            <p:cNvPr id="3" name="Rectangle 1"/>
            <p:cNvSpPr/>
            <p:nvPr/>
          </p:nvSpPr>
          <p:spPr>
            <a:xfrm>
              <a:off x="100" y="200"/>
              <a:ext cx="300" cy="400"/>
            </a:xfrm>
          </p:spPr>
        </p:sp>
        <p:sp>
          <p:nvSpPr>
            <p:cNvPr id="4" name="Ellipse 1"/>
            <p:cNvSpPr/>
            <p:nvPr/>
          </p:nvSpPr>
          <p:spPr/>
        </p:sp>
      </p:grpSp>
    `);

    const result = parseGroup(xml, theme);

    expect(result.kind).toBe('group');
    expect(result.childOffset).toEqual({ x: 0, y: 0 });
    expect(result.childExtent).toEqual({ width: 9144000, height: 6858000 });
    expect(result.children).toHaveLength(2);
    expect(result.children[0].kind).toBe('shape');
    expect(result.children[1].kind).toBe('shape');

    if (result.children[0].kind === 'shape') {
      expect(result.children[0].id).toBe('3');
      expect(result.children[0].name).toBe('Rectangle 1');
    }
  });

  // -----------------------------------------------------------------------
  // Group with nested group (recursive)
  // -----------------------------------------------------------------------
  it('parses nested groups recursively', () => {
    const xml = parseXml(`
      <p:grpSp ${NS}>
        <p:nvGrpSpPr>
          <p:cNvPr id="2" name="Outer"/>
          <p:cNvGrpSpPr/>
          <p:nvPr/>
        </p:nvGrpSpPr>
        <p:grpSpPr>
          <a:xfrm>
            <a:off x="0" y="0"/>
            <a:ext cx="1000" cy="1000"/>
            <a:chOff x="0" y="0"/>
            <a:chExt cx="1000" cy="1000"/>
          </a:xfrm>
        </p:grpSpPr>
        <p:grpSp>
          <p:nvGrpSpPr>
            <p:cNvPr id="5" name="Inner"/>
            <p:cNvGrpSpPr/>
            <p:nvPr/>
          </p:nvGrpSpPr>
          <p:grpSpPr>
            <a:xfrm>
              <a:off x="100" y="100"/>
              <a:ext cx="500" cy="500"/>
              <a:chOff x="0" y="0"/>
              <a:chExt cx="500" cy="500"/>
            </a:xfrm>
          </p:grpSpPr>
          <p:sp>
            <p:nvSpPr>
              <p:cNvPr id="6" name="Inner Shape"/>
              <p:cNvSpPr/>
              <p:nvPr/>
            </p:nvSpPr>
            <p:spPr/>
          </p:sp>
        </p:grpSp>
      </p:grpSp>
    `);

    const result = parseGroup(xml, theme);

    expect(result.kind).toBe('group');
    expect(result.children).toHaveLength(1);

    const innerGroup = result.children[0];
    expect(innerGroup.kind).toBe('group');
    if (innerGroup.kind === 'group') {
      expect(innerGroup.childOffset).toEqual({ x: 0, y: 0 });
      expect(innerGroup.childExtent).toEqual({ width: 500, height: 500 });
      expect(innerGroup.children).toHaveLength(1);
      expect(innerGroup.children[0].kind).toBe('shape');
    }
  });

  // -----------------------------------------------------------------------
  // Group with mixed children (shape + picture)
  // -----------------------------------------------------------------------
  it('parses group with mixed children (shape + picture)', () => {
    const xml = parseXml(`
      <p:grpSp ${NS}>
        <p:nvGrpSpPr>
          <p:cNvPr id="2" name="Group 1"/>
          <p:cNvGrpSpPr/>
          <p:nvPr/>
        </p:nvGrpSpPr>
        <p:grpSpPr>
          <a:xfrm>
            <a:off x="0" y="0"/>
            <a:ext cx="1000" cy="1000"/>
            <a:chOff x="0" y="0"/>
            <a:chExt cx="1000" cy="1000"/>
          </a:xfrm>
        </p:grpSpPr>
        <p:sp>
          <p:nvSpPr>
            <p:cNvPr id="3" name="Shape 1"/>
            <p:cNvSpPr/>
            <p:nvPr/>
          </p:nvSpPr>
          <p:spPr/>
        </p:sp>
        <p:pic>
          <p:nvPicPr>
            <p:cNvPr id="4" name="Picture 1"/>
            <p:cNvPicPr/>
            <p:nvPr/>
          </p:nvPicPr>
          <p:blipFill>
            <a:blip r:embed="rId2"/>
            <a:stretch><a:fillRect/></a:stretch>
          </p:blipFill>
          <p:spPr>
            <a:xfrm>
              <a:off x="0" y="0"/>
              <a:ext cx="500" cy="500"/>
            </a:xfrm>
          </p:spPr>
        </p:pic>
      </p:grpSp>
    `);

    const result = parseGroup(xml, theme);

    expect(result.children).toHaveLength(2);
    expect(result.children[0].kind).toBe('shape');
    expect(result.children[1].kind).toBe('picture');
  });

  // -----------------------------------------------------------------------
  // Group transform with child offset/extent
  // -----------------------------------------------------------------------
  it('preserves group transform with child offset', () => {
    const xml = parseXml(`
      <p:grpSp ${NS}>
        <p:nvGrpSpPr>
          <p:cNvPr id="2" name="Group"/>
          <p:cNvGrpSpPr/>
          <p:nvPr/>
        </p:nvGrpSpPr>
        <p:grpSpPr>
          <a:xfrm>
            <a:off x="1000" y="2000"/>
            <a:ext cx="5000" cy="3000"/>
            <a:chOff x="500" y="500"/>
            <a:chExt cx="4000" cy="2000"/>
          </a:xfrm>
        </p:grpSpPr>
      </p:grpSp>
    `);

    const result = parseGroup(xml, theme);

    expect(result.properties.transform).toBeDefined();
    expect(result.properties.transform!.position).toEqual({ x: 1000, y: 2000 });
    expect(result.properties.transform!.size).toEqual({ width: 5000, height: 3000 });
    expect(result.childOffset).toEqual({ x: 500, y: 500 });
    expect(result.childExtent).toEqual({ width: 4000, height: 2000 });
  });
});

describe('parseShapeTreeChildren', () => {
  const theme = minimalTheme();

  // -----------------------------------------------------------------------
  // Dispatch by element tag
  // -----------------------------------------------------------------------
  it('dispatches shapes, pictures, and connectors correctly', () => {
    const xml = parseXml(`
      <p:spTree ${NS}>
        <p:nvGrpSpPr>
          <p:cNvPr id="1" name=""/>
          <p:cNvGrpSpPr/>
          <p:nvPr/>
        </p:nvGrpSpPr>
        <p:grpSpPr/>
        <p:sp>
          <p:nvSpPr>
            <p:cNvPr id="2" name="Shape 1"/>
            <p:cNvSpPr/>
            <p:nvPr/>
          </p:nvSpPr>
          <p:spPr/>
        </p:sp>
        <p:cxnSp>
          <p:nvCxnSpPr>
            <p:cNvPr id="3" name="Connector 1"/>
            <p:cNvCxnSpPr>
              <a:stCxn id="2" idx="1"/>
              <a:endCxn id="4" idx="3"/>
            </p:cNvCxnSpPr>
            <p:nvPr/>
          </p:nvCxnSpPr>
          <p:spPr/>
        </p:cxnSp>
      </p:spTree>
    `);

    const elements = parseShapeTreeChildren(xml, theme);

    expect(elements).toHaveLength(2);
    expect(elements[0].kind).toBe('shape');
    expect(elements[1].kind).toBe('connector');

    if (elements[1].kind === 'connector') {
      expect(elements[1].startConnection).toEqual({
        shapeId: '2',
        connectionSiteIndex: 1,
      });
      expect(elements[1].endConnection).toEqual({
        shapeId: '4',
        connectionSiteIndex: 3,
      });
    }
  });

  // -----------------------------------------------------------------------
  // Graphic frame becomes UnsupportedIR
  // -----------------------------------------------------------------------
  it('handles graphic frames as unsupported', () => {
    const xml = parseXml(`
      <p:spTree ${NS}>
        <p:nvGrpSpPr>
          <p:cNvPr id="1" name=""/>
          <p:cNvGrpSpPr/>
          <p:nvPr/>
        </p:nvGrpSpPr>
        <p:grpSpPr/>
        <p:graphicFrame>
          <p:nvGraphicFramePr>
            <p:cNvPr id="5" name="Table 1"/>
          </p:nvGraphicFramePr>
        </p:graphicFrame>
      </p:spTree>
    `);

    const elements = parseShapeTreeChildren(xml, theme);

    expect(elements).toHaveLength(1);
    expect(elements[0].kind).toBe('unsupported');
    if (elements[0].kind === 'unsupported') {
      expect(elements[0].elementType).toBe('p:graphicFrame');
      expect(elements[0].reason).toContain('not yet supported');
    }
  });

  // -----------------------------------------------------------------------
  // Shape with placeholder type/index
  // -----------------------------------------------------------------------
  it('parses shape with placeholder type and index', () => {
    const xml = parseXml(`
      <p:spTree ${NS}>
        <p:nvGrpSpPr>
          <p:cNvPr id="1" name=""/>
          <p:cNvGrpSpPr/>
          <p:nvPr/>
        </p:nvGrpSpPr>
        <p:grpSpPr/>
        <p:sp>
          <p:nvSpPr>
            <p:cNvPr id="10" name="Title 1"/>
            <p:cNvSpPr/>
            <p:nvPr>
              <p:ph type="title"/>
            </p:nvPr>
          </p:nvSpPr>
          <p:spPr/>
        </p:sp>
        <p:sp>
          <p:nvSpPr>
            <p:cNvPr id="11" name="Content 2"/>
            <p:cNvSpPr/>
            <p:nvPr>
              <p:ph type="body" idx="1"/>
            </p:nvPr>
          </p:nvSpPr>
          <p:spPr/>
        </p:sp>
      </p:spTree>
    `);

    const elements = parseShapeTreeChildren(xml, theme);

    expect(elements).toHaveLength(2);
    const title = elements[0];
    const body = elements[1];

    expect(title.kind).toBe('shape');
    if (title.kind === 'shape') {
      expect(title.placeholderType).toBe('title');
      expect(title.placeholderIndex).toBeUndefined();
    }

    expect(body.kind).toBe('shape');
    if (body.kind === 'shape') {
      expect(body.placeholderType).toBe('body');
      expect(body.placeholderIndex).toBe(1);
    }
  });

  // -----------------------------------------------------------------------
  // Empty shape tree
  // -----------------------------------------------------------------------
  it('returns empty array for shape tree with no children', () => {
    const xml = parseXml(`
      <p:spTree ${NS}>
        <p:nvGrpSpPr>
          <p:cNvPr id="1" name=""/>
          <p:cNvGrpSpPr/>
          <p:nvPr/>
        </p:nvGrpSpPr>
        <p:grpSpPr/>
      </p:spTree>
    `);

    const elements = parseShapeTreeChildren(xml, theme);
    expect(elements).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Connector without connections
  // -----------------------------------------------------------------------
  it('parses connector without connection references', () => {
    const xml = parseXml(`
      <p:spTree ${NS}>
        <p:nvGrpSpPr>
          <p:cNvPr id="1" name=""/>
          <p:cNvGrpSpPr/>
          <p:nvPr/>
        </p:nvGrpSpPr>
        <p:grpSpPr/>
        <p:cxnSp>
          <p:nvCxnSpPr>
            <p:cNvPr id="5" name="Connector"/>
            <p:cNvCxnSpPr/>
            <p:nvPr/>
          </p:nvCxnSpPr>
          <p:spPr>
            <a:xfrm>
              <a:off x="100" y="200"/>
              <a:ext cx="300" cy="400"/>
            </a:xfrm>
          </p:spPr>
        </p:cxnSp>
      </p:spTree>
    `);

    const elements = parseShapeTreeChildren(xml, theme);
    expect(elements).toHaveLength(1);
    expect(elements[0].kind).toBe('connector');
    if (elements[0].kind === 'connector') {
      expect(elements[0].startConnection).toBeUndefined();
      expect(elements[0].endConnection).toBeUndefined();
      expect(elements[0].properties.transform).toBeDefined();
    }
  });
});
