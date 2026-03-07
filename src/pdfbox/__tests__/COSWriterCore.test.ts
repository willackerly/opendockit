import { describe, it, expect } from 'vitest';

import { COSWriter } from '../writer/COSWriter';
import { COSStandardOutputStream } from '../writer/COSStandardOutputStream';
import { COSDictionary, COSName, COSString } from '../cos/COSTypes';
import { COSObjectKey } from '../writer/COSObjectKey';

describe('COSWriter core helpers', () => {
  it('writes PDF header and footer once', () => {
    const output = new COSStandardOutputStream();
    const writer = new COSWriter(output);
    writer.writeHeader('1.7');
    writer.writeFooter(42);
    const text = new TextDecoder().decode(output.toUint8Array());
    expect(text).toContain('%PDF-1.7');
    expect(text).toContain('startxref');
    expect(text).toContain('42');
    expect(text).toContain('%%EOF');
    expect(() => writer.writeHeader()).toThrow(/already written/i);
  });

  it('queues indirect objects and flushes them later', () => {
    const output = new COSStandardOutputStream();
    const writer = new COSWriter(output);
    const dict = new COSDictionary();
    dict.setItem(COSName.TYPE, new COSName('Example'));
    dict.setItem(new COSName('Key'), new COSString('Value'));
    const queued = writer.queueIndirectObject(5, dict, 0);
    expect(queued).toBe(true);
    writer.flushQueuedObjects();
    const text = new TextDecoder().decode(output.toUint8Array());
    expect(text).toContain('5 0 obj');
    expect(text).toContain('/Type /Example');
    expect(text).toContain('endobj');
  });

  it('tracks object keys and prevents conflicting assignments', () => {
    const output = new COSStandardOutputStream();
    const writer = new COSWriter(output);
    const dict = new COSDictionary();
    const key = new COSObjectKey(1, 0);
    writer.registerObjectKey(dict, key);
    expect(writer.getObjectKey(dict)).toEqual(key);
    expect(writer.getObjectByKey(key)).toBe(dict);
    expect(() => writer.registerObjectKey(dict, new COSObjectKey(2, 0))).toThrow(
      /conflicting object key/i
    );
  });
});
