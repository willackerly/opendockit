import { describe, it, expect } from 'vitest';
import { parseStyleReference } from '../style-reference.js';
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
        { type: 'solid', color: { r: 128, g: 128, b: 128, a: 1 } },
        { type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 } },
      ],
      lineStyles: [{ width: 6350 }, { width: 12700 }, { width: 19050 }],
      effectStyles: [[], [], []],
      bgFillStyles: [
        { type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 } },
        { type: 'solid', color: { r: 200, g: 200, b: 200, a: 1 } },
        { type: 'solid', color: { r: 100, g: 100, b: 100, a: 1 } },
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

describe('parseStyleReference', () => {
  const theme = minimalTheme();

  // -----------------------------------------------------------------------
  // Full style with all four refs
  // -----------------------------------------------------------------------
  it('parses shape with fillRef, lnRef, effectRef, and fontRef', () => {
    const xml = parseXml(`
      <p:sp ${NS}>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Shape 1"/>
          <p:cNvSpPr/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr/>
        <p:style>
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
            <a:schemeClr val="dk1"/>
          </a:fontRef>
        </p:style>
      </p:sp>
    `);

    const result = parseStyleReference(xml, theme);

    expect(result).toBeDefined();
    expect(result!.fillRef).toBeDefined();
    expect(result!.fillRef!.idx).toBe(1);
    expect(result!.fillRef!.color).toBeDefined();
    expect(result!.fillRef!.color!.r).toBe(68);
    expect(result!.fillRef!.color!.g).toBe(114);
    expect(result!.fillRef!.color!.b).toBe(196);

    expect(result!.lnRef).toBeDefined();
    expect(result!.lnRef!.idx).toBe(2);
    expect(result!.lnRef!.color).toBeDefined();

    expect(result!.effectRef).toBeDefined();
    expect(result!.effectRef!.idx).toBe(0);

    expect(result!.fontRef).toBeDefined();
    expect(result!.fontRef!.idx).toBe('minor');
    expect(result!.fontRef!.color).toBeDefined();
    expect(result!.fontRef!.color!.r).toBe(0);
    expect(result!.fontRef!.color!.g).toBe(0);
    expect(result!.fontRef!.color!.b).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Missing style element
  // -----------------------------------------------------------------------
  it('returns undefined when no style element is present', () => {
    const xml = parseXml(`
      <p:sp ${NS}>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Shape 1"/>
          <p:cNvSpPr/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr/>
      </p:sp>
    `);

    const result = parseStyleReference(xml, theme);
    expect(result).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Partial refs (only fillRef)
  // -----------------------------------------------------------------------
  it('parses shape with only fillRef', () => {
    const xml = parseXml(`
      <p:sp ${NS}>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Shape 1"/>
          <p:cNvSpPr/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr/>
        <p:style>
          <a:fillRef idx="3">
            <a:schemeClr val="accent2"/>
          </a:fillRef>
        </p:style>
      </p:sp>
    `);

    const result = parseStyleReference(xml, theme);

    expect(result).toBeDefined();
    expect(result!.fillRef).toBeDefined();
    expect(result!.fillRef!.idx).toBe(3);
    expect(result!.fillRef!.color).toBeDefined();
    expect(result!.fillRef!.color!.r).toBe(237);
    expect(result!.fillRef!.color!.g).toBe(125);
    expect(result!.fillRef!.color!.b).toBe(49);

    // Other refs should be absent
    expect(result!.lnRef).toBeUndefined();
    expect(result!.effectRef).toBeUndefined();
    expect(result!.fontRef).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Correct idx and color extraction
  // -----------------------------------------------------------------------
  it('correctly extracts idx and color for lnRef with srgbClr', () => {
    const xml = parseXml(`
      <p:sp ${NS}>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Shape 1"/>
          <p:cNvSpPr/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr/>
        <p:style>
          <a:lnRef idx="1">
            <a:srgbClr val="FF0000"/>
          </a:lnRef>
        </p:style>
      </p:sp>
    `);

    const result = parseStyleReference(xml, theme);

    expect(result).toBeDefined();
    expect(result!.lnRef).toBeDefined();
    expect(result!.lnRef!.idx).toBe(1);
    expect(result!.lnRef!.color).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  // -----------------------------------------------------------------------
  // fontRef with major index
  // -----------------------------------------------------------------------
  it('parses fontRef with major index', () => {
    const xml = parseXml(`
      <p:sp ${NS}>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Shape 1"/>
          <p:cNvSpPr/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr/>
        <p:style>
          <a:fontRef idx="major">
            <a:schemeClr val="lt1"/>
          </a:fontRef>
        </p:style>
      </p:sp>
    `);

    const result = parseStyleReference(xml, theme);

    expect(result).toBeDefined();
    expect(result!.fontRef).toBeDefined();
    expect(result!.fontRef!.idx).toBe('major');
    expect(result!.fontRef!.color).toBeDefined();
    expect(result!.fontRef!.color!.r).toBe(255);
    expect(result!.fontRef!.color!.g).toBe(255);
    expect(result!.fontRef!.color!.b).toBe(255);
  });

  // -----------------------------------------------------------------------
  // Ref without color child
  // -----------------------------------------------------------------------
  it('handles refs without color child elements', () => {
    const xml = parseXml(`
      <p:sp ${NS}>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Shape 1"/>
          <p:cNvSpPr/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr/>
        <p:style>
          <a:fillRef idx="2"/>
          <a:lnRef idx="1"/>
        </p:style>
      </p:sp>
    `);

    const result = parseStyleReference(xml, theme);

    expect(result).toBeDefined();
    expect(result!.fillRef).toBeDefined();
    expect(result!.fillRef!.idx).toBe(2);
    expect(result!.fillRef!.color).toBeUndefined();

    expect(result!.lnRef).toBeDefined();
    expect(result!.lnRef!.idx).toBe(1);
    expect(result!.lnRef!.color).toBeUndefined();
  });
});
