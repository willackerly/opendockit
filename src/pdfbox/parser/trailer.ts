import type { COSBase } from '../cos/COSBase';
import {
  COSDictionary,
  COSName,
  COSInteger,
  COSArray,
  COSString,
  COSObjectReference,
} from '../cos/COSTypes';
import { COSStandardOutputStream } from '../writer/COSStandardOutputStream';
import { COSWriter } from '../writer/COSWriter';
import { parseCOSDictionary } from './cosParser';

/**
 * Trailer parsing utilities for incremental PDF updates.
 *
 * These helpers extract the final `trailer` dictionary and `startxref`
 * pointer from an existing PDF so we can append a standards-compliant
 * incremental update (matching the Apache PDFBox flow).
 *
 * This is intentionally minimal and handles the subset of trailers emitted
 * by pdf-lib / Acrobat-style generators (xref tables, not streams).
 */

const LATIN1_DECODER = new TextDecoder('latin1');

export interface ObjectRef {
  objectNumber: number;
  generation: number;
}

export interface TrailerInfo {
  size: number;
  rootRef: ObjectRef;
  infoRef?: ObjectRef;
  encryptRef?: ObjectRef;
  idLiteral?: string;
  generatedId?: Uint8Array;
  prev?: number;
  startxref: number;
  dictionary: string;
  hasXRefStream: boolean;
  /** Offset of /XRefStm entry in hybrid-xref PDFs */
  xrefStmOffset?: number;
  version?: string;
}

/** Internal type used during /Prev chain walking — rootRef may be absent */
type PartialTrailerInfo = Omit<TrailerInfo, 'rootRef'> & { rootRef?: ObjectRef };

/**
 * Parse the last trailer dictionary + startxref value from the given PDF.
 */
export function parsePdfTrailer(pdfBytes: Uint8Array): TrailerInfo {
  const pdfText = LATIN1_DECODER.decode(pdfBytes);
  const versionMatch = pdfText.match(/%PDF-([0-9.]+)/);
  const version = versionMatch ? versionMatch[1] : undefined;

  const startxrefIndex = pdfText.lastIndexOf('startxref');
  if (startxrefIndex === -1) {
    throw new Error('PDF trailer not found: missing startxref');
  }

  const startxrefMatch = pdfText.slice(startxrefIndex).match(/startxref\s+(\d+)/);
  if (!startxrefMatch) {
    throw new Error('PDF trailer not found: startxref lacks numeric value');
  }

  const startxref = Number(startxrefMatch[1]);
  if (!Number.isFinite(startxref)) {
    throw new Error(`Invalid startxref value: ${startxrefMatch[1]}`);
  }

  let result: PartialTrailerInfo;

  // Detect whether startxref points to an xref table or xref stream.
  // For tables, find the trailer keyword AFTER the xref section (not the
  // last trailer in the file, which may belong to a different section).
  // Check a small window around the offset to handle off-by-one startxref
  // values (some PDFs point to 'ref' instead of 'xref').
  let isXrefTable = false;

  if (startxref < pdfBytes.length) {
    const windowStart = Math.max(0, startxref - 4);
    const nearWindow = pdfText.slice(windowStart, startxref + 10);
    isXrefTable = nearWindow.includes('xref');
  }

  if (isXrefTable) {
    result = parseTrailerFromXrefTable(pdfText, pdfBytes, startxref, version);
  } else if (startxref < pdfBytes.length) {
    // Try xref stream; fall back to trailer keyword scan if it fails
    try {
      result = parseTrailerFromXrefStream(pdfBytes, startxref, version);
    } catch {
      result = parseTrailerFromXrefTable(pdfText, pdfBytes, startxref, version);
    }
  } else {
    // startxref out of bounds — scan for trailer keyword
    result = parseTrailerFromXrefTable(pdfText, pdfBytes, startxref, version);
  }

  // Walk /Prev chain if /Root is missing (linearized PDFs, multi-section xref)
  if (!result.rootRef && result.prev !== undefined) {
    walkPrevChainForRoot(pdfBytes, result);
  }

  if (!result.rootRef) {
    throw new Error('PDF trailer missing /Root entry');
  }

  return result as TrailerInfo;
}

/**
 * Walk the /Prev chain to find /Root and other trailer entries
 * that may be in earlier xref sections (common in linearized PDFs).
 */
