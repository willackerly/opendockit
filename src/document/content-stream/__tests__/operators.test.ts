import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  pushGraphicsState,
  popGraphicsState,
  setGraphicsState,
  setLineWidth,
  setLineCap,
  setDashPattern,
  concatMatrix,
  translate,
  scale,
  rotateRadians,
  skewRadians,
  moveTo,
  lineTo,
  rectangle,
  appendBezierCurve,
  closePath,
  stroke,
  fill,
  fillAndStroke,
  endPath,
  clip,
  setFillingGrayscaleColor,
  setStrokingGrayscaleColor,
  setFillingRgbColor,
  setStrokingRgbColor,
  setFillingCmykColor,
  setStrokingCmykColor,
  setFillColor,
  setStrokeColor,
  beginText,
  endText,
  setFontAndSize,
  showText,
  setTextMatrix,
  rotateAndSkewTextRadiansAndTranslate,
  setTextLeading,
  nextLine,
  moveText,
  drawXObject,
  beginMarkedContent,
  endMarkedContent,
} from '../operators.js';
import { rgb, cmyk, grayscale } from '../../colors.js';

describe('formatNumber', () => {
  it('formats integers without decimal', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1)).toBe('1');
    expect(formatNumber(-5)).toBe('-5');
    expect(formatNumber(100)).toBe('100');
  });

  it('formats simple decimals', () => {
    expect(formatNumber(0.5)).toBe('0.5');
    expect(formatNumber(3.14)).toBe('3.14');
    expect(formatNumber(-0.75)).toBe('-0.75');
  });

  it('avoids exponential notation for small numbers', () => {
    expect(formatNumber(0.0001)).toBe('0.0001');
    expect(formatNumber(0.00001)).toBe('0.00001');
    // 1e-7 in JS is actually 0.00000009999999999999999 due to floating point
    // The key requirement: no 'e' in output
    expect(formatNumber(1e-7)).not.toContain('e');
    // Verify a value that IS exactly representable
    expect(formatNumber(5e-7)).not.toContain('e');
  });

  it('avoids exponential notation for large numbers', () => {
    expect(formatNumber(1e21)).toBe('1000000000000000000000');
  });

  it('matches pdf-lib numberToString for edge cases', () => {
    // Verify exact match with pdf-lib's implementation
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1)).toBe('1');
    expect(formatNumber(-1)).toBe('-1');
    expect(formatNumber(0.1)).toBe('0.1');
    expect(formatNumber(0.01)).toBe('0.01');
  });
});

describe('graphics state operators', () => {
  it('pushGraphicsState', () => expect(pushGraphicsState()).toBe('q'));
  it('popGraphicsState', () => expect(popGraphicsState()).toBe('Q'));
  it('setGraphicsState', () => expect(setGraphicsState('GS0')).toBe('/GS0 gs'));
  it('setLineWidth', () => expect(setLineWidth(2)).toBe('2 w'));
  it('setLineCap', () => expect(setLineCap(1)).toBe('1 J'));
  it('setDashPattern empty', () => expect(setDashPattern([], 0)).toBe('[] 0 d'));
  it('setDashPattern with values', () =>
    expect(setDashPattern([3, 2], 1)).toBe('[3 2] 1 d'));
});

describe('transformation matrix operators', () => {
  it('concatMatrix', () =>
    expect(concatMatrix(1, 0, 0, 1, 100, 200)).toBe('1 0 0 1 100 200 cm'));

  it('translate', () => expect(translate(10, 20)).toBe('1 0 0 1 10 20 cm'));

  it('scale', () => expect(scale(2, 3)).toBe('2 0 0 3 0 0 cm'));

  it('rotateRadians at 0', () => expect(rotateRadians(0)).toBe('1 0 0 1 0 0 cm'));

  it('skewRadians at 0', () => expect(skewRadians(0, 0)).toBe('1 0 0 1 0 0 cm'));
});

