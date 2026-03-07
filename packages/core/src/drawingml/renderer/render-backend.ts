/**
 * RenderBackend — abstract rendering interface for DrawingML renderers.
 *
 * This interface mirrors the Canvas2D API surface used by all existing
 * renderers (shape, fill, line, text, effect, picture, group, table,
 * connector). It is designed as a 1:1 mapping so that replacing
 * `ctx.method()` with `backend.method()` produces ZERO behavior change.
 *
 * A future PDFBackend will implement this interface to emit PDF drawing
 * commands instead of Canvas2D calls, enabling server-side PDF export
 * from the same renderer code.
 *
 * Canvas2D-native types (CanvasGradient, CanvasPattern, Path2D, TextMetrics,
 * CanvasImageSource) are used directly since that is what the renderers
 * currently produce and consume. The PDFBackend will need adapter types
 * for these; that is a Wave 1+ concern.
 *
 * @module render-backend
 */

// ---------------------------------------------------------------------------
// RenderBackend interface
// ---------------------------------------------------------------------------

/**
 * Abstract rendering backend that mirrors the Canvas2D API surface.
 *
 * Every method and property corresponds to a CanvasRenderingContext2D member
 * that is used by at least one existing renderer. The interface is intentionally
 * large because the goal is zero-effort migration: existing `ctx.foo()` calls
 * become `backend.foo()` with identical semantics.
 *
 * Property-style access (e.g. `backend.fillStyle = 'red'`) is preserved via
 * getter/setter pairs so that existing code patterns work unchanged.
 */
export interface RenderBackend {
  // -------------------------------------------------------------------------
  // State management
  // -------------------------------------------------------------------------

  /** Push the current drawing state onto the state stack. */
  save(): void;

  /** Pop the most recently saved drawing state from the stack. */
  restore(): void;

  // -------------------------------------------------------------------------
  // Transform operations
  // -------------------------------------------------------------------------

  /** Translate the current transform origin. */
  translate(x: number, y: number): void;

  /** Scale the current transform. */
  scale(sx: number, sy: number): void;

  /** Rotate the current transform by the given angle in radians. */
  rotate(radians: number): void;

