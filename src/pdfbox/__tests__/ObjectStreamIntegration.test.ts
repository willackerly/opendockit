import { describe, it, expect } from 'vitest';

import { IncrementalUpdateManager } from '../writer/IncrementalUpdateManager';
import { IncrementalWriteContext } from '../writer/IncrementalWriteContext';
import { COSDictionary, COSName, COSInteger } from '../cos/COSTypes';
import type { TrailerInfo } from '../parser/trailer';
import { XRefEntryType } from '../writer/XRefEntries';

const trailerInfo: TrailerInfo = {
  size: 1,
  rootRef: { objectNumber: 1, generation: 0 },
  startxref: 0,
  dictionary: '',
  hasXRefStream: true,
};

describe('IncrementalWriteContext object stream integration', () => {
  it('enqueues eligible objects into ObjStm and emits type-2 xref entries', () => {
    const updateManager = new IncrementalUpdateManager(trailerInfo);
    const context = new IncrementalWriteContext(new Uint8Array(), {
      enableObjectStreams: true,
      objectStreamMinObjectNumber: trailerInfo.size,
    });

    const objectKey = updateManager.allocateObject();
    const dict = new COSDictionary();
    dict.setItem(new COSName('Test'), new COSInteger(7));

    const offset = context.writeIndirectObject(
      objectKey.objectNumber,
      dict,
      objectKey.generationNumber
    );
    expect(offset).toBe(-1);

    context.finalizeIncremental(updateManager, trailerInfo);

    const entries = updateManager.buildXrefEntries();
    const type2Entry = entries.find((entry) => entry.type === XRefEntryType.OBJECT_STREAM);
    expect(type2Entry).toBeDefined();
    expect(type2Entry?.objectStreamParent).toBeGreaterThan(0);
    expect(type2Entry?.objectStreamIndex).toBe(0);
  });

  it('writes xref stream when option is enabled', () => {
    const updateManager = new IncrementalUpdateManager({
      ...trailerInfo,
      hasXRefStream: true,
    });
    const context = new IncrementalWriteContext(new Uint8Array(), {
      useXrefStream: true,
    });
    context.enableIncrementalTracking(0);
    context.bindUpdateManager(updateManager);

    const objectKey = updateManager.allocateObject();
    const dict = new COSDictionary();
    dict.setItem(new COSName('Example'), new COSInteger(42));
    const offset = context.writeIndirectObject(
      objectKey.objectNumber,
      dict,
      objectKey.generationNumber
    );
    updateManager.registerOffset(objectKey, offset);

    const startxref = context.finalizeIncremental(updateManager, {
      ...trailerInfo,
      hasXRefStream: true,
    });

    const output = new TextDecoder().decode(context.toUint8Array());
    expect(output).toContain('/Type /XRef');
    expect(startxref).toBeGreaterThan(0);
  });
});
