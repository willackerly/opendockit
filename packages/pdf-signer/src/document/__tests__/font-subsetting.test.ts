/**
 * Tests for TrueType font subsetting.
 *
 * Uses minimal TTF fonts built in code to test:
 * - Basic subsetting (reduces glyph count)
 * - Output is valid TTF (parseable by TrueTypeParser)
 * - Subset is smaller than original
 * - Glyph 0 (.notdef) always included
 * - Composite glyph dependencies are resolved
 * - CIDToGIDMap correctness after remapping
 * - Subset tag generation
 * - Edge cases (empty subset, all glyphs, single glyph)
 */

import { describe, it, expect } from 'vitest';
import { subsetTrueTypeFont } from '../fonts/TrueTypeSubsetter.js';
import { parseTrueType } from '../fonts/TrueTypeParser.js';

// ---------------------------------------------------------------------------
// Minimal TTF builder for subsetting tests
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid TrueType font with simple (non-composite) glyphs.
 *
 * Glyphs:
 *   0: .notdef (empty)
 *   1: space (U+0020, empty outline)
 *   2: A (U+0041, simple triangle outline)
 *   3: B (U+0042, simple rectangle outline)
 *   4: C (U+0043, simple outline)
 *
 * Each glyph has a simple 3-point or 4-point contour so glyf entries have
 * non-zero length (needed to test data copying).
 */
