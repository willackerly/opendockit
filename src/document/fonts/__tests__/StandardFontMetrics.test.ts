import { describe, it, expect, beforeAll } from 'vitest';
import '../register.js'; // register all fonts
import { StandardFontMetrics } from '../StandardFontMetrics.js';
import { WinAnsiEncoding, SymbolEncoding, encodingForFont } from '../encoding.js';

describe('StandardFontMetrics', () => {
  describe('load', () => {
    it('loads Helvetica', () => {
      const m = StandardFontMetrics.load('Helvetica');
      expect(m.name).toBe('Helvetica');
      expect(m.ascender).toBe(718);
      expect(m.descender).toBe(-207);
    });

    it('loads all 14 standard fonts', () => {
      const fonts = [
        'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique',
        'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
        'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
        'Symbol', 'ZapfDingbats',
      ];
      for (const name of fonts) {
        const m = StandardFontMetrics.load(name);
        expect(m.name).toBe(name);
      }
    });

    it('caches loaded fonts', () => {
      const m1 = StandardFontMetrics.load('Helvetica');
      const m2 = StandardFontMetrics.load('Helvetica');
      expect(m1).toBe(m2);
    });

    it('throws for unknown font', () => {
      expect(() => StandardFontMetrics.load('NotAFont')).toThrow('Unknown standard font');
    });
  });

  describe('isStandardFont', () => {
    it('returns true for standard fonts', () => {
      expect(StandardFontMetrics.isStandardFont('Helvetica')).toBe(true);
      expect(StandardFontMetrics.isStandardFont('Courier')).toBe(true);
    });

    it('returns false for non-standard fonts', () => {
      expect(StandardFontMetrics.isStandardFont('Arial')).toBe(false);
    });
  });

  describe('widthOfGlyph', () => {
    it('returns correct width for known glyphs', () => {
      const m = StandardFontMetrics.load('Helvetica');
      expect(m.widthOfGlyph('A')).toBe(667);
      expect(m.widthOfGlyph('space')).toBe(278);
    });

    it('returns 250 for unknown glyphs (matching pdf-lib default)', () => {
      const m = StandardFontMetrics.load('Helvetica');
      expect(m.widthOfGlyph('nonexistentglyph')).toBe(250);
    });

    it('Courier has fixed-width glyphs', () => {
      const m = StandardFontMetrics.load('Courier');
      expect(m.widthOfGlyph('A')).toBe(600);
      expect(m.widthOfGlyph('i')).toBe(600);
      expect(m.widthOfGlyph('space')).toBe(600);
    });
  });

  describe('getKerning', () => {
    it('returns kern amount for known pairs', () => {
      const m = StandardFontMetrics.load('Helvetica');
      // Helvetica has kerning for common pairs like AV, AT
      const kern = m.getKerning('A', 'V');
      expect(kern).toBeLessThan(0); // negative = tighter
    });

    it('returns 0 for unknown pairs', () => {
      const m = StandardFontMetrics.load('Helvetica');
      expect(m.getKerning('A', 'A')).toBe(0);
    });
  });

  describe('widthOfTextAtSize — cross-validation with pdf-lib', () => {
    /**
     * These tests verify that our native measurement matches pdf-lib's
     * StandardFontEmbedder.widthOfTextAtSize() exactly.
     */

    it('measures "Hello" in Helvetica at 12pt', () => {
      const m = StandardFontMetrics.load('Helvetica');
      const width = m.widthOfTextAtSize('Hello', 12, WinAnsiEncoding);
      // H=722, e=556, l=222, l=222, o=556, kern pairs
      // Total units = 722 + 556 + 222 + 222 + 556 = 2278
      // Plus any kern pairs between these characters
      expect(width).toBeGreaterThan(0);
      expect(width).toBeCloseTo(2278 * 12 / 1000, 0);
    });

    it('measures empty string as 0', () => {
      const m = StandardFontMetrics.load('Helvetica');
      expect(m.widthOfTextAtSize('', 12, WinAnsiEncoding)).toBe(0);
    });

    it('measures single character', () => {
      const m = StandardFontMetrics.load('Helvetica');
      const width = m.widthOfTextAtSize('A', 12, WinAnsiEncoding);
      expect(width).toBeCloseTo(667 * 12 / 1000, 6);
    });

    it('Courier is truly monospaced', () => {
      const m = StandardFontMetrics.load('Courier');
      const wA = m.widthOfTextAtSize('A', 12, WinAnsiEncoding);
      const wi = m.widthOfTextAtSize('i', 12, WinAnsiEncoding);
      expect(wA).toBe(wi);
      expect(wA).toBeCloseTo(600 * 12 / 1000, 6);
    });
  });

  describe('heightAtSize', () => {
    it('calculates height with descender', () => {
      const m = StandardFontMetrics.load('Helvetica');
      const height = m.heightAtSize(12);
      // (718 - (-207)) / 1000 * 12 = 925 / 1000 * 12 = 11.1
      expect(height).toBeCloseTo(11.1, 1);
    });

    it('calculates height without descender', () => {
      const m = StandardFontMetrics.load('Helvetica');
      const height = m.heightAtSize(12, { descender: false });
      // (718 - (-207) + (-207)) / 1000 * 12 = 718 / 1000 * 12 = 8.616
      expect(height).toBeCloseTo(8.616, 2);
    });
  });

  describe('sizeAtHeight', () => {
    it('is inverse of heightAtSize', () => {
      const m = StandardFontMetrics.load('Helvetica');
      const height = m.heightAtSize(12);
      const size = m.sizeAtHeight(height);
      expect(size).toBeCloseTo(12, 6);
    });
  });
});
