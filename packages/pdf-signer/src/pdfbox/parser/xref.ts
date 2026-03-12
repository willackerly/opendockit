import { XRefEntryType, type TableXRefEntry } from '../writer/XRefEntries';
import type { TrailerInfo } from './trailer';
import { parseCOSDictionary } from './cosParser';
import { COSArray, COSInteger, COSName, COSDictionary } from '../cos/COSTypes';
import { safeInflate as inflate } from './safe-inflate';
import { bruteForceXRefScan, bruteForceToXRefEntries } from './brute-force-scanner';

const LATIN1_DECODER = new TextDecoder('latin1');

export interface ParsedXrefTable {
  entries: TableXRefEntry[];
}

export function parseXrefEntries(
  pdfBytes: Uint8Array,
  trailer: TrailerInfo
): ParsedXrefTable {
  try {
    return parseXrefEntriesNormal(pdfBytes, trailer);
  } catch {
    // Fallback: brute-force scan the entire file for "N G obj" patterns.
    // This handles PDFs with missing xref keyword, out-of-bounds startxref,
    // corrupt xref tables, or xref streams that can't be decoded.
    return { entries: bruteForceToXRefEntries(bruteForceXRefScan(pdfBytes)) };
  }
}

function parseXrefEntriesNormal(
  pdfBytes: Uint8Array,
  trailer: TrailerInfo
): ParsedXrefTable {
  let result: ParsedXrefTable;
  if (trailer.hasXRefStream) {
    try {
      result = parseXrefStream(pdfBytes, trailer.startxref, trailer.size);
    } catch {
      // Hybrid-xref: startxref points to a traditional table, /XRefStm points to the stream.
      // Parse the traditional table first, then merge entries from the xref stream.
      const tableResult = parseXrefTable(pdfBytes, trailer.startxref);
      if (trailer.xrefStmOffset !== undefined) {
        try {
          const streamResult = parseXrefStream(pdfBytes, trailer.xrefStmOffset, trailer.size);
          // Merge: stream entries fill in gaps (type-2 ObjStm entries) not in the table
          const entryMap = new Map<number, TableXRefEntry>();
          for (const entry of streamResult.entries) {
            entryMap.set(entry.objectNumber, entry);
          }
          // Table entries take precedence over stream entries
          for (const entry of tableResult.entries) {
            entryMap.set(entry.objectNumber, entry);
          }
          result = { entries: [...entryMap.values()] };
        } catch {
          result = tableResult;
        }
      } else {
        result = tableResult;
      }
    }
  } else {
    try {
      result = parseXrefTable(pdfBytes, trailer.startxref);
    } catch (e: unknown) {
      // Recovery: startxref may point to wrong offset (common in real-world PDFs).
      // Scan for the actual xref table location.
      const recoveredOffset = findXrefTableOffset(pdfBytes, trailer.startxref);
      if (recoveredOffset !== undefined && recoveredOffset !== trailer.startxref) {
        result = parseXrefTable(pdfBytes, recoveredOffset);
      } else {
        throw e;
      }
    }
  }

  // Walk /Prev chain to merge earlier xref sections
  if (trailer.prev !== undefined) {
    const entryMap = new Map<number, TableXRefEntry>();
    // Index primary entries (later sections take precedence)
    for (const entry of result.entries) {
      entryMap.set(entry.objectNumber, entry);
    }

    const visited = new Set<number>([trailer.startxref]);
    let prevOffset: number | undefined = trailer.prev;

    for (let i = 0; i < 100 && prevOffset !== undefined; i++) {
      if (visited.has(prevOffset)) break;
      visited.add(prevOffset);

      try {
        const section = parseXrefSectionAtOffset(pdfBytes, prevOffset);
        // Merge: only add entries not already present (later takes precedence)
        for (const entry of section.entries) {
          if (!entryMap.has(entry.objectNumber)) {
            entryMap.set(entry.objectNumber, entry);
          }
        }
        prevOffset = section.prev;
      } catch {
        break;
      }
    }

    result = { entries: [...entryMap.values()] };
  }

  return result;
}

interface XrefSectionResult {
  entries: TableXRefEntry[];
  prev?: number;
}

/**
 * Parse an xref section at any offset, auto-detecting table vs stream format.
 * Returns the entries and the /Prev pointer (if any) from that section.
 */
