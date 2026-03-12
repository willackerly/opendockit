/**
 * font-patcher.ts — Pure-TS font binary patcher for PDF-embedded fonts.
 *
 * PDF documents embed subsetted font programs that often have issues:
 * - "true" sfVersion magic (FreeType rejects it)
 * - Missing OS/2 table (FreeType requires it)
 * - Minimal name table (no family/subfamily entries)
 * - Wrong/missing cmap (browser can't map Unicode → glyph)
 * - Raw CFF data without sfnt wrapper (canvas APIs expect OTF container)
 *
 * This module patches these fonts into valid files that both node-canvas
 * (FreeType) and the browser FontFace API can consume — entirely in
 * TypeScript, no python3/fonttools dependency.
 */

import {
  buildCmapTable,
  buildNameTable,
  buildOS2Table,
  buildPostTable,
  buildHeadTable,
  buildHheaTable,
  buildHmtxTable,
  buildMaxpTable,
  assembleSfnt,
  type FontTable,
} from './font-table-builder.js';

// ---------------------------------------------------------------------------
// DataView helpers
// ---------------------------------------------------------------------------

function getUint16(data: DataView, offset: number): number {
  return data.getUint16(offset, false);
}

function getInt16(data: DataView, offset: number): number {
  return data.getInt16(offset, false);
}

function getUint32(data: DataView, offset: number): number {
  return data.getUint32(offset, false);
}

// ---------------------------------------------------------------------------
// Table directory parsing
// ---------------------------------------------------------------------------

interface TableEntry {
  tag: string;
  checksum: number;
  offset: number;
  length: number;
}

function parseTableDirectory(
  data: DataView,
  bytes: Uint8Array,
): { numTables: number; tables: Map<string, TableEntry> } {
  const numTables = getUint16(data, 4);
  const tables = new Map<string, TableEntry>();

  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16;
    if (off + 16 > bytes.length) break;
    const tag = String.fromCharCode(
      bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3],
    );
    tables.set(tag, {
      tag,
      checksum: getUint32(data, off + 4),
      offset: getUint32(data, off + 8),
      length: getUint32(data, off + 12),
    });
  }

  return { numTables, tables };
}

// ---------------------------------------------------------------------------
// cmap parsing (all formats) for glyph ID extraction
// ---------------------------------------------------------------------------

/**
 * Parse ALL cmap subtables from a font to get charCode → glyphId mapping.
 * Supports formats 0, 4, 6, and 12 — the ones commonly found in PDF subsetted fonts.
 */
function parseAllCmapMappings(
  data: DataView,
  cmapOffset: number,
  _cmapLength: number,
): Map<number, number> {
  const result = new Map<number, number>();
  const numSubtables = getUint16(data, cmapOffset + 2);

  for (let i = 0; i < numSubtables; i++) {
    const subtableOff = cmapOffset + 4 + i * 8;
    if (subtableOff + 8 > data.byteLength) break;
    const offset = getUint32(data, subtableOff + 4);
    const absoluteOff = cmapOffset + offset;
    if (absoluteOff + 2 > data.byteLength) continue;

    const format = getUint16(data, absoluteOff);

    try {
      switch (format) {
        case 0:
          parseCmapFormat0(data, absoluteOff, result);
          break;
        case 4:
          parseCmapFormat4(data, absoluteOff, result);
          break;
        case 6:
          parseCmapFormat6(data, absoluteOff, result);
          break;
        case 12:
          parseCmapFormat12(data, absoluteOff, result);
          break;
      }
    } catch {
      // Skip malformed subtables
    }
  }

  return result;
}

function parseCmapFormat0(data: DataView, offset: number, out: Map<number, number>): void {
  // Format 0: byte encoding table — 256 bytes of glyph IDs
  if (offset + 6 + 256 > data.byteLength) return;
  for (let i = 0; i < 256; i++) {
    const gid = data.getUint8(offset + 6 + i);
    if (gid !== 0 && !out.has(i)) {
      out.set(i, gid);
    }
  }
}

