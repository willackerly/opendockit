/**
 * Fluent builder for PDF content streams.
 * Wraps pure operator functions from operators.ts into a chainable API.
 *
 * Compound methods (drawRect, drawLine, drawImage, drawTextLine, drawTextLines)
 * replicate the exact operator sequences from pdf-lib's operations.ts.
 */

import type { Color } from '../colors.js';
import type { Rotation } from '../rotations.js';
import { toRadians } from '../rotations.js';
import * as ops from './operators.js';

// ---------------------------------------------------------------------------
// Option interfaces for compound drawing methods
// ---------------------------------------------------------------------------

export interface DrawRectOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  borderWidth: number;
  color?: Color;
  borderColor?: Color;
  rotate: Rotation;
  xSkew: Rotation;
  ySkew: Rotation;
  borderLineCap?: number;
  borderDashArray?: number[];
  borderDashPhase?: number;
  graphicsState?: string;
}

export interface DrawLineOptions {
  start: { x: number; y: number };
  end: { x: number; y: number };
  thickness: number;
  color?: Color;
  dashArray?: number[];
  dashPhase?: number;
  lineCap?: number;
  graphicsState?: string;
}

export interface DrawImageOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: Rotation;
  xSkew: Rotation;
  ySkew: Rotation;
  graphicsState?: string;
}

export interface DrawTextOptions {
  color: Color;
  font: string;
  size: number;
  rotate: Rotation;
  xSkew: Rotation;
  ySkew: Rotation;
  x: number;
  y: number;
  graphicsState?: string;
}

export interface DrawTextLinesOptions {
  color: Color;
  font: string;
  size: number;
  lineHeight: number;
  rotate: Rotation;
  xSkew: Rotation;
  ySkew: Rotation;
  x: number;
  y: number;
  graphicsState?: string;
}

export interface DrawEllipseOptions {
  x: number;
  y: number;
  xScale: number;
  yScale: number;
  rotate?: Rotation;
  color?: Color;
  borderColor?: Color;
  borderWidth?: number;
  borderLineCap?: number;
  borderDashArray?: number[];
  borderDashPhase?: number;
  graphicsState?: string;
}

// ---------------------------------------------------------------------------
// Builder class
// ---------------------------------------------------------------------------

export class ContentStreamBuilder {
  private readonly _ops: string[] = [];

  // --- Low-level: one operator each ---

  pushGraphicsState(): this {
    this._ops.push(ops.pushGraphicsState());
    return this;
  }

  popGraphicsState(): this {
    this._ops.push(ops.popGraphicsState());
    return this;
  }

  setGraphicsState(name: string): this {
    this._ops.push(ops.setGraphicsState(name));
    return this;
  }

  setLineWidth(width: number): this {
    this._ops.push(ops.setLineWidth(width));
    return this;
  }

  setLineCap(style: number): this {
    this._ops.push(ops.setLineCap(style));
    return this;
  }

  setLineJoin(style: number): this {
    this._ops.push(ops.setLineJoin(style));
    return this;
  }

  setDashPattern(dashArray: number[], dashPhase: number): this {
    this._ops.push(ops.setDashPattern(dashArray, dashPhase));
    return this;
  }

  concatMatrix(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): this {
    this._ops.push(ops.concatMatrix(a, b, c, d, e, f));
    return this;
  }

  translate(x: number, y: number): this {
    this._ops.push(ops.translate(x, y));
    return this;
  }

  scale(sx: number, sy: number): this {
    this._ops.push(ops.scale(sx, sy));
    return this;
  }

  rotateRadians(angle: number): this {
    this._ops.push(ops.rotateRadians(angle));
    return this;
  }

  skewRadians(xSkewAngle: number, ySkewAngle: number): this {
    this._ops.push(ops.skewRadians(xSkewAngle, ySkewAngle));
    return this;
  }

  moveTo(x: number, y: number): this {
    this._ops.push(ops.moveTo(x, y));
    return this;
  }

  lineTo(x: number, y: number): this {
    this._ops.push(ops.lineTo(x, y));
    return this;
  }

  rectangle(x: number, y: number, w: number, h: number): this {
    this._ops.push(ops.rectangle(x, y, w, h));
    return this;
  }

  appendBezierCurve(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
  ): this {
    this._ops.push(ops.appendBezierCurve(x1, y1, x2, y2, x3, y3));
    return this;
  }

  closePath(): this {
    this._ops.push(ops.closePath());
    return this;
  }

  stroke(): this {
    this._ops.push(ops.stroke());
    return this;
  }

  fill(): this {
    this._ops.push(ops.fill());
    return this;
  }

  fillAndStroke(): this {
    this._ops.push(ops.fillAndStroke());
    return this;
  }

  endPath(): this {
    this._ops.push(ops.endPath());
    return this;
  }

