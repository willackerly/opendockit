/**
 * Decoder for delta+varint-encoded font metrics binary data.
 *
 * Binary format:
 *   [1 byte]  version
 *   [varint]  face count
 *   Per face:
 *     [varint]  family name byte length
 *     [N bytes] family name (UTF-8)
 *     [1 byte]  style enum (0=regular, 1=bold, 2=italic, 3=boldItalic)
 *     [varint]  unitsPerEm
 *     [varint]  zigzag(ascender)
 *     [varint]  zigzag(descender)
 *     [varint]  zigzag(capHeight)
 *     [1 byte]  flags (bit 0 = hasLineHeight, bit 1 = hasLineGap)
 *     [4 bytes] lineHeight as float32 (only if flag bit 0 set)
 *     [4 bytes] lineGap as float32 (only if flag bit 1 set)
 *     [varint]  defaultWidth
 *     [varint]  width entry count
 *     Per width entry (sorted by codepoint ascending):
 *       [varint] codepoint delta (first absolute, rest delta from previous)
 *       [varint] width value
 */

import type { FontMetricsBundle, FontFaceMetrics } from '../font-metrics-db.js';

const STYLE_NAMES: readonly FontFaceMetrics['style'][] = [
  'regular',
  'bold',
  'italic',
  'boldItalic',
] as const;

/** Decode a base64-encoded metrics bundle. */
export function decodeMetricsBundle(base64: string): FontMetricsBundle {
  const bin = base64ToBytes(base64);
  let offset = 0;

  // Version
  const version = bin[offset++];

  // Face count
  let faceCount: number;
  [faceCount, offset] = readVarint(bin, offset);

  const fonts: Record<string, FontFaceMetrics[]> = {};

  for (let i = 0; i < faceCount; i++) {
    // Family name
    let nameLen: number;
    [nameLen, offset] = readVarint(bin, offset);
    const family = readString(bin, offset, nameLen);
    offset += nameLen;

    // Style
    const styleIdx = bin[offset++];
    const style = STYLE_NAMES[styleIdx];

    // Vertical metrics
    let unitsPerEm: number;
    [unitsPerEm, offset] = readVarint(bin, offset);

    let ascRaw: number;
    [ascRaw, offset] = readVarint(bin, offset);
    const ascender = zigzagDecode(ascRaw);

    let descRaw: number;
    [descRaw, offset] = readVarint(bin, offset);
    const descender = zigzagDecode(descRaw);

    let capRaw: number;
    [capRaw, offset] = readVarint(bin, offset);
    const capHeight = zigzagDecode(capRaw);

    // Presence flags + lineHeight and lineGap as float32
    const flags = bin[offset++];
    let lineHeight: number | undefined;
    let lineGap: number | undefined;
    if (flags & 1) {
      lineHeight = roundFloat(readFloat32(bin, offset));
      offset += 4;
    }
    if (flags & 2) {
      lineGap = roundFloat(readFloat32(bin, offset));
      offset += 4;
    }

    // Default width
    let defaultWidth: number;
    [defaultWidth, offset] = readVarint(bin, offset);

    // Width entries (delta-encoded codepoints)
    let widthCount: number;
    [widthCount, offset] = readVarint(bin, offset);

    const widths: Record<string, number> = {};
    let prevCp = 0;
    for (let w = 0; w < widthCount; w++) {
      let delta: number;
      [delta, offset] = readVarint(bin, offset);
      prevCp += delta;
      let width: number;
      [width, offset] = readVarint(bin, offset);
      widths[prevCp] = width;
    }

    const face: FontFaceMetrics = {
      family,
      style,
      unitsPerEm,
      ascender,
      descender,
      capHeight,
      widths,
      defaultWidth,
    };

    if (lineHeight !== undefined) face.lineHeight = lineHeight;
    if (lineGap !== undefined) face.lineGap = lineGap;

    const key = family.toLowerCase();
    if (!fonts[key]) fonts[key] = [];
    fonts[key].push(face);
  }

  return { version, fonts };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round a float32 to 4 decimal places to match original precision. */
function roundFloat(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/** Read an unsigned LEB128 varint. Returns [value, newOffset]. */
function readVarint(buf: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let b: number;
  do {
    b = buf[offset++];
    result |= (b & 0x7f) << shift;
    shift += 7;
  } while (b & 0x80);
  return [result >>> 0, offset];
}

/** Decode zigzag-encoded signed integer. */
function zigzagDecode(n: number): number {
  return (n >>> 1) ^ -(n & 1);
}

/** Read a float32 (little-endian) from a Uint8Array. */
function readFloat32(buf: Uint8Array, offset: number): number {
  const view = new DataView(buf.buffer, buf.byteOffset + offset, 4);
  return view.getFloat32(0, true);
}

/** Read a UTF-8 string from a Uint8Array. */
function readString(buf: Uint8Array, offset: number, length: number): string {
  // Use TextDecoder if available, otherwise manual decode
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(buf.subarray(offset, offset + length));
  }
  // Fallback for environments without TextDecoder
  let str = '';
  for (let i = offset; i < offset + length; i++) {
    str += String.fromCharCode(buf[i]);
  }
  return str;
}

/** Decode base64 string to Uint8Array. */
function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i);
    }
    return bytes;
  }
  // Node.js fallback
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
