import type { TrailerInfo } from '../parser/trailer';
import { parseXrefEntries } from '../parser/xref';
import type { TableXRefEntry } from './XRefEntries';

export interface ObjectLocation {
  entry: TableXRefEntry;
}

/**
 * Minimal representation of the existing PDF document state derived from
 * the prior xref table. This mirrors PDFBox's COSDocumentState enough for
 * incremental signing (track which objects exist and their offsets).
 */
export class COSDocumentState {
  private readonly locations = new Map<string, ObjectLocation>();

  constructor(pdfBytes: Uint8Array, trailer: TrailerInfo) {
    const { entries } = parseXrefEntries(pdfBytes, trailer);
    entries.forEach((entry) => {
      const key = this.key(entry.objectNumber, entry.generation);
      this.locations.set(key, { entry });
    });
  }

  hasObject(objectNumber: number, generationNumber: number = 0): boolean {
    return this.locations.has(this.key(objectNumber, generationNumber));
  }

  getObjectOffset(
    objectNumber: number,
    generationNumber: number = 0
  ): number | undefined {
    return this.locations.get(this.key(objectNumber, generationNumber))?.entry.byteOffset;
  }

  getLocation(
    objectNumber: number,
    generationNumber: number = 0
  ): ObjectLocation | undefined {
    return this.locations.get(this.key(objectNumber, generationNumber));
  }

  private key(objectNumber: number, generationNumber: number): string {
    return `${objectNumber}_${generationNumber}`;
  }
}
