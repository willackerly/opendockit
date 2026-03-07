/**
 * Minimal port of Apache PDFBox's COSObjectKey.
 *
 * Tracks the object + generation numbers for use in xref tables and
 * incremental update bookkeeping.
 */
export class COSObjectKey {
  readonly objectNumber: number;
  readonly generationNumber: number;

  constructor(objectNumber: number, generationNumber: number = 0) {
    if (!Number.isFinite(objectNumber) || objectNumber < 0) {
      throw new Error(`Invalid object number for COSObjectKey: ${objectNumber}`);
    }
    if (!Number.isFinite(generationNumber) || generationNumber < 0) {
      throw new Error(
        `Invalid generation number for COSObjectKey: ${generationNumber}`
      );
    }
    this.objectNumber = objectNumber;
    this.generationNumber = generationNumber;
  }

  equals(other: COSObjectKey): boolean {
    return (
      this.objectNumber === other.objectNumber &&
      this.generationNumber === other.generationNumber
    );
  }

  toString(): string {
    return `${this.objectNumber}_${this.generationNumber}`;
  }
}
