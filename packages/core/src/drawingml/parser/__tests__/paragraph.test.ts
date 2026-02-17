import { describe, it, expect } from 'vitest';
import { parseXml } from '../../../xml/index.js';
import { parseParagraph } from '../paragraph.js';
import type { ThemeIR } from '../../../ir/index.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';

const TEST_THEME: ThemeIR = {
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

// ---------------------------------------------------------------------------
// Tests: parseParagraph
// ---------------------------------------------------------------------------

describe('parseParagraph', () => {
  describe('alignment', () => {
    it('parses left alignment', () => {
      const el = parseXml(
        `<a:p ${NS}><a:pPr algn="l"/><a:r><a:t>text</a:t></a:r></a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.properties.alignment).toBe('left');
    });

    it('parses center alignment', () => {
      const el = parseXml(
        `<a:p ${NS}><a:pPr algn="ctr"/><a:r><a:t>text</a:t></a:r></a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.properties.alignment).toBe('center');
    });

    it('parses right alignment', () => {
      const el = parseXml(
        `<a:p ${NS}><a:pPr algn="r"/><a:r><a:t>text</a:t></a:r></a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.properties.alignment).toBe('right');
    });

    it('parses justify alignment', () => {
      const el = parseXml(
        `<a:p ${NS}><a:pPr algn="just"/><a:r><a:t>text</a:t></a:r></a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.properties.alignment).toBe('justify');
    });

    it('parses distributed alignment', () => {
      const el = parseXml(
        `<a:p ${NS}><a:pPr algn="dist"/><a:r><a:t>text</a:t></a:r></a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.properties.alignment).toBe('distributed');
    });
  });

  describe('level and indentation', () => {
    it('parses paragraph level', () => {
      const el = parseXml(
        `<a:p ${NS}><a:pPr lvl="2"/><a:r><a:t>text</a:t></a:r></a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.properties.level).toBe(2);
    });

    it('parses indent in EMU', () => {
      const el = parseXml(
        `<a:p ${NS}><a:pPr indent="-342900"/><a:r><a:t>text</a:t></a:r></a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.properties.indent).toBe(-342900);
    });

    it('parses left margin in EMU', () => {
      const el = parseXml(
        `<a:p ${NS}><a:pPr marL="457200"/><a:r><a:t>text</a:t></a:r></a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.properties.marginLeft).toBe(457200);
    });

    it('parses level and indentation together', () => {
      const el = parseXml(
        `<a:p ${NS}><a:pPr lvl="1" indent="-228600" marL="685800"/><a:r><a:t>text</a:t></a:r></a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.properties.level).toBe(1);
      expect(para.properties.indent).toBe(-228600);
      expect(para.properties.marginLeft).toBe(685800);
    });
  });

  describe('RTL', () => {
    it('parses rtl=true', () => {
      const el = parseXml(
        `<a:p ${NS}><a:pPr rtl="1"/><a:r><a:t>text</a:t></a:r></a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.properties.rtl).toBe(true);
    });

    it('parses rtl=false', () => {
      const el = parseXml(
        `<a:p ${NS}><a:pPr rtl="0"/><a:r><a:t>text</a:t></a:r></a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.properties.rtl).toBe(false);
    });
  });

  describe('line spacing', () => {
    it('parses percentage line spacing', () => {
      const el = parseXml(
        `<a:p ${NS}>
          <a:pPr>
            <a:lnSpc><a:spcPct val="150000"/></a:lnSpc>
          </a:pPr>
          <a:r><a:t>text</a:t></a:r>
        </a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.properties.lineSpacing).toEqual({ value: 150, unit: 'pct' });
    });

    it('parses point line spacing', () => {
      const el = parseXml(
        `<a:p ${NS}>
          <a:pPr>
            <a:lnSpc><a:spcPts val="1800"/></a:lnSpc>
          </a:pPr>
          <a:r><a:t>text</a:t></a:r>
        </a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.properties.lineSpacing).toEqual({ value: 18, unit: 'pt' });
    });

    it('parses single line spacing (100%)', () => {
      const el = parseXml(
        `<a:p ${NS}>
          <a:pPr>
            <a:lnSpc><a:spcPct val="100000"/></a:lnSpc>
          </a:pPr>
          <a:r><a:t>text</a:t></a:r>
        </a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.properties.lineSpacing).toEqual({ value: 100, unit: 'pct' });
    });
  });

  describe('space before/after', () => {
    it('parses space before in points', () => {
      const el = parseXml(
        `<a:p ${NS}>
          <a:pPr>
            <a:spcBef><a:spcPts val="600"/></a:spcBef>
          </a:pPr>
          <a:r><a:t>text</a:t></a:r>
        </a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.properties.spaceBefore).toEqual({ value: 6, unit: 'pt' });
    });

    it('parses space after in points', () => {
      const el = parseXml(
        `<a:p ${NS}>
          <a:pPr>
            <a:spcAft><a:spcPts val="1200"/></a:spcAft>
          </a:pPr>
          <a:r><a:t>text</a:t></a:r>
        </a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.properties.spaceAfter).toEqual({ value: 12, unit: 'pt' });
    });

    it('parses space before as percentage', () => {
      const el = parseXml(
        `<a:p ${NS}>
          <a:pPr>
            <a:spcBef><a:spcPct val="50000"/></a:spcBef>
          </a:pPr>
          <a:r><a:t>text</a:t></a:r>
        </a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.properties.spaceBefore).toEqual({ value: 50, unit: 'pct' });
    });
  });

  describe('bullets', () => {
    it('parses bullet none', () => {
      const el = parseXml(
        `<a:p ${NS}>
          <a:pPr><a:buNone/></a:pPr>
          <a:r><a:t>text</a:t></a:r>
        </a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.bulletProperties).toBeDefined();
      expect(para.bulletProperties!.type).toBe('none');
    });

    it('parses bullet character', () => {
      const el = parseXml(
        `<a:p ${NS}>
          <a:pPr><a:buChar char="\u2022"/></a:pPr>
          <a:r><a:t>text</a:t></a:r>
        </a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.bulletProperties).toBeDefined();
      expect(para.bulletProperties!.type).toBe('char');
      expect(para.bulletProperties!.char).toBe('\u2022');
    });

    it('parses bullet auto-number', () => {
      const el = parseXml(
        `<a:p ${NS}>
          <a:pPr><a:buAutoNum type="arabicPeriod" startAt="1"/></a:pPr>
          <a:r><a:t>text</a:t></a:r>
        </a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.bulletProperties).toBeDefined();
      expect(para.bulletProperties!.type).toBe('autoNum');
      expect(para.bulletProperties!.autoNumType).toBe('arabicPeriod');
      expect(para.bulletProperties!.startAt).toBe(1);
    });

    it('parses bullet auto-number without startAt', () => {
      const el = parseXml(
        `<a:p ${NS}>
          <a:pPr><a:buAutoNum type="romanUcPeriod"/></a:pPr>
          <a:r><a:t>text</a:t></a:r>
        </a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.bulletProperties!.type).toBe('autoNum');
      expect(para.bulletProperties!.autoNumType).toBe('romanUcPeriod');
      expect(para.bulletProperties!.startAt).toBeUndefined();
    });

    it('parses bullet with font', () => {
      const el = parseXml(
        `<a:p ${NS}>
          <a:pPr>
            <a:buFont typeface="Wingdings"/>
            <a:buChar char="q"/>
          </a:pPr>
          <a:r><a:t>text</a:t></a:r>
        </a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.bulletProperties!.type).toBe('char');
      expect(para.bulletProperties!.char).toBe('q');
      expect(para.bulletProperties!.font).toBe('Wingdings');
    });

    it('parses bullet with size percentage', () => {
      const el = parseXml(
        `<a:p ${NS}>
          <a:pPr>
            <a:buSzPct val="75000"/>
            <a:buChar char="-"/>
          </a:pPr>
          <a:r><a:t>text</a:t></a:r>
        </a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.bulletProperties!.sizePercent).toBeCloseTo(0.75);
    });

    it('parses bullet with color', () => {
      const el = parseXml(
        `<a:p ${NS}>
          <a:pPr>
            <a:buClr><a:srgbClr val="FF0000"/></a:buClr>
            <a:buChar char="*"/>
          </a:pPr>
          <a:r><a:t>text</a:t></a:r>
        </a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.bulletProperties!.color).toBeDefined();
      expect(para.bulletProperties!.color!.r).toBe(255);
      expect(para.bulletProperties!.color!.g).toBe(0);
      expect(para.bulletProperties!.color!.b).toBe(0);
    });

    it('parses bullet with font, size, and color together', () => {
      const el = parseXml(
        `<a:p ${NS}>
          <a:pPr>
            <a:buFont typeface="Symbol"/>
            <a:buSzPct val="100000"/>
            <a:buClr><a:srgbClr val="00FF00"/></a:buClr>
            <a:buChar char="\u00B7"/>
          </a:pPr>
          <a:r><a:t>text</a:t></a:r>
        </a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.bulletProperties!.type).toBe('char');
      expect(para.bulletProperties!.font).toBe('Symbol');
      expect(para.bulletProperties!.sizePercent).toBeCloseTo(1.0);
      expect(para.bulletProperties!.color!.g).toBe(255);
    });

    it('returns undefined bulletProperties when no bullet element present', () => {
      const el = parseXml(
        `<a:p ${NS}><a:pPr algn="l"/><a:r><a:t>text</a:t></a:r></a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.bulletProperties).toBeUndefined();
    });
  });

  describe('mixed runs and line breaks', () => {
    it('parses paragraph with mixed runs and line breaks', () => {
      const el = parseXml(
        `<a:p ${NS}>
          <a:pPr algn="ctr"/>
          <a:r><a:rPr b="1"/><a:t>Bold</a:t></a:r>
          <a:br><a:rPr sz="1800"/></a:br>
          <a:r><a:rPr i="1"/><a:t>Italic</a:t></a:r>
        </a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.runs).toHaveLength(3);
      expect(para.runs[0].kind).toBe('run');
      expect((para.runs[0] as { kind: 'run'; text: string }).text).toBe('Bold');
      expect(para.runs[1].kind).toBe('lineBreak');
      expect(para.runs[2].kind).toBe('run');
      expect((para.runs[2] as { kind: 'run'; text: string }).text).toBe('Italic');
    });

    it('skips endParaRPr in run collection', () => {
      const el = parseXml(
        `<a:p ${NS}>
          <a:r><a:t>text</a:t></a:r>
          <a:endParaRPr lang="en-US" sz="1800"/>
        </a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.runs).toHaveLength(1);
      expect(para.runs[0].kind).toBe('run');
    });

    it('handles paragraph with no runs', () => {
      const el = parseXml(
        `<a:p ${NS}><a:pPr algn="l"/><a:endParaRPr lang="en-US"/></a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.runs).toHaveLength(0);
      expect(para.properties.alignment).toBe('left');
    });

    it('handles paragraph without pPr', () => {
      const el = parseXml(
        `<a:p ${NS}><a:r><a:t>plain text</a:t></a:r></a:p>`
      );
      const para = parseParagraph(el, TEST_THEME);

      expect(para.runs).toHaveLength(1);
      expect(para.properties).toEqual({});
      expect(para.bulletProperties).toBeUndefined();
    });
  });
});
