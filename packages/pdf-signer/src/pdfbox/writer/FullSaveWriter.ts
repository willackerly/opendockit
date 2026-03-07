import type { COSBase } from '../cos/COSBase';
import { COSArray, COSDictionary, COSName, COSStream } from '../cos/COSTypes';
import { COSObjectKey } from './COSObjectKey';
import type { TrailerInfo } from '../parser/trailer';
import { buildFullTrailerDictionary } from '../parser/trailer';
import { writeXrefTable, writeTrailer } from './XRefWriter';
import type { TableXRefEntry } from './XRefEntries';
import { XRefEntryType } from './XRefEntries';
import { FullWriteContext } from './FullWriteContext';
import { buildXRefStream } from './XRefStreamWriter';
import { ObjectStreamBuilder } from './ObjectStreamBuilder';

const TRACE_FULL_SAVE =
  typeof process !== 'undefined' &&
  !!(process as any)?.env?.PDFBOX_TS_TRACE &&
  (process as any).env.PDFBOX_TS_TRACE !== '0';

const writerTrace = (...args: unknown[]) => {
  if (TRACE_FULL_SAVE) {
    console.log('[TS TRACE]', ...args);
  }
};

export interface FullSaveObject {
  key: COSObjectKey;
  object?: COSBase;
  raw?: Uint8Array | string;
  packInObjectStream?: boolean;
}

export interface FullSaveOptions {
  trailer: TrailerInfo;
  objects: FullSaveObject[];
  version?: string;
  useXrefStream?: boolean;
  autoPackObjectStreams?: boolean;
  objectStreamMinNumber?: number;
  existingObjectStreamEntries?: TableXRefEntry[];
}

export interface FullSaveResult {
  bytes: Uint8Array;
  xrefEntries: TableXRefEntry[];
  startxref: number;
  signatureInfo: SignatureTrackingInfo;
}

export interface SignatureTrackingInfo {
  signatureOffset: number;
  signatureLength: number;
  byteRangeOffset: number;
  byteRangeLength: number;
  byteRangeArray: COSArray | null;
}

/**
 * Minimal full-document save path mirroring PDFBox's PDDocument.save flow.
 * Callers provide the COS objects to write; this helper emits header +
 * objects + xref table + trailer + EOF.
 */
