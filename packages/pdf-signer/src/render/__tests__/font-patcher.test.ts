/**
 * Tests for the pure-TS font patcher module.
 */

import { describe, it, expect } from 'vitest';
import {
  patchTrueTypeFont,
  wrapCFFInOTF,
  detectFontType,
  patchFont,
} from '../font-patcher.js';
import {
  buildCmapTable,
  buildNameTable,
  buildOS2Table,
  buildPostTable,
  buildHeadTable,
  buildHheaTable,
  buildMaxpTable,
  assembleSfnt,
  type FontTable,
} from '../font-table-builder.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid TrueType font with specified tables. */
function buildMinimalTTF(opts?: {
  magic?: number;
  includeOS2?: boolean;
  includeName?: boolean;
  includeCmap?: boolean;
}): Uint8Array {
  const tables: FontTable[] = [];

  // head table (54 bytes)
  const head = buildHeadTable(1000, [0, -200, 1000, 800]);
  tables.push({ tag: 'head', data: head });

  // hhea table (36 bytes)
  const hhea = buildHheaTable(800, -200, 1);
  tables.push({ tag: 'hhea', data: hhea });

  // hmtx — 1 glyph
  const hmtx = new Uint8Array(4);
  hmtx[0] = 0x02; hmtx[1] = 0x58; // advanceWidth = 600
  tables.push({ tag: 'hmtx', data: hmtx });

  // maxp — 1 glyph
  const maxp = new Uint8Array(6);
  maxp[0] = 0x00; maxp[1] = 0x01; maxp[2] = 0x00; maxp[3] = 0x00; // version 1.0
  maxp[4] = 0x00; maxp[5] = 0x01; // numGlyphs = 1
  tables.push({ tag: 'maxp', data: maxp });

  if (opts?.includeOS2 !== false) {
    tables.push({ tag: 'OS/2', data: buildOS2Table(800, -200) });
  }

  if (opts?.includeName !== false) {
    tables.push({ tag: 'name', data: buildNameTable('TestFont') });
  }

  if (opts?.includeCmap !== false) {
    tables.push({ tag: 'cmap', data: buildCmapTable(new Map([[0x41, 1]])) });
  }

  // post table
  tables.push({ tag: 'post', data: buildPostTable() });

  // glyf + loca (minimal — needed for TrueType but we'll just add empty)
  tables.push({ tag: 'glyf', data: new Uint8Array(2) });
  tables.push({ tag: 'loca', data: new Uint8Array(8) });

  tables.sort((a, b) => a.tag.localeCompare(b.tag));

  const magic = opts?.magic ?? 0x00010000;
  return assembleSfnt(tables, magic);
}

// ---------------------------------------------------------------------------
// detectFontType
// ---------------------------------------------------------------------------

