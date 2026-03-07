/**
 * Tests for CFF/OpenType font parsing (CFF Phase).
 *
 * Uses a minimal valid OTF built in code (~600 bytes, 3 glyphs: .notdef, space, 'A').
 * This avoids bundling third-party font files and gives precise control over expected values.
 */

import { describe, it, expect } from 'vitest';
import { parseCFFFont } from '../fonts/CFFParser.js';
import type { CFFParseResult } from '../fonts/CFFParser.js';
import { computeFontFlags } from '../fonts/FontFlags.js';

// ---------------------------------------------------------------------------
// Minimal OTF builder — creates a valid CFF/OpenType font with controlled values
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid CFF/OpenType font with 3 glyphs: .notdef, space, 'A'.
 *
 * The sfnt wrapper has OTTO signature with tables:
 *   CFF   — minimal CFF data (Header + Name INDEX + Top DICT INDEX +
 *            String INDEX + Global Subr INDEX + CharStrings INDEX)
 *   head  — font header (unitsPerEm, bbox)
 *   hhea  — horizontal header (ascender, descender, numberOfHMetrics)
 *   maxp  — max profile (numGlyphs=3, version 0.5 for CFF)
 *   OS/2  — OS/2 metrics (weight, family class, selection, typo metrics, capHeight)
 *   name  — font names (postScriptName, fontFamily)
 *   cmap  — character mapping (format 4: space=1, A=2)
 *   post  — PostScript info (italicAngle, isFixedPitch)
 *   hmtx  — horizontal metrics (advance widths for each glyph)
 */
