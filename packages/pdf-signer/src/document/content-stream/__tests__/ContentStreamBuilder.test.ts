import { describe, it, expect } from 'vitest';
import { ContentStreamBuilder } from '../ContentStreamBuilder.js';
import { rgb, grayscale } from '../../colors.js';
import { degrees } from '../../rotations.js';

describe('ContentStreamBuilder', () => {
  describe('low-level operators', () => {
    it('chains operators and joins with newlines', () => {
      const builder = new ContentStreamBuilder();
      const result = builder
        .pushGraphicsState()
        .moveTo(0, 0)
        .lineTo(100, 100)
        .stroke()
        .popGraphicsState()
        .toString();

      expect(result).toBe('q\n0 0 m\n100 100 l\nS\nQ');
    });

    it('produces correct XObject stream', () => {
      const builder = new ContentStreamBuilder();
      const result = builder
        .pushGraphicsState()
        .concatMatrix(200, 0, 0, 100, 0, 0)
        .drawXObject('Img')
        .popGraphicsState()
        .toString();

      expect(result).toBe('q\n200 0 0 100 0 0 cm\n/Img Do\nQ');
    });

    it('toBytes produces UTF-8', () => {
      const builder = new ContentStreamBuilder();
      builder.pushGraphicsState().popGraphicsState();
      const bytes = builder.toBytes();
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(bytes)).toBe('q\nQ');
    });

    it('handles text operators', () => {
      const builder = new ContentStreamBuilder();
      const result = builder
        .beginText()
        .setFontAndSize('F1', 12)
        .setTextMatrix(1, 0, 0, 1, 72, 720)
        .showText('48656C6C6F')
        .endText()
        .toString();

      expect(result).toBe(
        'BT\n/F1 12 Tf\n1 0 0 1 72 720 Tm\n<48656C6C6F> Tj\nET',
      );
    });

    it('handles color operators', () => {
      const builder = new ContentStreamBuilder();
      const result = builder
        .setFillColor(rgb(1, 0, 0))
        .setStrokeColor(grayscale(0.5))
        .toString();

      expect(result).toBe('1 0 0 rg\n0.5 G');
    });

    it('raw() injects arbitrary operator', () => {
      const builder = new ContentStreamBuilder();
      builder.raw('custom op');
      expect(builder.toString()).toBe('custom op');
    });
  });

  describe('drawRect compound operation', () => {
    it('matches pdf-lib drawRectangle sequence — fill only', () => {
      const builder = new ContentStreamBuilder();
      builder.drawRect({
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        borderWidth: 0,
        color: rgb(1, 0, 0),
        rotate: degrees(0),
        xSkew: degrees(0),
        ySkew: degrees(0),
      });
      const lines = builder.toString().split('\n');

      expect(lines[0]).toBe('q');                           // pushGraphicsState
      expect(lines[1]).toBe('1 0 0 rg');                    // setFillingColor
      expect(lines[2]).toBe('0 w');                          // setLineWidth
      expect(lines[3]).toBe('[] 0 d');                       // setDashPattern
      expect(lines[4]).toBe('1 0 0 1 10 20 cm');            // translate
      expect(lines[5]).toBe('1 0 0 1 0 0 cm');              // rotateRadians(0)
      expect(lines[6]).toBe('1 0 0 1 0 0 cm');              // skewRadians(0,0)
      expect(lines[7]).toBe('0 0 m');                        // moveTo
      expect(lines[8]).toBe('0 50 l');                       // lineTo
      expect(lines[9]).toBe('100 50 l');                     // lineTo
      expect(lines[10]).toBe('100 0 l');                     // lineTo
      expect(lines[11]).toBe('h');                           // closePath
      expect(lines[12]).toBe('f');                           // fill (no border)
      expect(lines[13]).toBe('Q');                           // popGraphicsState
    });

    it('uses fillAndStroke when both color and borderWidth', () => {
      const builder = new ContentStreamBuilder();
      builder.drawRect({
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        borderWidth: 2,
        color: rgb(1, 1, 1),
        borderColor: rgb(0, 0, 0),
        rotate: degrees(0),
        xSkew: degrees(0),
        ySkew: degrees(0),
      });
      const lines = builder.toString().split('\n');
      // After closePath, should be fillAndStroke
      const closePIdx = lines.indexOf('h');
      expect(lines[closePIdx + 1]).toBe('B');
    });

    it('uses stroke when only borderColor', () => {
      const builder = new ContentStreamBuilder();
      builder.drawRect({
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        borderWidth: 1,
        borderColor: rgb(0, 0, 0),
        rotate: degrees(0),
        xSkew: degrees(0),
        ySkew: degrees(0),
      });
      const lines = builder.toString().split('\n');
      const closePIdx = lines.indexOf('h');
      expect(lines[closePIdx + 1]).toBe('S');
    });
  });

  describe('drawLine compound operation', () => {
    it('matches pdf-lib drawLine sequence', () => {
      const builder = new ContentStreamBuilder();
      builder.drawLine({
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
        thickness: 2,
        color: rgb(0, 0, 0),
      });
      const lines = builder.toString().split('\n');

      expect(lines[0]).toBe('q');
      expect(lines[1]).toBe('0 0 0 RG');                   // setStrokingColor
      expect(lines[2]).toBe('2 w');                          // setLineWidth
      expect(lines[3]).toBe('[] 0 d');                       // setDashPattern
      expect(lines[4]).toBe('0 0 m');                        // moveTo (first)
      // lineCap not set, so no J operator
      expect(lines[5]).toBe('0 0 m');                        // moveTo (second)
      expect(lines[6]).toBe('100 100 l');                    // lineTo
      expect(lines[7]).toBe('S');                            // stroke
      expect(lines[8]).toBe('Q');
    });

    it('inserts lineCap between the two moveTo calls', () => {
      const builder = new ContentStreamBuilder();
      builder.drawLine({
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        thickness: 1,
        lineCap: 1,
      });
      const lines = builder.toString().split('\n');
      // Sequence: q, w, d, m, J, m, l, S, Q (no color → no RG)
      expect(lines[0]).toBe('q');
      expect(lines[1]).toBe('1 w');
      expect(lines[2]).toBe('[] 0 d');
      expect(lines[3]).toBe('0 0 m');
      expect(lines[4]).toBe('1 J');                          // setLineCap
      expect(lines[5]).toBe('0 0 m');
      expect(lines[6]).toBe('100 0 l');
      expect(lines[7]).toBe('S');
      expect(lines[8]).toBe('Q');
    });
  });

  describe('drawImage compound operation', () => {
    it('matches pdf-lib drawImage sequence', () => {
      const builder = new ContentStreamBuilder();
      builder.drawImage('Img0', {
        x: 10,
        y: 20,
        width: 200,
        height: 100,
        rotate: degrees(0),
        xSkew: degrees(0),
        ySkew: degrees(0),
      });
      const lines = builder.toString().split('\n');

      expect(lines[0]).toBe('q');
      expect(lines[1]).toBe('1 0 0 1 10 20 cm');            // translate
      expect(lines[2]).toBe('1 0 0 1 0 0 cm');              // rotateRadians(0)
      expect(lines[3]).toBe('200 0 0 100 0 0 cm');           // scale
      expect(lines[4]).toBe('1 0 0 1 0 0 cm');              // skewRadians(0,0)
      expect(lines[5]).toBe('/Img0 Do');                     // drawObject
      expect(lines[6]).toBe('Q');
    });
  });

  describe('drawTextLine compound operation', () => {
    it('matches pdf-lib drawText sequence', () => {
      const builder = new ContentStreamBuilder();
      builder.drawTextLine('48656C6C6F', {
        color: rgb(0, 0, 0),
        font: 'F1',
        size: 12,
        rotate: degrees(0),
        xSkew: degrees(0),
        ySkew: degrees(0),
        x: 72,
        y: 720,
      });
      const lines = builder.toString().split('\n');

      expect(lines[0]).toBe('q');                            // push
      expect(lines[1]).toBe('BT');                           // beginText
      expect(lines[2]).toBe('0 0 0 rg');                     // setFillingColor
      expect(lines[3]).toBe('/F1 12 Tf');                    // setFontAndSize
      expect(lines[4]).toBe('1 0 0 1 72 720 Tm');           // Tm
      expect(lines[5]).toBe('<48656C6C6F> Tj');              // showText
      expect(lines[6]).toBe('ET');                           // endText
      expect(lines[7]).toBe('Q');                            // pop
    });
  });

  describe('drawTextLines compound operation', () => {
    it('matches pdf-lib drawLinesOfText sequence', () => {
      const builder = new ContentStreamBuilder();
      builder.drawTextLines(['4C696E6531', '4C696E6532'], {
        color: rgb(0, 0, 0),
        font: 'F1',
        size: 12,
        lineHeight: 14,
        rotate: degrees(0),
        xSkew: degrees(0),
        ySkew: degrees(0),
        x: 72,
        y: 720,
      });
      const lines = builder.toString().split('\n');

      expect(lines[0]).toBe('q');
      expect(lines[1]).toBe('BT');
      expect(lines[2]).toBe('0 0 0 rg');
      expect(lines[3]).toBe('/F1 12 Tf');
      expect(lines[4]).toBe('14 TL');                        // setTextLeading
      expect(lines[5]).toBe('1 0 0 1 72 720 Tm');
      expect(lines[6]).toBe('<4C696E6531> Tj');
      expect(lines[7]).toBe('T*');
      expect(lines[8]).toBe('<4C696E6532> Tj');
      // No T* after last line (matches pdf-lib's drawLinesOfText)
      expect(lines[9]).toBe('ET');
      expect(lines[10]).toBe('Q');
    });
  });

  describe('signer image stream equivalence', () => {
    it('produces identical output to ad-hoc signer stream', () => {
      // This is the exact code from pdfbox-signer.ts line 553:
      // `q ${w} 0 0 ${h} 0 0 cm /Img Do Q`
      const w = 200;
      const h = 100;
      const expected = `q ${w} 0 0 ${h} 0 0 cm /Img Do Q`;

      const builder = new ContentStreamBuilder();
      builder
        .pushGraphicsState()
        .concatMatrix(w, 0, 0, h, 0, 0)
        .drawXObject('Img')
        .popGraphicsState();

      // Newline-joined vs space-joined — the actual stream content
      // when used in signer just needs the same operators in order.
      // The signer currently uses space separation, builder uses newline.
      const ops = builder.toString().split('\n');
      expect(ops).toEqual([
        'q',
        `${w} 0 0 ${h} 0 0 cm`,
        '/Img Do',
        'Q',
      ]);

      // Space-joined matches the original
      expect(ops.join(' ')).toBe(expected);
    });
  });
});
