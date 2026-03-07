/**
 * Pure functions that emit PDF content stream operators as strings.
 * Zero dependencies — matches pdf-lib's operator output byte-for-byte.
 *
 * Each function returns a single PDF operator string (e.g. "0 0 m").
 * Operator format: "arg1 arg2 ... opName"
 */

import type { Color } from '../colors.js';
import { ColorTypes } from '../colors.js';

// ---------------------------------------------------------------------------
// Number formatting — must match pdf-lib's numberToString exactly
// ---------------------------------------------------------------------------

/**
 * Convert a number to its string representation without exponential notation.
 * Matches pdf-lib's `numberToString` from `src/utils/numbers.ts`.
 */
export const formatNumber = (num: number): string => {
  let numStr = String(num);

  if (Math.abs(num) < 1.0) {
    const e = parseInt(num.toString().split('e-')[1]);
    if (e) {
      const negative = num < 0;
      if (negative) num *= -1;
      num *= Math.pow(10, e - 1);
      numStr = '0.' + new Array(e).join('0') + num.toString().substring(2);
      if (negative) numStr = '-' + numStr;
    }
  } else {
    let e = parseInt(num.toString().split('+')[1]);
    if (e > 20) {
      e -= 20;
      num /= Math.pow(10, e);
      numStr = num.toString() + new Array(e + 1).join('0');
    }
  }

  return numStr;
};

const n = formatNumber;

// ---------------------------------------------------------------------------
// Graphics state operators
// ---------------------------------------------------------------------------

export const pushGraphicsState = (): string => 'q';
export const popGraphicsState = (): string => 'Q';

export const setGraphicsState = (name: string): string => `/${name} gs`;

export const setLineWidth = (width: number): string => `${n(width)} w`;

export const setLineCap = (style: number): string => `${n(style)} J`;

export const setLineJoin = (style: number): string => `${n(style)} j`;

export const setDashPattern = (
  dashArray: number[],
  dashPhase: number,
): string => `[${dashArray.map(n).join(' ')}] ${n(dashPhase)} d`;

// ---------------------------------------------------------------------------
// Transformation matrix operators
// ---------------------------------------------------------------------------

export const concatMatrix = (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
): string => `${n(a)} ${n(b)} ${n(c)} ${n(d)} ${n(e)} ${n(f)} cm`;

export const translate = (x: number, y: number): string =>
  concatMatrix(1, 0, 0, 1, x, y);

export const scale = (sx: number, sy: number): string =>
  concatMatrix(sx, 0, 0, sy, 0, 0);

export const rotateRadians = (angle: number): string =>
  concatMatrix(
    Math.cos(angle),
    Math.sin(angle),
    -Math.sin(angle),
    Math.cos(angle),
    0,
    0,
  );

export const skewRadians = (
  xSkewAngle: number,
  ySkewAngle: number,
): string =>
  concatMatrix(
    1,
    Math.tan(xSkewAngle),
    Math.tan(ySkewAngle),
    1,
    0,
    0,
  );

// ---------------------------------------------------------------------------
// Path construction operators
// ---------------------------------------------------------------------------

export const moveTo = (x: number, y: number): string => `${n(x)} ${n(y)} m`;

export const lineTo = (x: number, y: number): string => `${n(x)} ${n(y)} l`;

export const rectangle = (
  x: number,
  y: number,
  w: number,
  h: number,
): string => `${n(x)} ${n(y)} ${n(w)} ${n(h)} re`;

export const appendBezierCurve = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): string =>
  `${n(x1)} ${n(y1)} ${n(x2)} ${n(y2)} ${n(x3)} ${n(y3)} c`;

export const closePath = (): string => 'h';

// ---------------------------------------------------------------------------
// Path painting operators
// ---------------------------------------------------------------------------

export const stroke = (): string => 'S';
export const fill = (): string => 'f';
export const fillAndStroke = (): string => 'B';
export const endPath = (): string => 'n';

// ---------------------------------------------------------------------------
// Clipping operators
// ---------------------------------------------------------------------------

export const clip = (): string => 'W';
export const clipEvenOdd = (): string => 'W*';

// ---------------------------------------------------------------------------
// Color operators
// ---------------------------------------------------------------------------

