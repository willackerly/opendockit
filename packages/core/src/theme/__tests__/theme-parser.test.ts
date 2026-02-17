import { describe, it, expect } from 'vitest';
import { parseXml } from '../../xml/index.js';
import { parseTheme } from '../theme-parser.js';

// ---------------------------------------------------------------------------
// Real Office theme XML fragment (from a typical PPTX theme1.xml)
// ---------------------------------------------------------------------------

const OFFICE_THEME_XML = `
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
      <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont>
        <a:latin typeface="Calibri Light"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:majorFont>
      <a:minorFont>
        <a:latin typeface="Calibri"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill>
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:lumMod val="110000"/><a:satMod val="105000"/><a:tint val="67000"/></a:schemeClr></a:gs>
            <a:gs pos="50000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="103000"/><a:tint val="73000"/></a:schemeClr></a:gs>
            <a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="109000"/><a:tint val="81000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:lin ang="5400000" scaled="0"/>
        </a:gradFill>
        <a:gradFill>
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:satMod val="103000"/><a:lumMod val="102000"/><a:tint val="94000"/></a:schemeClr></a:gs>
            <a:gs pos="50000"><a:schemeClr val="phClr"><a:satMod val="110000"/><a:lumMod val="100000"/><a:shade val="100000"/></a:schemeClr></a:gs>
            <a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="99000"/><a:satMod val="120000"/><a:shade val="78000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:lin ang="5400000" scaled="0"/>
        </a:gradFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="6350" cap="flat" cmpd="sng"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter/></a:ln>
        <a:ln w="12700" cap="flat" cmpd="sng"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter/></a:ln>
        <a:ln w="19050" cap="flat" cmpd="sng"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter/></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill>
        <a:gradFill>
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/><a:shade val="98000"/><a:lumMod val="102000"/></a:schemeClr></a:gs>
            <a:gs pos="50000"><a:schemeClr val="phClr"><a:tint val="98000"/><a:satMod val="130000"/><a:shade val="90000"/><a:lumMod val="103000"/></a:schemeClr></a:gs>
            <a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="63000"/><a:satMod val="120000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:lin ang="5400000" scaled="0"/>
        </a:gradFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>
`;

describe('parseTheme', () => {
  const themeEl = parseXml(OFFICE_THEME_XML);
  const theme = parseTheme(themeEl);

  it('parses the theme name', () => {
    expect(theme.name).toBe('Office Theme');
  });

  // ---------------------------------------------------------------------------
  // Color Scheme
  // ---------------------------------------------------------------------------

  describe('color scheme', () => {
    it('parses dk1 from sysClr with lastClr', () => {
      expect(theme.colorScheme.dk1).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    it('parses lt1 from sysClr with lastClr', () => {
      expect(theme.colorScheme.lt1).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    });

    it('parses dk2 from srgbClr', () => {
      expect(theme.colorScheme.dk2).toEqual({ r: 68, g: 84, b: 106, a: 1 });
    });

    it('parses lt2 from srgbClr', () => {
      expect(theme.colorScheme.lt2).toEqual({ r: 231, g: 230, b: 230, a: 1 });
    });

    it('parses accent1', () => {
      expect(theme.colorScheme.accent1).toEqual({
        r: 68,
        g: 114,
        b: 196,
        a: 1,
      });
    });

    it('parses accent2', () => {
      expect(theme.colorScheme.accent2).toEqual({
        r: 237,
        g: 125,
        b: 49,
        a: 1,
      });
    });

    it('parses accent3', () => {
      expect(theme.colorScheme.accent3).toEqual({
        r: 165,
        g: 165,
        b: 165,
        a: 1,
      });
    });

    it('parses accent4', () => {
      expect(theme.colorScheme.accent4).toEqual({
        r: 255,
        g: 192,
        b: 0,
        a: 1,
      });
    });

    it('parses accent5', () => {
      expect(theme.colorScheme.accent5).toEqual({
        r: 91,
        g: 155,
        b: 213,
        a: 1,
      });
    });

    it('parses accent6', () => {
      expect(theme.colorScheme.accent6).toEqual({
        r: 112,
        g: 173,
        b: 71,
        a: 1,
      });
    });

    it('parses hlink', () => {
      expect(theme.colorScheme.hlink).toEqual({ r: 5, g: 99, b: 193, a: 1 });
    });

    it('parses folHlink', () => {
      expect(theme.colorScheme.folHlink).toEqual({
        r: 149,
        g: 79,
        b: 114,
        a: 1,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Font Scheme
  // ---------------------------------------------------------------------------

  describe('font scheme', () => {
    it('parses major Latin font', () => {
      expect(theme.fontScheme.majorLatin).toBe('Calibri Light');
    });

    it('parses minor Latin font', () => {
      expect(theme.fontScheme.minorLatin).toBe('Calibri');
    });

    it('sets empty East Asian font to undefined', () => {
      expect(theme.fontScheme.majorEastAsia).toBeUndefined();
      expect(theme.fontScheme.minorEastAsia).toBeUndefined();
    });

    it('sets empty Complex Script font to undefined', () => {
      expect(theme.fontScheme.majorComplexScript).toBeUndefined();
      expect(theme.fontScheme.minorComplexScript).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Format Scheme
  // ---------------------------------------------------------------------------

  describe('format scheme', () => {
    it('parses 3 fill styles', () => {
      expect(theme.formatScheme.fillStyles).toHaveLength(3);
    });

    it('first fill style is solid', () => {
      expect(theme.formatScheme.fillStyles[0].type).toBe('solid');
    });

    it('second fill style is gradient', () => {
      expect(theme.formatScheme.fillStyles[1].type).toBe('gradient');
    });

    it('third fill style is gradient', () => {
      expect(theme.formatScheme.fillStyles[2].type).toBe('gradient');
    });

    it('parses 3 line styles', () => {
      expect(theme.formatScheme.lineStyles).toHaveLength(3);
    });

    it('line styles have increasing widths', () => {
      expect(theme.formatScheme.lineStyles[0].width).toBe(6350);
      expect(theme.formatScheme.lineStyles[1].width).toBe(12700);
      expect(theme.formatScheme.lineStyles[2].width).toBe(19050);
    });

    it('line styles have miter joins', () => {
      expect(theme.formatScheme.lineStyles[0].join).toBe('miter');
      expect(theme.formatScheme.lineStyles[1].join).toBe('miter');
    });

    it('line styles have solid dash style', () => {
      expect(theme.formatScheme.lineStyles[0].dashStyle).toBe('solid');
    });

    it('parses 3 effect styles', () => {
      expect(theme.formatScheme.effectStyles).toHaveLength(3);
    });

    it('parses 3 background fill styles', () => {
      expect(theme.formatScheme.bgFillStyles).toHaveLength(3);
    });

    it('first bg fill is solid', () => {
      expect(theme.formatScheme.bgFillStyles[0].type).toBe('solid');
    });

    it('third bg fill is gradient', () => {
      expect(theme.formatScheme.bgFillStyles[2].type).toBe('gradient');
    });
  });

  // ---------------------------------------------------------------------------
  // Missing elements fallbacks
  // ---------------------------------------------------------------------------

  describe('missing elements', () => {
    it('returns defaults when themeElements is missing', () => {
      const emptyThemeXml =
        '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Empty"/>';
      const el = parseXml(emptyThemeXml);
      const result = parseTheme(el);

      expect(result.name).toBe('Empty');
      expect(result.colorScheme.dk1).toBeDefined();
      expect(result.fontScheme.majorLatin).toBe('Calibri Light');
      expect(result.formatScheme.fillStyles).toHaveLength(3);
    });
  });
});
