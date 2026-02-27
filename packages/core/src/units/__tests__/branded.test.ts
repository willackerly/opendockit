import { describe, it, expect } from 'vitest';
import {
  emu,
  hundredthsPt,
  pixels,
  isValidEmu,
  emuChecked,
} from '../branded.js';
import type { EMU, HundredthsPt, Pixels } from '../branded.js';

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

describe('emu()', () => {
  it('creates an EMU value from a number', () => {
    const val: EMU = emu(914400);
    expect(val).toBe(914400);
  });

  it('preserves negative values', () => {
    const val: EMU = emu(-457200);
    expect(val).toBe(-457200);
  });

  it('preserves zero', () => {
    const val: EMU = emu(0);
    expect(val).toBe(0);
  });

  it('result is usable in arithmetic as a plain number', () => {
    const a = emu(914400);
    const b = emu(457200);
    // Arithmetic works because EMU extends number
    expect(a + b).toBe(1371600);
    expect(a - b).toBe(457200);
    expect(a * 2).toBe(1828800);
    expect(a / 2).toBe(457200);
  });
});

describe('hundredthsPt()', () => {
  it('creates a HundredthsPt value from a number', () => {
    const val: HundredthsPt = hundredthsPt(1800);
    expect(val).toBe(1800);
  });

  it('18pt font size is 1800 hundredths', () => {
    const fontSize: HundredthsPt = hundredthsPt(18 * 100);
    expect(fontSize).toBe(1800);
  });
});

describe('pixels()', () => {
  it('creates a Pixels value from a number', () => {
    const val: Pixels = pixels(960);
    expect(val).toBe(960);
  });

  it('handles fractional pixel values', () => {
    const val: Pixels = pixels(100.5);
    expect(val).toBe(100.5);
  });
});

// ---------------------------------------------------------------------------
// Type guards and checked constructor
// ---------------------------------------------------------------------------

describe('isValidEmu()', () => {
  it('returns true for zero', () => {
    expect(isValidEmu(0)).toBe(true);
  });

  it('returns true for positive integers', () => {
    expect(isValidEmu(914400)).toBe(true);
  });

  it('returns true for negative integers', () => {
    expect(isValidEmu(-914400)).toBe(true);
  });

  it('returns false for NaN', () => {
    expect(isValidEmu(NaN)).toBe(false);
  });

  it('returns false for Infinity', () => {
    expect(isValidEmu(Infinity)).toBe(false);
  });

  it('returns false for -Infinity', () => {
    expect(isValidEmu(-Infinity)).toBe(false);
  });

  it('returns false for floating-point values', () => {
    expect(isValidEmu(914400.5)).toBe(false);
  });
});

describe('emuChecked()', () => {
  it('returns branded EMU for valid integer', () => {
    const val: EMU = emuChecked(914400);
    expect(val).toBe(914400);
  });

  it('returns branded EMU for zero', () => {
    const val: EMU = emuChecked(0);
    expect(val).toBe(0);
  });

  it('throws for NaN', () => {
    expect(() => emuChecked(NaN)).toThrow(RangeError);
  });

  it('throws for Infinity', () => {
    expect(() => emuChecked(Infinity)).toThrow(RangeError);
  });

  it('throws for floating-point', () => {
    expect(() => emuChecked(0.5)).toThrow(RangeError);
  });

  it('error message includes the invalid value', () => {
    expect(() => emuChecked(NaN)).toThrow('Invalid EMU value: NaN');
  });
});

// ---------------------------------------------------------------------------
// Interop with plain number (backward compatibility)
// ---------------------------------------------------------------------------

describe('branded types extend number', () => {
  it('EMU is assignable to number', () => {
    const val: EMU = emu(914400);
    const n: number = val; // Should compile — EMU extends number
    expect(n).toBe(914400);
  });

  it('HundredthsPt is assignable to number', () => {
    const val: HundredthsPt = hundredthsPt(1800);
    const n: number = val;
    expect(n).toBe(1800);
  });

  it('Pixels is assignable to number', () => {
    const val: Pixels = pixels(960);
    const n: number = val;
    expect(n).toBe(960);
  });

  it('branded values work with Math functions', () => {
    const val: EMU = emu(914400);
    expect(Math.abs(val)).toBe(914400);
    expect(Math.round(val)).toBe(914400);
  });

  it('branded values work with comparison operators', () => {
    const a = emu(100);
    const b = emu(200);
    expect(a < b).toBe(true);
    expect(b > a).toBe(true);
    expect(a === emu(100)).toBe(true);
  });
});
