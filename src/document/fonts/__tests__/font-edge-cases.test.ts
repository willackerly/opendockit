import { describe, it, expect } from 'vitest';
import '../register.js';
import { StandardFontMetrics } from '../StandardFontMetrics.js';
import {
  WinAnsiEncoding,
  SymbolEncoding,
  ZapfDingbatsEncoding,
  encodingForFont,
} from '../encoding.js';
import { layoutMultilineText, TextAlignment } from '../TextLayout.js';

// All 14 standard PDF fonts
const ALL_FONTS = [
  'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique',
  'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
  'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
  'Symbol', 'ZapfDingbats',
];

// The 12 WinAnsi fonts (everything except Symbol and ZapfDingbats)
const WINANSI_FONTS = ALL_FONTS.filter(
  f => f !== 'Symbol' && f !== 'ZapfDingbats',
);

describe('Font metrics edge cases', () => {
  // -----------------------------------------------------------------------
  // Empty string width = 0 for all 14 standard fonts
  // -----------------------------------------------------------------------
  describe('empty string width is 0 for every font', () => {
    for (const fontName of ALL_FONTS) {
      it(`${fontName}`, () => {
        const m = StandardFontMetrics.load(fontName);
        const enc = encodingForFont(fontName);
        expect(m.widthOfTextAtSize('', 12, enc)).toBe(0);
      });
    }
  });

  // -----------------------------------------------------------------------
  // Single character width > 0 for a few different fonts
  // -----------------------------------------------------------------------
  describe('single character width is positive', () => {
    it('Helvetica "W" (widest Latin capital)', () => {
      const m = StandardFontMetrics.load('Helvetica');
      const w = m.widthOfTextAtSize('W', 14, WinAnsiEncoding);
      expect(w).toBeGreaterThan(0);
    });

    it('Times-Roman "i" (narrow character)', () => {
      const m = StandardFontMetrics.load('Times-Roman');
      const w = m.widthOfTextAtSize('i', 10, WinAnsiEncoding);
      expect(w).toBeGreaterThan(0);
    });

    it('Courier-Bold "M" (fixed width)', () => {
      const m = StandardFontMetrics.load('Courier-Bold');
      const w = m.widthOfTextAtSize('M', 12, WinAnsiEncoding);
      expect(w).toBeGreaterThan(0);
      // Courier is monospaced: every char has width 600 in font units
      expect(w).toBeCloseTo(600 * 12 / 1000, 6);
    });
  });

  // -----------------------------------------------------------------------
  // Characters outside WinAnsi encoding throw
  // -----------------------------------------------------------------------
  describe('characters outside WinAnsi encoding', () => {
    it('throws for CJK character U+4E2D', () => {
      const m = StandardFontMetrics.load('Helvetica');
      // U+4E2D is not in WinAnsi
      expect(() =>
        m.widthOfTextAtSize('\u4E2D', 12, WinAnsiEncoding),
      ).toThrow('WinAnsi cannot encode');
    });

    it('throws for emoji U+1F600', () => {
      const m = StandardFontMetrics.load('Helvetica');
      expect(() =>
        m.widthOfTextAtSize('\u{1F600}', 12, WinAnsiEncoding),
      ).toThrow('WinAnsi cannot encode');
    });
  });

  // -----------------------------------------------------------------------
  // Symbol font special characters
  // -----------------------------------------------------------------------
  describe('Symbol font special characters', () => {
    it('measures Greek alpha (U+03B1)', () => {
      const m = StandardFontMetrics.load('Symbol');
      // U+03B1 = Greek small letter alpha, code point 945
      const w = m.widthOfTextAtSize('\u03B1', 12, SymbolEncoding);
      expect(w).toBeGreaterThan(0);
    });

    it('measures infinity sign (U+221E)', () => {
      const m = StandardFontMetrics.load('Symbol');
      // U+221E = infinity
      const w = m.widthOfTextAtSize('\u221E', 12, SymbolEncoding);
      expect(w).toBeGreaterThan(0);
    });

    it('measures summation (U+2211)', () => {
      const m = StandardFontMetrics.load('Symbol');
      // U+2211 = N-ary summation
      const w = m.widthOfTextAtSize('\u2211', 10, SymbolEncoding);
      expect(w).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // ZapfDingbats mapping
  // -----------------------------------------------------------------------
  describe('ZapfDingbats mapping', () => {
    it('measures scissors (U+2702)', () => {
      const m = StandardFontMetrics.load('ZapfDingbats');
      // U+2702 = scissors, code point 9986
      const w = m.widthOfTextAtSize('\u2702', 12, ZapfDingbatsEncoding);
      expect(w).toBeGreaterThan(0);
    });

    it('measures check mark (U+2713)', () => {
      const m = StandardFontMetrics.load('ZapfDingbats');
      // U+2713 = check mark, code point 10003
      const w = m.widthOfTextAtSize('\u2713', 12, ZapfDingbatsEncoding);
      expect(w).toBeGreaterThan(0);
    });

    it('measures star (U+2605)', () => {
      const m = StandardFontMetrics.load('ZapfDingbats');
      // U+2605 = black star, code point 9733
      const w = m.widthOfTextAtSize('\u2605', 14, ZapfDingbatsEncoding);
      expect(w).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // sizeAtHeight round-trip: sizeAtHeight(heightAtSize(N)) ~ N
  // -----------------------------------------------------------------------
  describe('sizeAtHeight round-trip', () => {
    it('sizeAtHeight(heightAtSize(12)) is approximately 12', () => {
      const m = StandardFontMetrics.load('Helvetica');
      const h = m.heightAtSize(12);
      const recovered = m.sizeAtHeight(h);
      expect(recovered).toBeCloseTo(12, 6);
    });

    it('round-trips for Times-Roman at size 24', () => {
      const m = StandardFontMetrics.load('Times-Roman');
      const h = m.heightAtSize(24);
      const recovered = m.sizeAtHeight(h);
      expect(recovered).toBeCloseTo(24, 6);
    });

    it('round-trips for Courier at size 8', () => {
      const m = StandardFontMetrics.load('Courier');
      const h = m.heightAtSize(8);
      const recovered = m.sizeAtHeight(h);
      expect(recovered).toBeCloseTo(8, 6);
    });
  });

  // -----------------------------------------------------------------------
  // All 14 fonts: every printable ASCII char (32-126) has non-zero width
  // -----------------------------------------------------------------------
  describe('all printable ASCII chars have non-zero width', () => {
    for (const fontName of WINANSI_FONTS) {
      it(`${fontName}: codes 32-126`, () => {
        const m = StandardFontMetrics.load(fontName);
        for (let code = 32; code <= 126; code++) {
          const ch = String.fromCharCode(code);
          const w = m.widthOfTextAtSize(ch, 12, WinAnsiEncoding);
          expect(w, `char ${code} ('${ch}') should have positive width`).toBeGreaterThan(0);
        }
      });
    }

    it('Symbol: space and digits (shared with ASCII)', () => {
      const m = StandardFontMetrics.load('Symbol');
      // Symbol encoding maps code points 32, 48-57 (digits), and others
      const w = m.widthOfTextAtSize(' ', 12, SymbolEncoding);
      expect(w).toBeGreaterThan(0);
      for (let digit = 48; digit <= 57; digit++) {
        const ch = String.fromCharCode(digit);
        const dw = m.widthOfTextAtSize(ch, 12, SymbolEncoding);
        expect(dw, `digit '${ch}' should have positive width`).toBeGreaterThan(0);
      }
    });

    it('ZapfDingbats: space has positive width', () => {
      const m = StandardFontMetrics.load('ZapfDingbats');
      const w = m.widthOfTextAtSize(' ', 12, ZapfDingbatsEncoding);
      expect(w).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // widthOfTextAtSize with size 0
  // -----------------------------------------------------------------------
  describe('widthOfTextAtSize with size 0', () => {
    it('returns 0 for any text at size 0', () => {
      const m = StandardFontMetrics.load('Helvetica');
      expect(m.widthOfTextAtSize('Hello World', 0, WinAnsiEncoding)).toBe(0);
    });

    it('returns 0 for single char at size 0', () => {
      const m = StandardFontMetrics.load('Times-Bold');
      expect(m.widthOfTextAtSize('X', 0, WinAnsiEncoding)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // heightAtSize with size 0
  // -----------------------------------------------------------------------
  describe('heightAtSize with size 0', () => {
    it('returns 0 for Helvetica', () => {
      const m = StandardFontMetrics.load('Helvetica');
      expect(m.heightAtSize(0)).toBe(0);
    });

    it('returns 0 for Times-Roman with descender=false', () => {
      const m = StandardFontMetrics.load('Times-Roman');
      expect(m.heightAtSize(0, { descender: false })).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Text layout: word wrap at exact boundary
  // -----------------------------------------------------------------------
  describe('text layout word wrap at exact boundary', () => {
    it('text that fits exactly in maxWidth stays on one line', () => {
      const metrics = StandardFontMetrics.load('Courier');
      const encoding = WinAnsiEncoding;
      const fontSize = 10;
      // Courier: every char = 600 units, at 10pt => 6.0 pt per char
      // 10 chars = 60 pt
      const text = 'AAAAAAAAAA'; // 10 chars
      const exactWidth = metrics.widthOfTextAtSize(text, fontSize, encoding);

      const result = layoutMultilineText(text, {
        metrics,
        encoding,
        bounds: { x: 0, y: 0, width: exactWidth, height: 200 },
        fontSize,
      });

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].text).toBe(text);
    });
  });

  // -----------------------------------------------------------------------
  // Text layout: very long word (longer than maxWidth)
  // -----------------------------------------------------------------------
  describe('text layout with very long word', () => {
    it('a single word wider than maxWidth is not broken mid-word', () => {
      const metrics = StandardFontMetrics.load('Helvetica');
      const encoding = WinAnsiEncoding;
      const fontSize = 12;
      const longWord = 'Supercalifragilisticexpialidocious';
      const wordWidth = metrics.widthOfTextAtSize(longWord, fontSize, encoding);

      // Set maxWidth to half the word width -- word cannot fit
      const result = layoutMultilineText(longWord, {
        metrics,
        encoding,
        bounds: { x: 0, y: 0, width: wordWidth / 2, height: 500 },
        fontSize,
      });

      // The word should stay intact on a single line (no break points)
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].text).toBe(longWord);
    });

    it('long word preceded by short words wraps correctly', () => {
      const metrics = StandardFontMetrics.load('Helvetica');
      const encoding = WinAnsiEncoding;
      const fontSize = 12;
      const text = 'Hi Supercalifragilisticexpialidocious';
      const shortWidth = metrics.widthOfTextAtSize('Hi ', fontSize, encoding);

      // Width fits "Hi " but not the long word
      const result = layoutMultilineText(text, {
        metrics,
        encoding,
        bounds: { x: 0, y: 0, width: shortWidth + 10, height: 500 },
        fontSize,
      });

      // Should produce at least 2 lines
      expect(result.lines.length).toBeGreaterThanOrEqual(2);
      expect(result.lines[0].text).toBe('Hi ');
    });
  });

  // -----------------------------------------------------------------------
  // Text layout with empty string
  // -----------------------------------------------------------------------
  describe('text layout with empty string', () => {
    it('produces a single empty line', () => {
      const metrics = StandardFontMetrics.load('Helvetica');
      const encoding = WinAnsiEncoding;

      const result = layoutMultilineText('', {
        metrics,
        encoding,
        bounds: { x: 0, y: 0, width: 200, height: 100 },
        fontSize: 12,
      });

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].text).toBe('');
      expect(result.lines[0].width).toBe(0);
      expect(result.lines[0].encoded).toBe('');
    });
  });

  // -----------------------------------------------------------------------
  // Multi-line text layout: word wrap with explicit newlines
  // -----------------------------------------------------------------------
  describe('multi-line text layout with newlines', () => {
    it('respects explicit newlines and wraps within paragraphs', () => {
      const metrics = StandardFontMetrics.load('Courier');
      const encoding = WinAnsiEncoding;
      const fontSize = 10;
      // Courier at 10pt: each char is 6pt wide
      // Width of 30pt fits 5 chars
      const text = 'AAAAA BBBBB\nCC';

      const result = layoutMultilineText(text, {
        metrics,
        encoding,
        bounds: { x: 0, y: 0, width: 36, height: 500 },
        fontSize,
      });

      // "AAAAA " fits in 36pt (6 chars * 6pt = 36pt), then "BBBBB" on next line
      // "CC" on its own line from the newline
      expect(result.lines.length).toBeGreaterThanOrEqual(2);
      // The last line should be "CC" from the explicit newline
      const lastLine = result.lines[result.lines.length - 1];
      expect(lastLine.text).toBe('CC');
    });
  });
});
