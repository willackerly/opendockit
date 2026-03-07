import { COSWriter } from './COSWriter';
import { COSStandardOutputStream } from './COSStandardOutputStream';
import type { COSBase } from '../cos/COSBase';
import { COSObjectKey } from './COSObjectKey';
import { ObjectNumberAllocator } from './ObjectNumberAllocator';
import { XRefEntryType, type TableXRefEntry } from './XRefEntries';
import type { TrailerInfo } from '../parser/trailer';

/**
 * Lightweight helper for full-document saves. Provides object-number
 * allocation, header/footer helpers, and access to the underlying COSWriter.
 * XRef/trailer emission happens in later steps.
 */
export class FullWriteContext {
  readonly writer: COSWriter;
  readonly allocator: ObjectNumberAllocator;
  private readonly output: COSStandardOutputStream;
  private headerWritten = false;
  private readonly xrefEntries: TableXRefEntry[] = [];

  constructor(trailer: TrailerInfo) {
    this.output = new COSStandardOutputStream();
    this.writer = new COSWriter(this.output);
    this.allocator = new ObjectNumberAllocator(trailer.size);
  }

  registerExistingObject(objectNumber: number, generation: number = 0): void {
    this.allocator.registerExisting(objectNumber, generation);
  }

  allocateObject(generation: number = 0): COSObjectKey {
    return this.allocator.allocate(generation);
  }

  queueObject(key: COSObjectKey, object: COSBase): boolean {
    return this.writer.queueIndirectObject(key.objectNumber, object, key.generationNumber);
  }

  writeRawObject(key: COSObjectKey, raw: Uint8Array | string): number {
    const offset = this.output.getPos();
    if (typeof raw === 'string') {
      this.output.writeString(raw);
    } else {
      this.output.write(raw);
    }
    this.xrefEntries.push({
      objectNumber: key.objectNumber,
      generation: key.generationNumber,
      byteOffset: offset,
      inUse: true,
      type: XRefEntryType.NORMAL,
    });
    return offset;
  }

  flushObjects(): void {
    this.writer.flushQueuedObjects((entry, offset) => {
      this.xrefEntries.push({
        objectNumber: entry.key.objectNumber,
        generation: entry.key.generationNumber,
        byteOffset: offset,
        inUse: true,
        type: XRefEntryType.NORMAL,
      });
    });
  }

  writeHeader(version?: string): void {
    if (this.headerWritten) {
      throw new Error('FullWriteContext header already written');
    }
    this.writer.writeHeader(version);
    this.headerWritten = true;
  }

  writeFooter(startxref: number): void {
    this.writer.writeFooter(startxref);
  }

  addXrefEntry(entry: TableXRefEntry): void {
    this.xrefEntries.push(entry);
  }

  getXrefEntries(): TableXRefEntry[] {
    return [...this.xrefEntries];
  }

  getCurrentOffset(): number {
    return this.output.getPos();
  }

  getOutputStream(): COSStandardOutputStream {
    return this.output;
  }

  toUint8Array(): Uint8Array {
    return this.output.toUint8Array();
  }
}
