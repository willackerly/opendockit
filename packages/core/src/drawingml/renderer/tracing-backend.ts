/**
 * TracingBackend — render tracing wrapper for RenderBackend.
 *
 * Wraps any RenderBackend (typically CanvasBackend) and records structured
 * trace events for every visual operation, with world-space coordinates
 * in points (1/72 inch).
 *
 * ## Design
 *
 * - **Zero cost when disabled**: TracingBackend is never constructed in
 *   production. You only wrap when you need trace data.
 * - **Shadow CTM stack**: Canvas2D does not expose its internal transform
 *   matrix. TracingBackend maintains a software shadow matrix that mirrors
 *   every translate/scale/rotate/transform/setTransform/save/restore call.
 * - **World-space coordinates**: All trace events use points (1/72 inch)
 *   for direct comparability with PDF-extracted elements.
 * - **Shape context**: Renderers can optionally call setShapeContext() via
 *   duck-typed detection to attribute trace events to specific shapes.
 *
 * ## Performance (when tracing IS enabled)
 *
 * - Shadow matrix operations: ~6 multiplies per transform call (negligible)
 * - Event recording: one object alloc + array push per draw call (~0.5μs)
 * - glyphLevel mode: per-character measureText calls (~30-50% overhead)
 * - Estimated total overhead: 2-5% without glyphLevel, 30-50% with it
 *
 * @module tracing-backend
 */

import type { RenderBackend } from './render-backend.js';
import type {
  TraceConfig,
  TraceEvent,
  RenderTrace,
  ShapeContext,
  TextTraceEvent,
  StrokeTextTraceEvent,
  ShapeTraceEvent,
  ImageTraceEvent,
} from './trace-types.js';

// ---------------------------------------------------------------------------
// Inline matrix math (avoids cross-package import for a handful of operations)
// ---------------------------------------------------------------------------

type CTM = [number, number, number, number, number, number]; // [a, b, c, d, tx, ty]

function identityCTM(): CTM {
  return [1, 0, 0, 1, 0, 0];
}

function cloneCTM(m: CTM): CTM {
  return [m[0], m[1], m[2], m[3], m[4], m[5]];
}

/** Multiply: result = current * transform (apply transform on the right). */
function multiplyCTM(cur: CTM, t: CTM): CTM {
  const [a1, b1, c1, d1, tx1, ty1] = cur;
  const [a2, b2, c2, d2, tx2, ty2] = t;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * tx2 + c1 * ty2 + tx1,
    b1 * tx2 + d1 * ty2 + ty1,
  ];
}

/** Transform point (x, y) by CTM → world-space pixel coordinates. */
function transformPointCTM(m: CTM, x: number, y: number): [number, number] {
  return [
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5],
  ];
}

// ---------------------------------------------------------------------------
// TracingBackend
// ---------------------------------------------------------------------------

/**
 * A RenderBackend wrapper that records structured trace events.
 *
 * Usage:
 * ```ts
 * const canvas = canvasElement.getContext('2d')!;
 * const inner = new CanvasBackend(canvas);
 * const tracing = new TracingBackend(inner, { glyphLevel: false, dpiScale: 2 });
 *
 * // ... render slide using tracing as the backend ...
 *
 * const trace = tracing.getTrace('pptx:slide1', 720, 540);
 * ```
 */
export class TracingBackend implements RenderBackend {
  private readonly inner: RenderBackend;
  private readonly config: TraceConfig;
  private readonly events: TraceEvent[];
  private readonly pxToPt: number;

  // Shadow CTM stack
  private ctm: CTM;
  private readonly ctmStack: CTM[] = [];

  // Shadow style state
  private _fillStyle: string | CanvasGradient | CanvasPattern = '#000000';
  private _strokeStyle: string | CanvasGradient | CanvasPattern = '#000000';
  private _font = '10px sans-serif';
  private _lineWidth = 1;

  // Shape context (set by renderers)
  private shapeCtx: ShapeContext = {};

