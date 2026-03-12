/**
 * font-table-builder.ts — Pure-TS builders for OpenType/TrueType tables.
 *
 * Builds binary representations of font tables needed to fix PDF-embedded
 * subsetted fonts for canvas registration:
 *
 * - **cmap format 4** — Unicode BMP → glyph ID mapping
 * - **name** — family/subfamily/postScript name entries
 * - **OS/2** — required by FreeType (node-canvas), synthesized from hhea metrics
 * - **post** — minimal PostScript names table
 *
 * These tables are used by font-patcher.ts to rebuild PDF-embedded fonts
 * into valid files that both node-canvas (FreeType) and FontFace API accept.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Write a big-endian uint16 into a buffer at the given offset. */
function writeUint16(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >> 8) & 0xff;
  buf[offset + 1] = value & 0xff;
}

/** Write a big-endian int16 into a buffer at the given offset. */
function writeInt16(buf: Uint8Array, offset: number, value: number): void {
  if (value < 0) value += 0x10000;
  writeUint16(buf, offset, value);
}

/** Write a big-endian uint32 into a buffer at the given offset. */
function writeUint32(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >> 24) & 0xff;
  buf[offset + 1] = (value >> 16) & 0xff;
  buf[offset + 2] = (value >> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

// ---------------------------------------------------------------------------
// cmap format 4 builder
// ---------------------------------------------------------------------------

/**
 * Build a cmap table containing a single format 4 subtable (platform 3, encoding 1).
 *
 * @param unicodeToGlyph Map from Unicode code point → glyph ID
 * @returns Raw cmap table bytes
 */
export function buildCmapTable(unicodeToGlyph: Map<number, number>): Uint8Array {
  // Sort entries by Unicode code point
  const entries = [...unicodeToGlyph.entries()]
    .filter(([cp, gid]) => cp >= 0 && cp <= 0xffff && gid > 0)
    .sort((a, b) => a[0] - b[0]);

  // Build segments for format 4
  const segments: Array<{
    startCode: number;
    endCode: number;
    glyphIds: number[];
  }> = [];

  for (const [cp, gid] of entries) {
    const last = segments[segments.length - 1];
    if (last && cp === last.endCode + 1) {
      last.endCode = cp;
      last.glyphIds.push(gid);
    } else {
      segments.push({ startCode: cp, endCode: cp, glyphIds: [gid] });
    }
  }

  // Add sentinel segment (0xFFFF → 0xFFFF)
  segments.push({ startCode: 0xffff, endCode: 0xffff, glyphIds: [1] });

  const segCount = segments.length;

  // Determine if each segment can use idDelta (contiguous glyph IDs) or needs idRangeOffset
  interface Segment4 {
    startCode: number;
    endCode: number;
    idDelta: number;
    useRangeOffset: boolean;
    glyphIds: number[];
  }
  const seg4: Segment4[] = segments.map((s) => {
    // Check if glyph IDs are contiguous (delta encoding)
    let contiguous = true;
    const delta = s.glyphIds[0] - s.startCode;
    for (let i = 1; i < s.glyphIds.length; i++) {
      if (s.glyphIds[i] - (s.startCode + i) !== delta) {
        contiguous = false;
        break;
      }
    }
    return {
      startCode: s.startCode,
      endCode: s.endCode,
      idDelta: contiguous ? delta : 0,
      useRangeOffset: !contiguous,
      glyphIds: s.glyphIds,
    };
  });

  // Calculate glyphIdArray for segments that need idRangeOffset
  const glyphIdArrayEntries: number[] = [];
  const rangeOffsets: number[] = [];
  for (let i = 0; i < seg4.length; i++) {
    const s = seg4[i];
    if (s.useRangeOffset) {
      // Offset from the idRangeOffset entry to the start of this segment's glyph IDs
      // in the glyphIdArray. The formula:
      // idRangeOffset = (remaining segments before glyphIdArray + current glyphIdArray position) * 2
      const remaining = segCount - i;
      const offset = (remaining + glyphIdArrayEntries.length) * 2;
      rangeOffsets.push(offset);
      glyphIdArrayEntries.push(...s.glyphIds);
    } else {
      rangeOffsets.push(0);
    }
  }

  // Format 4 subtable size
  const format4HeaderSize = 14; // format(2) + length(2) + language(2) + segCountX2(2) + searchRange(2) + entrySelector(2) + rangeShift(2)
  const segArraysSize = segCount * 2 * 4 + 2; // endCode[segCount] + reservedPad(2) + startCode[segCount] + idDelta[segCount] + idRangeOffset[segCount]
  const glyphIdArraySize = glyphIdArrayEntries.length * 2;
  const format4Size = format4HeaderSize + segArraysSize + glyphIdArraySize;

  // cmap header: version(2) + numTables(2) + encoding record(8)
  const cmapHeaderSize = 4 + 8;
  const totalSize = cmapHeaderSize + format4Size;
  const buf = new Uint8Array(totalSize);

  // cmap header
  writeUint16(buf, 0, 0); // version
  writeUint16(buf, 2, 1); // numTables = 1

  // Encoding record: platform 3 (Windows), encoding 1 (Unicode BMP)
  writeUint16(buf, 4, 3); // platformID
  writeUint16(buf, 6, 1); // encodingID
  writeUint32(buf, 8, 12); // offset to subtable (right after header)

  // Format 4 subtable
  let off = 12;
  writeUint16(buf, off, 4); // format
  writeUint16(buf, off + 2, format4Size); // length
  writeUint16(buf, off + 4, 0); // language

  const segCountX2 = segCount * 2;
  writeUint16(buf, off + 6, segCountX2);

  // searchRange, entrySelector, rangeShift
  let searchRange = 1;
  let entrySelector = 0;
  while (searchRange * 2 <= segCount) {
    searchRange *= 2;
    entrySelector++;
  }
  searchRange *= 2;
  writeUint16(buf, off + 8, searchRange);
  writeUint16(buf, off + 10, entrySelector);
  writeUint16(buf, off + 12, segCountX2 - searchRange);

  off += 14;

  // endCode array
  for (const s of seg4) {
    writeUint16(buf, off, s.endCode);
    off += 2;
  }
  // reservedPad
  writeUint16(buf, off, 0);
  off += 2;

  // startCode array
  for (const s of seg4) {
    writeUint16(buf, off, s.startCode);
    off += 2;
  }

  // idDelta array
  for (const s of seg4) {
    writeInt16(buf, off, s.idDelta);
    off += 2;
  }

  // idRangeOffset array
  for (const r of rangeOffsets) {
    writeUint16(buf, off, r);
    off += 2;
  }

  // glyphIdArray
  for (const gid of glyphIdArrayEntries) {
    writeUint16(buf, off, gid);
    off += 2;
  }

  return buf;
}

// ---------------------------------------------------------------------------
// name table builder
// ---------------------------------------------------------------------------

/**
 * Build a minimal name table with family (nameID 1), subfamily (nameID 2),
 * and PostScript name (nameID 6).
 *
 * Uses platform 3 (Windows), encoding 1 (Unicode BMP), language 0x0409 (English US).
 */
export function buildNameTable(family: string, postScriptName?: string): Uint8Array {
  const psName = postScriptName ?? family;

  // Encode strings as UTF-16BE
  const familyBytes = encodeUtf16BE(family);
  const regularBytes = encodeUtf16BE('Regular');
  const psNameBytes = encodeUtf16BE(psName);

  const records = [
    { nameID: 1, data: familyBytes },
    { nameID: 2, data: regularBytes },
    { nameID: 6, data: psNameBytes },
  ];

  // name table header: format(2) + count(2) + stringOffset(2) = 6
  // Each name record: 12 bytes
  const headerSize = 6 + records.length * 12;
  const dataSize = records.reduce((sum, r) => sum + r.data.length, 0);
  const buf = new Uint8Array(headerSize + dataSize);

  writeUint16(buf, 0, 0); // format
  writeUint16(buf, 2, records.length); // count
  writeUint16(buf, 4, headerSize); // stringOffset

  let strOffset = 0;
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const off = 6 + i * 12;
    writeUint16(buf, off, 3); // platformID = Windows
    writeUint16(buf, off + 2, 1); // encodingID = Unicode BMP
    writeUint16(buf, off + 4, 0x0409); // languageID = English US
    writeUint16(buf, off + 6, rec.nameID);
    writeUint16(buf, off + 8, rec.data.length);
    writeUint16(buf, off + 10, strOffset);
    buf.set(rec.data, headerSize + strOffset);
    strOffset += rec.data.length;
  }

  return buf;
}

