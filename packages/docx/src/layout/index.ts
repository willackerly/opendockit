/**
 * Layout module — barrel export.
 */

// Page dimension computation
export { computePageDimensions } from './page-layout.js';
export type { ContentArea, PageDimensions } from './page-layout.js';

// Legacy block layout (scaffold — retained for backward compatibility)
export { layoutSection, layoutDocument, estimateParagraphHeight } from './block-layout.js';
export type { PositionedParagraph, PageContent, BlockLayoutResult } from './block-layout.js';

// Layout IR types
export type {
  TextMeasurement,
  TextMeasurer,
  LayoutRun,
  LayoutLine,
  LayoutBlock,
  LayoutPage,
  LayoutDocument,
} from './types.js';

// Line breaker
export { breakParagraphIntoLines } from './line-breaker.js';

// Page layout engine
export { layoutDocumentPages, layoutSectionPages } from './page-layout-engine.js';
