/**
 * TrueTypeSubsetter — produces a minimal valid TrueType font containing
 * only the glyphs actually used in the document.
 *
 * Input:  original TTF bytes + Set<number> of used glyph IDs (from cmap lookup)
 * Output: subsetted TTF bytes (valid TTF file)
 *
 * Tables rebuilt: head, hhea, hmtx, maxp, loca, glyf, cmap, post, OS/2, name.
 * Composite glyph dependencies are recursively resolved.
 * Glyph 0 (.notdef) is always included.
 *
 * The output includes a glyph ID mapping (old -> new) and a subset tag prefix
 * (6 uppercase letters + '+') suitable for the PDF /BaseFont name.
 */

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface SubsetResult {
  /** Subsetted TTF bytes — valid TrueType font file. */
  bytes: Uint8Array;
  /** Mapping from old glyph ID to new (contiguous) glyph ID. */
  glyphMapping: Map<number, number>;
  /** 6-char uppercase subset tag, e.g. "ABCDEF". No "+" included. */
  subsetTag: string;
}

// ---------------------------------------------------------------------------
// DataView helpers (big-endian, matching TrueTypeParser)
// ---------------------------------------------------------------------------

function getU16(d: DataView, o: number): number { return d.getUint16(o, false); }
function getI16(d: DataView, o: number): number { return d.getInt16(o, false); }
function getU32(d: DataView, o: number): number { return d.getUint32(o, false); }

// ---------------------------------------------------------------------------
// Table directory parsing
// ---------------------------------------------------------------------------

interface RawTable {
  tag: string;
  checksum: number;
  offset: number;
  length: number;
}

function readTableDirectory(data: DataView, bytes: Uint8Array): Map<string, RawTable> {
  const numTables = getU16(data, 4);
  const tables = new Map<string, RawTable>();
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (rec + 16 > bytes.length) break;
    const tag = String.fromCharCode(bytes[rec], bytes[rec + 1], bytes[rec + 2], bytes[rec + 3]);
    tables.set(tag, {
      tag,
      checksum: getU32(data, rec + 4),
      offset: getU32(data, rec + 8),
      length: getU32(data, rec + 12),
    });
  }
  return tables;
}

// ---------------------------------------------------------------------------
// Glyph data helpers
// ---------------------------------------------------------------------------

/** Read glyph byte-offsets from the `loca` table. */
function readLocaOffsets(
  data: DataView,
  locaTable: RawTable,
  numGlyphs: number,
  isLong: boolean,
): Uint32Array {
  // loca has numGlyphs+1 entries
  const offsets = new Uint32Array(numGlyphs + 1);
  for (let i = 0; i <= numGlyphs; i++) {
    if (isLong) {
      offsets[i] = getU32(data, locaTable.offset + i * 4);
    } else {
      offsets[i] = getU16(data, locaTable.offset + i * 2) * 2; // short format stores offset/2
    }
  }
  return offsets;
}

/** Composite glyph flags */
const ARG_1_AND_2_ARE_WORDS = 0x0001;
const MORE_COMPONENTS       = 0x0020;
const WE_HAVE_A_SCALE       = 0x0008;
const WE_HAVE_AN_X_AND_Y_SCALE = 0x0040;
const WE_HAVE_A_TWO_BY_TWO = 0x0080;

/**
 * Extract component glyph IDs referenced by a composite glyph.
 * Also returns the byte offsets within the glyph data where each component's
 * glyph ID is stored, so we can patch them during remapping.
 */