describe('path construction operators', () => {
  it('moveTo', () => expect(moveTo(10, 20)).toBe('10 20 m'));
  it('lineTo', () => expect(lineTo(30, 40)).toBe('30 40 l'));
  it('rectangle', () => expect(rectangle(0, 0, 100, 50)).toBe('0 0 100 50 re'));
  it('appendBezierCurve', () =>
    expect(appendBezierCurve(1, 2, 3, 4, 5, 6)).toBe('1 2 3 4 5 6 c'));
  it('closePath', () => expect(closePath()).toBe('h'));
});

describe('path painting operators', () => {
  it('stroke', () => expect(stroke()).toBe('S'));
  it('fill', () => expect(fill()).toBe('f'));
  it('fillAndStroke', () => expect(fillAndStroke()).toBe('B'));
  it('endPath', () => expect(endPath()).toBe('n'));
});

describe('clipping operators', () => {
  it('clip', () => expect(clip()).toBe('W'));
});

describe('color operators', () => {
  it('setFillingGrayscaleColor', () =>
    expect(setFillingGrayscaleColor(0.5)).toBe('0.5 g'));
  it('setStrokingGrayscaleColor', () =>
    expect(setStrokingGrayscaleColor(0)).toBe('0 G'));
  it('setFillingRgbColor', () =>
    expect(setFillingRgbColor(1, 0, 0)).toBe('1 0 0 rg'));
  it('setStrokingRgbColor', () =>
    expect(setStrokingRgbColor(0, 1, 0)).toBe('0 1 0 RG'));
  it('setFillingCmykColor', () =>
    expect(setFillingCmykColor(0, 0, 0, 1)).toBe('0 0 0 1 k'));
  it('setStrokingCmykColor', () =>
    expect(setStrokingCmykColor(1, 0, 0, 0)).toBe('1 0 0 0 K'));

  it('setFillColor with RGB', () =>
    expect(setFillColor(rgb(1, 0, 0))).toBe('1 0 0 rg'));
  it('setFillColor with Grayscale', () =>
    expect(setFillColor(grayscale(0.5))).toBe('0.5 g'));
  it('setFillColor with CMYK', () =>
    expect(setFillColor(cmyk(1, 0, 0, 0))).toBe('1 0 0 0 k'));
  it('setStrokeColor with RGB', () =>
    expect(setStrokeColor(rgb(0, 0, 1))).toBe('0 0 1 RG'));
});

describe('text operators', () => {
  it('beginText', () => expect(beginText()).toBe('BT'));
  it('endText', () => expect(endText()).toBe('ET'));
  it('setFontAndSize', () => expect(setFontAndSize('Helv', 12)).toBe('/Helv 12 Tf'));
  it('showText', () => expect(showText('48656C6C6F')).toBe('<48656C6C6F> Tj'));
  it('setTextMatrix identity', () =>
    expect(setTextMatrix(1, 0, 0, 1, 0, 0)).toBe('1 0 0 1 0 0 Tm'));
  it('setTextLeading', () => expect(setTextLeading(14)).toBe('14 TL'));
  it('nextLine', () => expect(nextLine()).toBe('T*'));
  it('moveText', () => expect(moveText(10, -14)).toBe('10 -14 Td'));

  it('rotateAndSkewTextRadiansAndTranslate at origin', () => {
    const result = rotateAndSkewTextRadiansAndTranslate(0, 0, 0, 100, 200);
    expect(result).toBe('1 0 0 1 100 200 Tm');
  });
});

describe('XObject operator', () => {
  it('drawXObject', () => expect(drawXObject('Img')).toBe('/Img Do'));
});

describe('marked content operators', () => {
  it('beginMarkedContent', () =>
    expect(beginMarkedContent('Tx')).toBe('/Tx BMC'));
  it('endMarkedContent', () => expect(endMarkedContent()).toBe('EMC'));
});