function walkPrevChainForRoot(
  pdfBytes: Uint8Array,
  result: PartialTrailerInfo
): void {
  const visited = new Set<number>();
  visited.add(result.startxref);
  let prevOffset: number | undefined = result.prev;

  for (let i = 0; i < 100 && prevOffset !== undefined; i++) {
    if (visited.has(prevOffset)) break;
    visited.add(prevOffset);

    try {
      const section = parseTrailerChainSection(pdfBytes, prevOffset);
      if (!result.rootRef && section.rootRef) result.rootRef = section.rootRef;
      if (!result.infoRef && section.infoRef) result.infoRef = section.infoRef;
      if (!result.encryptRef && section.encryptRef)
        result.encryptRef = section.encryptRef;
      if (!result.idLiteral && section.idLiteral)
        result.idLiteral = section.idLiteral;

      if (result.rootRef) break; // Found what we need
      prevOffset = section.prev;
    } catch {
      break;
    }
  }
}

/**
 * Parse minimal trailer information from a /Prev section at the given offset.
 * Detects whether the section is an xref table or xref stream and extracts
 * /Root, /Info, /Encrypt, /ID, and /Prev.
 */
function parseTrailerChainSection(
  pdfBytes: Uint8Array,
  offset: number
): {
  rootRef?: ObjectRef;
  infoRef?: ObjectRef;
  encryptRef?: ObjectRef;
  idLiteral?: string;
  prev?: number;
} {
  if (offset < 0 || offset >= pdfBytes.length) {
    throw new Error('Prev offset out of bounds');
  }

  const peek = LATIN1_DECODER.decode(
    pdfBytes.slice(offset, Math.min(offset + 4, pdfBytes.length))
  );

  if (peek.startsWith('xref')) {
    // xref table — find the trailer dict after the xref table
    const text = LATIN1_DECODER.decode(pdfBytes.slice(offset));
    const trailerIdx = text.indexOf('trailer');
    if (trailerIdx === -1) throw new Error('No trailer after xref');
    const dictStart = text.indexOf('<<', trailerIdx);
    if (dictStart === -1) throw new Error('No dict in trailer');
    const dictEnd = findDictionaryEnd(text, dictStart);
    if (dictEnd === -1) throw new Error('Unterminated trailer dict');
    const dict = text.slice(dictStart, dictEnd);
    return {
      rootRef: extractRef(dict, 'Root'),
      infoRef: extractRef(dict, 'Info'),
      encryptRef: extractRef(dict, 'Encrypt'),
      idLiteral: extractIdLiteral(dict),
      prev: extractNumber(dict, 'Prev'),
    };
  } else {
    // xref stream — parse the stream object dictionary
    let cursor = offset;
    const skipWs = () => {
      while (
        cursor < pdfBytes.length &&
        (pdfBytes[cursor] === 0x00 ||
          pdfBytes[cursor] === 0x09 ||
          pdfBytes[cursor] === 0x0a ||
          pdfBytes[cursor] === 0x0c ||
          pdfBytes[cursor] === 0x0d ||
          pdfBytes[cursor] === 0x20)
      )
        cursor++;
    };
    const readToken = (): string => {
      skipWs();
      const start = cursor;
      while (
        cursor < pdfBytes.length &&
        pdfBytes[cursor] !== 0x00 &&
        pdfBytes[cursor] !== 0x09 &&
        pdfBytes[cursor] !== 0x0a &&
        pdfBytes[cursor] !== 0x0c &&
        pdfBytes[cursor] !== 0x0d &&
        pdfBytes[cursor] !== 0x20
      )
        cursor++;
      return LATIN1_DECODER.decode(pdfBytes.slice(start, cursor));
    };

    readToken(); // object number
    readToken(); // generation
    const objToken = readToken(); // obj (may be concatenated as "obj<<" without whitespace)
    if (!objToken.startsWith('obj')) {
      throw new Error('Expected obj keyword at prev xref stream offset');
    }

    // Handle concatenated "obj<<" — back cursor to the start of <<
    const ltlt = objToken.indexOf('<<');
    if (ltlt >= 0) {
      cursor -= objToken.length - ltlt;
    } else {
      // Scan forward for dictionary start <<
      while (
        cursor < pdfBytes.length - 1 &&
        !(pdfBytes[cursor] === 0x3c && pdfBytes[cursor + 1] === 0x3c)
      ) {
        cursor++;
      }
    }
    const dictStart = cursor;
    const dictEnd = findDictionaryEndBytes(pdfBytes, dictStart);
    const dictString = LATIN1_DECODER.decode(pdfBytes.slice(dictStart, dictEnd));
    const dictionary = parseCOSDictionary(dictString);

    return {
      rootRef: refFromDictionary(dictionary.getItem(COSName.ROOT)),
      infoRef: refFromDictionary(dictionary.getItem(COSName.INFO)),
      encryptRef: refFromDictionary(dictionary.getItem(COSName.ENCRYPT)),
      idLiteral: dictionary.getItem(COSName.ID)
        ? serializeCOS(dictionary.getItem(COSName.ID)!)
        : undefined,
      prev: getOptionalInt(dictionary, COSName.PREV),
    };
  }
}

