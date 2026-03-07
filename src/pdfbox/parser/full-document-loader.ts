import { COSObjectKey } from '../writer/COSObjectKey';
import type { COSBase } from '../cos/COSBase';
import { COSDictionary, COSName, COSInteger, COSArray, COSObjectReference } from '../cos/COSTypes';
import { safeInflate as inflate } from './safe-inflate';
import type { TrailerInfo } from './trailer';
import { parseXrefEntries, extractStreamObject } from './xref';
import { extractObjectFromObjectStream } from './object';
import { buildCOSStreamFromDictionary, parseCOSObject } from './cosParser';
import type { TableXRefEntry } from '../writer/XRefEntries';
import { XRefEntryType } from '../writer/XRefEntries';

export interface RawIndirectObject {
  key: COSObjectKey;
  raw: Uint8Array;
  byteOffset?: number;
}

export interface ParsedIndirectObject {
  key: COSObjectKey;
  object: COSBase;
  byteOffset?: number;
  entry?: TableXRefEntry;
}

const LATIN1_DECODER = new TextDecoder('latin1');

/**
 * Load raw indirect objects from a PDF using the xref entries as offsets.
 */
export function loadRawIndirectObjects(
  pdfBytes: Uint8Array,
  trailer: TrailerInfo
): { objects: RawIndirectObject[]; entries: TableXRefEntry[] } {
  const { entries } = parseXrefEntries(pdfBytes, trailer);
  const normalEntries = entries
    .filter((entry) => entry.inUse && entry.type === XRefEntryType.NORMAL)
    .filter((entry) => Number.isFinite(entry.byteOffset));
  const sorted = [...normalEntries].sort((a, b) => (a.byteOffset ?? 0) - (b.byteOffset ?? 0));
  const objects: RawIndirectObject[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const start = entry.byteOffset ?? 0;
    const end = findNextOffset(sorted, start, pdfBytes.length);
    const slice = pdfBytes.subarray(start, end);
    const decoded = LATIN1_DECODER.decode(slice);
    const endObjIdx = decoded.lastIndexOf('endobj');
    const length = endObjIdx >= 0 ? endObjIdx + 'endobj'.length : decoded.length;
    const raw = slice.subarray(0, length);
    const key = new COSObjectKey(entry.objectNumber, entry.generation);
    objects.push({ key, raw, byteOffset: entry.byteOffset });
  }
  return { objects, entries };
}

/**
 * Load parsed indirect objects (including ObjStm children) so full-save can
 * replay parsed COS structures and discover reachability.
 */
export function loadParsedIndirectObjects(
  pdfBytes: Uint8Array,
  trailer: TrailerInfo
): ParsedIndirectObject[] {
  const result = loadParsedIndirectObjectsFromXref(pdfBytes, trailer);

  // Recovery: if xref-based loading produced too few successful parses
  // (common with broken xref offsets), fall back to scanning the file
  // for object headers directly.
  const { entries } = parseXrefEntries(pdfBytes, trailer);
  const expectedInUse = entries.filter(e => e.inUse).length;
  const needsRecovery =
    // Too few objects loaded
    (result.length < expectedInUse * 0.5 && expectedInUse > 0) ||
    // Catalog object missing or not a dictionary (xref offsets are bogus)
    !hasCatalogDict(result, trailer);

  if (needsRecovery) {
    const recovered = loadParsedIndirectObjectsByScanning(pdfBytes);
    if (recovered.length > result.length || hasCatalogDict(recovered, trailer)) {
      return recovered;
    }
  }

  // Supplementary recovery: fill in missing objects from brute-force scan.
  // This handles PDFs where some xref offsets are correct but others are bogus
  // (e.g., incremental updates that point to whitespace), and also PDFs where
  // objects are in Object Streams that the brute-force xref scan can't reference.
  const loadedObjNums = new Set(result.map(p => p.key.objectNumber));

  // Determine which objects are missing:
  // 1. Objects from xref that weren't loaded
  const missingFromXref = entries
    .filter(e => e.inUse && !loadedObjNums.has(e.objectNumber))
    .map(e => e.objectNumber);
  // 2. Critical references from loaded catalog/pages that aren't in the set
  const missingRefs = findMissingCriticalRefs(result, trailer, loadedObjNums);
  const allMissing = [...new Set([...missingFromXref, ...missingRefs])];

  if (allMissing.length > 0) {
    const scanned = loadParsedIndirectObjectsByScanning(pdfBytes);
    for (const obj of scanned) {
      if (!loadedObjNums.has(obj.key.objectNumber)) {
        result.push(obj);
        loadedObjNums.add(obj.key.objectNumber);
      }
    }
  }

  return result;
}

