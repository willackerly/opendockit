import { describe, it, expect } from 'vitest';

import { saveFullDocument } from '../writer/FullSaveWriter';
import { COSDictionary, COSName, COSStream } from '../cos/COSTypes';
import { COSObjectKey } from '../writer/COSObjectKey';
import { XRefEntryType } from '../writer/XRefEntries';

const baseTrailer = {
  size: 5,
  rootRef: { objectNumber: 1, generation: 0 },
  startxref: 0,
  dictionary: '<< /Size 5 /Root 1 0 R >>',
  hasXRefStream: false,
} as any;

describe('saveFullDocument', () => {
  it('writes header, objects, xref table, and trailer', () => {
    const dict = new COSDictionary();
    dict.setItem(COSName.TYPE, new COSName('Page'));
    const key = new COSObjectKey(2, 0);

    const result = saveFullDocument({
      trailer: baseTrailer,
      objects: [{ key, object: dict }],
    });

    const text = new TextDecoder().decode(result.bytes);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('2 0 obj');
    expect(text).toContain('xref');
    expect(text).toContain('trailer');
    expect(text).toContain('%%EOF');
    expect(result.startxref).toBeGreaterThan(0);
    expect(result.signatureInfo).toBeDefined();
  });

  it('writes xref stream when requested', () => {
    const dict = new COSDictionary();
    dict.setItem(COSName.TYPE, new COSName('Page'));
    const key = new COSObjectKey(2, 0);

    const result = saveFullDocument({
      trailer: { ...baseTrailer, hasXRefStream: true },
      objects: [{ key, object: dict }],
      useXrefStream: true,
    });

    const text = new TextDecoder().decode(result.bytes);
    expect(text).toContain('/Type /XRef');
    expect(result.startxref).toBeGreaterThan(0);
  });

  it('packs objects into /ObjStm when requested', () => {
    const dictA = new COSDictionary();
    dictA.setItem(COSName.TYPE, new COSName('Metadata'));
    const dictB = new COSDictionary();
    dictB.setItem(COSName.TYPE, new COSName('Metadata'));

    const keyA = new COSObjectKey(2, 0);
    const keyB = new COSObjectKey(3, 0);

    const result = saveFullDocument({
      trailer: baseTrailer,
      objects: [
        { key: keyA, object: dictA, packInObjectStream: true },
        { key: keyB, object: dictB, packInObjectStream: true },
      ],
    });

    const text = new TextDecoder().decode(result.bytes);
    expect(text).toContain('/Type /ObjStm');
    const entryA = result.xrefEntries.find((entry) => entry.objectNumber === keyA.objectNumber);
    const entryB = result.xrefEntries.find((entry) => entry.objectNumber === keyB.objectNumber);
    expect(entryA?.type).toBe(XRefEntryType.OBJECT_STREAM);
    expect(entryB?.type).toBe(XRefEntryType.OBJECT_STREAM);
  });

  it('auto packs eligible objects when opt-in flag is set', () => {
    const dictA = new COSDictionary();
    dictA.setItem(COSName.TYPE, new COSName('Metadata'));
    const streamObj = new COSStream();
    const dictB = new COSDictionary();
    dictB.setItem(COSName.TYPE, new COSName('PageLabel'));

    const keyA = new COSObjectKey(2, 0);
    const keyStream = new COSObjectKey(3, 0);
    const keyB = new COSObjectKey(4, 0);

    const result = saveFullDocument({
      trailer: baseTrailer,
      objects: [
        { key: keyA, object: dictA },
        { key: keyStream, object: streamObj },
        { key: keyB, object: dictB },
      ],
      autoPackObjectStreams: true,
    });

    const entryA = result.xrefEntries.find((entry) => entry.objectNumber === keyA.objectNumber);
    const entryB = result.xrefEntries.find((entry) => entry.objectNumber === keyB.objectNumber);
    const streamEntry = result.xrefEntries.find((entry) => entry.objectNumber === keyStream.objectNumber);

    expect(entryA?.type).toBe(XRefEntryType.OBJECT_STREAM);
    expect(entryB?.type).toBe(XRefEntryType.OBJECT_STREAM);
    expect(streamEntry).toBeDefined();
    expect(streamEntry?.type ?? XRefEntryType.NORMAL).toBe(XRefEntryType.NORMAL);
  });
});
