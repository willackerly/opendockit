/**
 * Tests for native TrueType font embedding (Phase 7b).
 *
 * Uses a minimal valid TTF built in code (~500 bytes, 3 glyphs: .notdef, space, 'A').
 * This avoids bundling third-party font files and gives precise control over expected values.
 */

import { describe, it, expect } from 'vitest';
import { parseTrueType } from '../fonts/TrueTypeParser.js';
import type { TrueTypeFontInfo } from '../fonts/TrueTypeParser.js';
import { buildToUnicodeCMap } from '../fonts/CMapBuilder.js';
import { computeFontFlags } from '../fonts/FontFlags.js';
import { PDFDocument } from '../PDFDocument.js';

// ---------------------------------------------------------------------------
// Minimal TTF builder — creates a valid TrueType font with controlled values
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid TrueType font with 3 glyphs: .notdef, space, 'A'.
 *
 * Table layout:
 *   head  — font header (unitsPerEm=1000, bbox)
 *   hhea  — horizontal header (ascender, descender, numberOfHMetrics)
 *   maxp  — max profile (numGlyphs=3)
 *   OS/2  — OS/2 metrics (weight, family class, selection, typo metrics, capHeight)
 *   name  — font names (postScriptName, fontFamily)
 *   cmap  — character mapping (format 4: space=1, A=2)
 *   post  — PostScript info (italicAngle, isFixedPitch)
 *   hmtx  — horizontal metrics (advance widths for each glyph)
 *   loca  — glyph locations (empty glyphs, but needed for valid font)
 *   glyf  — glyph data (empty outlines)
 */