/**
 * Check if the loaded objects include a proper catalog dictionary.
 * Used to detect when xref offsets are bogus (point to wrong data).
 */
function hasCatalogDict(
  parsed: ParsedIndirectObject[],
  trailer: TrailerInfo,
): boolean {
  const catalogObj = parsed.find(
    (p) => p.key.objectNumber === trailer.rootRef.objectNumber
  );
  return catalogObj?.object instanceof COSDictionary;
}

/**
 * Find object numbers that are referenced by the catalog/pages but not loaded.
 * This catches Object Stream children that the brute-force xref scan missed.
 */
function findMissingCriticalRefs(
  parsed: ParsedIndirectObject[],
  trailer: TrailerInfo,
  loadedObjNums: Set<number>,
): number[] {
  const missing: number[] = [];

  // Find catalog and check /Pages reference
  const catalogObj = parsed.find(
    (p) => p.key.objectNumber === trailer.rootRef.objectNumber
  );
  if (catalogObj?.object instanceof COSDictionary) {
    const pagesRef = catalogObj.object.getItem('Pages');
    if (pagesRef instanceof COSObjectReference && !loadedObjNums.has(pagesRef.objectNumber)) {
      missing.push(pagesRef.objectNumber);
    }
  }

  return missing;
}

/**
 * Standard xref-based object loading.
 */
function loadParsedIndirectObjectsFromXref(
  pdfBytes: Uint8Array,
  trailer: TrailerInfo
): ParsedIndirectObject[] {
  const shouldTrace =
    typeof process !== 'undefined' &&
    !!(process as any).env?.PDFBOX_TS_TRACE &&
    (process as any).env.PDFBOX_TS_TRACE !== '0';
  const trace = (...args: unknown[]) => {
    if (shouldTrace) {
      console.log('[TS TRACE][loader]', ...args);
    }
  };
  const { entries } = parseXrefEntries(pdfBytes, trailer);
  trace('entries', entries.length);
  const entryMap = new Map<number, TableXRefEntry>();
  for (const entry of entries) {
    if (entry.inUse) {
      entryMap.set(entry.objectNumber, entry);
    }
  }

  const parsed: ParsedIndirectObject[] = [];
  const normalErrors: Array<{ key: COSObjectKey; error: unknown }> = [];
  const objstmErrors: Array<{ key: COSObjectKey; parent?: COSObjectKey; error: unknown }> = [];
  for (const entry of entries) {
    if (!entry.inUse) continue;
    if (entry.type === XRefEntryType.NORMAL && entry.byteOffset !== undefined) {
      const byteOffset = entry.byteOffset;
      try {
        let object: COSBase | undefined;
        const sliceEnd = findNextOffset(entries, byteOffset, pdfBytes.length);
        const slice = pdfBytes.subarray(byteOffset, sliceEnd);
        try {
          const { dictionary, streamData } = extractStreamObject(pdfBytes, byteOffset);
          object = buildCOSStreamFromDictionary(dictionary, streamData);
        } catch (streamErr) {
          // Guard: non-stream objects should be small. If the slice is large,
          // it's likely binary stream data that extractStreamObject failed to
          // parse. Feeding it to the tokenizer would OOM.
          const MAX_NONSTREAM_BODY = 100_000; // 100KB
          if (slice.length > MAX_NONSTREAM_BODY) {
            normalErrors.push({
              key: new COSObjectKey(entry.objectNumber, entry.generation),
              error: new Error(`Object body too large for non-stream parse (${slice.length} bytes)`),
            });
            trace('normal-skip-large', entry.objectNumber, entry.generation, slice.length);
          } else {
            const decoded = LATIN1_DECODER.decode(slice);
            // Use first endobj after our object header (not last, which may
            // belong to a subsequent object in the slice).
            const headerPattern = new RegExp(`${entry.objectNumber}\\s+${entry.generation}\\s+obj\\b`);
            const headerMatch = headerPattern.exec(decoded);
            // If the expected object header is not found near the start of the slice,
            // this xref offset is bogus. Skip and let supplementary recovery handle it.
            if (!headerMatch || headerMatch.index > 20) {
              normalErrors.push({
                key: new COSObjectKey(entry.objectNumber, entry.generation),
                error: new Error(`Object header for ${entry.objectNumber} not found at xref offset ${byteOffset}`),
              });
              trace('normal-skip-bad-offset', entry.objectNumber, entry.generation, byteOffset);
              continue;
            }
            const searchFrom = headerMatch.index + headerMatch[0].length;
            const endIdx = decoded.indexOf('endobj', searchFrom);
            let body = endIdx >= 0 ? decoded.slice(0, endIdx) : decoded;
            body = stripObjectHeader(body, entry.objectNumber, entry.generation);
            // Strip stream content if present (dict-only parse)
            const streamIdx = body.indexOf('\nstream');
            if (streamIdx >= 0) body = body.slice(0, streamIdx);
            const streamIdx2 = body.indexOf('\rstream');
            if (streamIdx2 >= 0) body = body.slice(0, streamIdx2);
            try {
              object = parseCOSObject(body.trim());
            } catch (parseErr) {
              normalErrors.push({
                key: new COSObjectKey(entry.objectNumber, entry.generation),
                error: parseErr,
              });
              trace('normal-parse-failed', entry.objectNumber, entry.generation, String(parseErr));
            }
          }
        }
        if (object) {
          parsed.push({
            key: new COSObjectKey(entry.objectNumber, entry.generation),
            object,
            byteOffset: entry.byteOffset,
            entry,
          });
        }
      } catch (error) {
        normalErrors.push({ key: new COSObjectKey(entry.objectNumber, entry.generation), error });
        trace('normal-error', entry.objectNumber, entry.generation, String(error));
      }
      continue;
    }

    if (
      entry.type === XRefEntryType.OBJECT_STREAM &&
      entry.objectStreamParent !== undefined &&
      entry.objectStreamIndex !== undefined
    ) {
      const parentEntry = entryMap.get(entry.objectStreamParent);
      if (!parentEntry || parentEntry.byteOffset === undefined) {
        continue;
      }
      const parentOffset = parentEntry.byteOffset;
      try {
        const parsedChild = extractObjectFromObjectStream(
          pdfBytes,
          parentOffset,
          parentEntry.objectNumber,
          entry.objectNumber
        );
        const object = parseCOSObject(parsedChild.body);
        parsed.push({
          key: new COSObjectKey(entry.objectNumber, entry.generation),
          object,
          byteOffset: parsedChild.objectNumber === entry.objectNumber ? parentOffset : undefined,
          entry,
        });
      } catch (error) {
        objstmErrors.push({
          key: new COSObjectKey(entry.objectNumber, entry.generation),
          parent: new COSObjectKey(parentEntry.objectNumber, parentEntry.generation),
          error,
        });
        trace(
          'objstm-error',
          entry.objectNumber,
          'parent',
          parentEntry.objectNumber,
          String(error)
        );
      }
    }
  }
  trace('parsed-count', parsed.length, 'normal-errors', normalErrors.length, 'objstm-errors', objstmErrors.length);

  return parsed;
}

