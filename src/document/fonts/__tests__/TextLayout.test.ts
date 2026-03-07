import { describe, it, expect } from 'vitest';
import '../register.js'; // register all fonts
import { StandardFontMetrics } from '../StandardFontMetrics.js';
import { WinAnsiEncoding } from '../encoding.js';
import { layoutMultilineText, TextAlignment } from '../TextLayout.js';

describe('TextLayout', () => {
  const metrics = StandardFontMetrics.load('Helvetica');
  const encoding = WinAnsiEncoding;

  describe('layoutMultilineText', () => {
    it('lays out a single line', () => {
      const result = layoutMultilineText('Hello', {
        metrics,
        encoding,
        bounds: { x: 0, y: 0, width: 500, height: 100 },
        fontSize: 12,
      });

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].text).toBe('Hello');
      expect(result.lines[0].encoded).toBe('48656C6C6F');
      expect(result.lines[0].width).toBeGreaterThan(0);
      expect(result.fontSize).toBe(12);
    });

    it('wraps long text', () => {
      const longText = 'The quick brown fox jumps over the lazy dog';
      const result = layoutMultilineText(longText, {
        metrics,
        encoding,
        bounds: { x: 0, y: 0, width: 100, height: 200 },
        fontSize: 12,
      });

      expect(result.lines.length).toBeGreaterThan(1);
      // Each line should fit within bounds width
      for (const line of result.lines) {
        if (line.text.trim().length > 0) {
          expect(line.width).toBeLessThanOrEqual(100 + 1); // small tolerance for rounding
        }
      }
    });

    it('handles explicit newlines', () => {
      const result = layoutMultilineText('Line1\nLine2\nLine3', {
        metrics,
        encoding,
        bounds: { x: 0, y: 0, width: 500, height: 200 },
        fontSize: 12,
      });

      expect(result.lines).toHaveLength(3);
      expect(result.lines[0].text).toBe('Line1');
      expect(result.lines[1].text).toBe('Line2');
      expect(result.lines[2].text).toBe('Line3');
    });

    it('center-aligns text', () => {
      const result = layoutMultilineText('Hi', {
        metrics,
        encoding,
        bounds: { x: 0, y: 0, width: 200, height: 100 },
        fontSize: 12,
        alignment: TextAlignment.Center,
      });

      const line = result.lines[0];
      // X should be centered: (200 - width) / 2
      const expectedX = (200 - line.width) / 2;
      expect(line.x).toBeCloseTo(expectedX, 6);
    });

    it('right-aligns text', () => {
      const result = layoutMultilineText('Hi', {
        metrics,
        encoding,
        bounds: { x: 10, y: 0, width: 200, height: 100 },
        fontSize: 12,
        alignment: TextAlignment.Right,
      });

      const line = result.lines[0];
      // X should be right-aligned
      const expectedX = 10 + 200 - line.width;
      expect(line.x).toBeCloseTo(expectedX, 6);
    });

    it('handles empty text', () => {
      const result = layoutMultilineText('', {
        metrics,
        encoding,
        bounds: { x: 0, y: 0, width: 200, height: 100 },
        fontSize: 12,
      });

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].text).toBe('');
      expect(result.lines[0].encoded).toBe('');
    });

    it('positions lines from top down', () => {
      const result = layoutMultilineText('A\nB\nC', {
        metrics,
        encoding,
        bounds: { x: 0, y: 0, width: 200, height: 200 },
        fontSize: 12,
      });

      // Each subsequent line should have a lower y value
      for (let i = 1; i < result.lines.length; i++) {
        expect(result.lines[i].y).toBeLessThan(result.lines[i - 1].y);
      }
    });
  });
});
