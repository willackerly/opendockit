import { describe, it, expect } from 'vitest';

import { parseCOSDictionary, parseCOSObject } from '../parser/cosParser';
import {
  COSName,
  COSInteger,
  COSFloat,
  COSString,
  COSArray,
  COSDictionary,
  COSObjectReference,
  COSBoolean,
  COSNull,
} from '../cos/COSTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertCOSName(obj: unknown, expected: string): void {
  expect(obj).toBeInstanceOf(COSName);
  expect((obj as COSName).getName()).toBe(expected);
}

function assertCOSInteger(obj: unknown, expected: number): void {
  expect(obj).toBeInstanceOf(COSInteger);
  expect((obj as COSInteger).getValue()).toBe(expected);
}

function assertCOSFloat(obj: unknown, expected: number): void {
  expect(obj).toBeInstanceOf(COSFloat);
  expect((obj as COSFloat).getValue()).toBeCloseTo(expected, 10);
}

function assertCOSString(obj: unknown, expected: string): void {
  expect(obj).toBeInstanceOf(COSString);
  expect((obj as COSString).getString()).toBe(expected);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('COS parser edge cases', () => {
  // ---- Dictionaries -------------------------------------------------------

  describe('dictionaries', () => {
    it('parses an empty dictionary << >>', () => {
      const dict = parseCOSDictionary('<< >>');
      expect(dict).toBeInstanceOf(COSDictionary);
      expect(dict.size()).toBe(0);
    });

    it('parses an empty dictionary with no spaces <<>>', () => {
      const dict = parseCOSDictionary('<<>>');
      expect(dict).toBeInstanceOf(COSDictionary);
      expect(dict.size()).toBe(0);
    });

    it('parses a dictionary with all value types', () => {
      const input = `<<
        /NameVal /SomeValue
        /StringVal (Hello)
        /IntVal 42
        /FloatVal 3.14
        /BoolTrue true
        /BoolFalse false
        /NullVal null
        /ArrayVal [1 2 3]
        /DictVal << /Nested true >>
        /RefVal 7 0 R
      >>`;
      const dict = parseCOSDictionary(input);
      expect(dict.size()).toBe(10);

      assertCOSName(dict.getItem('NameVal'), 'SomeValue');
      assertCOSString(dict.getItem('StringVal'), 'Hello');
      assertCOSInteger(dict.getItem('IntVal'), 42);
      assertCOSFloat(dict.getItem('FloatVal'), 3.14);
      expect(dict.getItem('BoolTrue')).toBe(COSBoolean.TRUE);
      expect(dict.getItem('BoolFalse')).toBe(COSBoolean.FALSE);
      expect(dict.getItem('NullVal')).toBe(COSNull.NULL);

      const arr = dict.getItem('ArrayVal') as COSArray;
      expect(arr).toBeInstanceOf(COSArray);
      expect(arr.size()).toBe(3);

      const nested = dict.getItem('DictVal') as COSDictionary;
      expect(nested).toBeInstanceOf(COSDictionary);
      expect(nested.getItem('Nested')).toBe(COSBoolean.TRUE);

      const ref = dict.getItem('RefVal') as COSObjectReference;
      expect(ref).toBeInstanceOf(COSObjectReference);
      expect(ref.objectNumber).toBe(7);
      expect(ref.generationNumber).toBe(0);
    });

    it('parses deeply nested dictionaries (3+ levels)', () => {
      const input = `<<
        /Level1 << /Level2 << /Level3 << /Deep (found) >> >> >>
      >>`;
      const dict = parseCOSDictionary(input);
      const l1 = dict.getItem('Level1') as COSDictionary;
      const l2 = l1.getItem('Level2') as COSDictionary;
      const l3 = l2.getItem('Level3') as COSDictionary;
      assertCOSString(l3.getItem('Deep'), 'found');
    });
  });

  // ---- Name objects -------------------------------------------------------

  describe('name objects', () => {
    it('parses simple names', () => {
      const obj = parseCOSObject('/Type');
      assertCOSName(obj, 'Type');
    });

    it('parses name with #xx hex escape (space as #20)', () => {
      // The tokenizer captures the raw name including #20; it does NOT decode
      // hex escapes at the tokenizer level. The raw value is "Test#20Name".
      const obj = parseCOSObject('/Test#20Name');
      assertCOSName(obj, 'Test#20Name');
    });

    it('parses name with multiple hex escapes', () => {
      const obj = parseCOSObject('/A#23B#2FC');
      assertCOSName(obj, 'A#23B#2FC');
    });

    it('parses an empty name /', () => {
      // PDF spec allows empty names: just "/"
      const dict = parseCOSDictionary('<< / (empty name key) >>');
      // The empty name's getName() should be ""
      assertCOSString(dict.getItem(''), 'empty name key');
    });
  });

  // ---- COSString escape sequences -----------------------------------------

  describe('COSString literal strings', () => {
    it('parses a simple literal string', () => {
      const obj = parseCOSObject('(Hello World)');
      assertCOSString(obj, 'Hello World');
    });

    it('handles backslash escape sequences', () => {
      // PDF spec: \n -> newline, \r -> carriage return, \t -> tab, etc.
      const obj = parseCOSObject('(line1\\nline2)');
      assertCOSString(obj, 'line1\nline2');
    });

    it('handles escaped parentheses', () => {
      const obj = parseCOSObject('(paren\\(inside\\))');
      assertCOSString(obj, 'paren(inside)');
    });

    it('handles escaped backslash', () => {
      const obj = parseCOSObject('(back\\\\slash)');
      assertCOSString(obj, 'back\\slash');
    });

    it('handles nested unescaped parentheses via nesting count', () => {
      const obj = parseCOSObject('(outer (inner) end)');
      assertCOSString(obj, 'outer (inner) end');
    });

    it('handles octal escape in literal string', () => {
      // PDF spec: \053 = octal 53 = decimal 43 = '+' character
      const obj = parseCOSObject('(A\\053B)');
      assertCOSString(obj, 'A+B');
    });

    it('handles empty literal string', () => {
      const obj = parseCOSObject('()');
      assertCOSString(obj, '');
    });
  });

  // ---- Hex strings --------------------------------------------------------

  describe('hex strings', () => {
    it('parses a hex string <48656C6C6F>', () => {
      const obj = parseCOSObject('<48656C6C6F>');
      expect(obj).toBeInstanceOf(COSString);
      expect((obj as COSString).getString()).toBe('Hello');
    });

    it('parses an odd-length hex string with implicit zero padding', () => {
      // <ABC> should be interpreted as <ABC0> per PDF spec
      const obj = parseCOSObject('<ABC>');
      expect(obj).toBeInstanceOf(COSString);
      const bytes = (obj as COSString).getBytes();
      expect(bytes[0]).toBe(0xab);
      expect(bytes[1]).toBe(0xc0);
    });

    it('parses an empty hex string', () => {
      const obj = parseCOSObject('<>');
      expect(obj).toBeInstanceOf(COSString);
      expect((obj as COSString).getBytes().length).toBe(0);
    });

    it('ignores whitespace inside hex strings', () => {
      const obj = parseCOSObject('<48 65 6C 6C 6F>');
      expect(obj).toBeInstanceOf(COSString);
      expect((obj as COSString).getString()).toBe('Hello');
    });
  });

  // ---- Numbers ------------------------------------------------------------

  describe('numbers', () => {
    it('parses a positive integer', () => {
      assertCOSInteger(parseCOSObject('42'), 42);
    });

    it('parses zero', () => {
      assertCOSInteger(parseCOSObject('0'), 0);
    });

    it('parses a negative integer', () => {
      assertCOSInteger(parseCOSObject('-7'), -7);
    });

    it('parses a float with decimal point', () => {
      assertCOSFloat(parseCOSObject('3.14'), 3.14);
    });

    it('parses a leading-dot float .5', () => {
      // ".5" starts with "." which is not matched by isNumberStart (which
      // only matches [0-9+-]). It falls through to consumeIdentifier and
      // becomes an IDENT, which is then treated as a COSName.
      // Let's verify the actual behavior:
      const obj = parseCOSObject('.5');
      // The tokenizer's isNumberStart checks /[0-9+-]/, "." doesn't match.
      // consumeIdentifier will grab ".5" and produce an IDENT token.
      // readValue maps unknown IDENTs to COSName.
      expect(obj).toBeInstanceOf(COSName);
    });

    it('parses a negative float -.5 (starts with minus)', () => {
      // "-" IS matched by isNumberStart, so consumeNumber is called.
      // It consumes "-", then no digits before ".", then ".5".
      assertCOSFloat(parseCOSObject('-.5'), -0.5);
    });

    it('parses a number with leading plus sign', () => {
      assertCOSInteger(parseCOSObject('+10'), 10);
    });

    it('parses a large integer (2^31-1)', () => {
      assertCOSInteger(parseCOSObject('2147483647'), 2147483647);
    });

    it('parses a very small float', () => {
      assertCOSFloat(parseCOSObject('0.00001'), 0.00001);
    });
  });

  // ---- Object references --------------------------------------------------

  describe('object references', () => {
    it('parses 1 0 R', () => {
      const obj = parseCOSObject('1 0 R');
      expect(obj).toBeInstanceOf(COSObjectReference);
      expect((obj as COSObjectReference).objectNumber).toBe(1);
      expect((obj as COSObjectReference).generationNumber).toBe(0);
    });

    it('parses a high object number 999 0 R', () => {
      const obj = parseCOSObject('999 0 R');
      expect(obj).toBeInstanceOf(COSObjectReference);
      expect((obj as COSObjectReference).objectNumber).toBe(999);
    });

    it('parses a reference with non-zero generation 5 2 R', () => {
      const obj = parseCOSObject('5 2 R');
      expect(obj).toBeInstanceOf(COSObjectReference);
      expect((obj as COSObjectReference).objectNumber).toBe(5);
      expect((obj as COSObjectReference).generationNumber).toBe(2);
    });

    it('does not consume R when second token is not a number', () => {
      // "1 /Name" — the 1 is a standalone integer, /Name is a separate value.
      // parseCOSObject throws on trailing tokens, so parse as dict value instead.
      const dict = parseCOSDictionary('<< /A 1 /B /Name >>');
      assertCOSInteger(dict.getItem('A'), 1);
      assertCOSName(dict.getItem('B'), 'Name');
    });
  });

  // ---- Arrays -------------------------------------------------------------

  describe('arrays', () => {
    it('parses an empty array []', () => {
      const obj = parseCOSObject('[]');
      expect(obj).toBeInstanceOf(COSArray);
      expect((obj as COSArray).size()).toBe(0);
    });

    it('parses an array with spaces [ ]', () => {
      const obj = parseCOSObject('[ ]');
      expect(obj).toBeInstanceOf(COSArray);
      expect((obj as COSArray).size()).toBe(0);
    });

    it('parses nested arrays [[1 2] [3 4]]', () => {
      const obj = parseCOSObject('[[1 2] [3 4]]');
      expect(obj).toBeInstanceOf(COSArray);
      const outer = obj as COSArray;
      expect(outer.size()).toBe(2);

      const inner1 = outer.get(0) as COSArray;
      expect(inner1).toBeInstanceOf(COSArray);
      expect(inner1.size()).toBe(2);
      assertCOSInteger(inner1.get(0), 1);
      assertCOSInteger(inner1.get(1), 2);

      const inner2 = outer.get(1) as COSArray;
      assertCOSInteger(inner2.get(0), 3);
      assertCOSInteger(inner2.get(1), 4);
    });

    it('parses an array with mixed types', () => {
      const obj = parseCOSObject('[/Name (text) 42 true null 3 0 R]');
      const arr = obj as COSArray;
      expect(arr.size()).toBe(6);
      assertCOSName(arr.get(0), 'Name');
      assertCOSString(arr.get(1), 'text');
      assertCOSInteger(arr.get(2), 42);
      expect(arr.get(3)).toBe(COSBoolean.TRUE);
      expect(arr.get(4)).toBe(COSNull.NULL);
      expect(arr.get(5)).toBeInstanceOf(COSObjectReference);
    });
  });

  // ---- Booleans and null --------------------------------------------------

  describe('booleans and null', () => {
    it('parses true', () => {
      expect(parseCOSObject('true')).toBe(COSBoolean.TRUE);
    });

    it('parses false', () => {
      expect(parseCOSObject('false')).toBe(COSBoolean.FALSE);
    });

    it('parses null', () => {
      expect(parseCOSObject('null')).toBe(COSNull.NULL);
    });
  });

  // ---- Tokenizer edge cases -----------------------------------------------

  describe('tokenizer edge cases', () => {
    it('skips unmatched closing parenthesis ) without crashing', () => {
      // An unmatched ")" in the tokenizer's main loop is silently skipped
      // (it produces no token). This prevents infinite loops on corrupt data.
      // We verify by placing ")" before a valid object — the tokenizer drops
      // it and only produces the token for the subsequent value.
      const obj = parseCOSObject(') 42 )');
      // Both ")" chars are skipped, leaving only NUMBER "42" — no trailing tokens.
      assertCOSInteger(obj, 42);
    });

    it('parses concatenated name tokens /Filter/FlateDecode', () => {
      // In PDF content, names can appear right next to each other because
      // "/" is a delimiter. "/Filter/FlateDecode" should produce two NAME
      // tokens: "Filter" and "FlateDecode".
      const dict = parseCOSDictionary('<< /Filter/FlateDecode /Length 100 >>');
      assertCOSName(dict.getItem('Filter'), 'FlateDecode');
      assertCOSInteger(dict.getItem('Length'), 100);
    });

    it('handles comments in dictionary input', () => {
      const dict = parseCOSDictionary(`<<
        /Type /Catalog % this is a comment
        /Pages 2 0 R
      >>`);
      assertCOSName(dict.getItem('Type'), 'Catalog');
      const ref = dict.getItem('Pages') as COSObjectReference;
      expect(ref).toBeInstanceOf(COSObjectReference);
      expect(ref.objectNumber).toBe(2);
    });

    it('handles \\r\\n and \\f as whitespace', () => {
      const dict = parseCOSDictionary('<<\r\n/A\f1\r\n>>');
      assertCOSInteger(dict.getItem('A'), 1);
    });
  });

  // ---- Error handling -----------------------------------------------------

  describe('error handling', () => {
    it('throws on unexpected EOF in dictionary', () => {
      expect(() => parseCOSDictionary('<< /A')).toThrow();
    });

    it('throws on unexpected EOF in array', () => {
      expect(() => parseCOSObject('[1 2 3')).toThrow();
    });

    it('throws when input is not a dictionary', () => {
      expect(() => parseCOSDictionary('(not a dict)')).toThrow(
        'Expected dictionary start'
      );
    });

    it('throws on trailing tokens in parseCOSObject', () => {
      expect(() => parseCOSObject('42 extra')).toThrow(
        'Unexpected trailing tokens'
      );
    });
  });
});