function parseCmapFormat4(data: DataView, offset: number, out: Map<number, number>): void {
  const segCount = getUint16(data, offset + 6) / 2;
  const endCodeBase = offset + 14;
  const startCodeBase = endCodeBase + segCount * 2 + 2;
  const idDeltaBase = startCodeBase + segCount * 2;
  const idRangeOffsetBase = idDeltaBase + segCount * 2;

  for (let seg = 0; seg < segCount; seg++) {
    const endCode = getUint16(data, endCodeBase + seg * 2);
    const startCode = getUint16(data, startCodeBase + seg * 2);
    const idDelta = getInt16(data, idDeltaBase + seg * 2);
    const idRangeOffset = getUint16(data, idRangeOffsetBase + seg * 2);

    if (startCode === 0xffff) break;

    for (let code = startCode; code <= endCode; code++) {
      let glyphId: number;
      if (idRangeOffset === 0) {
        glyphId = (code + idDelta) & 0xffff;
      } else {
        const addr = idRangeOffsetBase + seg * 2 + idRangeOffset + (code - startCode) * 2;
        if (addr + 2 > data.byteLength) continue;
        glyphId = getUint16(data, addr);
        if (glyphId !== 0) glyphId = (glyphId + idDelta) & 0xffff;
      }
      if (glyphId !== 0 && !out.has(code)) {
        out.set(code, glyphId);
      }
    }
  }
}

function parseCmapFormat6(data: DataView, offset: number, out: Map<number, number>): void {
  const firstCode = getUint16(data, offset + 6);
  const entryCount = getUint16(data, offset + 8);
  for (let i = 0; i < entryCount; i++) {
    const gid = getUint16(data, offset + 10 + i * 2);
    if (gid !== 0) {
      const code = firstCode + i;
      if (!out.has(code)) out.set(code, gid);
    }
  }
}

function parseCmapFormat12(data: DataView, offset: number, out: Map<number, number>): void {
  const numGroups = getUint32(data, offset + 12);
  for (let i = 0; i < numGroups; i++) {
    const groupOff = offset + 16 + i * 12;
    const startCode = getUint32(data, groupOff);
    const endCode = getUint32(data, groupOff + 4);
    const startGlyph = getUint32(data, groupOff + 8);
    for (let code = startCode; code <= endCode; code++) {
      const gid = startGlyph + (code - startCode);
      if (gid !== 0 && !out.has(code)) out.set(code, gid);
    }
  }
}

// ---------------------------------------------------------------------------
// Core: Unicode → GlyphId mapping builder
// ---------------------------------------------------------------------------

/**
 * Build a unicodeCodePoint → glyphId map from the font's original cmap
 * and the PDF's charCodeToUnicode map.
 *
 * Algorithm:
 * 1. Parse all original cmap subtables → charCode → glyphId
 * 2. For each (charCode, unicodeStr) in charCodeToUnicode:
 *    a. glyphId = originalCmap[charCode] OR glyphId = charCode (direct fallback)
 *    b. Skip .notdef (glyphId == 0)
 *    c. unicodeToGlyph[unicodeStr.codePointAt(0)] = glyphId
 */
function buildUnicodeToGlyphMap(
  originalCmap: Map<number, number>,
  charCodeToUnicode: Map<number, string>,
  numGlyphs: number,
): Map<number, number> {
  const unicodeToGlyph = new Map<number, number>();

  for (const [charCode, unicodeStr] of charCodeToUnicode) {
    const cp = unicodeStr.codePointAt(0);
    if (cp === undefined) continue;

    // Try original cmap first
    let glyphId = originalCmap.get(charCode);

    // Fallback: direct glyph index (some subsetted fonts use this)
    if (glyphId === undefined && charCode > 0 && charCode < numGlyphs) {
      glyphId = charCode;
    }

    // Skip .notdef
    if (!glyphId || glyphId === 0) continue;

    unicodeToGlyph.set(cp, glyphId);
  }

  return unicodeToGlyph;
}

// ---------------------------------------------------------------------------
// Phase 1: TrueType patcher
// ---------------------------------------------------------------------------

