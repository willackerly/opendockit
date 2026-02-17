import { describe, it, expect } from 'vitest';
import { parseFill } from '../fill.js';
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

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('parseFill', () => {
  const theme = minimalTheme();

  // -----------------------------------------------------------------------
  // Solid fill
  // -----------------------------------------------------------------------
  describe('solid fill', () => {
    it('parses solid fill with srgbClr', () => {
      const xml = parseXml(`
        <a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:solidFill>
            <a:srgbClr val="FF0000"/>
          </a:solidFill>
        </a:spPr>
      `);

      const fill = parseFill(xml, theme);
      expect(fill).toBeDefined();
      expect(fill!.type).toBe('solid');
      if (fill!.type === 'solid') {
        expect(fill.color.r).toBe(255);
        expect(fill.color.g).toBe(0);
        expect(fill.color.b).toBe(0);
        expect(fill.color.a).toBe(1);
      }
    });

    it('parses solid fill with schemeClr', () => {
      const xml = parseXml(`
        <a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:solidFill>
            <a:schemeClr val="accent1"/>
          </a:solidFill>
        </a:spPr>
      `);

      const fill = parseFill(xml, theme);
      expect(fill).toBeDefined();
      expect(fill!.type).toBe('solid');
      if (fill!.type === 'solid') {
        // accent1 = { r: 68, g: 114, b: 196 }
        expect(fill.color.r).toBe(68);
        expect(fill.color.g).toBe(114);
        expect(fill.color.b).toBe(196);
      }
    });

    it('parses solid fill with color transforms (tint)', () => {
      const xml = parseXml(`
        <a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:solidFill>
            <a:schemeClr val="accent1">
              <a:tint val="50000"/>
            </a:schemeClr>
          </a:solidFill>
        </a:spPr>
      `);

      const fill = parseFill(xml, theme);
      expect(fill).toBeDefined();
      expect(fill!.type).toBe('solid');
      if (fill!.type === 'solid') {
        // Tint 50% on accent1 should lighten the color
        // tint formula: 255 - (255 - c) * tintPct
        // r: 255 - (255 - 68) * 0.5 = 255 - 93.5 = 162 (rounded)
        expect(fill.color.r).toBeGreaterThan(68);
        expect(fill.color.a).toBe(1);
      }
    });

    it('parses solid fill with color transforms (shade)', () => {
      const xml = parseXml(`
        <a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:solidFill>
            <a:srgbClr val="FF0000">
              <a:shade val="50000"/>
            </a:srgbClr>
          </a:solidFill>
        </a:spPr>
      `);

      const fill = parseFill(xml, theme);
      expect(fill).toBeDefined();
      expect(fill!.type).toBe('solid');
      if (fill!.type === 'solid') {
        // shade 50% on red: r = 255 * 0.5 = 128
        expect(fill.color.r).toBe(128);
        expect(fill.color.g).toBe(0);
        expect(fill.color.b).toBe(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Gradient fill
  // -----------------------------------------------------------------------
  describe('gradient fill', () => {
    it('parses gradient fill with linear angle', () => {
      const xml = parseXml(`
        <a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:gradFill>
            <a:gsLst>
              <a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs>
              <a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs>
            </a:gsLst>
            <a:lin ang="5400000" scaled="1"/>
          </a:gradFill>
        </a:spPr>
      `);

      const fill = parseFill(xml, theme);
      expect(fill).toBeDefined();
      expect(fill!.type).toBe('gradient');
      if (fill!.type === 'gradient') {
        expect(fill.kind).toBe('linear');
        expect(fill.angle).toBe(90);
        expect(fill.stops).toHaveLength(2);
        expect(fill.stops[0].position).toBe(0);
        expect(fill.stops[1].position).toBe(1);
        expect(fill.stops[0].color.r).toBe(255);
        expect(fill.stops[1].color.b).toBe(255);
      }
    });

    it('parses gradient fill with radial path', () => {
      const xml = parseXml(`
        <a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:gradFill>
            <a:gsLst>
              <a:gs pos="0"><a:srgbClr val="FFFFFF"/></a:gs>
              <a:gs pos="100000"><a:srgbClr val="000000"/></a:gs>
            </a:gsLst>
            <a:path path="circle">
              <a:fillToRect l="50000" t="50000" r="50000" b="50000"/>
            </a:path>
          </a:gradFill>
        </a:spPr>
      `);

      const fill = parseFill(xml, theme);
      expect(fill).toBeDefined();
      expect(fill!.type).toBe('gradient');
      if (fill!.type === 'gradient') {
        expect(fill.kind).toBe('radial');
        expect(fill.stops).toHaveLength(2);
        expect(fill.tileRect).toBeDefined();
        expect(fill.tileRect!.left).toBe(0.5);
        expect(fill.tileRect!.top).toBe(0.5);
      }
    });

    it('normalizes gradient stop positions from 0-100000 to 0-1', () => {
      const xml = parseXml(`
        <a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:gradFill>
            <a:gsLst>
              <a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs>
              <a:gs pos="50000"><a:srgbClr val="00FF00"/></a:gs>
              <a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs>
            </a:gsLst>
            <a:lin ang="0"/>
          </a:gradFill>
        </a:spPr>
      `);

      const fill = parseFill(xml, theme);
      expect(fill).toBeDefined();
      expect(fill!.type).toBe('gradient');
      if (fill!.type === 'gradient') {
        expect(fill.stops).toHaveLength(3);
        expect(fill.stops[0].position).toBe(0);
        expect(fill.stops[1].position).toBe(0.5);
        expect(fill.stops[2].position).toBe(1);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Pattern fill
  // -----------------------------------------------------------------------
  describe('pattern fill', () => {
    it('parses pattern fill with foreground and background', () => {
      const xml = parseXml(`
        <a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:pattFill prst="ltDnDiag">
            <a:fgClr><a:srgbClr val="000000"/></a:fgClr>
            <a:bgClr><a:srgbClr val="FFFFFF"/></a:bgClr>
          </a:pattFill>
        </a:spPr>
      `);

      const fill = parseFill(xml, theme);
      expect(fill).toBeDefined();
      expect(fill!.type).toBe('pattern');
      if (fill!.type === 'pattern') {
        expect(fill.preset).toBe('ltDnDiag');
        expect(fill.foreground.r).toBe(0);
        expect(fill.foreground.g).toBe(0);
        expect(fill.foreground.b).toBe(0);
        expect(fill.background.r).toBe(255);
        expect(fill.background.g).toBe(255);
        expect(fill.background.b).toBe(255);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Picture fill (blipFill)
  // -----------------------------------------------------------------------
  describe('picture fill', () => {
    it('parses picture fill with stretch', () => {
      const xml = parseXml(`
        <a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <a:blipFill>
            <a:blip r:embed="rId2"/>
            <a:stretch><a:fillRect/></a:stretch>
          </a:blipFill>
        </a:spPr>
      `);

      const fill = parseFill(xml, theme);
      expect(fill).toBeDefined();
      expect(fill!.type).toBe('picture');
      if (fill!.type === 'picture') {
        expect(fill.imagePartUri).toBe('rId2');
        expect(fill.stretch).toBe(true);
      }
    });

    it('parses picture fill with crop rect', () => {
      const xml = parseXml(`
        <a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <a:blipFill>
            <a:blip r:embed="rId5"/>
            <a:srcRect l="10000" t="20000" r="10000" b="20000"/>
            <a:stretch><a:fillRect/></a:stretch>
          </a:blipFill>
        </a:spPr>
      `);

      const fill = parseFill(xml, theme);
      expect(fill).toBeDefined();
      expect(fill!.type).toBe('picture');
      if (fill!.type === 'picture') {
        expect(fill.imagePartUri).toBe('rId5');
        expect(fill.crop).toBeDefined();
        expect(fill.crop!.left).toBe(0.1);
        expect(fill.crop!.top).toBe(0.2);
        expect(fill.crop!.right).toBe(0.1);
        expect(fill.crop!.bottom).toBe(0.2);
      }
    });

    it('parses picture fill with tile', () => {
      const xml = parseXml(`
        <a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <a:blipFill>
            <a:blip r:embed="rId3"/>
            <a:tile tx="0" ty="0" sx="50000" sy="50000" flip="xy" algn="tl"/>
          </a:blipFill>
        </a:spPr>
      `);

      const fill = parseFill(xml, theme);
      expect(fill).toBeDefined();
      expect(fill!.type).toBe('picture');
      if (fill!.type === 'picture') {
        expect(fill.imagePartUri).toBe('rId3');
        expect(fill.stretch).toBe(false);
        expect(fill.tile).toBeDefined();
        expect(fill.tile!.scaleX).toBe(0.5);
        expect(fill.tile!.scaleY).toBe(0.5);
        expect(fill.tile!.flip).toBe('xy');
        expect(fill.tile!.alignment).toBe('tl');
      }
    });
  });

  // -----------------------------------------------------------------------
  // No fill
  // -----------------------------------------------------------------------
  describe('no fill', () => {
    it('parses noFill element', () => {
      const xml = parseXml(`
        <a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:noFill/>
        </a:spPr>
      `);

      const fill = parseFill(xml, theme);
      expect(fill).toBeDefined();
      expect(fill!.type).toBe('none');
    });
  });

  // -----------------------------------------------------------------------
  // No fill element (inherit)
  // -----------------------------------------------------------------------
  describe('inheritance', () => {
    it('returns undefined when no fill element is present', () => {
      const xml = parseXml(`
        <a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        </a:spPr>
      `);

      const fill = parseFill(xml, theme);
      expect(fill).toBeUndefined();
    });
  });
});
