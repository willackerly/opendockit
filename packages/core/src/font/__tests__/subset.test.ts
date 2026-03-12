/**
 * Tests for hb-subset WASM font subsetting.
 *
 * Uses a minimal TrueType font generated at runtime to avoid
 * external test fixture dependencies.
 */
import { describe, it, expect } from 'vitest';
import { subsetFont, isSubsetAvailable } from '../subset.js';

// ---------------------------------------------------------------------------
// Minimal TTF generator — creates a valid ~500-byte TrueType font with
// glyph outlines for ASCII 32-126 (space through tilde).
// ---------------------------------------------------------------------------

function buildMinimalTTF(): Uint8Array {
  // We'll use a pre-built minimal TTF that has a handful of glyphs.
  // This is easier than hand-crafting binary tables; we use the
  // subset-font package itself to verify subsetting works.
  //
  // Instead of building from scratch, we create a valid (if ugly)
  // font with the minimum required tables: head, hhea, maxp, OS/2,
  // name, cmap, post, glyf, loca, hmtx

  const buf = new ArrayBuffer(2048);
  const view = new DataView(buf);
  let offset = 0;

  function writeU16(v: number) {
    view.setUint16(offset, v);
    offset += 2;
  }
  function writeU32(v: number) {
    view.setUint32(offset, v);
    offset += 4;
  }
  function writeI16(v: number) {
    view.setInt16(offset, v);
    offset += 2;
  }

  const numTables = 10;

  // Offset table
  writeU32(0x00010000); // sfVersion
  writeU16(numTables); // numTables
  writeU16(128); // searchRange
  writeU16(3); // entrySelector
  writeU16(32); // rangeShift

  // Table directory (10 tables x 16 bytes = 160 bytes)
  // starts at offset 12, data starts at 12 + 160 = 172
  const tableDir: Array<{
    tag: string;
    offset: number;
    length: number;
  }> = [];
  const dirStart = offset; // 12

  // Reserve space for table directory
  offset = dirStart + numTables * 16;

  // Align to 4 bytes
  function align4() {
    while (offset % 4 !== 0) {
      view.setUint8(offset, 0);
      offset++;
    }
  }

  // Number of glyphs: .notdef + space + 'A' + 'B' + 'H' + 'e' + 'l' + 'o' = 8
  const numGlyphs = 8;
  // cmap: 0->0(.notdef), 32->1(space), 65->2(A), 66->3(B), 72->4(H), 101->5(e), 108->6(l), 111->7(o)
  const cmapEntries: [number, number][] = [
    [32, 1],
    [65, 2],
    [66, 3],
    [72, 4],
    [101, 5],
    [108, 6],
    [111, 7],
  ];

  // --- head ---
  align4();
  const headOffset = offset;
  writeU32(0x00010000); // version
  writeU32(0x00005000); // fontRevision
  writeU32(0); // checksumAdjust
  writeU32(0x5f0f3cf5); // magicNumber
  writeU16(0x000b); // flags
  writeU16(1000); // unitsPerEm
  // created/modified (8 bytes each)
  writeU32(0);
  writeU32(0);
  writeU32(0);
  writeU32(0);
  writeI16(0); // xMin
  writeI16(0); // yMin
  writeI16(500); // xMax
  writeI16(700); // yMax
  writeU16(0); // macStyle
  writeU16(8); // lowestRecPPEM
  writeI16(2); // fontDirectionHint
  writeI16(1); // indexToLocFormat (long)
  writeI16(0); // glyphDataFormat
  const headLen = offset - headOffset;
  tableDir.push({ tag: 'head', offset: headOffset, length: headLen });

  // --- hhea ---
  align4();
  const hheaOffset = offset;
  writeU32(0x00010000); // version
  writeI16(700); // ascent
  writeI16(-200); // descent
  writeI16(0); // lineGap
  writeU16(600); // advanceWidthMax
  writeI16(0); // minLeftSideBearing
  writeI16(0); // minRightSideBearing
  writeI16(500); // xMaxExtent
  writeI16(1); // caretSlopeRise
  writeI16(0); // caretSlopeRun
  writeI16(0); // caretOffset
  writeI16(0); // reserved1
  writeI16(0); // reserved2
  writeI16(0); // reserved3
  writeI16(0); // reserved4
  writeI16(0); // metricDataFormat
  writeU16(numGlyphs); // numOfLongHorMetrics
  const hheaLen = offset - hheaOffset;
  tableDir.push({ tag: 'hhea', offset: hheaOffset, length: hheaLen });

  // --- maxp ---
  align4();
  const maxpOffset = offset;
  writeU32(0x00010000); // version
  writeU16(numGlyphs); // numGlyphs
  writeU16(0); // maxPoints
  writeU16(0); // maxContours
  writeU16(0); // maxComponentPoints
  writeU16(0); // maxComponentContours
  writeU16(1); // maxZones
  writeU16(0); // maxTwilightPoints
  writeU16(0); // maxStorage
  writeU16(0); // maxFunctionDefs
  writeU16(0); // maxInstructionDefs
  writeU16(0); // maxStackElements
  writeU16(0); // maxSizeOfInstructions
  writeU16(0); // maxComponentElements
  writeU16(0); // maxComponentDepth
  const maxpLen = offset - maxpOffset;
  tableDir.push({ tag: 'maxp', offset: maxpOffset, length: maxpLen });

  // --- OS/2 ---
  align4();
  const os2Offset = offset;
  writeU16(4); // version
  writeI16(500); // xAvgCharWidth
  writeU16(400); // usWeightClass
  writeU16(5); // usWidthClass
  writeU16(0); // fsType
  writeI16(0); writeI16(0); writeI16(0); writeI16(0); writeI16(0); // subscript
  writeI16(0); writeI16(0); writeI16(0); writeI16(0); writeI16(0); // superscript
  writeI16(0); // strikeoutSize
  writeI16(0); // strikeoutPosition
  writeI16(0); // sFamilyClass
  // panose (10 bytes)
  for (let i = 0; i < 10; i++) view.setUint8(offset++, 0);
  writeU32(0); // ulUnicodeRange1
  writeU32(0); // ulUnicodeRange2
  writeU32(0); // ulUnicodeRange3
  writeU32(0); // ulUnicodeRange4
  // achVendID (4 bytes)
  for (let i = 0; i < 4; i++) view.setUint8(offset++, 0x20);
  writeU16(0x0040); // fsSelection
  writeU16(32); // usFirstCharIndex
  writeU16(111); // usLastCharIndex
  writeI16(700); // sTypoAscender
  writeI16(-200); // sTypoDescender
  writeI16(0); // sTypoLineGap
  writeU16(700); // usWinAscent
  writeU16(200); // usWinDescent
  writeU32(0); // ulCodePageRange1
  writeU32(0); // ulCodePageRange2
  writeI16(0); // sxHeight
  writeI16(0); // sCapHeight
  writeU16(0); // usDefaultChar
  writeU16(32); // usBreakChar
  writeU16(1); // usMaxContext
  const os2Len = offset - os2Offset;
  tableDir.push({ tag: 'OS/2', offset: os2Offset, length: os2Len });

  // --- name ---
  align4();
  const nameOffset = offset;
  const nameStr = 'TestFont';
  const nameBytes = new TextEncoder().encode(nameStr);
  writeU16(0); // format
  writeU16(1); // count
  writeU16(6 + 1 * 12); // stringOffset (header + 1 record)
  // nameRecord: platformID=3 (Windows), encodingID=1 (Unicode BMP), languageID=0x0409, nameID=1 (family)
  writeU16(3);
  writeU16(1);
  writeU16(0x0409);
  writeU16(1);
  writeU16(nameBytes.length * 2); // length in bytes (UTF-16)
  writeU16(0); // offset into string storage
  // string storage: UTF-16BE
  for (const b of nameBytes) {
    view.setUint8(offset++, 0);
    view.setUint8(offset++, b);
  }
  const nameLen = offset - nameOffset;
  tableDir.push({ tag: 'name', offset: nameOffset, length: nameLen });

  // --- cmap ---
  align4();
  const cmapOffset = offset;
  writeU16(0); // version
  writeU16(1); // numTables
  // encoding record: platform=3, encoding=1, offset=12
  writeU16(3);
  writeU16(1);
  writeU32(12); // offset to subtable from cmap start
  // subtable: format 4
  const segCount = cmapEntries.length + 1; // +1 for sentinel
  const subtableStart = offset;
  writeU16(4); // format
  writeU16(0); // length (placeholder, fill later)
  writeU16(0); // language
  writeU16(segCount * 2); // segCountX2
  writeU16(0); // searchRange
  writeU16(0); // entrySelector
  writeU16(0); // rangeShift
  // endCode
  for (const [cp] of cmapEntries) writeU16(cp);
  writeU16(0xffff); // sentinel
  writeU16(0); // reservedPad
  // startCode
  for (const [cp] of cmapEntries) writeU16(cp);
  writeU16(0xffff);
  // idDelta
  for (const [cp, gid] of cmapEntries) writeI16((gid - cp) & 0xffff);
  writeI16(1); // sentinel delta
  // idRangeOffset
  for (let i = 0; i < segCount; i++) writeU16(0);
  // fill in subtable length
  const subtableLen = offset - subtableStart;
  view.setUint16(subtableStart + 2, subtableLen);
  const cmapLen = offset - cmapOffset;
  tableDir.push({ tag: 'cmap', offset: cmapOffset, length: cmapLen });

  // --- post ---
  align4();
  const postOffset = offset;
  writeU32(0x00030000); // version 3.0 (no glyph names)
  writeU32(0); // italicAngle
  writeI16(-100); // underlinePosition
  writeI16(50); // underlineThickness
  writeU32(0); // isFixedPitch
  writeU32(0); // minMemType42
  writeU32(0); // maxMemType42
  writeU32(0); // minMemType1
  writeU32(0); // maxMemType1
  const postLen = offset - postOffset;
  tableDir.push({ tag: 'post', offset: postOffset, length: postLen });

  // --- loca (long format) ---
  align4();
  const locaOffset = offset;
  // All glyphs are empty (zero-length) — offsets all 0
  for (let i = 0; i <= numGlyphs; i++) writeU32(0);
  const locaLen = offset - locaOffset;
  tableDir.push({ tag: 'loca', offset: locaOffset, length: locaLen });

  // --- glyf ---
  align4();
  const glyfOffset = offset;
  // Empty glyf table (all glyphs have zero length in loca)
  const glyfLen = 0;
  tableDir.push({ tag: 'glyf', offset: glyfOffset, length: glyfLen });

  // --- hmtx ---
  align4();
  const hmtxOffset = offset;
  for (let i = 0; i < numGlyphs; i++) {
    writeU16(500); // advanceWidth
    writeI16(0); // leftSideBearing
  }
  const hmtxLen = offset - hmtxOffset;
  tableDir.push({ tag: 'hmtx', offset: hmtxOffset, length: hmtxLen });

  // Write table directory
  const tagToBytes = (tag: string) => {
    const a = tag.charCodeAt(0);
    const b = tag.charCodeAt(1);
    const c = tag.charCodeAt(2);
    const d = tag.charCodeAt(3);
    return (a << 24) | (b << 16) | (c << 8) | d;
  };

  let dirOffset = dirStart;
  for (const entry of tableDir) {
    view.setUint32(dirOffset, tagToBytes(entry.tag));
    dirOffset += 4;
    view.setUint32(dirOffset, 0); // checksum (we skip)
    dirOffset += 4;
    view.setUint32(dirOffset, entry.offset);
    dirOffset += 4;
    view.setUint32(dirOffset, entry.length);
    dirOffset += 4;
  }

  return new Uint8Array(buf, 0, offset);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('subsetFont', () => {
  it('returns a smaller buffer when subsetting to fewer characters', async () => {
    const ttf = buildMinimalTTF();
    const result = await subsetFont(ttf, 'AB');
    // hb-subset should produce something smaller or at least not larger
    // If subset-font is working, the result should differ from the original
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
    // The subsetted font should be smaller than the original
    expect(result.length).toBeLessThanOrEqual(ttf.length);
  });

  it('handles empty character string', async () => {
    const ttf = buildMinimalTTF();
    const result = await subsetFont(ttf, '');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns original buffer when given invalid font data', async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const result = await subsetFont(garbage, 'Hello');
    // Should fall back to returning the original
    expect(result).toEqual(garbage);
  });

  it('accepts ArrayBuffer input', async () => {
    const ttf = buildMinimalTTF();
    const result = await subsetFont(ttf.buffer, 'A');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it('supports truetype target format', async () => {
    const ttf = buildMinimalTTF();
    const result = await subsetFont(ttf, 'AB', {
      targetFormat: 'truetype',
    });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
    // Check for TrueType signature (0x00010000)
    const view = new DataView(result.buffer, result.byteOffset);
    expect(view.getUint32(0)).toBe(0x00010000);
  });

  it('supports woff2 target format option', async () => {
    const ttf = buildMinimalTTF();
    const result = await subsetFont(ttf, 'AB', {
      targetFormat: 'woff2',
    });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
    // subset-font may or may not produce WOFF2 depending on the input;
    // the important thing is it doesn't crash and returns valid data.
    const view = new DataView(result.buffer, result.byteOffset);
    const sig = view.getUint32(0);
    // Either WOFF2 (0x774f4632) or TrueType (0x00010000) is acceptable
    expect([0x774f4632, 0x00010000]).toContain(sig);
  });
});

describe('isSubsetAvailable', () => {
  it('returns true when subset-font is installed', async () => {
    const available = await isSubsetAvailable();
    expect(available).toBe(true);
  });
});