/**
 * Patch a PDF-embedded TrueType font for canvas registration.
 *
 * Fixes:
 * - "true" sfVersion magic → 0x00010000
 * - Missing OS/2 table → synthesized from hhea
 * - Minimal name table → rebuilt with family name
 * - Wrong/missing cmap → rebuilt from charCodeToUnicode
 *
 * @param fontBytes Raw TrueType font bytes from PDF
 * @param familyName Family name for the name table
 * @param charCodeToUnicode PDF charCode → Unicode mapping (from FontDecoder)
 * @returns Patched font bytes
 */
export function patchTrueTypeFont(
  fontBytes: Uint8Array,
  familyName: string,
  charCodeToUnicode?: Map<number, string>,
): Uint8Array {
  if (fontBytes.length < 12) return fontBytes;

  const data = new DataView(fontBytes.buffer, fontBytes.byteOffset, fontBytes.byteLength);
  const magic = getUint32(data, 0);

  // Only patch TrueType fonts
  if (magic !== 0x00010000 && magic !== 0x74727565) {
    return fontBytes;
  }

  const { tables } = parseTableDirectory(data, fontBytes);

  // Read metrics from existing tables
  const hheaEntry = tables.get('hhea');
  const headEntry = tables.get('head');
  const maxpEntry = tables.get('maxp');
  const cmapEntry = tables.get('cmap');

  if (!hheaEntry || !headEntry || !maxpEntry) return fontBytes;

  const ascender = getInt16(data, hheaEntry.offset + 4);
  const descender = getInt16(data, hheaEntry.offset + 6);
  const numGlyphs = getUint16(data, maxpEntry.offset + 4);

  // Extract existing tables (preserving ones we don't modify)
  const outputTables: FontTable[] = [];

  // Collect tables we need to either keep or replace
  const hasOS2 = tables.has('OS/2');
  const hasName = tables.has('name');

  // Build replacement cmap if we have charCodeToUnicode
  let newCmap: Uint8Array | undefined;
  if (charCodeToUnicode && charCodeToUnicode.size > 0 && cmapEntry) {
    const originalCmap = parseAllCmapMappings(data, cmapEntry.offset, cmapEntry.length);
    const unicodeToGlyph = buildUnicodeToGlyphMap(originalCmap, charCodeToUnicode, numGlyphs);
    if (unicodeToGlyph.size > 0) {
      newCmap = buildCmapTable(unicodeToGlyph);
    }
  }

  // Copy existing tables, replacing/adding as needed
  // Sort by tag for consistent output
  const sortedTags = [...tables.keys()].sort();
  const replacedTags = new Set<string>();

  for (const tag of sortedTags) {
    const entry = tables.get(tag)!;

    if (tag === 'cmap' && newCmap) {
      outputTables.push({ tag: 'cmap', data: newCmap });
      replacedTags.add('cmap');
    } else if (tag === 'name') {
      // Always rebuild name table to ensure proper entries
      outputTables.push({ tag: 'name', data: buildNameTable(familyName) });
      replacedTags.add('name');
    } else if (tag === 'OS/2') {
      // Keep existing OS/2
      outputTables.push({ tag, data: fontBytes.slice(entry.offset, entry.offset + entry.length) });
      replacedTags.add('OS/2');
    } else {
      // Copy as-is
      outputTables.push({ tag, data: fontBytes.slice(entry.offset, entry.offset + entry.length) });
    }
  }

  // Add missing tables
  if (!hasOS2) {
    outputTables.push({ tag: 'OS/2', data: buildOS2Table(ascender, descender) });
  }
  if (!hasName) {
    outputTables.push({ tag: 'name', data: buildNameTable(familyName) });
  }
  if (!cmapEntry && newCmap) {
    outputTables.push({ tag: 'cmap', data: newCmap });
  }

  // Sort tables alphabetically (OpenType spec recommendation)
  outputTables.sort((a, b) => a.tag.localeCompare(b.tag));

  return assembleSfnt(outputTables, 0x00010000);
}

