/**
 * Unified Element Model — format-agnostic positioned content on fixed-size pages.
 *
 * Shared between pdfbox-ts (PDF) and opendockit (PPTX). The interaction layer
 * reads/writes only the visual fields (x, y, width, height, etc.). Format-specific
 * data rides along in the opaque `source` bag for lossless round-trip.
 */

// ─── Core ───────────────────────────────────────────────

export interface PageModel {
  id: string;
  width: number;   // points (1/72")
  height: number;
  elements: PageElement[];  // flat, z-ordered (back to front)
}

// ─── Element Base ───────────────────────────────────────

export interface ElementBase {
  id: string;
  type: string;

  // Visual coordinates (points) — interaction layer reads/writes ONLY these
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;   // degrees
  opacity: number;    // 0-1

  index: string;          // fractional index for z-ordering
  parentId: string | null;
  locked: boolean;

  // Opaque format-specific source data — enables lossless round-trip.
  // Interaction layer NEVER reads this. Exporter uses it for write-back.
  source?: PdfSource | PptxSource | unknown;
}

// ─── Source Types (Opaque to Interaction Layer) ─────────

/** PDF: maps element back to content stream operators */
export interface PdfSource {
  format: 'pdf';
  opRange: [number, number];  // operator indices in content stream
  ctm: number[];              // original transformation matrix [a,b,c,d,e,f]
  textMatrix?: number[];      // for text elements
  fontName?: string;          // PDF font resource name (/F1, /TT0, etc.)
}

/** PPTX: preserves original OOXML values for lossless write-back */
export interface PptxSource {
  format: 'pptx';
  offX: number;    // original EMU x offset (integer, lossless)
  offY: number;
  extCx: number;   // original EMU width
  extCy: number;
  rot: number;     // rotation in 60,000ths of a degree
  xmlPath?: string;
  passthrough?: Record<string, unknown>;
}

// ─── Element Types (Discriminated Union) ────────────────

export type PageElement =
  | TextElement
  | ShapeElement
  | ImageElement
  | PathElement
  | GroupElement;

export interface TextElement extends ElementBase {
  type: 'text';
  paragraphs: Paragraph[];
}

export interface ShapeElement extends ElementBase {
  type: 'shape';
  shapeType: 'rectangle' | 'ellipse' | 'triangle' | 'diamond' | string;
  fill: Fill | null;
  stroke: Stroke | null;
  cornerRadius?: number;
}

export interface ImageElement extends ElementBase {
  type: 'image';
  imageRef: string;           // reference key (XObject name or URI)
  mimeType: string;
  objectFit: 'fill' | 'contain' | 'cover' | 'none';
}

export interface PathElement extends ElementBase {
  type: 'path';
  d: string;                  // SVG path data
  fill: Fill | null;
  stroke: Stroke | null;
}

export interface GroupElement extends ElementBase {
  type: 'group';
  childIds: string[];
}

// ─── Rich Text ──────────────────────────────────────────

export interface Paragraph {
  runs: TextRun[];
  align?: 'left' | 'center' | 'right' | 'justify';
}

export interface TextRun {
  text: string;
  fontFamily: string;
  fontSize: number;       // points
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color: Color;
  // Computed position within the text element
  x: number;              // offset from element origin
  y: number;
  width: number;          // measured advance width
  height: number;         // font ascent + descent
}

// ─── Style Types ────────────────────────────────────────

export interface Fill {
  type: 'solid' | 'linear-gradient' | 'radial-gradient' | 'pattern';
  color?: Color;
  stops?: Array<{ offset: number; color: Color }>;
  angle?: number;
}

export interface Stroke {
  color: Color;
  width: number;
  dashArray?: number[];
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
}

export type Color = { r: number; g: number; b: number; a?: number };
