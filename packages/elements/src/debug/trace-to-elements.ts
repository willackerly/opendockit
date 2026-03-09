/**
 * Converts a RenderTrace (from TracingBackend) into PageElement[], so traces
 * can be compared with PDF-extracted elements in visual-regression tests.
 *
 * Defines trace types locally to avoid a circular dependency on @opendockit/core.
 */

import type {
  PageElement,
  TextElement,
  ShapeElement,
  ImageElement,
  Paragraph,
  TextRun,
  Color,
  Fill,
  Stroke,
} from '../types.js';

// ─── Local Trace Types (mirror core/drawingml/renderer/trace-types) ────

export interface TextTraceEvent {
  kind: 'text';
  text: string;
  x: number;
  y: number;
  width: number;
  fontSizePt: number;
  fontString: string;
  fillStyle: string;
  ctm: [number, number, number, number, number, number];
  charAdvances?: number[];
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
  ctm: [number, number, number, number, number, number];
  charAdvances?: number[];
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
  ctm: [number, number, number, number, number, number];
  shapeId?: string;
  shapeName?: string;
}

export interface ImageTraceEvent {
  kind: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  ctm: [number, number, number, number, number, number];
  shapeId?: string;
  shapeName?: string;
}

export type TraceEvent =
  | TextTraceEvent
  | StrokeTextTraceEvent
  | ShapeTraceEvent
  | ImageTraceEvent;

export interface TraceConfig {
  [key: string]: unknown;
}

export interface RenderTrace {
  events: TraceEvent[];
  slideWidthPt: number;
  slideHeightPt: number;
  source: string;
  timestamp: number;
  config: TraceConfig;
}

// ─── Helpers ───────────────────────────────────────────

let syntheticCounter = 0;

function nextSyntheticId(): string {
  return `trace-anon-${++syntheticCounter}`;
}

/**
 * Parse a CSS color string (rgba, rgb, hex, or named) into a Color object.
 * Handles `rgba(r,g,b,a)`, `rgb(r,g,b)`, and `#rrggbb` / `#rgb`.
 */
export function parseCssColor(css: string): Color {
  if (!css) return { r: 0, g: 0, b: 0, a: 1 };

  // rgba(r, g, b, a) or rgb(r, g, b)
  const rgbaMatch = css.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/
  );
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1], 10),
      g: parseInt(rgbaMatch[2], 10),
      b: parseInt(rgbaMatch[3], 10),
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
    };
  }

  // #rrggbb or #rgb
  const hexMatch = css.match(/^#([0-9a-fA-F]+)$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
  }

  // Fallback: black
  return { r: 0, g: 0, b: 0, a: 1 };
}

interface ParsedFont {
  fontFamily: string;
  bold: boolean;
  italic: boolean;
}

/**
 * Parse a CSS font shorthand string to extract family, bold, and italic.
 * Examples: "bold 12px Arial", "italic bold 14pt 'Segoe UI'", "16px sans-serif"
 */
