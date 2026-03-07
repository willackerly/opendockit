import { describe, it, expect } from 'vitest';

import { COSWriterObjectStream } from '../writer/COSWriterObjectStream';
import { ObjectStreamBuilder } from '../writer/ObjectStreamBuilder';
import { COSObjectKey } from '../writer/COSObjectKey';
import { COSDictionary, COSName, COSInteger } from '../cos/COSTypes';
import { inflate } from 'pako';

describe('COSWriterObjectStream', () => {
  it('serializes prepared objects into a single stream', () => {
    const objectStream = new COSWriterObjectStream();

    const dict = new COSDictionary();
    dict.setItem(COSName.TYPE, new COSName('TestDict'));
    dict.setItem(new COSName('Value'), new COSInteger(42));

    objectStream.prepareObject(new COSObjectKey(15, 0), dict);
    objectStream.prepareObject(new COSObjectKey(16, 0), new COSInteger(7));

    const stream = objectStream.buildStream();
    const first = stream.getDictionary().getItem('First') as COSInteger;
    const n = stream.getDictionary().getItem('N') as COSInteger;

    expect(n.getValue()).toBe(2);
    expect(first.getValue()).toBeGreaterThan(0);

    const body = stream.getData();
    const inflated = inflate(body);
    const header = new TextDecoder('latin1').decode(inflated.slice(0, first.getValue()));
    const headerParts = header.trim().split(/\s+/);
    expect(headerParts.slice(0, 3)).toEqual(['15', '0', '16']);
    expect(Number(headerParts[3])).toBeGreaterThan(0);

    const bodyString = new TextDecoder('latin1').decode(inflated);
    expect(bodyString).toContain('/Type /TestDict');
    expect(bodyString).toContain('7');
  });
});

describe('ObjectStreamBuilder', () => {
  it('tracks object placements when flushing stream', () => {
    const builder = new ObjectStreamBuilder(3);
    const dict = new COSDictionary();
    dict.setItem(COSName.TYPE, new COSName('Obj'));

    builder.addObject(new COSObjectKey(5, 0), dict);
    builder.addObject(new COSObjectKey(6, 0), new COSInteger(99));

    const { stream, placements } = builder.flush(new COSObjectKey(100, 0));
    expect(placements.map((p) => ({ key: `${p.key.objectNumber}:${p.key.generationNumber}`, index: p.index }))).toEqual([
      { key: '5:0', index: 0 },
      { key: '6:0', index: 1 },
    ]);
    expect(stream.getDictionary().getInt('N')).toBe(2);
    expect(stream.getDictionary().getCOSName('Filter')?.getName()).toBe('FlateDecode');
  });
});