// ---------------------------------------------------------------------------
// Phase 2: CFF OTF wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap raw CFF font data in an OTF (OTTO) sfnt container.
 *
 * Raw CFF bytes from PDF FontFile3 streams can't be used directly by canvas
 * APIs — they need an sfnt wrapper with synthetic tables. This creates a valid
 * .otf file from the raw CFF data.
 *
 * @param cffBytes Raw CFF table data
 * @param familyName Family name for name/OS2 tables
 * @param metrics Font metrics (from CFFParser or FontDescriptor)
 * @param charCodeToUnicode PDF charCode → Unicode mapping
 * @returns Complete OTF font bytes
 */
export function wrapCFFInOTF(
  cffBytes: Uint8Array,
  familyName: string,
  metrics: {
    ascender: number;
    descender: number;
    unitsPerEm: number;
    numGlyphs?: number;
    advanceWidths?: Uint16Array;
    bbox?: [number, number, number, number];
  },
  charCodeToUnicode?: Map<number, string>,
): Uint8Array {
  const {
    ascender,
    descender,
    unitsPerEm,
    numGlyphs = 256,
    advanceWidths = new Uint16Array(numGlyphs).fill(600),
    bbox = [0, descender, unitsPerEm, ascender],
  } = metrics;

  // Build Unicode cmap from charCodeToUnicode
  // For CFF fonts that were already OTF-wrapped, there's no original cmap to read.
  // We build directly from charCodeToUnicode: charCode → unicodeCP, using charCode as glyphId fallback
  let cmapData: Uint8Array;
  if (charCodeToUnicode && charCodeToUnicode.size > 0) {
    const unicodeToGlyph = new Map<number, number>();
    for (const [charCode, unicodeStr] of charCodeToUnicode) {
      const cp = unicodeStr.codePointAt(0);
      if (cp === undefined) continue;
      // Use charCode as glyph ID — CFF subsetted fonts typically use identity mapping
      const glyphId = charCode > 0 && charCode < numGlyphs ? charCode : 0;
      if (glyphId > 0) {
        unicodeToGlyph.set(cp, glyphId);
      }
    }
    cmapData = buildCmapTable(unicodeToGlyph.size > 0 ? unicodeToGlyph : new Map([[0x20, 1]]));
  } else {
    // Minimal cmap with just space
    cmapData = buildCmapTable(new Map([[0x20, 1]]));
  }

  const tables: FontTable[] = [
    { tag: 'CFF ', data: cffBytes },
    { tag: 'OS/2', data: buildOS2Table(ascender, descender) },
    { tag: 'cmap', data: cmapData },
    { tag: 'head', data: buildHeadTable(unitsPerEm, bbox) },
    { tag: 'hhea', data: buildHheaTable(ascender, descender, numGlyphs) },
    { tag: 'hmtx', data: buildHmtxTable(advanceWidths, numGlyphs) },
    { tag: 'maxp', data: buildMaxpTable(numGlyphs) },
    { tag: 'name', data: buildNameTable(familyName) },
    { tag: 'post', data: buildPostTable() },
  ];

  // Sort alphabetically
  tables.sort((a, b) => a.tag.localeCompare(b.tag));

  return assembleSfnt(tables, 0x4f54544f); // 'OTTO'
}

// ---------------------------------------------------------------------------
// Detect font type from raw bytes
// ---------------------------------------------------------------------------

export type FontBinaryType = 'TrueType' | 'CFF-OTF' | 'CFF-raw' | 'unknown';

/**
 * Detect the type of a font binary from its magic bytes.
 */
export function detectFontType(bytes: Uint8Array): FontBinaryType {
  if (bytes.length < 4) return 'unknown';
  const magic = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];

  if (magic === 0x00010000 || magic === 0x74727565) return 'TrueType';
  if (magic === 0x4f54544f) return 'CFF-OTF'; // OTTO
  // Raw CFF starts with major version (1), minor version
  if (bytes[0] === 1 && bytes[1] <= 4 && bytes.length > 4) return 'CFF-raw';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Unified patcher entry point
// ---------------------------------------------------------------------------