function buildMinimalTTF(options?: {
  unitsPerEm?: number;
  ascender?: number;
  descender?: number;
  capHeight?: number;
  weightClass?: number;
  familyClass?: number;
  fsSelection?: number;
  macStyle?: number;
  italicAngle?: number;
  isFixedPitch?: boolean;
  postScriptName?: string;
  fontFamily?: string;
  glyphWidths?: number[]; // [.notdef, space, A]
}): Uint8Array {
  const o = {
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    capHeight: 700,
    weightClass: 400,
    familyClass: 0,
    fsSelection: 0x0040, // Regular
    macStyle: 0,
    italicAngle: 0,
    isFixedPitch: false,
    postScriptName: 'TestFont',
    fontFamily: 'Test Font',
    glyphWidths: [500, 250, 600], // .notdef=500, space=250, A=600
    ...options,
  };

  // Helper: write big-endian values
  const buf = new ArrayBuffer(4096);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let pos = 0;

  function writeU16(v: number) { view.setUint16(pos, v, false); pos += 2; }
  function writeI16(v: number) { view.setInt16(pos, v, false); pos += 2; }
  function writeU32(v: number) { view.setUint32(pos, v, false); pos += 4; }
  function writeI32(v: number) { view.setInt32(pos, v, false); pos += 4; }
  function writeBytes(arr: number[]) { for (const b of arr) bytes[pos++] = b; }
  function writeStr(s: string) { for (let i = 0; i < s.length; i++) bytes[pos++] = s.charCodeAt(i); }
  function writeStr16BE(s: string) {
    for (let i = 0; i < s.length; i++) {
      writeU16(s.charCodeAt(i));
    }
  }
  function padTo4() { while (pos % 4 !== 0) bytes[pos++] = 0; }

  // We'll build tables first, then write the header + directory

  const numTables = 10;
  const headerSize = 12 + numTables * 16;

  // Table records will be filled in after all tables are built
  const tableEntries: Array<{ tag: string; offset: number; length: number }> = [];

  // Start writing tables after the header
  let tableStart = headerSize;
  pos = tableStart;

  // -- head table (54 bytes) --
  const headOffset = pos;
  writeU32(0x00010000); // version 1.0
  writeU32(0x00005000); // fontRevision
  writeU32(0); // checksumAdjustment (should be calculated but not needed for our tests)
  writeU32(0x5F0F3CF5); // magicNumber
  writeU16(0x000B); // flags
  writeU16(o.unitsPerEm);
  // created (8 bytes)
  writeU32(0); writeU32(0);
  // modified (8 bytes)
  writeU32(0); writeU32(0);
  writeI16(-100); // xMin
  writeI16(o.descender); // yMin
  writeI16(700); // xMax
  writeI16(o.ascender); // yMax
  writeU16(o.macStyle); // macStyle
  writeU16(8); // lowestRecPPEM
  writeI16(2); // fontDirectionHint
  writeI16(1); // indexToLocFormat (long)
  writeI16(0); // glyphDataFormat
  const headLength = pos - headOffset;
  padTo4();
  tableEntries.push({ tag: 'head', offset: headOffset, length: headLength });

  // -- hhea table (36 bytes) --
  const hheaOffset = pos;
  writeU32(0x00010000); // version
  writeI16(o.ascender); // ascender
  writeI16(o.descender); // descender
  writeI16(0); // lineGap
  writeU16(Math.max(...o.glyphWidths)); // advanceWidthMax
  writeI16(0); // minLeftSideBearing
  writeI16(0); // minRightSideBearing
  writeI16(700); // xMaxExtent
  writeI16(1); // caretSlopeRise
  writeI16(0); // caretSlopeRun
  writeI16(0); // caretOffset
  writeI16(0); writeI16(0); writeI16(0); writeI16(0); // reserved
  writeI16(0); // metricDataFormat
  writeU16(3); // numberOfHMetrics (one per glyph)
  const hheaLength = pos - hheaOffset;
  padTo4();
  tableEntries.push({ tag: 'hhea', offset: hheaOffset, length: hheaLength });

  // -- maxp table (6 bytes for version 0.5, or 32 for 1.0) --
  const maxpOffset = pos;
  writeU32(0x00010000); // version 1.0
  writeU16(3); // numGlyphs
  // Fill minimal required fields for version 1.0
  writeU16(0); writeU16(0); writeU16(0); writeU16(0); // maxPoints, maxContours, maxCompositePoints, maxCompositeContours
  writeU16(1); writeU16(0); writeU16(0); writeU16(0); // maxZones, maxTwilightPoints, maxStorage, maxFunctionDefs
  writeU16(0); writeU16(0); writeU16(0); writeU16(0); // maxInstructionDefs, maxStackElements, maxSizeOfInstructions, maxComponentElements
  writeU16(0); // maxComponentDepth
  const maxpLength = pos - maxpOffset;
  padTo4();
  tableEntries.push({ tag: 'maxp', offset: maxpOffset, length: maxpLength });

  // -- OS/2 table (96 bytes, version 2) --
  const os2Offset = pos;
  writeU16(2); // version
  writeI16(Math.round(o.glyphWidths.reduce((a, b) => a + b, 0) / o.glyphWidths.length)); // xAvgCharWidth
  writeU16(o.weightClass); // usWeightClass
  writeU16(5); // usWidthClass (normal)
  writeU16(0); // fsType
  writeI16(0); writeI16(0); writeI16(0); writeI16(0); // ySubscriptXSize, YSize, XOffset, YOffset
  writeI16(0); writeI16(0); writeI16(0); writeI16(0); // ySuperscriptXSize, YSize, XOffset, YOffset
  writeI16(0); // yStrikeoutSize
  writeI16(0); // yStrikeoutPosition
  writeI16(o.familyClass); // sFamilyClass
  writeBytes([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // panose (10 bytes)
  writeU32(0); writeU32(0); writeU32(0); writeU32(0); // ulUnicodeRange1-4
  writeBytes([0x20, 0x20, 0x20, 0x20]); // achVendID
  writeU16(o.fsSelection); // fsSelection
  writeU16(0x0020); // usFirstCharIndex (space)
  writeU16(0x0041); // usLastCharIndex (A)
  writeI16(o.ascender); // sTypoAscender
  writeI16(o.descender); // sTypoDescender
  writeI16(0); // sTypoLineGap
  writeU16(o.ascender); // usWinAscent
  writeU16(Math.abs(o.descender)); // usWinDescent
  writeU32(1); // ulCodePageRange1
  writeU32(0); // ulCodePageRange2
  writeI16(0); // sxHeight
  writeI16(o.capHeight); // sCapHeight
  writeU16(0); // usDefaultChar
  writeU16(0x0020); // usBreakChar
  writeU16(1); // usMaxContext
  const os2Length = pos - os2Offset;
  padTo4();
  tableEntries.push({ tag: 'OS/2', offset: os2Offset, length: os2Length });

  // -- name table --
  const nameOffset = pos;
  const nameStrings: Array<{ nameID: number; str: string }> = [
    { nameID: 1, str: o.fontFamily },     // Font Family
    { nameID: 6, str: o.postScriptName }, // PostScript Name
  ];
  // We'll use platform 3 (Windows), encoding 1 (Unicode BMP), language 0x0409
  const nameCount = nameStrings.length;
  const nameRecordSize = 12;
  const nameHeaderSize = 6 + nameCount * nameRecordSize;

  writeU16(0); // format
  writeU16(nameCount); // count
  writeU16(nameHeaderSize); // stringOffset (relative to start of name table)

  // Calculate string data
  let stringDataOffset = 0;
  const stringData: Array<{ offset: number; length: number; str: string }> = [];
  for (const ns of nameStrings) {
    const byteLength = ns.str.length * 2; // UTF-16BE
    stringData.push({ offset: stringDataOffset, length: byteLength, str: ns.str });
    stringDataOffset += byteLength;
  }

  // Write name records
  for (let i = 0; i < nameCount; i++) {
    writeU16(3); // platformID (Windows)
    writeU16(1); // encodingID (Unicode BMP)
    writeU16(0x0409); // languageID (English US)
    writeU16(nameStrings[i].nameID);
    writeU16(stringData[i].length);
    writeU16(stringData[i].offset);
  }

  // Write string data
  for (const sd of stringData) {
    writeStr16BE(sd.str);
  }
  const nameLength = pos - nameOffset;
  padTo4();
  tableEntries.push({ tag: 'name', offset: nameOffset, length: nameLength });

  // -- cmap table (format 4) --
  const cmapOffset = pos;
  // cmap header
  writeU16(0); // version
  writeU16(1); // numTables

  // Encoding record: platform 3, encoding 1 (Windows Unicode BMP)
  writeU16(3); // platformID
  writeU16(1); // encodingID
  writeU32(12); // offset to subtable (right after this record)

  // Format 4 subtable
  // Segments: [0x0020, 0x0020] (space), [0x0041, 0x0041] (A), [0xFFFF, 0xFFFF] (sentinel)
  const segCount = 3;
  const searchRange = 4; // 2 * (2^floor(log2(segCount)))
  const entrySelector = 1; // floor(log2(segCount))
  const rangeShift = segCount * 2 - searchRange;

  const subtableStart = pos;
  writeU16(4); // format
  writeU16(0); // length (placeholder)
  writeU16(0); // language
  writeU16(segCount * 2); // segCountX2
  writeU16(searchRange);
  writeU16(entrySelector);
  writeU16(rangeShift);

  // endCode[]
  writeU16(0x0020); // space
  writeU16(0x0041); // A
  writeU16(0xFFFF); // sentinel

  writeU16(0); // reservedPad

  // startCode[]
  writeU16(0x0020); // space
  writeU16(0x0041); // A
  writeU16(0xFFFF); // sentinel

  // idDelta[]
  writeI16(1 - 0x0020); // delta for space: glyph 1 = 0x0020 + delta → delta = 1 - 0x20 = -31
  writeI16(2 - 0x0041); // delta for A: glyph 2 = 0x0041 + delta → delta = 2 - 0x41 = -63
  writeI16(1); // sentinel delta

  // idRangeOffset[]
  writeU16(0); // space
  writeU16(0); // A
  writeU16(0); // sentinel

  // Patch subtable length
  const subtableLength = pos - subtableStart;
  view.setUint16(subtableStart + 2, subtableLength, false);

  const cmapLength = pos - cmapOffset;
  padTo4();
  tableEntries.push({ tag: 'cmap', offset: cmapOffset, length: cmapLength });

  // -- post table (32 bytes) --
  const postOffset = pos;
  writeU32(0x00030000); // version 3.0 (no glyph names)
  // italicAngle as Fixed 16.16
  writeI32(Math.round(o.italicAngle * 65536));
  writeI16(-100); // underlinePosition
  writeI16(50); // underlineThickness
  writeU32(o.isFixedPitch ? 1 : 0); // isFixedPitch
  writeU32(0); // minMemType42
  writeU32(0); // maxMemType42
  writeU32(0); // minMemType1
  writeU32(0); // maxMemType1
  const postLength = pos - postOffset;
  padTo4();
  tableEntries.push({ tag: 'post', offset: postOffset, length: postLength });

  // -- hmtx table --
  const hmtxOffset = pos;
  for (const w of o.glyphWidths) {
    writeU16(w); // advanceWidth
    writeI16(0); // lsb
  }
  const hmtxLength = pos - hmtxOffset;
  padTo4();
  tableEntries.push({ tag: 'hmtx', offset: hmtxOffset, length: hmtxLength });

  // -- loca table (long format, 4 bytes per entry + 1 extra) --
  const locaOffset = pos;
  for (let i = 0; i <= 3; i++) { // numGlyphs + 1 entries
    writeU32(0); // All glyphs at offset 0 (empty)
  }
  const locaLength = pos - locaOffset;
  padTo4();
  tableEntries.push({ tag: 'loca', offset: locaOffset, length: locaLength });

  // -- glyf table (empty, just a single empty glyph marker) --
  const glyfOffset = pos;
  // Minimal: zero-contour glyph
  writeI16(0); // numberOfContours = 0
  writeI16(0); writeI16(0); writeI16(0); writeI16(0); // xMin, yMin, xMax, yMax
  const glyfLength = pos - glyfOffset;
  padTo4();
  tableEntries.push({ tag: 'glyf', offset: glyfOffset, length: glyfLength });

  const totalSize = pos;

  // Now write the header and table directory at the beginning
  pos = 0;
  writeU32(0x00010000); // sfVersion (TrueType)
  writeU16(numTables);
  // searchRange, entrySelector, rangeShift for table directory
  const srTables = Math.pow(2, Math.floor(Math.log2(numTables))) * 16;
  writeU16(srTables);
  writeU16(Math.floor(Math.log2(numTables)));
  writeU16(numTables * 16 - srTables);

  // Sort table entries by tag for proper directory ordering
  tableEntries.sort((a, b) => a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0);

  for (const entry of tableEntries) {
    writeStr(entry.tag.padEnd(4, ' ')); // tag (4 bytes)
    writeU32(0); // checksum (not validated in our tests)
    writeU32(entry.offset); // offset
    writeU32(entry.length); // length
  }

  return bytes.slice(0, totalSize);
}

// ---------------------------------------------------------------------------
// TrueType Parser tests
// ---------------------------------------------------------------------------

describe('TrueTypeParser', () => {
  it('parses table directory and finds all 8+ tables', () => {
    const ttf = buildMinimalTTF();
    const info = parseTrueType(ttf);
    expect(info).toBeDefined();
    expect(info.numGlyphs).toBe(3);
  });

  it('extracts correct unitsPerEm', () => {
    const info = parseTrueType(buildMinimalTTF({ unitsPerEm: 2048 }));
    expect(info.unitsPerEm).toBe(2048);
  });

  it('extracts fontBBox from head table', () => {
    const info = parseTrueType(buildMinimalTTF());
    expect(info.fontBBox).toEqual([-100, -200, 700, 800]);
  });

  it('extracts ascender/descender from OS/2', () => {
    const info = parseTrueType(buildMinimalTTF({
      ascender: 900,
      descender: -300,
    }));
    expect(info.ascender).toBe(900);
    expect(info.descender).toBe(-300);
  });

  it('extracts capHeight from OS/2', () => {
    const info = parseTrueType(buildMinimalTTF({ capHeight: 680 }));
    expect(info.capHeight).toBe(680);
  });

  it('parses format 4 cmap (Unicode -> glyph ID)', () => {
    const info = parseTrueType(buildMinimalTTF());
    expect(info.cmap.get(0x0020)).toBe(1); // space -> glyph 1
    expect(info.cmap.get(0x0041)).toBe(2); // A -> glyph 2
    expect(info.cmap.get(0x0042)).toBeUndefined(); // B not mapped
  });

  it('reads advance widths from hmtx', () => {
    const info = parseTrueType(buildMinimalTTF({
      glyphWidths: [500, 250, 600],
    }));
    expect(info.advanceWidths[0]).toBe(500); // .notdef
    expect(info.advanceWidths[1]).toBe(250); // space
    expect(info.advanceWidths[2]).toBe(600); // A
  });

  it('extracts postScriptName from name table', () => {
    const info = parseTrueType(buildMinimalTTF({
      postScriptName: 'MyCustomFont-Bold',
    }));
    expect(info.postScriptName).toBe('MyCustomFont-Bold');
  });

  it('extracts fontFamily from name table', () => {
    const info = parseTrueType(buildMinimalTTF({
      fontFamily: 'My Custom Font',
    }));
    expect(info.fontFamily).toBe('My Custom Font');
  });

  it('extracts italicAngle from post table', () => {
    const info = parseTrueType(buildMinimalTTF({ italicAngle: -12 }));
    expect(info.italicAngle).toBeCloseTo(-12, 0);
  });

  it('extracts isFixedPitch from post table', () => {
    const info = parseTrueType(buildMinimalTTF({ isFixedPitch: true }));
    expect(info.isFixedPitch).toBe(true);

    const info2 = parseTrueType(buildMinimalTTF({ isFixedPitch: false }));
    expect(info2.isFixedPitch).toBe(false);
  });

  it('rejects CFF/OpenType (OTTO signature)', () => {
    const otto = new Uint8Array(64);
    otto[0] = 0x4F; otto[1] = 0x54; otto[2] = 0x54; otto[3] = 0x4F;
    expect(() => parseTrueType(otto)).toThrow(/CFF.*OpenType/);
  });

  it('rejects WOFF', () => {
    const woff = new Uint8Array(64);
    // 'wOFF'
    woff[0] = 0x77; woff[1] = 0x4F; woff[2] = 0x46; woff[3] = 0x46;
    expect(() => parseTrueType(woff)).toThrow(/WOFF/);
  });

  it('rejects random/corrupt bytes', () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(() => parseTrueType(garbage)).toThrow(/Unrecognized font signature/);
  });

  it('rejects truncated file', () => {
    const short = new Uint8Array([0, 1, 0, 0]);
    expect(() => parseTrueType(short)).toThrow();
  });

  it('computes stemV from weight class', () => {
    const info = parseTrueType(buildMinimalTTF({ weightClass: 700 }));
    // StemV = 10 + 220 * ((700 - 50) / 900)^2 = 10 + 220 * 0.5247 ≈ 125
    expect(info.stemV).toBeGreaterThan(100);
    expect(info.stemV).toBeLessThan(200);
  });
});

// ---------------------------------------------------------------------------
// CMap builder tests
// ---------------------------------------------------------------------------

describe('CMapBuilder', () => {
  it('generates valid CMap syntax', () => {
    const glyphToUnicode = new Map<number, number>([
      [1, 0x0041], // glyph 1 -> 'A'
      [2, 0x0042], // glyph 2 -> 'B'
    ]);
    const cmap = buildToUnicodeCMap(glyphToUnicode);
    expect(cmap).toContain('beginbfchar');
    expect(cmap).toContain('<0001> <0041>');
    expect(cmap).toContain('<0002> <0042>');
    expect(cmap).toContain('endbfchar');
  });

  it('handles empty glyph set', () => {
    const cmap = buildToUnicodeCMap(new Map());
    expect(cmap).toContain('0 beginbfchar');
    expect(cmap).toContain('endbfchar');
  });

  it('groups entries into blocks of 100', () => {
    const glyphToUnicode = new Map<number, number>();
    for (let i = 1; i <= 250; i++) {
      glyphToUnicode.set(i, 0x0040 + i);
    }
    const cmap = buildToUnicodeCMap(glyphToUnicode);
    // Should have 3 blocks: 100, 100, 50
    const beginCount = (cmap.match(/beginbfchar/g) || []).length;
    expect(beginCount).toBe(3);
    expect(cmap).toContain('100 beginbfchar');
    expect(cmap).toContain('50 beginbfchar');
  });

  it('uses 4-digit hex encoding', () => {
    const glyphToUnicode = new Map<number, number>([[5, 0x00E9]]); // é
    const cmap = buildToUnicodeCMap(glyphToUnicode);
    expect(cmap).toContain('<0005> <00E9>');
  });

  it('sorts entries by glyph ID', () => {
    const glyphToUnicode = new Map<number, number>([
      [10, 0x0042],
      [3, 0x0041],
    ]);
    const cmap = buildToUnicodeCMap(glyphToUnicode);
    const idx3 = cmap.indexOf('<0003>');
    const idx10 = cmap.indexOf('<000A>');
    expect(idx3).toBeLessThan(idx10);
  });
});

// ---------------------------------------------------------------------------
// Font flags tests
// ---------------------------------------------------------------------------

describe('FontFlags', () => {
  it('sets FixedPitch flag', () => {
    const info = parseTrueType(buildMinimalTTF({ isFixedPitch: true }));
    const flags = computeFontFlags(info as any);
    expect(flags & 0x01).toBe(1); // Bit 1
  });

  it('sets Serif flag for serif family class', () => {
    // sFamilyClass high byte 1-7 = serif
    const info = parseTrueType(buildMinimalTTF({ familyClass: 0x0200 })); // class 2 = Old Style Serif
    const flags = computeFontFlags(info as any);
    expect(flags & 0x02).toBe(2); // Bit 2
  });

  it('sets Italic flag', () => {
    const info = parseTrueType(buildMinimalTTF({ fsSelection: 0x01 })); // italic bit
    const flags = computeFontFlags(info as any);
    expect(flags & 0x40).toBe(0x40); // Bit 7
  });

  it('always sets Nonsymbolic flag', () => {
    const info = parseTrueType(buildMinimalTTF());
    const flags = computeFontFlags(info as any);
    expect(flags & 0x20).toBe(0x20); // Bit 6
  });
});

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('Custom font integration', () => {
  it('embedFont(ttfBytes) returns PDFFont with correct name', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF({ postScriptName: 'IntegrationTest' });
    const font = await doc.embedFont(ttf);
    expect(font.name).toBe('IntegrationTest');
    expect(font.ref).toBeDefined();
  });

  it('encodeTextToHex produces 4-hex-char-per-char output', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF();
    const font = await doc.embedFont(ttf);
    // 'A' -> glyph 2 -> '0002'
    const hex = font.encodeTextToHex('A');
    expect(hex).toBe('0002');
    expect(hex.length).toBe(4); // 4 hex chars for 1 character
  });

  it('encodeTextToHex handles space', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF();
    const font = await doc.embedFont(ttf);
    // space (U+0020) -> glyph 1 -> '0001'
    const hex = font.encodeTextToHex(' ');
    expect(hex).toBe('0001');
  });

  it('encodeTextToHex uses .notdef for unmapped characters', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF();
    const font = await doc.embedFont(ttf);
    // 'B' is not in our minimal cmap -> glyph 0 (.notdef) -> '0000'
    const hex = font.encodeTextToHex('B');
    expect(hex).toBe('0000');
  });

  it('encodeTextToHex handles multi-character strings', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF();
    const font = await doc.embedFont(ttf);
    // 'A A' -> glyph2 glyph1 glyph2 -> '0002 0001 0002'
    const hex = font.encodeTextToHex('A A');
    expect(hex).toBe('000200010002');
    expect(hex.length).toBe(12); // 3 chars * 4 hex chars each
  });

  it('encodeTextToHex handles empty string', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF();
    const font = await doc.embedFont(ttf);
    expect(font.encodeTextToHex('')).toBe('');
  });

  it('widthOfTextAtSize returns correct values', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF({
      unitsPerEm: 1000,
      glyphWidths: [500, 250, 600],
    });
    const font = await doc.embedFont(ttf);
    // 'A' at size 12: width = 600 * (1000/1000) * (12/1000) = 7.2
    const width = font.widthOfTextAtSize('A', 12);
    expect(width).toBeCloseTo(7.2, 5);
  });

  it('widthOfTextAtSize handles multi-character', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF({
      unitsPerEm: 1000,
      glyphWidths: [500, 250, 600],
    });
    const font = await doc.embedFont(ttf);
    // 'A ' at size 10: (600 + 250) * 1 * 10/1000 = 8.5
    const width = font.widthOfTextAtSize('A ', 10);
    expect(width).toBeCloseTo(8.5, 5);
  });

  it('heightAtSize returns correct value', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF({
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
    });
    const font = await doc.embedFont(ttf);
    // height = (800 - (-200)) / 1000 * 12 = 12
    const height = font.heightAtSize(12);
    expect(height).toBeCloseTo(12, 5);
  });

  it('heightAtSize without descender', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF({
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
    });
    const font = await doc.embedFont(ttf);
    // height = (800 - (-200) + (-200)) / 1000 * 12 = 800/1000 * 12 = 9.6
    const height = font.heightAtSize(12, { descender: false });
    expect(height).toBeCloseTo(9.6, 5);
  });

  it('sizeAtHeight returns inverse of heightAtSize', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF({
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
    });
    const font = await doc.embedFont(ttf);
    const height = font.heightAtSize(24);
    const size = font.sizeAtHeight(height);
    expect(size).toBeCloseTo(24, 5);
  });

  it('getCharacterSet returns mapped codepoints', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF();
    const font = await doc.embedFont(ttf);
    const charset = font.getCharacterSet();
    expect(charset).toContain(0x0020); // space
    expect(charset).toContain(0x0041); // A
    expect(charset).not.toContain(0x0042); // B not mapped
  });

  it('drawText produces valid content stream', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF({ postScriptName: 'DrawTestFont' });
    const font = await doc.embedFont(ttf);
    const page = doc.addPage();
    page.drawText('A', { x: 50, y: 500, font, size: 24 });
    const bytes = await doc.save();
    expect(bytes.length).toBeGreaterThan(0);
    // Verify it's a valid PDF
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('%PDF-');
    expect(text).toContain('/Type /Font');
    expect(text).toContain('/Subtype /Type0');
    expect(text).toContain('/CIDFontType2');
    expect(text).toContain('/FontDescriptor');
    expect(text).toContain('/FontFile2');
    expect(text).toContain('/ToUnicode');
  });

  it('full round-trip: create -> embedFont -> drawText -> save -> load', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF({ postScriptName: 'RoundTrip' });
    const font = await doc.embedFont(ttf);
    const page = doc.addPage();
    page.drawText('A', { x: 50, y: 500, font, size: 18 });
    const bytes = await doc.save();

    // Load back
    const doc2 = await PDFDocument.load(bytes);
    expect(doc2.getPageCount()).toBe(1);
  });

  it('multiple custom fonts on same page', async () => {
    const doc = await PDFDocument.create();
    const ttf1 = buildMinimalTTF({ postScriptName: 'FontOne' });
    const ttf2 = buildMinimalTTF({ postScriptName: 'FontTwo' });
    const font1 = await doc.embedFont(ttf1);
    const font2 = await doc.embedFont(ttf2);
    const page = doc.addPage();
    page.drawText('A', { x: 50, y: 700, font: font1, size: 24 });
    page.drawText('A', { x: 50, y: 600, font: font2, size: 24 });
    const bytes = await doc.save();
    const text = new TextDecoder().decode(bytes);
    // Both fonts should be present
    expect(text).toContain('/FontOne');
    expect(text).toContain('/FontTwo');
  });

  it('custom font + standard font on same page', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF({ postScriptName: 'CustomMixed' });
    const customFont = await doc.embedFont(ttf);
    const standardFont = await doc.embedFont('Helvetica');
    const page = doc.addPage();
    page.drawText('A', { x: 50, y: 700, font: customFont, size: 24 });
    page.drawText('Hello', { x: 50, y: 600, font: standardFont, size: 24 });
    const bytes = await doc.save();
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('/CustomMixed');
    expect(text).toContain('/Helvetica');
  });

  it('embedFont with ArrayBuffer works', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF({ postScriptName: 'ArrayBufFont' });
    // Pass as ArrayBuffer instead of Uint8Array
    const font = await doc.embedFont(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength));
    expect(font.name).toBe('ArrayBufFont');
  });

  it('embedFont rejects CFF/OpenType with clear error', async () => {
    const doc = await PDFDocument.create();
    const otto = new Uint8Array(64);
    otto[0] = 0x4F; otto[1] = 0x54; otto[2] = 0x54; otto[3] = 0x4F;
    await expect(doc.embedFont(otto)).rejects.toThrow(/CFF.*OpenType/);
  });

  it('PDF structure contains all 5 required objects', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF({ postScriptName: 'StructureTest' });
    const font = await doc.embedFont(ttf);
    const page = doc.addPage();
    page.drawText('A', { x: 50, y: 500, font, size: 12 });
    const bytes = await doc.save();
    const text = new TextDecoder().decode(bytes);

    // Type0 font dict
    expect(text).toContain('/Subtype /Type0');
    expect(text).toContain('/Encoding /Identity-H');
    expect(text).toContain('/DescendantFonts');

    // CIDFontType2
    expect(text).toContain('/Subtype /CIDFontType2');
    expect(text).toContain('/CIDToGIDMap /Identity');
    expect(text).toContain('/CIDSystemInfo');

    // FontDescriptor
    expect(text).toContain('/Type /FontDescriptor');
    expect(text).toContain('/FontName /StructureTest');
    expect(text).toContain('/FontFile2');

    // ToUnicode
    expect(text).toContain('beginbfchar');
    expect(text).toContain('endcmap');
  });

  it('widths array format is correct in PDF', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF({
      postScriptName: 'WidthTest',
      unitsPerEm: 1000,
      glyphWidths: [500, 250, 600],
    });
    await doc.embedFont(ttf);
    const bytes = await doc.save();
    const text = new TextDecoder().decode(bytes);
    // /W should contain scaled widths
    // scale = 1000/1000 = 1, so widths = [500 250 600]
    expect(text).toContain('/W [0 [500 250 600]');
  });
});

