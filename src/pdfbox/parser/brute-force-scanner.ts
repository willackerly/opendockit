/**
 * Brute-force xref scanner — fallback for PDFs with broken or missing xref tables.
 *
 * Scans the entire PDF for "N G obj" patterns to build a synthetic xref table.
 * Similar to Java PDFBox's BruteForceParser but simpler — we only need object
 * offsets, not full reconstruction.
 *
 * This is used as a fallback when normal xref parsing fails:
 *   1. Normal xref parse (table or stream)
 *   2. findXrefTableOffset recovery
 *   3. Brute-force scan (this module)
 */

import { XRefEntryType, type TableXRefEntry } from '../writer/XRefEntries';

/**
 * Scan a PDF file for "N G obj" patterns to build an xref table.
 * Returns a map from object number to { generation, offset }.
 *
 * The scanner finds all occurrences and keeps the LAST one for each
 * object number (later in file = more recent incremental update).
 */
export function bruteForceXRefScan(
  pdfBytes: Uint8Array,
): Map<number, { generation: number; offset: number }> {
  const result = new Map<number, { generation: number; offset: number }>();

  // We scan byte-by-byte for the pattern: digits, whitespace, digits, whitespace, "obj"
  // This avoids decoding the entire file as a string (memory-efficient for large PDFs).
  const len = pdfBytes.length;
  let i = 0;

  while (i < len - 4) {
    // Quick check: is this digit followed eventually by " obj"?
    // We need N <ws> G <ws> obj where N and G are digit sequences.
    if (!isDigit(pdfBytes[i])) {
      i++;
      continue;
    }

    // Ensure we're at a line/token boundary (preceded by whitespace/newline or start of file)
    if (i > 0) {
      const prev = pdfBytes[i - 1];
      if (!isWhitespaceOrDelimiter(prev)) {
        i++;
        continue;
      }
    }

    // Read object number (digits)
    let numEnd = i;
    while (numEnd < len && isDigit(pdfBytes[numEnd])) {
      numEnd++;
    }
    if (numEnd === i || numEnd >= len) {
      i++;
      continue;
    }

    // Must be followed by whitespace
    if (!isWhitespace(pdfBytes[numEnd])) {
      i = numEnd;
      continue;
    }

    // Skip whitespace
    let genStart = numEnd;
    while (genStart < len && isWhitespace(pdfBytes[genStart])) {
      genStart++;
    }
    if (genStart >= len) break;

    // Read generation number (digits)
    let genEnd = genStart;
    while (genEnd < len && isDigit(pdfBytes[genEnd])) {
      genEnd++;
    }
    if (genEnd === genStart || genEnd >= len) {
      i = numEnd;
      continue;
    }

    // Must be followed by whitespace
    if (!isWhitespace(pdfBytes[genEnd])) {
      i = genEnd;
      continue;
    }

    // Skip whitespace
    let objStart = genEnd;
    while (objStart < len && isWhitespace(pdfBytes[objStart])) {
      objStart++;
    }
    if (objStart + 3 > len) break;

    // Check for "obj" keyword
    if (
      pdfBytes[objStart] !== 0x6f ||     // 'o'
      pdfBytes[objStart + 1] !== 0x62 || // 'b'
      pdfBytes[objStart + 2] !== 0x6a    // 'j'
    ) {
      i = numEnd;
      continue;
    }

    // "obj" must be followed by whitespace, EOF, or '<' (for "obj<<" compact form)
    const afterObj = objStart + 3;
    if (afterObj < len) {
      const ch = pdfBytes[afterObj];
      if (!isWhitespace(ch) && ch !== 0x3c /* '<' */) {
        i = numEnd;
        continue;
      }
    }

    // Parse the numbers
    const objectNumber = parseIntFromBytes(pdfBytes, i, numEnd);
    const generation = parseIntFromBytes(pdfBytes, genStart, genEnd);

    if (objectNumber >= 0 && generation >= 0 && objectNumber < 10_000_000) {
      // Keep the LAST occurrence (later = more recent in incremental PDFs)
      result.set(objectNumber, { generation, offset: i });
    }

    // Advance past "obj"
    i = afterObj;
  }

  return result;
}

/**
 * Convert brute-force scan results to TableXRefEntry format.
 */
export function bruteForceToXRefEntries(
  scanResult: Map<number, { generation: number; offset: number }>,
): TableXRefEntry[] {
  const entries: TableXRefEntry[] = [];

  // Add free entry for object 0
  entries.push({
    objectNumber: 0,
    byteOffset: 0,
    generation: 65535,
    inUse: false,
    type: XRefEntryType.FREE,
    nextFreeObject: 0,
  });

  for (const [objectNumber, { generation, offset }] of scanResult) {
    if (objectNumber === 0) continue; // skip free head
    entries.push({
      objectNumber,
      byteOffset: offset,
      generation,
      inUse: true,
      type: XRefEntryType.NORMAL,
    });
  }

  return entries;
}

/**
 * Scan for the /Root catalog reference in a trailer dictionary string.
 * Used when brute-force scanning finds trailer dictionaries.
 */
export function scanForCatalog(
  pdfBytes: Uint8Array,
): { objectNumber: number; generation: number } | undefined {
  const text = new TextDecoder('latin1').decode(pdfBytes);

  // Look for /Root N G R in trailer dicts
  const rootPattern = /\/Root\s+(\d+)\s+(\d+)\s+R/g;
  let match: RegExpExecArray | null;
  let lastMatch: RegExpExecArray | null = null;

  while ((match = rootPattern.exec(text)) !== null) {
    lastMatch = match;
  }

  if (lastMatch) {
    return {
      objectNumber: Number(lastMatch[1]),
      generation: Number(lastMatch[2]),
    };
  }

  // Fallback: scan for objects with /Type /Catalog
  const catalogPattern = /(\d+)\s+(\d+)\s+obj[\s\S]*?\/Type\s*\/Catalog/g;
  while ((match = catalogPattern.exec(text)) !== null) {
    return {
      objectNumber: Number(match[1]),
      generation: Number(match[2]),
    };
  }

  return undefined;
}

function isDigit(byte: number): boolean {
  return byte >= 0x30 && byte <= 0x39;
}

function isWhitespace(byte: number): boolean {
  return (
    byte === 0x00 ||
    byte === 0x09 ||
    byte === 0x0a ||
    byte === 0x0c ||
    byte === 0x0d ||
    byte === 0x20
  );
}

function isWhitespaceOrDelimiter(byte: number): boolean {
  return (
    isWhitespace(byte) ||
    byte === 0x25 || // %
    byte === 0x28 || // (
    byte === 0x29 || // )
    byte === 0x3c || // <
    byte === 0x3e || // >
    byte === 0x5b || // [
    byte === 0x5d || // ]
    byte === 0x7b || // {
    byte === 0x7d || // }
    byte === 0x2f    // /
  );
}

function parseIntFromBytes(bytes: Uint8Array, start: number, end: number): number {
  let value = 0;
  for (let i = start; i < end; i++) {
    value = value * 10 + (bytes[i] - 0x30);
  }
  return value;
}
