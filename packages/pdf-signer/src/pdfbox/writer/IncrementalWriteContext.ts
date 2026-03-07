import { COSStandardOutputStream } from './COSStandardOutputStream';
import { COSWriter } from './COSWriter';
import type { COSBase } from '../cos/COSBase';
import type { IncrementalUpdateManager } from './IncrementalUpdateManager';
import { writeXrefTable, writeTrailer } from './XRefWriter';
import type { TrailerInfo } from '../parser/trailer';
import { ObjectStreamPool } from './ObjectStreamPool';
import { COSObjectKey } from './COSObjectKey';
import { COSDictionary, COSName, COSStream } from '../cos/COSTypes';
import { XRefEntryType, type TableXRefEntry } from './XRefEntries';
import { buildXRefStream } from './XRefStreamWriter';

/**
 * Lightweight helper mirroring PDFBox's incremental writer: copy the original
 * bytes, append new objects via COSWriter, then emit xref + trailer.
 */
export class IncrementalWriteContext {
  private readonly output: COSStandardOutputStream;
  readonly writer: COSWriter;
  private readonly objectStreamPool?: ObjectStreamPool;
  private readonly objectStreamMinObjectNumber: number;
  private readonly useXrefStream: boolean;
  private updateManager?: IncrementalUpdateManager;

  constructor(
    originalBytes: Uint8Array,
    options?: {
      enableObjectStreams?: boolean;
      objectStreamMinObjectNumber?: number;
      useXrefStream?: boolean;
    }
  ) {
    this.output = new COSStandardOutputStream();
    this.writer = new COSWriter(this.output);
    this.output.write(originalBytes);
    if (originalBytes.length > 0) {
      // Always add \r\n separator between original content and incremental
      // update — matches Java PDFBox behavior. Even when the original PDF
      // ends with \n, Java still appends \r\n before the incremental objects.
      this.output.writeString('\r\n');
    }
    this.objectStreamMinObjectNumber =
      options?.objectStreamMinObjectNumber ?? Number.MAX_SAFE_INTEGER;
    if (options?.enableObjectStreams) {
      this.objectStreamPool = new ObjectStreamPool();
    }
    this.useXrefStream = options?.useXrefStream ?? false;
  }

  enableIncrementalTracking(originalLength: number): void {
    this.writer.setIncrementalUpdate(true, originalLength);
  }

  bindUpdateManager(manager: IncrementalUpdateManager): void {
    this.updateManager = manager;
  }

  writeIndirectObject(
    objectNumber: number,
    object: COSBase,
    generation: number = 0
  ): number {
    if (
      this.objectStreamPool &&
      this.isObjectStreamCandidate(objectNumber, generation, object)
    ) {
      this.objectStreamPool.enqueue(new COSObjectKey(objectNumber, generation), object);
      if (this.objectStreamPool.shouldFlush()) {
        this.flushObjectStreams(this.updateManager);
      }
      return -1;
    }
    return this.writer.writeIndirectObject(objectNumber, object, generation);
  }

  writeRawObject(body: string): number {
    const start = this.output.getPos();
    this.output.writeString(body);
    return start;
  }

  finalizeIncremental(
    updateManager: IncrementalUpdateManager,
    trailer: TrailerInfo
  ): number {
    this.updateManager = updateManager;
    if (this.objectStreamPool && this.objectStreamPool.size > 0) {
      this.flushObjectStreams(updateManager);
    }
    const useXrefStream = this.useXrefStream;
    const xrefStart = this.output.getPos();
    const entries = updateManager.buildXrefEntries();
    if (useXrefStream) {
      const xrefKey = updateManager.allocateObject();
      const streamEntry: TableXRefEntry = {
        objectNumber: xrefKey.objectNumber,
        generation: xrefKey.generationNumber,
        byteOffset: xrefStart,
        inUse: true,
        type: XRefEntryType.NORMAL,
      };
      const streamEntries = [...entries, streamEntry];
      const xrefStream = buildXRefStream(streamEntries, {
        trailer,
        size: updateManager.getUpdatedSize(),
        prev: trailer.startxref,
      });
      this.writer.writeIndirectObject(
        xrefKey.objectNumber,
        xrefStream,
        xrefKey.generationNumber
      );
      updateManager.registerOffset(xrefKey, xrefStart);
      this.writer.writeFooter(xrefStart);
      return xrefStart;
    }
    writeXrefTable(this.output, entries, {
      incremental: true,
    });
    const trailerDict = updateManager.buildTrailerDictionary();
    writeTrailer(this.output, trailerDict, xrefStart);
    return xrefStart;
  }

  toUint8Array(): Uint8Array {
    return this.output.toUint8Array();
  }

  getOutputStream(): COSStandardOutputStream {
    return this.output;
  }

  private isObjectStreamCandidate(
    objectNumber: number,
    generation: number,
    object: COSBase
  ): boolean {
    if (generation !== 0) {
      return false;
    }
    if (objectNumber < this.objectStreamMinObjectNumber) {
      return false;
    }
    if (object instanceof COSStream) {
      return false;
    }
    if (isSignatureDictionary(object)) {
      return false;
    }
    return true;
  }

  private flushObjectStreams(updateManager?: IncrementalUpdateManager): void {
    if (!this.objectStreamPool || this.objectStreamPool.size === 0 || !updateManager) {
      return;
    }
    const parentKey = updateManager.allocateObject();
    const { stream, placements } = this.objectStreamPool.flush(parentKey);
    const offset = this.writer.writeIndirectObject(
      parentKey.objectNumber,
      stream,
      parentKey.generationNumber
    );
    updateManager.registerOffset(parentKey, offset);
    placements.forEach((placement) => {
      updateManager.registerObjectStreamEntry(
        placement.key,
        parentKey,
        placement.index
      );
    });
  }
}

function isSignatureDictionary(object: COSBase): boolean {
  if (!(object instanceof COSDictionary)) {
    return false;
  }
  const type = object.getItem(COSName.TYPE);
  return type instanceof COSName && type.getName() === 'Sig';
}