export function parseCssFont(fontString: string): ParsedFont {
  const lower = fontString.toLowerCase();
  const bold = /\bbold\b/.test(lower) || /\b[7-9]00\b/.test(lower);
  const italic = /\bitalic\b/.test(lower) || /\boblique\b/.test(lower);

  // Font family is everything after the size portion.
  // CSS font shorthand: [style] [variant] [weight] size[/line-height] family
  // We look for the size token (e.g. "12px", "14pt") and take everything after.
  const sizeMatch = fontString.match(
    /(\d+(?:\.\d+)?(?:px|pt|em|rem)(?:\s*\/\s*[\d.]+(?:px|pt|em|rem)?)?)\s+(.+)/
  );
  let fontFamily = 'sans-serif';
  if (sizeMatch) {
    fontFamily = sizeMatch[2]
      .replace(/["']/g, '')
      .split(',')[0]
      .trim();
  }

  return { fontFamily, bold, italic };
}

function isTextEvent(
  e: TraceEvent
): e is TextTraceEvent | StrokeTextTraceEvent {
  return e.kind === 'text' || e.kind === 'strokeText';
}

function makeElementBase(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  index: number
) {
  return {
    id,
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    index: String(index).padStart(6, '0'),
    parentId: null,
    locked: false,
  };
}

// ─── Grouping ──────────────────────────────────────────

interface EventGroup {
  id: string;
  events: TraceEvent[];
}

function groupByShapeId(events: TraceEvent[]): EventGroup[] {
  const grouped = new Map<string, TraceEvent[]>();
  const ordered: string[] = [];

  for (const event of events) {
    const id = event.shapeId ?? nextSyntheticId();
    if (!grouped.has(id)) {
      grouped.set(id, []);
      ordered.push(id);
    }
    grouped.get(id)!.push(event);
  }

  return ordered.map((id) => ({ id, events: grouped.get(id)! }));
}

// ─── Builders ──────────────────────────────────────────

function buildTextElement(
  group: EventGroup,
  index: number
): TextElement {
  const textEvents = group.events.filter(isTextEvent);
  if (textEvents.length === 0) {
    throw new Error('buildTextElement called with no text events');
  }

  // Group by paragraphIndex, then by runIndex within each paragraph
  const paraMap = new Map<number, (TextTraceEvent | StrokeTextTraceEvent)[]>();
  const paraOrder: number[] = [];

  for (const evt of textEvents) {
    const pi = evt.paragraphIndex ?? 0;
    if (!paraMap.has(pi)) {
      paraMap.set(pi, []);
      paraOrder.push(pi);
    }
    paraMap.get(pi)!.push(evt);
  }

  paraOrder.sort((a, b) => a - b);

  const paragraphs: Paragraph[] = paraOrder.map((pi) => {
    const paraEvents = paraMap.get(pi)!;

    // Group by runIndex within the paragraph
    const runMap = new Map<
      number,
      (TextTraceEvent | StrokeTextTraceEvent)[]
    >();
    const runOrder: number[] = [];

    for (const evt of paraEvents) {
      const ri = evt.runIndex ?? 0;
      if (!runMap.has(ri)) {
        runMap.set(ri, []);
        runOrder.push(ri);
      }
      runMap.get(ri)!.push(evt);
    }

    runOrder.sort((a, b) => a - b);

    const runs: TextRun[] = runOrder.map((ri) => {
      const runEvents = runMap.get(ri)!;

      // Concatenate text fragments in this run
      const text = runEvents.map((e) => e.text).join('');

      // Use the first event for style/position
      const first = runEvents[0];
      const parsed = parseCssFont(first.fontString);
      const colorStr =
        first.kind === 'strokeText' ? first.strokeStyle : first.fillStyle;

      // Bounding box across all events in this run
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const evt of runEvents) {
        minX = Math.min(minX, evt.x);
        minY = Math.min(minY, evt.y - evt.fontSizePt);
        maxX = Math.max(maxX, evt.x + evt.width);
        maxY = Math.max(maxY, evt.y);
      }

      return {
        text,
        fontFamily: parsed.fontFamily,
        fontSize: first.fontSizePt,
        bold: parsed.bold || undefined,
        italic: parsed.italic || undefined,
        color: parseCssColor(colorStr),
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    });

    return { runs };
  });

  // Overall bounding box from all runs
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const para of paragraphs) {
    for (const run of para.runs) {
      minX = Math.min(minX, run.x);
      minY = Math.min(minY, run.y);
      maxX = Math.max(maxX, run.x + run.width);
      maxY = Math.max(maxY, run.y + run.height);
    }
  }

  return {
    ...makeElementBase(group.id, minX, minY, maxX - minX, maxY - minY, index),
    type: 'text',
    paragraphs,
  };
}

function buildShapeElement(
  group: EventGroup,
  index: number
): ShapeElement {
  const shapeEvents = group.events.filter(
    (e): e is ShapeTraceEvent => e.kind === 'shape'
  );

  // Bounding box across all shape events
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  let fillColor: Color | null = null;
  let strokeColor: Color | null = null;
  let strokeWidth = 0;

  for (const evt of shapeEvents) {
    minX = Math.min(minX, evt.x);
    minY = Math.min(minY, evt.y);
    maxX = Math.max(maxX, evt.x + evt.width);
    maxY = Math.max(maxY, evt.y + evt.height);

    if (evt.fill) fillColor = parseCssColor(evt.fill);
    if (evt.stroke) {
      strokeColor = parseCssColor(evt.stroke);
      strokeWidth = evt.lineWidth ?? 1;
    }
  }

  const fill: Fill | null = fillColor
    ? { type: 'solid', color: fillColor }
    : null;

  const stroke: Stroke | null = strokeColor
    ? { color: strokeColor, width: strokeWidth }
    : null;

  return {
    ...makeElementBase(group.id, minX, minY, maxX - minX, maxY - minY, index),
    type: 'shape',
    shapeType: 'rectangle',
    fill,
    stroke,
  };
}

function buildImageElement(
  group: EventGroup,
  index: number
): ImageElement {
  const imageEvents = group.events.filter(
    (e): e is ImageTraceEvent => e.kind === 'image'
  );

  // Use first image event for position; union bounding box if multiple
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const evt of imageEvents) {
    minX = Math.min(minX, evt.x);
    minY = Math.min(minY, evt.y);
    maxX = Math.max(maxX, evt.x + evt.width);
    maxY = Math.max(maxY, evt.y + evt.height);
  }

  return {
    ...makeElementBase(group.id, minX, minY, maxX - minX, maxY - minY, index),
    type: 'image',
    imageRef: group.id,
    mimeType: 'application/octet-stream',
    objectFit: 'fill',
  };
}

// ─── Main ──────────────────────────────────────────────

/**
 * Convert a RenderTrace into an array of PageElement[].
 *
 * Groups trace events by `shapeId` and converts them to the unified element
 * model so traces can be structurally compared with PDF-extracted elements.
 *
 * @param trace - A RenderTrace captured by TracingBackend.
 * @returns An array of PageElement in z-order (by first occurrence in trace).
 */
export function traceToElements(trace: RenderTrace): PageElement[] {
  // Reset the counter per call for deterministic output in tests
  syntheticCounter = 0;

  const groups = groupByShapeId(trace.events);
  const elements: PageElement[] = [];

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const hasText = group.events.some(isTextEvent);
    const hasShape = group.events.some((e) => e.kind === 'shape');
    const hasImage = group.events.some((e) => e.kind === 'image');

    // A group may contain mixed event types. Prefer text > image > shape.
    if (hasText) {
      elements.push(buildTextElement(group, i));
    } else if (hasImage) {
      elements.push(buildImageElement(group, i));
    } else if (hasShape) {
      elements.push(buildShapeElement(group, i));
    }
  }

  return elements;
}
