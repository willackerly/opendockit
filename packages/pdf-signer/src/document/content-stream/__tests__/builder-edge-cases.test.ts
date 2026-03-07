import { describe, it, expect } from 'vitest';
import { ContentStreamBuilder } from '../ContentStreamBuilder.js';
import { formatNumber } from '../operators.js';
import { rgb, grayscale, cmyk } from '../../colors.js';
import { degrees } from '../../rotations.js';

// Shared defaults for compound method options
const noRotation = {
  rotate: degrees(0),
  xSkew: degrees(0),
  ySkew: degrees(0),
};

describe('ContentStreamBuilder edge cases', () => {
  // ---------------------------------------------------------------------------
  // formatNumber edge cases
  // ---------------------------------------------------------------------------

  describe('formatNumber', () => {
    it('integers emit no decimal point', () => {
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(1)).toBe('1');
      expect(formatNumber(42)).toBe('42');
      expect(formatNumber(-7)).toBe('-7');
    });

    it('0.1 renders as "0.1" without floating-point noise', () => {
      expect(formatNumber(0.1)).toBe('0.1');
    });

    it('handles 0.2 + 0.1 floating-point sum correctly', () => {
      // 0.1 + 0.2 === 0.30000000000000004 in IEEE 754
      // formatNumber should preserve the full representation, not truncate
      const sum = 0.1 + 0.2;
      const result = formatNumber(sum);
      // The function mirrors pdf-lib exactly: it does NOT round, so it
      // preserves the raw JS string representation.
      expect(result).toBe(String(sum));
    });

    it('handles very small numbers without exponential notation', () => {
      // 5e-7 would normally become "5e-7" in JS
      const result = formatNumber(5e-7);
      expect(result).not.toContain('e');
      expect(result).toBe('0.0000005');
    });

    it('handles very large numbers without exponential notation', () => {
      // 1e21 would become "1e+21" in JS
      const result = formatNumber(1e21);
      expect(result).not.toContain('e');
      expect(result).toBe('1000000000000000000000');
    });

    it('negative zero becomes "0"', () => {
      expect(formatNumber(-0)).toBe('0');
    });
  });

  // ---------------------------------------------------------------------------
  // Zero-dimension rectangle
  // ---------------------------------------------------------------------------

  describe('zero-dimension rectangle', () => {
    it('accepts width=0', () => {
      const builder = new ContentStreamBuilder();
      builder.drawRect({
        x: 10,
        y: 20,
        width: 0,
        height: 50,
        borderWidth: 1,
        color: rgb(1, 0, 0),
        ...noRotation,
      });
      const output = builder.toString();
      // Should produce valid operators with 0-width path segments
      expect(output).toContain('0 50 l');
      expect(output).toContain('0 0 l');
    });

    it('accepts height=0', () => {
      const builder = new ContentStreamBuilder();
      builder.drawRect({
        x: 10,
        y: 20,
        width: 100,
        height: 0,
        borderWidth: 1,
        color: rgb(0, 0, 1),
        ...noRotation,
      });
      const output = builder.toString();
      // lineTo(0, height=0) and lineTo(width, height=0) produce degenerate path
      expect(output).toContain('0 0 m');
      expect(output).toContain('0 0 l');
      expect(output).toContain('100 0 l');
    });
  });

  // ---------------------------------------------------------------------------
  // Negative coordinates
  // ---------------------------------------------------------------------------

  describe('negative coordinates', () => {
    it('drawRect with negative x and y', () => {
      const builder = new ContentStreamBuilder();
      builder.drawRect({
        x: -50,
        y: -100,
        width: 200,
        height: 150,
        borderWidth: 0,
        color: rgb(0, 1, 0),
        ...noRotation,
      });
      const output = builder.toString();
      expect(output).toContain('1 0 0 1 -50 -100 cm');
    });

    it('drawLine with negative start and end', () => {
      const builder = new ContentStreamBuilder();
      builder.drawLine({
        start: { x: -10, y: -20 },
        end: { x: -30, y: -40 },
        thickness: 1,
      });
      const output = builder.toString();
      expect(output).toContain('-10 -20 m');
      expect(output).toContain('-30 -40 l');
    });
  });

  // ---------------------------------------------------------------------------
  // Very large coordinates
  // ---------------------------------------------------------------------------

  describe('very large coordinates', () => {
    it('drawRect with coordinates > 10000', () => {
      const builder = new ContentStreamBuilder();
      builder.drawRect({
        x: 50000,
        y: 99999,
        width: 12345,
        height: 67890,
        borderWidth: 0,
        color: rgb(0, 0, 0),
        ...noRotation,
      });
      const output = builder.toString();
      expect(output).toContain('1 0 0 1 50000 99999 cm');
      expect(output).toContain('12345 67890 l');
    });
  });

  // ---------------------------------------------------------------------------
  // Font size extremes
  // ---------------------------------------------------------------------------

  describe('font size edge cases', () => {
    it('very small font size (0.5pt)', () => {
      const builder = new ContentStreamBuilder();
      builder.drawTextLine('41', {
        color: rgb(0, 0, 0),
        font: 'F1',
        size: 0.5,
        x: 0,
        y: 0,
        ...noRotation,
      });
      const output = builder.toString();
      expect(output).toContain('/F1 0.5 Tf');
    });

    it('very large font size (1000pt)', () => {
      const builder = new ContentStreamBuilder();
      builder.drawTextLine('42', {
        color: rgb(0, 0, 0),
        font: 'F1',
        size: 1000,
        x: 0,
        y: 0,
        ...noRotation,
      });
      const output = builder.toString();
      expect(output).toContain('/F1 1000 Tf');
    });
  });

  // ---------------------------------------------------------------------------
  // Empty text string
  // ---------------------------------------------------------------------------

  describe('empty text string', () => {
    it('drawTextLine with empty hex string', () => {
      const builder = new ContentStreamBuilder();
      builder.drawTextLine('', {
        color: rgb(0, 0, 0),
        font: 'F1',
        size: 12,
        x: 72,
        y: 720,
        ...noRotation,
      });
      const output = builder.toString();
      // Should produce <> Tj (empty hex string)
      expect(output).toContain('<> Tj');
    });
  });

  // ---------------------------------------------------------------------------
  // Text with special characters (hex-encoded at this layer,
  // but showText wraps in angle brackets)
  // ---------------------------------------------------------------------------

  describe('text with special characters in hex', () => {
    it('hex encoding of parentheses: ( = 0x28, ) = 0x29', () => {
      const builder = new ContentStreamBuilder();
      builder.showText('2829');
      expect(builder.toString()).toBe('<2829> Tj');
    });

    it('hex encoding of backslash: \\ = 0x5C', () => {
      const builder = new ContentStreamBuilder();
      builder.showText('5C');
      expect(builder.toString()).toBe('<5C> Tj');
    });

    it('hex encoding of newline: LF = 0x0A', () => {
      const builder = new ContentStreamBuilder();
      builder.showText('0A');
      expect(builder.toString()).toBe('<0A> Tj');
    });

    it('long hex string is passed through verbatim', () => {
      const longHex = 'DEADBEEF'.repeat(100);
      const builder = new ContentStreamBuilder();
      builder.showText(longHex);
      expect(builder.toString()).toBe(`<${longHex}> Tj`);
    });
  });

  // ---------------------------------------------------------------------------
  // Color boundary values
  // ---------------------------------------------------------------------------

  describe('color boundary values', () => {
    it('RGB with all zeros (black)', () => {
      const builder = new ContentStreamBuilder();
      builder.setFillColor(rgb(0, 0, 0));
      expect(builder.toString()).toBe('0 0 0 rg');
    });

    it('RGB with all ones (white)', () => {
      const builder = new ContentStreamBuilder();
      builder.setFillColor(rgb(1, 1, 1));
      expect(builder.toString()).toBe('1 1 1 rg');
    });

    it('grayscale 0.0 (black)', () => {
      const builder = new ContentStreamBuilder();
      builder.setFillColor(grayscale(0));
      expect(builder.toString()).toBe('0 g');
    });

    it('grayscale 1.0 (white)', () => {
      const builder = new ContentStreamBuilder();
      builder.setFillColor(grayscale(1));
      expect(builder.toString()).toBe('1 g');
    });

    it('CMYK with all zeros', () => {
      const builder = new ContentStreamBuilder();
      builder.setFillColor(cmyk(0, 0, 0, 0));
      expect(builder.toString()).toBe('0 0 0 0 k');
    });

    it('CMYK with all ones', () => {
      const builder = new ContentStreamBuilder();
      builder.setFillColor(cmyk(1, 1, 1, 1));
      expect(builder.toString()).toBe('1 1 1 1 k');
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple graphics state save/restore nesting
  // ---------------------------------------------------------------------------

  describe('nested graphics state save/restore', () => {
    it('supports deep nesting of q/Q pairs', () => {
      const builder = new ContentStreamBuilder();
      builder
        .pushGraphicsState()
        .pushGraphicsState()
        .pushGraphicsState()
        .moveTo(0, 0)
        .popGraphicsState()
        .popGraphicsState()
        .popGraphicsState();

      const lines = builder.toString().split('\n');
      expect(lines).toEqual(['q', 'q', 'q', '0 0 m', 'Q', 'Q', 'Q']);
    });

    it('compound operations nest correctly inside manual q/Q', () => {
      const builder = new ContentStreamBuilder();
      builder.pushGraphicsState();
      builder.drawRect({
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        borderWidth: 0,
        color: rgb(1, 0, 0),
        ...noRotation,
      });
      builder.popGraphicsState();

      const output = builder.toString();
      // Outer q ... Q wrapping inner q ... Q from drawRect
      expect(output.startsWith('q\nq\n')).toBe(true);
      expect(output.endsWith('Q\nQ')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // drawTextLines with 0, 1, and many lines
  // ---------------------------------------------------------------------------

  describe('drawTextLines line count edge cases', () => {
    const baseOpts = {
      color: rgb(0, 0, 0) as const,
      font: 'F1',
      size: 12,
      lineHeight: 14,
      x: 0,
      y: 0,
      ...noRotation,
    };

    it('0 lines: no Tj or T* operators emitted', () => {
      const builder = new ContentStreamBuilder();
      builder.drawTextLines([], baseOpts);
      const output = builder.toString();
      expect(output).not.toContain('Tj');
      expect(output).not.toContain('T*');
      // Still has BT/ET structure
      expect(output).toContain('BT');
      expect(output).toContain('ET');
    });

    it('1 line: Tj emitted, no T* (no line break needed)', () => {
      const builder = new ContentStreamBuilder();
      builder.drawTextLines(['4F4E45'], baseOpts);
      const output = builder.toString();
      expect(output).toContain('<4F4E45> Tj');
      expect(output).not.toContain('T*');
    });

    it('5 lines: 5 Tj and 4 T* operators', () => {
      const hexLines = ['AA', 'BB', 'CC', 'DD', 'EE'];
      const builder = new ContentStreamBuilder();
      builder.drawTextLines(hexLines, baseOpts);
      const lines = builder.toString().split('\n');
      const tjCount = lines.filter((l) => l.endsWith('Tj')).length;
      const tStarCount = lines.filter((l) => l === 'T*').length;
      expect(tjCount).toBe(5);
      expect(tStarCount).toBe(4);
    });
  });

  // ---------------------------------------------------------------------------
  // drawEllipse: circle degenerate case (equal x/y radius)
  // ---------------------------------------------------------------------------

  describe('drawEllipse edge cases', () => {
    it('circle: equal xScale and yScale', () => {
      const radius = 50;
      const builder = new ContentStreamBuilder();
      builder.drawEllipse({
        x: 100,
        y: 100,
        xScale: radius,
        yScale: radius,
        color: rgb(0, 0, 1),
      });
      const output = builder.toString();
      // The Bezier control points should be symmetric for a circle.
      // moveTo(0, -radius)
      expect(output).toContain(`0 -${radius} m`);

      // Verify it starts with q and ends with Q
      const lines = output.split('\n');
      expect(lines[0]).toBe('q');
      expect(lines[lines.length - 1]).toBe('Q');
      // fill-only since no borderColor
      expect(lines[lines.length - 2]).toBe('f');
    });

    it('ellipse with borderColor only uses stroke (S)', () => {
      const builder = new ContentStreamBuilder();
      builder.drawEllipse({
        x: 0,
        y: 0,
        xScale: 30,
        yScale: 20,
        borderColor: rgb(0, 0, 0),
        borderWidth: 2,
      });
      const lines = builder.toString().split('\n');
      // No fill color set, only border -> stroke
      expect(lines[lines.length - 2]).toBe('S');
    });

    it('ellipse with both fill and border uses fillAndStroke (B)', () => {
      const builder = new ContentStreamBuilder();
      builder.drawEllipse({
        x: 0,
        y: 0,
        xScale: 30,
        yScale: 20,
        color: rgb(1, 0, 0),
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });
      const lines = builder.toString().split('\n');
      expect(lines[lines.length - 2]).toBe('B');
    });
  });

  // ---------------------------------------------------------------------------
  // drawRect: fill only, border only, both, neither
  // ---------------------------------------------------------------------------

  describe('drawRect paint mode selection', () => {
    it('fill only (color set, borderWidth=0): emits f', () => {
      const builder = new ContentStreamBuilder();
      builder.drawRect({
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        borderWidth: 0,
        color: rgb(1, 0, 0),
        ...noRotation,
      });
      const lines = builder.toString().split('\n');
      const hIdx = lines.indexOf('h');
      expect(lines[hIdx + 1]).toBe('f');
    });

    it('border only (no color, borderColor set): emits S', () => {
      const builder = new ContentStreamBuilder();
      builder.drawRect({
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        borderWidth: 2,
        borderColor: rgb(0, 0, 0),
        ...noRotation,
      });
      const lines = builder.toString().split('\n');
      const hIdx = lines.indexOf('h');
      expect(lines[hIdx + 1]).toBe('S');
    });

    it('both fill and border: emits B', () => {
      const builder = new ContentStreamBuilder();
      builder.drawRect({
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        borderWidth: 2,
        color: rgb(1, 1, 0),
        borderColor: rgb(0, 0, 0),
        ...noRotation,
      });
      const lines = builder.toString().split('\n');
      const hIdx = lines.indexOf('h');
      expect(lines[hIdx + 1]).toBe('B');
    });

    it('neither fill nor border: emits extra closePath (h)', () => {
      const builder = new ContentStreamBuilder();
      builder.drawRect({
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        borderWidth: 0,
        ...noRotation,
      });
      const lines = builder.toString().split('\n');
      // Two consecutive 'h' — one from closePath() and one from the else branch
      const hIndices = lines
        .map((l, i) => (l === 'h' ? i : -1))
        .filter((i) => i >= 0);
      expect(hIndices.length).toBe(2);
      expect(hIndices[1] - hIndices[0]).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // drawImage with fractional dimensions
  // ---------------------------------------------------------------------------

  describe('drawImage with fractional dimensions', () => {
    it('fractional width and height are preserved', () => {
      const builder = new ContentStreamBuilder();
      builder.drawImage('Img0', {
        x: 10.5,
        y: 20.75,
        width: 123.456,
        height: 78.9,
        ...noRotation,
      });
      const output = builder.toString();
      expect(output).toContain('1 0 0 1 10.5 20.75 cm');
      expect(output).toContain('123.456 0 0 78.9 0 0 cm');
    });

    it('very small fractional image dimensions', () => {
      const builder = new ContentStreamBuilder();
      builder.drawImage('Tiny', {
        x: 0,
        y: 0,
        width: 0.001,
        height: 0.001,
        ...noRotation,
      });
      const output = builder.toString();
      expect(output).toContain('0.001 0 0 0.001 0 0 cm');
      expect(output).toContain('/Tiny Do');
    });
  });

  // ---------------------------------------------------------------------------
  // toBytes encoding
  // ---------------------------------------------------------------------------

  describe('toBytes', () => {
    it('empty builder produces empty Uint8Array', () => {
      const builder = new ContentStreamBuilder();
      const bytes = builder.toBytes();
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(0);
    });

    it('round-trips through TextDecoder', () => {
      const builder = new ContentStreamBuilder();
      builder.setFillColor(rgb(0.5, 0.5, 0.5)).moveTo(-10, 20);
      const bytes = builder.toBytes();
      const decoded = new TextDecoder().decode(bytes);
      expect(decoded).toBe(builder.toString());
    });
  });
});
