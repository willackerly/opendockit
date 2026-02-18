#!/usr/bin/env node
/**
 * extract-font-metrics.mjs — Extract font metrics from TTF/OTF files.
 *
 * Reads font files, extracts advance widths per codepoint, and outputs
 * a TypeScript file with a precomputed metrics bundle.
 *
 * Usage:
 *   node scripts/extract-font-metrics.mjs \
 *     --map "Calibri=fonts/Carlito-Regular.ttf:regular,fonts/Carlito-Bold.ttf:bold,fonts/Carlito-Italic.ttf:italic,fonts/Carlito-BoldItalic.ttf:boldItalic" \
 *     --map "Cambria=fonts/Caladea-Regular.ttf:regular,fonts/Caladea-Bold.ttf:bold" \
 *     --output packages/core/src/font/data/metrics-bundle.ts
 *
 * Each --map argument specifies: TargetFamilyName=file:style,file:style,...
 * Styles: regular, bold, italic, boldItalic
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Minimal TrueType/CFF parser (inline to avoid TS compilation dependency)
// ---------------------------------------------------------------------------

function getUint16(dv, off) {
  return dv.getUint16(off, false);
}
function getInt16(dv, off) {
  return dv.getInt16(off, false);
}
function getUint32(dv, off) {
  return dv.getUint32(off, false);
}

function parseCmapFormat4(dv, offset) {
  const segCount = getUint16(dv, offset + 6) / 2;
  const cmap = new Map();
  const endCodeBase = offset + 14;
  const startCodeBase = endCodeBase + segCount * 2 + 2;
  const idDeltaBase = startCodeBase + segCount * 2;
  const idRangeOffsetBase = idDeltaBase + segCount * 2;

  for (let seg = 0; seg < segCount; seg++) {
    const endCode = getUint16(dv, endCodeBase + seg * 2);
    const startCode = getUint16(dv, startCodeBase + seg * 2);
    const idDelta = getInt16(dv, idDeltaBase + seg * 2);
    const idRangeOffset = getUint16(dv, idRangeOffsetBase + seg * 2);
    if (startCode === 0xffff) break;

    for (let code = startCode; code <= endCode; code++) {
      let gid;
      if (idRangeOffset === 0) {
        gid = (code + idDelta) & 0xffff;
      } else {
        const addr = idRangeOffsetBase + seg * 2 + idRangeOffset + (code - startCode) * 2;
        gid = getUint16(dv, addr);
        if (gid !== 0) gid = (gid + idDelta) & 0xffff;
      }
      if (gid !== 0) cmap.set(code, gid);
    }
  }
  return cmap;
}

function parseCmap(dv, tableOffset) {
  const numSubtables = getUint16(dv, tableOffset + 2);
  let fmt4Off = -1;

  for (let i = 0; i < numSubtables; i++) {
    const so = tableOffset + 4 + i * 8;
    const pid = getUint16(dv, so);
    const eid = getUint16(dv, so + 2);
    const off = getUint32(dv, so + 4);

    if ((pid === 3 && eid === 1) || (pid === 0 && (eid === 0 || eid === 1 || eid === 3))) {
      const abs = tableOffset + off;
      if (getUint16(dv, abs) === 4) {
        fmt4Off = abs;
        if (pid === 3) break;
      }
    }
  }

  if (fmt4Off === -1) throw new Error('No cmap format 4 subtable found');
  return parseCmapFormat4(dv, fmt4Off);
}

function parseNameTable(dv, bytes, tableOffset) {
  const count = getUint16(dv, tableOffset + 2);
  const strOff = tableOffset + getUint16(dv, tableOffset + 4);
  let postScriptName = 'Unknown';
  let fontFamily = 'Unknown';

  for (let i = 0; i < count; i++) {
    const ro = tableOffset + 6 + i * 12;
    const pid = getUint16(dv, ro);
    const eid = getUint16(dv, ro + 2);
    const nid = getUint16(dv, ro + 6);
    const len = getUint16(dv, ro + 8);
    const off = getUint16(dv, ro + 10);
    if (nid !== 1 && nid !== 6) continue;

    const start = strOff + off;
    if (start + len > bytes.length) continue;

    let str;
    if ((pid === 3 && eid === 1) || pid === 0) {
      const chars = [];
      for (let j = 0; j < len; j += 2) {
        chars.push(String.fromCharCode((bytes[start + j] << 8) | bytes[start + j + 1]));
      }
      str = chars.join('');
    } else if (pid === 1 && eid === 0) {
      const chars = [];
      for (let j = 0; j < len; j++) chars.push(String.fromCharCode(bytes[start + j]));
      str = chars.join('');
    } else {
      continue;
    }

    if (nid === 6) postScriptName = str;
    else if (nid === 1) fontFamily = str;
  }

  return { postScriptName, fontFamily };
}

function parseFont(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sig = getUint32(dv, 0);

  // Accept both TTF and OTTO signatures
  const isTTF = sig === 0x00010000 || sig === 0x74727565;
  const isOTTO = sig === 0x4f54544f;
  if (!isTTF && !isOTTO) {
    throw new Error(`Unsupported font signature: 0x${sig.toString(16).padStart(8, '0')}`);
  }

  const numTables = getUint16(dv, 4);
  const tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const ro = 12 + i * 16;
    if (ro + 16 > bytes.length) break;
    const tag = String.fromCharCode(bytes[ro], bytes[ro + 1], bytes[ro + 2], bytes[ro + 3]);
    tables.set(tag, { offset: getUint32(dv, ro + 8), length: getUint32(dv, ro + 12) });
  }

  const head = tables.get('head');
  const hhea = tables.get('hhea');
  const hmtx = tables.get('hmtx');
  const maxp = tables.get('maxp');
  const cmap = tables.get('cmap');
  const name = tables.get('name');
  const os2 = tables.get('OS/2');

  if (!head || !hhea || !hmtx || !maxp || !cmap || !name) {
    throw new Error('Missing required font tables');
  }

  const unitsPerEm = getUint16(dv, head.offset + 18);
  const hheaAsc = getInt16(dv, hhea.offset + 4);
  const hheaDesc = getInt16(dv, hhea.offset + 6);
  const hheaLineGap = getInt16(dv, hhea.offset + 8);
  const numHMetrics = getUint16(dv, hhea.offset + 34);
  const numGlyphs = getUint16(dv, maxp.offset + 4);

  // hmtx
  const widths = new Uint16Array(numGlyphs);
  let lastW = 0;
  for (let i = 0; i < numGlyphs; i++) {
    if (i < numHMetrics) {
      lastW = getUint16(dv, hmtx.offset + i * 4);
    }
    widths[i] = lastW;
  }

  const cmapResult = parseCmap(dv, cmap.offset);
  const { postScriptName, fontFamily } = parseNameTable(dv, bytes, name.offset);

  let ascender = hheaAsc;
  let descender = hheaDesc;
  let capHeight = hheaAsc;

  if (os2 && os2.length >= 78) {
    ascender = getInt16(dv, os2.offset + 68);
    descender = getInt16(dv, os2.offset + 70);
    if (os2.length >= 96 && getUint16(dv, os2.offset) >= 2) {
      capHeight = getInt16(dv, os2.offset + 88);
    } else {
      capHeight = ascender;
    }
  }

  return {
    postScriptName,
    fontFamily,
    unitsPerEm,
    ascender,
    descender,
    capHeight,
    hheaLineGap,
    numGlyphs,
    cmap: cmapResult,
    advanceWidths: widths,
  };
}

// ---------------------------------------------------------------------------
// Metrics extraction
// ---------------------------------------------------------------------------

/**
 * Extract metrics from a font file into a FontFaceMetrics object.
 *
 * @param {string} filePath - Path to TTF/OTF file
 * @param {string} targetFamily - The OOXML font family name to map to
 * @param {string} style - One of: regular, bold, italic, boldItalic
 * @param {number[]} codepointRanges - Ranges of codepoints to extract [start, end, start, end, ...]
 */