  // Path bounding box tracking (for fill/stroke events)
  private pathMinX = Infinity;
  private pathMinY = Infinity;
  private pathMaxX = -Infinity;
  private pathMaxY = -Infinity;

  constructor(inner: RenderBackend, config: TraceConfig) {
    this.inner = inner;
    this.config = config;
    this.events = [];
    // Conversion: pixels → points. pixels = pt * (dpiScale * 96/72)
    // So: pt = pixels / (dpiScale * 96/72)
    this.pxToPt = 1 / (config.dpiScale * (96 / 72));
    this.ctm = identityCTM();
  }

  /**
   * Set the current shape context for trace attribution.
   *
   * Called by renderers via duck-typed detection:
   * ```ts
   * if ('setShapeContext' in rctx.backend) {
   *   (rctx.backend as TracingBackend).setShapeContext({ shapeId: '42', shapeName: 'Title' });
   * }
   * ```
   */
  setShapeContext(ctx: ShapeContext): void {
    this.shapeCtx = ctx;
  }

  /** Clear shape context (called after shape rendering completes). */
  clearShapeContext(): void {
    this.shapeCtx = {};
  }

  /**
   * Get the collected render trace.
   *
   * @param source - Source identifier (e.g., 'pptx:slide3')
   * @param slideWidthPt - Slide width in points
   * @param slideHeightPt - Slide height in points
   */
  getTrace(source: string, slideWidthPt: number, slideHeightPt: number): RenderTrace {
    return {
      events: this.events,
      slideWidthPt,
      slideHeightPt,
      source,
      timestamp: Date.now(),
      config: { ...this.config },
    };
  }

  /** Get the current number of trace events. */
  get eventCount(): number {
    return this.events.length;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Convert pixel coordinate to points using the current CTM. */
  private worldPt(localX: number, localY: number): [number, number] {
    const [wx, wy] = transformPointCTM(this.ctm, localX, localY);
    return [wx * this.pxToPt, wy * this.pxToPt];
  }

  /** Convert a pixel distance to points (scale-only, no translation). */
  private distPt(px: number): number {
    return px * this.pxToPt;
  }

  /** Get the current CTM as a tuple for trace events. */
  private ctmTuple(): CTM {
    return cloneCTM(this.ctm);
  }

  /** Resolve a style to a string for trace recording. */
  private styleStr(style: string | CanvasGradient | CanvasPattern): string {
    if (typeof style === 'string') return style;
    if (style && typeof style === 'object' && 'addColorStop' in style) return '[gradient]';
    return '[pattern]';
  }

  /** Reset path bounds tracking. */
  private resetPathBounds(): void {
    this.pathMinX = Infinity;
    this.pathMinY = Infinity;
    this.pathMaxX = -Infinity;
    this.pathMaxY = -Infinity;
  }

  /** Extend path bounds with a local-space point (transformed to world). */
  private extendPathBounds(x: number, y: number): void {
    const [wx, wy] = transformPointCTM(this.ctm, x, y);
    if (wx < this.pathMinX) this.pathMinX = wx;
    if (wy < this.pathMinY) this.pathMinY = wy;
    if (wx > this.pathMaxX) this.pathMaxX = wx;
    if (wy > this.pathMaxY) this.pathMaxY = wy;
  }

  /** Get path bounds in points (or undefined if no path points). */
  private getPathBoundsPt(): { x: number; y: number; width: number; height: number } | undefined {
    if (this.pathMinX === Infinity) return undefined;
    return {
      x: this.pathMinX * this.pxToPt,
      y: this.pathMinY * this.pxToPt,
      width: (this.pathMaxX - this.pathMinX) * this.pxToPt,
      height: (this.pathMaxY - this.pathMinY) * this.pxToPt,
    };
  }

  /** Parse font size from CSS font string (e.g., "bold 16px 'Arial'" → 16). */
  private parseFontSizePx(fontString: string): number {
    const match = fontString.match(/(\d+(?:\.\d+)?)\s*px/);
    return match ? parseFloat(match[1]) : 10;
  }

  // -------------------------------------------------------------------------
  // State management
  // -------------------------------------------------------------------------

  save(): void {
    this.ctmStack.push(cloneCTM(this.ctm));
    this.inner.save();
  }

  restore(): void {
    if (this.ctmStack.length > 0) {
      this.ctm = this.ctmStack.pop()!;
    }
    this.inner.restore();
  }

  // -------------------------------------------------------------------------
  // Transform operations (update shadow CTM + delegate)
  // -------------------------------------------------------------------------

  translate(x: number, y: number): void {
    this.ctm = multiplyCTM(this.ctm, [1, 0, 0, 1, x, y]);
    this.inner.translate(x, y);
  }

  scale(sx: number, sy: number): void {
    this.ctm = multiplyCTM(this.ctm, [sx, 0, 0, sy, 0, 0]);
    this.inner.scale(sx, sy);
  }

  rotate(radians: number): void {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    this.ctm = multiplyCTM(this.ctm, [cos, sin, -sin, cos, 0, 0]);
    this.inner.rotate(radians);
  }

  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.ctm = multiplyCTM(this.ctm, [a, b, c, d, e, f]);
    this.inner.transform(a, b, c, d, e, f);
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.ctm = [a, b, c, d, e, f];
    this.inner.setTransform(a, b, c, d, e, f);
  }