function parseXrefSectionAtOffset(
  pdfBytes: Uint8Array,
  offset: number
): XrefSectionResult {
  if (offset < 0 || offset >= pdfBytes.length) {
    throw new Error(`Prev offset ${offset} is outside the PDF bounds`);
  }
  const peek = LATIN1_DECODER.decode(
    pdfBytes.slice(offset, Math.min(offset + 4, pdfBytes.length))
  );

  if (peek.startsWith('xref')) {
    return parseXrefTableSectionWithPrev(pdfBytes, offset);
  } else {
    return parseXrefStreamSectionWithPrev(pdfBytes, offset);
  }
}

function parseXrefTableSectionWithPrev(
  pdfBytes: Uint8Array,
  offset: number
): XrefSectionResult {
  const { entries } = parseXrefTable(pdfBytes, offset);
  // Extract /Prev from the associated trailer dict
  const text = LATIN1_DECODER.decode(pdfBytes.slice(offset));
  const trailerIdx = text.indexOf('trailer');
  let prev: number | undefined;
  if (trailerIdx !== -1) {
    const dictStart = text.indexOf('<<', trailerIdx);
    if (dictStart !== -1) {
      const dictEnd = findDictionaryEndSafe(
        pdfBytes,
        offset + dictStart
      );
      if (dictEnd > 0) {
        const dict = LATIN1_DECODER.decode(
          pdfBytes.slice(offset + dictStart, dictEnd)
        );
        const prevMatch = dict.match(/\/Prev\s+(\d+)/);
        if (prevMatch) prev = Number(prevMatch[1]);
      }
    }
  }
  return { entries, prev };
}

function parseXrefStreamSectionWithPrev(
  pdfBytes: Uint8Array,
  offset: number
): XrefSectionResult {
  const { dictionary, streamData } = extractStreamObject(pdfBytes, offset);
  const sizeItem = dictionary.getItem('Size');
  const size =
    sizeItem instanceof COSInteger ? sizeItem.getValue() : 0;
  const entries = parseXrefStreamData(dictionary, streamData, size);
  const prevItem = dictionary.getItem('Prev');
  const prev =
    prevItem instanceof COSInteger ? prevItem.getValue() : undefined;
  return { entries, prev };
}

/**
 * Safe version of findDictionaryEnd that returns -1 instead of throwing.
 */
function findDictionaryEndSafe(
  bytes: Uint8Array,
  startIndex: number
): number {
  try {
    return findDictionaryEnd(bytes, startIndex);
  } catch {
    return -1;
  }
}

/**
 * Parse a traditional cross-reference table (xref keyword + subsections, not streams).
 */
export function parseXrefTable(
  pdfBytes: Uint8Array,
  offset: number
): ParsedXrefTable {
  if (offset < 0 || offset >= pdfBytes.length) {
    throw new Error(`startxref offset ${offset} is outside the PDF bounds`);
  }

  const tail = LATIN1_DECODER.decode(pdfBytes.slice(offset));
  if (!tail.startsWith('xref')) {
    throw new Error('Expected "xref" keyword at startxref offset');
  }

  const lines = tail.split(/\r\n|\r|\n/);
  let index = 1; // skip "xref"
  const entries: TableXRefEntry[] = [];

  while (index < lines.length) {
    let line = lines[index].trim();

    if (line === '') {
      index += 1;
      continue;
    }

    if (line.startsWith('trailer')) {
      break;
    }

    const subsectionMatch = line.match(/^(\d+)\s+(\d+)$/);
    if (!subsectionMatch) {
      throw new Error(`Invalid xref subsection header: "${line}"`);
    }

    const startObjectNumber = Number(subsectionMatch[1]);
    const count = Number(subsectionMatch[2]);

    if (!Number.isFinite(startObjectNumber) || !Number.isFinite(count)) {
      throw new Error(`Invalid xref subsection numbers: "${line}"`);
    }

    index += 1;

    for (let i = 0; i < count; i++, index++) {
      const entryLine = lines[index];
      if (entryLine === undefined) {
        throw new Error('Unexpected EOF while parsing xref entries');
      }

      const entryMatch = entryLine.match(/^(\d{10})\s+(\d{5})\s+([nf])\b/);
      if (!entryMatch) {
        throw new Error(`Invalid xref entry: "${entryLine}"`);
      }

      const byteOffset = Number(entryMatch[1]);
      const generation = Number(entryMatch[2]);
      const inUse = entryMatch[3] === 'n';

      entries.push({
        objectNumber: startObjectNumber + i,
        byteOffset,
        generation,
        inUse,
        type: inUse ? XRefEntryType.NORMAL : XRefEntryType.FREE,
      });
    }
  }

  return { entries };
}

