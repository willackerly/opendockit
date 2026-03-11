import { describe, it, expect } from 'vitest';
import { extractEmbeddedFont } from '../FontExtractor.js';
import type { ExtractedFont } from '../FontExtractor.js';
import {
  COSDictionary,
  COSName,
  COSArray,
  COSStream,
  COSObjectReference,
  COSInteger,
} from '../../../pdfbox/cos/COSTypes.js';
import type { COSBase } from '../../../pdfbox/cos/COSBase.js';
import type { ObjectResolver } from '../FontDecoder.js';
import { parseTrueType } from '../../fonts/TrueTypeParser.js';

// ---------------------------------------------------------------------------
// Helper: build a minimal valid TrueType font binary
// ---------------------------------------------------------------------------

/**
 * Build a minimal TTF binary with enough tables for TrueTypeParser to parse.
 * This is the smallest valid TTF that parseTrueType() will accept.
 */
function buildMinimalTTF(): Uint8Array {
  // We need 7 required tables: head, hhea, hmtx, maxp, cmap, post, name
  const numTables = 7;
  const headerSize = 12; // sfnt header
  const dirSize = numTables * 16; // table directory
  const tablesStart = headerSize + dirSize;

  // Table data (all minimal)
  // head: 54 bytes
  const headData = new Uint8Array(54);
  const headView = new DataView(headData.buffer);
  headView.setUint32(0, 0x00010000, false); // version
  headView.setUint32(4, 0x00005000, false); // fontRevision
  headView.setUint32(8, 0x5F0F3CF5, false); // checksumAdjustment
  headView.setUint32(12, 0x5F0F3CF5, false); // magicNumber
  headView.setUint16(16, 0x000B, false); // flags
  headView.setUint16(18, 1000, false); // unitsPerEm
  // skip dates (bytes 20-35)
  headView.setInt16(36, 0, false); // xMin
  headView.setInt16(38, -200, false); // yMin
  headView.setInt16(40, 1000, false); // xMax
  headView.setInt16(42, 800, false); // yMax
  headView.setUint16(44, 0, false); // macStyle
  headView.setUint16(46, 8, false); // lowestRecPPEM
  headView.setInt16(48, 2, false); // fontDirectionHint
  headView.setInt16(50, 1, false); // indexToLocFormat
  headView.setInt16(52, 0, false); // glyphDataFormat

  // hhea: 36 bytes
  const hheaData = new Uint8Array(36);
  const hheaView = new DataView(hheaData.buffer);
  hheaView.setUint32(0, 0x00010000, false); // version
  hheaView.setInt16(4, 800, false); // ascender
  hheaView.setInt16(6, -200, false); // descender
  hheaView.setInt16(8, 0, false); // lineGap
  hheaView.setUint16(10, 1000, false); // advanceWidthMax
  // skip rest until numberOfHMetrics at offset 34
  hheaView.setUint16(34, 1, false); // numberOfHMetrics (1 glyph)

  // maxp: 6 bytes (minimal)
  const maxpData = new Uint8Array(6);
  const maxpView = new DataView(maxpData.buffer);
  maxpView.setUint32(0, 0x00010000, false); // version
  maxpView.setUint16(4, 1, false); // numGlyphs

  // hmtx: 4 bytes (1 metric = 2 bytes advanceWidth + 2 bytes lsb)
  const hmtxData = new Uint8Array(4);
  const hmtxView = new DataView(hmtxData.buffer);
  hmtxView.setUint16(0, 500, false); // advanceWidth
  hmtxView.setInt16(2, 0, false); // lsb

  // cmap: format 4 subtable (required by TrueTypeParser)
  // Header (4 bytes) + 1 encoding record (8 bytes) + format 4 subtable
  // Minimal format 4: 1 segment (0xFFFF → 0xFFFF) = sentinel only
  // segCount = 1, format 4 header = 14 bytes, arrays = 4 * 2 * segCount = 8 bytes
  const format4Size = 14 + 1 * 2 * 4 + 2; // header + endCode + reservedPad + startCode + idDelta + idRangeOffset
  const cmapData = new Uint8Array(12 + format4Size);
  const cmapView = new DataView(cmapData.buffer);
  cmapView.setUint16(0, 0, false); // version
  cmapView.setUint16(2, 1, false); // numTables
  // encoding record: platform 3 (Windows), encoding 1 (Unicode BMP)
  cmapView.setUint16(4, 3, false); // platformID
  cmapView.setUint16(6, 1, false); // encodingID
  cmapView.setUint32(8, 12, false); // offset to subtable
  // format 4 subtable at offset 12
  const f4 = 12; // subtable offset in cmapData
  cmapView.setUint16(f4 + 0, 4, false); // format = 4
  cmapView.setUint16(f4 + 2, format4Size, false); // length
  cmapView.setUint16(f4 + 4, 0, false); // language
  cmapView.setUint16(f4 + 6, 2, false); // segCountX2 (1 segment * 2)
  cmapView.setUint16(f4 + 8, 2, false); // searchRange
  cmapView.setUint16(f4 + 10, 0, false); // entrySelector
  cmapView.setUint16(f4 + 12, 0, false); // rangeShift
  // endCode[0] = 0xFFFF (sentinel)
  cmapView.setUint16(f4 + 14, 0xffff, false);
  // reservedPad
  cmapView.setUint16(f4 + 16, 0, false);
  // startCode[0] = 0xFFFF
  cmapView.setUint16(f4 + 18, 0xffff, false);
  // idDelta[0] = 1
  cmapView.setInt16(f4 + 20, 1, false);
  // idRangeOffset[0] = 0
  cmapView.setUint16(f4 + 22, 0, false);

  // post: 32 bytes (format 3 = no glyph names)
  const postData = new Uint8Array(32);
  const postView = new DataView(postData.buffer);
  postView.setUint32(0, 0x00030000, false); // format 3.0
  postView.setInt32(4, 0, false); // italicAngle (Fixed 16.16)
  postView.setInt16(8, -100, false); // underlinePosition
  postView.setInt16(10, 50, false); // underlineThickness
  postView.setUint32(12, 0, false); // isFixedPitch

  // name: minimal with postScriptName (nameID 6) and familyName (nameID 1)
  // Header (6 bytes) + 2 name records (12 bytes each) + string storage
  const nameStr1 = 'TestFont'; // family
  const nameStr6 = 'TestFont-Regular'; // postScript
  const stringData = new Uint8Array(nameStr1.length + nameStr6.length);
  for (let i = 0; i < nameStr1.length; i++) stringData[i] = nameStr1.charCodeAt(i);
  for (let i = 0; i < nameStr6.length; i++)
    stringData[nameStr1.length + i] = nameStr6.charCodeAt(i);

  const nameHeaderSize = 6 + 2 * 12; // 6 bytes header + 2 records
  const nameData = new Uint8Array(nameHeaderSize + stringData.length);
  const nameView = new DataView(nameData.buffer);
  nameView.setUint16(0, 0, false); // format
  nameView.setUint16(2, 2, false); // count
  nameView.setUint16(4, nameHeaderSize, false); // stringOffset
  // Record 0: familyName (nameID 1), platform 1 (Mac), encoding 0
  nameView.setUint16(6, 1, false); // platformID
  nameView.setUint16(8, 0, false); // encodingID
  nameView.setUint16(10, 0, false); // languageID
  nameView.setUint16(12, 1, false); // nameID (font family)
  nameView.setUint16(14, nameStr1.length, false); // length
  nameView.setUint16(16, 0, false); // offset
  // Record 1: postScriptName (nameID 6), platform 1 (Mac), encoding 0
  nameView.setUint16(18, 1, false); // platformID
  nameView.setUint16(20, 0, false); // encodingID
  nameView.setUint16(22, 0, false); // languageID
  nameView.setUint16(24, 6, false); // nameID (postScript)
  nameView.setUint16(26, nameStr6.length, false); // length
  nameView.setUint16(28, nameStr1.length, false); // offset
  nameData.set(stringData, nameHeaderSize);

  // Calculate table offsets
  const tables = [
    { tag: 'cmap', data: cmapData },
    { tag: 'head', data: headData },
    { tag: 'hhea', data: hheaData },
    { tag: 'hmtx', data: hmtxData },
    { tag: 'maxp', data: maxpData },
    { tag: 'name', data: nameData },
    { tag: 'post', data: postData },
  ];

  // Compute total size
  let offset = tablesStart;
  const tableOffsets: number[] = [];
  for (const t of tables) {
    tableOffsets.push(offset);
    offset += Math.ceil(t.data.length / 4) * 4; // pad to 4-byte boundary
  }
  const totalSize = offset;

  // Build the font
  const font = new Uint8Array(totalSize);
  const view = new DataView(font.buffer);

  // sfnt header
  view.setUint32(0, 0x00010000, false); // sfVersion (TrueType)
  view.setUint16(4, numTables, false);
  view.setUint16(6, 112, false); // searchRange
  view.setUint16(8, 3, false); // entrySelector
  view.setUint16(10, 0, false); // rangeShift

  // Table directory
  for (let i = 0; i < tables.length; i++) {
    const recOff = headerSize + i * 16;
    const tag = tables[i].tag;
    font[recOff] = tag.charCodeAt(0);
    font[recOff + 1] = tag.charCodeAt(1);
    font[recOff + 2] = tag.charCodeAt(2);
    font[recOff + 3] = tag.charCodeAt(3);
    view.setUint32(recOff + 4, 0, false); // checkSum (not validated)
    view.setUint32(recOff + 8, tableOffsets[i], false); // offset
    view.setUint32(recOff + 12, tables[i].data.length, false); // length
  }

  // Write table data
  for (let i = 0; i < tables.length; i++) {
    font.set(tables[i].data, tableOffsets[i]);
  }

  return font;
}

