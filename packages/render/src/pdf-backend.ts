/**
 * PDFBackend — PDF content stream implementation of the RenderBackend interface.
 *
 * Translates Canvas2D-style drawing calls into PDF content stream operators.
 * This enables the same renderer code that targets Canvas2D (via CanvasBackend)
 * to emit PDF drawing commands for server-side PDF export.
 *
 * Design decisions:
 * - Accumulates PDF operators as strings internally (no dependency on
 *   ContentStreamBuilder — the caller extracts operators via toString()/toBytes())
 * - Applies a Y-flip transform at construction so all coordinates use top-left
 *   origin (matching Canvas2D / what the renderers expect), while the underlying
 *   PDF uses bottom-left origin
 * - Tracks graphics state locally (fillStyle, strokeStyle, lineWidth, etc.)
 *   and emits PDF operators on state change
 * - Gradients return a proxy object; only the first color stop is used for now
 * - Text and image operations emit placeholder operators; full font embedding
 *   and image XObject support are deferred to Wave 3
 * - Font registry: callers can register fonts via registerFont() for proper
 *   PDF text rendering with correct encoding and width measurement
 *
 * @module pdf-backend
 */

// ---------------------------------------------------------------------------
// Number formatting — matches pdf-lib / pdf-signer's formatNumber exactly
// ---------------------------------------------------------------------------

function formatNumber(num: number): string {
  if (Number.isInteger(num) && Math.abs(num) < 1e15) {
    return String(num);
  }

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
}

const n = formatNumber;

// ---------------------------------------------------------------------------
// CSS color parsing
// ---------------------------------------------------------------------------

interface ParsedColor {
  r: number; // 0-1
  g: number; // 0-1
  b: number; // 0-1
  a: number; // 0-1
}

const COLOR_CACHE = new Map<string, ParsedColor>();

/**
 * Parse a CSS color string to normalized RGB(A) components (0-1 range).
 *
 * Supports:
 * - Hex: #RGB, #RRGGBB, #RRGGBBAA
 * - Named colors (common subset)
 * - rgb(r, g, b) / rgba(r, g, b, a)
 *
 * Returns black (0,0,0,1) for unparseable values.
 */
export function parseCssColor(color: string): ParsedColor {
  const cached = COLOR_CACHE.get(color);
  if (cached) return cached;

  const result = parseCssColorUncached(color);
  COLOR_CACHE.set(color, result);
  return result;
}

function parseCssColorUncached(color: string): ParsedColor {
  const c = color.trim().toLowerCase();

  // Named colors (common subset used in Canvas2D)
  const named = NAMED_COLORS[c];
  if (named) return named;

  // Hex
  if (c.startsWith('#')) {
    return parseHex(c);
  }

  // rgb() / rgba()
  const rgbaMatch = c.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d+(?:\.\d+)?))?\s*\)$/
  );
  if (rgbaMatch) {
    return {
      r: parseFloat(rgbaMatch[1]) / 255,
      g: parseFloat(rgbaMatch[2]) / 255,
      b: parseFloat(rgbaMatch[3]) / 255,
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
    };
  }

  // Default: black
  return { r: 0, g: 0, b: 0, a: 1 };
}