/**
 * Scan the PDF bytes to find the actual xref table offset when the startxref
 * value is incorrect. This handles real-world PDFs where tools write incorrect
 * startxref offsets.
 *
 * Strategy: search backwards from the end of the file for the last occurrence
 * of the "xref" keyword that begins a valid xref table (followed by a newline
 * and subsection header like "0 N").
 */
function findXrefTableOffset(
  pdfBytes: Uint8Array,
  _statedOffset: number
): number | undefined {
  // Scan backwards from the end of the file for "xref\n" or "xref\r\n"
  // The xref keyword should be at the start of a line, followed by
  // whitespace and a subsection header.
  const xrefBytes = [0x78, 0x72, 0x65, 0x66]; // "xref"

  // Search from the end backwards (most relevant xref is usually near EOF)
  for (let i = pdfBytes.length - 10; i >= 0; i--) {
    if (
      pdfBytes[i] === xrefBytes[0] &&
      pdfBytes[i + 1] === xrefBytes[1] &&
      pdfBytes[i + 2] === xrefBytes[2] &&
      pdfBytes[i + 3] === xrefBytes[3]
    ) {
      // Check that xref is either at start of file or preceded by whitespace/newline
      if (i > 0) {
        const prevByte = pdfBytes[i - 1];
        if (prevByte !== 0x0a && prevByte !== 0x0d && prevByte !== 0x20 && prevByte !== 0x09) {
          continue; // Not at a line boundary (could be inside a string)
        }
      }

      // Check that xref is followed by whitespace (newline)
      const nextByte = pdfBytes[i + 4];
      if (nextByte !== 0x0a && nextByte !== 0x0d && nextByte !== 0x20) {
        continue; // Not the xref keyword (could be "xrefstm" etc.)
      }

      // Validate: after whitespace, should be a digit (subsection start)
      let j = i + 4;
      while (j < pdfBytes.length && (pdfBytes[j] === 0x0a || pdfBytes[j] === 0x0d || pdfBytes[j] === 0x20)) {
        j++;
      }
      if (j < pdfBytes.length && pdfBytes[j] >= 0x30 && pdfBytes[j] <= 0x39) {
        return i;
      }
    }
  }

  return undefined;
}

function parseXrefStream(
  pdfBytes: Uint8Array,
  offset: number,
  size: number
): ParsedXrefTable {
  const { dictionary, streamData } = extractStreamObject(pdfBytes, offset);
  const entries = parseXrefStreamData(dictionary, streamData, size);
  return { entries };
}

/**
 * Parse xref entries from a decoded xref stream's dictionary and data.
 * Extracted as a reusable function for /Prev chain walking.
 */
function parseXrefStreamData(
  dictionary: COSDictionary,
  streamData: Uint8Array,
  size: number
): TableXRefEntry[] {
  const widths = getNumberArray(dictionary.getCOSArray('W'));
  if (widths.length !== 3) {
    throw new Error('XRef stream missing valid /W array');
  }
  const indexArray = dictionary.getCOSArray('Index');
  const indices =
    indexArray !== undefined && indexArray.size() > 0
      ? getNumberArray(indexArray)
      : [0, size];

  let data = streamData;
  const filter = dictionary.getItem('Filter');
  if (filter instanceof COSName) {
    data = decodeFilter(filter.getName(), data);
  } else if (filter instanceof COSArray) {
    for (const entry of filter.getElements()) {
      if (entry instanceof COSName) {
        data = decodeFilter(entry.getName(), data);
      }
    }
  }

  // Apply PNG predictor if /DecodeParms specifies one
  const decodeParms = dictionary.getItem('DecodeParms');
  if (decodeParms instanceof COSDictionary) {
    const predictorVal = decodeParms.getItem('Predictor');
    const predictor = predictorVal instanceof COSInteger ? predictorVal.getValue() : 1;
    if (predictor >= 10 && predictor <= 15) {
      const rowWidth = widths[0] + widths[1] + widths[2];
      data = applyPNGPredictor(data, rowWidth);
    }
  }

  const entries: TableXRefEntry[] = [];
  let cursor = 0;

  for (let i = 0; i < indices.length; i += 2) {
    const start = indices[i];
    const count = indices[i + 1];
    for (let j = 0; j < count; j++) {
      const type = readNumber(data, cursor, widths[0]);
      cursor += widths[0];
      const field2 = readNumber(data, cursor, widths[1]);
      cursor += widths[1];
      const field3 = readNumber(data, cursor, widths[2]);
      cursor += widths[2];

      if (type === 0) {
        entries.push({
          objectNumber: start + j,
          byteOffset: field2,
          generation: field3,
          inUse: false,
          type: XRefEntryType.FREE,
          nextFreeObject: field2,
        });
      } else if (type === 1) {
        entries.push({
          objectNumber: start + j,
          byteOffset: field2,
          generation: field3,
          inUse: true,
          type: XRefEntryType.NORMAL,
        });
      } else if (type === 2) {
        entries.push({
          objectNumber: start + j,
          byteOffset: 0,
          generation: 0,
          inUse: true,
          type: XRefEntryType.OBJECT_STREAM,
          objectStreamParent: field2,
          objectStreamIndex: field3,
        });
      }
    }
  }

  return entries;
}