  // -------------------------------------------------------------------------
  // Path construction (track bounds + delegate)
  // -------------------------------------------------------------------------

  beginPath(): void {
    this.resetPathBounds();
    this.inner.beginPath();
  }

  moveTo(x: number, y: number): void {
    this.extendPathBounds(x, y);
    this.inner.moveTo(x, y);
  }

  lineTo(x: number, y: number): void {
    this.extendPathBounds(x, y);
    this.inner.lineTo(x, y);
  }

  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void {
    this.extendPathBounds(cp1x, cp1y);
    this.extendPathBounds(cp2x, cp2y);
    this.extendPathBounds(x, y);
    this.inner.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    this.extendPathBounds(cpx, cpy);
    this.extendPathBounds(x, y);
    this.inner.quadraticCurveTo(cpx, cpy, x, y);
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void {
    // Approximate arc bounds with bounding circle
    this.extendPathBounds(x - radius, y - radius);
    this.extendPathBounds(x + radius, y + radius);
    this.inner.arc(x, y, radius, startAngle, endAngle, counterclockwise);
  }

  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    this.extendPathBounds(x1, y1);
    this.extendPathBounds(x2, y2);
    this.inner.arcTo(x1, y1, x2, y2, radius);
  }

  ellipse(x: number, y: number, radiusX: number, radiusY: number, rot: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void {
    // Approximate with bounding box (ignoring rotation for bounds)
    this.extendPathBounds(x - radiusX, y - radiusY);
    this.extendPathBounds(x + radiusX, y + radiusY);
    this.inner.ellipse(x, y, radiusX, radiusY, rot, startAngle, endAngle, counterclockwise);
  }

  closePath(): void {
    this.inner.closePath();
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.extendPathBounds(x, y);
    this.extendPathBounds(x + w, y + h);
    this.inner.rect(x, y, w, h);
  }

  clip(pathOrFillRule?: Path2D | CanvasFillRule, fillRule?: CanvasFillRule): void {
    // Delegate with correct overload
    if (pathOrFillRule !== undefined && fillRule !== undefined) {
      this.inner.clip(pathOrFillRule as Path2D, fillRule);
    } else if (pathOrFillRule !== undefined) {
      (this.inner as RenderBackend).clip(pathOrFillRule as CanvasFillRule);
    } else {
      this.inner.clip();
    }
  }

  // -------------------------------------------------------------------------
  // Painting operations (record trace events + delegate)
  // -------------------------------------------------------------------------

  fill(pathOrFillRule?: Path2D | CanvasFillRule, fillRule?: CanvasFillRule): void {
    // Record shape trace event from accumulated path bounds
    const bounds = this.getPathBoundsPt();
    if (bounds) {
      const evt: ShapeTraceEvent = {
        kind: 'shape',
        operation: 'fill',
        ...bounds,
        fill: this.styleStr(this._fillStyle),
        ctm: this.ctmTuple(),
        shapeId: this.shapeCtx.shapeId,
        shapeName: this.shapeCtx.shapeName,
      };
      this.events.push(evt);
    }

    // Delegate
    if (pathOrFillRule !== undefined && fillRule !== undefined) {
      this.inner.fill(pathOrFillRule as Path2D, fillRule);
    } else if (pathOrFillRule !== undefined) {
      (this.inner as RenderBackend).fill(pathOrFillRule as CanvasFillRule);
    } else {
      this.inner.fill();
    }
  }

  stroke(path?: Path2D): void {
    const bounds = this.getPathBoundsPt();
    if (bounds) {
      const evt: ShapeTraceEvent = {
        kind: 'shape',
        operation: 'stroke',
        ...bounds,
        stroke: this.styleStr(this._strokeStyle),
        lineWidth: this.distPt(this._lineWidth),
        ctm: this.ctmTuple(),
        shapeId: this.shapeCtx.shapeId,
        shapeName: this.shapeCtx.shapeName,
      };
      this.events.push(evt);
    }

    if (path !== undefined) {
      this.inner.stroke(path);
    } else {
      this.inner.stroke();
    }
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const [wx, wy] = this.worldPt(x, y);
    const [wx2, wy2] = this.worldPt(x + w, y + h);
    const evt: ShapeTraceEvent = {
      kind: 'shape',
      operation: 'fillRect',
      x: Math.min(wx, wx2),
      y: Math.min(wy, wy2),
      width: Math.abs(wx2 - wx),
      height: Math.abs(wy2 - wy),
      fill: this.styleStr(this._fillStyle),
      ctm: this.ctmTuple(),
      shapeId: this.shapeCtx.shapeId,
      shapeName: this.shapeCtx.shapeName,
    };
    this.events.push(evt);
    this.inner.fillRect(x, y, w, h);
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    const [wx, wy] = this.worldPt(x, y);
    const [wx2, wy2] = this.worldPt(x + w, y + h);
    const evt: ShapeTraceEvent = {
      kind: 'shape',
      operation: 'strokeRect',
      x: Math.min(wx, wx2),
      y: Math.min(wy, wy2),
      width: Math.abs(wx2 - wx),
      height: Math.abs(wy2 - wy),
      stroke: this.styleStr(this._strokeStyle),
      lineWidth: this.distPt(this._lineWidth),
      ctm: this.ctmTuple(),
      shapeId: this.shapeCtx.shapeId,
      shapeName: this.shapeCtx.shapeName,
    };
    this.events.push(evt);
    this.inner.strokeRect(x, y, w, h);
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    this.inner.clearRect(x, y, w, h);
  }

  // -------------------------------------------------------------------------
  // Style properties (shadow track + delegate)
  // -------------------------------------------------------------------------

  get fillStyle(): string | CanvasGradient | CanvasPattern {
    return this.inner.fillStyle;
  }
  set fillStyle(value: string | CanvasGradient | CanvasPattern) {
    this._fillStyle = value;
    this.inner.fillStyle = value;
  }

  get strokeStyle(): string | CanvasGradient | CanvasPattern {
    return this.inner.strokeStyle;
  }
  set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
    this._strokeStyle = value;
    this.inner.strokeStyle = value;
  }

