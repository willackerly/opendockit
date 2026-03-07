import { COSObjectKey } from './COSObjectKey';
import { XRefBuilder } from './XRefBuilder';
import type { TrailerInfo } from '../parser/trailer';
import { buildIncrementalTrailerDictionary } from '../parser/trailer';
import type { XRefEntry } from './XRefWriter';

/**
 * Coordinates incremental updates by allocating new object numbers,
 * tracking byte offsets, and generating the trailer/xref table.
 */
export class IncrementalUpdateManager {
  private readonly trailer: TrailerInfo;
  private readonly builder: XRefBuilder;
  private nextObjectNumber: number;

  constructor(trailer: TrailerInfo) {
    this.trailer = trailer;
    this.builder = new XRefBuilder();
    this.nextObjectNumber = trailer.size;
  }

  allocateObject(generation: number = 0): COSObjectKey {
    const key = new COSObjectKey(this.nextObjectNumber++, generation);
    return key;
  }

  registerOffset(key: COSObjectKey, byteOffset: number): void {
    this.builder.addObject(key, byteOffset);
  }

  registerExistingObject(
    objectNumber: number,
    generationNumber: number,
    byteOffset: number
  ): void {
    const key = new COSObjectKey(objectNumber, generationNumber);
    this.registerOffset(key, byteOffset);
  }

  registerObjectStreamEntry(
    childKey: COSObjectKey,
    parentKey: COSObjectKey,
    index: number
  ): void {
    this.builder.addObjectStreamEntry(childKey, parentKey, index);
  }

  buildXrefEntries(): XRefEntry[] {
    return this.builder.build();
  }

  buildTrailerDictionary(): string {
    return buildIncrementalTrailerDictionary(this.trailer, {
      size: this.getUpdatedSize(),
      prev: this.trailer.startxref,
    });
  }

  getUpdatedSize(): number {
    return Math.max(this.nextObjectNumber, this.trailer.size);
  }

  getTrailer(): TrailerInfo {
    return this.trailer;
  }
}
