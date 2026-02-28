/**
 * Font discovery tests.
 *
 * Tests that `scanXmlForTypefaces()` correctly extracts font family names
 * from raw OOXML parts. This is the critical path that determines which
 * fonts get loaded at runtime — if a font is missed here, the browser
 * falls back to a generic serif/sans-serif even though the IR correctly
 * records the font name.
 *
 * Unit tests use synthetic XML snippets.
 * Integration tests load real PPTX fixtures and assert the discovered
 * font set matches a hardcoded baseline.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanXmlForTypefaces } from '../font-discovery.js';
import { OpcPackageReader } from '@opendockit/core/opc';

// ---------------------------------------------------------------------------
// Unit tests — synthetic XML
// ---------------------------------------------------------------------------

describe('scanXmlForTypefaces', () => {
  it('discovers a:latin typeface', () => {
    const xml = '<a:latin typeface="Roboto Slab Light"/>';
    expect(scanXmlForTypefaces(xml)).toEqual(['Roboto Slab Light']);
  });

  it('filters out theme references (+mj-lt, +mn-lt)', () => {
    const xml = `
      <a:latin typeface="+mj-lt"/>
      <a:latin typeface="+mn-lt"/>
      <a:ea typeface="+mj-ea"/>
      <a:cs typeface="+mn-cs"/>
    `;
    expect(scanXmlForTypefaces(xml)).toEqual([]);
  });

  it('discovers East Asian fonts (a:ea)', () => {
    const xml = '<a:ea typeface="Noto Sans CJK"/>';
    expect(scanXmlForTypefaces(xml)).toEqual(['Noto Sans CJK']);
  });

  it('discovers bullet fonts (a:buFont)', () => {
    const xml = '<a:buFont typeface="Wingdings"/>';
    expect(scanXmlForTypefaces(xml)).toEqual(['Wingdings']);
  });

  it('discovers complex script fonts (a:cs)', () => {
    const xml = '<a:cs typeface="Arial"/>';
    expect(scanXmlForTypefaces(xml)).toEqual(['Arial']);
  });

  it('deduplicates multiple occurrences', () => {
    const xml = `
      <a:latin typeface="Calibri"/>
      <a:latin typeface="Arial"/>
      <a:latin typeface="Calibri"/>
      <a:cs typeface="Arial"/>
    `;
    expect(scanXmlForTypefaces(xml)).toEqual(['Arial', 'Calibri']);
  });

  it('filters out empty typeface attributes', () => {
    const xml = '<a:latin typeface=""/>';
    expect(scanXmlForTypefaces(xml)).toEqual([]);
  });

  it('returns empty array when no typeface attributes exist', () => {
    const xml = '<a:p><a:r><a:t>Hello</a:t></a:r></a:p>';
    expect(scanXmlForTypefaces(xml)).toEqual([]);
  });

  it('handles typefaces in defRPr elements', () => {
    const xml = `
      <a:defRPr sz="1800">
        <a:latin typeface="Georgia"/>
        <a:ea typeface="MS Mincho"/>
      </a:defRPr>
    `;
    expect(scanXmlForTypefaces(xml)).toEqual(['Georgia', 'MS Mincho']);
  });

  it('handles typefaces in txStyles (master text styles)', () => {
    const xml = `
      <p:txStyles>
        <p:titleStyle>
          <a:lvl1pPr>
            <a:defRPr>
              <a:latin typeface="Calibri Light"/>
            </a:defRPr>
          </a:lvl1pPr>
        </p:titleStyle>
        <p:bodyStyle>
          <a:lvl1pPr>
            <a:defRPr>
              <a:latin typeface="Calibri"/>
            </a:defRPr>
          </a:lvl1pPr>
        </p:bodyStyle>
      </p:txStyles>
    `;
    expect(scanXmlForTypefaces(xml)).toEqual(['Calibri', 'Calibri Light']);
  });

  it('discovers fonts with special characters in names', () => {
    const xml = `
      <a:latin typeface="ＭＳ Ｐゴシック"/>
      <a:ea typeface="宋体"/>
      <a:ea typeface="맑은 고딕"/>
    `;
    expect(scanXmlForTypefaces(xml)).toEqual(['宋体', '맑은 고딕', 'ＭＳ Ｐゴシック']);
  });

  it('handles mixed theme refs and real typefaces', () => {
    const xml = `
      <a:latin typeface="+mj-lt"/>
      <a:latin typeface="Roboto"/>
      <a:ea typeface="+mn-ea"/>
      <a:cs typeface="Noto Sans"/>
    `;
    expect(scanXmlForTypefaces(xml)).toEqual(['Noto Sans', 'Roboto']);
  });

  it('can be called multiple times without state leakage', () => {
    const xml1 = '<a:latin typeface="Font A"/>';
    const xml2 = '<a:latin typeface="Font B"/>';

    expect(scanXmlForTypefaces(xml1)).toEqual(['Font A']);
    expect(scanXmlForTypefaces(xml2)).toEqual(['Font B']);
    expect(scanXmlForTypefaces(xml1)).toEqual(['Font A']);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — real PPTX fixtures
// ---------------------------------------------------------------------------

const TEST_DATA = resolve(__dirname, '../../../../../test-data');

/**
 * Scan all XML parts in a PPTX for typeface attributes.
 * This simulates what _collectNeededFontFamilies does at runtime.
 */
