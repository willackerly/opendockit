/**
 * TrueTypeParser — minimal read-only TrueType font parser.
 *
 * Parses 8 tables from TTF binary: head, hhea, hmtx, maxp, cmap, OS/2, post, name.
 * Extracts metrics and glyph mapping needed for PDF font embedding.
 *
 * Phase 7b: TrueType only — rejects CFF/OpenType (OTTO), WOFF, WOFF2.
 */

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface TrueTypeFontInfo {
  postScriptName: string;
  fontFamily: string;
  unitsPerEm: number;
  fontBBox: [number, number, number, number];
  ascender: number;       // OS/2 sTypoAscender (fallback: hhea)
  descender: number;      // OS/2 sTypoDescender (fallback: hhea)
  capHeight: number;      // OS/2 sCapHeight
  italicAngle: number;
  isFixedPitch: boolean;
  flags: number;          // PDF font descriptor flags (computed externally)
  stemV: number;          // approximated from usWeightClass
  numGlyphs: number;
  cmap: Map<number, number>;       // Unicode codepoint -> glyph ID
  advanceWidths: Uint16Array;      // indexed by glyph ID (font units)
  rawBytes: Uint8Array;            // full TTF for FontFile2
}

// ---------------------------------------------------------------------------
// Table directory
// ---------------------------------------------------------------------------

interface TableEntry {
  tag: string;
  offset: number;
  length: number;
}

// ---------------------------------------------------------------------------
// DataView helpers
// ---------------------------------------------------------------------------

function getUint16(data: DataView, offset: number): number {
  return data.getUint16(offset, false); // big-endian
}

function getInt16(data: DataView, offset: number): number {
  return data.getInt16(offset, false);
}

function getUint32(data: DataView, offset: number): number {
  return data.getUint32(offset, false);
}

function getInt32(data: DataView, offset: number): number {
  return data.getInt32(offset, false);
}

