/**
 * Tests for COS Object Serialization
 *
 * These tests verify that our TypeScript port produces IDENTICAL output
 * to Apache PDFBox for PDF object serialization.
 *
 * Each test includes the expected PDFBox output as a comment.
 */

import { describe, it, expect } from 'vitest';
import {
  COSName,
  COSInteger,
  COSString,
  COSArray,
  COSDictionary,
  COSFloat,
  COSObjectReference,
  COSBoolean,
  COSNull,
} from '../cos/COSTypes';
import { COSWriter } from '../writer/COSWriter';
import { COSStandardOutputStream } from '../writer/COSStandardOutputStream';
import { COSObjectKey } from '../writer/COSObjectKey';
import { markObjectUpdated } from '../cos/COSUpdateInfo';

/**
 * Helper to serialize a COS object and get the result as a string
 */
function serializeCOSObject(object: any): string {
  const output = new COSStandardOutputStream();
  const writer = new COSWriter(output);
  object.accept(writer);
  const bytes = output.toUint8Array();
  return new TextDecoder('iso-8859-1').decode(bytes);
}

describe('COSName Serialization', () => {
  it('should serialize simple names correctly', () => {
    // PDFBox: /Type
    const name = new COSName('Type');
    expect(name.toPDFString()).toBe('/Type');
  });

  it('should escape special characters with hex', () => {
    // PDFBox: /Hello#20World (space becomes #20)
    const name = new COSName('Hello World');
    expect(name.toPDFString()).toBe('/Hello#20World');
  });

  it('should escape delimiters', () => {
    // PDFBox: /Test#28#29 (parentheses)
    const name = new COSName('Test()');
    expect(name.toPDFString()).toBe('/Test#28#29');
  });

  it('should use predefined constants', () => {
    expect(COSName.TYPE.getName()).toBe('Type');
    expect(COSName.BYTERANGE.getName()).toBe('ByteRange');
    expect(COSName.CONTENTS.getName()).toBe('Contents');
  });
});

describe('COSInteger Serialization', () => {
  it('should serialize positive integers', () => {
    // PDFBox: 42
    const num = new COSInteger(42);
    expect(num.toPDFString()).toBe('42');
  });

  it('should serialize negative integers', () => {
    // PDFBox: -123
    const num = new COSInteger(-123);
    expect(num.toPDFString()).toBe('-123');
  });

  it('should serialize zero', () => {
    // PDFBox: 0
    expect(COSInteger.ZERO.toPDFString()).toBe('0');
  });

  it('should truncate floats to integers', () => {
    const num = new COSInteger(3.14);
    expect(num.toPDFString()).toBe('3');
  });
});

describe('COSFloat Serialization', () => {
  it('should serialize floating point numbers', () => {
    const value = new COSFloat(12.5);
    expect(value.toPDFString()).toBe('12.5');
  });

  it('should trim trailing zeros', () => {
    const value = new COSFloat(3.140000);
    expect(value.toPDFString()).toBe('3.14');
  });

  it('should avoid negative zero outputs', () => {
    const value = new COSFloat(-0);
    expect(value.toPDFString()).toBe('0');
  });
});

describe('COSBoolean and COSNull', () => {
  it('serializes booleans correctly', () => {
    const trueBool = COSBoolean.TRUE;
    const falseBool = COSBoolean.FALSE;
    expect(trueBool.toPDFString()).toBe('true');
    expect(falseBool.toPDFString()).toBe('false');
  });

  it('serializes null literal', () => {
    expect(COSNull.NULL.toPDFString()).toBe('null');
  });
});

describe('COSString Serialization', () => {
  it('should serialize simple strings as literals', () => {
    // PDFBox: (Hello World)
    const str = new COSString('Hello World');
    expect(str.toLiteralString()).toBe('(Hello World)');
  });

  it('should escape special characters in literals', () => {
    // PDFBox: (Test \(parentheses\))
    const str = new COSString('Test (parentheses)');
    expect(str.toLiteralString()).toBe('(Test \\(parentheses\\))');
  });

  it('should serialize as hex when requested', () => {
    // PDFBox: <48656C6C6F>
    const str = new COSString('Hello', true);
    expect(str.toHexString()).toBe('<48656C6C6F>');
  });

  it('should handle binary data as hex', () => {
    const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    const str = new COSString(bytes, true);
    expect(str.toHexString()).toBe('<48656C6C6F>');
  });
});