/**
 * Recovery: scan the entire PDF for "N G obj" headers and parse objects at
 * their actual byte positions. This handles PDFs with incorrect xref offsets.
 */
function loadParsedIndirectObjectsByScanning(
  pdfBytes: Uint8Array
): ParsedIndirectObject[] {
  const text = LATIN1_DECODER.decode(pdfBytes);
  const parsed: ParsedIndirectObject[] = [];

  // Track object stream locations for second pass
  const objectStreams: Array<{ objectNumber: number; offset: number }> = [];

  // Find all "N G obj" patterns in the file
  const objPattern = /(?:^|\n|\r)(\d+)\s+(\d+)\s+obj\b/g;
  let match: RegExpExecArray | null;

  while ((match = objPattern.exec(text)) !== null) {
    const objectNumber = Number(match[1]);
    const generation = Number(match[2]);
    // The actual offset is where the object number starts (skip the leading newline)
    const headerStart = match.index + (match[0].length - match[0].trimStart().length);

    try {
      let object: COSBase | undefined;
      let isObjStm = false;

      // Try as stream first
      try {
        const { dictionary, streamData } = extractStreamObject(pdfBytes, headerStart);
        object = buildCOSStreamFromDictionary(dictionary, streamData);
        // Check if this is an Object Stream
        const typeEntry = dictionary.getItem('Type');
        if (typeEntry instanceof COSName && typeEntry.getName() === 'ObjStm') {
          isObjStm = true;
        }
      } catch {
        // Try as non-stream object
        const endObjIdx = text.indexOf('endobj', headerStart);
        if (endObjIdx >= 0) {
          let body = text.slice(headerStart, endObjIdx);
          body = stripObjectHeader(body, objectNumber, generation);
          // Strip stream content if present
          const streamIdx = body.indexOf('\nstream');
          if (streamIdx >= 0) body = body.slice(0, streamIdx);
          const streamIdx2 = body.indexOf('\rstream');
          if (streamIdx2 >= 0) body = body.slice(0, streamIdx2);
          const trimmed = body.trim();
          if (trimmed.length > 0 && trimmed.length < 100_000) {
            object = parseCOSObject(trimmed);
          }
        }
      }

      if (object) {
        // Only keep the last occurrence of each object number
        // (later in file = more recent incremental update)
        const existingIdx = parsed.findIndex(
          p => p.key.objectNumber === objectNumber && p.key.generationNumber === generation
        );
        const entry: ParsedIndirectObject = {
          key: new COSObjectKey(objectNumber, generation),
          object,
          byteOffset: headerStart,
        };
        if (existingIdx >= 0) {
          parsed[existingIdx] = entry;
        } else {
          parsed.push(entry);
        }
        if (isObjStm) {
          objectStreams.push({ objectNumber, offset: headerStart });
        }
      }
    } catch {
      // Skip unparseable objects
    }
  }

  // Second pass: extract objects from Object Streams
  for (const { objectNumber: parentNumber, offset } of objectStreams) {
    try {
      const { dictionary, streamData } = extractStreamObject(pdfBytes, offset);
      const firstValue = dictionary.getItem('First');
      const nValue = dictionary.getItem('N');
      if (!(firstValue instanceof COSInteger) || !(nValue instanceof COSInteger)) continue;
      const first = firstValue.getValue();
      const n = nValue.getValue();

      const decoded = decodeObjStmData(dictionary, streamData, parentNumber);
      const headerBytes = decoded.slice(0, first);
      const header = LATIN1_DECODER.decode(headerBytes).trim();
      const headerParts = header.split(/\s+/);
      if (headerParts.length < n * 2) continue;

      for (let i = 0; i < Math.min(headerParts.length, n * 2); i += 2) {
        const childObjNum = Number(headerParts[i]);
        const childOffset = Number(headerParts[i + 1]);
        const nextOffset = (i + 2 < headerParts.length)
          ? Number(headerParts[i + 3])
          : decoded.length - first;

        // Skip if we already have this object
        if (parsed.some(p => p.key.objectNumber === childObjNum)) continue;

        try {
          const start = first + childOffset;
          const end = first + nextOffset;
          const bodyBytes = decoded.slice(start, end);
          const bodyStr = LATIN1_DECODER.decode(bodyBytes).trim();
          if (bodyStr.length > 0 && bodyStr.length < 100_000) {
            const childObj = parseCOSObject(bodyStr);
            parsed.push({
              key: new COSObjectKey(childObjNum, 0),
              object: childObj,
              byteOffset: offset,
            });
          }
        } catch {
          // Skip unparseable child objects
        }
      }
    } catch {
      // Skip unparseable object streams
    }
  }

  return parsed;
}