// Fixed-point 16.16
function getFixed(data: DataView, offset: number): number {
  return getInt32(data, offset) / 65536;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseTrueType(bytes: Uint8Array): TrueTypeFontInfo {
  if (bytes.length < 12) {
    throw new Error('Invalid TrueType font: file too small');
  }

  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Check signature
  const sig = getUint32(data, 0);
  if (sig === 0x4F54544F) { // 'OTTO'
    throw new Error(
      'CFF/OpenType fonts (OTTO) are not supported. Only TrueType (.ttf) fonts are accepted.',
    );
  }
  if (sig === 0x774F4646 || sig === 0x774F4632) { // 'wOFF' or 'wOF2'
    throw new Error(
      'WOFF/WOFF2 fonts are not supported. Convert to .ttf first.',
    );
  }
  // Valid TTF signatures: 0x00010000, 0x74727565 ('true')
  if (sig !== 0x00010000 && sig !== 0x74727565) {
    throw new Error(
      `Unrecognized font signature: 0x${sig.toString(16).padStart(8, '0')}. Expected TrueType (.ttf).`,
    );
  }

  // Parse table directory
  const numTables = getUint16(data, 4);
  const tables = new Map<string, TableEntry>();

  for (let i = 0; i < numTables; i++) {
    const recordOffset = 12 + i * 16;
    if (recordOffset + 16 > bytes.length) break;
    const tag = String.fromCharCode(
      bytes[recordOffset],
      bytes[recordOffset + 1],
      bytes[recordOffset + 2],
      bytes[recordOffset + 3],
    );
    const offset = getUint32(data, recordOffset + 8);
    const length = getUint32(data, recordOffset + 12);
    tables.set(tag, { tag, offset, length });
  }

  // Required tables
  const headTable = tables.get('head');
  const hheaTable = tables.get('hhea');
  const hmtxTable = tables.get('hmtx');
  const maxpTable = tables.get('maxp');
  const cmapTable = tables.get('cmap');
  const postTable = tables.get('post');
  const nameTable = tables.get('name');

  if (!headTable) throw new Error('Missing required "head" table');
  if (!hheaTable) throw new Error('Missing required "hhea" table');
  if (!hmtxTable) throw new Error('Missing required "hmtx" table');
  if (!maxpTable) throw new Error('Missing required "maxp" table');
  if (!cmapTable) throw new Error('Missing required "cmap" table');
  if (!postTable) throw new Error('Missing required "post" table');
  if (!nameTable) throw new Error('Missing required "name" table');

  // OS/2 is optional (some older fonts lack it)
  const os2Table = tables.get('OS/2');

  // --- head table ---
  const unitsPerEm = getUint16(data, headTable.offset + 18);
  const xMin = getInt16(data, headTable.offset + 36);
  const yMin = getInt16(data, headTable.offset + 38);
  const xMax = getInt16(data, headTable.offset + 40);
  const yMax = getInt16(data, headTable.offset + 42);
  const macStyle = getUint16(data, headTable.offset + 44);

  // --- hhea table ---
  const hheaAscender = getInt16(data, hheaTable.offset + 4);
  const hheaDescender = getInt16(data, hheaTable.offset + 6);
  const numberOfHMetrics = getUint16(data, hheaTable.offset + 34);

  // --- maxp table ---
  const numGlyphs = getUint16(data, maxpTable.offset + 4);

  // --- hmtx table ---
  const advanceWidths = new Uint16Array(numGlyphs);
  let lastWidth = 0;
  for (let i = 0; i < numGlyphs; i++) {
    if (i < numberOfHMetrics) {
      lastWidth = getUint16(data, hmtxTable.offset + i * 4);
      advanceWidths[i] = lastWidth;
    } else {
      // Glyphs beyond numberOfHMetrics reuse the last width
      advanceWidths[i] = lastWidth;
    }
  }

  // --- cmap table ---
  const cmap = parseCmapTable(data, cmapTable.offset, cmapTable.length);

  // --- post table ---
  const italicAngle = getFixed(data, postTable.offset + 4);
  const isFixedPitch = getUint32(data, postTable.offset + 12) !== 0;

  // --- name table ---
  const { postScriptName, fontFamily } = parseNameTable(data, bytes, nameTable.offset);

  // --- OS/2 table (optional) ---
  let ascender: number;
  let descender: number;
  let capHeight: number;
  let usWeightClass = 400;
  let sFamilyClass = 0;
  let fsSelection = 0;

  if (os2Table && os2Table.length >= 78) {
    usWeightClass = getUint16(data, os2Table.offset + 4);
    sFamilyClass = getInt16(data, os2Table.offset + 30);
    fsSelection = getUint16(data, os2Table.offset + 62);
    ascender = getInt16(data, os2Table.offset + 68);   // sTypoAscender
    descender = getInt16(data, os2Table.offset + 70);   // sTypoDescender

    // sCapHeight is at offset 88 in version 2+ (table must be >= 96 bytes)
    if (os2Table.length >= 96) {
      const os2Version = getUint16(data, os2Table.offset);
      if (os2Version >= 2) {
        capHeight = getInt16(data, os2Table.offset + 88);
      } else {
        capHeight = ascender; // fallback
      }
    } else {
      capHeight = ascender;
    }
  } else {
    // No OS/2 table — fall back to hhea values
    ascender = hheaAscender;
    descender = hheaDescender;
    capHeight = hheaAscender;
  }

  // StemV approximation from weight class
  const w = Math.max(50, Math.min(950, usWeightClass));
  const stemV = Math.round(10 + 220 * Math.pow((w - 50) / 900, 2));

  // Detect italic from OS/2 fsSelection (bit 0) or head macStyle (bit 1)
  const isItalic = !!(fsSelection & 0x01) || !!(macStyle & 0x02);
  // Detect serif from sFamilyClass: classes 1-7 are serif
  const isSerif = (sFamilyClass >> 8) >= 1 && (sFamilyClass >> 8) <= 7;

  return {
    postScriptName,
    fontFamily,
    unitsPerEm,
    fontBBox: [xMin, yMin, xMax, yMax],
    ascender,
    descender,
    capHeight,
    italicAngle,
    isFixedPitch,
    flags: 0, // computed externally by FontFlags
    stemV,
    numGlyphs,
    cmap,
    advanceWidths,
    rawBytes: bytes,
    // Store metadata for FontFlags computation
    _isItalic: isItalic,
    _isSerif: isSerif,
  } as TrueTypeFontInfo & { _isItalic: boolean; _isSerif: boolean };
}

// ---------------------------------------------------------------------------
// cmap table parser — format 4 (BMP Unicode)
// ---------------------------------------------------------------------------

function parseCmapTable(
  data: DataView,
  tableOffset: number,
  _tableLength: number,
): Map<number, number> {
  const numSubtables = getUint16(data, tableOffset + 2);

  // Find a Unicode BMP subtable (platform 0 or platform 3 encoding 1)
  let format4Offset = -1;

  for (let i = 0; i < numSubtables; i++) {
    const subtableOffset = tableOffset + 4 + i * 8;
    const platformID = getUint16(data, subtableOffset);
    const encodingID = getUint16(data, subtableOffset + 2);
    const offset = getUint32(data, subtableOffset + 4);

    // Platform 3 (Windows), Encoding 1 (Unicode BMP) — most common
    // Platform 0 (Unicode), Encoding 3 (Unicode BMP) — also common
    if (
      (platformID === 3 && encodingID === 1) ||
      (platformID === 0 && (encodingID === 0 || encodingID === 1 || encodingID === 3))
    ) {
      const absoluteOffset = tableOffset + offset;
      const format = getUint16(data, absoluteOffset);
      if (format === 4) {
        format4Offset = absoluteOffset;
        // Prefer platform 3 encoding 1
        if (platformID === 3) break;
      }
    }
  }

  if (format4Offset === -1) {
    throw new Error(
      'No supported cmap subtable found. Need format 4 (Unicode BMP).',
    );
  }

  return parseCmapFormat4(data, format4Offset);
}

function parseCmapFormat4(
  data: DataView,
  offset: number,
): Map<number, number> {
  const segCount = getUint16(data, offset + 6) / 2;
  const cmap = new Map<number, number>();

  // Array offsets within the format 4 subtable
  const endCodeBase = offset + 14;
  const startCodeBase = endCodeBase + segCount * 2 + 2; // +2 for reservedPad
  const idDeltaBase = startCodeBase + segCount * 2;
  const idRangeOffsetBase = idDeltaBase + segCount * 2;

  for (let seg = 0; seg < segCount; seg++) {
    const endCode = getUint16(data, endCodeBase + seg * 2);
    const startCode = getUint16(data, startCodeBase + seg * 2);
    const idDelta = getInt16(data, idDeltaBase + seg * 2);
    const idRangeOffset = getUint16(data, idRangeOffsetBase + seg * 2);

    if (startCode === 0xFFFF) break; // sentinel segment

    for (let code = startCode; code <= endCode; code++) {
      let glyphId: number;

      if (idRangeOffset === 0) {
        glyphId = (code + idDelta) & 0xFFFF;
      } else {
        // idRangeOffset points into glyphIdArray relative to the current
        // idRangeOffset entry's position
        const glyphIndexAddr =
          idRangeOffsetBase +
          seg * 2 +
          idRangeOffset +
          (code - startCode) * 2;
        glyphId = getUint16(data, glyphIndexAddr);
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

// ---------------------------------------------------------------------------
// name table parser — extract postScriptName and fontFamily
// ---------------------------------------------------------------------------

function parseNameTable(
  data: DataView,
  bytes: Uint8Array,
  tableOffset: number,
): { postScriptName: string; fontFamily: string } {
  const count = getUint16(data, tableOffset + 2);
  const stringOffset = tableOffset + getUint16(data, tableOffset + 4);

  let postScriptName = 'Unknown';
  let fontFamily = 'Unknown';

  // Name IDs: 1 = Font Family, 6 = PostScript Name
  // Prefer platform 3 (Windows) encoding 1 (Unicode BMP)
  // Fall back to platform 1 (Macintosh) encoding 0 (Roman)

  for (let i = 0; i < count; i++) {
    const recordOffset = tableOffset + 6 + i * 12;
    const platformID = getUint16(data, recordOffset);
    const encodingID = getUint16(data, recordOffset + 2);
    const nameID = getUint16(data, recordOffset + 6);
    const length = getUint16(data, recordOffset + 8);
    const offset = getUint16(data, recordOffset + 10);

    if (nameID !== 1 && nameID !== 6) continue;

    const strStart = stringOffset + offset;
    const strEnd = strStart + length;
    if (strEnd > bytes.length) continue;

    let str: string;
    if (platformID === 3 && encodingID === 1) {
      // UTF-16BE
      str = decodeUtf16BE(bytes, strStart, length);
    } else if (platformID === 1 && encodingID === 0) {
      // MacRoman (ASCII-compatible for basic Latin)
      str = decodeLatin1(bytes, strStart, length);
    } else if (platformID === 0) {
      // Unicode platform — UTF-16BE
      str = decodeUtf16BE(bytes, strStart, length);
    } else {
      continue;
    }

    if (nameID === 6) {
      postScriptName = str;
    } else if (nameID === 1) {
      fontFamily = str;
    }
  }

  return { postScriptName, fontFamily };
}

function decodeUtf16BE(bytes: Uint8Array, offset: number, length: number): string {
  const chars: string[] = [];
  for (let i = 0; i < length; i += 2) {
    chars.push(String.fromCharCode((bytes[offset + i] << 8) | bytes[offset + i + 1]));
  }
  return chars.join('');
}

function decodeLatin1(bytes: Uint8Array, offset: number, length: number): string {
  const chars: string[] = [];
  for (let i = 0; i < length; i++) {
    chars.push(String.fromCharCode(bytes[offset + i]));
  }
  return chars.join('');
}
