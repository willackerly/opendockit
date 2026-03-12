#!/usr/bin/env node
/**
 * encode-metrics.mjs — Encode the font metrics bundle into delta+varint binary format.
 *
 * Reads the current metrics-bundle.ts, extracts the JSON object literal,
 * encodes it as binary (delta+varint), base64-encodes it, and writes
 * a new metrics-bundle.ts that imports the decoder.
 *
 * Usage: node scripts/encode-metrics.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const BUNDLE_PATH = resolve(ROOT, 'packages/core/src/font/data/metrics-bundle.ts');

// ---------------------------------------------------------------------------
// 1. Extract the JSON data from the TS file
// ---------------------------------------------------------------------------

const tsSource = readFileSync(BUNDLE_PATH, 'utf-8');

// Find the object literal — starts after `= {` and ends at the file-final `};`
const startIdx = tsSource.indexOf('= {');
if (startIdx === -1) {
  console.error('Could not find object literal start in metrics-bundle.ts');
  process.exit(1);
}

// Extract from `{` to the matching `};`
const jsonStart = startIdx + 2; // points to `{`
const jsonEnd = tsSource.lastIndexOf('};');
if (jsonEnd === -1) {
  console.error('Could not find object literal end in metrics-bundle.ts');
  process.exit(1);
}

const jsonStr = tsSource.slice(jsonStart, jsonEnd + 1); // includes the `}`
let bundle;
try {
  bundle = JSON.parse(jsonStr);
} catch (e) {
  console.error('Failed to parse extracted JSON:', e.message);
  process.exit(1);
}

console.log(
  `Parsed bundle: version=${bundle.version}, families=${Object.keys(bundle.fonts).length}`
);

// Count total faces
let totalFaces = 0;
for (const faces of Object.values(bundle.fonts)) {
  totalFaces += faces.length;
}
console.log(`Total faces: ${totalFaces}`);

// ---------------------------------------------------------------------------
// 2. Encode to binary
// ---------------------------------------------------------------------------

const STYLE_MAP = { regular: 0, bold: 1, italic: 2, boldItalic: 3 };

/** Encode unsigned integer as LEB128 varint. */
function writeVarint(buf, offset, value) {
  value = value >>> 0; // ensure unsigned
  while (value >= 0x80) {
    buf[offset++] = (value & 0x7f) | 0x80;
    value >>>= 7;
  }
  buf[offset++] = value;
  return offset;
}

/** Zigzag encode a signed integer. */
function zigzagEncode(n) {
  return (n << 1) ^ (n >> 31);
}

/** Write a float32 (little-endian). */
function writeFloat32(buf, offset, value) {
  const view = new DataView(buf.buffer, offset, 4);
  view.setFloat32(0, value, true);
  return offset + 4;
}

// Allocate a generous buffer (original is 786KB text, binary will be much smaller)
const buf = new Uint8Array(2 * 1024 * 1024);
let offset = 0;

// Version byte
buf[offset++] = bundle.version;

// Face count
offset = writeVarint(buf, offset, totalFaces);

// Encode each face
for (const [familyKey, faces] of Object.entries(bundle.fonts)) {
  for (const face of faces) {
    // Family name (UTF-8)
    const nameBytes = new TextEncoder().encode(face.family);
    offset = writeVarint(buf, offset, nameBytes.length);
    buf.set(nameBytes, offset);
    offset += nameBytes.length;

    // Style enum
    buf[offset++] = STYLE_MAP[face.style];

    // Vertical metrics
    offset = writeVarint(buf, offset, face.unitsPerEm);
    offset = writeVarint(buf, offset, zigzagEncode(face.ascender));
    offset = writeVarint(buf, offset, zigzagEncode(face.descender));
    offset = writeVarint(buf, offset, zigzagEncode(face.capHeight));

    // Presence flags + lineHeight and lineGap as float32
    const hasLH = face.lineHeight != null;
    const hasLG = face.lineGap != null;
    buf[offset++] = (hasLH ? 1 : 0) | (hasLG ? 2 : 0);
    if (hasLH) offset = writeFloat32(buf, offset, face.lineHeight);
    if (hasLG) offset = writeFloat32(buf, offset, face.lineGap);

    // Default width
    offset = writeVarint(buf, offset, face.defaultWidth);

    // Width entries — sort by codepoint, delta encode
    const codepoints = Object.keys(face.widths)
      .map(Number)
      .sort((a, b) => a - b);

    offset = writeVarint(buf, offset, codepoints.length);

    let prevCp = 0;
    for (const cp of codepoints) {
      const delta = cp - prevCp;
      offset = writeVarint(buf, offset, delta);
      offset = writeVarint(buf, offset, face.widths[cp]);
      prevCp = cp;
    }
  }
}

const binaryData = buf.slice(0, offset);
const base64 = Buffer.from(binaryData).toString('base64');

console.log(`Binary size: ${binaryData.length} bytes`);
console.log(`Base64 size: ${base64.length} chars`);

// ---------------------------------------------------------------------------
// 3. Write the new metrics-bundle.ts
// ---------------------------------------------------------------------------

// Split base64 into 100-char lines for readability
const LINE_WIDTH = 100;
const lines = [];
for (let i = 0; i < base64.length; i += LINE_WIDTH) {
  lines.push(base64.slice(i, i + LINE_WIDTH));
}

const newSource = `/**
 * Precomputed font metrics bundle — auto-generated.
 *
 * Binary format: delta+varint encoded, base64 wrapped.
 * Decoded at import time by metrics-decoder.ts.
 *
 * To regenerate: node scripts/encode-metrics.mjs
 */

import type { FontMetricsBundle } from '../font-metrics-db.js';
import { decodeMetricsBundle } from './metrics-decoder.js';

// prettier-ignore
const METRICS_DATA_B64 =
  '${lines.join("' +\n  '")}';

export const metricsBundle: FontMetricsBundle = decodeMetricsBundle(METRICS_DATA_B64);
`;

writeFileSync(BUNDLE_PATH, newSource, 'utf-8');

const newSize = Buffer.byteLength(newSource, 'utf-8');
console.log(`\nNew metrics-bundle.ts: ${newSize} bytes (was 786,073 bytes)`);
console.log(`Reduction: ${((1 - newSize / 786073) * 100).toFixed(1)}%`);