function buildTestTTF(options?: {
  includeComposite?: boolean;
  postScriptName?: string;
}): Uint8Array {
  const postScriptName = options?.postScriptName ?? 'SubsetTestFont';
  const includeComposite = options?.includeComposite ?? false;

  const buf = new ArrayBuffer(8192);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let pos = 0;

  function writeU8(v: number) { bytes[pos++] = v & 0xFF; }
  function writeU16(v: number) { view.setUint16(pos, v, false); pos += 2; }
  function writeI16(v: number) { view.setInt16(pos, v, false); pos += 2; }
  function writeU32(v: number) { view.setUint32(pos, v, false); pos += 4; }
  function writeI32(v: number) { view.setInt32(pos, v, false); pos += 4; }
  function writeStr16BE(s: string) { for (let i = 0; i < s.length; i++) writeU16(s.charCodeAt(i)); }
  function padTo4() { while (pos % 4 !== 0) bytes[pos++] = 0; }

  // Number of glyphs: 5 simple + optionally 1 composite = 5 or 6
  const numGlyphs = includeComposite ? 6 : 5;
  const numTables = 10;
  const headerSize = 12 + numTables * 16;

  const tableEntries: Array<{ tag: string; offset: number; length: number }> = [];
  pos = headerSize;

  // ---- Build glyf table first (we need offsets for loca) ----
  const glyfOffset = pos;
  const glyphOffsets: number[] = []; // start offsets relative to glyf table start

  // Glyph 0: .notdef — empty simple glyph (10-byte header + minimal contour)
  glyphOffsets.push(pos - glyfOffset);
  writeI16(1);    // numberOfContours = 1
  writeI16(0);    // xMin
  writeI16(0);    // yMin
  writeI16(500);  // xMax
  writeI16(700);  // yMax
  // endPtsOfContours
  writeU16(2);    // contour 0 ends at point 2 (3 points)
  // instructionLength
  writeU16(0);
  // flags: 3 points, all on-curve, x-short-positive, y-short-positive
  writeU8(0x37); // onCurve + xShortPositive + yShortPositive + repeat=0 per flag
  writeU8(0x37);
  writeU8(0x37);
  // x coordinates (uint8 each since xShortPositive)
  writeU8(0);     // x0 = 0
  writeU8(250);   // x1 = 250 (delta)
  writeU8(250);   // x2 = 500 (delta)
  // y coordinates
  writeU8(0);     // y0 = 0
  writeU8(255);   // y1 = 255 (delta, capped at uint8)
  writeU8(0);     // y2 = 0 (delta back)
  padTo4();

  // Glyph 1: space — empty (zero-length in loca)
  glyphOffsets.push(pos - glyfOffset);
  // No data — empty glyph. loca[1] == loca[2] means zero length.

  // Glyph 2: A — simple 3-point triangle
  glyphOffsets.push(pos - glyfOffset);
  writeI16(1);    // numberOfContours
  writeI16(0); writeI16(0); writeI16(600); writeI16(700);
  writeU16(2);    // endPtsOfContours[0] = 2
  writeU16(0);    // instructionLength
  writeU8(0x37); writeU8(0x37); writeU8(0x37); // flags
  writeU8(0); writeU8(200); writeU8(200);       // x deltas
  writeU8(0); writeU8(200); writeU8(0);         // y deltas
  padTo4();

  // Glyph 3: B — simple 4-point rectangle
  glyphOffsets.push(pos - glyfOffset);
  writeI16(1);    // numberOfContours
  writeI16(0); writeI16(0); writeI16(550); writeI16(700);
  writeU16(3);    // endPtsOfContours[0] = 3
  writeU16(0);    // instructionLength
  writeU8(0x37); writeU8(0x27); writeU8(0x37); writeU8(0x27); // flags
  writeU8(0); writeU8(200); writeU8(0); writeU8(0);           // x deltas
  writeU8(0); writeU8(0); writeU8(200); writeU8(0);           // y deltas (note: 0x27 = short + positive but no repeat, on-curve, yShort negative)
  padTo4();

  // Glyph 4: C — simple 3-point
  glyphOffsets.push(pos - glyfOffset);
  writeI16(1);    // numberOfContours
  writeI16(0); writeI16(0); writeI16(580); writeI16(700);
  writeU16(2);
  writeU16(0);
  writeU8(0x37); writeU8(0x37); writeU8(0x37);
  writeU8(0); writeU8(180); writeU8(180);
  writeU8(0); writeU8(200); writeU8(0);
  padTo4();

  if (includeComposite) {
    // Glyph 5: composite referencing glyphs 2 (A) and 3 (B)
    // Maps to U+0044 ('D') in cmap
    glyphOffsets.push(pos - glyfOffset);
    writeI16(-1);   // numberOfContours = -1 (composite)
    writeI16(0); writeI16(0); writeI16(600); writeI16(700); // bbox

    // Component 1: glyph 2 (A) with MORE_COMPONENTS flag
    const flags1 = 0x0020 | 0x0001; // MORE_COMPONENTS | ARG_1_AND_2_ARE_WORDS
    writeU16(flags1);
    writeU16(2);    // glyphIndex = 2 (A)
    writeI16(0);    // argument1 (x offset)
    writeI16(0);    // argument2 (y offset)

    // Component 2: glyph 3 (B) — last component (no MORE_COMPONENTS)
    const flags2 = 0x0001; // ARG_1_AND_2_ARE_WORDS only
    writeU16(flags2);
    writeU16(3);    // glyphIndex = 3 (B)
    writeI16(300);  // x offset
    writeI16(0);    // y offset
    padTo4();
  }

  // Final offset (end of glyf)
  glyphOffsets.push(pos - glyfOffset);
  const glyfLength = pos - glyfOffset;
  padTo4();
  tableEntries.push({ tag: 'glyf', offset: glyfOffset, length: glyfLength });

  // ---- loca table (long format) ----
  const locaOffset = pos;
  for (const off of glyphOffsets) {
    writeU32(off);
  }
  const locaLength = pos - locaOffset;
  padTo4();
  tableEntries.push({ tag: 'loca', offset: locaOffset, length: locaLength });

  // ---- head table (54 bytes) ----
  const headOffset = pos;
  writeU32(0x00010000); // version
  writeU32(0x00005000); // fontRevision
  writeU32(0);          // checksumAdjustment
  writeU32(0x5F0F3CF5); // magicNumber
  writeU16(0x000B);     // flags
  writeU16(1000);       // unitsPerEm
  writeU32(0); writeU32(0); // created
  writeU32(0); writeU32(0); // modified
  writeI16(-100); writeI16(-200); writeI16(700); writeI16(800); // bbox
  writeU16(0);   // macStyle
  writeU16(8);   // lowestRecPPEM
  writeI16(2);   // fontDirectionHint
  writeI16(1);   // indexToLocFormat = 1 (long)
  writeI16(0);   // glyphDataFormat
  const headLength = pos - headOffset;
  padTo4();
  tableEntries.push({ tag: 'head', offset: headOffset, length: headLength });

  // ---- hhea table (36 bytes) ----
  const hheaOffset = pos;
  writeU32(0x00010000);
  writeI16(800);  // ascender
  writeI16(-200); // descender
  writeI16(0);    // lineGap
  writeU16(600);  // advanceWidthMax
  writeI16(0); writeI16(0); writeI16(700); // minLSB, minRSB, xMaxExtent
  writeI16(1); writeI16(0); // caretSlopeRise/Run
  writeI16(0);              // caretOffset
  writeI16(0); writeI16(0); writeI16(0); writeI16(0); // reserved
  writeI16(0);              // metricDataFormat
  writeU16(numGlyphs);     // numberOfHMetrics (all glyphs have entries)
  const hheaLength = pos - hheaOffset;
  padTo4();
  tableEntries.push({ tag: 'hhea', offset: hheaOffset, length: hheaLength });

  // ---- hmtx table ----
  const hmtxOffset = pos;
  const widths = [500, 250, 600, 550, 580];
  if (includeComposite) widths.push(650);
  for (let i = 0; i < numGlyphs; i++) {
    writeU16(widths[i]); // advanceWidth
    writeI16(0);         // lsb
  }
  const hmtxLength = pos - hmtxOffset;
  padTo4();
  tableEntries.push({ tag: 'hmtx', offset: hmtxOffset, length: hmtxLength });

  // ---- maxp table ----
  const maxpOffset = pos;
  writeU32(0x00010000);
  writeU16(numGlyphs);
  // Minimal v1.0 fields
  writeU16(4); writeU16(1); writeU16(4); writeU16(includeComposite ? 2 : 0);
  writeU16(1); writeU16(0); writeU16(0); writeU16(0);
  writeU16(0); writeU16(0); writeU16(0); writeU16(includeComposite ? 2 : 0);
  writeU16(includeComposite ? 1 : 0);
  const maxpLength = pos - maxpOffset;
  padTo4();
  tableEntries.push({ tag: 'maxp', offset: maxpOffset, length: maxpLength });

  // ---- OS/2 table (96 bytes, version 2) ----
  const os2Offset = pos;
  writeU16(2); // version
  writeI16(450); // xAvgCharWidth
  writeU16(400); // usWeightClass
  writeU16(5);   // usWidthClass
  writeU16(0);   // fsType
  writeI16(0); writeI16(0); writeI16(0); writeI16(0);
  writeI16(0); writeI16(0); writeI16(0); writeI16(0);
  writeI16(0); writeI16(0);
  writeI16(0); // sFamilyClass
  for (let i = 0; i < 10; i++) writeU8(0); // panose
  writeU32(0); writeU32(0); writeU32(0); writeU32(0); // ulUnicodeRange
  writeU8(0x20); writeU8(0x20); writeU8(0x20); writeU8(0x20); // achVendID
  writeU16(0x0040); // fsSelection (Regular)
  writeU16(0x0020); // usFirstCharIndex
  writeU16(includeComposite ? 0x0044 : 0x0043); // usLastCharIndex
  writeI16(800);  // sTypoAscender
  writeI16(-200); // sTypoDescender
  writeI16(0);    // sTypoLineGap
  writeU16(800);  // usWinAscent
  writeU16(200);  // usWinDescent
  writeU32(1); writeU32(0); // ulCodePageRange
  writeI16(0);    // sxHeight
  writeI16(700);  // sCapHeight
  writeU16(0);    // usDefaultChar
  writeU16(0x0020); // usBreakChar
  writeU16(1);    // usMaxContext
  const os2Length = pos - os2Offset;
  padTo4();
  tableEntries.push({ tag: 'OS/2', offset: os2Offset, length: os2Length });

  // ---- name table ----
  const nameOffset = pos;
  const nameStrings = [
    { nameID: 1, str: 'Subset Test Font' },
    { nameID: 6, str: postScriptName },
  ];
  const nameCount = nameStrings.length;
  const nameHeaderSize = 6 + nameCount * 12;
  writeU16(0); writeU16(nameCount); writeU16(nameHeaderSize);
  let strOff = 0;
  for (const ns of nameStrings) {
    writeU16(3); writeU16(1); writeU16(0x0409); writeU16(ns.nameID);
    writeU16(ns.str.length * 2); writeU16(strOff);
    strOff += ns.str.length * 2;
  }
  for (const ns of nameStrings) {
    writeStr16BE(ns.str);
  }
  const nameLength = pos - nameOffset;
  padTo4();
  tableEntries.push({ tag: 'name', offset: nameOffset, length: nameLength });

  // ---- cmap table (format 4) ----
  const cmapOffset = pos;
  writeU16(0); // version
  writeU16(1); // numTables
  writeU16(3); writeU16(1); writeU32(12); // platform 3, encoding 1, offset 12

  // Format 4 subtable
  // Segments: [0x0020,0x0020], [0x0041,0x0043] (or 0x0044 with composite), [0xFFFF]
  const segCount = includeComposite ? 3 : 3;
  const subtableStart = pos;
  writeU16(4); // format
  writeU16(0); // length placeholder
  writeU16(0); // language
  writeU16(segCount * 2);
  const searchRange2 = Math.pow(2, Math.floor(Math.log2(segCount))) * 2;
  writeU16(searchRange2);
  writeU16(Math.floor(Math.log2(segCount)));
  writeU16(segCount * 2 - searchRange2);

  // endCode[]
  writeU16(0x0020); // space
  writeU16(includeComposite ? 0x0044 : 0x0043); // A-C or A-D
  writeU16(0xFFFF);
  writeU16(0); // reservedPad

  // startCode[]
  writeU16(0x0020);
  writeU16(0x0041);
  writeU16(0xFFFF);

  // idDelta[]
  writeI16(1 - 0x0020);  // space -> glyph 1
  writeI16(2 - 0x0041);  // A(0x41)->2, B(0x42)->3, C(0x43)->4, D(0x44)->5
  writeI16(1);

  // idRangeOffset[]
  writeU16(0);
  writeU16(0);
  writeU16(0);

  // Patch subtable length
  const subtableLen = pos - subtableStart;
  view.setUint16(subtableStart + 2, subtableLen, false);

  const cmapLength = pos - cmapOffset;
  padTo4();
  tableEntries.push({ tag: 'cmap', offset: cmapOffset, length: cmapLength });

  // ---- post table ----
  const postOffset = pos;
  writeU32(0x00030000); // version 3.0
  writeI32(0); // italicAngle
  writeI16(-100); writeI16(50); // underline
  writeU32(0); // isFixedPitch
  writeU32(0); writeU32(0); writeU32(0); writeU32(0); // mem
  const postLength = pos - postOffset;
  padTo4();
  tableEntries.push({ tag: 'post', offset: postOffset, length: postLength });

  const totalSize = pos;

  // Write header + directory
  pos = 0;
  writeU32(0x00010000);
  writeU16(numTables);
  const srT = Math.pow(2, Math.floor(Math.log2(numTables))) * 16;
  writeU16(srT);
  writeU16(Math.floor(Math.log2(numTables)));
  writeU16(numTables * 16 - srT);

  tableEntries.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  for (const entry of tableEntries) {
    const tag = entry.tag.padEnd(4, ' ');
    for (let i = 0; i < 4; i++) bytes[pos++] = tag.charCodeAt(i);
    writeU32(0); // checksum
    writeU32(entry.offset);
    writeU32(entry.length);
  }

  return bytes.slice(0, totalSize);
}