export interface TrailerBuildOptions {
  size: number;
  prev: number;
}

/**
 * Build a trailer dictionary string for an incremental update using the
 * parsed trailer as a baseline. We retain the important cross-document
 * entries (/Root, /Info, /Encrypt, /ID) and update /Size+/Prev.
 */
export function buildIncrementalTrailerDictionary(
  trailer: TrailerInfo,
  { size, prev }: TrailerBuildOptions
): string {
  const dict = buildIncrementalTrailerDictionaryObject(trailer, { size, prev });
  return serializeTrailerDictionary(dict);
}

export function buildIncrementalTrailerDictionaryObject(
  trailer: TrailerInfo,
  { size, prev }: TrailerBuildOptions
): COSDictionary {
  let dict: COSDictionary;
  try {
    dict = parseCOSDictionary(trailer.dictionary);
  } catch {
    dict = new COSDictionary();
  }

  dict.setItem(COSName.SIZE, new COSInteger(size));
  dict.setItem(COSName.ROOT, refToObject(trailer.rootRef));

  if (trailer.infoRef) {
    dict.setItem(COSName.INFO, refToObject(trailer.infoRef));
  }

  if (trailer.encryptRef) {
    dict.setItem(COSName.ENCRYPT, refToObject(trailer.encryptRef));
  }

  dict.removeItem(new COSName('XRefStm'));

  if (trailer.idLiteral) {
    dict.setItem(COSName.ID, parseIdArray(trailer.idLiteral));
  } else if (trailer.generatedId && trailer.generatedId.length > 0) {
    dict.setItem(COSName.ID, createIdArray(trailer.generatedId));
  }

  if (Number.isFinite(prev)) {
    dict.setItem(COSName.PREV, new COSInteger(prev));
  }

  return dict;
}

export function buildFullTrailerDictionary(
  trailer: TrailerInfo,
  size: number
): string {
  const dict = buildIncrementalTrailerDictionaryObject(trailer, {
    size,
    prev: Number.NaN,
  });
  dict.removeItem(COSName.PREV);
  return serializeTrailerDictionary(dict);
}

function serializeTrailerDictionary(dict: COSDictionary): string {
  const preferredOrder = [
    'Length',
    'Size',
    'Root',
    'Info',
    'Encrypt',
    'Filter',
    'DecodeParms',
    'Type',
    'W',
    'Index',
    'ID',
    'Prev',
  ];
  const lines: string[] = ['<<'];
  const emitted = new Set<string>();

  for (const name of preferredOrder) {
    const value = dict.getItem(new COSName(name));
    if (value) {
      lines.push(`/${name} ${serializeCOS(value)}`);
      emitted.add(name);
    }
  }

  for (const [key, value] of dict.entrySet()) {
    const keyName = key.getName();
    if (emitted.has(keyName)) {
      continue;
    }
    lines.push(`/${keyName} ${serializeCOS(value)}`);
  }

  lines.push('>>');
  return lines.join('\n');
}