function extractMetrics(filePath, targetFamily, style, codepointRanges) {
  const bytes = new Uint8Array(readFileSync(resolve(ROOT, filePath)));
  const font = parseFont(bytes);

  console.log(
    `  ${style}: ${font.fontFamily} (${font.postScriptName}), ${font.numGlyphs} glyphs, ${font.cmap.size} cmap entries`
  );

  // Build width map for requested codepoint ranges
  const widths = {};
  let mappedCount = 0;

  for (let r = 0; r < codepointRanges.length; r += 2) {
    const start = codepointRanges[r];
    const end = codepointRanges[r + 1];
    for (let cp = start; cp <= end; cp++) {
      const gid = font.cmap.get(cp);
      if (gid !== undefined && gid < font.advanceWidths.length) {
        widths[cp] = font.advanceWidths[gid];
        mappedCount++;
      }
    }
  }

  // Compute default width as the width of space (U+0020) or median
  const spaceGid = font.cmap.get(0x20);
  const defaultWidth =
    spaceGid !== undefined ? font.advanceWidths[spaceGid] : Math.round(font.unitsPerEm * 0.25);

  // Compute normalized lineHeight and lineGap following the pdf.js pattern:
  //   lineHeight = (ascender + |descender| + lineGap) / unitsPerEm
  //   lineGap = hheaLineGap / unitsPerEm
  const lineHeight =
    (font.ascender + Math.abs(font.descender) + font.hheaLineGap) / font.unitsPerEm;
  const lineGapNorm = font.hheaLineGap / font.unitsPerEm;

  console.log(
    `    ${mappedCount} codepoints extracted, defaultWidth=${defaultWidth}, lineHeight=${lineHeight.toFixed(4)}, lineGap=${lineGapNorm.toFixed(4)}`
  );

  return {
    family: targetFamily,
    style,
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender,
    descender: font.descender,
    capHeight: font.capHeight,
    lineHeight: Math.round(lineHeight * 10000) / 10000,
    lineGap: Math.round(lineGapNorm * 10000) / 10000,
    widths,
    defaultWidth,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

// Standard codepoint ranges to extract:
// Basic Latin + Latin-1 Supplement + Latin Extended-A/B + General Punctuation + Currency + Math
const STANDARD_RANGES = [
  0x0020,
  0x024f, // Basic Latin through Latin Extended-B
  0x2000,
  0x206f, // General Punctuation
  0x20a0,
  0x20cf, // Currency Symbols
  0x2100,
  0x214f, // Letterlike Symbols
  0x2190,
  0x21ff, // Arrows
  0x2200,
  0x22ff, // Mathematical Operators
  0x2300,
  0x23ff, // Miscellaneous Technical
  0x25a0,
  0x25ff, // Geometric Shapes
  0x2600,
  0x26ff, // Miscellaneous Symbols
  0xfb00,
  0xfb06, // Alphabetic Presentation Forms (ligatures)
  0xfeff,
  0xfeff, // BOM / ZWNBS
  0xfffc,
  0xfffd, // Replacement characters
];

function main() {
  const args = process.argv.slice(2);
  const mappings = [];
  let outputPath = 'packages/core/src/font/data/metrics-bundle.ts';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--map' && args[i + 1]) {
      mappings.push(args[++i]);
    } else if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[++i];
    } else if (args[i] === '--help') {
      console.log(
        `Usage: node extract-font-metrics.mjs --map "Family=file:style,..." --output <path>`
      );
      process.exit(0);
    }
  }

  if (mappings.length === 0) {
    console.error('Error: No --map arguments provided.');
    process.exit(1);
  }

  const bundle = { version: 1, fonts: {} };

  for (const mapping of mappings) {
    const eqIdx = mapping.indexOf('=');
    if (eqIdx === -1) {
      console.error(`Invalid mapping: ${mapping}`);
      process.exit(1);
    }

    const targetFamily = mapping.slice(0, eqIdx);
    const entries = mapping.slice(eqIdx + 1).split(',');
    const familyKey = targetFamily.toLowerCase();

    console.log(`\nExtracting metrics for "${targetFamily}":`);
    bundle.fonts[familyKey] = [];

    for (const entry of entries) {
      const colonIdx = entry.lastIndexOf(':');
      if (colonIdx === -1) {
        console.error(`Invalid entry (missing :style): ${entry}`);
        process.exit(1);
      }

      const filePath = entry.slice(0, colonIdx);
      const style = entry.slice(colonIdx + 1);

      if (!['regular', 'bold', 'italic', 'boldItalic'].includes(style)) {
        console.error(`Invalid style "${style}" — must be: regular, bold, italic, boldItalic`);
        process.exit(1);
      }

      const metrics = extractMetrics(filePath, targetFamily, style, STANDARD_RANGES);
      bundle.fonts[familyKey].push(metrics);
    }
  }

  // Generate TypeScript output
  const ts = generateTypeScript(bundle);
  const fullPath = resolve(ROOT, outputPath);
  writeFileSync(fullPath, ts, 'utf-8');

  // Size stats
  const rawSize = Buffer.byteLength(ts, 'utf-8');
  console.log(`\nWrote ${fullPath}`);
  console.log(`  Raw size: ${(rawSize / 1024).toFixed(1)} KB`);
  console.log(`  Families: ${Object.keys(bundle.fonts).length}`);
  const totalFaces = Object.values(bundle.fonts).reduce((s, f) => s + f.length, 0);
  console.log(`  Faces: ${totalFaces}`);
}