function buildMinimalOTF(options?: {
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
  cffFontName?: string;
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
    postScriptName: 'TestCFFFont',
    fontFamily: 'Test CFF Font',
    cffFontName: 'TestCFFFont',
    glyphWidths: [500, 250, 600], // .notdef=500, space=250, A=600
    ...options,
  };

  // Helper: write big-endian values
  const buf = new ArrayBuffer(8192);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let pos = 0;

  function writeU8(v: number) { bytes[pos++] = v & 0xFF; }
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

  const numTables = 9; // CFF, head, hhea, maxp, OS/2, name, cmap, post, hmtx
  const headerSize = 12 + numTables * 16;

  // Table records will be filled in after all tables are built
  const tableEntries: Array<{ tag: string; offset: number; length: number }> = [];

  // Start writing tables after the header
  let tableStart = headerSize;
  pos = tableStart;

  // -- CFF table --
  const cffOffset = pos;
  buildMinimalCFF(o.cffFontName);
  const cffLength = pos - cffOffset;
  padTo4();
  tableEntries.push({ tag: 'CFF ', offset: cffOffset, length: cffLength });

  // -- head table (54 bytes) --
  const headOffset = pos;
  writeU32(0x00010000); // version 1.0
  writeU32(0x00005000); // fontRevision
  writeU32(0); // checksumAdjustment
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
  writeI16(0); // indexToLocFormat (short — not used for CFF but required)
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

  // -- maxp table (6 bytes, version 0.5 for CFF fonts) --
  const maxpOffset = pos;
  writeU32(0x00005000); // version 0.5000 (CFF fonts use version 0.5)
  writeU16(3); // numGlyphs
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
  // Platform 3 (Windows), encoding 1 (Unicode BMP), language 0x0409
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
  writeI16(1 - 0x0020); // delta for space: glyph 1 = 0x0020 + delta -> delta = 1 - 0x20 = -31
  writeI16(2 - 0x0041); // delta for A: glyph 2 = 0x0041 + delta -> delta = 2 - 0x41 = -63
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

  const totalSize = pos;

  // Now write the header and table directory at the beginning
  pos = 0;
  writeU32(0x4F54544F); // 'OTTO' (CFF/OpenType signature)
  writeU16(numTables);
  // searchRange, entrySelector, rangeShift for table directory
  const srTables = Math.pow(2, Math.floor(Math.log2(numTables))) * 16;
  writeU16(srTables);
  writeU16(Math.floor(Math.log2(numTables)));
  writeU16(numTables * 16 - srTables);

  // Sort table entries by tag for proper directory ordering
  tableEntries.sort((a, b) => a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0);

  for (const entry of tableEntries) {
    writeStr(entry.tag.padEnd(4, ' ')); // tag (4 bytes, CFF already has trailing space)
    writeU32(0); // checksum (not validated in our tests)
    writeU32(entry.offset); // offset
    writeU32(entry.length); // length
  }

  return bytes.slice(0, totalSize);

  // -----------------------------------------------------------------------
  // CFF table builder (minimal)
  // -----------------------------------------------------------------------

  function buildMinimalCFF(fontName: string) {
    // CFF Header
    writeU8(1);    // major version
    writeU8(0);    // minor version
    writeU8(4);    // header size
    writeU8(1);    // offSize (absolute offset size, 1 byte for this small font)

    // Name INDEX — one entry: the font name
    const nameBytes = Array.from(fontName).map(c => c.charCodeAt(0));
    writeCFFIndex([new Uint8Array(nameBytes)]);

    // Top DICT INDEX — one entry with minimal operators
    // We need to encode at minimum: charset, CharStrings offset
    // For a minimal valid CFF, we'll write a Top DICT with:
    //   ROS (Registry-Ordering-Supplement) for CIDFont
    //   charset offset
    //   CharStrings offset
    // But since we're just extracting raw bytes, a minimal Top DICT suffices.
    //
    // For simplicity, encode an empty Top DICT (no operators = all defaults).
    // The CFF spec says all values have defaults, and since we're embedding
    // raw CFF bytes into FontFile3, the PDF viewer handles rendering.
    const topDictData = buildMinimalTopDict();
    writeCFFIndex([topDictData]);

    // String INDEX — empty (no custom strings)
    writeCFFIndex([]);

    // Global Subr INDEX — empty (no global subroutines)
    writeCFFIndex([]);

    // CharStrings INDEX — one charstring per glyph (3 glyphs)
    // Each charstring is a minimal Type 2 program: just endchar (14)
    const endchar = new Uint8Array([14]); // endchar operator
    writeCFFIndex([endchar, endchar, endchar]);
  }

  /**
   * Build a minimal Top DICT for CFF.
   * Encodes just enough for a structurally valid CFF.
   * Returns the dict data as Uint8Array.
   */
  function buildMinimalTopDict(): Uint8Array {
    // An empty Top DICT is valid — all values use defaults.
    // However, we need CharStrings offset. Since we know our layout:
    //   Header(4) + Name INDEX + Top DICT INDEX + String INDEX(3) + Global Subr INDEX(3) + CharStrings
    // We'll compute the CharStrings offset after writing everything before it.
    //
    // For simplicity in this minimal builder, we return an empty dict.
    // The CharStrings INDEX follows the Global Subr INDEX, and CFF parsers
    // use the Top DICT's CharStrings operator to find it. Without it,
    // strict parsers might fail, but for FontFile3 embedding the raw CFF
    // bytes are passed through to the PDF renderer which handles the parsing.
    //
    // A more complete implementation would encode the CharStrings offset,
    // but for our purposes of testing the CFF extraction path, empty works.
    return new Uint8Array(0);
  }

  /**
   * Write a CFF INDEX structure.
   *
   * INDEX format:
   *   count(2)
   *   if count > 0:
   *     offSize(1)
   *     offset[count+1] (offSize each, 1-based)
   *     data[...]
   *   if count == 0:
   *     (just the 2-byte count of 0)
   */
  function writeCFFIndex(items: Uint8Array[]) {
    const count = items.length;
    writeU16(count);

    if (count === 0) {
      // Empty INDEX is just the 2-byte count
      return;
    }

    // Calculate total data size to determine offSize
    let totalDataSize = 0;
    for (const item of items) {
      totalDataSize += item.length;
    }

    // offSize: minimum bytes needed to represent the largest offset
    // Offsets are 1-based, so max offset = totalDataSize + 1
    const maxOffset = totalDataSize + 1;
    let offSize = 1;
    if (maxOffset > 0xFF) offSize = 2;
    if (maxOffset > 0xFFFF) offSize = 3;
    if (maxOffset > 0xFFFFFF) offSize = 4;

    writeU8(offSize);

    // Write offset array (count + 1 entries, 1-based)
    let offset = 1; // offsets are 1-based in CFF
    writeCFFOffset(offset, offSize);
    for (const item of items) {
      offset += item.length;
      writeCFFOffset(offset, offSize);
    }

    // Write data
    for (const item of items) {
      for (let i = 0; i < item.length; i++) {
        writeU8(item[i]);
      }
    }
  }

  /**
   * Write a CFF offset value of the given size (1-4 bytes, big-endian).
   */
  function writeCFFOffset(value: number, offSize: number) {
    if (offSize === 4) writeU8((value >> 24) & 0xFF);
    if (offSize >= 3) writeU8((value >> 16) & 0xFF);
    if (offSize >= 2) writeU8((value >> 8) & 0xFF);
    writeU8(value & 0xFF);
  }
}

