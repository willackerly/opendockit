import { describe, it, expect } from 'vitest';
import { parseShapeProperties, parseShapePropertiesFromParent } from '../shape-properties.js';
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

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('parseShapeProperties', () => {
  const theme = minimalTheme();

  // -----------------------------------------------------------------------
  // Solid fill, line, and transform
  // -----------------------------------------------------------------------
  it('parses spPr with solid fill, line, and transform', () => {
    const xml = parseXml(`
      <a:spPr ${NS}>
        <a:xfrm>
          <a:off x="457200" y="274638"/>
          <a:ext cx="8229600" cy="1143000"/>
        </a:xfrm>
        <a:solidFill>
          <a:srgbClr val="FF0000"/>
        </a:solidFill>
        <a:ln w="12700">
          <a:solidFill><a:srgbClr val="000000"/></a:solidFill>
        </a:ln>
      </a:spPr>
    `);

    const result = parseShapeProperties(xml, theme);

    // Transform
    expect(result.transform).toBeDefined();
    expect(result.transform!.position).toEqual({ x: 457200, y: 274638 });
    expect(result.transform!.size).toEqual({ width: 8229600, height: 1143000 });

    // Fill
    expect(result.fill).toBeDefined();
    expect(result.fill!.type).toBe('solid');

    // Line
    expect(result.line).toBeDefined();
    expect(result.line!.width).toBe(12700);

    // Effects (empty)
    expect(result.effects).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Preset geometry: rect
  // -----------------------------------------------------------------------
  it('parses spPr with preset geometry (rect)', () => {
    const xml = parseXml(`
      <a:spPr ${NS}>
        <a:prstGeom prst="rect">
          <a:avLst/>
        </a:prstGeom>
      </a:spPr>
    `);

    const result = parseShapeProperties(xml, theme);

    expect(result.geometry).toBeDefined();
    expect(result.geometry!.kind).toBe('preset');
    if (result.geometry!.kind === 'preset') {
      expect(result.geometry.name).toBe('rect');
      expect(result.geometry.adjustValues).toBeUndefined();
    }
  });

  // -----------------------------------------------------------------------
  // Preset geometry: roundRect with adjustments
  // -----------------------------------------------------------------------
  it('parses spPr with preset geometry (roundRect with adjustments)', () => {
    const xml = parseXml(`
      <a:spPr ${NS}>
        <a:prstGeom prst="roundRect">
          <a:avLst>
            <a:gd name="adj" fmla="val 16667"/>
          </a:avLst>
        </a:prstGeom>
      </a:spPr>
    `);

    const result = parseShapeProperties(xml, theme);

    expect(result.geometry).toBeDefined();
    expect(result.geometry!.kind).toBe('preset');
    if (result.geometry!.kind === 'preset') {
      expect(result.geometry.name).toBe('roundRect');
      expect(result.geometry.adjustValues).toEqual({ adj: 16667 });
    }
  });

  // -----------------------------------------------------------------------
  // Custom geometry
  // -----------------------------------------------------------------------
  it('parses spPr with custom geometry', () => {
    const xml = parseXml(`
      <a:spPr ${NS}>
        <a:custGeom>
          <a:avLst/>
          <a:gdLst>
            <a:gd name="x1" fmla="+- w 0 100"/>
          </a:gdLst>
          <a:pathLst>
            <a:path w="200" h="200">
              <a:moveTo><a:pt x="0" y="0"/></a:moveTo>
              <a:lnTo><a:pt x="200" y="0"/></a:lnTo>
              <a:lnTo><a:pt x="200" y="200"/></a:lnTo>
              <a:close/>
            </a:path>
          </a:pathLst>
        </a:custGeom>
      </a:spPr>
    `);

    const result = parseShapeProperties(xml, theme);

    expect(result.geometry).toBeDefined();
    expect(result.geometry!.kind).toBe('custom');
    if (result.geometry!.kind === 'custom') {
      expect(result.geometry.guides).toHaveLength(1);
      expect(result.geometry.guides[0].name).toBe('x1');
      expect(result.geometry.guides[0].formula).toBe('+- w 0 100');
      expect(result.geometry.paths).toHaveLength(1);
      expect(result.geometry.paths[0].width).toBe(200);
      expect(result.geometry.paths[0].height).toBe(200);
      expect(result.geometry.paths[0].commands).toHaveLength(4);
      expect(result.geometry.paths[0].commands[0].kind).toBe('moveTo');
      expect(result.geometry.paths[0].commands[1].kind).toBe('lineTo');
      expect(result.geometry.paths[0].commands[2].kind).toBe('lineTo');
      expect(result.geometry.paths[0].commands[3].kind).toBe('close');
    }
  });

  // -----------------------------------------------------------------------
  // Custom geometry with connection sites
  // -----------------------------------------------------------------------
  it('parses custom geometry with connection sites', () => {
    const xml = parseXml(`
      <a:spPr ${NS}>
        <a:custGeom>
          <a:avLst/>
          <a:gdLst/>
          <a:pathLst>
            <a:path>
              <a:moveTo><a:pt x="0" y="0"/></a:moveTo>
              <a:lnTo><a:pt x="100" y="100"/></a:lnTo>
              <a:close/>
            </a:path>
          </a:pathLst>
          <a:cxnLst>
            <a:cxn ang="0"><a:pos x="r" y="vc"/></a:cxn>
            <a:cxn ang="5400000"><a:pos x="hc" y="b"/></a:cxn>
          </a:cxnLst>
        </a:custGeom>
      </a:spPr>
    `);

    const result = parseShapeProperties(xml, theme);
    expect(result.geometry!.kind).toBe('custom');
    if (result.geometry!.kind === 'custom') {
      expect(result.geometry.connectionSites).toBeDefined();
      expect(result.geometry.connectionSites).toHaveLength(2);
      expect(result.geometry.connectionSites![0].posX).toBe('r');
      expect(result.geometry.connectionSites![0].posY).toBe('vc');
      expect(result.geometry.connectionSites![1].angle).toBe(90);
    }
  });

  // -----------------------------------------------------------------------
  // Effects
  // -----------------------------------------------------------------------
  it('parses spPr with effects', () => {
    const xml = parseXml(`
      <a:spPr ${NS}>
        <a:effectLst>
          <a:outerShdw blurRad="50800" dist="38100" dir="5400000">
            <a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr>
          </a:outerShdw>
        </a:effectLst>
      </a:spPr>
    `);

    const result = parseShapeProperties(xml, theme);

    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].type).toBe('outerShadow');
  });

  // -----------------------------------------------------------------------
  // No fill (inherit)
  // -----------------------------------------------------------------------
  it('returns undefined fill when no fill element is present', () => {
    const xml = parseXml(`
      <a:spPr ${NS}>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="100" cy="100"/>
        </a:xfrm>
      </a:spPr>
    `);

    const result = parseShapeProperties(xml, theme);
    expect(result.fill).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Explicit noFill
  // -----------------------------------------------------------------------
  it('parses explicit noFill', () => {
    const xml = parseXml(`
      <a:spPr ${NS}>
        <a:noFill/>
      </a:spPr>
    `);

    const result = parseShapeProperties(xml, theme);
    expect(result.fill).toBeDefined();
    expect(result.fill!.type).toBe('none');
  });

  // -----------------------------------------------------------------------
  // Custom geometry with all path command types
  // -----------------------------------------------------------------------
  it('parses custom geometry with cubic bezier', () => {
    const xml = parseXml(`
      <a:spPr ${NS}>
        <a:custGeom>
          <a:avLst/>
          <a:gdLst/>
          <a:pathLst>
            <a:path>
              <a:moveTo><a:pt x="0" y="0"/></a:moveTo>
              <a:cubicBezTo>
                <a:pt x="10" y="20"/>
                <a:pt x="30" y="40"/>
                <a:pt x="50" y="60"/>
              </a:cubicBezTo>
              <a:close/>
            </a:path>
          </a:pathLst>
        </a:custGeom>
      </a:spPr>
    `);

    const result = parseShapeProperties(xml, theme);
    expect(result.geometry!.kind).toBe('custom');
    if (result.geometry!.kind === 'custom') {
      const cmds = result.geometry.paths[0].commands;
      expect(cmds[1].kind).toBe('cubicBezierTo');
      if (cmds[1].kind === 'cubicBezierTo') {
        expect(cmds[1].x1).toBe(10);
        expect(cmds[1].y1).toBe(20);
        expect(cmds[1].x2).toBe(30);
        expect(cmds[1].y2).toBe(40);
        expect(cmds[1].x).toBe(50);
        expect(cmds[1].y).toBe(60);
      }
    }
  });

  it('parses custom geometry with quad bezier', () => {
    const xml = parseXml(`
      <a:spPr ${NS}>
        <a:custGeom>
          <a:avLst/>
          <a:gdLst/>
          <a:pathLst>
            <a:path>
              <a:moveTo><a:pt x="0" y="0"/></a:moveTo>
              <a:quadBezTo>
                <a:pt x="50" y="100"/>
                <a:pt x="100" y="0"/>
              </a:quadBezTo>
              <a:close/>
            </a:path>
          </a:pathLst>
        </a:custGeom>
      </a:spPr>
    `);

    const result = parseShapeProperties(xml, theme);
    expect(result.geometry!.kind).toBe('custom');
    if (result.geometry!.kind === 'custom') {
      const cmds = result.geometry.paths[0].commands;
      expect(cmds[1].kind).toBe('quadBezierTo');
      if (cmds[1].kind === 'quadBezierTo') {
        expect(cmds[1].x1).toBe(50);
        expect(cmds[1].y1).toBe(100);
        expect(cmds[1].x).toBe(100);
        expect(cmds[1].y).toBe(0);
      }
    }
  });

  it('parses custom geometry with arcTo', () => {
    const xml = parseXml(`
      <a:spPr ${NS}>
        <a:custGeom>
          <a:avLst/>
          <a:gdLst/>
          <a:pathLst>
            <a:path>
              <a:moveTo><a:pt x="0" y="50"/></a:moveTo>
              <a:arcTo wR="50" hR="50" stAng="10800000" swAng="5400000"/>
              <a:close/>
            </a:path>
          </a:pathLst>
        </a:custGeom>
      </a:spPr>
    `);

    const result = parseShapeProperties(xml, theme);
    expect(result.geometry!.kind).toBe('custom');
    if (result.geometry!.kind === 'custom') {
      const cmds = result.geometry.paths[0].commands;
      expect(cmds[1].kind).toBe('arcTo');
      if (cmds[1].kind === 'arcTo') {
        expect(cmds[1].wR).toBe(50);
        expect(cmds[1].hR).toBe(50);
        expect(cmds[1].startAngle).toBe(180); // 10800000 / 60000
        expect(cmds[1].sweepAngle).toBe(90); // 5400000 / 60000
      }
    }
  });

  // -----------------------------------------------------------------------
  // Path with fill and stroke attributes
  // -----------------------------------------------------------------------
  it('parses custom geometry path fill and stroke attributes', () => {
    const xml = parseXml(`
      <a:spPr ${NS}>
        <a:custGeom>
          <a:avLst/>
          <a:gdLst/>
          <a:pathLst>
            <a:path w="100" h="100" fill="none" stroke="0">
              <a:moveTo><a:pt x="0" y="0"/></a:moveTo>
              <a:lnTo><a:pt x="100" y="100"/></a:lnTo>
            </a:path>
          </a:pathLst>
        </a:custGeom>
      </a:spPr>
    `);

    const result = parseShapeProperties(xml, theme);
    if (result.geometry!.kind === 'custom') {
      const path = result.geometry.paths[0];
      expect(path.fill).toBe('none');
      expect(path.stroke).toBe(false);
    }
  });
});

describe('parseShapePropertiesFromParent', () => {
  const theme = minimalTheme();

  const NS_P = [
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"',
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  ].join(' ');

  it('finds p:spPr child within parent', () => {
    const xml = parseXml(`
      <p:sp ${NS_P}>
        <p:spPr>
          <a:solidFill>
            <a:srgbClr val="00FF00"/>
          </a:solidFill>
        </p:spPr>
      </p:sp>
    `);

    const result = parseShapePropertiesFromParent(xml, theme);
    expect(result.fill).toBeDefined();
    expect(result.fill!.type).toBe('solid');
  });

  it('returns empty properties when no spPr is found', () => {
    const xml = parseXml(`
      <p:sp ${NS_P}>
        <p:nvSpPr/>
      </p:sp>
    `);

    const result = parseShapePropertiesFromParent(xml, theme);
    expect(result.fill).toBeUndefined();
    expect(result.line).toBeUndefined();
    expect(result.transform).toBeUndefined();
    expect(result.effects).toEqual([]);
  });
});