export const setFillingGrayscaleColor = (gray: number): string =>
  `${n(gray)} g`;

export const setStrokingGrayscaleColor = (gray: number): string =>
  `${n(gray)} G`;

export const setFillingRgbColor = (
  r: number,
  g: number,
  b: number,
): string => `${n(r)} ${n(g)} ${n(b)} rg`;

export const setStrokingRgbColor = (
  r: number,
  g: number,
  b: number,
): string => `${n(r)} ${n(g)} ${n(b)} RG`;

export const setFillingCmykColor = (
  c: number,
  m: number,
  y: number,
  k: number,
): string => `${n(c)} ${n(m)} ${n(y)} ${n(k)} k`;

export const setStrokingCmykColor = (
  c: number,
  m: number,
  y: number,
  k: number,
): string => `${n(c)} ${n(m)} ${n(y)} ${n(k)} K`;

export const setFillColor = (color: Color): string => {
  switch (color.type) {
    case ColorTypes.Grayscale:
      return setFillingGrayscaleColor(color.gray);
    case ColorTypes.RGB:
      return setFillingRgbColor(color.red, color.green, color.blue);
    case ColorTypes.CMYK:
      return setFillingCmykColor(
        color.cyan,
        color.magenta,
        color.yellow,
        color.key,
      );
    default: {
      // Robustness: infer type from properties if discriminant is missing
      const c = color as any;
      if ('red' in c) return setFillingRgbColor(c.red, c.green, c.blue);
      if ('cyan' in c) return setFillingCmykColor(c.cyan, c.magenta, c.yellow, c.key);
      if ('gray' in c) return setFillingGrayscaleColor(c.gray);
      return setFillingGrayscaleColor(0);
    }
  }
};

export const setStrokeColor = (color: Color): string => {
  switch (color.type) {
    case ColorTypes.Grayscale:
      return setStrokingGrayscaleColor(color.gray);
    case ColorTypes.RGB:
      return setStrokingRgbColor(color.red, color.green, color.blue);
    case ColorTypes.CMYK:
      return setStrokingCmykColor(
        color.cyan,
        color.magenta,
        color.yellow,
        color.key,
      );
    default: {
      const c = color as any;
      if ('red' in c) return setStrokingRgbColor(c.red, c.green, c.blue);
      if ('cyan' in c) return setStrokingCmykColor(c.cyan, c.magenta, c.yellow, c.key);
      if ('gray' in c) return setStrokingGrayscaleColor(c.gray);
      return setStrokingGrayscaleColor(0);
    }
  }
};

// ---------------------------------------------------------------------------
// Text operators
// ---------------------------------------------------------------------------

export const beginText = (): string => 'BT';
export const endText = (): string => 'ET';

export const setFontAndSize = (name: string, size: number): string =>
  `/${name} ${n(size)} Tf`;

export const showText = (hex: string): string => `<${hex}> Tj`;

export const setTextMatrix = (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
): string => `${n(a)} ${n(b)} ${n(c)} ${n(d)} ${n(e)} ${n(f)} Tm`;

export const rotateAndSkewTextRadiansAndTranslate = (
  rotationAngle: number,
  xSkewAngle: number,
  ySkewAngle: number,
  x: number,
  y: number,
): string =>
  setTextMatrix(
    Math.cos(rotationAngle),
    Math.sin(rotationAngle) + Math.tan(xSkewAngle),
    -Math.sin(rotationAngle) + Math.tan(ySkewAngle),
    Math.cos(rotationAngle),
    x,
    y,
  );

export const setTextLeading = (leading: number): string =>
  `${n(leading)} TL`;

export const nextLine = (): string => 'T*';

export const moveText = (x: number, y: number): string =>
  `${n(x)} ${n(y)} Td`;

// ---------------------------------------------------------------------------
// XObject operator
// ---------------------------------------------------------------------------

export const drawXObject = (name: string): string => `/${name} Do`;

// ---------------------------------------------------------------------------
// Marked content operators
// ---------------------------------------------------------------------------

export const beginMarkedContent = (tag: string): string => `/${tag} BMC`;
export const endMarkedContent = (): string => 'EMC';