function generateTypeScript(bundle) {
  const lines = [];
  lines.push(`/**`);
  lines.push(` * Precomputed font metrics bundle — auto-generated.`);
  lines.push(` *`);
  lines.push(` * Generated by: node scripts/extract-font-metrics.mjs`);
  lines.push(` * Date: ${new Date().toISOString().slice(0, 10)}`);
  lines.push(` *`);
  lines.push(` * Contains advance widths extracted from metric-compatible OFL fonts:`);
  for (const [family, faces] of Object.entries(bundle.fonts)) {
    const styles = faces.map((f) => f.style).join(', ');
    lines.push(` *   ${family}: ${styles}`);
  }
  lines.push(` *`);
  lines.push(` * Font metrics are dimensional data (not copyrightable creative expression).`);
  lines.push(` */`);
  lines.push(``);
  lines.push(`import type { FontMetricsBundle } from '../font-metrics-db.js';`);
  lines.push(``);
  lines.push(`// prettier-ignore`);
  lines.push(`export const metricsBundle: FontMetricsBundle = ${JSON.stringify(bundle, null, 2)};`);

  // The JSON will be large, so compress the widths objects to single lines
  let result = lines.join('\n') + '\n';

  // Compress widths objects: replace multi-line widths with single-line
  result = result.replace(/"widths": \{[^}]+\}/g, (match) => {
    // Parse and re-stringify as single line
    const obj = JSON.parse(match.replace('"widths": ', ''));
    return `"widths": ${JSON.stringify(obj)}`;
  });

  return result;
}

main();