function parseHex(hex: string): ParsedColor {
  const h = hex.slice(1);
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16) / 255,
      g: parseInt(h[1] + h[1], 16) / 255,
      b: parseInt(h[2] + h[2], 16) / 255,
      a: 1,
    };
  }
  if (h.length === 4) {
    return {
      r: parseInt(h[0] + h[0], 16) / 255,
      g: parseInt(h[1] + h[1], 16) / 255,
      b: parseInt(h[2] + h[2], 16) / 255,
      a: parseInt(h[3] + h[3], 16) / 255,
    };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.substring(0, 2), 16) / 255,
      g: parseInt(h.substring(2, 4), 16) / 255,
      b: parseInt(h.substring(4, 6), 16) / 255,
      a: 1,
    };
  }
  if (h.length === 8) {
    return {
      r: parseInt(h.substring(0, 2), 16) / 255,
      g: parseInt(h.substring(2, 4), 16) / 255,
      b: parseInt(h.substring(4, 6), 16) / 255,
      a: parseInt(h.substring(6, 8), 16) / 255,
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

const NAMED_COLORS: Record<string, ParsedColor> = {
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 1, g: 1, b: 1, a: 1 },
  red: { r: 1, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 128 / 255, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 1, a: 1 },
  yellow: { r: 1, g: 1, b: 0, a: 1 },
  cyan: { r: 0, g: 1, b: 1, a: 1 },
  magenta: { r: 1, g: 0, b: 1, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  orange: { r: 1, g: 165 / 255, b: 0, a: 1 },
  gray: { r: 128 / 255, g: 128 / 255, b: 128 / 255, a: 1 },
  grey: { r: 128 / 255, g: 128 / 255, b: 128 / 255, a: 1 },
};

// ---------------------------------------------------------------------------
// PDF Graphics State
// ---------------------------------------------------------------------------

interface PDFGraphicsState {
  fillStyle: string | PDFGradient | null;
  strokeStyle: string | PDFGradient | null;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  miterLimit: number;
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
  lineDash: number[];
  lineDashOffset: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  direction: CanvasDirection;
  letterSpacing: string;
}

function createDefaultState(): PDFGraphicsState {
  return {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineDash: [],
    lineDashOffset: 0,
    shadowColor: 'rgba(0, 0, 0, 0)',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    direction: 'ltr',
    letterSpacing: '0px',
  };
}

function cloneState(state: PDFGraphicsState): PDFGraphicsState {
  return {
    ...state,
    lineDash: [...state.lineDash],
  };
}

// ---------------------------------------------------------------------------
// PDF Gradient proxy (records stops, emits first-stop approximation)
// ---------------------------------------------------------------------------

/** Gradient color stop. */
interface GradientStop {
  offset: number;
  color: string;
}

/**
 * PDFGradient — proxy object returned by createLinearGradient / createRadialGradient.
 *
 * Records color stops. When assigned to fillStyle/strokeStyle, the PDFBackend
 * uses the first color stop as an approximation (full PDF shading patterns
 * are a Wave 3 enhancement).
 */
export class PDFGradient {
  readonly stops: GradientStop[] = [];
  readonly type: 'linear' | 'radial';
  readonly params: number[];

  constructor(type: 'linear' | 'radial', params: number[]) {
    this.type = type;
    this.params = params;
  }

  addColorStop(offset: number, color: string): void {
    this.stops.push({ offset, color });
    this.stops.sort((a, b) => a.offset - b.offset);
  }

  /** Get the first stop color for approximation, or black. */
  getApproximateColor(): string {
    return this.stops.length > 0 ? this.stops[0].color : '#000000';
  }
}

// ---------------------------------------------------------------------------
// PDFTextMetrics — minimal TextMetrics implementation for PDF
// ---------------------------------------------------------------------------

/**
 * Minimal TextMetrics returned by PDFBackend.measureText().
 *
 * Provides width based on a simple heuristic (0.5 * fontSize * text.length)
 * since full font metrics require the FontMetricsDB. Callers should use
 * FontMetricsDB directly for accurate measurement; this is a fallback.
 */
class PDFTextMetrics implements TextMetrics {
  readonly width: number;
  readonly actualBoundingBoxAscent: number;
  readonly actualBoundingBoxDescent: number;
  readonly actualBoundingBoxLeft: number;
  readonly actualBoundingBoxRight: number;
  readonly fontBoundingBoxAscent: number;
  readonly fontBoundingBoxDescent: number;
  readonly emHeightAscent: number;
  readonly emHeightDescent: number;
  readonly alphabeticBaseline: number;
  readonly hangingBaseline: number;
  readonly ideographicBaseline: number;

  constructor(width: number, fontSize: number) {
    this.width = width;
    this.actualBoundingBoxAscent = fontSize * 0.8;
    this.actualBoundingBoxDescent = fontSize * 0.2;
    this.actualBoundingBoxLeft = 0;
    this.actualBoundingBoxRight = width;
    this.fontBoundingBoxAscent = fontSize * 0.8;
    this.fontBoundingBoxDescent = fontSize * 0.2;
    this.emHeightAscent = fontSize * 0.8;
    this.emHeightDescent = fontSize * 0.2;
    this.alphabeticBaseline = 0;
    this.hangingBaseline = fontSize * 0.8;
    this.ideographicBaseline = -fontSize * 0.2;
  }
}

// ---------------------------------------------------------------------------
// Arc-to-bezier conversion
// ---------------------------------------------------------------------------

/**
 * Approximate a circular arc with cubic bezier curves.
 * Returns array of [cp1x, cp1y, cp2x, cp2y, endX, endY] segments.
 */
function arcToBeziers(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  counterclockwise: boolean
): { cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number }[] {
  // Normalize direction
  let start = startAngle;
  let end = endAngle;

  if (counterclockwise) {
    // Swap and negate
    if (end >= start) {
      end -= Math.PI * 2;
    }
  } else {
    if (end <= start) {
      end += Math.PI * 2;
    }
  }

  const segments: { cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number }[] = [];
  const totalAngle = end - start;
  const numSegments = Math.max(1, Math.ceil(Math.abs(totalAngle) / (Math.PI / 2)));
  const segmentAngle = totalAngle / numSegments;

  for (let i = 0; i < numSegments; i++) {
    const a1 = start + i * segmentAngle;
    const a2 = a1 + segmentAngle;

    // Bezier approximation constant for this arc segment
    const alpha = (4 / 3) * Math.tan(segmentAngle / 4);

    const cos1 = Math.cos(a1);
    const sin1 = Math.sin(a1);
    const cos2 = Math.cos(a2);
    const sin2 = Math.sin(a2);

    segments.push({
      cp1x: cx + radius * (cos1 - alpha * sin1),
      cp1y: cy + radius * (sin1 + alpha * cos1),
      cp2x: cx + radius * (cos2 + alpha * sin2),
      cp2y: cy + radius * (sin2 - alpha * cos2),
      x: cx + radius * cos2,
      y: cy + radius * sin2,
    });
  }

  return segments;
}

// ---------------------------------------------------------------------------
// PDFBackend
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Registered font interface (for PDF font embedding)
// ---------------------------------------------------------------------------

/**
 * A font registered with PDFBackend for proper PDF text rendering.
 *
 * Callers (e.g. the PDF export pipeline) create these after embedding
 * fonts into the PDF document, then register them so that fillText()
 * can emit correct Tf/Tj operators with proper encoding.
 */
export interface RegisteredPdfFont {
  /** PDF resource name, e.g. "F1" (without leading slash). */
  resourceName: string;
  /**
   * Encode a text string as hex for PDF Tj operator.
   * For CIDFont/Type0 fonts, this should produce UTF-16BE glyph IDs.
   * For Type1 standard fonts, this should produce WinAnsi hex encoding.
   */
  encodeText(text: string): string;
  /**
   * Measure the width of text in PDF points at the given font size.
   * Returns the advance width in points.
   */
  measureWidth(text: string, sizePt: number): number;
}

// ---------------------------------------------------------------------------
// Text measurer callback
// ---------------------------------------------------------------------------

/**
 * Optional function for measuring text width in PDF units.
 * If provided, used by measureText(). Otherwise a rough heuristic is used.
 */
export type TextMeasurer = (
  text: string,
  fontFamily: string,
  fontSizePx: number,
  bold: boolean,
  italic: boolean
) => number | undefined;

/**
 * PDFBackend translates RenderBackend calls to PDF content stream operators.
 *
 * The accumulated operators can be extracted via toString() or toBytes() and
 * fed to a ContentStreamBuilder or written directly to a PDF page stream.
 *
 * Usage:
 * ```ts
 * const backend = new PDFBackend(792); // US Letter height in points
 * backend.save();
 * backend.fillStyle = '#FF0000';
 * backend.fillRect(0, 0, 100, 50);
 * backend.restore();
 * const pdfStream = backend.toString();
 * ```
 */
export class PDFBackend {
  private readonly _ops: string[] = [];
  private _stateStack: PDFGraphicsState[] = [];
  private _currentState: PDFGraphicsState;
  private readonly _textMeasurer: TextMeasurer | undefined;

  /** Map of (family|bold|italic) -> RegisteredPdfFont for PDF text rendering. */
  private _fontRegistry = new Map<string, RegisteredPdfFont>();

  /** Resource declarations accumulated during rendering (e.g. "/F1 12 0 R"). */
  private _fontResourceDeclarations: string[] = [];

  /**
   * @param pageHeight - Page height in PDF points, used for Y-axis flipping.
   *   PDF uses bottom-left origin; Canvas2D uses top-left. The constructor
   *   emits a coordinate flip transform so all subsequent calls work in
   *   top-left-origin space.
   * @param textMeasurer - Optional callback for accurate text measurement.
   */
  constructor(
    pageHeight: number,
    textMeasurer?: TextMeasurer
  ) {
    this._currentState = createDefaultState();
    this._textMeasurer = textMeasurer;

    // Apply Y-axis flip: (1, 0, 0, -1, 0, pageHeight) cm
    // This makes y=0 the top of the page (Canvas2D convention)
    this._emit(`1 0 0 -1 0 ${n(pageHeight)} cm`);
  }

  // -------------------------------------------------------------------------
  // Font registration
  // -------------------------------------------------------------------------

  /**
   * Register a font for PDF text rendering.
   *
   * Once registered, fillText() and strokeText() will look up the font by
   * CSS family name and bold/italic flags, and emit proper Tf/Tj operators
   * with the correct encoding and resource name.
   *
   * @param cssFamily - CSS font family name (case-insensitive)
   * @param bold - Whether this is a bold variant
   * @param italic - Whether this is an italic variant
   * @param font - The registered font object
   */
  registerFont(
    cssFamily: string,
    bold: boolean,
    italic: boolean,
    font: RegisteredPdfFont
  ): void {
    const key = `${cssFamily.toLowerCase()}|${bold}|${italic}`;
    this._fontRegistry.set(key, font);
  }

  /**
   * Look up a registered font by CSS family name and style.
   * Returns undefined if no font is registered for the given combination.
   */
  private _lookupFont(
    cssFamily: string,
    bold: boolean,
    italic: boolean
  ): RegisteredPdfFont | undefined {
    const key = `${cssFamily.toLowerCase()}|${bold}|${italic}`;
    let font = this._fontRegistry.get(key);
    if (font) return font;

    // Fallback: try without style variants (e.g. no bold-italic, try bold-only)
    if (bold && italic) {
      font = this._fontRegistry.get(`${cssFamily.toLowerCase()}|true|false`);
      if (font) return font;
      font = this._fontRegistry.get(`${cssFamily.toLowerCase()}|false|true`);
      if (font) return font;
    }

    // Fallback: try regular
    font = this._fontRegistry.get(`${cssFamily.toLowerCase()}|false|false`);
    return font;
  }

  /**
   * Get the font resource declarations accumulated during rendering.
   *
   * These are strings like "/F1 12 0 R" that should be placed in the
   * page's /Resources /Font dictionary.
   */
  getFontResourceDeclarations(): string[] {
    return [...this._fontResourceDeclarations];
  }

  /**
   * Add a font resource declaration (called externally when wiring up
   * the page's /Resources dictionary).
   */
  addFontResourceDeclaration(declaration: string): void {
    this._fontResourceDeclarations.push(declaration);
  }

  // -------------------------------------------------------------------------
  // Output
  // -------------------------------------------------------------------------

  /** Return all accumulated PDF operators as a newline-joined string. */
  toString(): string {
    return this._ops.join('\n');
  }

  /** Return the content stream as UTF-8 bytes. */
  toBytes(): Uint8Array {
    return new TextEncoder().encode(this.toString());
  }

  /** Return the raw operator array (for inspection/testing). */
  getOperators(): readonly string[] {
    return this._ops;
  }

  // -------------------------------------------------------------------------
  // State management
  // -------------------------------------------------------------------------

  save(): void {
    this._stateStack.push(cloneState(this._currentState));
    this._emit('q');
  }

  restore(): void {
    const prev = this._stateStack.pop();
    if (prev) {
      this._currentState = prev;
    }
    this._emit('Q');
  }

  // -------------------------------------------------------------------------
  // Transform operations
  // -------------------------------------------------------------------------

  translate(x: number, y: number): void {
    this._emit(`1 0 0 1 ${n(x)} ${n(y)} cm`);
  }

  scale(sx: number, sy: number): void {
    this._emit(`${n(sx)} 0 0 ${n(sy)} 0 0 cm`);
  }

  rotate(radians: number): void {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    this._emit(`${n(cos)} ${n(sin)} ${n(-sin)} ${n(cos)} 0 0 cm`);
  }

  transform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number
  ): void {
    this._emit(`${n(a)} ${n(b)} ${n(c)} ${n(d)} ${n(e)} ${n(f)} cm`);
  }

  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number
  ): void {
    // PDF does not support absolute transform setting (only concatenation).
    // The best we can do is warn; the caller should use save/restore + transform
    // instead. For now, emit a cm operator (which concatenates, not replaces).
    // TRACKED-TASK: setTransform should track cumulative CTM and emit inverse + new — see TODO.md
    this._emit(`${n(a)} ${n(b)} ${n(c)} ${n(d)} ${n(e)} ${n(f)} cm`);
  }

  // -------------------------------------------------------------------------
  // Path construction
  // -------------------------------------------------------------------------

  beginPath(): void {

    // PDF does not have an explicit "begin path" operator.
    // Paths are constructed inline before painting operators.
  }

  moveTo(x: number, y: number): void {

    this._emit(`${n(x)} ${n(y)} m`);
  }

  lineTo(x: number, y: number): void {

    this._emit(`${n(x)} ${n(y)} l`);
  }

  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number
  ): void {

    this._emit(`${n(cp1x)} ${n(cp1y)} ${n(cp2x)} ${n(cp2y)} ${n(x)} ${n(y)} c`);
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    // PDF does not have a native quadratic bezier operator.
    // Convert to cubic: CP1 = P0 + 2/3*(CP-P0), CP2 = P1 + 2/3*(CP-P1)
    // We don't track "current point" precisely, so we use the `v` and `y`
    // operators' limitation. Instead, promote to cubic with repeated control point.
    // A proper solution requires tracking the current point. For now, use a
    // simple conversion assuming current point is the last path endpoint.
    // TRACKED-TASK: Track current path point for accurate quadratic-to-cubic conversion — see TODO.md

    // Approximate: use the control point for both cubic control points
    // This is imprecise but functionally acceptable for initial implementation
    this._emit(`${n(cpx)} ${n(cpy)} ${n(cpx)} ${n(cpy)} ${n(x)} ${n(y)} c`);
  }

  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean
  ): void {


    // Move to start point
    const sx = x + radius * Math.cos(startAngle);
    const sy = y + radius * Math.sin(startAngle);
    this._emit(`${n(sx)} ${n(sy)} m`);

    // Convert arc to bezier segments
    const segments = arcToBeziers(x, y, radius, startAngle, endAngle, counterclockwise ?? false);
    for (const seg of segments) {
      this._emit(
        `${n(seg.cp1x)} ${n(seg.cp1y)} ${n(seg.cp2x)} ${n(seg.cp2y)} ${n(seg.x)} ${n(seg.y)} c`
      );
    }
  }

  arcTo(
    x1: number,
    y1: number,
    _x2: number,
    _y2: number,
    _radius: number
  ): void {
    // TRACKED-TASK: Implement arcTo via tangent circle computation — see TODO.md
    // For now, approximate with a line to (x1, y1)

    this._emit(`${n(x1)} ${n(y1)} l`);
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


    // Use save/restore to apply the ellipse transform
    this._emit('q');
    // Translate to center
    this._emit(`1 0 0 1 ${n(x)} ${n(y)} cm`);
    // Rotate
    if (rotation !== 0) {
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      this._emit(`${n(cos)} ${n(sin)} ${n(-sin)} ${n(cos)} 0 0 cm`);
    }
    // Scale to make it elliptical
    this._emit(`${n(radiusX)} 0 0 ${n(radiusY)} 0 0 cm`);

    // Draw a unit circle arc
    const sx = Math.cos(startAngle);
    const sy = Math.sin(startAngle);
    this._emit(`${n(sx)} ${n(sy)} m`);

    const segments = arcToBeziers(0, 0, 1, startAngle, endAngle, counterclockwise ?? false);
    for (const seg of segments) {
      this._emit(
        `${n(seg.cp1x)} ${n(seg.cp1y)} ${n(seg.cp2x)} ${n(seg.cp2y)} ${n(seg.x)} ${n(seg.y)} c`
      );
    }

    this._emit('Q');
  }

  closePath(): void {
    this._emit('h');
  }

  rect(x: number, y: number, w: number, h: number): void {

    this._emit(`${n(x)} ${n(y)} ${n(w)} ${n(h)} re`);
  }

  clip(pathOrFillRule?: unknown, fillRule?: CanvasFillRule): void {
    const rule = typeof pathOrFillRule === 'string' ? pathOrFillRule : fillRule;
    if (rule === 'evenodd') {
      this._emit('W*');
    } else {
      this._emit('W');
    }
    // PDF requires n (endpath) after clip to consume the path
    this._emit('n');
  }

  // -------------------------------------------------------------------------
  // Painting operations
  // -------------------------------------------------------------------------

  fill(pathOrFillRule?: unknown, fillRule?: CanvasFillRule): void {
    // Path2D overload — not supported in initial implementation
    if (pathOrFillRule !== undefined && typeof pathOrFillRule === 'object') {
      throw new Error(
        'PDFBackend: Path2D is not supported. Use path construction methods instead.'
      );
    }

    this._flushFillColor();
    const rule = typeof pathOrFillRule === 'string' ? pathOrFillRule : fillRule;
    if (rule === 'evenodd') {
      this._emit('f*');
    } else {
      this._emit('f');
    }
  }

  stroke(path?: unknown): void {
    if (path !== undefined && typeof path === 'object') {
      throw new Error(
        'PDFBackend: Path2D is not supported. Use path construction methods instead.'
      );
    }

    this._flushStrokeColor();
    this._flushLineWidth();
    this._emit('S');
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this._flushFillColor();
    this._emit(`${n(x)} ${n(y)} ${n(w)} ${n(h)} re`);
    this._emit('f');
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    this._flushStrokeColor();
    this._flushLineWidth();
    this._emit(`${n(x)} ${n(y)} ${n(w)} ${n(h)} re`);
    this._emit('S');
  }

  clearRect(_x: number, _y: number, _w: number, _h: number): void {
    // PDF does not have a "clear" concept like Canvas2D.
    // In PDF, the background is the paper. We approximate by filling with white.
    this.save();
    this._emit('1 1 1 rg');
    this._emit(`${n(_x)} ${n(_y)} ${n(_w)} ${n(_h)} re`);
    this._emit('f');
    this.restore();
  }

  // -------------------------------------------------------------------------
  // Style properties
  // -------------------------------------------------------------------------

  get fillStyle(): string | CanvasGradient | CanvasPattern {
    const style = this._currentState.fillStyle;
    if (style instanceof PDFGradient) {
      // Return as CanvasGradient for interface compatibility (duck-typed)
      return style as unknown as CanvasGradient;
    }
    return style ?? '#000000';
  }

  set fillStyle(value: string | CanvasGradient | CanvasPattern) {
    if (value instanceof PDFGradient) {
      this._currentState.fillStyle = value;
    } else if (typeof value === 'string') {
      this._currentState.fillStyle = value;
    }
    // CanvasPattern: ignored in initial implementation
  }

  get strokeStyle(): string | CanvasGradient | CanvasPattern {
    const style = this._currentState.strokeStyle;
    if (style instanceof PDFGradient) {
      return style as unknown as CanvasGradient;
    }
    return style ?? '#000000';
  }

  set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
    if (value instanceof PDFGradient) {
      this._currentState.strokeStyle = value;
    } else if (typeof value === 'string') {
      this._currentState.strokeStyle = value;
    }
  }

  get lineWidth(): number {
    return this._currentState.lineWidth;
  }

  set lineWidth(value: number) {
    this._currentState.lineWidth = value;
  }

  get lineCap(): CanvasLineCap {
    return this._currentState.lineCap;
  }

  set lineCap(value: CanvasLineCap) {
    this._currentState.lineCap = value;
    const pdfCap = LINE_CAP_MAP[value] ?? 0;
    this._emit(`${pdfCap} J`);
  }

  get lineJoin(): CanvasLineJoin {
    return this._currentState.lineJoin;
  }

  set lineJoin(value: CanvasLineJoin) {
    this._currentState.lineJoin = value;
    const pdfJoin = LINE_JOIN_MAP[value] ?? 0;
    this._emit(`${pdfJoin} j`);
  }

  get miterLimit(): number {
    return this._currentState.miterLimit;
  }

  set miterLimit(value: number) {
    this._currentState.miterLimit = value;
    this._emit(`${n(value)} M`);
  }

  get globalAlpha(): number {
    return this._currentState.globalAlpha;
  }

  set globalAlpha(value: number) {
    this._currentState.globalAlpha = value;
    // PDF transparency requires ExtGState resources; tracked for Wave 3.
    // For now, the alpha is stored but not emitted to the content stream.
  }

  get globalCompositeOperation(): GlobalCompositeOperation {
    return this._currentState.globalCompositeOperation;
  }

  set globalCompositeOperation(value: GlobalCompositeOperation) {
    this._currentState.globalCompositeOperation = value;
    // PDF blend modes require ExtGState; tracked for Wave 3.
  }

  setLineDash(segments: number[]): void {
    this._currentState.lineDash = [...segments];
    const dashStr = segments.map(n).join(' ');
    this._emit(`[${dashStr}] ${n(this._currentState.lineDashOffset)} d`);
  }

  getLineDash(): number[] {
    return [...this._currentState.lineDash];
  }

  get lineDashOffset(): number {
    return this._currentState.lineDashOffset;
  }

  set lineDashOffset(value: number) {
    this._currentState.lineDashOffset = value;
    // Re-emit dash pattern with new offset
    const dashStr = this._currentState.lineDash.map(n).join(' ');
    this._emit(`[${dashStr}] ${n(value)} d`);
  }

  // -------------------------------------------------------------------------
  // Shadow properties (stored but not emitted — PDF shadows are complex)
  // -------------------------------------------------------------------------

  get shadowColor(): string {
    return this._currentState.shadowColor;
  }

  set shadowColor(value: string) {
    this._currentState.shadowColor = value;
    // PDF does not have native shadow support; would require duplicating
    // the path with offsets and blur. Deferred to Wave 3.
  }

  get shadowBlur(): number {
    return this._currentState.shadowBlur;
  }

  set shadowBlur(value: number) {
    this._currentState.shadowBlur = value;
  }

  get shadowOffsetX(): number {
    return this._currentState.shadowOffsetX;
  }

  set shadowOffsetX(value: number) {
    this._currentState.shadowOffsetX = value;
  }

  get shadowOffsetY(): number {
    return this._currentState.shadowOffsetY;
  }

  set shadowOffsetY(value: number) {
    this._currentState.shadowOffsetY = value;
  }

  // -------------------------------------------------------------------------
  // Text properties and operations
  // -------------------------------------------------------------------------

  get font(): string {
    return this._currentState.font;
  }

  set font(value: string) {
    this._currentState.font = value;
  }

  get textAlign(): CanvasTextAlign {
    return this._currentState.textAlign;
  }

  set textAlign(value: CanvasTextAlign) {
    this._currentState.textAlign = value;
  }

  get textBaseline(): CanvasTextBaseline {
    return this._currentState.textBaseline;
  }

  set textBaseline(value: CanvasTextBaseline) {
    this._currentState.textBaseline = value;
  }

  get direction(): CanvasDirection {
    return this._currentState.direction;
  }

  set direction(value: CanvasDirection) {
    this._currentState.direction = value;
  }

  get letterSpacing(): string {
    return this._currentState.letterSpacing;
  }

  set letterSpacing(value: string) {
    this._currentState.letterSpacing = value;
  }

  fillText(text: string, x: number, y: number, _maxWidth?: number): void {
    const { family, sizePx, bold, italic } = this._parseFont(this._currentState.font);
    const fillColor = this._resolveFillColor();

    // Look up registered font
    const registeredFont = this._lookupFont(family, bold, italic);

    this._emit('BT');
    this._emit(`${n(fillColor.r)} ${n(fillColor.g)} ${n(fillColor.b)} rg`);

    if (registeredFont) {
      // Use the registered font with proper encoding
      this._emit(`/${registeredFont.resourceName} ${n(sizePx)} Tf`);
      this._emit(`${n(x)} ${n(y)} Td`);
      const hex = registeredFont.encodeText(text);
      this._emit(`<${hex}> Tj`);
    } else {
      // Fallback: use family name as placeholder resource name
      const fontName = family.replace(/\s+/g, '');
      this._emit(`/${fontName} ${n(sizePx)} Tf`);
      this._emit(`${n(x)} ${n(y)} Td`);
      const hex = textToHex(text);
      this._emit(`<${hex}> Tj`);
    }

    this._emit('ET');
  }

  strokeText(text: string, x: number, y: number, _maxWidth?: number): void {
    const { family, sizePx, bold, italic } = this._parseFont(this._currentState.font);
    const strokeColor = this._resolveStrokeColor();

    // Look up registered font
    const registeredFont = this._lookupFont(family, bold, italic);

    this._emit('BT');
    this._emit(`${n(strokeColor.r)} ${n(strokeColor.g)} ${n(strokeColor.b)} RG`);
    this._emit('2 Tr'); // Text rendering mode: stroke

    if (registeredFont) {
      this._emit(`/${registeredFont.resourceName} ${n(sizePx)} Tf`);
      this._emit(`${n(x)} ${n(y)} Td`);
      const hex = registeredFont.encodeText(text);
      this._emit(`<${hex}> Tj`);
    } else {
      const fontName = family.replace(/\s+/g, '');
      this._emit(`/${fontName} ${n(sizePx)} Tf`);
      this._emit(`${n(x)} ${n(y)} Td`);
      const hex = textToHex(text);
      this._emit(`<${hex}> Tj`);
    }

    this._emit('0 Tr'); // Reset to fill mode
    this._emit('ET');
  }

  measureText(text: string): TextMetrics {
    const { family, sizePx, bold, italic } = this._parseFont(this._currentState.font);

    // Try the registered font's width measurement first
    const registeredFont = this._lookupFont(family, bold, italic);
    if (registeredFont) {
      const width = registeredFont.measureWidth(text, sizePx);
      return new PDFTextMetrics(width, sizePx);
    }

    // Try the external text measurer
    if (this._textMeasurer) {
      const width = this._textMeasurer(text, family, sizePx, bold, italic);
      if (width !== undefined) {
        return new PDFTextMetrics(width, sizePx);
      }
    }

    // Fallback: rough heuristic (average character width ~ 0.5 * fontSize)
    const avgCharWidth = sizePx * 0.5;
    const width = text.length * avgCharWidth;
    return new PDFTextMetrics(width, sizePx);
  }

  // -------------------------------------------------------------------------
  // Image operations
  // -------------------------------------------------------------------------

  drawImage(
    _image: CanvasImageSource,
    sxOrDx: number,
    syOrDy: number,
    swOrDw?: number,
    shOrDh?: number,
    dx?: number,
    dy?: number,
    dw?: number,
    dh?: number
  ): void {
    // PDF image rendering requires the image to be embedded as an XObject
    // with a resource name. For the initial implementation, emit a placeholder
    // that records the position and dimensions.
    // TRACKED-TASK: Wire image XObject embedding for drawImage — see TODO.md

    let destX: number, destY: number, destW: number, destH: number;

    if (dx !== undefined && dy !== undefined && dw !== undefined && dh !== undefined) {
      destX = dx;
      destY = dy;
      destW = dw;
      destH = dh;
    } else if (swOrDw !== undefined && shOrDh !== undefined) {
      destX = sxOrDx;
      destY = syOrDy;
      destW = swOrDw;
      destH = shOrDh;
    } else {
      destX = sxOrDx;
      destY = syOrDy;
      destW = 0;
      destH = 0;
    }

    // Emit a placeholder: save state, position, scale, draw XObject, restore
    this._emit('q');
    this._emit(`1 0 0 1 ${n(destX)} ${n(destY)} cm`);
    if (destW > 0 && destH > 0) {
      this._emit(`${n(destW)} 0 0 ${n(destH)} 0 0 cm`);
    }
    this._emit('/ImgPlaceholder Do');
    this._emit('Q');
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
    return new PDFGradient('linear', [x0, y0, x1, y1]) as unknown as CanvasGradient;
  }

  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): CanvasGradient {
    return new PDFGradient('radial', [x0, y0, r0, x1, y1, r1]) as unknown as CanvasGradient;
  }

  createPattern(
    _image: CanvasImageSource,
    _repetition: string | null
  ): CanvasPattern | null {
    // TRACKED-TASK: Implement PDF tiling patterns for createPattern — see TODO.md
    return null;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Emit a single PDF operator string. */
  private _emit(op: string): void {
    this._ops.push(op);
  }

  /** Resolve the current fill color to RGB (0-1 range). */
  private _resolveFillColor(): ParsedColor {
    const style = this._currentState.fillStyle;
    if (style instanceof PDFGradient) {
      return parseCssColor(style.getApproximateColor());
    }
    return parseCssColor(style ?? '#000000');
  }

  /** Resolve the current stroke color to RGB (0-1 range). */
  private _resolveStrokeColor(): ParsedColor {
    const style = this._currentState.strokeStyle;
    if (style instanceof PDFGradient) {
      return parseCssColor(style.getApproximateColor());
    }
    return parseCssColor(style ?? '#000000');
  }

  /** Emit the fill color operator based on current fillStyle. */
  private _flushFillColor(): void {
    const color = this._resolveFillColor();
    this._emit(`${n(color.r)} ${n(color.g)} ${n(color.b)} rg`);
  }

  /** Emit the stroke color operator based on current strokeStyle. */
  private _flushStrokeColor(): void {
    const color = this._resolveStrokeColor();
    this._emit(`${n(color.r)} ${n(color.g)} ${n(color.b)} RG`);
  }

  /** Emit the line width operator. */
  private _flushLineWidth(): void {
    this._emit(`${n(this._currentState.lineWidth)} w`);
  }

  /**
   * Parse a CSS font string like "bold italic 16px Arial" into components.
   * Returns defaults for unparseable values.
   */
  private _parseFont(fontStr: string): {
    family: string;
    sizePx: number;
    bold: boolean;
    italic: boolean;
  } {
    // Quick regex for common CSS font shorthand patterns
    const match = fontStr.match(
      /(?:(bold|bolder|lighter|\d+)\s+)?(?:(italic|oblique)\s+)?(\d+(?:\.\d+)?)(px|pt|em|rem)\s+(.+)/i
    );
    if (!match) {
      // Try: size followed by family (e.g. "10px sans-serif")
      const simple = fontStr.match(/(\d+(?:\.\d+)?)(px|pt|em|rem)\s+(.+)/i);
      if (simple) {
        return {
          family: simple[3].replace(/['"]/g, '').trim(),
          sizePx: parseFloat(simple[1]),
          bold: false,
          italic: false,
        };
      }
      return { family: 'sans-serif', sizePx: 10, bold: false, italic: false };
    }

    const weight = match[1]?.toLowerCase() ?? '';
    const style = match[2]?.toLowerCase() ?? '';
    const size = parseFloat(match[3]);
    const unit = match[4].toLowerCase();
    const family = match[5].replace(/['"]/g, '').trim();

    let sizePx = size;
    if (unit === 'pt') sizePx = size * (96 / 72);
    else if (unit === 'em' || unit === 'rem') sizePx = size * 16;

    return {
      family,
      sizePx,
      bold: weight === 'bold' || weight === 'bolder' || parseInt(weight) >= 700,
      italic: style === 'italic' || style === 'oblique',
    };
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LINE_CAP_MAP: Record<CanvasLineCap, number> = {
  butt: 0,
  round: 1,
  square: 2,
};

const LINE_JOIN_MAP: Record<CanvasLineJoin, number> = {
  miter: 0,
  round: 1,
  bevel: 2,
};

// ---------------------------------------------------------------------------
// Text encoding helper
// ---------------------------------------------------------------------------

/**
 * Encode a string as hex for PDF text operators.
 * Each Unicode codepoint is encoded as a 4-digit hex value (big-endian UTF-16).
 */
function textToHex(text: string): string {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    parts.push(code.toString(16).padStart(4, '0').toUpperCase());
  }
  return parts.join('');
}
