import { describe, it, expect } from 'vitest';

import { buildXRefStream } from '../writer/XRefStreamWriter';
import { XRefEntryType } from '../writer/XRefEntries';
import type { TableXRefEntry } from '../writer/XRefEntries';
import type { TrailerInfo } from '../parser/trailer';
import { COSInteger } from '../cos/COSTypes';

const trailerInfo: TrailerInfo = {
  size: 10,
  rootRef: { objectNumber: 1, generation: 0 },
  startxref: 0,
  dictionary: '',
  hasXRefStream: true,
};

describe('XRefStreamWriter', () => {
  it('builds a /Type /XRef stream with correct W entries', () => {
    const entries: TableXRefEntry[] = [
      {
        objectNumber: 0,
        generation: 65535,
        byteOffset: 0,
        inUse: false,
        type: XRefEntryType.FREE,
        nextFreeObject: 0,
      },
      {
        objectNumber: 5,
        generation: 0,
        byteOffset: 1234,
        inUse: true,
        type: XRefEntryType.NORMAL,
      },
    ];

    const stream = buildXRefStream(entries, {
      trailer: trailerInfo,
      size: 11,
      prev: 456,
    });

    const dict = stream.getDictionary();
    expect(dict.getCOSName('Type')?.getName()).toBe('XRef');
    expect(dict.getCOSName('Filter')?.getName()).toBe('FlateDecode');
    const w = dict.getCOSArray('W');
    expect(w?.size()).toBe(3);
    const widthValue = (w?.get(0) as COSInteger)?.getValue();
    expect(widthValue).toBeGreaterThan(0);

    const index = dict.getCOSArray('Index');
    expect(index?.size()).toBe(4);
    expect((index?.get(0) as COSInteger)?.getValue()).toBe(0);
    expect((index?.get(1) as COSInteger)?.getValue()).toBe(1);
    expect((index?.get(2) as COSInteger)?.getValue()).toBe(5);
    expect((index?.get(3) as COSInteger)?.getValue()).toBe(1);

    const data = stream.getData();
    expect(data.length).toBeGreaterThan(0);
  });
});
