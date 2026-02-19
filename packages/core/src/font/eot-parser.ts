/**
 * EOT (Embedded OpenType) font extraction.
 *
 * PPTX files embed fonts as `.fntdata` files which use the EOT container
 * format — a variable-length header wrapping raw OpenType (TTF/OTF) data.
 * This module strips the EOT header to recover the underlying font.
 *
 * Also handles ODTTF (obfuscated TTF) fonts which XOR the first 32 bytes
 * with a GUID-derived key.
 *
 * Reference: https://www.w3.org/Submission/EOT/ (EOT spec)
 */

/** TrueType magic number: 0x00010000 */
const TRUETYPE_MAGIC = 0x00010000;
/** OpenType CFF magic: "OTTO" */
const CFF_MAGIC = 0x4f54544f;

/**
 * Extract raw OpenType font data from an EOT container.
 *
 * If the data is already raw OpenType (starts with TrueType or CFF magic),
 * it is returned as-is. Otherwise the EOT header is parsed and skipped.
 *
 * @param data - Raw bytes from a .fntdata or .eot file.
 * @returns The OpenType font data (TTF or OTF).
 */
export function extractFontFromEot(data: Uint8Array): Uint8Array {
  if (data.length < 4) return data;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = view.getUint32(0, false); // big-endian

  // Already raw OpenType — return as-is.
  if (magic === TRUETYPE_MAGIC || magic === CFF_MAGIC) {
    return data;
  }

  // EOT format: first 4 bytes = total file size (little-endian),
  // bytes 4-7 = font data size, bytes 8-11 = version.
  // The header contains variable-length strings (family name, style, etc.)
  // followed by the raw font data.
  if (data.length < 16) return data;

  const eotSize = view.getUint32(0, true);
  const fontDataSize = view.getUint32(4, true);
  const version = view.getUint32(8, true);

  // Sanity check
  if (eotSize > data.length || fontDataSize === 0 || fontDataSize > data.length) {
    return data;
  }

  // The font data sits at the end of the EOT file.
  // headerSize = eotSize - fontDataSize
  let headerSize: number;

  if (version === 0x00020001 || version === 0x00020002) {
    // EOT version 2: header includes a "RootString" after version 1 fields.
    headerSize = parseEotV2HeaderSize(data, view);
  } else {
    // EOT version 1 (0x00010000) or unknown: walk the fixed + variable header.
    headerSize = parseEotV1HeaderSize(data, view);
  }

  if (headerSize >= data.length || headerSize + fontDataSize > data.length) {
    // Fallback: assume font data is at (eotSize - fontDataSize).
    headerSize = eotSize - fontDataSize;
  }

  if (headerSize < 0 || headerSize >= data.length) {
    return data;
  }

  return data.subarray(headerSize, headerSize + fontDataSize);
}

/**
 * Parse EOT v1 header to find where font data starts.
 *
 * Fixed fields (82 bytes) are followed by 4 variable-length null-terminated
 * UTF-16LE strings: FamilyName, StyleName, VersionName, FullName.
 */
function parseEotV1HeaderSize(data: Uint8Array, view: DataView): number {
  // Fixed header is 82 bytes for v1.
  let offset = 82;

  // Walk 4 variable-length strings: each is preceded by a 2-byte padding
  // then the string data (null-terminated UTF-16LE).
  for (let i = 0; i < 4; i++) {
    if (offset + 2 > data.length) return offset;
    const strSize = view.getUint16(offset, true);
    offset += 2 + strSize;
  }

  // Skip 2-byte padding after strings.
  offset += 2;
  return offset;
}

/**
 * Parse EOT v2 header size. V2 adds a RootString and optional XOR key.
 */
function parseEotV2HeaderSize(data: Uint8Array, view: DataView): number {
  // Start with v1 header.
  let offset = parseEotV1HeaderSize(data, view);

  // V2 adds a RootString (2-byte length + data).
  if (offset + 2 <= data.length) {
    const rootStrSize = view.getUint16(offset, true);
    offset += 2 + rootStrSize;
  }

  // Possibly followed by a GUID-based XOR key (undocumented in some tools).
  return offset;
}

/**
 * De-obfuscate an ODTTF font by XOR-ing the first 32 bytes with a GUID key.
 *
 * OOXML spec (ECMA-376 Part 2, §15.2.13) defines obfuscation using the
 * font's relationship part name as the GUID. The GUID hex digits (without
 * hyphens) are used as a 16-byte XOR key, applied twice to the first 32 bytes.
 *
 * @param data - Raw obfuscated font bytes.
 * @param guid - The GUID string (e.g. "00B15AC3-...") from the part name.
 * @returns De-obfuscated font data.
 */
export function deobfuscateOdttf(data: Uint8Array, guid: string): Uint8Array {
  const result = new Uint8Array(data);
  const hexDigits = guid.replace(/[^0-9a-fA-F]/g, '');
  if (hexDigits.length < 32) return result;

  // Build 16-byte key from GUID hex digits (reversed byte order per spec).
  const key = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    key[15 - i] = parseInt(hexDigits.substring(i * 2, i * 2 + 2), 16);
  }

  // XOR first 32 bytes (key applied twice).
  for (let i = 0; i < 32 && i < result.length; i++) {
    result[i] ^= key[i % 16];
  }

  return result;
}
