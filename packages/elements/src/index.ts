/**
 * @opendockit/elements — Format-agnostic unified element model.
 *
 * Shared between @opendockit/pdf-signer (PDF) and @opendockit/pptx (PPTX).
 * Zero runtime dependencies — pure types and algorithms.
 */

// ─── Types ──────────────────────────────────────────────

export type {
  // Core
  PageModel,
  PageElement,
  ElementBase,
  ElementBounds,

  // Element types
  TextElement,
  ShapeElement,
  ImageElement,
  PathElement,
  GroupElement,

  // Source types
  PdfSource,
  PptxSource,

  // Rich text
  Paragraph,
  TextRun,

  // Style types
  Fill,
  Stroke,
  Color,
} from './types.js';

// ─── Spatial queries ────────────────────────────────────

export type { Rect } from './spatial.js';
export {
  // Primary API (new names)
  hitTest,
  getBounds,
  getOverlapping,
  isPointInBounds,
  // Extended API
  queryElementsInRect,
  queryTextInRect,
  elementAtPoint,
  boundingBox,
  extractTextInRect,
  elementToRect,
  rectsOverlap,
  pointInRect,
  rectIntersection,
  rectArea,
  overlapFraction,
} from './spatial.js';

// ─── Dirty tracking ─────────────────────────────────────

export { WeakDirtyTracker, DirtyTracker } from './dirty-tracking.js';

// ─── Editable document ─────────────────────────────────

export { EditableDocument } from './editable-document.js';
export type {
  DocumentSource,
  EditableElement,
  InteractionState,
} from './editable-document.js';
