/**
 * IncrementalWriter - Appends modified objects to the end of an existing PDF.
 *
 * Per PDF spec ISO 32000-1:2008 Section 7.5.6, an incremental update consists of:
 * 1. The original PDF bytes (untouched)
 * 2. New/modified indirect objects
 * 3. A new cross-reference section referencing updated objects
 * 4. A new trailer with /Prev pointing to previous xref offset
 *
 * This preserves digital signatures and avoids re-rendering the entire document.
 */

import type { COSBase } from '../pdfbox/cos/COSBase';
import { COSWriter } from '../pdfbox/writer/COSWriter';
import { COSStandardOutputStream } from '../pdfbox/writer/COSStandardOutputStream';
import { XRefBuilder } from '../pdfbox/writer/XRefBuilder';
import { COSObjectKey } from '../pdfbox/writer/COSObjectKey';
import { writeXrefTable, writeTrailer } from '../pdfbox/writer/XRefWriter';
import { parsePdfTrailer, buildIncrementalTrailerDictionary } from '../pdfbox/parser/trailer';
import type { TrailerInfo } from '../pdfbox/parser/trailer';
import type { ChangeTracker } from './change-tracker';

export class IncrementalWriter {
  private readonly _originalBytes: Uint8Array;
  private readonly _modifiedObjects = new Map<string, { objectNumber: number; generation: number; object: COSBase }>();
  private readonly _prevXrefOffset: number;
  private readonly _trailer: TrailerInfo;

  constructor(originalBytes: Uint8Array) {
    this._originalBytes = originalBytes;
    this._trailer = parsePdfTrailer(originalBytes);
    this._prevXrefOffset = this._trailer.startxref;
  }

  /**
   * The parsed trailer info from the original PDF.
   */
  get trailer(): TrailerInfo {
    return this._trailer;
  }

  /**
   * The startxref offset from the original PDF (used as /Prev in the new trailer).
   */
  get prevXrefOffset(): number {
    return this._prevXrefOffset;
  }

  /**
   * Mark an object as modified. It will be included in the incremental update.
   */
  markModified(objectNumber: number, generation: number, object: COSBase): void {
    const key = `${objectNumber}-${generation}`;
    this._modifiedObjects.set(key, { objectNumber, generation, object });
  }

  /**
   * Import all tracked modifications from a ChangeTracker plus a resolver function
   * that maps object number/generation to the actual COSBase object.
   */
  importFromTracker(
    tracker: ChangeTracker,
    resolver: (objectNumber: number, generation: number) => COSBase | undefined
  ): void {
    for (const { objectNumber, generation } of tracker.getModifiedObjects()) {
      const object = resolver(objectNumber, generation);
      if (object) {
        this.markModified(objectNumber, generation, object);
      }
    }
  }

  /**
   * Number of objects marked for inclusion in the incremental update.
   */
  get modifiedCount(): number {
    return this._modifiedObjects.size;
  }

  /**
   * Write the incremental update. Returns the complete PDF (original + appended update).
   *
   * If no objects have been modified, returns a copy of the original bytes.
   */
  write(): Uint8Array {
    if (this._modifiedObjects.size === 0) {
      // No changes — return original bytes unchanged
      return new Uint8Array(this._originalBytes);
    }

    const output = new COSStandardOutputStream();
    const writer = new COSWriter(output);

    // 1. Copy original bytes
    output.write(this._originalBytes);

    // Add separator between original content and incremental update
    // (matches PDFBox behavior — always \r\n before incremental objects)
    output.writeString('\r\n');

    // 2. Write modified objects and record their offsets
    const xrefBuilder = new XRefBuilder(true); // includes free entry for obj 0
    let maxObjectNumber = this._trailer.size - 1;

    for (const { objectNumber, generation, object } of this._modifiedObjects.values()) {
      const offset = writer.writeIndirectObject(objectNumber, object, generation);
      const key = new COSObjectKey(objectNumber, generation);
      xrefBuilder.addObject(key, offset);

      if (objectNumber > maxObjectNumber) {
        maxObjectNumber = objectNumber;
      }
    }

    // 3. Write xref table for modified objects only
    const xrefStart = output.getPos();
    const entries = xrefBuilder.build();
    writeXrefTable(output, entries, { incremental: true });

    // 4. Write new trailer with /Prev pointing to old xref offset
    const newSize = maxObjectNumber + 1;
    const trailerDict = buildIncrementalTrailerDictionary(this._trailer, {
      size: Math.max(newSize, this._trailer.size),
      prev: this._prevXrefOffset,
    });
    writeTrailer(output, trailerDict, xrefStart);

    return output.toUint8Array();
  }
}
