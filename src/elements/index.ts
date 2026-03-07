/**
 * pdfbox-ts/elements — Unified Element Model.
 *
 * Format-agnostic positioned content model for PDF and PPTX.
 * Enables surgical redaction, interactive editing, and cross-format unification.
 */

export type {
  // Core
  PageModel,
  PageElement,
  ElementBase,

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

// Spatial queries
export {
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
export type { Rect } from './spatial.js';

// Redaction preview
export { getRedactionPreview, formatRedactionLog } from './redaction-preview.js';
export type { RedactionPreview, ElementDescription } from './redaction-preview.js';

// Element-based redaction
export { applyElementRedaction, redactContentByRect } from './redact.js';
export type { ElementRedactionOptions } from './redact.js';

// Interaction state machine (Phase 3)
export { InteractionStore } from './interaction-store.js';
export {
  viewportToPage,
  pageToViewport,
  pageRectToViewport,
  viewportRectToPage,
} from './coordinate-utils.js';
export type {
  Viewport,
  Modifiers,
  InteractionMode,
  InteractionSnapshot,
  InteractionEvent,
  StateListener,
  EventListener,
} from './interaction-types.js';