// ---------------------------------------------------------------------------
// Helper: trivial resolver (no indirect refs)
// ---------------------------------------------------------------------------

const noopResolver: ObjectResolver = () => undefined;

// ---------------------------------------------------------------------------
// Helper: build a font dict with FontDescriptor and FontFile*
// ---------------------------------------------------------------------------

function buildFontDict(opts: {
  baseFontName: string;
  subtype: string;
  fontFileKey: 'FontFile' | 'FontFile2' | 'FontFile3';
  fontFileSubtype?: string;
  fontFileData: Uint8Array;
  isComposite?: boolean;
}): { fontDict: COSDictionary; resolve: ObjectResolver } {
  const fontDescriptor = new COSDictionary();
  fontDescriptor.setItem('Type', new COSName('FontDescriptor'));
  fontDescriptor.setItem('FontName', new COSName(opts.baseFontName));

  // Create font stream
  const fontStream = new COSStream();
  fontStream.setData(opts.fontFileData);
  if (opts.fontFileSubtype) {
    fontStream.setItem('Subtype', new COSName(opts.fontFileSubtype));
  }
  fontDescriptor.setItem(opts.fontFileKey, fontStream);

  if (opts.isComposite) {
    // Type0 → DescendantFonts[0] (CIDFont with FontDescriptor)
    const cidFont = new COSDictionary();
    cidFont.setItem('Type', new COSName('Font'));
    cidFont.setItem('Subtype', new COSName('CIDFontType0'));
    cidFont.setItem('BaseFont', new COSName(opts.baseFontName));
    cidFont.setItem('FontDescriptor', fontDescriptor);

    const descendants = new COSArray();
    descendants.add(cidFont);

    const fontDict = new COSDictionary();
    fontDict.setItem('Type', new COSName('Font'));
    fontDict.setItem('Subtype', new COSName('Type0'));
    fontDict.setItem('BaseFont', new COSName(opts.baseFontName));
    fontDict.setItem('DescendantFonts', descendants);

    return { fontDict, resolve: noopResolver };
  } else {
    const fontDict = new COSDictionary();
    fontDict.setItem('Type', new COSName('Font'));
    fontDict.setItem('Subtype', new COSName(opts.subtype));
    fontDict.setItem('BaseFont', new COSName(opts.baseFontName));
    fontDict.setItem('FontDescriptor', fontDescriptor);

    return { fontDict, resolve: noopResolver };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FontExtractor', () => {
  describe('extractEmbeddedFont', () => {
    it('extracts TrueType font from FontFile2', () => {
      const ttfBytes = buildMinimalTTF();
      const { fontDict, resolve } = buildFontDict({
        baseFontName: 'TestFont-Regular',
        subtype: 'TrueType',
        fontFileKey: 'FontFile2',
        fontFileData: ttfBytes,
      });

      const result = extractEmbeddedFont(fontDict, resolve);

      expect(result).toBeDefined();
      expect(result!.fontName).toBe('TestFont-Regular');
      expect(result!.fontType).toBe('TrueType');
      expect(result!.rawBytes).toBeInstanceOf(Uint8Array);
      expect(result!.rawBytes.length).toBe(ttfBytes.length);
      // Metrics should be parsed from the TTF
      expect(result!.metrics).toBeDefined();
      expect(result!.metrics!.unitsPerEm).toBe(1000);
      expect(result!.metrics!.ascender).toBe(800);
      expect(result!.metrics!.descender).toBe(-200);
      // Glyph widths should be extracted
      expect(result!.glyphWidths).toBeDefined();
      expect(result!.glyphWidths!.get(0)).toBe(500);
    });

    it('extracts CFF font from FontFile3 with CIDFontType0C subtype', () => {
      // CFF parsing requires a valid OTTO/CFF font, but we can test the extraction
      // logic with invalid bytes — tryParseMetrics will just skip the parsing
      const fakeBytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const { fontDict, resolve } = buildFontDict({
        baseFontName: 'TestCFF-Regular',
        subtype: 'Type1',
        fontFileKey: 'FontFile3',
        fontFileSubtype: 'CIDFontType0C',
        fontFileData: fakeBytes,
      });

      const result = extractEmbeddedFont(fontDict, resolve);

      expect(result).toBeDefined();
      expect(result!.fontName).toBe('TestCFF-Regular');
      expect(result!.fontType).toBe('CFF');
      expect(result!.rawBytes).toEqual(fakeBytes);
      // Metrics will be undefined because the CFF bytes are not a valid font
      expect(result!.metrics).toBeUndefined();
    });

    it('extracts Type1 font from FontFile', () => {
      const fakeType1Bytes = new Uint8Array([0x80, 0x01, 0x00, 0x00, 0x00]);
      const { fontDict, resolve } = buildFontDict({
        baseFontName: 'TimesNewRoman',
        subtype: 'Type1',
        fontFileKey: 'FontFile',
        fontFileData: fakeType1Bytes,
      });

      const result = extractEmbeddedFont(fontDict, resolve);

      expect(result).toBeDefined();
      expect(result!.fontName).toBe('TimesNewRoman');
      expect(result!.fontType).toBe('Type1');
      expect(result!.rawBytes).toEqual(fakeType1Bytes);
      // Type1 metric parsing is not implemented — should be undefined
      expect(result!.metrics).toBeUndefined();
    });

    it('handles missing FontDescriptor gracefully', () => {
      const fontDict = new COSDictionary();
      fontDict.setItem('Type', new COSName('Font'));
      fontDict.setItem('Subtype', new COSName('TrueType'));
      fontDict.setItem('BaseFont', new COSName('Helvetica'));
      // No FontDescriptor

      const result = extractEmbeddedFont(fontDict, noopResolver);
      expect(result).toBeUndefined();
    });

    it('handles missing FontFile gracefully (FontDescriptor without embedded font)', () => {
      const fontDescriptor = new COSDictionary();
      fontDescriptor.setItem('Type', new COSName('FontDescriptor'));
      fontDescriptor.setItem('FontName', new COSName('Helvetica'));
      // No FontFile, FontFile2, or FontFile3

      const fontDict = new COSDictionary();
      fontDict.setItem('Type', new COSName('Font'));
      fontDict.setItem('Subtype', new COSName('TrueType'));
      fontDict.setItem('BaseFont', new COSName('Helvetica'));
      fontDict.setItem('FontDescriptor', fontDescriptor);

      const result = extractEmbeddedFont(fontDict, noopResolver);
      expect(result).toBeUndefined();
    });

    it('handles empty font stream data', () => {
      const { fontDict, resolve } = buildFontDict({
        baseFontName: 'EmptyFont',
        subtype: 'TrueType',
        fontFileKey: 'FontFile2',
        fontFileData: new Uint8Array(0),
      });

      const result = extractEmbeddedFont(fontDict, resolve);
      expect(result).toBeUndefined();
    });

    it('handles composite (Type0) fonts with CIDFont descendant', () => {
      const ttfBytes = buildMinimalTTF();
      const { fontDict, resolve } = buildFontDict({
        baseFontName: 'NotoSans-Regular',
        subtype: 'Type0',
        fontFileKey: 'FontFile2',
        fontFileData: ttfBytes,
        isComposite: true,
      });

      const result = extractEmbeddedFont(fontDict, resolve);

      expect(result).toBeDefined();
      expect(result!.fontName).toBe('NotoSans-Regular');
      expect(result!.fontType).toBe('TrueType');
      expect(result!.metrics).toBeDefined();
      expect(result!.metrics!.unitsPerEm).toBe(1000);
    });

    it('handles FontFile3 with Type1C subtype', () => {
      const fakeBytes = new Uint8Array([0xAA, 0xBB, 0xCC]);
      const { fontDict, resolve } = buildFontDict({
        baseFontName: 'Type1CFont',
        subtype: 'Type1',
        fontFileKey: 'FontFile3',
        fontFileSubtype: 'Type1C',
        fontFileData: fakeBytes,
      });

      const result = extractEmbeddedFont(fontDict, resolve);

      expect(result).toBeDefined();
      expect(result!.fontType).toBe('CFF');
      expect(result!.rawBytes).toEqual(fakeBytes);
    });

    it('handles FontFile3 with OpenType subtype', () => {
      const fakeBytes = new Uint8Array([0xDD, 0xEE, 0xFF]);
      const { fontDict, resolve } = buildFontDict({
        baseFontName: 'OpenTypeFont',
        subtype: 'Type1',
        fontFileKey: 'FontFile3',
        fontFileSubtype: 'OpenType',
        fontFileData: fakeBytes,
      });

      const result = extractEmbeddedFont(fontDict, resolve);

      expect(result).toBeDefined();
      expect(result!.fontType).toBe('CFF');
    });

    it('resolves indirect object references in font dict chain', () => {
      const ttfBytes = buildMinimalTTF();

      // Create the font stream
      const fontStream = new COSStream();
      fontStream.setData(ttfBytes);

      // Create FontDescriptor with indirect ref to FontFile2
      const fontDescriptor = new COSDictionary();
      fontDescriptor.setItem('Type', new COSName('FontDescriptor'));
      fontDescriptor.setItem('FontName', new COSName('IndirectFont'));
      const streamRef = new COSObjectReference(100, 0);
      fontDescriptor.setItem('FontFile2', streamRef);

      // Create font dict with indirect ref to FontDescriptor
      const fontDict = new COSDictionary();
      fontDict.setItem('Type', new COSName('Font'));
      fontDict.setItem('Subtype', new COSName('TrueType'));
      fontDict.setItem('BaseFont', new COSName('IndirectFont'));
      const fdRef = new COSObjectReference(99, 0);
      fontDict.setItem('FontDescriptor', fdRef);

      // Resolver that resolves indirect refs
      const objects = new Map<string, COSBase>();
      objects.set('99:0', fontDescriptor);
      objects.set('100:0', fontStream);
      const resolve: ObjectResolver = (ref: COSObjectReference) => {
        return objects.get(`${ref.objectNumber}:${ref.generationNumber}`);
      };

      const result = extractEmbeddedFont(fontDict, resolve);

      expect(result).toBeDefined();
      expect(result!.fontName).toBe('IndirectFont');
      expect(result!.fontType).toBe('TrueType');
      expect(result!.metrics).toBeDefined();
    });

    it('parsed TrueType bytes can be re-parsed by TrueTypeParser', () => {
      const ttfBytes = buildMinimalTTF();
      const { fontDict, resolve } = buildFontDict({
        baseFontName: 'ReparseTest',
        subtype: 'TrueType',
        fontFileKey: 'FontFile2',
        fontFileData: ttfBytes,
      });

      const result = extractEmbeddedFont(fontDict, resolve);
      expect(result).toBeDefined();

      // Verify the raw bytes can be independently parsed
      const info = parseTrueType(result!.rawBytes);
      expect(info.unitsPerEm).toBe(1000);
      expect(info.numGlyphs).toBe(1);
      expect(info.advanceWidths[0]).toBe(500);
    });
  });
});
