import { XRefEntryType, type TableXRefEntry } from './XRefEntries';

type XRefEntry = TableXRefEntry;

export function sortXRefEntries(entries: TableXRefEntry[]): TableXRefEntry[] {
  return [...entries].sort((a, b) => {
    if (a.objectNumber === b.objectNumber) {
      return a.generation - b.generation;
    }
    return a.objectNumber - b.objectNumber;
  });
}

export function buildXrefRanges(entries: XRefEntry[]): Array<{ start: number; count: number }> {
  if (entries.length === 0) {
    return [];
  }
  const sorted = sortXRefEntries(entries);
  const ranges: Array<{ start: number; count: number }> = [];
  let start = sorted[0].objectNumber;
  let count = 1;
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const prev = sorted[i - 1];
    if (current.objectNumber === prev.objectNumber + 1) {
      count += 1;
    } else {
      ranges.push({ start, count });
      start = current.objectNumber;
      count = 1;
    }
  }
  ranges.push({ start, count });
  return ranges;
}

/**
 * Prepare xref entries for writing. Mimics COSWriter.doWriteXRefTable behavior:
 * - In incremental mode, ensure the null free entry (0 65535 f) exists.
 * - Otherwise, fill every numeric gap with Free entries that point to the next free object.
 */
export function prepareXrefEntries(
  entries: TableXRefEntry[],
  { incremental }: { incremental: boolean }
): XRefEntry[] {
  const sorted = sortXRefEntries(entries);
  if (incremental) {
    return ensureNullEntry(sorted);
  }
  return fillGapsWithFreeEntries(sorted);
}

const NULL_ENTRY: XRefEntry = {
  objectNumber: 0,
  generation: 65535,
  byteOffset: 0,
  inUse: false,
  type: XRefEntryType.FREE,
};

function ensureNullEntry(entries: TableXRefEntry[]): TableXRefEntry[] {
  const hasNull = entries.some(
    (entry) => entry.objectNumber === 0 && !entry.inUse && entry.generation === 65535
  );
  if (hasNull) {
    return entries;
  }
  return sortXRefEntries([...entries, NULL_ENTRY]);
}

function fillGapsWithFreeEntries(entries: TableXRefEntry[]): TableXRefEntry[] {
  const normals = entries.filter((entry) => entry.inUse);
  const freeNumbers: number[] = [];
  let last = 0;
  for (const entry of normals) {
    const nr = entry.objectNumber;
    if (nr > last) {
      for (let i = last; i < nr; i++) {
        freeNumbers.push(i);
      }
    }
    last = nr + 1;
  }

  const result: XRefEntry[] = [...normals];

  if (freeNumbers.length === 0) {
    result.push(NULL_ENTRY);
    return sortXRefEntries(result);
  }

  for (let i = 0; i < freeNumbers.length - 1; i++) {
    result.push({
      objectNumber: freeNumbers[i],
      generation: 65535,
      byteOffset: freeNumbers[i + 1],
      inUse: false,
      type: XRefEntryType.FREE,
    });
  }

  const lastFree = freeNumbers[freeNumbers.length - 1];
  result.push({
    objectNumber: lastFree,
    generation: 65535,
    byteOffset: 0,
    inUse: false,
    type: XRefEntryType.FREE,
  });

  const firstFree = freeNumbers[0];
  if (firstFree > 0) {
    result.push({
      objectNumber: 0,
      generation: 65535,
      byteOffset: firstFree,
      inUse: false,
      type: XRefEntryType.FREE,
    });
  }

  return sortXRefEntries(result);
}