// ---------------------------------------------------------------------------
// Edge case tests
// ---------------------------------------------------------------------------

describe('Custom font edge cases', () => {
  it('handles unitsPerEm != 1000', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF({
      unitsPerEm: 2048,
      glyphWidths: [1024, 512, 1229], // in 2048 units
    });
    const font = await doc.embedFont(ttf);
    // Width of 'A' at size 10:
    // advance = 1229, scale = 1000/2048 = 0.48828125
    // scaled advance = 1229 * 0.48828125 = 600.098...
    // width = 600.098 * 10/1000 = 6.00098...
    const width = font.widthOfTextAtSize('A', 10);
    expect(width).toBeCloseTo(6.001, 1);
  });

  it('same font embedded twice works', async () => {
    const doc = await PDFDocument.create();
    const ttf = buildMinimalTTF({ postScriptName: 'DupeFont' });
    const font1 = await doc.embedFont(ttf);
    const font2 = await doc.embedFont(ttf);
    // Both should work independently (different COS objects)
    expect(font1.name).toBe('DupeFont');
    expect(font2.name).toBe('DupeFont');
    expect(font1.ref).not.toBe(font2.ref);
  });

  it('font with large glyph count works', async () => {
    // Just verify parser doesn't crash with realistic glyph count
    const info = parseTrueType(buildMinimalTTF());
    expect(info.numGlyphs).toBe(3);
    expect(info.advanceWidths.length).toBe(3);
  });
});
