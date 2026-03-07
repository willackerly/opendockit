/**
 * CanvasBackend — Canvas2D implementation of the RenderBackend interface.
 *
 * This is a THIN wrapper around CanvasRenderingContext2D that delegates every
 * call directly to the underlying context. No extra logic, no state tracking,
 * just pure delegation.
 *
 * The purpose is to provide a concrete implementation of RenderBackend that
 * preserves exact Canvas2D behavior. In a future wave, renderers will accept
 * a RenderBackend instead of a raw CanvasRenderingContext2D, enabling the
 * same renderer code to target both Canvas2D (via CanvasBackend) and PDF
 * (via a future PDFBackend).
 *
 * @module canvas-backend
 */

import type { RenderBackend } from './render-backend.js';

/**
 * Canvas2D rendering context type — either a standard or offscreen context.
 *
 * Both are supported since the existing renderers accept both variants.
 */
type Canvas2DContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

/**
 * Check whether a value is a Path2D instance.
 *
 * Uses `typeof Path2D !== 'undefined'` guard so that the check does not
 * throw in Node.js environments where Path2D is not a global. Falls back
 * to duck-typing via constructor name check for polyfilled environments.
 */
function isPath2D(value: unknown): value is Path2D {
  if (typeof value !== 'object' || value === null) return false;
  // Browser environment: Path2D is available as a global
  if (typeof Path2D !== 'undefined' && value instanceof Path2D) return true;
  // Polyfill / mock environment: check constructor name
  if (
    (value as { constructor?: { name?: string } }).constructor?.name ===
    'Path2D'
  )
    return true;
  return false;
}

/**
 * CanvasBackend wraps a Canvas2D rendering context and delegates every
 * RenderBackend method/property to it.
 *
 * Usage:
 * ```ts
 * const ctx = canvas.getContext('2d')!;
 * const backend = new CanvasBackend(ctx);
 * backend.save();
 * backend.fillStyle = 'red';
 * backend.fillRect(0, 0, 100, 100);
 * backend.restore();
 * ```
 */
export class CanvasBackend implements RenderBackend {
  constructor(private readonly ctx: Canvas2DContext) {}

  // -------------------------------------------------------------------------
  // State management
  // -------------------------------------------------------------------------

  save(): void {
    this.ctx.save();
  }