/**
 * Patch a PDF-embedded font for canvas registration.
 * Dispatches by font type: TrueType patching, CFF OTF wrapping, or passthrough.
 *
 * @param fontBytes Raw font bytes from PDF
 * @param familyName Desired family name
 * @param fontType Font type hint from PDF (e.g. 'TrueType', 'CFF', 'Type1')
 * @param charCodeToUnicode PDF charCode → Unicode mapping
 * @param metrics Optional metrics for CFF wrapping
 * @returns Patched font bytes and the detected/used font format
 */
export function patchFont(
  fontBytes: Uint8Array,
  familyName: string,
  _fontType?: string,
  charCodeToUnicode?: Map<number, string>,
  metrics?: {
    ascender: number;
    descender: number;
    unitsPerEm: number;
    numGlyphs?: number;
    advanceWidths?: Uint16Array;
  },
): { bytes: Uint8Array; format: string } {
  const detected = detectFontType(fontBytes);

  switch (detected) {
    case 'TrueType':
      return {
        bytes: patchTrueTypeFont(fontBytes, familyName, charCodeToUnicode),
        format: 'TrueType',
      };

    case 'CFF-OTF':
      // Already OTF-wrapped CFF — patch like TrueType (fix tables)
      return {
        bytes: patchCFFOTF(fontBytes, familyName, charCodeToUnicode),
        format: 'CFF-OTF',
      };

    case 'CFF-raw':
      if (metrics) {
        return {
          bytes: wrapCFFInOTF(fontBytes, familyName, metrics, charCodeToUnicode),
          format: 'CFF-wrapped',
        };
      }
      // No metrics — wrap with defaults
      return {
        bytes: wrapCFFInOTF(fontBytes, familyName, {
          ascender: 800,
          descender: -200,
          unitsPerEm: 1000,
        }, charCodeToUnicode),
        format: 'CFF-wrapped',
      };

    default:
      return { bytes: fontBytes, format: 'unknown' };
  }
}

// ---------------------------------------------------------------------------
// CFF-OTF patcher (for already-wrapped CFF fonts that need table fixes)
// ---------------------------------------------------------------------------

function patchCFFOTF(
  fontBytes: Uint8Array,
  familyName: string,
  charCodeToUnicode?: Map<number, string>,
): Uint8Array {
  if (fontBytes.length < 12) return fontBytes;

  const data = new DataView(fontBytes.buffer, fontBytes.byteOffset, fontBytes.byteLength);
  const { tables } = parseTableDirectory(data, fontBytes);

  const hheaEntry = tables.get('hhea');
  const maxpEntry = tables.get('maxp');
  const cmapEntry = tables.get('cmap');

  let ascender = 800;
  let descender = -200;
  let numGlyphs = 256;

  if (hheaEntry) {
    ascender = getInt16(data, hheaEntry.offset + 4);
    descender = getInt16(data, hheaEntry.offset + 6);
  }
  if (maxpEntry) {
    numGlyphs = getUint16(data, maxpEntry.offset + 4);
  }

  // Build new cmap if we have charCodeToUnicode
  let newCmap: Uint8Array | undefined;
  if (charCodeToUnicode && charCodeToUnicode.size > 0 && cmapEntry) {
    const originalCmap = parseAllCmapMappings(data, cmapEntry.offset, cmapEntry.length);
    const unicodeToGlyph = buildUnicodeToGlyphMap(originalCmap, charCodeToUnicode, numGlyphs);
    if (unicodeToGlyph.size > 0) {
      newCmap = buildCmapTable(unicodeToGlyph);
    }
  }

  const outputTables: FontTable[] = [];

  for (const [tag, entry] of tables) {
    if (tag === 'cmap' && newCmap) {
      outputTables.push({ tag: 'cmap', data: newCmap });
    } else if (tag === 'name') {
      outputTables.push({ tag: 'name', data: buildNameTable(familyName) });
    } else {
      outputTables.push({ tag, data: fontBytes.slice(entry.offset, entry.offset + entry.length) });
    }
  }

  // Add missing OS/2
  if (!tables.has('OS/2')) {
    outputTables.push({ tag: 'OS/2', data: buildOS2Table(ascender, descender) });
  }

  outputTables.sort((a, b) => a.tag.localeCompare(b.tag));
  return assembleSfnt(outputTables, 0x4f54544f);
}
