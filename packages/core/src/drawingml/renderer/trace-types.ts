/**
 * Render trace types — structured data captured during rendering for
 * per-element debugging, comparison, and regression testing.
 *
 * The trace captures every visual operation (fillText, drawImage, fill/stroke)
 * with world-space coordinates in points (1/72 inch), enabling direct
 * comparison against PDF-extracted elements.
 *
 * @module trace-types
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for render tracing.
 *
 * Tracing is entirely opt-in: when disabled (the default), no TracingBackend
 * is constructed and there is zero runtime cost.
 */
export interface TraceConfig {
  /**
   * Capture per-character advance widths via individual measureText calls.
   *
   * This approximately doubles text rendering time due to per-character
   * measurement. Only enable for detailed glyph-level debugging.
   *
   * @default false
   */
  glyphLevel: boolean;

  /**
   * DPI scale factor used during rendering (e.g., 2 for Retina).
   *
   * Used to convert pixel coordinates back to points for the trace.
   * Formula: `points = pixels / (dpiScale * 96/72)`
   */
  dpiScale: number;
}

// ---------------------------------------------------------------------------
// Trace events
// ---------------------------------------------------------------------------

/**
 * A text fragment rendered via fillText().
 *
 * Coordinates are in points (1/72 inch) in the slide's world space.
 */
export interface TextTraceEvent {
  kind: 'text';
  /** The text string drawn. */
  text: string;
  /** World-space X position in points (baseline origin). */
  x: number;
  /** World-space Y position in points (baseline origin). */
  y: number;
  /** Measured advance width in points. */
  width: number;
  /** Font size in points. */
  fontSizePt: number;
  /** CSS font string used for rendering (e.g. "bold 16px 'Arial', sans-serif"). */
  fontString: string;
  /** Resolved fill color (CSS rgba string). */
  fillStyle: string;
  /** The world-space CTM at time of drawing (a, b, c, d, tx, ty). */
  ctm: [number, number, number, number, number, number];
  /** Per-character advance widths in points (only if glyphLevel enabled). */
  charAdvances?: number[];
  /** Shape context: element ID from the IR. */
  shapeId?: string;
  /** Shape context: element name from the IR. */
  shapeName?: string;
  /** Paragraph index within the shape's text body. */
  paragraphIndex?: number;
  /** Run index within the paragraph. */
  runIndex?: number;
}

/**
 * A text outline rendered via strokeText().
 */
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
  ctm: [number, number, number, number, number, number];
  shapeId?: string;
  shapeName?: string;
  paragraphIndex?: number;
  runIndex?: number;
}

/**
 * A filled or stroked shape (path, rect, geometry).
 */
export interface ShapeTraceEvent {
  kind: 'shape';
  /** Operation type. */
  operation: 'fill' | 'stroke' | 'fillRect' | 'strokeRect';
  /** World-space bounding box in points. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Fill style (CSS string, or 'gradient'/'pattern' for non-string styles). */
  fill?: string;
  /** Stroke style. */
  stroke?: string;
  /** Stroke width in points. */
  lineWidth?: number;
  ctm: [number, number, number, number, number, number];
  shapeId?: string;
  shapeName?: string;
}

/**
 * An image drawn via drawImage().
 */
export interface ImageTraceEvent {
  kind: 'image';
  /** World-space position and size in points. */
  x: number;
  y: number;
  width: number;
  height: number;
  ctm: [number, number, number, number, number, number];
  shapeId?: string;
  shapeName?: string;
}

/** Discriminated union of all trace event types. */
export type TraceEvent =
  | TextTraceEvent
  | StrokeTextTraceEvent
  | ShapeTraceEvent
  | ImageTraceEvent;

// ---------------------------------------------------------------------------
// Shape context (set by renderers when TracingBackend is active)
// ---------------------------------------------------------------------------

/**
 * Context identifying the current shape being rendered.
 *
 * Set via TracingBackend.setShapeContext() from shape/text renderers
 * using duck-typed detection.
 */
export interface ShapeContext {
  shapeId?: string;
  shapeName?: string;
  paragraphIndex?: number;
  runIndex?: number;
}

// ---------------------------------------------------------------------------
// Render trace (output)
// ---------------------------------------------------------------------------

/**
 * Complete render trace for a single slide.
 *
 * Contains all trace events in render order, plus slide metadata
 * for coordinate normalization.
 */
export interface RenderTrace {
  /** All trace events, in render order. */
  events: TraceEvent[];
  /** Slide dimensions in points. */
  slideWidthPt: number;
  slideHeightPt: number;
  /** Source identifier (e.g., 'pptx:slide3'). */
  source: string;
  /** Timestamp of trace capture. */
  timestamp: number;
  /** Trace configuration used. */
  config: TraceConfig;
}