function getCompositeComponents(
  glyfBytes: Uint8Array,
  glyphOffset: number,
  glyphLength: number,
): { componentGlyphIds: number[]; glyphIdOffsets: number[] } {
  if (glyphLength < 12) return { componentGlyphIds: [], glyphIdOffsets: [] };

  const d = new DataView(glyfBytes.buffer, glyfBytes.byteOffset, glyfBytes.byteLength);
  const numberOfContours = d.getInt16(glyphOffset, false);
  if (numberOfContours >= 0) {
    // Simple glyph — no components
    return { componentGlyphIds: [], glyphIdOffsets: [] };
  }

  // Composite glyph: skip header (10 bytes: numberOfContours + xMin/yMin/xMax/yMax)
  let cursor = glyphOffset + 10;
  const componentGlyphIds: number[] = [];
  const glyphIdOffsets: number[] = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (cursor + 4 > glyphOffset + glyphLength) break;

    const flags = d.getUint16(cursor, false);
    const glyphIdOffset = cursor + 2;
    const componentGlyphId = d.getUint16(glyphIdOffset, false);
    componentGlyphIds.push(componentGlyphId);
    glyphIdOffsets.push(glyphIdOffset);

    cursor += 4; // flags + glyphIndex

    // Advance past arguments
    if (flags & ARG_1_AND_2_ARE_WORDS) {
      cursor += 4; // 2 x int16
    } else {
      cursor += 2; // 2 x uint8
    }

    // Advance past transform
    if (flags & WE_HAVE_A_SCALE) {
      cursor += 2; // F2Dot14
    } else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) {
      cursor += 4; // 2 x F2Dot14
    } else if (flags & WE_HAVE_A_TWO_BY_TWO) {
      cursor += 8; // 4 x F2Dot14
    }

    if (!(flags & MORE_COMPONENTS)) break;
  }

  return { componentGlyphIds, glyphIdOffsets };
}

// ---------------------------------------------------------------------------
// Subset tag generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic 6-char uppercase tag from the set of glyph IDs.
 * Uses a simple hash so the tag is reproducible for the same glyph set.
 */
function generateSubsetTag(glyphIds: Set<number>): string {
  // Simple FNV-1a-like hash over the sorted glyph IDs
  let hash = 0x811c9dc5; // FNV offset basis
  const sorted = Array.from(glyphIds).sort((a, b) => a - b);
  for (const id of sorted) {
    hash ^= (id & 0xFF);
    hash = Math.imul(hash, 0x01000193); // FNV prime
    hash ^= ((id >> 8) & 0xFF);
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert to 6 uppercase letters
  const tag: string[] = [];
  let h = hash >>> 0; // ensure unsigned
  for (let i = 0; i < 6; i++) {
    tag.push(String.fromCharCode(65 + (h % 26))); // A-Z
    h = Math.floor(h / 26);
  }
  return tag.join('');
}

// ---------------------------------------------------------------------------
// Table checksum computation
// ---------------------------------------------------------------------------

function calcTableChecksum(data: Uint8Array, offset: number, length: number): number {
  let sum = 0;
  const nLongs = Math.ceil(length / 4);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < nLongs; i++) {
    const byteOff = offset + i * 4;
    // Avoid reading past buffer end — pad with zeros
    if (byteOff + 4 <= data.length) {
      sum = (sum + view.getUint32(byteOff, false)) >>> 0;
    } else {
      // Partial last long — read available bytes, zero-pad
      let val = 0;
      for (let b = 0; b < 4; b++) {
        val <<= 8;
        if (byteOff + b < data.length) {
          val |= data[byteOff + b];
        }
      }
      sum = (sum + (val >>> 0)) >>> 0;
    }
  }
  return sum >>> 0;
}

// ---------------------------------------------------------------------------
// Writer helpers
// ---------------------------------------------------------------------------

class BinaryWriter {
  private _buf: Uint8Array;
  private _view: DataView;
  pos = 0;

  constructor(initialSize: number = 65536) {
    this._buf = new Uint8Array(initialSize);
    this._view = new DataView(this._buf.buffer);
  }

  private _grow(needed: number): void {
    if (this.pos + needed <= this._buf.length) return;
    let newLen = this._buf.length * 2;
    while (newLen < this.pos + needed) newLen *= 2;
    const newBuf = new Uint8Array(newLen);
    newBuf.set(this._buf);
    this._buf = newBuf;
    this._view = new DataView(this._buf.buffer);
  }

  writeU8(v: number): void  { this._grow(1); this._buf[this.pos++] = v & 0xFF; }
  writeU16(v: number): void { this._grow(2); this._view.setUint16(this.pos, v, false); this.pos += 2; }
  writeI16(v: number): void { this._grow(2); this._view.setInt16(this.pos, v, false); this.pos += 2; }
  writeU32(v: number): void { this._grow(4); this._view.setUint32(this.pos, v, false); this.pos += 4; }
  writeI32(v: number): void { this._grow(4); this._view.setInt32(this.pos, v, false); this.pos += 4; }

  writeBytes(src: Uint8Array, srcOffset: number, length: number): void {
    this._grow(length);
    this._buf.set(src.subarray(srcOffset, srcOffset + length), this.pos);
    this.pos += length;
  }

