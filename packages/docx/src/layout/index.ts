/**
 * Layout module — barrel export.
 */
export { computePageDimensions } from './page-layout.js';
export type { ContentArea, PageDimensions } from './page-layout.js';

export { layoutSection, layoutDocument, estimateParagraphHeight } from './block-layout.js';
export type { PositionedParagraph, PageContent, BlockLayoutResult } from './block-layout.js';