export function saveFullDocument(options: FullSaveOptions): FullSaveResult {
  const { trailer, objects, version } = options;
  const autoPack = options.autoPackObjectStreams ?? false;
  const useXrefStream = options.useXrefStream ?? (autoPack || trailer.hasXRefStream);
  const objectStreamMinNumber = options.objectStreamMinNumber ?? 1;
  const ctx = new FullWriteContext(trailer);
  const packableEntries: Array<{ key: COSObjectKey; object: COSBase }> = [];
  const normalEntries: Array<{ key: COSObjectKey; object: COSBase }> = [];
  const rawEntries: Array<{ key: COSObjectKey; raw: Uint8Array | string }> = [];
  ctx.writer.setIncrementalUpdate(true, 0);
  writerTrace('FullSaveWriter:start', {
    trailerSize: trailer.size,
    objectCount: objects.length,
    useXrefStream,
    autoPack,
  });
  ctx.writeHeader(version ?? trailer.version ?? '1.7');

  for (const { key, object, raw, packInObjectStream } of objects) {
    ctx.registerExistingObject(key.objectNumber, key.generationNumber);
    if (raw) {
      rawEntries.push({ key, raw });
      continue;
    }
    if (!object) {
      throw new Error(
        `FullSaveObject for ${key.objectNumber} ${key.generationNumber} R is missing payload`
      );
    }
    const shouldPack =
      packInObjectStream ??
      (autoPack &&
        key.generationNumber === 0 &&
        key.objectNumber >= objectStreamMinNumber &&
        canPackObject(object) &&
        !isSignatureDictionary(object));
    (shouldPack ? packableEntries : normalEntries).push({ key, object });
  }
  // Write normal objects in object-number order (stable) to mirror PDFBox sorting.
  const sortedNormal = [...normalEntries].sort((a, b) => {
    if (a.key.objectNumber === b.key.objectNumber) {
      return a.key.generationNumber - b.key.generationNumber;
    }
    return a.key.objectNumber - b.key.objectNumber;
  });
  for (const { key, object } of sortedNormal) {
    ctx.queueObject(key, object);
  }
  ctx.flushObjects();

  // Write raw objects last, sorted by object number, to mirror Java’s traversal for untouched entries.
  const sortedRaw = [...rawEntries].sort((a, b) => {
    if (a.key.objectNumber === b.key.objectNumber) {
      return a.key.generationNumber - b.key.generationNumber;
    }
    return a.key.objectNumber - b.key.objectNumber;
  });
  for (const { key, raw } of sortedRaw) {
    ctx.writeRawObject(key, raw);
    writerTrace('FullSaveWriter:writeRaw', `${key.objectNumber} ${key.generationNumber} R`);
  }

  // Write packed objects in object-number order so indexes match Java (after top-level objects).
  if (packableEntries.length > 0) {
    writerTrace('FullSaveWriter:packableCount', packableEntries.length);
    const builder = new ObjectStreamBuilder();
    const sortedPackable = [...packableEntries].sort((a, b) => {
      if (a.key.objectNumber === b.key.objectNumber) {
        return a.key.generationNumber - b.key.generationNumber;
      }
      return a.key.objectNumber - b.key.objectNumber;
    });
    for (const entry of sortedPackable) {
      builder.addObject(entry.key, entry.object);
      if (builder.isFull()) {
        flushObjectStream(ctx, builder);
      }
    }
    flushObjectStream(ctx, builder);
  }

  if (options.existingObjectStreamEntries?.length) {
    for (const entry of options.existingObjectStreamEntries) {
      ctx.registerExistingObject(entry.objectNumber, entry.generation);
      ctx.addXrefEntry(entry);
    }
  }
  writerTrace('FullSaveWriter:objectsFlushed', ctx.getXrefEntries().length);

  const output = ctx.getOutputStream();
  let startxref: number;

  if (useXrefStream) {
    const baseEntries = ctx.getXrefEntries();
    const xrefOffset = ctx.getCurrentOffset();
    const xrefKey = ctx.allocateObject();
    const prevValue = Number.isFinite(trailer.prev ?? NaN)
      ? (trailer.prev as number)
      : Number.NaN;
    // The xref stream must include its own entry (PDF spec 7.5.8):
    // "The cross-reference stream shall contain an entry for itself."
    const xrefSelfEntry: TableXRefEntry = {
      objectNumber: xrefKey.objectNumber,
      generation: xrefKey.generationNumber,
      byteOffset: xrefOffset,
      inUse: true,
      type: XRefEntryType.NORMAL,
    };
    const entriesForStream = [...baseEntries, xrefSelfEntry];
    const maxObjectNumber =
      entriesForStream.length > 0
        ? Math.max(
            Math.max(...entriesForStream.map((entry) => entry.objectNumber)),
            xrefKey.objectNumber
          )
        : xrefKey.objectNumber;
    const size = Math.max(trailer.size, maxObjectNumber + 1);
    const xrefStream = buildXRefStream(entriesForStream, {
      trailer,
      size,
      prev: prevValue,
    });
    ctx.writer.writeIndirectObject(
      xrefKey.objectNumber,
      xrefStream,
      xrefKey.generationNumber
    );
    startxref = xrefOffset;
    ctx.writeFooter(startxref);
  } else {
    const xrefEntries = ctx.getXrefEntries();
    const maxObjectNumber =
      xrefEntries.length > 0
        ? Math.max(...xrefEntries.map((entry) => entry.objectNumber))
        : trailer.size - 1;
    const size = Math.max(trailer.size, maxObjectNumber + 1);
    const xrefStart = ctx.getCurrentOffset();
    writeXrefTable(output, xrefEntries, { incremental: false });

    const trailerDict = buildFullTrailerDictionary(trailer, size);
    writeTrailer(output, trailerDict, xrefStart);
    startxref = xrefStart;
  }

  const result = {
    bytes: ctx.toUint8Array(),
    xrefEntries: ctx.getXrefEntries(),
    startxref,
    signatureInfo: ctx.writer.getSignatureInfo(),
  };
  writerTrace('FullSaveWriter:complete', { startxref: result.startxref });
  return result;
}

function flushObjectStream(ctx: FullWriteContext, builder: ObjectStreamBuilder): void {
  if (builder.size === 0) {
    return;
  }
  ctx.flushObjects();
  const parentKey = ctx.allocateObject();
  const { stream, placements } = builder.flush(parentKey);
  const offset = ctx.writer.writeIndirectObject(
    parentKey.objectNumber,
    stream,
    parentKey.generationNumber
  );
  ctx.addXrefEntry({
    objectNumber: parentKey.objectNumber,
    generation: parentKey.generationNumber,
    byteOffset: offset,
    inUse: true,
    type: XRefEntryType.NORMAL,
  });
  for (const placement of placements) {
    ctx.addXrefEntry({
      objectNumber: placement.key.objectNumber,
      generation: placement.key.generationNumber,
      byteOffset: 0,
      inUse: true,
      type: XRefEntryType.OBJECT_STREAM,
      objectStreamParent: parentKey.objectNumber,
      objectStreamIndex: placement.index,
    });
  }
  writerTrace('FullSaveWriter:flushedObjectStream', {
    parentObject: `${parentKey.objectNumber} ${parentKey.generationNumber}`,
    placements: placements.length,
  });
}

function canPackObject(object: COSBase): boolean {
  return !(object instanceof COSStream);
}

function isSignatureDictionary(object: COSBase): boolean {
  if (object instanceof COSDictionary) {
    const type = object.getItem(COSName.TYPE);
    return type instanceof COSName && type.getName() === 'Sig';
  }
  return false;
}
