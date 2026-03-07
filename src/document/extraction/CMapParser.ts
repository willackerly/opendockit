/**
 * CMapParser — parse /ToUnicode CMap streams into code-to-Unicode maps.
 *
 * ToUnicode CMaps are the primary mechanism for mapping character codes to
 * Unicode values in PDF text extraction. Most embedded fonts include one.
 *
 * Handles:
 * - beginbfchar / endbfchar — individual code-to-Unicode mappings
 * - beginbfrange / endbfrange — range mappings (offset and array forms)
 * - begincodespacerange / endcodespacerange — code length detection
 * - Multi-byte codes (1 byte <41> or 2 byte <0041>)
 * - Ligatures: <00660069> → "fi" (multi-char Unicode values)
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a /ToUnicode CMap stream and return a code-to-Unicode string map.
 * Codes are numeric values (e.g. 0x0048 for <0048>).
 */
export function parseToUnicodeCMap(cmapData: Uint8Array): Map<number, string> {
  const text = new TextDecoder('latin1').decode(cmapData);
  const map = new Map<number, string>();

  parseBfCharSections(text, map);
  parseBfRangeSections(text, map);

  return map;
}

/**
 * Detect the byte length of character codes from codespace ranges.
 * Returns 1 for single-byte fonts, 2 for CID fonts, etc.
 */
export function detectCodeLength(cmapData: Uint8Array): number {
  const text = new TextDecoder('latin1').decode(cmapData);
  const csMatch = /begincodespacerange\s+([\s\S]*?)endcodespacerange/g;
  let match: RegExpExecArray | null;
  let maxLen = 1;

  while ((match = csMatch.exec(text)) !== null) {
    const body = match[1];
    const hexPattern = /<([0-9A-Fa-f]+)>/g;
    let hexMatch: RegExpExecArray | null;
    while ((hexMatch = hexPattern.exec(body)) !== null) {
      const byteLen = Math.ceil(hexMatch[1].length / 2);
      if (byteLen > maxLen) maxLen = byteLen;
    }
  }

  return maxLen;
}

// ---------------------------------------------------------------------------
// bfchar sections
// ---------------------------------------------------------------------------

function parseBfCharSections(text: string, map: Map<number, string>): void {
  const sectionPattern = /beginbfchar\s+([\s\S]*?)endbfchar/g;
  let sectionMatch: RegExpExecArray | null;

  while ((sectionMatch = sectionPattern.exec(text)) !== null) {
    const body = sectionMatch[1];
    // Match pairs: <srcCode> <dstUnicode>
    const pairPattern = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let pairMatch: RegExpExecArray | null;

    while ((pairMatch = pairPattern.exec(body)) !== null) {
      const code = parseInt(pairMatch[1], 16);
      const unicode = hexToUnicodeString(pairMatch[2]);
      map.set(code, unicode);
    }
  }
}

// ---------------------------------------------------------------------------
// bfrange sections
// ---------------------------------------------------------------------------

function parseBfRangeSections(text: string, map: Map<number, string>): void {
  const sectionPattern = /beginbfrange\s+([\s\S]*?)endbfrange/g;
  let sectionMatch: RegExpExecArray | null;

  while ((sectionMatch = sectionPattern.exec(text)) !== null) {
    const body = sectionMatch[1];
    parseBfRangeBody(body, map);
  }
}

function parseBfRangeBody(body: string, map: Map<number, string>): void {
  let i = 0;
  const len = body.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && isWhitespace(body[i])) i++;
    if (i >= len) break;

    // Read start code: <hex>
    const start = readHexToken(body, i);
    if (!start) break;
    i = start.end;

    // Skip whitespace
    while (i < len && isWhitespace(body[i])) i++;

    // Read end code: <hex>
    const end = readHexToken(body, i);
    if (!end) break;
    i = end.end;

    // Skip whitespace
    while (i < len && isWhitespace(body[i])) i++;

    // Read destination: <hex> or [ array of <hex> ]
    if (body[i] === '[') {
      // Array form: [ <hex1> <hex2> ... ]
      i++; // skip [
      const startCode = parseInt(start.hex, 16);
      const endCode = parseInt(end.hex, 16);
      for (let code = startCode; code <= endCode; code++) {
        while (i < len && isWhitespace(body[i])) i++;
        if (body[i] === ']') break;
        const dest = readHexToken(body, i);
        if (!dest) break;
        i = dest.end;
        map.set(code, hexToUnicodeString(dest.hex));
      }
      // Skip to ]
      while (i < len && body[i] !== ']') i++;
      if (i < len) i++; // skip ]
    } else {
      // Offset form: <hex> — each code maps to incremented value
      const dest = readHexToken(body, i);
      if (!dest) break;
      i = dest.end;

      const startCode = parseInt(start.hex, 16);
      const endCode = parseInt(end.hex, 16);
      const destStart = parseInt(dest.hex, 16);

      for (let code = startCode; code <= endCode; code++) {
        const unicodeValue = destStart + (code - startCode);
        map.set(code, String.fromCodePoint(unicodeValue));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Hex parsing helpers
// ---------------------------------------------------------------------------

interface HexToken {
  hex: string;
  end: number;
}

function readHexToken(text: string, start: number): HexToken | null {
  if (text[start] !== '<') return null;
  let i = start + 1;
  let hex = '';
  while (i < text.length && text[i] !== '>') {
    const ch = text[i];
    if (!isWhitespace(ch)) hex += ch;
    i++;
  }
  if (i < text.length) i++; // skip >
  return { hex, end: i };
}

/**
 * Convert a hex string representing Unicode code points to a JS string.
 * e.g. "0048" → "H", "00660069" → "fi" (ligature)
 */
function hexToUnicodeString(hex: string): string {
  // Determine if this is one or more 2-byte code points
  // Hex string length 4 = one code point, 8 = two code points, etc.
  if (hex.length <= 4) {
    return String.fromCodePoint(parseInt(hex, 16));
  }

  // Multi-char: split into 4-char chunks (UTF-16 code units)
  let result = '';
  for (let i = 0; i < hex.length; i += 4) {
    const chunk = hex.substring(i, i + 4);
    if (chunk.length > 0) {
      const codePoint = parseInt(chunk, 16);
      // Handle surrogate pairs for characters outside BMP
      if (codePoint >= 0xD800 && codePoint <= 0xDBFF && i + 4 < hex.length) {
        const nextChunk = hex.substring(i + 4, i + 8);
        const lowSurrogate = parseInt(nextChunk, 16);
        if (lowSurrogate >= 0xDC00 && lowSurrogate <= 0xDFFF) {
          const combined = 0x10000 + (codePoint - 0xD800) * 0x400 + (lowSurrogate - 0xDC00);
          result += String.fromCodePoint(combined);
          i += 4; // Skip the low surrogate
          continue;
        }
      }
      result += String.fromCodePoint(codePoint);
    }
  }
  return result;
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';
}
