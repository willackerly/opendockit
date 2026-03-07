import type { COSBase } from '../cos/COSBase';
import { COSArray, COSDictionary, COSObjectReference, COSStream } from '../cos/COSTypes';
import { COSObjectKey } from '../writer/COSObjectKey';

export interface ObjectGraphSource {
  trailerRoot?: COSObjectKey;
  trailerInfo?: COSObjectKey;
  trailerEncrypt?: COSObjectKey;
  objects: Map<string, COSBase>;
}

/**
 * Find all objects reachable from the trailer (Root, Info, Encrypt).
 * This mirrors PDFBox's traversal during save to identify which objects
 * should be included in the output and eliminates orphaned objects.
 */
export function findReachableObjects(source: ObjectGraphSource): Set<string> {
  const reachable = new Set<string>();
  const visited = new WeakSet<COSBase>();

  const keyToString = (key: COSObjectKey): string =>
    `${key.objectNumber}_${key.generationNumber}`;

  const traverse = (base: COSBase | undefined | null): void => {
    if (!base) {
      return;
    }
    if (visited.has(base)) {
      return;
    }
    visited.add(base);

    if (base instanceof COSObjectReference) {
      const key = new COSObjectKey(base.objectNumber, base.generationNumber);
      const keyStr = keyToString(key);
      if (!reachable.has(keyStr)) {
        reachable.add(keyStr);
        const target = source.objects.get(keyStr);
        if (target) {
          traverse(target);
        }
      }
      return;
    }

    if (base instanceof COSStream) {
      traverse(base.getDictionary());
      return;
    }

    if (base instanceof COSDictionary) {
      for (const [, value] of base.entrySet()) {
        traverse(value);
      }
      return;
    }

    if (base instanceof COSArray) {
      for (const element of base.getElements()) {
        traverse(element);
      }
    }
  };

  const traverseFromKey = (key: COSObjectKey | undefined): void => {
    if (!key) {
      return;
    }
    const keyStr = keyToString(key);
    reachable.add(keyStr);
    const obj = source.objects.get(keyStr);
    if (obj) {
      traverse(obj);
    }
  };

  // Start from trailer references
  traverseFromKey(source.trailerRoot);
  traverseFromKey(source.trailerInfo);
  traverseFromKey(source.trailerEncrypt);

  return reachable;
}

/**
 * Filter a map of objects to only include those that are reachable.
 */
export function filterReachableObjects(
  source: ObjectGraphSource
): Map<string, COSBase> {
  const reachable = findReachableObjects(source);
  const filtered = new Map<string, COSBase>();

  for (const [keyStr, obj] of source.objects.entries()) {
    if (reachable.has(keyStr)) {
      filtered.set(keyStr, obj);
    }
  }

  return filtered;
}