function decodeFilter(filter: string, data: Uint8Array): Uint8Array {
  if (filter === 'FlateDecode') {
    return inflate(data);
  }
  return data;
}

/**
 * Apply PNG sub-byte predictor to xref stream data.
 * Each row = 1 filter byte + `columns` data bytes.
 * Filter types: 0=None, 1=Sub, 2=Up, 3=Average, 4=Paeth.
 */
function applyPNGPredictor(data: Uint8Array, columns: number): Uint8Array {
  const rowBytes = columns + 1; // 1 filter byte + data
  const numRows = Math.floor(data.length / rowBytes);
  const result = new Uint8Array(numRows * columns);
  const prevRow = new Uint8Array(columns);

  for (let r = 0; r < numRows; r++) {
    const filterByte = data[r * rowBytes];
    const offset = r * rowBytes + 1;
    const outOffset = r * columns;

    for (let i = 0; i < columns; i++) {
      const raw = data[offset + i];
      let val: number;
      switch (filterByte) {
        case 0: // None
          val = raw;
          break;
        case 1: // Sub
          val = (raw + (i > 0 ? result[outOffset + i - 1] : 0)) & 0xFF;
          break;
        case 2: // Up
          val = (raw + prevRow[i]) & 0xFF;
          break;
        case 3: // Average
          val = (raw + Math.floor(((i > 0 ? result[outOffset + i - 1] : 0) + prevRow[i]) / 2)) & 0xFF;
          break;
        case 4: { // Paeth
          const a = i > 0 ? result[outOffset + i - 1] : 0;
          const b = prevRow[i];
          const c = i > 0 ? prevRow[i - 1] : 0;
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          val = (raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xFF;
          break;
        }
        default:
          val = raw;
      }
      result[outOffset + i] = val;
    }

    // Save current row as previous for next iteration
    prevRow.set(result.subarray(outOffset, outOffset + columns));
  }

  return result;
}

function getNumberArray(array: COSArray | undefined): number[] {
  if (!array) {
    return [];
  }
  return array.getElements().map((entry) =>
    entry instanceof COSInteger ? entry.getValue() : 0
  );
}

function readNumber(data: Uint8Array, offset: number, width: number): number {
  let value = 0;
  for (let i = 0; i < width; i++) {
    value = (value << 8) | data[offset + i];
  }
  return value;
}

export function extractStreamObject(pdfBytes: Uint8Array, offset: number): {
  dictionary: COSDictionary;
  streamData: Uint8Array;
} {
  let cursor = offset;
  const readToken = () => {
    skipWhitespace();
    const start = cursor;
    while (cursor < pdfBytes.length && !isWhitespace(pdfBytes[cursor])) {
      cursor++;
    }
    return LATIN1_DECODER.decode(pdfBytes.slice(start, cursor));
  };
  const skipWhitespace = () => {
    while (cursor < pdfBytes.length && isWhitespace(pdfBytes[cursor])) {
      cursor++;
    }
  };

  readToken(); // object number
  readToken(); // generation
  const keyword = readToken();
  if (!keyword.startsWith('obj')) {
    throw new Error('Expected obj keyword at xref stream offset');
  }

  // Handle concatenated "obj<<" — back cursor to the start of <<
  const ltltInKeyword = keyword.indexOf('<<');
  if (ltltInKeyword >= 0) {
    cursor -= keyword.length - ltltInKeyword;
  } else {
    // Scan forward for dictionary start <<, but bail out if we hit "endobj"
    // first — that means this object is NOT a stream (e.g., it's an array or
    // simple value) and we must not accidentally read the next object's dict.
    while (
      cursor < pdfBytes.length - 1 &&
      !(pdfBytes[cursor] === 0x3c && pdfBytes[cursor + 1] === 0x3c)
    ) {
      // Check for "endobj" keyword — 7 bytes: 0x65 0x6e 0x64 0x6f 0x62 0x6a
      if (
        pdfBytes[cursor] === 0x65 &&     // 'e'
        cursor + 5 < pdfBytes.length &&
        pdfBytes[cursor + 1] === 0x6e &&  // 'n'
        pdfBytes[cursor + 2] === 0x64 &&  // 'd'
        pdfBytes[cursor + 3] === 0x6f &&  // 'o'
        pdfBytes[cursor + 4] === 0x62 &&  // 'b'
        pdfBytes[cursor + 5] === 0x6a     // 'j'
      ) {
        throw new Error('Object is not a stream (endobj found before dictionary)');
      }
      cursor++;
    }
    if (cursor >= pdfBytes.length - 1) {
      throw new Error('Expected dictionary at xref stream');
    }
  }
  const dictStart = cursor;
  const dictEnd = findDictionaryEnd(pdfBytes, dictStart);
  const dictString = LATIN1_DECODER.decode(pdfBytes.slice(dictStart, dictEnd));
  const dictionary = parseCOSDictionary(dictString);
  cursor = dictEnd;
  skipWhitespace();
  const streamKeyword = readToken();
  if (!streamKeyword.startsWith('stream')) {
    throw new Error('Expected stream keyword in xref stream object');
  }
  if (pdfBytes[cursor] === 0x0d && pdfBytes[cursor + 1] === 0x0a) {
    cursor += 2;
  } else if (pdfBytes[cursor] === 0x0a) {
    cursor += 1;
  }
  const streamStart = cursor;
  const lengthItem = dictionary.getItem(COSName.LENGTH);
  let streamEnd: number;
  if (lengthItem instanceof COSInteger) {
    streamEnd = streamStart + lengthItem.getValue();
  } else {
    // /Length is an indirect reference — scan for "endstream" keyword
    streamEnd = findEndstream(pdfBytes, streamStart);
  }
  const data = pdfBytes.slice(streamStart, streamEnd);
  return { dictionary, streamData: data };
}

/**
 * Scan forward from streamStart to find the "endstream" keyword.
 * Returns the byte offset just before "endstream".
 */
function findEndstream(pdfBytes: Uint8Array, streamStart: number): number {
  // Search for the byte sequence "endstream"
  const needle = [0x65, 0x6e, 0x64, 0x73, 0x74, 0x72, 0x65, 0x61, 0x6d]; // "endstream"
  for (let i = streamStart; i < pdfBytes.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (pdfBytes[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      // Trim trailing whitespace before "endstream"
      let end = i;
      while (end > streamStart && (pdfBytes[end - 1] === 0x0a || pdfBytes[end - 1] === 0x0d)) {
        end--;
      }
      return end;
    }
  }
  throw new Error('Could not find endstream keyword');
}

function isWhitespace(byte: number): boolean {
  return byte === 0x00 || byte === 0x09 || byte === 0x0a || byte === 0x0c || byte === 0x0d || byte === 0x20;
}

function findDictionaryEnd(bytes: Uint8Array, startIndex: number): number {
  let depth = 0;
  let i = startIndex;
  while (i < bytes.length - 1) {
    const b = bytes[i];

    // Skip parenthesized string literals (handles nesting + backslash escapes)
    if (b === 0x28) {
      // '('
      let sd = 1;
      i++;
      while (i < bytes.length && sd > 0) {
        if (bytes[i] === 0x5c) {
          i += 2;
          continue;
        } // backslash escape
        if (bytes[i] === 0x28) sd++;
        else if (bytes[i] === 0x29) sd--;
        i++;
      }
      continue;
    }

    // Skip comments (% to end of line)
    if (b === 0x25) {
      while (i < bytes.length && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i++;
      continue;
    }

    const second = bytes[i + 1];
    if (b === 0x3c && second === 0x3c) {
      depth++;
      i += 2;
      continue;
    }
    if (b === 0x3e && second === 0x3e) {
      depth--;
      i += 2;
      if (depth === 0) return i;
      continue;
    }

    i++;
  }
  throw new Error('Unterminated dictionary in xref stream');
}