  /** Write raw bytes from an array of numbers. */
  writeRawBytes(arr: Uint8Array): void {
    this._grow(arr.length);
    this._buf.set(arr, this.pos);
    this.pos += arr.length;
  }

  /** Pad to 4-byte alignment with zero bytes. */
  padTo4(): void {
    while (this.pos % 4 !== 0) this.writeU8(0);
  }

  /** Patch a uint16 at an absolute position (does not move pos). */
  patchU16(offset: number, value: number): void {
    this._view.setUint16(offset, value, false);
  }

  /** Patch a uint32 at an absolute position (does not move pos). */
  patchU32(offset: number, value: number): void {
    this._view.setUint32(offset, value, false);
  }

  /** Return the written bytes (trimmed to pos). */
  toUint8Array(): Uint8Array {
    return this._buf.slice(0, this.pos);
  }

  /** Return a DataView over the written portion. */
  getView(): DataView {
    return new DataView(this._buf.buffer, 0, this.pos);
  }
}

// ---------------------------------------------------------------------------
// cmap format 4 builder
// ---------------------------------------------------------------------------

/**
 * Build a cmap format 4 subtable for the given unicode->newGlyphId mapping.
 */
function buildCmapFormat4(unicodeToGlyph: Map<number, number>): Uint8Array {
  // Sort entries by unicode codepoint
  const entries = Array.from(unicodeToGlyph.entries()).sort((a, b) => a[0] - b[0]);

  if (entries.length === 0) {
    // Just the sentinel segment
    return buildCmapFormat4Segments([{ startCode: 0xFFFF, endCode: 0xFFFF, delta: 1, rangeOffset: 0 }]);
  }

  // Group into contiguous ranges where delta is constant
  interface Segment {
    startCode: number;
    endCode: number;
    delta: number;
    rangeOffset: number;
  }

  const segments: Segment[] = [];
  let segStart = entries[0][0];
  let segDelta = entries[0][1] - entries[0][0];
  let segEnd = entries[0][0];

  for (let i = 1; i < entries.length; i++) {
    const [code, glyph] = entries[i];
    const delta = glyph - code;
    if (code === segEnd + 1 && delta === segDelta) {
      segEnd = code;
    } else {
      segments.push({
        startCode: segStart,
        endCode: segEnd,
        delta: segDelta & 0xFFFF,
        rangeOffset: 0,
      });
      segStart = code;
      segDelta = delta;
      segEnd = code;
    }
  }
  segments.push({
    startCode: segStart,
    endCode: segEnd,
    delta: segDelta & 0xFFFF,
    rangeOffset: 0,
  });

  // Add sentinel
  segments.push({ startCode: 0xFFFF, endCode: 0xFFFF, delta: 1, rangeOffset: 0 });

  return buildCmapFormat4Segments(segments);
}

interface CmapSegment {
  startCode: number;
  endCode: number;
  delta: number;
  rangeOffset: number;
}

function buildCmapFormat4Segments(segments: CmapSegment[]): Uint8Array {
  const segCount = segments.length;
  const pow2 = Math.pow(2, Math.floor(Math.log2(segCount)));
  const searchRange = pow2 * 2;
  const entrySelector = Math.floor(Math.log2(segCount));
  const rangeShift = segCount * 2 - searchRange;

  const w = new BinaryWriter(256);

  // Format 4 header
  w.writeU16(4);              // format
  const lengthPos = w.pos;
  w.writeU16(0);              // length (placeholder)
  w.writeU16(0);              // language
  w.writeU16(segCount * 2);   // segCountX2
  w.writeU16(searchRange);
  w.writeU16(entrySelector);
  w.writeU16(rangeShift);

  // endCode[]
  for (const seg of segments) w.writeU16(seg.endCode);
  w.writeU16(0); // reservedPad
  // startCode[]
  for (const seg of segments) w.writeU16(seg.startCode);
  // idDelta[]
  for (const seg of segments) w.writeI16(seg.delta);
  // idRangeOffset[]
  for (const seg of segments) w.writeU16(seg.rangeOffset);

  // Patch length
  const totalLen = w.pos - 0; // from start of format field
  w.patchU16(lengthPos, totalLen);

  return w.toUint8Array();
}

// ---------------------------------------------------------------------------
// Main subsetting function
// ---------------------------------------------------------------------------

/**
 * Subset a TrueType font to include only the specified glyph IDs.
 *
 * @param originalBytes - Full original TTF file bytes
 * @param usedGlyphIds  - Set of glyph IDs to keep (from cmap lookup).
 *                        Glyph 0 (.notdef) is always included automatically.
 * @returns SubsetResult with subsetted bytes, glyph mapping, and subset tag
 */
