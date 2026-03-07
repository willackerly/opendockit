/**
 * ICCProfile — minimal sRGB ICC v2 color profile for PDF/A compliance.
 *
 * PDF/A requires an /OutputIntents array with an ICC color profile.
 * This module generates a minimal valid sRGB IEC61966-2.1 ICC v2.1 profile
 * (~412 bytes) that satisfies PDF/A validators.
 *
 * The profile is built programmatically following the ICC v2 specification
 * (ICC.1:2001-04). It contains:
 *   - Header (128 bytes)
 *   - Tag table (4 tags: desc, wtpt, cprt, rXYZ/gXYZ/bXYZ/rTRC/gTRC/bTRC)
 *
 * For PDF/A compliance, the key requirement is that the profile declares
 * the sRGB color space (RGB, D65 illuminant).
 */

/**
 * Build a minimal sRGB ICC v2 profile.
 *
 * This generates the profile at runtime to avoid storing a large binary blob.
 * The output is a valid ICC v2.1 profile suitable for PDF/A /OutputIntents.
 */
export function buildSRGBICCProfile(): Uint8Array {
  // sRGB IEC61966-2.1 primaries + whitepoint in ICC XYZNumber format
  // All values are s15Fixed16Number (4 bytes, fixed point with 16 fractional bits)
  //
  // D65 whitepoint: X=0.9505, Y=1.0000, Z=1.0890
  // sRGB Red:       X=0.4124, Y=0.2126, Z=0.0193
  // sRGB Green:     X=0.3576, Y=0.7152, Z=0.1192
  // sRGB Blue:      X=0.1805, Y=0.0722, Z=0.9505

  const desc = encodeDescTag('sRGB IEC61966-2.1');
  const cprt = encodeTextTag('No copyright, use freely');
  const wtpt = encodeXYZTag(0.9505, 1.0, 1.089);
  const rXYZ = encodeXYZTag(0.4124, 0.2126, 0.0193);
  const gXYZ = encodeXYZTag(0.3576, 0.7152, 0.1192);
  const bXYZ = encodeXYZTag(0.1805, 0.0722, 0.9505);
  // sRGB gamma = 2.2 (approximation; true sRGB uses a piecewise function,
  // but a simple gamma curve satisfies PDF/A validators)
  const trc = encodeCurveTag(2.2);

  // Tags: desc, cprt, wtpt, rXYZ, gXYZ, bXYZ, rTRC, gTRC, bTRC (9 tags)
  const tagCount = 9;
  const tagTableSize = 4 + tagCount * 12; // 4 bytes count + 12 per tag
  const headerSize = 128;

  // Calculate offsets — data starts after header + tag table
  let dataOffset = headerSize + tagTableSize;
  // Pad to 4-byte boundary
  dataOffset = align4(dataOffset);

  // Build tag data entries with offsets
  const tags: Array<{ sig: string; data: Uint8Array; offset: number }> = [];
  let currentOffset = dataOffset;

  function addTag(sig: string, data: Uint8Array): void {
    tags.push({ sig, data, offset: currentOffset });
    currentOffset += align4(data.length);
  }

  addTag('desc', desc);
  addTag('cprt', cprt);
  addTag('wtpt', wtpt);
  addTag('rXYZ', rXYZ);
  addTag('gXYZ', gXYZ);
  addTag('bXYZ', bXYZ);
  // rTRC, gTRC, bTRC all share the same curve data — but for simplicity
  // we write them as separate entries pointing to the same offset.
  // Actually, let's just add the TRC data once and have all three tags point to it.
  const trcOffset = currentOffset;
  const trcEntry = { sig: 'rTRC', data: trc, offset: trcOffset };
  tags.push(trcEntry);
  currentOffset += align4(trc.length);

  const totalSize = currentOffset;

  // Allocate buffer
  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);

  // --- Header (128 bytes) ---
  // Profile size
  view.setUint32(0, totalSize);
  // Preferred CMM type (leave 0)
  // Profile version: 2.1.0
  view.setUint8(8, 2);   // major
  view.setUint8(9, 0x10); // minor.bugfix (2.1.0)
  // Profile/Device class: 'mntr' (monitor)
  writeASCII(buf, 12, 'mntr');
  // Color space: 'RGB '
  writeASCII(buf, 16, 'RGB ');
  // PCS: 'XYZ '
  writeASCII(buf, 20, 'XYZ ');
  // Date/time: 2000-01-01 00:00:00
  view.setUint16(24, 2000); // year
  view.setUint16(26, 1);    // month
  view.setUint16(28, 1);    // day
  // hours/minutes/seconds = 0 (already zeroed)
  // Profile file signature: 'acsp'
  writeASCII(buf, 36, 'acsp');
  // Primary platform: 'APPL' (Apple — commonly used for sRGB)
  writeASCII(buf, 40, 'APPL');
  // Profile flags, device manufacturer, device model: 0 (already zeroed)
  // Rendering intent: 0 = Perceptual
  view.setUint32(64, 0);
  // PCS illuminant (D50): X=0.9642, Y=1.0, Z=0.8249
  writeS15Fixed16(view, 68, 0.9642);
  writeS15Fixed16(view, 72, 1.0);
  writeS15Fixed16(view, 76, 0.8249);
  // Profile creator: leave 0

  // --- Tag Table ---
  const tableStart = headerSize;
  view.setUint32(tableStart, tagCount);

  let tablePos = tableStart + 4;

  // Helper to write a tag table entry (12 bytes: sig, offset, size)
  function writeTagEntry(sig: string, offset: number, size: number): void {
    writeASCII(buf, tablePos, sig);
    view.setUint32(tablePos + 4, offset);
    view.setUint32(tablePos + 8, size);
    tablePos += 12;
  }

  // Write tag table entries
  for (const tag of tags) {
    writeTagEntry(tag.sig, tag.offset, tag.data.length);
  }
  // gTRC and bTRC share the same data as rTRC
  writeTagEntry('gTRC', trcOffset, trc.length);
  writeTagEntry('bTRC', trcOffset, trc.length);

  // --- Tag Data ---
  for (const tag of tags) {
    buf.set(tag.data, tag.offset);
  }

  return buf;
}

