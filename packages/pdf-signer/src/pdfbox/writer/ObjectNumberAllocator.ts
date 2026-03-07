import { COSObjectKey } from './COSObjectKey';

/**
 * Helper that mirrors PDFBox's COSDocument/COSObjectNumberTree behavior:
 * keeps track of which object numbers are already used and allocates the
 * next free number for new objects.
 */
export class ObjectNumberAllocator {
  private readonly used = new Set<string>();
  private nextObjectNumber: number;

  constructor(initialSize: number = 0) {
    this.nextObjectNumber = Math.max(0, initialSize);
  }

  /**
   * Register an object number that already exists in the document.
   */
  registerExisting(objectNumber: number, generationNumber: number = 0): void {
    const key = this.key(objectNumber, generationNumber);
    this.used.add(key);
    if (objectNumber >= this.nextObjectNumber) {
      this.nextObjectNumber = objectNumber + 1;
    }
  }

  /**
   * Allocate the next available object number.
   */
  allocate(generationNumber: number = 0): COSObjectKey {
    let candidate = this.nextObjectNumber;
    while (this.used.has(this.key(candidate, generationNumber))) {
      candidate += 1;
    }
    const key = new COSObjectKey(candidate, generationNumber);
    this.used.add(this.key(candidate, generationNumber));
    this.nextObjectNumber = candidate + 1;
    return key;
  }

  private key(objectNumber: number, generationNumber: number): string {
    return `${objectNumber}_${generationNumber}`;
  }
}