// ---------------------------------------------------------------------------
// Basic subsetting tests
// ---------------------------------------------------------------------------

describe('TrueTypeSubsetter', () => {
  it('produces a valid TTF that can be re-parsed', () => {
    const original = buildTestTTF();
    const result = subsetTrueTypeFont(original, new Set([2])); // just glyph 2 (A)
    const info = parseTrueType(result.bytes);
    expect(info).toBeDefined();
    expect(info.numGlyphs).toBeGreaterThan(0);
  });

  it('reduces glyph count when subsetting', () => {
    const original = buildTestTTF();
    const origInfo = parseTrueType(original);
    expect(origInfo.numGlyphs).toBe(5); // .notdef, space, A, B, C

    const result = subsetTrueTypeFont(original, new Set([2])); // just A
    const subInfo = parseTrueType(result.bytes);
    expect(subInfo.numGlyphs).toBe(2); // .notdef + A
  });

  it('produces smaller output than original', () => {
    const original = buildTestTTF();
    const result = subsetTrueTypeFont(original, new Set([2])); // just A
    expect(result.bytes.length).toBeLessThan(original.length);
  });

  it('always includes glyph 0 (.notdef)', () => {
    const original = buildTestTTF();
    // Request only glyph 2 (A) — .notdef must still be included
    const result = subsetTrueTypeFont(original, new Set([2]));
    expect(result.glyphMapping.has(0)).toBe(true);
    expect(result.glyphMapping.get(0)).toBe(0); // .notdef is always new glyph 0
  });

  it('maps requested glyphs to contiguous new IDs', () => {
    const original = buildTestTTF();
    // Request glyphs 2 (A) and 4 (C), skip 3 (B)
    const result = subsetTrueTypeFont(original, new Set([2, 4]));
    // Sorted old IDs: [0, 2, 4] -> new IDs: [0, 1, 2]
    expect(result.glyphMapping.get(0)).toBe(0);
    expect(result.glyphMapping.get(2)).toBe(1);
    expect(result.glyphMapping.get(4)).toBe(2);
    expect(result.glyphMapping.size).toBe(3);
  });

  it('subset preserves advance widths correctly', () => {
    const original = buildTestTTF();
    const origInfo = parseTrueType(original);

    // Subset to just glyph 2 (A, width=600) and glyph 3 (B, width=550)
    const result = subsetTrueTypeFont(original, new Set([2, 3]));
    const subInfo = parseTrueType(result.bytes);

    // New glyph 0 = old .notdef (width 500)
    expect(subInfo.advanceWidths[0]).toBe(origInfo.advanceWidths[0]); // 500
    // New glyph 1 = old glyph 2 (A, width 600)
    expect(subInfo.advanceWidths[1]).toBe(origInfo.advanceWidths[2]); // 600
    // New glyph 2 = old glyph 3 (B, width 550)
    expect(subInfo.advanceWidths[2]).toBe(origInfo.advanceWidths[3]); // 550
  });

  it('subset cmap maps only included codepoints', () => {
    const original = buildTestTTF();
    // Subset to just A (glyph 2) — cmap should only have U+0041
    const result = subsetTrueTypeFont(original, new Set([2]));
    const subInfo = parseTrueType(result.bytes);

    expect(subInfo.cmap.has(0x0041)).toBe(true); // A is present
    expect(subInfo.cmap.get(0x0041)).toBe(1);    // A -> new glyph 1
    expect(subInfo.cmap.has(0x0020)).toBe(false); // space not requested
    expect(subInfo.cmap.has(0x0042)).toBe(false); // B not requested
    expect(subInfo.cmap.has(0x0043)).toBe(false); // C not requested
  });

  it('subset cmap remaps glyph IDs to new contiguous IDs', () => {
    const original = buildTestTTF();
    // Subset A (old glyph 2) and C (old glyph 4)
    const result = subsetTrueTypeFont(original, new Set([2, 4]));
    const subInfo = parseTrueType(result.bytes);

    // A should map to new glyph 1
    expect(subInfo.cmap.get(0x0041)).toBe(1);
    // C should map to new glyph 2
    expect(subInfo.cmap.get(0x0043)).toBe(2);
  });

  it('generates a 6-character uppercase subset tag', () => {
    const original = buildTestTTF();
    const result = subsetTrueTypeFont(original, new Set([2]));
    expect(result.subsetTag).toMatch(/^[A-Z]{6}$/);
  });

  it('generates deterministic subset tag for same glyph set', () => {
    const original = buildTestTTF();
    const result1 = subsetTrueTypeFont(original, new Set([2, 3]));
    const result2 = subsetTrueTypeFont(original, new Set([2, 3]));
    expect(result1.subsetTag).toBe(result2.subsetTag);
  });

  it('generates different subset tags for different glyph sets', () => {
    const original = buildTestTTF();
    const result1 = subsetTrueTypeFont(original, new Set([2]));
    const result2 = subsetTrueTypeFont(original, new Set([2, 3]));
    expect(result1.subsetTag).not.toBe(result2.subsetTag);
  });
});

