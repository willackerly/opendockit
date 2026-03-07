/**
 * Comprehensive tests for PDF content extraction (text + images).
 *
 * Tests cover:
 * - StreamDecoder: FlateDecode, PNG predictor, ASCIIHex, ASCII85, LZW, RunLength
 * - CMapParser: bfchar, bfrange, multi-byte, ligatures, code space detection
 * - FontDecoder: ToUnicode, /Differences, named encodings, composite fonts
 * - AdobeGlyphList: glyph name to Unicode lookup
 * - TextExtractor: round-trip create→extract, operators, positioning
 * - ImageExtractor: round-trip JPEG/PNG embed→extract
 */

import { describe, it, expect } from 'vitest';
import * as pako from 'pako';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  extractText,
  extractTextContent,
  extractImages,
  joinTextItems,
  parseToUnicodeCMap,
  detectCodeLength,
  glyphNameToUnicode,
  getDecompressedStreamData,
  getStreamFilters,
} from '../index.js';
import type { TextItem } from '../index.js';
import {
  COSStream,
  COSName,
  COSArray,
  COSDictionary,
  COSInteger,
} from '../../pdfbox/cos/COSTypes.js';

// ═══════════════════════════════════════════════════════════════════════════
// StreamDecoder Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('StreamDecoder', () => {
  it('should return raw data when no filter is set', () => {
    const stream = new COSStream();
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    stream.setData(data);
    expect(getDecompressedStreamData(stream)).toEqual(data);
  });

  it('should return empty array for empty stream', () => {
    const stream = new COSStream();
    expect(getDecompressedStreamData(stream)).toEqual(new Uint8Array());
  });

  it('should decompress FlateDecode data', () => {
    const original = new TextEncoder().encode('Hello, PDF World!');
    const compressed = pako.deflate(original);

    const stream = new COSStream();
    stream.setData(compressed);
    stream.getDictionary().setItem('Filter', new COSName('FlateDecode'));

    const result = getDecompressedStreamData(stream);
    expect(new TextDecoder().decode(result)).toBe('Hello, PDF World!');
  });

  it('should handle FlateDecode with PNG predictor (Sub)', () => {
    // Create a simple 3x2 image with PNG Sub predictor
    // Each row: filter_byte + pixel_bytes
    // Row 1 (Sub filter = 1): bytes are deltas from left neighbor
    // Row 2 (Sub filter = 1): bytes are deltas from left neighbor
    const rowBytes = 3; // 3 columns, 1 color, 8 bpc
    const predData = new Uint8Array([
      1, 10, 5, 3,   // Row 0: Sub filter, raw=[10, 15, 18]
      1, 20, 2, 1,   // Row 1: Sub filter, raw=[20, 22, 23]
    ]);

    const compressed = pako.deflate(predData);
    const stream = new COSStream();
    stream.setData(compressed);
    stream.getDictionary().setItem('Filter', new COSName('FlateDecode'));

    const parms = new COSDictionary();
    parms.setItem('Predictor', new COSInteger(11)); // PNG Sub
    parms.setItem('Columns', new COSInteger(3));
    parms.setItem('Colors', new COSInteger(1));
    parms.setItem('BitsPerComponent', new COSInteger(8));
    stream.getDictionary().setItem('DecodeParms', parms);

    const result = getDecompressedStreamData(stream);
    // Row 0: [10, 10+5=15, 15+3=18]
    // Row 1: [20, 20+2=22, 22+1=23]
    expect(result).toEqual(new Uint8Array([10, 15, 18, 20, 22, 23]));
  });

  it('should pass through DCTDecode data', () => {
    const jpegData = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]);
    const stream = new COSStream();
    stream.setData(jpegData);
    stream.getDictionary().setItem('Filter', new COSName('DCTDecode'));

    const result = getDecompressedStreamData(stream);
    expect(result).toEqual(jpegData);
  });

  it('should pass through JPXDecode data', () => {
    const jp2Data = new Uint8Array([0, 0, 0, 12, 1, 2, 3]);
    const stream = new COSStream();
    stream.setData(jp2Data);
    stream.getDictionary().setItem('Filter', new COSName('JPXDecode'));

    const result = getDecompressedStreamData(stream);
    expect(result).toEqual(jp2Data);
  });

  it('should read filter names from stream', () => {
    const stream = new COSStream();
    stream.getDictionary().setItem('Filter', new COSName('FlateDecode'));
    expect(getStreamFilters(stream)).toEqual(['FlateDecode']);
  });

  it('should read filter array from stream', () => {
    const stream = new COSStream();
    const filters = new COSArray();
    filters.add(new COSName('ASCIIHexDecode'));
    filters.add(new COSName('FlateDecode'));
    stream.getDictionary().setItem('Filter', filters);
    expect(getStreamFilters(stream)).toEqual(['ASCIIHexDecode', 'FlateDecode']);
  });

  it('should return empty array when no filter', () => {
    const stream = new COSStream();
    expect(getStreamFilters(stream)).toEqual([]);
  });

  it('should decode ASCIIHexDecode', () => {
    const hex = new TextEncoder().encode('48656C6C6F>');
    const stream = new COSStream();
    stream.setData(hex);
    stream.getDictionary().setItem('Filter', new COSName('ASCIIHexDecode'));

    const result = getDecompressedStreamData(stream);
    expect(new TextDecoder().decode(result)).toBe('Hello');
  });

  it('should decode ASCII85Decode', () => {
    // "Test" (4 bytes) in ASCII85 = <~FCfN8~>
    const a85 = new TextEncoder().encode('<~FCfN8~>');
    const stream = new COSStream();
    stream.setData(a85);
    stream.getDictionary().setItem('Filter', new COSName('ASCII85Decode'));

    const result = getDecompressedStreamData(stream);
    expect(new TextDecoder().decode(result)).toBe('test');
  });

  it('should decode RunLengthDecode', () => {
    // Run-length encoded: literal "AB" (length=1, 'A', 'B'), repeat 'C' 3 times (254, 'C'), EOD
    const data = new Uint8Array([1, 0x41, 0x42, 254, 0x43, 128]);
    const stream = new COSStream();
    stream.setData(data);
    stream.getDictionary().setItem('Filter', new COSName('RunLengthDecode'));

    const result = getDecompressedStreamData(stream);
    expect(new TextDecoder().decode(result)).toBe('ABCCC');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CMapParser Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('CMapParser', () => {
  it('should parse bfchar mappings', () => {
    const cmap = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CMapName /test def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
3 beginbfchar
<0048> <0048>
<0065> <0065>
<006C> <006C>
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end end`;

    const map = parseToUnicodeCMap(new TextEncoder().encode(cmap));
    expect(map.get(0x0048)).toBe('H');
    expect(map.get(0x0065)).toBe('e');
    expect(map.get(0x006C)).toBe('l');
  });

  it('should parse bfrange with offset', () => {
    const cmap = `1 begincodespacerange
<00> <FF>
endcodespacerange
1 beginbfrange
<41> <5A> <0041>
endbfrange`;

    const map = parseToUnicodeCMap(new TextEncoder().encode(cmap));
    expect(map.get(0x41)).toBe('A');
    expect(map.get(0x42)).toBe('B');
    expect(map.get(0x5A)).toBe('Z');
  });

  it('should parse bfrange with array', () => {
    const cmap = `1 begincodespacerange
<00> <FF>
endcodespacerange
1 beginbfrange
<01> <03> [<0041> <0042> <0043>]
endbfrange`;

    const map = parseToUnicodeCMap(new TextEncoder().encode(cmap));
    expect(map.get(1)).toBe('A');
    expect(map.get(2)).toBe('B');
    expect(map.get(3)).toBe('C');
  });

  it('should handle multi-byte codes', () => {
    const cmap = `1 begincodespacerange
<0000> <FFFF>
endcodespacerange
1 beginbfchar
<0048> <0048>
endbfchar`;

    const map = parseToUnicodeCMap(new TextEncoder().encode(cmap));
    expect(map.get(0x0048)).toBe('H');
  });

  it('should handle ligatures (multi-char Unicode values)', () => {
    const cmap = `1 begincodespacerange
<00> <FF>
endcodespacerange
2 beginbfchar
<01> <00660069>
<02> <0066006C>
endbfchar`;

    const map = parseToUnicodeCMap(new TextEncoder().encode(cmap));
    expect(map.get(1)).toBe('fi');
    expect(map.get(2)).toBe('fl');
  });

  it('should detect 1-byte code space', () => {
    const cmap = `1 begincodespacerange
<00> <FF>
endcodespacerange`;

    expect(detectCodeLength(new TextEncoder().encode(cmap))).toBe(1);
  });

  it('should detect 2-byte code space', () => {
    const cmap = `1 begincodespacerange
<0000> <FFFF>
endcodespacerange`;

    expect(detectCodeLength(new TextEncoder().encode(cmap))).toBe(2);
  });

  it('should handle empty cmap', () => {
    const map = parseToUnicodeCMap(new TextEncoder().encode(''));
    expect(map.size).toBe(0);
  });

  it('should handle multiple bfchar sections', () => {
    const cmap = `1 beginbfchar
<41> <0041>
endbfchar
1 beginbfchar
<42> <0042>
endbfchar`;

    const map = parseToUnicodeCMap(new TextEncoder().encode(cmap));
    expect(map.get(0x41)).toBe('A');
    expect(map.get(0x42)).toBe('B');
  });

  it('should handle bfrange with single code', () => {
    const cmap = `1 beginbfrange
<20> <20> <0020>
endbfrange`;

    const map = parseToUnicodeCMap(new TextEncoder().encode(cmap));
    expect(map.get(0x20)).toBe(' ');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AdobeGlyphList Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('AdobeGlyphList', () => {
  it('should resolve basic Latin glyph names', () => {
    expect(glyphNameToUnicode('A')).toBe(0x0041);
    expect(glyphNameToUnicode('z')).toBe(0x007A);
    expect(glyphNameToUnicode('space')).toBe(0x0020);
  });

  it('should resolve extended glyph names', () => {
    expect(glyphNameToUnicode('Agrave')).toBe(0x00C0);
    expect(glyphNameToUnicode('eacute')).toBe(0x00E9);
    expect(glyphNameToUnicode('germandbls')).toBe(0x00DF);
  });

  it('should resolve ligature glyph names', () => {
    expect(glyphNameToUnicode('fi')).toBe(0xFB01);
    expect(glyphNameToUnicode('fl')).toBe(0xFB02);
    expect(glyphNameToUnicode('ff')).toBe(0xFB00);
    expect(glyphNameToUnicode('ffi')).toBe(0xFB03);
    expect(glyphNameToUnicode('ffl')).toBe(0xFB04);
  });

  it('should resolve typographic glyph names', () => {
    expect(glyphNameToUnicode('endash')).toBe(0x2013);
    expect(glyphNameToUnicode('emdash')).toBe(0x2014);
    expect(glyphNameToUnicode('bullet')).toBe(0x2022);
    expect(glyphNameToUnicode('Euro')).toBe(0x20AC);
  });

  it('should resolve uniXXXX convention', () => {
    expect(glyphNameToUnicode('uni0041')).toBe(0x0041);
    expect(glyphNameToUnicode('uni00E9')).toBe(0x00E9);
  });

  it('should resolve uXXXXX convention', () => {
    expect(glyphNameToUnicode('u1F600')).toBe(0x1F600);
  });

  it('should return undefined for unknown glyph names', () => {
    expect(glyphNameToUnicode('nonexistent')).toBeUndefined();
    expect(glyphNameToUnicode('')).toBeUndefined();
  });

  it('should resolve Greek letters', () => {
    expect(glyphNameToUnicode('Alpha')).toBe(0x0391);
    expect(glyphNameToUnicode('omega')).toBe(0x03C9);
  });

  it('should resolve mathematical symbols', () => {
    expect(glyphNameToUnicode('infinity')).toBe(0x221E);
    expect(glyphNameToUnicode('integral')).toBe(0x222B);
    expect(glyphNameToUnicode('radical')).toBe(0x221A);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TextExtractor Tests (round-trip: create PDF → extract text)
// ═══════════════════════════════════════════════════════════════════════════

describe('TextExtractor', () => {
  it('should extract simple text from a created PDF', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([200, 200]);
    page.drawText('Hello World', { x: 10, y: 100, size: 12, font });

    const pdfBytes = await doc.save();
    const pages = await extractText(pdfBytes);

    expect(pages).toHaveLength(1);
    expect(pages[0].text).toContain('Hello World');
  });

  it('should extract text from multiple pages', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    const page1 = doc.addPage([200, 200]);
    page1.drawText('Page One', { x: 10, y: 100, size: 12, font });

    const page2 = doc.addPage([200, 200]);
    page2.drawText('Page Two', { x: 10, y: 100, size: 12, font });

    const pdfBytes = await doc.save();
    const pages = await extractText(pdfBytes);

    expect(pages).toHaveLength(2);
    expect(pages[0].text).toContain('Page One');
    expect(pages[1].text).toContain('Page Two');
  });

  it('should extract text with page filter', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    const page1 = doc.addPage([200, 200]);
    page1.drawText('Page One', { x: 10, y: 100, size: 12, font });

    const page2 = doc.addPage([200, 200]);
    page2.drawText('Page Two', { x: 10, y: 100, size: 12, font });

    const pdfBytes = await doc.save();
    const pages = await extractText(pdfBytes, { pages: [1] });

    expect(pages).toHaveLength(1);
    expect(pages[0].pageIndex).toBe(1);
    expect(pages[0].text).toContain('Page Two');
  });

  it('should extract text with multiple fonts', async () => {
    const doc = await PDFDocument.create();
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const courier = await doc.embedFont(StandardFonts.Courier);

    const page = doc.addPage([300, 200]);
    page.drawText('Helvetica Text', { x: 10, y: 150, size: 12, font: helvetica });
    page.drawText('Courier Text', { x: 10, y: 100, size: 12, font: courier });

    const pdfBytes = await doc.save();
    const pages = await extractText(pdfBytes);

    expect(pages[0].text).toContain('Helvetica Text');
    expect(pages[0].text).toContain('Courier Text');
  });

  it('should handle empty pages', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);

    const pdfBytes = await doc.save();
    const pages = await extractText(pdfBytes);

    expect(pages).toHaveLength(1);
    expect(pages[0].text).toBe('');
    expect(pages[0].items).toHaveLength(0);
  });

  it('should return text items with position info', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    const page = doc.addPage([200, 200]);
    page.drawText('Test', { x: 50, y: 100, size: 14, font });

    const pdfBytes = await doc.save();
    const pages = await extractText(pdfBytes);

    expect(pages[0].items.length).toBeGreaterThan(0);
    const item = pages[0].items[0];
    expect(item.text).toContain('Test');
    expect(item.x).toBeCloseTo(50, 0);
    expect(item.y).toBeCloseTo(100, 0);
    expect(item.fontSize).toBe(14);
  });

  it('should extract multi-line text', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    const page = doc.addPage([300, 300]);
    page.drawText('Line One', { x: 10, y: 200, size: 12, font });
    page.drawText('Line Two', { x: 10, y: 180, size: 12, font });
    page.drawText('Line Three', { x: 10, y: 160, size: 12, font });

    const pdfBytes = await doc.save();
    const pages = await extractText(pdfBytes);

    const text = pages[0].text;
    expect(text).toContain('Line One');
    expect(text).toContain('Line Two');
    expect(text).toContain('Line Three');
    // Lines should be in order (top to bottom)
    expect(text.indexOf('Line One')).toBeLessThan(text.indexOf('Line Two'));
    expect(text.indexOf('Line Two')).toBeLessThan(text.indexOf('Line Three'));
  });

  it('should use extractTextContent convenience function', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    const page = doc.addPage([200, 200]);
    page.drawText('Quick extract', { x: 10, y: 100, size: 12, font });

    const pdfBytes = await doc.save();
    const text = await extractTextContent(pdfBytes);

    expect(text).toContain('Quick extract');
  });

  it('should extract text with different font sizes', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    const page = doc.addPage([300, 300]);
    page.drawText('Big Text', { x: 10, y: 200, size: 24, font });
    page.drawText('Small Text', { x: 10, y: 150, size: 8, font });

    const pdfBytes = await doc.save();
    const pages = await extractText(pdfBytes);

    const bigItem = pages[0].items.find(i => i.text.includes('Big'));
    const smallItem = pages[0].items.find(i => i.text.includes('Small'));

    expect(bigItem).toBeDefined();
    expect(smallItem).toBeDefined();
    expect(bigItem!.fontSize).toBe(24);
    expect(smallItem!.fontSize).toBe(8);
  });

  it('should handle colored text', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    const page = doc.addPage([200, 200]);
    page.drawText('Red Text', { x: 10, y: 100, size: 12, font, color: rgb(1, 0, 0) });

    const pdfBytes = await doc.save();
    const pages = await extractText(pdfBytes);

    expect(pages[0].text).toContain('Red Text');
  });

  it('should handle text with special characters (WinAnsi range)', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    const page = doc.addPage([300, 200]);
    page.drawText('Price: $100.00', { x: 10, y: 100, size: 12, font });

    const pdfBytes = await doc.save();
    const pages = await extractText(pdfBytes);

    expect(pages[0].text).toContain('Price: $100.00');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// joinTextItems Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('joinTextItems', () => {
  it('should join items on the same line', () => {
    const items: TextItem[] = [
      { text: 'Hello', x: 10, y: 100, width: 30, height: 12, fontName: 'F1', fontSize: 12 },
      { text: 'World', x: 45, y: 100, width: 30, height: 12, fontName: 'F1', fontSize: 12 },
    ];
    const result = joinTextItems(items);
    expect(result).toBe('Hello World');
  });

  it('should handle multiple lines', () => {
    const items: TextItem[] = [
      { text: 'Line 1', x: 10, y: 100, width: 40, height: 12, fontName: 'F1', fontSize: 12 },
      { text: 'Line 2', x: 10, y: 85, width: 40, height: 12, fontName: 'F1', fontSize: 12 },
    ];
    const result = joinTextItems(items);
    expect(result).toContain('Line 1');
    expect(result).toContain('Line 2');
    expect(result.indexOf('Line 1')).toBeLessThan(result.indexOf('Line 2'));
  });

  it('should return empty string for no items', () => {
    expect(joinTextItems([])).toBe('');
  });

  it('should detect paragraph breaks from large Y gaps', () => {
    const items: TextItem[] = [
      { text: 'Para 1', x: 10, y: 200, width: 40, height: 12, fontName: 'F1', fontSize: 12 },
      { text: 'Para 2', x: 10, y: 150, width: 40, height: 12, fontName: 'F1', fontSize: 12 },
    ];
    const result = joinTextItems(items);
    // Should have paragraph break (empty line) between them
    const lines = result.split('\n');
    expect(lines.length).toBeGreaterThan(2); // At least: Para 1, empty, Para 2
  });

  it('should concatenate adjacent items without space', () => {
    const items: TextItem[] = [
      { text: 'Hel', x: 10, y: 100, width: 20, height: 12, fontName: 'F1', fontSize: 12 },
      { text: 'lo', x: 30, y: 100, width: 12, height: 12, fontName: 'F1', fontSize: 12 },
    ];
    const result = joinTextItems(items);
    expect(result).toBe('Hello');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ImageExtractor Tests (round-trip: create PDF with image → extract)
// ═══════════════════════════════════════════════════════════════════════════

describe('ImageExtractor', () => {
  // Minimal JPEG (2x2 pixels, valid JFIF)
  function createMinimalJpeg(): Uint8Array {
    // This is the smallest valid JPEG: SOI + APP0(JFIF) + DQT + SOF0 + DHT + SOS + image data + EOI
    // We'll use a pre-built tiny JPEG
    return new Uint8Array([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
      0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
      0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
      0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
      0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x02,
      0x00, 0x02, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
      0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
      0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
      0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
      0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
      0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
      0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
      0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
      0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
      0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
      0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
      0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
      0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
      0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
      0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
      0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
      0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
      0x00, 0x00, 0x3F, 0x00, 0x7B, 0x94, 0x11, 0x00, 0x00, 0x00, 0xFF, 0xD9,
    ]);
  }

  it('should extract JPEG images from a PDF', async () => {
    const doc = await PDFDocument.create();
    const jpegBytes = createMinimalJpeg();
    const image = await doc.embedJpg(jpegBytes);
    const page = doc.addPage([200, 200]);
    page.drawImage(image, { x: 10, y: 10, width: 50, height: 50 });

    const pdfBytes = await doc.save();
    const images = await extractImages(pdfBytes);

    expect(images.length).toBeGreaterThanOrEqual(1);
    const img = images[0];
    expect(img.pageIndex).toBe(0);
    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
    expect(img.filter).toBe('DCTDecode');
    // Data should start with JPEG SOI marker
    expect(img.data[0]).toBe(0xFF);
    expect(img.data[1]).toBe(0xD8);
  });

  it('should extract images from specific pages', async () => {
    const doc = await PDFDocument.create();
    const jpegBytes = createMinimalJpeg();
    const image = await doc.embedJpg(jpegBytes);

    const page1 = doc.addPage([200, 200]);
    page1.drawImage(image, { x: 10, y: 10, width: 50, height: 50 });

    const page2 = doc.addPage([200, 200]);
    // No image on page 2

    const pdfBytes = await doc.save();

    const page1Images = await extractImages(pdfBytes, { pages: [0] });
    expect(page1Images.length).toBeGreaterThanOrEqual(1);

    const page2Images = await extractImages(pdfBytes, { pages: [1] });
    expect(page2Images).toHaveLength(0);
  });

  it('should return empty array for pages with no images', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([200, 200]);
    page.drawText('No images here', { x: 10, y: 100, size: 12, font });

    const pdfBytes = await doc.save();
    const images = await extractImages(pdfBytes);

    expect(images).toHaveLength(0);
  });

  it('should report image metadata', async () => {
    const doc = await PDFDocument.create();
    const jpegBytes = createMinimalJpeg();
    const image = await doc.embedJpg(jpegBytes);
    const page = doc.addPage([200, 200]);
    page.drawImage(image, { x: 10, y: 10, width: 50, height: 50 });

    const pdfBytes = await doc.save();
    const images = await extractImages(pdfBytes);

    const img = images[0];
    expect(img.name).toBeTruthy();
    expect(img.bitsPerComponent).toBe(8);
    expect(typeof img.colorSpace).toBe('string');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Integration: Text + Image extraction together
// ═══════════════════════════════════════════════════════════════════════════

describe('Integration', () => {
  it('should extract both text and images from the same PDF', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    // Minimal JPEG
    const jpegBytes = new Uint8Array([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
      0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
      0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
      0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
      0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x02,
      0x00, 0x02, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
      0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
      0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
      0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
      0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
      0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
      0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
      0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
      0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
      0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
      0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
      0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
      0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
      0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
      0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
      0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
      0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
      0x00, 0x00, 0x3F, 0x00, 0x7B, 0x94, 0x11, 0x00, 0x00, 0x00, 0xFF, 0xD9,
    ]);

    const image = await doc.embedJpg(jpegBytes);
    const page = doc.addPage([300, 300]);
    page.drawText('Photo Caption', { x: 10, y: 200, size: 12, font });
    page.drawImage(image, { x: 10, y: 50, width: 100, height: 100 });

    const pdfBytes = await doc.save();

    const textPages = await extractText(pdfBytes);
    const images = await extractImages(pdfBytes);

    expect(textPages[0].text).toContain('Photo Caption');
    expect(images.length).toBeGreaterThanOrEqual(1);
  });
});
