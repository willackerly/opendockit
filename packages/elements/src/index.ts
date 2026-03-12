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

// ─── Spatial index (R-tree) ─────────────────────────────

export { SpatialIndex } from './spatial-index.js';

// ─── Dirty tracking ─────────────────────────────────────

export { WeakDirtyTracker, DirtyTracker } from './dirty-tracking.js';

// ─── Editable document ─────────────────────────────────

export { EditableDocument } from './editable-document.js';
export type {
  DocumentSource,
  EditableElement,
  InteractionState,
} from './editable-document.js';

// ─── Text search ────────────────────────────────────────

export { searchText } from './text-search.js';
export type { SearchResult, SearchOptions } from './text-search.js';

// ─── Clipboard utilities ────────────────────────────────

export { serializeToClipboard, deserializeFromClipboard } from './clipboard.js';
export type { ClipboardData } from './clipboard.js';

// ─── Debug utilities ───────────────────────────────────

export { traceToElements, parseCssColor, parseCssFont } from './debug/index.js';
export type { RenderTrace, TraceEvent } from './debug/index.js';

export { matchElements, extractText, centroidDistance, computeIoU, longestCommonSubstring } from './debug/index.js';
export type { MatchedPair, MatchResult } from './debug/index.js';

export { diffElements, generateDiffReport } from './debug/index.js';
export type { PropertyDelta, ElementDiff, DiffReport } from './debug/index.js';