  get lineWidth(): number {
    return this.inner.lineWidth;
  }
  set lineWidth(value: number) {
    this._lineWidth = value;
    this.inner.lineWidth = value;
  }

  get lineCap(): CanvasLineCap {
    return this.inner.lineCap;
  }
  set lineCap(value: CanvasLineCap) {
    this.inner.lineCap = value;
  }

  get lineJoin(): CanvasLineJoin {
    return this.inner.lineJoin;
  }
  set lineJoin(value: CanvasLineJoin) {
    this.inner.lineJoin = value;
  }

  get miterLimit(): number {
    return this.inner.miterLimit;
  }
  set miterLimit(value: number) {
    this.inner.miterLimit = value;
  }

  get globalAlpha(): number {
    return this.inner.globalAlpha;
  }
  set globalAlpha(value: number) {
    this.inner.globalAlpha = value;
  }

  get globalCompositeOperation(): GlobalCompositeOperation {
    return this.inner.globalCompositeOperation;
  }
  set globalCompositeOperation(value: GlobalCompositeOperation) {
    this.inner.globalCompositeOperation = value;
  }

  setLineDash(segments: number[]): void {
    this.inner.setLineDash(segments);
  }

  getLineDash(): number[] {
    return this.inner.getLineDash();
  }

  get lineDashOffset(): number {
    return this.inner.lineDashOffset;
  }
  set lineDashOffset(value: number) {
    this.inner.lineDashOffset = value;
  }