// ---------------------------------------------------------------------------
// CFF Parser tests
// ---------------------------------------------------------------------------

describe('CFFParser', () => {
  it('parses OTTO signature and finds CFF table', () => {
    const otf = buildMinimalOTF();
    const result = parseCFFFont(otf);
    expect(result).toBeDefined();
    expect(result.numGlyphs).toBe(3);
  });

  it('extracts correct unitsPerEm', () => {
    const result = parseCFFFont(buildMinimalOTF({ unitsPerEm: 2048 }));
    expect(result.unitsPerEm).toBe(2048);
  });

  it('extracts fontBBox from head table', () => {
    const result = parseCFFFont(buildMinimalOTF());
    expect(result.fontBBox).toEqual([-100, -200, 700, 800]);
  });

  it('extracts ascender/descender from OS/2', () => {
    const result = parseCFFFont(buildMinimalOTF({
      ascender: 900,
      descender: -300,
    }));
    expect(result.ascender).toBe(900);
    expect(result.descender).toBe(-300);
  });

  it('extracts capHeight from OS/2', () => {
    const result = parseCFFFont(buildMinimalOTF({ capHeight: 680 }));
    expect(result.capHeight).toBe(680);
  });

  it('parses format 4 cmap (Unicode -> glyph ID)', () => {
    const result = parseCFFFont(buildMinimalOTF());
    expect(result.cmap.get(0x0020)).toBe(1); // space -> glyph 1
    expect(result.cmap.get(0x0041)).toBe(2); // A -> glyph 2
    expect(result.cmap.get(0x0042)).toBeUndefined(); // B not mapped
  });

  it('reads advance widths from hmtx', () => {
    const result = parseCFFFont(buildMinimalOTF({
      glyphWidths: [500, 250, 600],
    }));
    expect(result.advanceWidths[0]).toBe(500); // .notdef
    expect(result.advanceWidths[1]).toBe(250); // space
    expect(result.advanceWidths[2]).toBe(600); // A
  });

  it('extracts postScriptName from name table', () => {
    const result = parseCFFFont(buildMinimalOTF({
      postScriptName: 'MyCFFFont-Bold',
    }));
    expect(result.postScriptName).toBe('MyCFFFont-Bold');
  });

  it('extracts fontFamily from name table', () => {
    const result = parseCFFFont(buildMinimalOTF({
      fontFamily: 'My CFF Font',
    }));
    expect(result.fontFamily).toBe('My CFF Font');
  });

  it('extracts italicAngle from post table', () => {
    const result = parseCFFFont(buildMinimalOTF({ italicAngle: -12 }));
    expect(result.italicAngle).toBeCloseTo(-12, 0);
  });

  it('extracts isFixedPitch from post table', () => {
    const result = parseCFFFont(buildMinimalOTF({ isFixedPitch: true }));
    expect(result.isFixedPitch).toBe(true);

    const result2 = parseCFFFont(buildMinimalOTF({ isFixedPitch: false }));
    expect(result2.isFixedPitch).toBe(false);
  });

  it('computes stemV from weight class', () => {
    const result = parseCFFFont(buildMinimalOTF({ weightClass: 700 }));
    // StemV = 10 + 220 * ((700 - 50) / 900)^2
    expect(result.stemV).toBeGreaterThan(100);
    expect(result.stemV).toBeLessThan(200);
  });

  it('sets flags to 0 (computed externally)', () => {
    const result = parseCFFFont(buildMinimalOTF());
    expect(result.flags).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CFF data extraction tests
// ---------------------------------------------------------------------------

describe('CFF data extraction', () => {
  it('extracts CFF table as raw bytes', () => {
    const result = parseCFFFont(buildMinimalOTF());
    expect(result.cffData).toBeInstanceOf(Uint8Array);
    expect(result.cffData.length).toBeGreaterThan(0);
  });

  it('CFF data starts with valid CFF header', () => {
    const result = parseCFFFont(buildMinimalOTF());
    // CFF header: major=1, minor=0
    expect(result.cffData[0]).toBe(1); // major version
    expect(result.cffData[1]).toBe(0); // minor version
    expect(result.cffData[2]).toBe(4); // header size
  });

  it('CFF data is an independent slice (not a view into original)', () => {
    const otf = buildMinimalOTF();
    const result = parseCFFFont(otf);
    // Modifying the CFF data should not affect the original font bytes
    const firstByte = otf[0]; // 'O' of OTTO
    result.cffData[0] = 0xFF;
    expect(otf[0]).toBe(firstByte);
  });

  it('extracts CFF font name from Name INDEX', () => {
    const result = parseCFFFont(buildMinimalOTF({ cffFontName: 'MyCFFName' }));
    expect(result.cffFontName).toBe('MyCFFName');
  });

  it('CFF font name matches when different from postScriptName', () => {
    const result = parseCFFFont(buildMinimalOTF({
      postScriptName: 'NameTablePS',
      cffFontName: 'CFFInternalName',
    }));
    expect(result.postScriptName).toBe('NameTablePS');
    expect(result.cffFontName).toBe('CFFInternalName');
  });

  it('CFF data length matches CFF table length', () => {
    const otf = buildMinimalOTF();
    // Find the CFF table entry in the table directory
    const data = new DataView(otf.buffer, otf.byteOffset, otf.byteLength);
    const numTables = data.getUint16(4, false);
    let cffTableLength = 0;
    for (let i = 0; i < numTables; i++) {
      const recordOffset = 12 + i * 16;
      const tag = String.fromCharCode(
        otf[recordOffset], otf[recordOffset + 1],
        otf[recordOffset + 2], otf[recordOffset + 3],
      );
      if (tag === 'CFF ') {
        cffTableLength = data.getUint32(recordOffset + 12, false);
        break;
      }
    }
    const result = parseCFFFont(otf);
    expect(result.cffData.length).toBe(cffTableLength);
  });
});

// ---------------------------------------------------------------------------
// Rejection tests
// ---------------------------------------------------------------------------

describe('CFFParser rejection', () => {
  it('rejects TrueType fonts (0x00010000 signature)', () => {
    const ttf = new Uint8Array(64);
    ttf[0] = 0x00; ttf[1] = 0x01; ttf[2] = 0x00; ttf[3] = 0x00;
    expect(() => parseCFFFont(ttf)).toThrow(/TrueType.*parseTrueType/);
  });

  it('rejects TrueType fonts ("true" signature)', () => {
    const ttf = new Uint8Array(64);
    // 'true' = 0x74727565
    ttf[0] = 0x74; ttf[1] = 0x72; ttf[2] = 0x75; ttf[3] = 0x65;
    expect(() => parseCFFFont(ttf)).toThrow(/TrueType.*parseTrueType/);
  });

  it('rejects WOFF', () => {
    const woff = new Uint8Array(64);
    // 'wOFF'
    woff[0] = 0x77; woff[1] = 0x4F; woff[2] = 0x46; woff[3] = 0x46;
    expect(() => parseCFFFont(woff)).toThrow(/WOFF/);
  });

  it('rejects WOFF2', () => {
    const woff2 = new Uint8Array(64);
    // 'wOF2'
    woff2[0] = 0x77; woff2[1] = 0x4F; woff2[2] = 0x46; woff2[3] = 0x32;
    expect(() => parseCFFFont(woff2)).toThrow(/WOFF/);
  });

  it('rejects random/corrupt bytes', () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(() => parseCFFFont(garbage)).toThrow(/Unrecognized font signature/);
  });

  it('rejects truncated file', () => {
    const short = new Uint8Array([0x4F, 0x54, 0x54, 0x4F]); // Just OTTO, no tables
    expect(() => parseCFFFont(short)).toThrow();
  });

  it('rejects OTTO font missing CFF table', () => {
    // Build a minimal OTF but tamper with the CFF table tag
    const otf = buildMinimalOTF();
    const data = new DataView(otf.buffer, otf.byteOffset, otf.byteLength);
    const numTables = data.getUint16(4, false);
    // Find and corrupt the CFF table tag
    for (let i = 0; i < numTables; i++) {
      const recordOffset = 12 + i * 16;
      const tag = String.fromCharCode(
        otf[recordOffset], otf[recordOffset + 1],
        otf[recordOffset + 2], otf[recordOffset + 3],
      );
      if (tag === 'CFF ') {
        // Change 'CFF ' to 'XXXX'
        otf[recordOffset] = 0x58; otf[recordOffset + 1] = 0x58;
        otf[recordOffset + 2] = 0x58; otf[recordOffset + 3] = 0x58;
        break;
      }
    }
    expect(() => parseCFFFont(otf)).toThrow(/Missing required "CFF " table/);
  });
});

// ---------------------------------------------------------------------------
// Font flags compatibility tests
// ---------------------------------------------------------------------------

describe('CFF font flags', () => {
  it('computeFontFlags works with CFF parse result', () => {
    const result = parseCFFFont(buildMinimalOTF());
    // CFFParseResult has _isItalic and _isSerif — compatible with computeFontFlags
    const flags = computeFontFlags(result as any);
    // Default: nonsymbolic only (bit 6)
    expect(flags & 0x20).toBe(0x20);
  });

  it('detects italic from fsSelection', () => {
    const result = parseCFFFont(buildMinimalOTF({ fsSelection: 0x01 }));
    const flags = computeFontFlags(result as any);
    expect(flags & 0x40).toBe(0x40); // italic bit
  });

  it('detects serif from family class', () => {
    const result = parseCFFFont(buildMinimalOTF({ familyClass: 0x0200 }));
    const flags = computeFontFlags(result as any);
    expect(flags & 0x02).toBe(0x02); // serif bit
  });

  it('detects fixed pitch', () => {
    const result = parseCFFFont(buildMinimalOTF({ isFixedPitch: true }));
    const flags = computeFontFlags(result as any);
    expect(flags & 0x01).toBe(0x01); // fixed pitch bit
  });

  it('detects italic from macStyle', () => {
    const result = parseCFFFont(buildMinimalOTF({ macStyle: 0x02 })); // bit 1 = italic
    expect(result._isItalic).toBe(true);
  });

  it('_isSerif is false for non-serif family class', () => {
    const result = parseCFFFont(buildMinimalOTF({ familyClass: 0x0800 })); // class 8 = sans-serif
    expect(result._isSerif).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('CFF edge cases', () => {
  it('handles different unitsPerEm values', () => {
    for (const upm of [500, 1000, 2048, 4096]) {
      const result = parseCFFFont(buildMinimalOTF({ unitsPerEm: upm }));
      expect(result.unitsPerEm).toBe(upm);
    }
  });

  it('handles negative italic angle', () => {
    const result = parseCFFFont(buildMinimalOTF({ italicAngle: -12 }));
    expect(result.italicAngle).toBeCloseTo(-12, 0);
  });

  it('handles zero italic angle', () => {
    const result = parseCFFFont(buildMinimalOTF({ italicAngle: 0 }));
    expect(result.italicAngle).toBe(0);
  });

  it('handles long font names', () => {
    const longName = 'A'.repeat(100);
    const result = parseCFFFont(buildMinimalOTF({
      postScriptName: longName,
      cffFontName: longName,
    }));
    expect(result.postScriptName).toBe(longName);
    expect(result.cffFontName).toBe(longName);
  });

  it('returns independent cmap instance', () => {
    const otf = buildMinimalOTF();
    const result1 = parseCFFFont(otf);
    const result2 = parseCFFFont(otf);
    // Should be independent maps
    result1.cmap.set(0x0042, 99);
    expect(result2.cmap.has(0x0042)).toBe(false);
  });

  it('advanceWidths array has correct length', () => {
    const result = parseCFFFont(buildMinimalOTF());
    expect(result.advanceWidths.length).toBe(result.numGlyphs);
  });

  it('weight class 100 produces small stemV', () => {
    const result = parseCFFFont(buildMinimalOTF({ weightClass: 100 }));
    expect(result.stemV).toBeLessThan(20);
  });

  it('weight class 900 produces large stemV', () => {
    const result = parseCFFFont(buildMinimalOTF({ weightClass: 900 }));
    expect(result.stemV).toBeGreaterThan(180);
  });
});
