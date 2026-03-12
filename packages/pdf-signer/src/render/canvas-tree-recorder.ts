/**
 * CanvasTreeRecorder — captures Canvas2D rendering operations as structured
 * TraceEvent objects (same format as PPTX TracingBackend).
 *
 * Designed to be plugged into NativeCanvasGraphics via an optional recorder
 * field. When present, each rendering method emits a trace event alongside
 * its canvas call. The resulting RenderTrace can be fed directly into
 * traceToElements() → matchElements() → generateDiffReport() for structural
 * comparison against ground truth or PPTX traces.
 *
 * Coordinate system:
 *   Records world-space coordinates in PDF points (1/72 inch).
 *   Maintains a shadow CTM (current transformation matrix) stack that
 *   mirrors the canvas transform state, enabling position extraction
 *   without reading back from the canvas.
 *
 * @see packages/core/src/drawingml/renderer/tracing-backend.ts — PPTX equivalent
 * @see packages/core/src/drawingml/renderer/trace-types.ts — shared TraceEvent types
 * @see docs/plans/CANVAS_TREE_PLAN.md — design doc
 */

// ---------------------------------------------------------------------------
// Trace types — structurally identical to @opendockit/core trace-types.ts.
// Defined locally to avoid cross-package imports (pdf-signer is standalone).
// The traceToElements() pipeline in @opendockit/elements accepts these via
// structural typing (TypeScript duck typing) — no runtime dependency needed.
// ---------------------------------------------------------------------------

type Matrix6Tuple = [number, number, number, number, number, number];

export interface TextTraceEvent {
  kind: 'text';
  text: string;
  x: number;
  y: number;
  width: number;
  fontSizePt: number;
  fontString: string;
  fillStyle: string;
  ctm: Matrix6Tuple;
  charAdvances?: number[];
  /** Font ascent as a ratio of fontSize (0–1). From PDF FontDescriptor /Ascent. */
  ascentRatio?: number;
  shapeId?: string;
  shapeName?: string;
  paragraphIndex?: number;
  runIndex?: number;
}

export interface StrokeTextTraceEvent {
  kind: 'strokeText';
  text: string;
  x: number;
  y: number;
  width: number;
  fontSizePt: number;
  fontString: string;
  strokeStyle: string;
  lineWidth: number;
  ctm: Matrix6Tuple;
  shapeId?: string;
  shapeName?: string;
  paragraphIndex?: number;
  runIndex?: number;
}

export interface ShapeTraceEvent {
  kind: 'shape';
  operation: 'fill' | 'stroke' | 'fillRect' | 'strokeRect';
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  ctm: Matrix6Tuple;
  shapeId?: string;
  shapeName?: string;
}

export interface ImageTraceEvent {
  kind: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  ctm: Matrix6Tuple;
  shapeId?: string;
  shapeName?: string;
}

export type TraceEvent =
  | TextTraceEvent
  | StrokeTextTraceEvent
  | ShapeTraceEvent
  | ImageTraceEvent;

export interface TraceConfig {
  glyphLevel: boolean;
  dpiScale: number;
}

export interface RenderTrace {
  events: TraceEvent[];
  slideWidthPt: number;
  slideHeightPt: number;
  source: string;
  timestamp: number;
  config: TraceConfig;
}

// Matrix math — shared util
import {
  multiplyMatrices as _multiplyMatrices,
  transformPoint as _transformPoint,
} from '../util/matrix-ops.js';

const IDENTITY: Matrix6 = [1, 0, 0, 1, 0, 0];

type Matrix6 = [number, number, number, number, number, number];

/** Wrapper that casts the shared util's return to Matrix6 tuple. */
function multiplyMatrices(m1: number[], m2: Matrix6): Matrix6 {
  return _multiplyMatrices(m1, m2) as Matrix6;
}

/** Wrapper that casts the shared util's return to [number, number] tuple. */
function transformPoint(m: Matrix6, x: number, y: number): [number, number] {
  return _transformPoint(m, x, y);
}