  // -------------------------------------------------------------------------
  // Shadow properties (pure delegation)
  // -------------------------------------------------------------------------

  get shadowColor(): string {
    return this.inner.shadowColor;
  }
  set shadowColor(value: string) {
    this.inner.shadowColor = value;
  }

  get shadowBlur(): number {
    return this.inner.shadowBlur;
  }
  set shadowBlur(value: number) {
    this.inner.shadowBlur = value;
  }

  get shadowOffsetX(): number {
    return this.inner.shadowOffsetX;
  }
  set shadowOffsetX(value: number) {
    this.inner.shadowOffsetX = value;
  }

  get shadowOffsetY(): number {
    return this.inner.shadowOffsetY;
  }
  set shadowOffsetY(value: number) {
    this.inner.shadowOffsetY = value;
  }

  // -------------------------------------------------------------------------
  // Text properties and operations
  // -------------------------------------------------------------------------

  get font(): string {
    return this.inner.font;
  }
  set font(value: string) {
    this._font = value;
    this.inner.font = value;
  }

  get textAlign(): CanvasTextAlign {
    return this.inner.textAlign;
  }
  set textAlign(value: CanvasTextAlign) {
    this.inner.textAlign = value;
  }

  get textBaseline(): CanvasTextBaseline {
    return this.inner.textBaseline;
  }
  set textBaseline(value: CanvasTextBaseline) {
    this.inner.textBaseline = value;
  }

  get direction(): CanvasDirection {
    return this.inner.direction;
  }
  set direction(value: CanvasDirection) {
    this.inner.direction = value;
  }

  get letterSpacing(): string {
    return this.inner.letterSpacing;
  }
  set letterSpacing(value: string) {
    this.inner.letterSpacing = value;
  }

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    // Measure width before drawing
    const metrics = this.inner.measureText(text);
    const widthPx = metrics.width;
    const fontSizePx = this.parseFontSizePx(this._font);

    // Transform to world-space points
    const [wx, wy] = this.worldPt(x, y);

    const evt: TextTraceEvent = {
      kind: 'text',
      text,
      x: wx,
      y: wy,
      width: this.distPt(widthPx),
      fontSizePt: this.distPt(fontSizePx),
      fontString: this._font,
      fillStyle: this.styleStr(this._fillStyle),
      ctm: this.ctmTuple(),
      shapeId: this.shapeCtx.shapeId,
      shapeName: this.shapeCtx.shapeName,
      paragraphIndex: this.shapeCtx.paragraphIndex,
      runIndex: this.shapeCtx.runIndex,
    };

