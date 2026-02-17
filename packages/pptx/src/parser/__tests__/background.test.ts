import { describe, it, expect } from 'vitest';
import { parseXml } from '@opendockit/core';
import type { ThemeIR } from '@opendockit/core';
import { parseBackground } from '../background.js';

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
      fillStyles: [
        { type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 } },
        { type: 'solid', color: { r: 0, g: 255, b: 0, a: 1 } },
        { type: 'solid', color: { r: 0, g: 0, b: 255, a: 1 } },
      ],
      lineStyles: [{}, {}, {}],
      effectStyles: [[], [], []],
      bgFillStyles: [
        { type: 'solid', color: { r: 128, g: 0, b: 0, a: 1 } },
        { type: 'solid', color: { r: 0, g: 128, b: 0, a: 1 } },
        { type: 'solid', color: { r: 0, g: 0, b: 128, a: 1 } },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseBackground', () => {
  it('parses solid fill background', () => {
    const xml = parseXml(`
<p:bg xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:bgPr>
    <a:solidFill>
      <a:srgbClr val="FF6600"/>
    </a:solidFill>
  </p:bgPr>
</p:bg>`);

    const result = parseBackground(xml, minimalTheme());

    expect(result.fill).toBeDefined();
    expect(result.fill?.type).toBe('solid');
    if (result.fill?.type === 'solid') {
      expect(result.fill.color).toEqual({ r: 255, g: 102, b: 0, a: 1 });
    }
  });

  it('parses gradient background', () => {
    const xml = parseXml(`
<p:bg xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:bgPr>
    <a:gradFill>
      <a:gsLst>
        <a:gs pos="0">
          <a:srgbClr val="000000"/>
        </a:gs>
        <a:gs pos="100000">
          <a:srgbClr val="FFFFFF"/>
        </a:gs>
      </a:gsLst>
      <a:lin ang="5400000"/>
    </a:gradFill>
  </p:bgPr>
</p:bg>`);

    const result = parseBackground(xml, minimalTheme());

    expect(result.fill).toBeDefined();
    expect(result.fill?.type).toBe('gradient');
    if (result.fill?.type === 'gradient') {
      expect(result.fill.kind).toBe('linear');
      expect(result.fill.angle).toBe(90);
      expect(result.fill.stops).toHaveLength(2);
      expect(result.fill.stops[0].position).toBe(0);
      expect(result.fill.stops[0].color).toEqual({ r: 0, g: 0, b: 0, a: 1 });
      expect(result.fill.stops[1].position).toBe(1);
      expect(result.fill.stops[1].color).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    }
  });

  it('parses theme reference background (bgRef)', () => {
    const xml = parseXml(`
<p:bg xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:bgRef idx="2">
    <a:schemeClr val="bg1"/>
  </p:bgRef>
</p:bg>`);

    const result = parseBackground(xml, minimalTheme());

    // idx=2 -> bgFillStyles[1] = { type: 'solid', color: { r: 0, g: 128, b: 0 } }
    expect(result.fill).toBeDefined();
    expect(result.fill?.type).toBe('solid');
    if (result.fill?.type === 'solid') {
      expect(result.fill.color).toEqual({ r: 0, g: 128, b: 0, a: 1 });
    }
  });

  it('parses noFill background', () => {
    const xml = parseXml(`
<p:bg xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:bgPr>
    <a:noFill/>
  </p:bgPr>
</p:bg>`);

    const result = parseBackground(xml, minimalTheme());

    expect(result.fill).toBeDefined();
    expect(result.fill?.type).toBe('none');
  });

  it('returns empty background when no bgPr or bgRef', () => {
    const xml = parseXml(`
<p:bg xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
</p:bg>`);

    const result = parseBackground(xml, minimalTheme());

    expect(result.fill).toBeUndefined();
  });

  it('handles bgRef with invalid index gracefully', () => {
    const xml = parseXml(`
<p:bg xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:bgRef idx="0">
    <a:schemeClr val="bg1"/>
  </p:bgRef>
</p:bg>`);

    const result = parseBackground(xml, minimalTheme());

    // idx=0 is invalid (1-based), should return undefined fill
    expect(result.fill).toBeUndefined();
  });
});
