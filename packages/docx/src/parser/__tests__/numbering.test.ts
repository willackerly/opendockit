import { describe, it, expect } from 'vitest';
import { parseXml } from '@opendockit/core';
import { parseNumbering, getBulletChar } from '../numbering.js';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function numberingXml(inner: string): string {
  return `<w:numbering ${NS}>${inner}</w:numbering>`;
}

describe('parseNumbering', () => {
  it('should parse a simple bullet list definition', () => {
    const el = parseXml(
      numberingXml(
        '<w:abstractNum w:abstractNumId="0">' +
          '<w:lvl w:ilvl="0">' +
          '<w:numFmt w:val="bullet"/>' +
          '<w:lvlText w:val="\u2022"/>' +
          '</w:lvl>' +
          '</w:abstractNum>' +
          '<w:num w:numId="1">' +
          '<w:abstractNumId w:val="0"/>' +
          '</w:num>'
      )
    );
    const map = parseNumbering(el);
    expect(map.size).toBe(1);
    expect(map.get(1)).toBeDefined();
    expect(map.get(1)!.levels.get(0)?.numFmt).toBe('bullet');
    expect(map.get(1)!.levels.get(0)?.levelText).toBe('\u2022');
  });

  it('should parse a numbered list definition', () => {
    const el = parseXml(
      numberingXml(
        '<w:abstractNum w:abstractNumId="0">' +
          '<w:lvl w:ilvl="0">' +
          '<w:numFmt w:val="decimal"/>' +
          '<w:lvlText w:val="%1."/>' +
          '</w:lvl>' +
          '</w:abstractNum>' +
          '<w:num w:numId="2">' +
          '<w:abstractNumId w:val="0"/>' +
          '</w:num>'
      )
    );
    const map = parseNumbering(el);
    expect(map.get(2)!.levels.get(0)?.numFmt).toBe('decimal');
    expect(map.get(2)!.levels.get(0)?.levelText).toBe('%1.');
  });

  it('should parse multiple levels', () => {
    const el = parseXml(
      numberingXml(
        '<w:abstractNum w:abstractNumId="0">' +
          '<w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="\u2022"/></w:lvl>' +
          '<w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/><w:lvlText w:val="\u25E6"/></w:lvl>' +
          '<w:lvl w:ilvl="2"><w:numFmt w:val="bullet"/><w:lvlText w:val="\u25AA"/></w:lvl>' +
          '</w:abstractNum>' +
          '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'
      )
    );
    const map = parseNumbering(el);
    const def = map.get(1)!;
    expect(def.levels.size).toBe(3);
    expect(def.levels.get(0)?.levelText).toBe('\u2022');
    expect(def.levels.get(1)?.levelText).toBe('\u25E6');
    expect(def.levels.get(2)?.levelText).toBe('\u25AA');
  });

  it('should handle multiple numbering instances', () => {
    const el = parseXml(
      numberingXml(
        '<w:abstractNum w:abstractNumId="0">' +
          '<w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="\u2022"/></w:lvl>' +
          '</w:abstractNum>' +
          '<w:abstractNum w:abstractNumId="1">' +
          '<w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>' +
          '</w:abstractNum>' +
          '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
          '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>'
      )
    );
    const map = parseNumbering(el);
    expect(map.size).toBe(2);
    expect(map.get(1)!.levels.get(0)?.numFmt).toBe('bullet');
    expect(map.get(2)!.levels.get(0)?.numFmt).toBe('decimal');
  });

  it('should return empty map for empty numbering element', () => {
    const el = parseXml(numberingXml(''));
    const map = parseNumbering(el);
    expect(map.size).toBe(0);
  });

  it('should handle missing abstractNumId reference gracefully', () => {
    const el = parseXml(numberingXml('<w:num w:numId="1"><w:abstractNumId w:val="99"/></w:num>'));
    const map = parseNumbering(el);
    expect(map.get(1)!.levels.size).toBe(0);
  });

  it('should default numFmt to "decimal" when missing', () => {
    const el = parseXml(
      numberingXml(
        '<w:abstractNum w:abstractNumId="0">' +
          '<w:lvl w:ilvl="0"><w:lvlText w:val="%1."/></w:lvl>' +
          '</w:abstractNum>' +
          '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'
      )
    );
    const map = parseNumbering(el);
    expect(map.get(1)!.levels.get(0)?.numFmt).toBe('decimal');
  });
});

describe('getBulletChar', () => {
  function setupMap(): ReturnType<typeof parseNumbering> {
    const el = parseXml(
      numberingXml(
        '<w:abstractNum w:abstractNumId="0">' +
          '<w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="\u2022"/></w:lvl>' +
          '<w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/><w:lvlText w:val="\u25E6"/></w:lvl>' +
          '</w:abstractNum>' +
          '<w:abstractNum w:abstractNumId="1">' +
          '<w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>' +
          '</w:abstractNum>' +
          '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
          '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>'
      )
    );
    return parseNumbering(el);
  }

  it('should return bullet character for bullet list', () => {
    const map = setupMap();
    expect(getBulletChar(map, 1, 0)).toBe('\u2022');
  });

  it('should return correct character for nested level', () => {
    const map = setupMap();
    expect(getBulletChar(map, 1, 1)).toBe('\u25E6');
  });

  it('should return level text for numbered list', () => {
    const map = setupMap();
    expect(getBulletChar(map, 2, 0)).toBe('%1.');
  });

  it('should return undefined for unknown numId', () => {
    const map = setupMap();
    expect(getBulletChar(map, 99, 0)).toBeUndefined();
  });

  it('should return undefined for unknown level', () => {
    const map = setupMap();
    expect(getBulletChar(map, 1, 5)).toBeUndefined();
  });
});
