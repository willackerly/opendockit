import { describe, it, expect } from 'vitest';

import { XRefBuilder } from '../writer/XRefBuilder';
import { COSObjectKey } from '../writer/COSObjectKey';
import { XRefEntryType } from '../writer/XRefEntries';

describe('XRefBuilder', () => {
  it('starts with the free object entry by default', () => {
    const builder = new XRefBuilder();
    const entries = builder.build();
    expect(entries[0]).toMatchObject({
      objectNumber: 0,
      generation: 65535,
      inUse: false,
      type: XRefEntryType.FREE,
    });
  });

  it('deduplicates entries by object key (latest wins)', () => {
    const builder = new XRefBuilder();
    const key = new COSObjectKey(5, 0);
    builder.addObject(key, 100);
    builder.addObject(key, 200);
    const entries = builder.build().filter((e) => e.objectNumber === 5);
    expect(entries).toHaveLength(1);
    expect(entries[0].byteOffset).toBe(200);
    expect(entries[0].type).toBe(XRefEntryType.NORMAL);
  });

  it('sorts entries by object number then generation', () => {
    const builder = new XRefBuilder(false);
    builder.addObject(new COSObjectKey(10, 0), 500);
    builder.addObject(new COSObjectKey(2, 0), 100);
    builder.addObject(new COSObjectKey(2, 1), 120);
    const entries = builder.build();
    expect(entries.map((e) => `${e.objectNumber}:${e.generation}`)).toEqual([
      '2:0',
      '2:1',
      '10:0',
    ]);
  });

  it('throws on negative byte offsets', () => {
    const builder = new XRefBuilder();
    expect(() =>
      builder.addObject(new COSObjectKey(3, 0), -10)
    ).toThrow(/offset cannot be negative/);
  });
});