// ---------------------------------------------------------------------------
// ICC tag encoding helpers
// ---------------------------------------------------------------------------

/** Encode a 'desc' (textDescription) tag. */
function encodeDescTag(text: string): Uint8Array {
  // Type signature: 'desc' (4 bytes)
  // Reserved: 0 (4 bytes)
  // ASCII count: text.length + 1 (4 bytes)
  // ASCII data: text + NUL
  // Unicode count: 0 (4 bytes)
  // ScriptCode count: 0 (2 bytes) + filler (67 bytes)
  const asciiLen = text.length + 1; // include NUL
  const size = 4 + 4 + 4 + asciiLen + 4 + 4 + 2 + 67;
  const buf = new Uint8Array(size);
  const view = new DataView(buf.buffer);

  writeASCII(buf, 0, 'desc');
  // reserved = 0
  view.setUint32(8, asciiLen);
  for (let i = 0; i < text.length; i++) {
    buf[12 + i] = text.charCodeAt(i);
  }
  // NUL terminator already 0
  // Unicode count = 0, ScriptCode count = 0 — already zeroed

  return buf;
}

/** Encode a 'text' tag (simple ASCII). */
function encodeTextTag(text: string): Uint8Array {
  // Type signature: 'text' (4 bytes)
  // Reserved: 0 (4 bytes)
  // Text data + NUL
  const size = 4 + 4 + text.length + 1;
  const buf = new Uint8Array(size);

  writeASCII(buf, 0, 'text');
  for (let i = 0; i < text.length; i++) {
    buf[8 + i] = text.charCodeAt(i);
  }
  return buf;
}

/** Encode an 'XYZ ' tag (one XYZ triplet). */
function encodeXYZTag(x: number, y: number, z: number): Uint8Array {
  // Type signature: 'XYZ ' (4 bytes)
  // Reserved: 0 (4 bytes)
  // XYZ data: 3 x s15Fixed16Number (12 bytes)
  const buf = new Uint8Array(20);
  const view = new DataView(buf.buffer);

  writeASCII(buf, 0, 'XYZ ');
  writeS15Fixed16(view, 8, x);
  writeS15Fixed16(view, 12, y);
  writeS15Fixed16(view, 16, z);

  return buf;
}

/** Encode a 'curv' tag (parametric gamma curve with a single gamma value). */
function encodeCurveTag(gamma: number): Uint8Array {
  // Type signature: 'curv' (4 bytes)
  // Reserved: 0 (4 bytes)
  // Curve entry count: 1 (4 bytes)
  // Gamma value as u8Fixed8Number (2 bytes)
  const buf = new Uint8Array(14);
  const view = new DataView(buf.buffer);

  writeASCII(buf, 0, 'curv');
  // reserved = 0
  view.setUint32(8, 1); // 1 entry = gamma
  // u8Fixed8Number: integer part in high byte, fractional in low byte
  const intPart = Math.floor(gamma);
  const fracPart = Math.round((gamma - intPart) * 256);
  view.setUint8(12, intPart);
  view.setUint8(13, fracPart);

  return buf;
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

/** Write ASCII string to buffer at offset. */
function writeASCII(buf: Uint8Array, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    buf[offset + i] = str.charCodeAt(i);
  }
}

/** Write s15Fixed16Number (signed, 16.16 fixed point). */
function writeS15Fixed16(view: DataView, offset: number, value: number): void {
  const fixed = Math.round(value * 65536);
  view.setInt32(offset, fixed);
}

/** Align to 4-byte boundary. */
function align4(n: number): number {
  return (n + 3) & ~3;
}