describe('detectFontType', () => {
  it('detects TrueType (0x00010000)', () => {
    const buf = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0, 0, 0, 0]);
    expect(detectFontType(buf)).toBe('TrueType');
  });

  it('detects TrueType ("true" magic)', () => {
    const buf = new Uint8Array([0x74, 0x72, 0x75, 0x65, 0, 0, 0, 0]);
    expect(detectFontType(buf)).toBe('TrueType');
  });

  it('detects CFF-OTF (OTTO)', () => {
    const buf = new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 0, 0, 0, 0]);
    expect(detectFontType(buf)).toBe('CFF-OTF');
  });

  it('detects raw CFF', () => {
    const buf = new Uint8Array([0x01, 0x00, 0x04, 0x01, 0x00]);
    expect(detectFontType(buf)).toBe('CFF-raw');
  });

  it('returns unknown for unrecognized', () => {
    expect(detectFontType(new Uint8Array([0xff, 0xff, 0xff, 0xff]))).toBe('unknown');
    expect(detectFontType(new Uint8Array([]))).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// buildCmapTable
// ---------------------------------------------------------------------------

describe('buildCmapTable', () => {
  it('builds a valid format 4 cmap', () => {
    const map = new Map([
      [0x41, 1], // A → glyph 1
      [0x42, 2], // B → glyph 2
      [0x43, 3], // C → glyph 3
    ]);
    const data = buildCmapTable(map);
    expect(data.length).toBeGreaterThan(0);

    // Verify cmap header
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(view.getUint16(0)).toBe(0); // version
    expect(view.getUint16(2)).toBe(1); // numTables
    expect(view.getUint16(4)).toBe(3); // platformID = Windows
    expect(view.getUint16(6)).toBe(1); // encodingID = Unicode BMP

    // Subtable format
    const subtableOff = view.getUint32(8);
    expect(view.getUint16(subtableOff)).toBe(4); // format 4
  });

  it('handles empty map gracefully', () => {
    const data = buildCmapTable(new Map());
    expect(data.length).toBeGreaterThan(0);
  });

  it('handles non-contiguous glyph IDs', () => {
    const map = new Map([
      [0x41, 10], // A → glyph 10
      [0x42, 20], // B → glyph 20 (not contiguous with 10)
    ]);
    const data = buildCmapTable(map);
    expect(data.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildNameTable
// ---------------------------------------------------------------------------

describe('buildNameTable', () => {
  it('creates name table with family, subfamily, and PS name', () => {
    const data = buildNameTable('MyFont', 'MyFont-Regular');
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(view.getUint16(0)).toBe(0); // format
    expect(view.getUint16(2)).toBe(3); // 3 name records
  });
});

// ---------------------------------------------------------------------------
// buildOS2Table
// ---------------------------------------------------------------------------

describe('buildOS2Table', () => {
  it('creates 78-byte OS/2 v4 table', () => {
    const data = buildOS2Table(800, -200, 700);
    expect(data.length).toBe(78);
    const view = new DataView(data.buffer);
    expect(view.getUint16(0)).toBe(4); // version
    expect(view.getUint16(4)).toBe(700); // usWeightClass
    expect(view.getInt16(68)).toBe(800); // sTypoAscender
    expect(view.getInt16(70)).toBe(-200); // sTypoDescender
  });
});

// ---------------------------------------------------------------------------
// assembleSfnt
// ---------------------------------------------------------------------------

describe('assembleSfnt', () => {
  it('assembles valid sfnt with TrueType magic', () => {
    const tables: FontTable[] = [
      { tag: 'head', data: new Uint8Array(54) },
      { tag: 'hhea', data: new Uint8Array(36) },
    ];
    const result = assembleSfnt(tables, 0x00010000);

    const view = new DataView(result.buffer);
    expect(view.getUint32(0)).toBe(0x00010000); // sfntVersion
    expect(view.getUint16(4)).toBe(2); // numTables
  });

  it('assembles valid sfnt with OTTO magic', () => {
    const tables: FontTable[] = [
      { tag: 'CFF ', data: new Uint8Array(100) },
      { tag: 'head', data: new Uint8Array(54) },
    ];
    const result = assembleSfnt(tables, 0x4f54544f);

    const view = new DataView(result.buffer);
    expect(view.getUint32(0)).toBe(0x4f54544f); // OTTO
  });
});

// ---------------------------------------------------------------------------
// patchTrueTypeFont
// ---------------------------------------------------------------------------

describe('patchTrueTypeFont', () => {
  it('fixes "true" magic to 0x00010000', () => {
    const ttf = buildMinimalTTF({ magic: 0x74727565 });
    const patched = patchTrueTypeFont(ttf, 'TestFamily');

    const view = new DataView(patched.buffer, patched.byteOffset, patched.byteLength);
    expect(view.getUint32(0)).toBe(0x00010000);
  });

  it('preserves valid TrueType fonts', () => {
    const ttf = buildMinimalTTF();
    const patched = patchTrueTypeFont(ttf, 'TestFamily');

    const view = new DataView(patched.buffer, patched.byteOffset, patched.byteLength);
    expect(view.getUint32(0)).toBe(0x00010000);
  });

  it('adds OS/2 table when missing', () => {
    const ttf = buildMinimalTTF({ includeOS2: false });
    const patched = patchTrueTypeFont(ttf, 'TestFamily');

    // Verify OS/2 tag exists in patched font
    const view = new DataView(patched.buffer, patched.byteOffset, patched.byteLength);
    const numTables = view.getUint16(4);
    let hasOS2 = false;
    for (let i = 0; i < numTables; i++) {
      const off = 12 + i * 16;
      const tag = String.fromCharCode(patched[off], patched[off + 1], patched[off + 2], patched[off + 3]);
      if (tag === 'OS/2') hasOS2 = true;
    }
    expect(hasOS2).toBe(true);
  });

  it('rebuilds cmap from charCodeToUnicode', () => {
    const ttf = buildMinimalTTF();
    const cmap = new Map<number, string>([
      [65, 'A'],
      [66, 'B'],
    ]);
    const patched = patchTrueTypeFont(ttf, 'TestFamily', cmap);
    expect(patched.length).toBeGreaterThan(0);
  });

  it('returns original bytes for non-TrueType input', () => {
    const bytes = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    const result = patchTrueTypeFont(bytes, 'Test');
    expect(result).toBe(bytes);
  });
});

// ---------------------------------------------------------------------------
// wrapCFFInOTF
// ---------------------------------------------------------------------------

describe('wrapCFFInOTF', () => {
  it('wraps raw CFF in OTTO sfnt container', () => {
    // Minimal fake CFF data (just enough to not crash)
    const cffBytes = new Uint8Array(100);
    cffBytes[0] = 1; // major version

    const result = wrapCFFInOTF(cffBytes, 'TestCFF', {
      ascender: 800,
      descender: -200,
      unitsPerEm: 1000,
      numGlyphs: 10,
    });

    // Verify OTTO magic
    const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
    expect(view.getUint32(0)).toBe(0x4f54544f);

    // Verify CFF table is present
    const numTables = view.getUint16(4);
    let hasCFF = false;
    for (let i = 0; i < numTables; i++) {
      const off = 12 + i * 16;
      const tag = String.fromCharCode(result[off], result[off + 1], result[off + 2], result[off + 3]);
      if (tag === 'CFF ') hasCFF = true;
    }
    expect(hasCFF).toBe(true);
  });

  it('includes cmap from charCodeToUnicode', () => {
    const cffBytes = new Uint8Array(50);
    cffBytes[0] = 1;

    const cmap = new Map<number, string>([
      [1, 'A'],
      [2, 'B'],
    ]);

    const result = wrapCFFInOTF(
      cffBytes,
      'TestCFF',
      { ascender: 800, descender: -200, unitsPerEm: 1000, numGlyphs: 10 },
      cmap,
    );

    expect(result.length).toBeGreaterThan(0);
    const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
    expect(view.getUint32(0)).toBe(0x4f54544f);
  });
});

// ---------------------------------------------------------------------------
// patchFont (unified entry point)
// ---------------------------------------------------------------------------

describe('patchFont', () => {
  it('dispatches TrueType fonts', () => {
    const ttf = buildMinimalTTF();
    const { format } = patchFont(ttf, 'Test');
    expect(format).toBe('TrueType');
  });

  it('dispatches raw CFF fonts', () => {
    const cff = new Uint8Array(50);
    cff[0] = 1; // CFF magic
    const { format, bytes } = patchFont(cff, 'Test', 'CFF', undefined, {
      ascender: 800,
      descender: -200,
      unitsPerEm: 1000,
    });
    expect(format).toBe('CFF-wrapped');
    // Should now be OTTO
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0)).toBe(0x4f54544f);
  });

  it('returns unknown format for unrecognized bytes', () => {
    const { format, bytes } = patchFont(new Uint8Array([0xff, 0xff, 0xff, 0xff]), 'Test');
    expect(format).toBe('unknown');
  });
});
