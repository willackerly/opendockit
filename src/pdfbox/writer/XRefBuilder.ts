import { COSObjectKey } from './COSObjectKey';
import {
  BaseXRefEntry,
  NormalXRefEntry,
  FreeXRefEntry,
  ObjectStreamXRefEntry,
  type TableXRefEntry,
} from './XRefEntries';

/**
 * Helper for building cross-reference tables from COSObjectKeys.
 *
 * Mimics PDFBox's COSWriterXRefTableWriter by allowing callers to register
 * byte offsets for updated objects (catalog, page, AcroForm, etc.) and emit
 * a sorted list of entries ready for {@link writeXrefTable}.
 */
export class XRefBuilder {
  private readonly entries = new Map<string, BaseXRefEntry>();

  constructor(includeFreeEntry: boolean = true) {
    if (includeFreeEntry) {
      this.addEntry(FreeXRefEntry.NULL_ENTRY);
    }
  }

  addObject(
    key: COSObjectKey,
    byteOffset: number,
    inUse: boolean = true
  ): void {
    if (byteOffset < 0) {
      throw new Error(`XRef entry offset cannot be negative (key ${key})`);
    }

    const entry = inUse
      ? new NormalXRefEntry(key, byteOffset)
      : new FreeXRefEntry(key, 0);
    this.addEntry(entry);
  }

  addEntry(entry: BaseXRefEntry): void {
    const mapKey = `${entry.key.objectNumber}_${entry.key.generationNumber}`;
    this.entries.set(mapKey, entry);
  }

  addRaw(entry: TableXRefEntry): void {
    const key = new COSObjectKey(entry.objectNumber, entry.generation);
    if (entry.inUse) {
      this.addEntry(new NormalXRefEntry(key, entry.byteOffset));
    } else {
      this.addEntry(new FreeXRefEntry(key, entry.byteOffset));
    }
  }

  addObjectStreamEntry(
    childKey: COSObjectKey,
    parentKey: COSObjectKey,
    index: number
  ): void {
    this.addEntry(new ObjectStreamXRefEntry(childKey, parentKey, index));
  }

  build(): TableXRefEntry[] {
    return Array.from(this.entries.values())
      .map((entry) => entry.toTableEntry())
      .sort((a, b) => {
        if (a.objectNumber === b.objectNumber) {
          return a.generation - b.generation;
        }
        return a.objectNumber - b.objectNumber;
      });
  }
}