export function subsetTrueTypeFont(
  originalBytes: Uint8Array,
  usedGlyphIds: Set<number>,
): SubsetResult {
  const data = new DataView(
    originalBytes.buffer,
    originalBytes.byteOffset,
    originalBytes.byteLength,
  );
  const tables = readTableDirectory(data, originalBytes);

  // Required tables
  const headT = tables.get('head');
  const hheaT = tables.get('hhea');
  const hmtxT = tables.get('hmtx');
  const maxpT = tables.get('maxp');
  const cmapT = tables.get('cmap');
  const locaT = tables.get('loca');
  const glyfT = tables.get('glyf');
  const postT = tables.get('post');
  const nameT = tables.get('name');
  const os2T  = tables.get('OS/2');

  if (!headT || !hheaT || !hmtxT || !maxpT || !locaT || !glyfT) {
    throw new Error('TrueType font missing required tables for subsetting (head/hhea/hmtx/maxp/loca/glyf)');
  }

  // Read metrics from original
  const numGlyphsOrig = getU16(data, maxpT.offset + 4);
  const numberOfHMetricsOrig = getU16(data, hheaT.offset + 34);
  const indexToLocFormat = getI16(data, headT.offset + 50); // 0=short, 1=long
  const isLong = indexToLocFormat === 1;

  // Read loca offsets
  const locaOffsets = readLocaOffsets(data, locaT, numGlyphsOrig, isLong);

  // ----- Step 1: Collect all needed glyph IDs (including .notdef + composite deps) -----
  const neededGlyphs = new Set<number>();
  neededGlyphs.add(0); // always include .notdef
  for (const gid of usedGlyphIds) {
    if (gid >= 0 && gid < numGlyphsOrig) {
      neededGlyphs.add(gid);
    }
  }

  // Recursively resolve composite glyph dependencies
  const resolved = new Set<number>();
  const queue = Array.from(neededGlyphs);

  while (queue.length > 0) {
    const gid = queue.pop()!;
    if (resolved.has(gid)) continue;
    resolved.add(gid);

    const glyphStart = locaOffsets[gid];
    const glyphEnd = locaOffsets[gid + 1];
    const glyphLen = glyphEnd - glyphStart;

    if (glyphLen > 0) {
      const { componentGlyphIds } = getCompositeComponents(
        originalBytes,
        glyfT.offset + glyphStart,
        glyphLen,
      );
      for (const compId of componentGlyphIds) {
        if (compId < numGlyphsOrig && !neededGlyphs.has(compId)) {
          neededGlyphs.add(compId);
          queue.push(compId);
        }
      }
    }
  }

  // ----- Step 2: Build old->new glyph ID mapping (sorted, contiguous from 0) -----
  const sortedOldIds = Array.from(neededGlyphs).sort((a, b) => a - b);
  const glyphMapping = new Map<number, number>();
  for (let i = 0; i < sortedOldIds.length; i++) {
    glyphMapping.set(sortedOldIds[i], i);
  }
  const newNumGlyphs = sortedOldIds.length;

  // ----- Step 3: Read original hmtx advance widths -----
  const origAdvanceWidths = new Uint16Array(numGlyphsOrig);
  const origLsbs = new Int16Array(numGlyphsOrig);
  let lastWidth = 0;
  for (let i = 0; i < numGlyphsOrig; i++) {
    if (i < numberOfHMetricsOrig) {
      lastWidth = getU16(data, hmtxT.offset + i * 4);
      origAdvanceWidths[i] = lastWidth;
      origLsbs[i] = getI16(data, hmtxT.offset + i * 4 + 2);
    } else {
      origAdvanceWidths[i] = lastWidth;
      // LSBs for glyphs beyond numberOfHMetrics are stored after the main array
      const lsbIndex = i - numberOfHMetricsOrig;
      origLsbs[i] = getI16(data, hmtxT.offset + numberOfHMetricsOrig * 4 + lsbIndex * 2);
    }
  }

  // ----- Step 4: Build subset glyf table + loca -----
  // Use long loca format always for simplicity (indexToLocFormat = 1)
  const glyfWriter = new BinaryWriter(glyfT.length);
  const newLocaOffsets = new Uint32Array(newNumGlyphs + 1);

  for (let newId = 0; newId < newNumGlyphs; newId++) {
    const oldId = sortedOldIds[newId];
    newLocaOffsets[newId] = glyfWriter.pos;

    const glyphStart = locaOffsets[oldId];
    const glyphEnd = locaOffsets[oldId + 1];
    const glyphLen = glyphEnd - glyphStart;

    if (glyphLen === 0) {
      // Empty glyph (e.g. space) — zero-length entry
      continue;
    }

    // Copy glyph data
    const glyphDataStart = glyfWriter.pos;
    glyfWriter.writeBytes(originalBytes, glyfT.offset + glyphStart, glyphLen);

    // If composite, remap component glyph IDs
    const glyfBuf = glyfWriter.toUint8Array();
    const { componentGlyphIds, glyphIdOffsets } = getCompositeComponents(
      glyfBuf,
      glyphDataStart,
      glyphLen,
    );

    if (componentGlyphIds.length > 0) {
      // We need to patch the glyph IDs in the written data
      const patchView = new DataView(glyfBuf.buffer, glyfBuf.byteOffset, glyfBuf.byteLength);
      for (let c = 0; c < componentGlyphIds.length; c++) {
        const oldCompId = componentGlyphIds[c];
        const newCompId = glyphMapping.get(oldCompId);
        if (newCompId !== undefined) {
          patchView.setUint16(glyphIdOffsets[c], newCompId, false);
        }
      }
    }
  }
  newLocaOffsets[newNumGlyphs] = glyfWriter.pos;

  // Pad glyf to 4 bytes
  glyfWriter.padTo4();
  const glyfData = glyfWriter.toUint8Array();

  // ----- Step 5: Build loca table -----
  const locaWriter = new BinaryWriter((newNumGlyphs + 1) * 4);
  for (let i = 0; i <= newNumGlyphs; i++) {
    locaWriter.writeU32(newLocaOffsets[i]);
  }
  locaWriter.padTo4();
  const locaData = locaWriter.toUint8Array();

  // ----- Step 6: Build hmtx table -----
  // All subset glyphs get full longHorMetric entries (advanceWidth + lsb)
  const hmtxWriter = new BinaryWriter(newNumGlyphs * 4);
  for (let newId = 0; newId < newNumGlyphs; newId++) {
    const oldId = sortedOldIds[newId];
    hmtxWriter.writeU16(origAdvanceWidths[oldId]);
    hmtxWriter.writeI16(origLsbs[oldId]);
  }
  hmtxWriter.padTo4();
  const hmtxData = hmtxWriter.toUint8Array();

  // ----- Step 7: Build cmap table -----
  // Rebuild: only include codepoints that map to glyphs we kept
  const origCmap = parseCmapFromRaw(data, cmapT!);
  const subsetUnicodeToGlyph = new Map<number, number>();
  for (const [unicode, oldGid] of origCmap) {
    const newGid = glyphMapping.get(oldGid);
    if (newGid !== undefined && newGid > 0) { // skip .notdef mapping
      subsetUnicodeToGlyph.set(unicode, newGid);
    }
  }

  const format4Data = buildCmapFormat4(subsetUnicodeToGlyph);

  // Wrap in cmap table structure: header + one encoding record + subtable
  const cmapWriter = new BinaryWriter(format4Data.length + 16);
  cmapWriter.writeU16(0); // version
  cmapWriter.writeU16(1); // numTables
  cmapWriter.writeU16(3); // platformID (Windows)
  cmapWriter.writeU16(1); // encodingID (Unicode BMP)
  cmapWriter.writeU32(12); // offset to subtable
  cmapWriter.writeRawBytes(format4Data);
  cmapWriter.padTo4();
  const cmapData = cmapWriter.toUint8Array();

  // ----- Step 8: Build post table (format 3.0 — no glyph names) -----
  // Copy the key fields from original, force format 3.0
  const postWriter = new BinaryWriter(32);
  postWriter.writeU32(0x00030000); // version 3.0
  if (postT) {
    // Copy italicAngle (Fixed 16.16)
    postWriter.writeI32(data.getInt32(postT.offset + 4, false));
    postWriter.writeI16(getI16(data, postT.offset + 8));  // underlinePosition
    postWriter.writeI16(getI16(data, postT.offset + 10)); // underlineThickness
    postWriter.writeU32(getU32(data, postT.offset + 12)); // isFixedPitch
  } else {
    postWriter.writeI32(0); // italicAngle
    postWriter.writeI16(-100); // underlinePosition
    postWriter.writeI16(50); // underlineThickness
    postWriter.writeU32(0); // isFixedPitch
  }
  postWriter.writeU32(0); // minMemType42
  postWriter.writeU32(0); // maxMemType42
  postWriter.writeU32(0); // minMemType1
  postWriter.writeU32(0); // maxMemType1
  postWriter.padTo4();
  const postData = postWriter.toUint8Array();

  // ----- Step 9: Copy head table, update indexToLocFormat and checksum -----
  const headData = new Uint8Array(headT.length);
  headData.set(originalBytes.subarray(headT.offset, headT.offset + headT.length));
  // Force long loca format
  const headView = new DataView(headData.buffer);
  headView.setInt16(50, 1, false); // indexToLocFormat = 1 (long)
  // Zero out checksumAdjustment — we'll compute it at the end
  headView.setUint32(8, 0, false);

  // ----- Step 10: Copy hhea table, update numberOfHMetrics -----
  const hheaData = new Uint8Array(hheaT.length);
  hheaData.set(originalBytes.subarray(hheaT.offset, hheaT.offset + hheaT.length));
  const hheaView = new DataView(hheaData.buffer);
  hheaView.setUint16(34, newNumGlyphs, false); // numberOfHMetrics = all glyphs

  // ----- Step 11: Build maxp table -----
  const maxpData = new Uint8Array(maxpT.length);
  maxpData.set(originalBytes.subarray(maxpT.offset, maxpT.offset + maxpT.length));
  const maxpView = new DataView(maxpData.buffer);
  maxpView.setUint16(4, newNumGlyphs, false); // numGlyphs

  // ----- Step 12: Copy OS/2 and name tables as-is -----
  let os2Data: Uint8Array | null = null;
  if (os2T) {
    os2Data = new Uint8Array(os2T.length);
    os2Data.set(originalBytes.subarray(os2T.offset, os2T.offset + os2T.length));
  }

  let nameData: Uint8Array | null = null;
  if (nameT) {
    nameData = new Uint8Array(nameT.length);
    nameData.set(originalBytes.subarray(nameT.offset, nameT.offset + nameT.length));
  }

  // ----- Step 13: Assemble final TTF -----
  // Table list — order by tag for the directory
  interface OutputTable {
    tag: string;
    data: Uint8Array;
  }

  const outputTables: OutputTable[] = [
    { tag: 'cmap', data: cmapData },
    { tag: 'glyf', data: glyfData },
    { tag: 'head', data: headData },
    { tag: 'hhea', data: hheaData },
    { tag: 'hmtx', data: hmtxData },
    { tag: 'loca', data: locaData },
    { tag: 'maxp', data: maxpData },
    { tag: 'post', data: postData },
  ];
  if (os2Data) outputTables.push({ tag: 'OS/2', data: os2Data });
  if (nameData) outputTables.push({ tag: 'name', data: nameData });

  // Sort by tag
  outputTables.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));

  const numOutputTables = outputTables.length;
  const headerSize = 12 + numOutputTables * 16;

  // Calculate table offsets (each table is 4-byte aligned)
  let currentOffset = headerSize;
  const tableRecords: Array<{ tag: string; offset: number; length: number; paddedLength: number }> = [];
  for (const t of outputTables) {
    const paddedLen = (t.data.length + 3) & ~3; // round up to 4
    tableRecords.push({
      tag: t.tag,
      offset: currentOffset,
      length: t.data.length,
      paddedLength: paddedLen,
    });
    currentOffset += paddedLen;
  }

  const totalSize = currentOffset;
  const out = new BinaryWriter(totalSize);

  // TrueType header
  out.writeU32(0x00010000); // sfVersion
  out.writeU16(numOutputTables);
  const pow2t = Math.pow(2, Math.floor(Math.log2(numOutputTables)));
  const searchRange = pow2t * 16;
  out.writeU16(searchRange);
  out.writeU16(Math.floor(Math.log2(numOutputTables)));
  out.writeU16(numOutputTables * 16 - searchRange);

  // Write table directory entries (we'll patch checksums after)
  const dirStart = out.pos;
  for (let i = 0; i < numOutputTables; i++) {
    const rec = tableRecords[i];
    // Tag
    for (let c = 0; c < 4; c++) {
      out.writeU8(c < rec.tag.length ? rec.tag.charCodeAt(c) : 0x20);
    }
    out.writeU32(0); // checksum placeholder
    out.writeU32(rec.offset);
    out.writeU32(rec.length);
  }

  // Write table data (4-byte aligned)
  for (let i = 0; i < numOutputTables; i++) {
    out.writeRawBytes(outputTables[i].data);
    // Pad to 4 bytes
    const padNeeded = tableRecords[i].paddedLength - outputTables[i].data.length;
    for (let p = 0; p < padNeeded; p++) out.writeU8(0);
  }

  const result = out.toUint8Array();

  // Compute and patch table checksums
  for (let i = 0; i < numOutputTables; i++) {
    const rec = tableRecords[i];
    const checksum = calcTableChecksum(result, rec.offset, rec.length);
    const checksumOffset = dirStart + i * 16 + 4; // skip tag (4 bytes)
    const rv = new DataView(result.buffer, result.byteOffset, result.byteLength);
    rv.setUint32(checksumOffset, checksum, false);
  }

  // Compute and patch head checksumAdjustment
  // checksumAdjustment = 0xB1B0AFBA - checkSumOfWholeFont
  const wholeChecksum = calcTableChecksum(result, 0, result.length);
  const checksumAdj = (0xB1B0AFBA - wholeChecksum) >>> 0;
  // Find head table offset and patch checksumAdjustment at byte 8
  for (let i = 0; i < numOutputTables; i++) {
    if (tableRecords[i].tag === 'head') {
      const headOffset = tableRecords[i].offset;
      const rv = new DataView(result.buffer, result.byteOffset, result.byteLength);
      rv.setUint32(headOffset + 8, checksumAdj, false);
      break;
    }
  }

  const subsetTag = generateSubsetTag(neededGlyphs);

  return { bytes: result, glyphMapping, subsetTag };
}