// ---------------------------------------------------------------------------
// Composite glyph tests
// ---------------------------------------------------------------------------

describe('TrueTypeSubsetter — composite glyphs', () => {
  it('recursively includes component glyph dependencies', () => {
    const original = buildTestTTF({ includeComposite: true });
    const origInfo = parseTrueType(original);
    expect(origInfo.numGlyphs).toBe(6);

    // Request glyph 5 (composite D) — should pull in glyphs 2 (A) and 3 (B)
    const result = subsetTrueTypeFont(original, new Set([5]));

    // Should include: 0 (.notdef), 2 (A), 3 (B), 5 (composite D)
    expect(result.glyphMapping.has(0)).toBe(true);
    expect(result.glyphMapping.has(2)).toBe(true);
    expect(result.glyphMapping.has(3)).toBe(true);
    expect(result.glyphMapping.has(5)).toBe(true);
    expect(result.glyphMapping.size).toBe(4);
  });

  it('remaps component glyph IDs in composite glyph data', () => {
    const original = buildTestTTF({ includeComposite: true });
    const result = subsetTrueTypeFont(original, new Set([5]));
    // The output should be parseable (i.e., composite references are valid)
    const subInfo = parseTrueType(result.bytes);
    expect(subInfo.numGlyphs).toBe(4); // .notdef, A, B, composite
  });

  it('composite + direct request deduplicates correctly', () => {
    const original = buildTestTTF({ includeComposite: true });
    // Request glyph 2 (A) directly AND glyph 5 (composite, which uses A+B)
    const result = subsetTrueTypeFont(original, new Set([2, 5]));

    // Should have: 0, 2, 3, 5 — glyph 2 is not duplicated
    expect(result.glyphMapping.size).toBe(4);
    expect(result.glyphMapping.has(0)).toBe(true);
    expect(result.glyphMapping.has(2)).toBe(true);
    expect(result.glyphMapping.has(3)).toBe(true);
    expect(result.glyphMapping.has(5)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('TrueTypeSubsetter — edge cases', () => {
  it('empty glyph set produces font with just .notdef', () => {
    const original = buildTestTTF();
    const result = subsetTrueTypeFont(original, new Set());
    const subInfo = parseTrueType(result.bytes);
    expect(subInfo.numGlyphs).toBe(1); // just .notdef
    expect(result.glyphMapping.size).toBe(1);
    expect(result.glyphMapping.get(0)).toBe(0);
  });

  it('requesting all glyphs keeps all glyphs', () => {
    const original = buildTestTTF();
    const origInfo = parseTrueType(original);
    const allGlyphs = new Set<number>();
    for (let i = 0; i < origInfo.numGlyphs; i++) allGlyphs.add(i);

    const result = subsetTrueTypeFont(original, allGlyphs);
    const subInfo = parseTrueType(result.bytes);
    expect(subInfo.numGlyphs).toBe(origInfo.numGlyphs);
  });

  it('ignores out-of-range glyph IDs gracefully', () => {
    const original = buildTestTTF();
    // Request glyph 999 which doesn't exist
    const result = subsetTrueTypeFont(original, new Set([999, 2]));
    // Should only include .notdef + glyph 2
    expect(result.glyphMapping.size).toBe(2);
    expect(result.glyphMapping.has(2)).toBe(true);
    expect(result.glyphMapping.has(999)).toBe(false);
  });

  it('requesting .notdef explicitly is a no-op (always included)', () => {
    const original = buildTestTTF();
    const result1 = subsetTrueTypeFont(original, new Set([0, 2]));
    const result2 = subsetTrueTypeFont(original, new Set([2]));
    expect(result1.glyphMapping.size).toBe(result2.glyphMapping.size);
  });

  it('requesting only space glyph works', () => {
    const original = buildTestTTF();
    // Glyph 1 = space (empty outline)
    const result = subsetTrueTypeFont(original, new Set([1]));
    const subInfo = parseTrueType(result.bytes);
    expect(subInfo.numGlyphs).toBe(2); // .notdef + space
    // Space should be in cmap
    expect(subInfo.cmap.get(0x0020)).toBe(1);
  });

  it('output has all required TrueType tables', () => {
    const original = buildTestTTF();
    const result = subsetTrueTypeFont(original, new Set([2]));
    const data = new DataView(
      result.bytes.buffer,
      result.bytes.byteOffset,
      result.bytes.byteLength,
    );
    const numTables = data.getUint16(4, false);
    const tableTags = new Set<string>();
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      const tag = String.fromCharCode(
        result.bytes[rec], result.bytes[rec + 1],
        result.bytes[rec + 2], result.bytes[rec + 3],
      );
      tableTags.add(tag);
    }
    expect(tableTags.has('head')).toBe(true);
    expect(tableTags.has('hhea')).toBe(true);
    expect(tableTags.has('hmtx')).toBe(true);
    expect(tableTags.has('maxp')).toBe(true);
    expect(tableTags.has('loca')).toBe(true);
    expect(tableTags.has('glyf')).toBe(true);
    expect(tableTags.has('cmap')).toBe(true);
    expect(tableTags.has('post')).toBe(true);
  });

  it('output head table has indexToLocFormat = 1 (long)', () => {
    const original = buildTestTTF();
    const result = subsetTrueTypeFont(original, new Set([2]));
    const data = new DataView(
      result.bytes.buffer,
      result.bytes.byteOffset,
      result.bytes.byteLength,
    );
    // Find head table offset
    const numTables = data.getUint16(4, false);
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      const tag = String.fromCharCode(
        result.bytes[rec], result.bytes[rec + 1],
        result.bytes[rec + 2], result.bytes[rec + 3],
      );
      if (tag === 'head') {
        const offset = data.getUint32(rec + 8, false);
        const locFormat = data.getInt16(offset + 50, false);
        expect(locFormat).toBe(1); // long format
        break;
      }
    }
  });

  it('output maxp numGlyphs matches actual glyph count', () => {
    const original = buildTestTTF();
    const result = subsetTrueTypeFont(original, new Set([2, 4])); // A + C
    const subInfo = parseTrueType(result.bytes);
    // .notdef + A + C = 3 glyphs
    expect(subInfo.numGlyphs).toBe(3);
  });

  it('head checksumAdjustment is computed', () => {
    const original = buildTestTTF();
    const result = subsetTrueTypeFont(original, new Set([2]));
    const data = new DataView(
      result.bytes.buffer,
      result.bytes.byteOffset,
      result.bytes.byteLength,
    );
    // Find head table
    const numTables = data.getUint16(4, false);
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      const tag = String.fromCharCode(
        result.bytes[rec], result.bytes[rec + 1],
        result.bytes[rec + 2], result.bytes[rec + 3],
      );
      if (tag === 'head') {
        const offset = data.getUint32(rec + 8, false);
        const checksumAdj = data.getUint32(offset + 8, false);
        // Should be non-zero (computed)
        expect(checksumAdj).not.toBe(0);
        break;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// CIDToGIDMap correctness
// ---------------------------------------------------------------------------

describe('TrueTypeSubsetter — CIDToGIDMap', () => {
  it('glyphMapping can be used to build correct CIDToGIDMap', () => {
    const original = buildTestTTF();
    const origInfo = parseTrueType(original);

    // Subset to A (glyph 2) and B (glyph 3)
    const result = subsetTrueTypeFont(original, new Set([2, 3]));

    // For CIDToGIDMap: for each codepoint the PDF uses, we need
    // old glyph ID -> new glyph ID mapping
    // A: old cmap gives U+0041 -> old glyph 2
    //    glyphMapping says old 2 -> new 1
    // B: old cmap gives U+0042 -> old glyph 3
    //    glyphMapping says old 3 -> new 2
    expect(result.glyphMapping.get(origInfo.cmap.get(0x0041)!)).toBe(1);
    expect(result.glyphMapping.get(origInfo.cmap.get(0x0042)!)).toBe(2);
  });

  it('glyphMapping is consistent with subset cmap', () => {
    const original = buildTestTTF();
    const result = subsetTrueTypeFont(original, new Set([2, 4])); // A and C
    const subInfo = parseTrueType(result.bytes);

    // The subset cmap should map unicode -> new glyph ID
    // A: U+0041 -> new glyph 1 (via glyphMapping: old 2 -> new 1)
    expect(subInfo.cmap.get(0x0041)).toBe(result.glyphMapping.get(2));
    // C: U+0043 -> new glyph 2 (via glyphMapping: old 4 -> new 2)
    expect(subInfo.cmap.get(0x0043)).toBe(result.glyphMapping.get(4));
  });
});

// ---------------------------------------------------------------------------
// Font structure integrity
// ---------------------------------------------------------------------------

describe('TrueTypeSubsetter — structural integrity', () => {
  it('hhea numberOfHMetrics equals numGlyphs', () => {
    const original = buildTestTTF();
    const result = subsetTrueTypeFont(original, new Set([2, 3]));
    const data = new DataView(
      result.bytes.buffer,
      result.bytes.byteOffset,
      result.bytes.byteLength,
    );
    // Find hhea table
    const numTables = data.getUint16(4, false);
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      const tag = String.fromCharCode(
        result.bytes[rec], result.bytes[rec + 1],
        result.bytes[rec + 2], result.bytes[rec + 3],
      );
      if (tag === 'hhea') {
        const offset = data.getUint32(rec + 8, false);
        const numHMetrics = data.getUint16(offset + 34, false);
        const subInfo = parseTrueType(result.bytes);
        expect(numHMetrics).toBe(subInfo.numGlyphs);
        break;
      }
    }
  });

  it('loca table has numGlyphs+1 entries', () => {
    const original = buildTestTTF();
    const result = subsetTrueTypeFont(original, new Set([2])); // .notdef + A = 2 glyphs
    const data = new DataView(
      result.bytes.buffer,
      result.bytes.byteOffset,
      result.bytes.byteLength,
    );
    // Find loca table
    const numTables = data.getUint16(4, false);
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      const tag = String.fromCharCode(
        result.bytes[rec], result.bytes[rec + 1],
        result.bytes[rec + 2], result.bytes[rec + 3],
      );
      if (tag === 'loca') {
        const length = data.getUint32(rec + 12, false);
        // long format: 4 bytes per entry, numGlyphs+1 = 3 entries = 12 bytes
        expect(length).toBe(3 * 4);
        break;
      }
    }
  });

  it('table offsets are 4-byte aligned', () => {
    const original = buildTestTTF();
    const result = subsetTrueTypeFont(original, new Set([2, 3, 4]));
    const data = new DataView(
      result.bytes.buffer,
      result.bytes.byteOffset,
      result.bytes.byteLength,
    );
    const numTables = data.getUint16(4, false);
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      const offset = data.getUint32(rec + 8, false);
      expect(offset % 4).toBe(0);
    }
  });

  it('OS/2 table is preserved in subset', () => {
    const original = buildTestTTF();
    const result = subsetTrueTypeFont(original, new Set([2]));
    const data = new DataView(
      result.bytes.buffer,
      result.bytes.byteOffset,
      result.bytes.byteLength,
    );
    const numTables = data.getUint16(4, false);
    let hasOS2 = false;
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      const tag = String.fromCharCode(
        result.bytes[rec], result.bytes[rec + 1],
        result.bytes[rec + 2], result.bytes[rec + 3],
      );
      if (tag === 'OS/2') {
        hasOS2 = true;
        break;
      }
    }
    expect(hasOS2).toBe(true);
  });

  it('name table is preserved in subset', () => {
    const original = buildTestTTF();
    const result = subsetTrueTypeFont(original, new Set([2]));
    const subInfo = parseTrueType(result.bytes);
    // PostScript name should be preserved
    expect(subInfo.postScriptName).toBe('SubsetTestFont');
  });

  it('post table is format 3.0 (no glyph names)', () => {
    const original = buildTestTTF();
    const result = subsetTrueTypeFont(original, new Set([2]));
    const data = new DataView(
      result.bytes.buffer,
      result.bytes.byteOffset,
      result.bytes.byteLength,
    );
    const numTables = data.getUint16(4, false);
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      const tag = String.fromCharCode(
        result.bytes[rec], result.bytes[rec + 1],
        result.bytes[rec + 2], result.bytes[rec + 3],
      );
      if (tag === 'post') {
        const offset = data.getUint32(rec + 8, false);
        const version = data.getUint32(offset, false);
        expect(version).toBe(0x00030000); // 3.0
        break;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Multiple subsets of same font
// ---------------------------------------------------------------------------

describe('TrueTypeSubsetter — multiple subsets', () => {
  it('different subsets of same font produce different results', () => {
    const original = buildTestTTF();
    const result1 = subsetTrueTypeFont(original, new Set([2]));    // A only
    const result2 = subsetTrueTypeFont(original, new Set([2, 3])); // A + B
    expect(result1.bytes.length).not.toBe(result2.bytes.length);
    const info1 = parseTrueType(result1.bytes);
    const info2 = parseTrueType(result2.bytes);
    expect(info1.numGlyphs).toBe(2);
    expect(info2.numGlyphs).toBe(3);
  });

  it('subset is idempotent (subsetting a subset produces same result)', () => {
    const original = buildTestTTF();
    const result1 = subsetTrueTypeFont(original, new Set([2, 3]));

    // Now subset the subsetted font — request new glyph IDs 1 and 2
    // (which are A and B in the subsetted font)
    const result2 = subsetTrueTypeFont(result1.bytes, new Set([1, 2]));
    const info2 = parseTrueType(result2.bytes);
    expect(info2.numGlyphs).toBe(3); // .notdef + 2 glyphs
  });
});