function stripObjectHeader(body: string, objectNumber: number, generation: number): string {
  // Match "N G obj" with any whitespace between tokens (spaces, newlines, tabs)
  const pattern = new RegExp(`${objectNumber}\\s+${generation}\\s+obj\\b`);
  const match = pattern.exec(body);
  if (!match) {
    return body;
  }
  return body.slice(match.index + match[0].length).trimStart();
}

/**
 * Decode Object Stream data (apply /Filter if present).
 * Simplified version of the decoder in object.ts for the scanning fallback path.
 */
function decodeObjStmData(
  dictionary: COSDictionary,
  data: Uint8Array,
  parentObjectNumber: number,
): Uint8Array {
  const filter = dictionary.getItem('Filter');
  if (!filter) return data;
  if (filter instanceof COSName) {
    if (filter.getName() === 'FlateDecode') return inflate(data);
    throw new Error(`Unsupported filter ${filter.getName()} on ObjStm ${parentObjectNumber}`);
  }
  if (filter instanceof COSArray) {
    return filter.getElements().reduce((current, entry) => {
      if (entry instanceof COSName && entry.getName() === 'FlateDecode') {
        return inflate(current);
      }
      return current;
    }, data);
  }
  return data;
}

function findNextOffset(entries: TableXRefEntry[], currentOffset: number, fallback: number): number {
  const later = entries
    .filter(
      (e) =>
        e.inUse &&
        e.type === XRefEntryType.NORMAL &&
        e.byteOffset !== undefined &&
        e.byteOffset > currentOffset
    )
    .map((e) => e.byteOffset ?? fallback);
  if (later.length === 0) {
    return fallback;
  }
  return Math.min(...later);
}
