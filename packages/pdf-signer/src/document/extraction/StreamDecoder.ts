/**
 * StreamDecoder — decompress PDF stream data based on /Filter entries.
 *
 * PDF streams can be compressed with various filters (FlateDecode, DCTDecode, etc.).
 * The full-document-loader stores raw (compressed) stream bytes in COSStream.getData().
 * This module provides decompression so text and image extractors can read the data.
 *
 * Supports:
 * - FlateDecode (zlib/deflate) with PNG predictor handling
 * - DCTDecode (JPEG) — pass-through (data IS the JPEG)
 * - JPXDecode (JPEG 2000) — pass-through
 * - ASCIIHexDecode
 * - ASCII85Decode
 * - No filter — pass-through
 * - Filter chains (multiple filters applied in order)
 */

import { inflate } from 'pako';
import {
  COSName,
  COSArray,
  COSInteger,
  COSDictionary,
  COSStream,
} from '../../pdfbox/cos/COSTypes.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get decompressed stream data. Applies all filters in the filter chain.
 * For JPEG streams (DCTDecode), this returns the raw JPEG bytes (no decompression needed).
 */
export function getDecompressedStreamData(stream: COSStream): Uint8Array {
  const data = stream.getData();
  if (data.length === 0) return data;

  const filters = getStreamFilters(stream);
  if (filters.length === 0) return data;

  const decodeParms = getDecodeParmsArray(stream);

  let result = data;
  for (let i = 0; i < filters.length; i++) {
    const parms = decodeParms[i];
    result = applyFilter(filters[i], result, parms);
  }
  return result;
}

/**
 * Get raw (compressed) stream bytes. Useful for extracting JPEG data directly.
 */
export function getRawStreamData(stream: COSStream): Uint8Array {
  return stream.getData();
}

/**
 * Apply a sequence of named filters to raw bytes.
 * Used for inline images where data is not in a COSStream.
 *
 * @param data    Raw bytes to decode
 * @param filters Filter names (e.g. ['FlateDecode'], ['DCTDecode'])
 * @param parms   Optional array of filter parameter dictionaries (one per filter)
 */
export function applyFiltersToBytes(
  data: Uint8Array,
  filters: string[],
  parms?: Array<COSDictionary | undefined>,
): Uint8Array {
  let result = data;
  for (let i = 0; i < filters.length; i++) {
    const filterParms = parms ? parms[i] : undefined;
    result = applyFilter(filters[i], result, filterParms);
  }
  return result;
}

/**
 * Read filter name(s) from a stream dictionary.
 * /Filter can be a single COSName or a COSArray of COSName.
 */
