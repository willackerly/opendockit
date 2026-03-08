import { describe, it, expect } from 'vitest';
import { parseXml } from '@opendockit/core';
import { parseStyles, parseDocDefaults } from '../styles.js';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function stylesXml(inner: string): string {
  return `<w:styles ${NS}>${inner}</w:styles>`;
}

describe('parseStyles', () => {
  it('should parse a simple paragraph style', () => {
    const el = parseXml(
      stylesXml(
        '<w:style w:type="paragraph" w:styleId="Normal">' +
          '<w:name w:val="Normal"/>' +
          '</w:style>'
      )
    );
    const styles = parseStyles(el);
    expect(styles.size).toBe(1);
    expect(styles.get('Normal')?.name).toBe('Normal');
  });

  it('should ignore non-paragraph styles', () => {
    const el = parseXml(
      stylesXml(
        '<w:style w:type="character" w:styleId="Bold">' +
          '<w:name w:val="Bold"/>' +
          '</w:style>' +
          '<w:style w:type="paragraph" w:styleId="Normal">' +
          '<w:name w:val="Normal"/>' +
          '</w:style>'
      )
    );
    const styles = parseStyles(el);
    expect(styles.size).toBe(1);
    expect(styles.has('Bold')).toBe(false);
    expect(styles.has('Normal')).toBe(true);
  });

  it('should parse style with alignment', () => {
    const el = parseXml(
      stylesXml(
        '<w:style w:type="paragraph" w:styleId="Center">' +
          '<w:name w:val="Center"/>' +
          '<w:pPr><w:jc w:val="center"/></w:pPr>' +
          '</w:style>'
      )
    );
    const styles = parseStyles(el);
    expect(styles.get('Center')?.alignment).toBe('center');
  });

  it('should parse style with spacing', () => {
    const el = parseXml(
      stylesXml(
        '<w:style w:type="paragraph" w:styleId="Spaced">' +
          '<w:name w:val="Spaced"/>' +
          '<w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>' +
          '</w:style>'
      )
    );
    const styles = parseStyles(el);
    const style = styles.get('Spaced');
    expect(style?.spacingBefore).toBe(12);
    expect(style?.spacingAfter).toBe(6);
  });

  it('should parse style with line spacing', () => {
    const el = parseXml(
      stylesXml(
        '<w:style w:type="paragraph" w:styleId="Double">' +
          '<w:name w:val="Double"/>' +
          '<w:pPr><w:spacing w:line="480" w:lineRule="auto"/></w:pPr>' +
          '</w:style>'
      )
    );
    const styles = parseStyles(el);
    expect(styles.get('Double')?.lineSpacing).toBe(2.0);
  });

  it('should parse style with run properties', () => {
    const el = parseXml(
      stylesXml(
        '<w:style w:type="paragraph" w:styleId="Heading1">' +
          '<w:name w:val="Heading 1"/>' +
          '<w:rPr>' +
          '<w:b/>' +
          '<w:sz w:val="32"/>' +
          '<w:rFonts w:ascii="Arial"/>' +
          '<w:color w:val="2F5496"/>' +
          '</w:rPr>' +
          '</w:style>'
      )
    );
    const styles = parseStyles(el);
    const h1 = styles.get('Heading1');
    expect(h1?.runProperties?.bold).toBe(true);
    expect(h1?.runProperties?.fontSize).toBe(16);
    expect(h1?.runProperties?.fontFamily).toBe('Arial');
    expect(h1?.runProperties?.color).toBe('2F5496');
  });

  it('should resolve style inheritance (basedOn)', () => {
    const el = parseXml(
      stylesXml(
        '<w:style w:type="paragraph" w:styleId="Normal">' +
          '<w:name w:val="Normal"/>' +
          '<w:pPr><w:spacing w:after="160"/></w:pPr>' +
          '<w:rPr><w:sz w:val="22"/></w:rPr>' +
          '</w:style>' +
          '<w:style w:type="paragraph" w:styleId="Heading1">' +
          '<w:name w:val="Heading 1"/>' +
          '<w:basedOn w:val="Normal"/>' +
          '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>' +
          '</w:style>'
      )
    );
    const styles = parseStyles(el);
    const h1 = styles.get('Heading1');
    // Inherited from Normal
    expect(h1?.spacingAfter).toBe(8); // 160 DXA = 8pt
    // Overridden by Heading1
    expect(h1?.runProperties?.bold).toBe(true);
    expect(h1?.runProperties?.fontSize).toBe(16);
  });

  it('should resolve deep inheritance chains', () => {
    const el = parseXml(
      stylesXml(
        '<w:style w:type="paragraph" w:styleId="Base">' +
          '<w:name w:val="Base"/>' +
          '<w:pPr><w:jc w:val="left"/><w:spacing w:before="100"/></w:pPr>' +
          '</w:style>' +
          '<w:style w:type="paragraph" w:styleId="Middle">' +
          '<w:name w:val="Middle"/>' +
          '<w:basedOn w:val="Base"/>' +
          '<w:pPr><w:spacing w:after="200"/></w:pPr>' +
          '</w:style>' +
          '<w:style w:type="paragraph" w:styleId="Child">' +
          '<w:name w:val="Child"/>' +
          '<w:basedOn w:val="Middle"/>' +
          '<w:pPr><w:jc w:val="center"/></w:pPr>' +
          '</w:style>'
      )
    );
    const styles = parseStyles(el);
    const child = styles.get('Child');
    // Overridden by Child
    expect(child?.alignment).toBe('center');
    // Inherited from Base through Middle
    expect(child?.spacingBefore).toBe(5); // 100 DXA = 5pt
    // Inherited from Middle
    expect(child?.spacingAfter).toBe(10); // 200 DXA = 10pt
  });

  it('should handle basedOn pointing to non-existent style', () => {
    const el = parseXml(
      stylesXml(
        '<w:style w:type="paragraph" w:styleId="Orphan">' +
          '<w:name w:val="Orphan"/>' +
          '<w:basedOn w:val="NonExistent"/>' +
          '<w:pPr><w:jc w:val="right"/></w:pPr>' +
          '</w:style>'
      )
    );
    const styles = parseStyles(el);
    const orphan = styles.get('Orphan');
    expect(orphan?.alignment).toBe('right');
    expect(orphan?.basedOn).toBe('NonExistent');
  });

  it('should parse multiple styles', () => {
    const el = parseXml(
      stylesXml(
        '<w:style w:type="paragraph" w:styleId="Normal">' +
          '<w:name w:val="Normal"/>' +
          '</w:style>' +
          '<w:style w:type="paragraph" w:styleId="Heading1">' +
          '<w:name w:val="Heading 1"/>' +
          '</w:style>' +
          '<w:style w:type="paragraph" w:styleId="Heading2">' +
          '<w:name w:val="Heading 2"/>' +
          '</w:style>'
      )
    );
    const styles = parseStyles(el);
    expect(styles.size).toBe(3);
  });

  it('should return empty map for empty styles element', () => {
    const el = parseXml(stylesXml(''));
    const styles = parseStyles(el);
    expect(styles.size).toBe(0);
  });

  it('should merge run properties during inheritance', () => {
    const el = parseXml(
      stylesXml(
        '<w:style w:type="paragraph" w:styleId="Parent">' +
          '<w:name w:val="Parent"/>' +
          '<w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="24"/></w:rPr>' +
          '</w:style>' +
          '<w:style w:type="paragraph" w:styleId="Child">' +
          '<w:name w:val="Child"/>' +
          '<w:basedOn w:val="Parent"/>' +
          '<w:rPr><w:b/></w:rPr>' +
          '</w:style>'
      )
    );
    const styles = parseStyles(el);
    const child = styles.get('Child');
    // Inherited from Parent
    expect(child?.runProperties?.fontFamily).toBe('Arial');
    expect(child?.runProperties?.fontSize).toBe(12);
    // Own property
    expect(child?.runProperties?.bold).toBe(true);
  });
});

