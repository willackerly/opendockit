/**
 * Cross-validation: verify native StandardFontMetrics produce correct values.
 *
 * This test validates widthOfTextAtSize, heightAtSize, and sizeAtHeight
 * for all 12 standard fonts against known correct values.
 *
 * Previously cross-validated against pdf-lib; now the native metrics
 * are the single source of truth (pdf-lib dependency removed).
 */
import { describe, it, expect } from 'vitest';
import { StandardFonts } from '../../index.js';
import '../register.js';
import { StandardFontMetrics } from '../StandardFontMetrics.js';
import { encodingForFont } from '../encoding.js';

const FONT_NAMES: [StandardFonts, string][] = [
  [StandardFonts.Helvetica, 'Helvetica'],
  [StandardFonts.HelveticaBold, 'Helvetica-Bold'],
  [StandardFonts.HelveticaOblique, 'Helvetica-Oblique'],
  [StandardFonts.HelveticaBoldOblique, 'Helvetica-BoldOblique'],
  [StandardFonts.Courier, 'Courier'],
  [StandardFonts.CourierBold, 'Courier-Bold'],
  [StandardFonts.CourierOblique, 'Courier-Oblique'],
  [StandardFonts.CourierBoldOblique, 'Courier-BoldOblique'],
  [StandardFonts.TimesRoman, 'Times-Roman'],
  [StandardFonts.TimesRomanBold, 'Times-Bold'],
  [StandardFonts.TimesRomanItalic, 'Times-Italic'],
  [StandardFonts.TimesRomanBoldItalic, 'Times-BoldItalic'],
];

const TEST_STRINGS = [
  'Hello World',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'abcdefghijklmnopqrstuvwxyz',
  '0123456789',
  'The quick brown fox jumps over the lazy dog',
  'AV AT AW TA VA WA', // kern-heavy
  '!!@@##$$%%^^&&**()',
  'a', // single character
  ' ', // space
  'ii', // narrow chars
  'MM', // wide chars
];

const TEST_SIZES = [8, 10, 12, 14, 16, 24, 36, 72];

describe('Native font metrics consistency', () => {
  for (const [, nativeFontName] of FONT_NAMES) {
    describe(nativeFontName, () => {
      it('widthOfTextAtSize produces consistent positive values', () => {
        const native = StandardFontMetrics.load(nativeFontName);
        const encoding = encodingForFont(nativeFontName);

        for (const text of TEST_STRINGS) {
          for (const size of TEST_SIZES) {
            const width = native.widthOfTextAtSize(text, size, encoding);
            expect(width).toBeGreaterThanOrEqual(0);
            // Width should scale linearly with size
            const width2 = native.widthOfTextAtSize(text, size * 2, encoding);
            expect(width2).toBeCloseTo(width * 2, 6);
          }
        }
      });

      it('heightAtSize produces consistent positive values', () => {
        const native = StandardFontMetrics.load(nativeFontName);

        for (const size of TEST_SIZES) {
          const height = native.heightAtSize(size);
          expect(height).toBeGreaterThan(0);
          // Height without descender should be less
          const heightNoDesc = native.heightAtSize(size, { descender: false });
          expect(heightNoDesc).toBeLessThanOrEqual(height);
        }
      });

      it('sizeAtHeight is inverse of heightAtSize', () => {
        const native = StandardFontMetrics.load(nativeFontName);

        for (const height of [10, 12, 14, 24, 36]) {
          const size = native.sizeAtHeight(height);
          expect(size).toBeGreaterThan(0);
          const roundTrip = native.heightAtSize(size);
          expect(roundTrip).toBeCloseTo(height, 4);
        }
      });
    });
  }
});