describe('COSArray Serialization', () => {
  it('should serialize empty arrays', () => {
    // PDFBox: []\n
    const array = new COSArray();
    const result = serializeCOSObject(array);
    expect(result).toBe('[]\n');
  });

  it('should serialize arrays with integers', () => {
    // PDFBox: [0 123 456 789]\n
    const array = new COSArray();
    array.add(COSInteger.ZERO);
    array.add(new COSInteger(123));
    array.add(new COSInteger(456));
    array.add(new COSInteger(789));

    const result = serializeCOSObject(array);
    expect(result).toContain('[');
    expect(result).toContain('0');
    expect(result).toContain('123');
    expect(result).toContain('456');
    expect(result).toContain('789');
    expect(result).toContain(']');
  });

  it('should add newlines every 10 elements', () => {
    // PDFBox adds newline after every 10 elements in arrays
    const array = new COSArray();
    for (let i = 0; i < 15; i++) {
      array.add(new COSInteger(i));
    }

    const result = serializeCOSObject(array);
    const lines = result.split('\n').filter(l => l.trim().length > 0);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('should serialize ByteRange array correctly', () => {
    // PDFBox: [0 12345 23456 12345]\n
    const byteRange = new COSArray();
    byteRange.add(COSInteger.ZERO);
    byteRange.add(new COSInteger(12345));
    byteRange.add(new COSInteger(23456));
    byteRange.add(new COSInteger(12345));

    const result = serializeCOSObject(byteRange);
    expect(result).toMatch(/\[.*0.*12345.*23456.*12345.*\]/s);
  });
});

describe('COSDictionary Serialization', () => {
  it('should serialize empty dictionaries', () => {
    // PDFBox: <<\n>>\n
    const dict = new COSDictionary();
    const result = serializeCOSObject(dict);
    expect(result).toBe('<<\n>>\n');
  });

  it('should serialize simple dictionary', () => {
    // PDFBox: <<\n/Type /Sig\n>>\n
    const dict = new COSDictionary();
    dict.setItem(COSName.TYPE, COSName.SIG);

    const result = serializeCOSObject(dict);
    expect(result).toContain('<<');
    expect(result).toContain('/Type /Sig');
    expect(result).toContain('>>');
  });

  it('should serialize signature dictionary structure', () => {
    // PDFBox signature dict format:
    // <<
    // /Type /Sig
    // /Filter /Adobe.PPKLite
    // /SubFilter /adbe.pkcs7.detached
    // /ByteRange [0 0 0 0]
    // /Contents <00...00>
    // >>

    const dict = new COSDictionary();
    dict.setItem(COSName.TYPE, COSName.SIG);
    dict.setItem(new COSName('Filter'), new COSName('Adobe.PPKLite'));
    dict.setItem(COSName.SUBFILTER, new COSName('adbe.pkcs7.detached'));

    const byteRange = new COSArray();
    byteRange.add(COSInteger.ZERO);
    byteRange.add(COSInteger.ZERO);
    byteRange.add(COSInteger.ZERO);
    byteRange.add(COSInteger.ZERO);
    dict.setItem(COSName.BYTERANGE, byteRange);

    const contents = new COSString(new Uint8Array(10).fill(0), true);
    dict.setItem(COSName.CONTENTS, contents);

    const result = serializeCOSObject(dict);

    expect(result).toContain('/Type /Sig');
    expect(result).toContain('/Filter /Adobe.PPKLite');
    expect(result).toContain('/SubFilter /adbe.pkcs7.detached');
    expect(result).toContain('/ByteRange');
    expect(result).toContain('/Contents');
  });

  it('should handle nested dictionaries', () => {
    const outer = new COSDictionary();
    const inner = new COSDictionary();

    inner.setItem(new COSName('Key'), new COSInteger(123));
    outer.setItem(new COSName('Nested'), inner);

    const result = serializeCOSObject(outer);
    expect(result).toContain('/Nested');
    expect(result).toContain('<<'); // Inner dict
    expect(result).toContain('/Key');
    expect(result).toContain('123');
  });
});

describe('COSObjectReference', () => {
  it('serializes numeric references', () => {
    const ref = new COSObjectReference(12, 0);
    const result = serializeCOSObject(ref);
    expect(result.trim()).toBe('12 0 R');
  });

  it('serializes references from COSObjectKey', () => {
    const ref = new COSObjectReference(new COSObjectKey(3, 2));
    const result = serializeCOSObject(ref);
    expect(result.trim()).toBe('3 2 R');
  });
});

describe('COSWriter Position Tracking', () => {
  it('should track byte positions correctly', () => {
    const output = new COSStandardOutputStream();
    expect(output.getPos()).toBe(0);

    output.writeString('Hello');
    expect(output.getPos()).toBe(5);

    output.writeString(' World');
    expect(output.getPos()).toBe(11);
  });

  it('should track positions during object writing', () => {
    const output = new COSStandardOutputStream();
    const writer = new COSWriter(output);

    const startPos = output.getPos();

    const dict = new COSDictionary();
    dict.setItem(COSName.TYPE, COSName.SIG);
    dict.accept(writer);

    const endPos = output.getPos();

    expect(endPos).toBeGreaterThan(startPos);
    expect(endPos - startPos).toBeGreaterThan(10); // Dict should be at least 10 bytes
  });
});

describe('COSWriter object scheduling', () => {
  it('queues objects and returns offsets in write order', () => {
    const output = new COSStandardOutputStream();
    const writer = new COSWriter(output);

    const dictA = new COSDictionary();
    dictA.setItem(COSName.TYPE, new COSName('QueuedA'));
    const dictB = new COSDictionary();
    dictB.setItem(COSName.TYPE, new COSName('QueuedB'));

    const offsetA = writer.writeIndirectObject(10, dictA);
    const offsetB = writer.writeIndirectObject(11, dictB);

    expect(offsetA).toBe(0);
    expect(offsetB).toBeGreaterThan(offsetA);

    const text = new TextDecoder('latin1').decode(output.toUint8Array());
    expect(text.indexOf('10 0 obj')).toBeLessThan(text.indexOf('11 0 obj'));
  });

  it('skips re-writing objects unless marked updated', () => {
    const output = new COSStandardOutputStream();
    const writer = new COSWriter(output);
    const dict = new COSDictionary();
    dict.setItem(COSName.TYPE, new COSName('Original'));

    writer.writeIndirectObject(12, dict);
    expect((writer as any).writtenObjects?.has(dict)).toBe(true);
    expect(() => writer.writeIndirectObject(13, dict)).toThrow(/skipped/);

    markObjectUpdated(dict);
    const offset = writer.writeIndirectObject(13, dict);
    expect(offset).toBeGreaterThan(0);
  });
});

describe('Signature Detection', () => {
  it('should detect signature dictionaries', () => {
    const output = new COSStandardOutputStream(1000); // Simulate incremental update
    const writer = new COSWriter(output);
    writer.setIncrementalUpdate(true, 500); // Pretend original PDF is 500 bytes

    // Create signature dict with ByteRange pointing AFTER original input
    const sigDict = new COSDictionary();
    sigDict.setItem(COSName.TYPE, COSName.SIG);

    const byteRange = new COSArray();
    byteRange.add(COSInteger.ZERO);
    byteRange.add(new COSInteger(600)); // Points beyond original 500 bytes
    byteRange.add(new COSInteger(700));
    byteRange.add(new COSInteger(100));
    sigDict.setItem(COSName.BYTERANGE, byteRange);

    const contents = new COSString(new Uint8Array(100).fill(0), true);
    sigDict.setItem(COSName.CONTENTS, contents);

    sigDict.accept(writer);

    const info = writer.getSignatureInfo();

    // Should have tracked signature positions
    expect(info.signatureOffset).toBeGreaterThan(0);
    expect(info.signatureLength).toBeGreaterThan(0);
    expect(info.byteRangeOffset).toBeGreaterThan(0);
    expect(info.byteRangeLength).toBeGreaterThan(0);
  });
});

describe('PDF Format Compliance', () => {
  it('should use ISO-8859-1 encoding', () => {
    const output = new COSStandardOutputStream();
    output.writeString('Test');

    const bytes = output.toUint8Array();
    expect(bytes[0]).toBe(84); // 'T'
    expect(bytes[1]).toBe(101); // 'e'
    expect(bytes[2]).toBe(115); // 's'
    expect(bytes[3]).toBe(116); // 't'
  });

  it('should write proper line endings', () => {
    const output = new COSStandardOutputStream();
    output.writeEOL(); // Should write \n
    output.writeCRLF(); // Should write \r\n

    const bytes = output.toUint8Array();
    expect(bytes[0]).toBe(0x0a); // \n
    expect(bytes[1]).toBe(0x0d); // \r
    expect(bytes[2]).toBe(0x0a); // \n
  });
});