    // Optional per-character advance widths
    if (this.config.glyphLevel && text.length > 0) {
      const advances: number[] = [];
      for (let i = 0; i < text.length; i++) {
        const charMetrics = this.inner.measureText(text[i]);
        advances.push(this.distPt(charMetrics.width));
      }
      evt.charAdvances = advances;
    }

    this.events.push(evt);

    // Delegate to inner backend
    if (maxWidth !== undefined) {
      this.inner.fillText(text, x, y, maxWidth);
    } else {
      this.inner.fillText(text, x, y);
    }
  }

  strokeText(text: string, x: number, y: number, maxWidth?: number): void {
    const metrics = this.inner.measureText(text);
    const widthPx = metrics.width;
    const fontSizePx = this.parseFontSizePx(this._font);
    const [wx, wy] = this.worldPt(x, y);

    const evt: StrokeTextTraceEvent = {
      kind: 'strokeText',
      text,
      x: wx,
      y: wy,
      width: this.distPt(widthPx),
      fontSizePt: this.distPt(fontSizePx),
      fontString: this._font,
      strokeStyle: this.styleStr(this._strokeStyle),
      lineWidth: this.distPt(this._lineWidth),
      ctm: this.ctmTuple(),
      shapeId: this.shapeCtx.shapeId,
      shapeName: this.shapeCtx.shapeName,
      paragraphIndex: this.shapeCtx.paragraphIndex,
      runIndex: this.shapeCtx.runIndex,
    };

    this.events.push(evt);

    if (maxWidth !== undefined) {
      this.inner.strokeText(text, x, y, maxWidth);
    } else {
      this.inner.strokeText(text, x, y);
    }
  }

  measureText(text: string): TextMetrics {
    return this.inner.measureText(text);
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
    // Extract destination bounds for trace event
    let destX: number, destY: number, destW: number, destH: number;

    if (dx !== undefined && dy !== undefined && dw !== undefined && dh !== undefined) {
      // 9-arg form
      destX = dx;
      destY = dy;
      destW = dw;
      destH = dh;
    } else if (swOrDw !== undefined && shOrDh !== undefined) {
      // 5-arg form
      destX = sxOrDx;
      destY = syOrDy;
      destW = swOrDw;
      destH = shOrDh;
    } else {
      // 3-arg form — need image dimensions
      destX = sxOrDx;
      destY = syOrDy;
      destW = (image as HTMLImageElement).width ?? 0;
      destH = (image as HTMLImageElement).height ?? 0;
    }

    const [wx, wy] = this.worldPt(destX, destY);
    const [wx2, wy2] = this.worldPt(destX + destW, destY + destH);

    const evt: ImageTraceEvent = {
      kind: 'image',
      x: Math.min(wx, wx2),
      y: Math.min(wy, wy2),
      width: Math.abs(wx2 - wx),
      height: Math.abs(wy2 - wy),
      ctm: this.ctmTuple(),
      shapeId: this.shapeCtx.shapeId,
      shapeName: this.shapeCtx.shapeName,
    };
    this.events.push(evt);

    // Delegate
    if (dx !== undefined && dy !== undefined && dw !== undefined && dh !== undefined) {
      this.inner.drawImage(image, sxOrDx, syOrDy, swOrDw!, shOrDh!, dx, dy, dw, dh);
    } else if (swOrDw !== undefined && shOrDh !== undefined) {
      this.inner.drawImage(image, sxOrDx, syOrDy, swOrDw, shOrDh);
    } else {
      this.inner.drawImage(image, sxOrDx, syOrDy);
    }
  }

  // -------------------------------------------------------------------------
  // Gradient and pattern factories (pure delegation)
  // -------------------------------------------------------------------------

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient {
    return this.inner.createLinearGradient(x0, y0, x1, y1);
  }

  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient {
    return this.inner.createRadialGradient(x0, y0, r0, x1, y1, r1);
  }

  createPattern(image: CanvasImageSource, repetition: string | null): CanvasPattern | null {
    return this.inner.createPattern(image, repetition);
  }
}