  clip(): this {
    this._ops.push(ops.clip());
    return this;
  }

  setFillColor(color: Color): this {
    this._ops.push(ops.setFillColor(color));
    return this;
  }

  setStrokeColor(color: Color): this {
    this._ops.push(ops.setStrokeColor(color));
    return this;
  }

  setFillingRgbColor(r: number, g: number, b: number): this {
    this._ops.push(ops.setFillingRgbColor(r, g, b));
    return this;
  }

  setStrokingRgbColor(r: number, g: number, b: number): this {
    this._ops.push(ops.setStrokingRgbColor(r, g, b));
    return this;
  }

  setFillingGrayscaleColor(gray: number): this {
    this._ops.push(ops.setFillingGrayscaleColor(gray));
    return this;
  }

  setStrokingGrayscaleColor(gray: number): this {
    this._ops.push(ops.setStrokingGrayscaleColor(gray));
    return this;
  }

  setFillingCmykColor(c: number, m: number, y: number, k: number): this {
    this._ops.push(ops.setFillingCmykColor(c, m, y, k));
    return this;
  }

  setStrokingCmykColor(c: number, m: number, y: number, k: number): this {
    this._ops.push(ops.setStrokingCmykColor(c, m, y, k));
    return this;
  }

  beginText(): this {
    this._ops.push(ops.beginText());
    return this;
  }

  endText(): this {
    this._ops.push(ops.endText());
    return this;
  }

  setFontAndSize(name: string, size: number): this {
    this._ops.push(ops.setFontAndSize(name, size));
    return this;
  }

  showText(hex: string): this {
    this._ops.push(ops.showText(hex));
    return this;
  }

  setTextMatrix(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): this {
    this._ops.push(ops.setTextMatrix(a, b, c, d, e, f));
    return this;
  }

  setTextLeading(leading: number): this {
    this._ops.push(ops.setTextLeading(leading));
    return this;
  }

  nextLine(): this {
    this._ops.push(ops.nextLine());
    return this;
  }

  moveText(x: number, y: number): this {
    this._ops.push(ops.moveText(x, y));
    return this;
  }

  drawXObject(name: string): this {
    this._ops.push(ops.drawXObject(name));
    return this;
  }

  beginMarkedContent(tag: string): this {
    this._ops.push(ops.beginMarkedContent(tag));
    return this;
  }

  endMarkedContent(): this {
    this._ops.push(ops.endMarkedContent());
    return this;
  }

  /** Push a raw operator string. */
  raw(operator: string): this {
    this._ops.push(operator);
    return this;
  }

  // --- High-level compound operations (match pdf-lib's operations.ts) ---

  /**
   * Draw a rectangle. Matches pdf-lib's `drawRectangle()` operator sequence:
   * q, gs?, rg?, RG?, w, J?, d, cm, cm, cm, m, l, l, l, h, B/f/S/h, Q
   */
  drawRect(options: DrawRectOptions): this {
    this.pushGraphicsState();
    if (options.graphicsState) this.setGraphicsState(options.graphicsState);
    if (options.color) this.setFillColor(options.color);
    if (options.borderColor) this.setStrokeColor(options.borderColor);
    this.setLineWidth(options.borderWidth);
    if (options.borderLineCap != null) this.setLineCap(options.borderLineCap);
    this.setDashPattern(
      options.borderDashArray ?? [],
      options.borderDashPhase ?? 0,
    );
    this.translate(options.x, options.y);
    this.rotateRadians(toRadians(options.rotate));
    this.skewRadians(toRadians(options.xSkew), toRadians(options.ySkew));
    this.moveTo(0, 0);
    this.lineTo(0, options.height);
    this.lineTo(options.width, options.height);
    this.lineTo(options.width, 0);
    this.closePath();

    if (options.color && options.borderWidth) {
      this.fillAndStroke();
    } else if (options.color) {
      this.fill();
    } else if (options.borderColor) {
      this.stroke();
    } else {
      this.closePath();
    }

    this.popGraphicsState();
    return this;
  }

  /**
   * Draw a line. Matches pdf-lib's `drawLine()` operator sequence:
   * q, gs?, RG?, w, d, m, J?, m, l, S, Q
   */
  drawLine(options: DrawLineOptions): this {
    this.pushGraphicsState();
    if (options.graphicsState) this.setGraphicsState(options.graphicsState);
    if (options.color) this.setStrokeColor(options.color);
    this.setLineWidth(options.thickness);
    this.setDashPattern(options.dashArray ?? [], options.dashPhase ?? 0);
    this.moveTo(options.start.x, options.start.y);
    if (options.lineCap != null) this.setLineCap(options.lineCap);
    this.moveTo(options.start.x, options.start.y);
    this.lineTo(options.end.x, options.end.y);
    this.stroke();
    this.popGraphicsState();
    return this;
  }