export function getStreamFilters(stream: COSStream): string[] {
  const dict = stream.getDictionary();
  const filterEntry = dict.getItem('Filter');
  if (!filterEntry) return [];

  if (filterEntry instanceof COSName) {
    return [filterEntry.getName()];
  }
  if (filterEntry instanceof COSArray) {
    const filters: string[] = [];
    for (let i = 0; i < filterEntry.size(); i++) {
      const el = filterEntry.get(i);
      if (el instanceof COSName) {
        filters.push(el.getName());
      }
    }
    return filters;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Decode parameters
// ---------------------------------------------------------------------------

function getDecodeParmsArray(stream: COSStream): Array<COSDictionary | undefined> {
  const dict = stream.getDictionary();
  const parmsEntry = dict.getItem('DecodeParms') ?? dict.getItem('DP');
  if (!parmsEntry) return [];

  if (parmsEntry instanceof COSDictionary) {
    return [parmsEntry];
  }
  if (parmsEntry instanceof COSArray) {
    const result: Array<COSDictionary | undefined> = [];
    for (let i = 0; i < parmsEntry.size(); i++) {
      const el = parmsEntry.get(i);
      result.push(el instanceof COSDictionary ? el : undefined);
    }
    return result;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Filter application
// ---------------------------------------------------------------------------

function applyFilter(
  filterName: string,
  data: Uint8Array,
  parms?: COSDictionary,
): Uint8Array {
  switch (filterName) {
    case 'FlateDecode':
    case 'Fl':
      return applyFlateDecode(data, parms);

    case 'DCTDecode':
    case 'DCT':
    case 'JPXDecode':
      // JPEG / JPEG 2000 — data is already the image file
      return data;

    case 'ASCIIHexDecode':
    case 'AHx':
      return applyASCIIHexDecode(data);

    case 'ASCII85Decode':
    case 'A85':
      return applyASCII85Decode(data);

    case 'LZWDecode':
    case 'LZW':
      return applyLZWDecode(data, parms);

    case 'RunLengthDecode':
    case 'RL':
      return applyRunLengthDecode(data);

    default:
      // Unknown filter — return as-is
      return data;
  }
}

// ---------------------------------------------------------------------------
// FlateDecode
// ---------------------------------------------------------------------------

function applyFlateDecode(data: Uint8Array, parms?: COSDictionary): Uint8Array {
  let decompressed: Uint8Array;
  try {
    decompressed = inflate(data);
  } catch {
    // Some PDFs have minor compression issues — try with raw inflate
    try {
      decompressed = inflate(data, { raw: true });
    } catch {
      // Last resort: return original data
      return data;
    }
  }

  // Apply predictor if specified
  if (parms) {
    const predictor = getIntParam(parms, 'Predictor', 1);
    if (predictor > 1) {
      const columns = getIntParam(parms, 'Columns', 1);
      const colors = getIntParam(parms, 'Colors', 1);
      const bpc = getIntParam(parms, 'BitsPerComponent', 8);
      return applyPredictor(decompressed, predictor, columns, colors, bpc);
    }
  }

  return decompressed;
}

// ---------------------------------------------------------------------------
// PNG Predictor (predictor 10-15)
// ---------------------------------------------------------------------------

function applyPredictor(
  data: Uint8Array,
  predictor: number,
  columns: number,
  colors: number,
  bpc: number,
): Uint8Array {
  if (predictor === 2) {
    // TIFF Predictor 2
    return applyTIFFPredictor(data, columns, colors, bpc);
  }

  if (predictor >= 10 && predictor <= 15) {
    // PNG predictors
    return applyPNGPredictor(data, columns, colors, bpc);
  }

  return data;
}

function applyPNGPredictor(
  data: Uint8Array,
  columns: number,
  colors: number,
  bpc: number,
): Uint8Array {
  const bytesPerPixel = Math.max(1, Math.floor((colors * bpc + 7) / 8));
  const rowBytes = Math.floor((columns * colors * bpc + 7) / 8);
  const resultRowBytes = rowBytes;
  const totalRows = Math.floor(data.length / (rowBytes + 1));

  const result = new Uint8Array(totalRows * resultRowBytes);
  const prevRow = new Uint8Array(rowBytes);

  let srcPos = 0;
  for (let row = 0; row < totalRows; row++) {
    if (srcPos >= data.length) break;

    const filterType = data[srcPos++];
    const currentRow = new Uint8Array(rowBytes);

    // Read raw row bytes
    for (let i = 0; i < rowBytes && srcPos < data.length; i++) {
      currentRow[i] = data[srcPos++];
    }

    // Apply PNG filter
    switch (filterType) {
      case 0: // None
        break;
      case 1: // Sub
        for (let i = bytesPerPixel; i < rowBytes; i++) {
          currentRow[i] = (currentRow[i] + currentRow[i - bytesPerPixel]) & 0xff;
        }
        break;
      case 2: // Up
        for (let i = 0; i < rowBytes; i++) {
          currentRow[i] = (currentRow[i] + prevRow[i]) & 0xff;
        }
        break;
      case 3: // Average
        for (let i = 0; i < rowBytes; i++) {
          const left = i >= bytesPerPixel ? currentRow[i - bytesPerPixel] : 0;
          const up = prevRow[i];
          currentRow[i] = (currentRow[i] + Math.floor((left + up) / 2)) & 0xff;
        }
        break;
      case 4: // Paeth
        for (let i = 0; i < rowBytes; i++) {
          const left = i >= bytesPerPixel ? currentRow[i - bytesPerPixel] : 0;
          const up = prevRow[i];
          const upLeft = i >= bytesPerPixel ? prevRow[i - bytesPerPixel] : 0;
          currentRow[i] = (currentRow[i] + paethPredictor(left, up, upLeft)) & 0xff;
        }
        break;
    }

    // Copy to result
    result.set(currentRow, row * resultRowBytes);
    // Save as previous row
    prevRow.set(currentRow);
  }

  return result;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function applyTIFFPredictor(
  data: Uint8Array,
  columns: number,
  colors: number,
  bpc: number,
): Uint8Array {
  if (bpc !== 8) return data; // Only support 8-bit TIFF predictor
  const rowBytes = columns * colors;
  const result = new Uint8Array(data.length);
  const totalRows = Math.floor(data.length / rowBytes);

  for (let row = 0; row < totalRows; row++) {
    const offset = row * rowBytes;
    for (let col = 0; col < rowBytes; col++) {
      const prev = col >= colors ? result[offset + col - colors] : 0;
      result[offset + col] = (data[offset + col] + prev) & 0xff;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// ASCIIHexDecode
// ---------------------------------------------------------------------------

function applyASCIIHexDecode(data: Uint8Array): Uint8Array {
  const text = new TextDecoder('latin1').decode(data);
  const result: number[] = [];
  let hex = '';

  for (const ch of text) {
    if (ch === '>') break; // EOD marker
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') continue;
    hex += ch;
    if (hex.length === 2) {
      result.push(parseInt(hex, 16));
      hex = '';
    }
  }
  // Odd trailing nibble gets 0 appended
  if (hex.length === 1) {
    result.push(parseInt(hex + '0', 16));
  }

  return new Uint8Array(result);
}

// ---------------------------------------------------------------------------
// ASCII85Decode
// ---------------------------------------------------------------------------

function applyASCII85Decode(data: Uint8Array): Uint8Array {
  const text = new TextDecoder('latin1').decode(data);
  const result: number[] = [];
  let i = 0;

  // Skip optional <~ prefix
  if (text[i] === '<' && text[i + 1] === '~') i += 2;

  while (i < text.length) {
    const ch = text[i];

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i++;
      continue;
    }

    // EOD marker
    if (ch === '~' && text[i + 1] === '>') break;

    // Special case: z = 4 zero bytes
    if (ch === 'z') {
      result.push(0, 0, 0, 0);
      i++;
      continue;
    }

    // Read group of 5 ASCII85 chars (or less at end)
    const group: number[] = [];
    while (group.length < 5 && i < text.length) {
      const c = text[i];
      if (c === '~') break;
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
        i++;
        continue;
      }
      group.push(c.charCodeAt(0) - 33);
      i++;
    }

    if (group.length === 0) break;

    // Pad to 5 with 'u' (84)
    const padded = group.length;
    while (group.length < 5) group.push(84);

    let value = 0;
    for (const g of group) {
      value = value * 85 + g;
    }

    // Extract bytes (big-endian)
    const bytes = [
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    ];

    // Only output (padded - 1) bytes for partial groups
    const count = padded - 1;
    for (let j = 0; j < count; j++) {
      result.push(bytes[j]);
    }
  }

  return new Uint8Array(result);
}

// ---------------------------------------------------------------------------
// LZWDecode
// ---------------------------------------------------------------------------

function applyLZWDecode(data: Uint8Array, parms?: COSDictionary): Uint8Array {
  const earlyChange = parms ? getIntParam(parms, 'EarlyChange', 1) : 1;
  const result = lzwDecompress(data, earlyChange);

  // Apply predictor if present
  if (parms) {
    const predictor = getIntParam(parms, 'Predictor', 1);
    if (predictor > 1) {
      const columns = getIntParam(parms, 'Columns', 1);
      const colors = getIntParam(parms, 'Colors', 1);
      const bpc = getIntParam(parms, 'BitsPerComponent', 8);
      return applyPredictor(result, predictor, columns, colors, bpc);
    }
  }

  return result;
}

function lzwDecompress(data: Uint8Array, earlyChange: number): Uint8Array {
  const CLEAR_TABLE = 256;
  const EOD = 257;

  let codeSize = 9;
  let nextCode = 258;
  let table: Uint8Array[] = [];

  // Initialize table with single-byte entries
  function resetTable() {
    table = [];
    for (let i = 0; i < 256; i++) {
      table[i] = new Uint8Array([i]);
    }
    table[CLEAR_TABLE] = new Uint8Array(0); // clear
    table[EOD] = new Uint8Array(0); // eod
    nextCode = 258;
    codeSize = 9;
  }

  resetTable();

  const output: number[] = [];
  let bitPos = 0;
  let prevEntry: Uint8Array | undefined;

  function readCode(): number {
    let code = 0;
    for (let i = 0; i < codeSize; i++) {
      const byteIndex = Math.floor(bitPos / 8);
      const bitIndex = 7 - (bitPos % 8);
      if (byteIndex < data.length) {
        code = (code << 1) | ((data[byteIndex] >> bitIndex) & 1);
      }
      bitPos++;
    }
    return code;
  }

  while (true) {
    const code = readCode();

    if (code === EOD || bitPos > data.length * 8 + codeSize) break;

    if (code === CLEAR_TABLE) {
      resetTable();
      prevEntry = undefined;
      continue;
    }

    let entry: Uint8Array;
    if (code < table.length && table[code]) {
      entry = table[code];
    } else if (code === nextCode && prevEntry) {
      // Special case: code not yet in table
      entry = new Uint8Array(prevEntry.length + 1);
      entry.set(prevEntry);
      entry[prevEntry.length] = prevEntry[0];
    } else {
      break; // Invalid code
    }

    for (const b of entry) output.push(b);

    if (prevEntry) {
      const newEntry = new Uint8Array(prevEntry.length + 1);
      newEntry.set(prevEntry);
      newEntry[prevEntry.length] = entry[0];
      table[nextCode] = newEntry;
      nextCode++;

      // Increase code size when needed
      const threshold = earlyChange ? nextCode : nextCode + 1;
      if (threshold >= (1 << codeSize) && codeSize < 12) {
        codeSize++;
      }
    }

    prevEntry = entry;
  }

  return new Uint8Array(output);
}

// ---------------------------------------------------------------------------
// RunLengthDecode
// ---------------------------------------------------------------------------

function applyRunLengthDecode(data: Uint8Array): Uint8Array {
  const result: number[] = [];
  let i = 0;

  while (i < data.length) {
    const length = data[i++];

    if (length === 128) break; // EOD marker
    if (length < 128) {
      // Copy next (length + 1) bytes literally
      const count = length + 1;
      for (let j = 0; j < count && i < data.length; j++) {
        result.push(data[i++]);
      }
    } else {
      // Repeat next byte (257 - length) times
      const count = 257 - length;
      if (i < data.length) {
        const byte = data[i++];
        for (let j = 0; j < count; j++) {
          result.push(byte);
        }
      }
    }
  }

  return new Uint8Array(result);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getIntParam(dict: COSDictionary, key: string, defaultValue: number): number {
  const entry = dict.getItem(key);
  if (entry instanceof COSInteger) return entry.getValue();
  if (entry instanceof COSName) {
    const n = parseInt(entry.getName(), 10);
    return isNaN(n) ? defaultValue : n;
  }
  return defaultValue;
}
