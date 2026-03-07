import type { COSBase } from '../cos/COSBase';
import { COSArray, COSDictionary, COSName, COSStream } from '../cos/COSTypes';
import { COSObjectKey } from './COSObjectKey';
import { findReachableObjects } from '../parser/object-graph';

export interface CompressionPlan {
  topLevelKeys: COSObjectKey[];
  objectStreamKeys: COSObjectKey[];
  highestObjectNumber: number;
}

export interface CompressionPoolSource {
  trailerRoot?: COSObjectKey;
  trailerInfo?: COSObjectKey;
  trailerEncrypt?: COSObjectKey;
  objects: Map<string, COSBase>;
}

const TRACE_COMPRESSION =
  typeof process !== 'undefined' &&
  !!(process as any)?.env?.PDFBOX_TS_TRACE &&
  (process as any).env.PDFBOX_TS_TRACE !== '0';

const compressionTrace = (...args: unknown[]) => {
  if (TRACE_COMPRESSION) {
    console.log('[TS TRACE][compression]', ...args);
  }
};

/**
 * Check if a dictionary is a signature dictionary (/Type /Sig).
 * Signature dictionaries should never be packed into object streams.
 */
function isSignatureDictionary(base: COSBase): boolean {
  if (!(base instanceof COSDictionary)) {
    return false;
  }
  const type = base.getItem(COSName.TYPE);
  if (type instanceof COSName && type.getName() === 'Sig') {
    return true;
  }
  // Also check for signature-like dictionaries with /ByteRange
  const byteRange = base.getItem(COSName.BYTERANGE);
  if (byteRange instanceof COSArray) {
    return true;
  }
  return false;
}

/**
 * Lightweight port of PDFBox's COSWriterCompressionPool. Given parsed COS objects,
 * it classifies which keys should remain top-level and which are eligible for
 * object streams.
 *
 * Java's rules (from PDFBox COSWriterCompressionPool):
 * 1. Never pack:
 *    - Streams (COSStream)
 *    - Objects with generation > 0
 *    - Root catalog, Info dict, Encrypt dict
 *    - Signature dictionaries (/Type /Sig)
 *
 * 2. Pack into ObjStm:
 *    - All other dictionaries and arrays
 *    - Generation 0 only
 *    - Sort by object number for determinism
 */
export function buildCompressionPlan(source: CompressionPoolSource): CompressionPlan {
  const topLevelKeys: COSObjectKey[] = [];
  const objectStreamKeys: COSObjectKey[] = [];
  const processedKeys = new Set<string>();
  let highestObjectNumber = 0;

  // First, find all reachable objects from trailer
  const reachable = findReachableObjects(source);
  compressionTrace('reachable-count', reachable.size);

  // Only Root catalog must stay top-level (per PDFBox COSWriterCompressionPool)
  // Info and Encrypt can be packed into object streams
  const isRootCatalog = (key: COSObjectKey): boolean => {
    return !!(
      source.trailerRoot &&
      key.objectNumber === source.trailerRoot.objectNumber &&
      key.generationNumber === source.trailerRoot.generationNumber
    );
  };

  const classifyObject = (key: COSObjectKey, base: COSBase): 'top-level' | 'packable' => {
    // Rule 1: Objects with generation > 0 stay top-level
    if (key.generationNumber !== 0) {
      compressionTrace('top-level:gen>0', key.objectNumber);
      return 'top-level';
    }

    // Rule 2: Streams always stay top-level
    if (base instanceof COSStream) {
      compressionTrace('top-level:stream', key.objectNumber);
      return 'top-level';
    }

    // Rule 3: Only Root catalog stays top-level (per PDFBox behavior)
    if (isRootCatalog(key)) {
      compressionTrace('top-level:root-catalog', key.objectNumber);
      return 'top-level';
    }

    // Rule 4: Signature dictionaries stay top-level
    if (isSignatureDictionary(base)) {
      compressionTrace('top-level:signature', key.objectNumber);
      return 'top-level';
    }

    // Everything else can be packed
    return 'packable';
  };

  // Process all reachable objects
  for (const keyStr of reachable) {
    if (processedKeys.has(keyStr)) {
      continue;
    }
    processedKeys.add(keyStr);

    const [objNumStr, genStr] = keyStr.split('_');
    const key = new COSObjectKey(Number(objNumStr), Number(genStr));
    highestObjectNumber = Math.max(highestObjectNumber, key.objectNumber);

    const obj = source.objects.get(keyStr);
    if (!obj) {
      // Object referenced but not in parsed objects (might be inline or missing)
      continue;
    }

    const classification = classifyObject(key, obj);
    if (classification === 'top-level') {
      topLevelKeys.push(key);
    } else {
      objectStreamKeys.push(key);
    }
  }

  // Sort both arrays by object number for determinism (matches Java ordering)
  const sortKey = (a: COSObjectKey, b: COSObjectKey) =>
    a.objectNumber === b.objectNumber
      ? a.generationNumber - b.generationNumber
      : a.objectNumber - b.objectNumber;

  topLevelKeys.sort(sortKey);
  objectStreamKeys.sort(sortKey);

  compressionTrace('plan-result', {
    topLevel: topLevelKeys.length,
    packable: objectStreamKeys.length,
    highestObjectNumber,
  });

  return { topLevelKeys, objectStreamKeys, highestObjectNumber };
}