function encodeUtf16BE(str: string): Uint8Array {
  const buf = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    buf[i * 2] = (code >> 8) & 0xff;
    buf[i * 2 + 1] = code & 0xff;
  }
  return buf;
}

// ---------------------------------------------------------------------------
// OS/2 table builder
// ---------------------------------------------------------------------------

/**
 * Build a minimal OS/2 version 4 table (78 bytes).
 *
 * @param ascender  sTypoAscender (from hhea if no OS/2 exists)
 * @param descender sTypoDescender (negative)
 * @param usWeightClass Weight class (400 = normal)
 */
export function buildOS2Table(
  ascender: number,
  descender: number,
  usWeightClass = 400,
): Uint8Array {
  const buf = new Uint8Array(78);
  const view = new DataView(buf.buffer);

  view.setUint16(0, 4); // version
  // xAvgCharWidth (2) = 0
  view.setUint16(4, usWeightClass); // usWeightClass
  view.setUint16(6, 5); // usWidthClass = medium
  // fsType (8) = 0 (installable)
  // ySubscript/Superscript (10-24) = 0
  // yStrikeout (26-28) = 0
  // sFamilyClass (30) = 0
  // panose (32-41) = 0
  // ulUnicodeRange1-4 (42-57) = 0
  // achVendID (58) = 0x20202020
  buf[58] = 0x20; buf[59] = 0x20; buf[60] = 0x20; buf[61] = 0x20;
  view.setUint16(62, 0x0040); // fsSelection = REGULAR
  // usFirstCharIndex (64) = 0
  view.setUint16(66, 0xffff); // usLastCharIndex
  view.setInt16(68, ascender); // sTypoAscender
  view.setInt16(70, descender); // sTypoDescender
  view.setInt16(72, 0); // sTypoLineGap
  view.setUint16(74, Math.max(0, ascender)); // usWinAscent
  view.setUint16(76, Math.max(0, -descender)); // usWinDescent

  return buf;
}