function findDictionaryEnd(text: string, startIndex: number): number {
  let depth = 0;
  let i = startIndex;
  while (i < text.length - 1) {
    const ch = text.charCodeAt(i);

    // Skip parenthesized string literals (handles nesting + backslash escapes)
    if (ch === 0x28) {
      // '('
      let sd = 1;
      i++;
      while (i < text.length && sd > 0) {
        const c = text.charCodeAt(i);
        if (c === 0x5c) {
          i += 2;
          continue;
        } // backslash escape
        if (c === 0x28) sd++;
        else if (c === 0x29) sd--;
        i++;
      }
      continue;
    }

    // Skip comments (% to end of line)
    if (ch === 0x25) {
      while (
        i < text.length &&
        text.charCodeAt(i) !== 0x0a &&
        text.charCodeAt(i) !== 0x0d
      )
        i++;
      continue;
    }

    const pair = text[i] + text[i + 1];
    if (pair === '<<') {
      depth++;
      i += 2;
      continue;
    }
    if (pair === '>>') {
      depth--;
      i += 2;
      if (depth === 0) return i;
      continue;
    }

    i++;
  }
  return -1;
}

function extractNumber(dictionary: string, key: string): number | undefined {
  const regex = new RegExp(`/${key}\\s+(-?\\d+)`, 'm');
  const match = dictionary.match(regex);
  if (!match) {
    return undefined;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function extractRef(dictionary: string, key: string): ObjectRef | undefined {
  const regex = new RegExp(`/${key}\\s+(\\d+)\\s+(\\d+)\\s+R`, 'm');
  const match = dictionary.match(regex);
  if (!match) {
    return undefined;
  }
  return {
    objectNumber: Number(match[1]),
    generation: Number(match[2]),
  };
}

function extractIdLiteral(dictionary: string): string | undefined {
  const match = dictionary.match(/\/ID\s*(\[[\s\S]*?\])/);
  return match ? match[1].trim() : undefined;
}

function refToObject(ref: ObjectRef): COSObjectReference {
  return new COSObjectReference(ref.objectNumber, ref.generation);
}

function parseIdArray(literal: string): COSArray {
  const array = new COSArray();
  const matches = literal.match(/<([0-9A-Fa-f]+)>/g);
  if (matches) {
    for (const match of matches) {
      const hex = match.slice(1, -1);
      array.add(new COSString(hexToBytes(hex), true));
    }
  }
  return array;
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.length % 2 === 0 ? hex : hex + '0';
  const result = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    result[i / 2] = parseInt(normalized.slice(i, i + 2), 16);
  }
  return result;
}

function serializeCOS(base: COSBase): string {
  const output = new COSStandardOutputStream();
  const writer = new COSWriter(output);
  base.accept(writer);
  return new TextDecoder('latin1').decode(output.toUint8Array()).trim();
}

/**
 * Parse trailer from an xref table section. Finds the trailer keyword
 * after the xref table at startxref, or falls back to the last trailer
 * keyword in the file if startxref is out of bounds.
 */
function parseTrailerFromXrefTable(
  pdfText: string,
  pdfBytes: Uint8Array,
  startxref: number,
  version?: string
): PartialTrailerInfo {
  // Try to find trailer after the xref section at startxref
  let trailerIndex = -1;
  if (startxref < pdfBytes.length) {
    const windowStart = Math.max(0, startxref - 4);
    const xrefStart = pdfText.indexOf('xref', windowStart);
    const searchFrom = xrefStart >= 0 && xrefStart < startxref + 10
      ? xrefStart : startxref;
    trailerIndex = pdfText.indexOf('trailer', searchFrom);
  }

  // Fallback: scan for the last trailer keyword in the file
  if (trailerIndex === -1) {
    trailerIndex = pdfText.lastIndexOf('trailer');
  }

  if (trailerIndex === -1) {
    throw new Error('PDF trailer not found: missing trailer keyword');
  }

  const dictStart = pdfText.indexOf('<<', trailerIndex);
  if (dictStart === -1) {
    throw new Error('PDF trailer not found: missing << after trailer');
  }

  const dictEnd = findDictionaryEnd(pdfText, dictStart);
  if (dictEnd === -1) {
    throw new Error('PDF trailer not found: unterminated dictionary');
  }

  const dictionary = pdfText.slice(dictStart, dictEnd);
  const size = extractNumber(dictionary, 'Size');
  const rootRef = extractRef(dictionary, 'Root');
  const infoRef = extractRef(dictionary, 'Info');
  const encryptRef = extractRef(dictionary, 'Encrypt');
  const prev = extractNumber(dictionary, 'Prev');
  const idLiteral = extractIdLiteral(dictionary);
  const generatedId = idLiteral ? undefined : computeDeterministicDocumentId(pdfBytes);

  if (size === undefined) {
    throw new Error('PDF trailer missing /Size entry');
  }

  const xrefStmMatch = /\/XRefStm\s+(\d+)/.exec(dictionary);
  const hasXRefStream = xrefStmMatch !== null;
  const xrefStmOffset = xrefStmMatch ? Number(xrefStmMatch[1]) : undefined;

  return {
    size,
    rootRef,
    infoRef,
    encryptRef,
    idLiteral,
    generatedId,
    prev,
    startxref,
    dictionary,
    hasXRefStream,
    xrefStmOffset,
    version,
  };
}

function parseTrailerFromXrefStream(
  pdfBytes: Uint8Array,
  startxref: number,
  version?: string
): PartialTrailerInfo {
  let cursor = startxref;
  const readToken = (): string => {
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
  const isWhitespace = (byte: number) =>
    byte === 0x00 ||
    byte === 0x09 ||
    byte === 0x0a ||
    byte === 0x0c ||
    byte === 0x0d ||
    byte === 0x20;

  readToken(); // object number
  readToken(); // generation
  const objToken = readToken(); // obj (may be concatenated as "obj<<" without whitespace)
  if (!objToken.startsWith('obj')) {
    throw new Error('Expected obj keyword at xref stream offset');
  }

  // Handle concatenated "obj<<" — back cursor to the start of <<
  const ltltInObj = objToken.indexOf('<<');
  if (ltltInObj >= 0) {
    cursor -= objToken.length - ltltInObj;
  } else {
    // Scan forward for dictionary start <<
    while (
      cursor < pdfBytes.length - 1 &&
      !(pdfBytes[cursor] === 0x3c && pdfBytes[cursor + 1] === 0x3c)
    ) {
      cursor++;
    }
  }
  const dictStart = cursor;
  const dictEnd = findDictionaryEndBytes(pdfBytes, dictStart);
  const dictString = LATIN1_DECODER.decode(pdfBytes.slice(dictStart, dictEnd));
  const dictionary = parseCOSDictionary(dictString);
  return {
    size: getInt(dictionary, COSName.SIZE),
    rootRef: refFromDictionary(dictionary.getItem(COSName.ROOT)),
    infoRef: refFromDictionary(dictionary.getItem(COSName.INFO)),
    encryptRef: refFromDictionary(dictionary.getItem(COSName.ENCRYPT)),
    idLiteral: dictionary.getItem(COSName.ID)
      ? serializeCOS(dictionary.getItem(COSName.ID)!)
      : undefined,
    generatedId: dictionary.getItem(COSName.ID)
      ? undefined
      : computeDeterministicDocumentId(pdfBytes),
    prev: getOptionalInt(dictionary, COSName.PREV),
    startxref,
    dictionary: dictString,
    hasXRefStream: true,
    version,
  };
}

function getInt(dict: COSDictionary, name: COSName): number {
  const value = dict.getItem(name);
  if (value instanceof COSInteger) {
    return value.getValue();
  }
  throw new Error(`Missing required trailer entry ${name.getName()}`);
}

function getOptionalInt(dict: COSDictionary, name: COSName): number | undefined {
  const value = dict.getItem(name);
  return value instanceof COSInteger ? value.getValue() : undefined;
}

function refFromDictionary(value: COSBase | undefined): ObjectRef | undefined {
  if (value instanceof COSObjectReference) {
    return {
      objectNumber: value.objectNumber,
      generation: value.generationNumber,
    };
  }
  return undefined;
}

function findDictionaryEndBytes(bytes: Uint8Array, startIndex: number): number {
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
  throw new Error('Unterminated trailer dictionary in xref stream');
}

export function computeDeterministicDocumentId(pdfBytes: Uint8Array): Uint8Array {
  const id = new Uint8Array(16);
  let accumulator = 0x811c9dc5;
  for (let i = 0; i < pdfBytes.length; i++) {
    accumulator = (accumulator + pdfBytes[i] + (i & 0xff)) >>> 0;
    const index = i & 0x0f;
    id[index] = (id[index] ^ (accumulator & 0xff)) & 0xff;
  }
  return id;
}

function createIdArray(bytes: Uint8Array): COSArray {
  const array = new COSArray();
  const first = new COSString(bytes, true);
  const second = new COSString(bytes, true);
  array.add(first);
  array.add(second);
  return array;
}