// ---------------------------------------------------------------------------
// CanvasTreeRecorder
// ---------------------------------------------------------------------------

export class CanvasTreeRecorder {
  /** Accumulated trace events, in render order. */
  readonly events: TraceEvent[] = [];

  /**
   * Shadow CTM stack — mirrors the canvas transform state.
   * This is the viewport transform composed with all ctx.transform() calls.
   * We track it ourselves so we can extract world-space coordinates
   * without reading back from the canvas (which isn't always possible).
   */
  private ctmStack: Matrix6[] = [];
  private ctm: Matrix6 = IDENTITY.slice() as Matrix6;

  /** Page dimensions in points (for RenderTrace output). */
  private pageWidthPt: number;
  private pageHeightPt: number;

  constructor(pageWidthPt: number, pageHeightPt: number) {
    this.pageWidthPt = pageWidthPt;
    this.pageHeightPt = pageHeightPt;
  }

  // ---- State management ----

  /** Mirror canvas save() — push CTM onto stack. */
  pushState(): void {
    this.ctmStack.push(this.ctm.slice() as Matrix6);
  }

  /** Mirror canvas restore() — pop CTM from stack. */
  popState(): void {
    const prev = this.ctmStack.pop();
    if (prev) this.ctm = prev;
  }

  /** Mirror canvas transform(a,b,c,d,e,f) — compose with current CTM. */
  applyTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.ctm = multiplyMatrices([a, b, c, d, e, f], this.ctm);
  }

  /** Set CTM directly (used when viewport transform is applied). */
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.ctm = [a, b, c, d, e, f];
  }

  /** Get current CTM (for external inspection/testing). */
  getCurrentCTM(): Matrix6 {
    return this.ctm.slice() as Matrix6;
  }

  // ---- Text recording ----

  /**
   * Record a text glyph rendered via fillText().
   *
   * Called from NativeCanvasGraphics.renderGlyph() with the glyph's
   * position in text space (after text matrix application).
   *
   * @param text - The glyph string (usually single character)
   * @param x - X position in current coordinate space (text matrix applied)
   * @param y - Y position in current coordinate space
   * @param fontSize - Effective font size in points
   * @param fontString - CSS font string (e.g. "normal normal 12px Helvetica")
   * @param fillStyle - CSS color string
   * @param glyphWidth - Advance width of this glyph in points
   * @param textMatrix - The text matrix [a,b,c,d,tx,ty] at render time
   */
  recordText(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    fontString: string,
    fillStyle: string,
    glyphWidth: number,
    _textMatrix: number[],
    ascentRatio?: number,
  ): void {
    // The text position in user space is (x, y) which already has
    // textMatrix translation applied. We need to transform through the CTM
    // to get world-space coordinates.
    const [wx, wy] = transformPoint(this.ctm, x, y);

    const event: TextTraceEvent = {
      kind: 'text',
      text,
      x: wx,
      y: wy,
      width: Math.abs(glyphWidth * this.ctm[0]), // scale width by CTM x-scale
      fontSizePt: Math.abs(fontSize),
      fontString,
      fillStyle: typeof fillStyle === 'string' ? fillStyle : 'pattern',
      ctm: this.ctm.slice() as Matrix6,
      ascentRatio,
    };

    this.events.push(event);
  }

  /**
   * Record a text glyph rendered via strokeText().
   */
  recordStrokeText(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    fontString: string,
    strokeStyle: string,
    lineWidth: number,
    _textMatrix: number[],
  ): void {
    const [wx, wy] = transformPoint(this.ctm, x, y);

    const event: StrokeTextTraceEvent = {
      kind: 'strokeText',
      text,
      x: wx,
      y: wy,
      width: Math.abs(fontSize * this.ctm[0]),
      fontSizePt: Math.abs(fontSize),
      fontString,
      strokeStyle: typeof strokeStyle === 'string' ? strokeStyle : 'pattern',
      lineWidth,
      ctm: this.ctm.slice() as Matrix6,
    };

    this.events.push(event);
  }

  // ---- Shape recording ----

  /**
   * Record a path fill/stroke operation.
   *
   * For complex paths, we record the bounding box in world space.
   * The bounds should be computed from the path in user space, then
   * transformed by the CTM.
   */
  recordShape(
    operation: 'fill' | 'stroke' | 'fillStroke',
    boundsX: number,
    boundsY: number,
    boundsW: number,
    boundsH: number,
    fill?: string,
    stroke?: string,
    lineWidth?: number,
  ): void {
    // Transform bounding box corners to world space and compute enclosing rect
    const [x0, y0] = transformPoint(this.ctm, boundsX, boundsY);
    const [x1, y1] = transformPoint(this.ctm, boundsX + boundsW, boundsY + boundsH);

    const wx = Math.min(x0, x1);
    const wy = Math.min(y0, y1);
    const ww = Math.abs(x1 - x0);
    const wh = Math.abs(y1 - y0);

    const event: ShapeTraceEvent = {
      kind: 'shape',
      operation: operation === 'fillStroke' ? 'fill' : operation,
      x: wx,
      y: wy,
      width: ww,
      height: wh,
      fill: fill && typeof fill === 'string' ? fill : undefined,
      stroke: stroke && typeof stroke === 'string' ? stroke : undefined,
      lineWidth,
      ctm: this.ctm.slice() as Matrix6,
    };

    this.events.push(event);
  }

  /**
   * Record a rectangle fill/stroke (more precise than path bounds).
   */
  recordRect(
    operation: 'fill' | 'stroke' | 'fillRect' | 'strokeRect',
    x: number,
    y: number,
    w: number,
    h: number,
    fill?: string,
    stroke?: string,
    lineWidth?: number,
  ): void {
    const [x0, y0] = transformPoint(this.ctm, x, y);
    const [x1, y1] = transformPoint(this.ctm, x + w, y + h);

    const event: ShapeTraceEvent = {
      kind: 'shape',
      operation: operation as ShapeTraceEvent['operation'],
      x: Math.min(x0, x1),
      y: Math.min(y0, y1),
      width: Math.abs(x1 - x0),
      height: Math.abs(y1 - y0),
      fill: fill && typeof fill === 'string' ? fill : undefined,
      stroke: stroke && typeof stroke === 'string' ? stroke : undefined,
      lineWidth,
      ctm: this.ctm.slice() as Matrix6,
    };

    this.events.push(event);
  }

  // ---- Image recording ----

  /**
   * Record an image draw operation.
   *
   * PDF images are drawn in a 1×1 unit square that the CTM scales.
   * The actual world-space position and size come from the CTM.
   */
  recordImage(_imageRef?: string): void {
    // PDF images are rendered into a 1×1 unit square.
    // The CTM determines the actual position and size.
    const [x0, y0] = transformPoint(this.ctm, 0, 0);
    const [x1, y1] = transformPoint(this.ctm, 1, 1);

    const event: ImageTraceEvent = {
      kind: 'image',
      x: Math.min(x0, x1),
      y: Math.min(y0, y1),
      width: Math.abs(x1 - x0),
      height: Math.abs(y1 - y0),
      ctm: this.ctm.slice() as Matrix6,
    };

    this.events.push(event);
  }

  // ---- Output ----

  /**
   * Build a RenderTrace from accumulated events.
   *
   * Compatible with traceToElements() from @opendockit/elements.
   */
  getTrace(source: string): RenderTrace {
    return {
      events: this.events,
      slideWidthPt: this.pageWidthPt,
      slideHeightPt: this.pageHeightPt,
      source,
      timestamp: Date.now(),
      config: {
        glyphLevel: false,
        dpiScale: 1,
      },
    };
  }

  /** Reset all recorded events (for reuse across pages). */
  reset(pageWidthPt?: number, pageHeightPt?: number): void {
    this.events.length = 0;
    this.ctmStack.length = 0;
    this.ctm = IDENTITY.slice() as Matrix6;
    if (pageWidthPt !== undefined) this.pageWidthPt = pageWidthPt;
    if (pageHeightPt !== undefined) this.pageHeightPt = pageHeightPt;
  }
}