// ---------------------------------------------------------------------------
// post table builder
// ---------------------------------------------------------------------------

/**
 * Build a minimal post table (version 3.0 = no glyph names, 32 bytes).
 */
export function buildPostTable(italicAngle = 0, isFixedPitch = false): Uint8Array {
  const buf = new Uint8Array(32);
  const view = new DataView(buf.buffer);

  // version 3.0 (no glyph names needed)
  view.setUint32(0, 0x00030000);
  // italicAngle as Fixed 16.16
  const fixed = Math.round(italicAngle * 65536);
  view.setInt32(4, fixed);
  // underlinePosition (8) = 0
  // underlineThickness (10) = 0
  view.setUint32(12, isFixedPitch ? 1 : 0); // isFixedPitch
  // minMemType42 (16) = 0
  // maxMemType42 (20) = 0
  // minMemType1 (24) = 0
  // maxMemType1 (28) = 0

  return buf;
}

// ---------------------------------------------------------------------------
// head table builder (for CFF wrapping)
// ---------------------------------------------------------------------------

/**
 * Build a head table for CFF OTF wrapping.
 */
export function buildHeadTable(
  unitsPerEm: number,
  bbox: [number, number, number, number],
): Uint8Array {
  const buf = new Uint8Array(54);
  const view = new DataView(buf.buffer);

  view.setUint32(0, 0x00010000); // majorVersion.minorVersion = 1.0
  view.setUint32(4, 0x00005000); // fontRevision = 5.0
  // checksumAdjustment (8) = 0 (computed later or ignored)
  view.setUint32(12, 0x5f0f3cf5); // magicNumber
  view.setUint16(16, 0x000b); // flags (baseline at y=0, lsb at x=0, etc)
  view.setUint16(18, unitsPerEm);
  // created (20-27) = 0
  // modified (28-35) = 0
  view.setInt16(36, bbox[0]); // xMin
  view.setInt16(38, bbox[1]); // yMin
  view.setInt16(40, bbox[2]); // xMax
  view.setInt16(42, bbox[3]); // yMax
  // macStyle (44) = 0
  view.setUint16(46, 8); // lowestRecPPEM
  view.setInt16(48, 2); // fontDirectionHint
  view.setInt16(50, 1); // indexToLocFormat = long
  view.setInt16(52, 0); // glyphDataFormat

  return buf;
}

// ---------------------------------------------------------------------------
// hhea table builder (for CFF wrapping)
// ---------------------------------------------------------------------------

/**
 * Build an hhea table.
 */
export function buildHheaTable(
  ascender: number,
  descender: number,
  numberOfHMetrics: number,
): Uint8Array {
  const buf = new Uint8Array(36);
  const view = new DataView(buf.buffer);

  view.setUint32(0, 0x00010000); // majorVersion.minorVersion = 1.0
  view.setInt16(4, ascender);
  view.setInt16(6, descender);
  // lineGap (8) = 0
  // advanceWidthMax (10) = 0 (could compute but not critical)
  // minLeftSideBearing (12) = 0
  // minRightSideBearing (14) = 0
  // xMaxExtent (16) = 0
  // caretSlopeRise (18) = 1
  view.setInt16(18, 1);
  // caretSlopeRun (20) = 0
  // caretOffset (22) = 0
  // reserved (24-30) = 0
  // metricDataFormat (32) = 0
  view.setUint16(34, numberOfHMetrics);

  return buf;
}