  restore(): void {
    this.ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Transform operations
  // -------------------------------------------------------------------------

  translate(x: number, y: number): void {
    this.ctx.translate(x, y);
  }

  scale(sx: number, sy: number): void {
    this.ctx.scale(sx, sy);
  }

  rotate(radians: number): void {
    this.ctx.rotate(radians);
  }

  transform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number
  ): void {
    this.ctx.transform(a, b, c, d, e, f);
  }

  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number
  ): void {
    this.ctx.setTransform(a, b, c, d, e, f);
  }

  // -------------------------------------------------------------------------
  // Path construction
  // -------------------------------------------------------------------------

  beginPath(): void {
    this.ctx.beginPath();
  }

  moveTo(x: number, y: number): void {
    this.ctx.moveTo(x, y);
  }

  lineTo(x: number, y: number): void {
    this.ctx.lineTo(x, y);
  }

  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number
  ): void {
    this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    this.ctx.quadraticCurveTo(cpx, cpy, x, y);
  }

  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean
  ): void {
    this.ctx.arc(x, y, radius, startAngle, endAngle, counterclockwise);
  }

  arcTo(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    radius: number
  ): void {
    this.ctx.arcTo(x1, y1, x2, y2, radius);
  }

  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean
  ): void {
    this.ctx.ellipse(
      x,
      y,
      radiusX,
      radiusY,
      rotation,
      startAngle,
      endAngle,
      counterclockwise
    );
  }

  closePath(): void {
    this.ctx.closePath();
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.ctx.rect(x, y, w, h);
  }

  clip(pathOrFillRule?: Path2D | CanvasFillRule, fillRule?: CanvasFillRule): void {
    if (isPath2D(pathOrFillRule)) {
      if (fillRule !== undefined) {
        this.ctx.clip(pathOrFillRule, fillRule);
      } else {
        this.ctx.clip(pathOrFillRule);
      }
    } else if (pathOrFillRule !== undefined) {
      this.ctx.clip(pathOrFillRule as CanvasFillRule);
    } else {
      this.ctx.clip();
    }
  }

  // -------------------------------------------------------------------------
  // Painting operations
  // -------------------------------------------------------------------------

  fill(pathOrFillRule?: Path2D | CanvasFillRule, fillRule?: CanvasFillRule): void {
    if (isPath2D(pathOrFillRule)) {
      if (fillRule !== undefined) {
        this.ctx.fill(pathOrFillRule, fillRule);
      } else {
        this.ctx.fill(pathOrFillRule);
      }
    } else if (pathOrFillRule !== undefined) {
      this.ctx.fill(pathOrFillRule as CanvasFillRule);
    } else {
      this.ctx.fill();
    }
  }

  stroke(path?: Path2D): void {
    if (path !== undefined) {
      this.ctx.stroke(path);
    } else {
      this.ctx.stroke();
    }
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.ctx.fillRect(x, y, w, h);
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    this.ctx.strokeRect(x, y, w, h);
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    this.ctx.clearRect(x, y, w, h);
  }

  // -------------------------------------------------------------------------
  // Style properties
  // -------------------------------------------------------------------------

  get fillStyle(): string | CanvasGradient | CanvasPattern {
    return this.ctx.fillStyle;
  }
  set fillStyle(value: string | CanvasGradient | CanvasPattern) {
    this.ctx.fillStyle = value;
  }

  get strokeStyle(): string | CanvasGradient | CanvasPattern {
    return this.ctx.strokeStyle;
  }
  set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
    this.ctx.strokeStyle = value;
  }

  get lineWidth(): number {
    return this.ctx.lineWidth;
  }
  set lineWidth(value: number) {
    this.ctx.lineWidth = value;
  }

  get lineCap(): CanvasLineCap {
    return this.ctx.lineCap;
  }
  set lineCap(value: CanvasLineCap) {
    this.ctx.lineCap = value;
  }

  get lineJoin(): CanvasLineJoin {
    return this.ctx.lineJoin;
  }
  set lineJoin(value: CanvasLineJoin) {
    this.ctx.lineJoin = value;
  }

  get miterLimit(): number {
    return this.ctx.miterLimit;
  }
  set miterLimit(value: number) {
    this.ctx.miterLimit = value;
  }

  get globalAlpha(): number {
    return this.ctx.globalAlpha;
  }
  set globalAlpha(value: number) {
    this.ctx.globalAlpha = value;
  }

  get globalCompositeOperation(): GlobalCompositeOperation {
    return this.ctx.globalCompositeOperation as GlobalCompositeOperation;
  }
  set globalCompositeOperation(value: GlobalCompositeOperation) {
    this.ctx.globalCompositeOperation = value;
  }

  setLineDash(segments: number[]): void {
    this.ctx.setLineDash(segments);
  }

  getLineDash(): number[] {
    return this.ctx.getLineDash();
  }

  get lineDashOffset(): number {
    return this.ctx.lineDashOffset;
  }
  set lineDashOffset(value: number) {
    this.ctx.lineDashOffset = value;
  }

  // -------------------------------------------------------------------------
  // Shadow properties
  // -------------------------------------------------------------------------

  get shadowColor(): string {
    return this.ctx.shadowColor;
  }
  set shadowColor(value: string) {
    this.ctx.shadowColor = value;
  }

  get shadowBlur(): number {
    return this.ctx.shadowBlur;
  }
  set shadowBlur(value: number) {
    this.ctx.shadowBlur = value;
  }

  get shadowOffsetX(): number {
    return this.ctx.shadowOffsetX;
  }
  set shadowOffsetX(value: number) {
    this.ctx.shadowOffsetX = value;
  }

  get shadowOffsetY(): number {
    return this.ctx.shadowOffsetY;
  }
  set shadowOffsetY(value: number) {
    this.ctx.shadowOffsetY = value;
  }

  // -------------------------------------------------------------------------
  // Text properties and operations
  // -------------------------------------------------------------------------

  get font(): string {
    return this.ctx.font;
  }
  set font(value: string) {
    this.ctx.font = value;
  }

  get textAlign(): CanvasTextAlign {
    return this.ctx.textAlign;
  }
  set textAlign(value: CanvasTextAlign) {
    this.ctx.textAlign = value;
  }

  get textBaseline(): CanvasTextBaseline {
    return this.ctx.textBaseline;
  }
  set textBaseline(value: CanvasTextBaseline) {
    this.ctx.textBaseline = value;
  }

  get direction(): CanvasDirection {
    return this.ctx.direction;
  }
  set direction(value: CanvasDirection) {
    this.ctx.direction = value;
  }

  get letterSpacing(): string {
    // letterSpacing is a newer Canvas2D property; duck-type access.
    const ctx = this.ctx as unknown as { letterSpacing?: string };
    return ctx.letterSpacing ?? '0px';
  }
  set letterSpacing(value: string) {
    const ctx = this.ctx as unknown as { letterSpacing?: string };
    if ('letterSpacing' in this.ctx) {
      ctx.letterSpacing = value;
    }
  }

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    if (maxWidth !== undefined) {
      this.ctx.fillText(text, x, y, maxWidth);
    } else {
      this.ctx.fillText(text, x, y);
    }
  }

  strokeText(text: string, x: number, y: number, maxWidth?: number): void {
    if (maxWidth !== undefined) {
      this.ctx.strokeText(text, x, y, maxWidth);
    } else {
      this.ctx.strokeText(text, x, y);
    }
  }

  measureText(text: string): TextMetrics {
    return this.ctx.measureText(text);
  }

  // -------------------------------------------------------------------------
  // Image operations
  // -------------------------------------------------------------------------

  drawImage(
    image: CanvasImageSource,
    sxOrDx: number,
    syOrDy: number,
    swOrDw?: number,
    shOrDh?: number,
    dx?: number,
    dy?: number,
    dw?: number,
    dh?: number
  ): void {
    if (dx !== undefined && dy !== undefined && dw !== undefined && dh !== undefined) {
      // 9-argument form: source rect + dest rect
      this.ctx.drawImage(
        image,
        sxOrDx,
        syOrDy,
        swOrDw!,
        shOrDh!,
        dx,
        dy,
        dw,
        dh
      );
    } else if (swOrDw !== undefined && shOrDh !== undefined) {
      // 5-argument form: dest position + size
      this.ctx.drawImage(image, sxOrDx, syOrDy, swOrDw, shOrDh);
    } else {
      // 3-argument form: dest position only
      this.ctx.drawImage(image, sxOrDx, syOrDy);
    }
  }

  // -------------------------------------------------------------------------
  // Gradient and pattern factories
  // -------------------------------------------------------------------------

  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): CanvasGradient {
    return this.ctx.createLinearGradient(x0, y0, x1, y1);
  }

  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): CanvasGradient {
    return this.ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  }

  createPattern(
    image: CanvasImageSource,
    repetition: string | null
  ): CanvasPattern | null {
    return this.ctx.createPattern(image, repetition);
  }
}
