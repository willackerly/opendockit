import { describe, it, expect } from 'vitest';
import {
  WinAnsiEncoding,
  SymbolEncoding,
  ZapfDingbatsEncoding,
  encodingForFont,
  encodeTextToHex,
} from '../encoding.js';

describe('WinAnsiEncoding', () => {
  it('encodes ASCII characters', () => {
    expect(WinAnsiEncoding.encode(65)).toEqual({ code: 65, name: 'A' });
    expect(WinAnsiEncoding.encode(32)).toEqual({ code: 32, name: 'space' });
    expect(WinAnsiEncoding.encode(122)).toEqual({ code: 122, name: 'z' });
  });

  it('encodes extended characters', () => {
    expect(WinAnsiEncoding.encode(169)).toEqual({ code: 169, name: 'copyright' });
    expect(WinAnsiEncoding.encode(8364)).toEqual({ code: 128, name: 'Euro' });
    expect(WinAnsiEncoding.encode(8482)).toEqual({ code: 153, name: 'trademark' });
  });

  it('canEncode returns true for supported code points', () => {
    expect(WinAnsiEncoding.canEncode(65)).toBe(true);
    expect(WinAnsiEncoding.canEncode(8364)).toBe(true);
  });

  it('canEncode returns false for unsupported code points', () => {
    expect(WinAnsiEncoding.canEncode(0x4e2d)).toBe(false); // Chinese char
  });

  it('throws for unsupported code points', () => {
    expect(() => WinAnsiEncoding.encode(0x4e2d)).toThrow('WinAnsi cannot encode');
  });
});

describe('SymbolEncoding', () => {
  it('encodes Greek letters', () => {
    expect(SymbolEncoding.encode(916)).toEqual({ code: 68, name: 'Delta' });
    expect(SymbolEncoding.encode(945)).toEqual({ code: 97, name: 'alpha' });
  });

  it('encodes math symbols', () => {
    expect(SymbolEncoding.encode(8734)).toEqual({ code: 165, name: 'infinity' });
  });
});

describe('ZapfDingbatsEncoding', () => {
  it('encodes dingbat characters', () => {
    expect(ZapfDingbatsEncoding.encode(9985)).toEqual({ code: 33, name: 'a1' });
    expect(ZapfDingbatsEncoding.encode(32)).toEqual({ code: 32, name: 'space' });
  });
});

describe('encodingForFont', () => {
  it('returns WinAnsi for most fonts', () => {
    expect(encodingForFont('Helvetica')).toBe(WinAnsiEncoding);
    expect(encodingForFont('Courier')).toBe(WinAnsiEncoding);
    expect(encodingForFont('Times-Roman')).toBe(WinAnsiEncoding);
  });

  it('returns Symbol for Symbol font', () => {
    expect(encodingForFont('Symbol')).toBe(SymbolEncoding);
  });

  it('returns ZapfDingbats for ZapfDingbats font', () => {
    expect(encodingForFont('ZapfDingbats')).toBe(ZapfDingbatsEncoding);
  });
});

describe('encodeTextToHex', () => {
  it('encodes ASCII text to hex', () => {
    const hex = encodeTextToHex('Hello', WinAnsiEncoding);
    expect(hex).toBe('48656C6C6F');
  });

  it('encodes single character', () => {
    const hex = encodeTextToHex('A', WinAnsiEncoding);
    expect(hex).toBe('41');
  });

  it('encodes space', () => {
    const hex = encodeTextToHex(' ', WinAnsiEncoding);
    expect(hex).toBe('20');
  });

  it('encodes extended characters with correct byte codes', () => {
    // Euro sign (U+20AC) → byte code 128 → hex 80
    const hex = encodeTextToHex('\u20AC', WinAnsiEncoding);
    expect(hex).toBe('80');
  });
});