// ---------------------------------------------------------------------------
// hmtx table builder (for CFF wrapping)
// ---------------------------------------------------------------------------

/**
 * Build an hmtx table from advance widths.
 * Each entry is advanceWidth(u16) + lsb(i16=0).
 */
export function buildHmtxTable(advanceWidths: Uint16Array, numGlyphs: number): Uint8Array {
  const count = Math.min(advanceWidths.length, numGlyphs);
  const buf = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    writeUint16(buf, i * 4, advanceWidths[i] ?? 0);
    // lsb = 0
  }
  return buf;
}

// ---------------------------------------------------------------------------
// maxp table builder (for CFF wrapping)
// ---------------------------------------------------------------------------

/**
 * Build a maxp table for CFF fonts (version 0.5, 6 bytes).
 */
export function buildMaxpTable(numGlyphs: number): Uint8Array {
  const buf = new Uint8Array(6);
  writeUint16(buf, 0, 0x0000); // version 0.5 (high word)
  writeUint16(buf, 2, 0x5000); // version 0.5 (low word)
  writeUint16(buf, 4, numGlyphs);
  return buf;
}

// ---------------------------------------------------------------------------
// sfnt table assembly
// ---------------------------------------------------------------------------

/** A single table for sfnt assembly. */
export interface FontTable {
  tag: string;
  data: Uint8Array;
}

/**
 * Assemble multiple tables into a complete sfnt font binary.
 *
 * @param tables Array of {tag, data} tables
 * @param sfntVersion The sfnt version: 0x00010000 for TrueType, 0x4F54544F for CFF (OTTO)
 * @returns Complete font file bytes
 */
export function assembleSfnt(tables: FontTable[], sfntVersion: number): Uint8Array {
  const numTables = tables.length;

  // Calculate searchRange, entrySelector, rangeShift
  let searchRange = 1;
  let entrySelector = 0;
  while (searchRange * 2 <= numTables) {
    searchRange *= 2;
    entrySelector++;
  }
  searchRange *= 16;
  const rangeShift = numTables * 16 - searchRange;

  // Header (12 bytes) + table directory (numTables * 16 bytes)
  const headerSize = 12 + numTables * 16;

  // Calculate total size with 4-byte alignment padding
  let dataOffset = headerSize;
  const tableEntries: Array<{ tag: string; data: Uint8Array; offset: number }> = [];
  for (const t of tables) {
    tableEntries.push({ tag: t.tag, data: t.data, offset: dataOffset });
    dataOffset += (t.data.length + 3) & ~3; // 4-byte aligned
  }

  const totalSize = dataOffset;
  const buf = new Uint8Array(totalSize);

  // Write sfnt header
  writeUint32(buf, 0, sfntVersion);
  writeUint16(buf, 4, numTables);
  writeUint16(buf, 6, searchRange);
  writeUint16(buf, 8, entrySelector);
  writeUint16(buf, 10, rangeShift);

  // Write table directory and table data
  for (let i = 0; i < tableEntries.length; i++) {
    const entry = tableEntries[i];
    const dirOff = 12 + i * 16;

    // Tag (4 ASCII bytes)
    for (let j = 0; j < 4; j++) {
      buf[dirOff + j] = entry.tag.charCodeAt(j);
    }

    // Checksum
    const checksum = computeTableChecksum(entry.data);
    writeUint32(buf, dirOff + 4, checksum);

    // Offset
    writeUint32(buf, dirOff + 8, entry.offset);

    // Length (original, not padded)
    writeUint32(buf, dirOff + 12, entry.data.length);

    // Copy table data
    buf.set(entry.data, entry.offset);
  }

  return buf;
}

/**
 * Compute the OpenType checksum for a table.
 */
function computeTableChecksum(data: Uint8Array): number {
  let sum = 0;
  // Pad to 4-byte boundary
  const padded = (data.length + 3) & ~3;
  for (let i = 0; i < padded; i += 4) {
    sum =
      (sum +
        ((data[i] ?? 0) << 24) +
        ((data[i + 1] ?? 0) << 16) +
        ((data[i + 2] ?? 0) << 8) +
        (data[i + 3] ?? 0)) >>>
      0;
  }
  return sum;
}
