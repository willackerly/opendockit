import { describe, it, expect } from 'vitest';
import { parseXml } from '@opendockit/core';
import { parseSectionProperties, defaultSectionDimensions } from '../section-properties.js';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

describe('parseSectionProperties', () => {
  it('should return US Letter defaults for undefined input', () => {
    const result = parseSectionProperties(undefined);
    // US Letter: 8.5" x 11" = 612pt x 792pt
    expect(result.pageWidth).toBe(612);
    expect(result.pageHeight).toBe(792);
    // 1" margins = 72pt
    expect(result.marginTop).toBe(72);
    expect(result.marginBottom).toBe(72);
    expect(result.marginLeft).toBe(72);
    expect(result.marginRight).toBe(72);
  });

  it('should parse US Letter page size', () => {
    const el = parseXml(`<w:sectPr ${NS}>` + '<w:pgSz w:w="12240" w:h="15840"/>' + '</w:sectPr>');
    const result = parseSectionProperties(el);
    expect(result.pageWidth).toBe(612); // 12240 / 20
    expect(result.pageHeight).toBe(792); // 15840 / 20
  });

  it('should parse A4 page size', () => {
    // A4: 210mm x 297mm = 11906 x 16838 twips
    const el = parseXml(`<w:sectPr ${NS}>` + '<w:pgSz w:w="11906" w:h="16838"/>' + '</w:sectPr>');
    const result = parseSectionProperties(el);
    expect(result.pageWidth).toBeCloseTo(595.3, 1);
    expect(result.pageHeight).toBeCloseTo(841.9, 1);
  });

  it('should parse custom margins', () => {
    const el = parseXml(
      `<w:sectPr ${NS}>` +
        '<w:pgMar w:top="720" w:right="1080" w:bottom="720" w:left="1080"/>' +
        '</w:sectPr>'
    );
    const result = parseSectionProperties(el);
    expect(result.marginTop).toBe(36); // 720 / 20
    expect(result.marginRight).toBe(54); // 1080 / 20
    expect(result.marginBottom).toBe(36);
    expect(result.marginLeft).toBe(54);
  });

  it('should parse both page size and margins together', () => {
    const el = parseXml(
      `<w:sectPr ${NS}>` +
        '<w:pgSz w:w="12240" w:h="15840"/>' +
        '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>' +
        '</w:sectPr>'
    );
    const result = parseSectionProperties(el);
    expect(result.pageWidth).toBe(612);
    expect(result.pageHeight).toBe(792);
    expect(result.marginTop).toBe(72);
    expect(result.marginRight).toBe(72);
    expect(result.marginBottom).toBe(72);
    expect(result.marginLeft).toBe(72);
  });

  it('should use default page size when pgSz is absent', () => {
    const el = parseXml(
      `<w:sectPr ${NS}>` +
        '<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/>' +
        '</w:sectPr>'
    );
    const result = parseSectionProperties(el);
    expect(result.pageWidth).toBe(612);
    expect(result.pageHeight).toBe(792);
  });

  it('should use default margins when pgMar is absent', () => {
    const el = parseXml(`<w:sectPr ${NS}>` + '<w:pgSz w:w="12240" w:h="15840"/>' + '</w:sectPr>');
    const result = parseSectionProperties(el);
    expect(result.marginTop).toBe(72);
    expect(result.marginBottom).toBe(72);
    expect(result.marginLeft).toBe(72);
    expect(result.marginRight).toBe(72);
  });

  it('should handle zero margins', () => {
    const el = parseXml(
      `<w:sectPr ${NS}>` +
        '<w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0"/>' +
        '</w:sectPr>'
    );
    const result = parseSectionProperties(el);
    expect(result.marginTop).toBe(0);
    expect(result.marginRight).toBe(0);
    expect(result.marginBottom).toBe(0);
    expect(result.marginLeft).toBe(0);
  });

  it('should handle missing individual margin attributes', () => {
    const el = parseXml(`<w:sectPr ${NS}>` + '<w:pgMar w:top="720"/>' + '</w:sectPr>');
    const result = parseSectionProperties(el);
    expect(result.marginTop).toBe(36);
    // Missing margins default to 1" = 72pt
    expect(result.marginRight).toBe(72);
    expect(result.marginBottom).toBe(72);
    expect(result.marginLeft).toBe(72);
  });
});

describe('defaultSectionDimensions', () => {
  it('should return US Letter with 1" margins', () => {
    const dims = defaultSectionDimensions();
    expect(dims.pageWidth).toBe(612);
    expect(dims.pageHeight).toBe(792);
    expect(dims.marginTop).toBe(72);
    expect(dims.marginBottom).toBe(72);
    expect(dims.marginLeft).toBe(72);
    expect(dims.marginRight).toBe(72);
  });
});