  /**
   * Draw an image XObject. Matches pdf-lib's `drawImage()` operator sequence:
   * q, gs?, cm(translate), cm(rotate), cm(scale), cm(skew), Do, Q
   */
  drawImage(name: string, options: DrawImageOptions): this {
    this.pushGraphicsState();
    if (options.graphicsState) this.setGraphicsState(options.graphicsState);
    this.translate(options.x, options.y);
    this.rotateRadians(toRadians(options.rotate));
    this.scale(options.width, options.height);
    this.skewRadians(toRadians(options.xSkew), toRadians(options.ySkew));
    this.drawXObject(name);
    this.popGraphicsState();
    return this;
  }

  /**
   * Draw a single line of text. Matches pdf-lib's `drawText()` operator sequence:
   * q, gs?, BT, rg, Tf, Tm, Tj, ET, Q
   */
  drawTextLine(hexEncoded: string, options: DrawTextOptions): this {
    this.pushGraphicsState();
    if (options.graphicsState) this.setGraphicsState(options.graphicsState);
    this.beginText();
    this.setFillColor(options.color);
    this.setFontAndSize(options.font, options.size);
    this._ops.push(
      ops.rotateAndSkewTextRadiansAndTranslate(
        toRadians(options.rotate),
        toRadians(options.xSkew),
        toRadians(options.ySkew),
        options.x,
        options.y,
      ),
    );
    this.showText(hexEncoded);
    this.endText();
    this.popGraphicsState();
    return this;
  }

  /**
   * Draw multiple lines of text. Matches pdf-lib's `drawLinesOfText()` sequence:
   * q, gs?, BT, rg, Tf, TL, Tm, (Tj T*)*, ET, Q
   */
  drawTextLines(hexLines: string[], options: DrawTextLinesOptions): this {
    this.pushGraphicsState();
    if (options.graphicsState) this.setGraphicsState(options.graphicsState);
    this.beginText();
    this.setFillColor(options.color);
    this.setFontAndSize(options.font, options.size);
    this.setTextLeading(options.lineHeight);
    this._ops.push(
      ops.rotateAndSkewTextRadiansAndTranslate(
        toRadians(options.rotate),
        toRadians(options.xSkew),
        toRadians(options.ySkew),
        options.x,
        options.y,
      ),
    );
    for (let i = 0; i < hexLines.length; i++) {
      this.showText(hexLines[i]);
      if (i < hexLines.length - 1) this.nextLine();
    }
    this.endText();
    this.popGraphicsState();
    return this;
  }

  /**
   * Draw an ellipse. Matches pdf-lib's `drawEllipse()` operator sequence:
   * q, gs?, rg?, RG?, w, J?, d, cm(translate), cm(rotate),
   * m, c, c, c, c, B/f/S, Q
   *
   * Uses four Bézier curves to approximate the ellipse (standard KAPPA approach).
   */
  drawEllipse(options: DrawEllipseOptions): this {
    // Bézier approximation constant for circles
    const KAPPA = 4 * ((Math.sqrt(2) - 1) / 3);

    this.pushGraphicsState();
    if (options.graphicsState) this.setGraphicsState(options.graphicsState);
    if (options.color) this.setFillColor(options.color);
    if (options.borderColor) this.setStrokeColor(options.borderColor);
    if (options.borderWidth !== undefined)
      this.setLineWidth(options.borderWidth);
    if (options.borderLineCap != null) this.setLineCap(options.borderLineCap);
    this.setDashPattern(
      options.borderDashArray ?? [],
      options.borderDashPhase ?? 0,
    );
    this.translate(options.x, options.y);
    if (options.rotate) this.rotateRadians(toRadians(options.rotate));

    const xs = options.xScale;
    const ys = options.yScale;

    // Bottom of ellipse
    this.moveTo(0, -ys);
    // Bottom to right
    this.appendBezierCurve(KAPPA * xs, -ys, xs, -KAPPA * ys, xs, 0);
    // Right to top
    this.appendBezierCurve(xs, KAPPA * ys, KAPPA * xs, ys, 0, ys);
    // Top to left
    this.appendBezierCurve(-KAPPA * xs, ys, -xs, KAPPA * ys, -xs, 0);
    // Left to bottom
    this.appendBezierCurve(-xs, -KAPPA * ys, -KAPPA * xs, -ys, 0, -ys);

    if (options.color && options.borderColor) {
      this.fillAndStroke();
    } else if (options.color) {
      this.fill();
    } else {
      this.stroke();
    }

    this.popGraphicsState();
    return this;
  }

  // --- Output ---

  /** Return all accumulated operators as a newline-joined string. */
  toString(): string {
    return this._ops.join('\n');
  }

  /** Return the content stream as UTF-8 bytes. */
  toBytes(): Uint8Array {
    return new TextEncoder().encode(this.toString());
  }
}