  /** Multiply the current transform by the given matrix components. */
  transform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number
  ): void;

  /** Replace the current transform with the given matrix components. */
  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number
  ): void;

  // -------------------------------------------------------------------------
  // Path construction
  // -------------------------------------------------------------------------

  /** Begin a new sub-path. */
  beginPath(): void;

  /** Move the current point to (x, y) without drawing. */
  moveTo(x: number, y: number): void;

  /** Draw a straight line from the current point to (x, y). */
  lineTo(x: number, y: number): void;

  /** Draw a cubic bezier curve. */
  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number
  ): void;

  /** Draw a quadratic bezier curve. */
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;

  /** Draw a circular arc. */
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean
  ): void;

  /** Draw a circular arc using tangent control points. */
  arcTo(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    radius: number
  ): void;

  /** Draw an elliptical arc. */
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean
  ): void;

  /** Close the current sub-path by drawing a line to the start. */
  closePath(): void;

  /** Add a rectangle to the current path. */
  rect(x: number, y: number, w: number, h: number): void;

  /** Clip to the current path. */
  clip(fillRule?: CanvasFillRule): void;
  /** Clip to the given Path2D. */
  clip(path: Path2D, fillRule?: CanvasFillRule): void;

  // -------------------------------------------------------------------------
  // Painting operations
  // -------------------------------------------------------------------------

  /** Fill the current path. */
  fill(fillRule?: CanvasFillRule): void;
  /** Fill the given Path2D. */
  fill(path: Path2D, fillRule?: CanvasFillRule): void;

  /** Stroke the current path. */
  stroke(): void;
  /** Stroke the given Path2D. */
  stroke(path: Path2D): void;

  /** Fill the given rectangle. */
  fillRect(x: number, y: number, w: number, h: number): void;

  /** Stroke the given rectangle. */
  strokeRect(x: number, y: number, w: number, h: number): void;

  /** Clear the given rectangle to transparent black. */
  clearRect(x: number, y: number, w: number, h: number): void;

  // -------------------------------------------------------------------------
  // Style properties
  // -------------------------------------------------------------------------

  /** Get the current fill style. */
  get fillStyle(): string | CanvasGradient | CanvasPattern;
  /** Set the current fill style. */
  set fillStyle(value: string | CanvasGradient | CanvasPattern);

  /** Get the current stroke style. */
  get strokeStyle(): string | CanvasGradient | CanvasPattern;
  /** Set the current stroke style. */
  set strokeStyle(value: string | CanvasGradient | CanvasPattern);

  /** Get the current line width. */
  get lineWidth(): number;
  /** Set the current line width. */
  set lineWidth(value: number);

  /** Get the current line cap style. */
  get lineCap(): CanvasLineCap;
  /** Set the current line cap style. */
  set lineCap(value: CanvasLineCap);

  /** Get the current line join style. */
  get lineJoin(): CanvasLineJoin;
  /** Set the current line join style. */
  set lineJoin(value: CanvasLineJoin);

  /** Get the current miter limit. */
  get miterLimit(): number;
  /** Set the current miter limit. */
  set miterLimit(value: number);

  /** Get the current global alpha. */
  get globalAlpha(): number;
  /** Set the current global alpha. */
  set globalAlpha(value: number);

  /** Get the current global composite operation. */
  get globalCompositeOperation(): GlobalCompositeOperation;
  /** Set the current global composite operation. */
  set globalCompositeOperation(value: GlobalCompositeOperation);

  /** Set the line dash pattern. */
  setLineDash(segments: number[]): void;

  /** Get the line dash pattern. */
  getLineDash(): number[];

  /** Get the line dash offset. */
  get lineDashOffset(): number;
  /** Set the line dash offset. */
  set lineDashOffset(value: number);

  // -------------------------------------------------------------------------
  // Shadow properties
  // -------------------------------------------------------------------------

  /** Get the shadow color. */
  get shadowColor(): string;
  /** Set the shadow color. */
  set shadowColor(value: string);

  /** Get the shadow blur radius. */
  get shadowBlur(): number;
  /** Set the shadow blur radius. */
  set shadowBlur(value: number);

  /** Get the shadow X offset. */
  get shadowOffsetX(): number;
  /** Set the shadow X offset. */
  set shadowOffsetX(value: number);

  /** Get the shadow Y offset. */
  get shadowOffsetY(): number;
  /** Set the shadow Y offset. */
  set shadowOffsetY(value: number);

  // -------------------------------------------------------------------------
  // Text properties and operations
  // -------------------------------------------------------------------------

  /** Get the current font string. */
  get font(): string;
  /** Set the current font string. */
  set font(value: string);

  /** Get the current text alignment. */
  get textAlign(): CanvasTextAlign;
  /** Set the current text alignment. */
  set textAlign(value: CanvasTextAlign);

  /** Get the current text baseline. */
  get textBaseline(): CanvasTextBaseline;
  /** Set the current text baseline. */
  set textBaseline(value: CanvasTextBaseline);

  /** Get the current text direction. */
  get direction(): CanvasDirection;
  /** Set the current text direction. */
  set direction(value: CanvasDirection);

  /**
   * Get the current letter spacing.
   *
   * Note: letterSpacing is a newer Canvas2D property and may not be available
   * in all environments. Renderers duck-type check for it via `'letterSpacing' in ctx`.
   */
  get letterSpacing(): string;
  /** Set the current letter spacing. */
  set letterSpacing(value: string);

  /** Fill text at the given position. */
  fillText(text: string, x: number, y: number, maxWidth?: number): void;

  /** Stroke text at the given position. */
  strokeText(text: string, x: number, y: number, maxWidth?: number): void;

  /** Measure the given text string and return metrics. */
  measureText(text: string): TextMetrics;

  // -------------------------------------------------------------------------
  // Image operations
  // -------------------------------------------------------------------------

  /** Draw an image at the given position. */
  drawImage(image: CanvasImageSource, dx: number, dy: number): void;
  /** Draw an image scaled to the given dimensions. */
  drawImage(
    image: CanvasImageSource,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void;
  /** Draw a sub-rectangle of an image scaled to the given dimensions. */
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void;

  // -------------------------------------------------------------------------
  // Gradient and pattern factories
  // -------------------------------------------------------------------------

  /** Create a linear gradient object. */
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): CanvasGradient;

  /** Create a radial gradient object. */
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): CanvasGradient;

  /** Create a pattern from an image source. */
  createPattern(
    image: CanvasImageSource,
    repetition: string | null
  ): CanvasPattern | null;
}