async function discoverFontsFromPptx(path: string): Promise<string[]> {
  const data = readFileSync(path);
  const pkg = await OpcPackageReader.open(data);
  const parts = pkg.listParts();
  const allFonts = new Set<string>();

  for (const uri of parts) {
    if (!uri.endsWith('.xml')) continue;
    try {
      const xml = await pkg.getPartText(uri);
      for (const face of scanXmlForTypefaces(xml)) {
        allFonts.add(face);
      }
    } catch {
      // Part not readable — skip.
    }
  }

  return [...allFonts].sort();
}

describe('font discovery census — font-stress-test.pptx', () => {
  const EXPECTED = [
    'Angsana New',
    'Arial',
    'Arial Narrow',
    'Arimo',
    'Barlow',
    'Barlow Light',
    'Bookman Old Style',
    'Calibri',
    'Calibri Light',
    'Cambria',
    'Century Schoolbook',
    'Comfortaa',
    'Cordia New',
    'Courier New',
    'Courier Prime',
    'DaunPenh',
    'DokChampa',
    'Estrangelo Edessa',
    'Euphemia',
    'Fira Code',
    'Gautami',
    'Georgia',
    'Iskoola Pota',
    'Kalinga',
    'Kartika',
    'Latha',
    'Lato',
    'Lato Light',
    'MV Boli',
    'Mangal',
    'Microsoft Himalaya',
    'Microsoft Uighur',
    'Microsoft Yi Baiti',
    'Mongolian Baiti',
    'Montserrat',
    'MoolBoran',
    'Noto Sans',
    'Noto Sans Symbols',
    'Noto Serif',
    'Nyala',
    'Open Sans',
    'Oswald',
    'Palatino Linotype',
    'Plantagenet Cherokee',
    'Playfair Display',
    'Poppins',
    'Raavi',
    'Raleway',
    'Roboto',
    'Roboto Mono',
    'Roboto Slab',
    'Roboto Slab Light',
    'Roboto Slab SemiBold',
    'Segoe UI',
    'Segoe UI Light',
    'Segoe UI Semibold',
    'Segoe UI Semilight',
    'Shruti',
    'Source Code Pro',
    'Source Sans Pro',
    'Sylfaen',
    'Times New Roman',
    'Tinos',
    'Tunga',
    'Ubuntu',
    'Vrinda',
    '宋体',
    '新細明體',
    '맑은 고딕',
    'ＭＳ Ｐゴシック',
  ];

  it('discovers all font families in the fixture', async () => {
    const fonts = await discoverFontsFromPptx(
      resolve(TEST_DATA, 'font-stress-test.pptx')
    );
    expect(fonts).toEqual(EXPECTED);
  });

  it('discovers at least 60 unique font families', async () => {
    const fonts = await discoverFontsFromPptx(
      resolve(TEST_DATA, 'font-stress-test.pptx')
    );
    expect(fonts.length).toBeGreaterThanOrEqual(60);
  });

  it('includes CJK font families', async () => {
    const fonts = await discoverFontsFromPptx(
      resolve(TEST_DATA, 'font-stress-test.pptx')
    );
    expect(fonts).toContain('宋体');
    expect(fonts).toContain('ＭＳ Ｐゴシック');
    expect(fonts).toContain('맑은 고딕');
  });
});

describe('font discovery census — basic-shapes.pptx', () => {
  const EXPECTED = ['Arial', 'Calibri', 'Calibri Light'];

  it('discovers all font families in the fixture', async () => {
    const fonts = await discoverFontsFromPptx(
      resolve(TEST_DATA, 'basic-shapes.pptx')
    );
    expect(fonts).toEqual(EXPECTED);
  });

  it('includes theme fonts (Calibri + Calibri Light)', async () => {
    const fonts = await discoverFontsFromPptx(
      resolve(TEST_DATA, 'basic-shapes.pptx')
    );
    expect(fonts).toContain('Calibri');
    expect(fonts).toContain('Calibri Light');
  });
});