// ---------------------------------------------------------------------------
// Parse cmap from raw table (reused from TrueTypeParser logic)
// ---------------------------------------------------------------------------

function parseCmapFromRaw(
  data: DataView,
  cmapTable: RawTable,
): Map<number, number> {
  const tableOffset = cmapTable.offset;
  const numSubtables = getU16(data, tableOffset + 2);
  let format4Offset = -1;

  for (let i = 0; i < numSubtables; i++) {
    const subtableOffset = tableOffset + 4 + i * 8;
    const platformID = getU16(data, subtableOffset);
    const encodingID = getU16(data, subtableOffset + 2);
    const offset = getU32(data, subtableOffset + 4);

    if (
      (platformID === 3 && encodingID === 1) ||
      (platformID === 0 && (encodingID === 0 || encodingID === 1 || encodingID === 3))
    ) {
      const absoluteOffset = tableOffset + offset;
      const format = getU16(data, absoluteOffset);
      if (format === 4) {
        format4Offset = absoluteOffset;
        if (platformID === 3) break;
      }
    }
  }

  if (format4Offset === -1) {
    return new Map();
  }

  return parseCmapFormat4Raw(data, format4Offset);
}

function parseCmapFormat4Raw(data: DataView, offset: number): Map<number, number> {
  const segCount = getU16(data, offset + 6) / 2;
  const cmap = new Map<number, number>();

  const endCodeBase = offset + 14;
  const startCodeBase = endCodeBase + segCount * 2 + 2;
  const idDeltaBase = startCodeBase + segCount * 2;
  const idRangeOffsetBase = idDeltaBase + segCount * 2;

  for (let seg = 0; seg < segCount; seg++) {
    const endCode = getU16(data, endCodeBase + seg * 2);
    const startCode = getU16(data, startCodeBase + seg * 2);
    const idDelta = getI16(data, idDeltaBase + seg * 2);
    const idRangeOffset = getU16(data, idRangeOffsetBase + seg * 2);

    if (startCode === 0xFFFF) break;

    for (let code = startCode; code <= endCode; code++) {
      let glyphId: number;
      if (idRangeOffset === 0) {
        glyphId = (code + idDelta) & 0xFFFF;
      } else {
        const glyphIndexAddr = idRangeOffsetBase + seg * 2 + idRangeOffset + (code - startCode) * 2;
        glyphId = getU16(data, glyphIndexAddr);
        if (glyphId !== 0) {
          glyphId = (glyphId + idDelta) & 0xFFFF;
        }
      }
      if (glyphId !== 0) {
        cmap.set(code, glyphId);
      }
    }
  }

  return cmap;
}
