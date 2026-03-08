/**
 * Page layout — computes content area dimensions from section properties.
 *
 * This is the simplest layer of the layout engine: it takes the page size
 * and margins from a {@link SectionIR} and computes the available content
 * area for text flow.
 */

import type { SectionIR } from '../model/document-ir.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Dimensions of the content area within a page. */
export interface ContentArea {
  /** X offset of the content area from the page left edge, in points. */
  x: number;
  /** Y offset of the content area from the page top edge, in points. */
  y: number;
  /** Width of the content area in points. */
  width: number;
  /** Height of the content area in points. */
  height: number;
}

/** Full page dimensions including margins. */
export interface PageDimensions {
  /** Page width in points. */
  pageWidth: number;
  /** Page height in points. */
  pageHeight: number;
  /** Content area within the page. */
  contentArea: ContentArea;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute page dimensions and content area from section properties.
 */
export function computePageDimensions(section: SectionIR): PageDimensions {
  const contentWidth = section.pageWidth - section.marginLeft - section.marginRight;
  const contentHeight = section.pageHeight - section.marginTop - section.marginBottom;

  return {
    pageWidth: section.pageWidth,
    pageHeight: section.pageHeight,
    contentArea: {
      x: section.marginLeft,
      y: section.marginTop,
      width: Math.max(0, contentWidth),
      height: Math.max(0, contentHeight),
    },
  };
}