describe('parseDocDefaults', () => {
  it('should return undefined when docDefaults is absent', () => {
    const el = parseXml(stylesXml(''));
    const result = parseDocDefaults(el);
    expect(result).toBeUndefined();
  });

  it('should parse default run properties', () => {
    const el = parseXml(
      stylesXml(
        '<w:docDefaults>' +
          '<w:rPrDefault>' +
          '<w:rPr><w:sz w:val="22"/><w:rFonts w:ascii="Calibri"/></w:rPr>' +
          '</w:rPrDefault>' +
          '</w:docDefaults>'
      )
    );
    const result = parseDocDefaults(el);
    expect(result).toBeDefined();
    expect(result?.runProperties?.fontSize).toBe(11);
    expect(result?.runProperties?.fontFamily).toBe('Calibri');
  });

  it('should parse default paragraph properties', () => {
    const el = parseXml(
      stylesXml(
        '<w:docDefaults>' +
          '<w:pPrDefault>' +
          '<w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr>' +
          '</w:pPrDefault>' +
          '</w:docDefaults>'
      )
    );
    const result = parseDocDefaults(el);
    expect(result).toBeDefined();
    expect(result?.spacingAfter).toBe(8); // 160 DXA = 8pt
    expect(result?.lineSpacing).toBeCloseTo(1.079, 2); // 259 / 240
  });

  it('should parse both run and paragraph defaults', () => {
    const el = parseXml(
      stylesXml(
        '<w:docDefaults>' +
          '<w:rPrDefault><w:rPr><w:sz w:val="24"/></w:rPr></w:rPrDefault>' +
          '<w:pPrDefault><w:pPr><w:jc w:val="center"/></w:pPr></w:pPrDefault>' +
          '</w:docDefaults>'
      )
    );
    const result = parseDocDefaults(el);
    expect(result?.runProperties?.fontSize).toBe(12);
    expect(result?.alignment).toBe('center');
  });
});
