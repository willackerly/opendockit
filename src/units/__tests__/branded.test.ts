import { describe, it, expect } from 'vitest';

import {
  points,
  pixels,
  isValidPoints,
  isValidPixels,
  pointsChecked,
  pixelsChecked,
} from '../branded';
import type { Points, Pixels } from '../branded';

describe('branded unit types', () => {
  describe('factory functions', () => {
    it('points() creates a Points-branded number', () => {
      const p: Points = points(72);
      expect(p).toBe(72);
      expect(typeof p).toBe('number');
    });

    it('pixels() creates a Pixels-branded number', () => {
      const px: Pixels = pixels(96);
      expect(px).toBe(96);
      expect(typeof px).toBe('number');
    });

    it('handles zero', () => {
      expect(points(0)).toBe(0);
      expect(pixels(0)).toBe(0);
    });

    it('handles negative values', () => {
      expect(points(-10)).toBe(-10);
      expect(pixels(-5)).toBe(-5);
    });

    it('handles fractional values', () => {
      expect(points(12.5)).toBe(12.5);
      expect(pixels(1.5)).toBe(1.5);
    });
  });

  describe('arithmetic', () => {
    it('branded values support addition', () => {
      const a = points(10);
      const b = points(20);
      // Arithmetic on branded types yields plain number;
      // re-brand the result for type safety.
      const sum: number = a + b;
      expect(sum).toBe(30);
    });

    it('branded values support multiplication', () => {
      const p = points(72);
      const scaled: number = p * 2;
      expect(scaled).toBe(144);
    });

    it('branded values support comparison', () => {
      const a = points(10);
      const b = points(20);
      expect(a < b).toBe(true);
      expect(b > a).toBe(true);
      expect(a === points(10)).toBe(true);
    });

    it('branded values work with Math functions', () => {
      const p = points(-42);
      expect(Math.abs(p)).toBe(42);
      expect(Math.round(points(3.7))).toBe(4);
    });
  });

  describe('isValidPoints', () => {
    it('accepts finite numbers', () => {
      expect(isValidPoints(0)).toBe(true);
      expect(isValidPoints(72)).toBe(true);
      expect(isValidPoints(-100)).toBe(true);
      expect(isValidPoints(3.14)).toBe(true);
    });

    it('rejects NaN', () => {
      expect(isValidPoints(NaN)).toBe(false);
    });

    it('rejects Infinity', () => {
      expect(isValidPoints(Infinity)).toBe(false);
      expect(isValidPoints(-Infinity)).toBe(false);
    });
  });

  describe('isValidPixels', () => {
    it('accepts finite numbers', () => {
      expect(isValidPixels(0)).toBe(true);
      expect(isValidPixels(96)).toBe(true);
      expect(isValidPixels(-1)).toBe(true);
    });

    it('rejects NaN', () => {
      expect(isValidPixels(NaN)).toBe(false);
    });

    it('rejects Infinity', () => {
      expect(isValidPixels(Infinity)).toBe(false);
      expect(isValidPixels(-Infinity)).toBe(false);
    });
  });

  describe('pointsChecked', () => {
    it('returns branded value for valid input', () => {
      const p: Points = pointsChecked(72);
      expect(p).toBe(72);
    });

    it('throws RangeError for NaN', () => {
      expect(() => pointsChecked(NaN)).toThrow(RangeError);
      expect(() => pointsChecked(NaN)).toThrow('Invalid Points value: NaN');
    });

    it('throws RangeError for Infinity', () => {
      expect(() => pointsChecked(Infinity)).toThrow(RangeError);
      expect(() => pointsChecked(-Infinity)).toThrow(RangeError);
    });
  });

  describe('pixelsChecked', () => {
    it('returns branded value for valid input', () => {
      const px: Pixels = pixelsChecked(96);
      expect(px).toBe(96);
    });

    it('throws RangeError for NaN', () => {
      expect(() => pixelsChecked(NaN)).toThrow(RangeError);
      expect(() => pixelsChecked(NaN)).toThrow('Invalid Pixels value: NaN');
    });

    it('throws RangeError for Infinity', () => {
      expect(() => pixelsChecked(Infinity)).toThrow(RangeError);
      expect(() => pixelsChecked(-Infinity)).toThrow(RangeError);
    });
  });

  describe('type narrowing', () => {
    it('isValidPoints narrows to Points type', () => {
      const n: number = 42;
      if (isValidPoints(n)) {
        // After narrowing, n should be usable as Points
        const p: Points = n;
        expect(p).toBe(42);
      }
    });

    it('isValidPixels narrows to Pixels type', () => {
      const n: number = 96;
      if (isValidPixels(n)) {
        // After narrowing, n should be usable as Pixels
        const px: Pixels = n;
        expect(px).toBe(96);
      }
    });
  });
});
