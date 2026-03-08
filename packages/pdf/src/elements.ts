/**
 * @opendockit/pdf/elements — Unified Element Model.
 *
 * Re-exports element model from @opendockit/pdf-signer/elements.
 */

export type {
  PageModel,
  PageElement,
  ElementBase,
  TextElement,
  ShapeElement,
  ImageElement,
  PathElement,
  GroupElement,
  PdfSource,
  PptxSource,
  Paragraph,
  TextRun,
  Fill,
  Stroke,
  Color,
} from '@opendockit/pdf-signer/elements';

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
} from '@opendockit/pdf-signer/elements';
export type { Rect } from '@opendockit/pdf-signer/elements';

export { getRedactionPreview, formatRedactionLog } from '@opendockit/pdf-signer/elements';
export type { RedactionPreview, ElementDescription } from '@opendockit/pdf-signer/elements';

export { applyElementRedaction, redactContentByRect } from '@opendockit/pdf-signer/elements';
export type { ElementRedactionOptions } from '@opendockit/pdf-signer/elements';

export { InteractionStore } from '@opendockit/pdf-signer/elements';
export {
  viewportToPage,
  pageToViewport,
  pageRectToViewport,
  viewportRectToPage,
} from '@opendockit/pdf-signer/elements';
export type {
  Viewport,
  Modifiers,
  InteractionMode,
  InteractionSnapshot,
  InteractionEvent,
  StateListener,
  EventListener,
} from '@opendockit/pdf-signer/elements';
