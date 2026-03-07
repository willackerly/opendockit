import { describe, it, expect } from 'vitest';

import { FullWriteContext } from '../writer/FullWriteContext';
import { COSDictionary, COSName } from '../cos/COSTypes';

const dummyTrailer = {
  size: 5,
  rootRef: { objectNumber: 1, generation: 0 },
  startxref: 0,
  dictionary: '<< /Size 5 /Root 1 0 R >>',
  hasXRefStream: false,
} as any;

describe('FullWriteContext', () => {
  it('allocates new object numbers beyond trailer size', () => {
    const ctx = new FullWriteContext(dummyTrailer);
    ctx.registerExistingObject(1);
    const key = ctx.allocateObject();
    expect(key.objectNumber).toBeGreaterThanOrEqual(5);
  });

  it('queues objects and flushes them via COSWriter', () => {
    const ctx = new FullWriteContext(dummyTrailer);
    const dict = new COSDictionary();
    dict.setItem(COSName.TYPE, new COSName('FullWriteTest'));
    const key = ctx.allocateObject();
    const queued = ctx.queueObject(key, dict);
    expect(queued).toBe(true);
    ctx.flushObjects();
    const output = new TextDecoder().decode(ctx.toUint8Array());
    expect(output).toContain(`${key.objectNumber} 0 obj`);
    expect(output).toContain('/Type /FullWriteTest');
    expect(ctx.getXrefEntries()).toHaveLength(1);
    expect(ctx.getXrefEntries()[0].objectNumber).toBe(key.objectNumber);
  });

  it('writes header/footer exactly once', () => {
    const ctx = new FullWriteContext(dummyTrailer);
    ctx.writeHeader('1.7');
    expect(() => ctx.writeHeader()).toThrow(/already written/i);
    ctx.writeFooter(123);
    const text = new TextDecoder().decode(ctx.toUint8Array());
    expect(text).toContain('%PDF-1.7');
    expect(text).toContain('startxref');
  });

  it('allows manual xref entry registration', () => {
    const ctx = new FullWriteContext(dummyTrailer);
    ctx.addXrefEntry({
      objectNumber: 2,
      generation: 0,
      byteOffset: 42,
      inUse: true,
      type: 1,
    } as any);
    expect(ctx.getXrefEntries()).toHaveLength(1);
  });
});
