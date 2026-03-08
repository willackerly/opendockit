/**
 * Block layout — positions paragraphs vertically on pages.
 *
 * This is a simple top-down block flow engine. It places paragraphs one
 * after another, tracking the Y position. When the accumulated height
 * exceeds the page content height, a page break is inserted.
 *
 * This scaffold does not implement:
 * - Word-wrapping or line breaking (each paragraph is treated as one block)
 * - Widow/orphan control
 * - Keep-with-next
 * - Floating elements or text flow around objects
 *
 * The primary purpose is to demonstrate the layout pipeline and provide
 * a functional (if simplified) page-breaking algorithm.
 */

import type { ParagraphIR, SectionIR } from '../model/document-ir.js';
import { computePageDimensions } from './page-layout.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A positioned paragraph with its Y offset on the page. */
export interface PositionedParagraph {
  /** The paragraph IR data. */
  paragraph: ParagraphIR;
  /** Y position relative to the content area top, in points. */
  y: number;
  /** Estimated height of the paragraph in points. */
  height: number;
}

/** A single page containing positioned paragraphs. */
export interface PageContent {
  /** Page index (0-based). */
  pageIndex: number;
  /** Paragraphs positioned on this page. */
  paragraphs: PositionedParagraph[];
}

/** Result of the block layout process for a section. */
export interface BlockLayoutResult {
  /** Pages produced by the layout engine. */
  pages: PageContent[];
  /** Page width in points. */
  pageWidth: number;
  /** Page height in points. */
  pageHeight: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default font size when none is specified (in points). */
const DEFAULT_FONT_SIZE = 11;

/** Default line spacing multiplier. */
const DEFAULT_LINE_SPACING = 1.15;

/** Default spacing after paragraph in points (Word default: 8pt). */
const DEFAULT_SPACING_AFTER = 8;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Lay out the paragraphs of a section into pages.
 *
 * @param section - The section IR with paragraphs to lay out.
 * @returns Layout result with pages and positioned paragraphs.
 */
export function layoutSection(section: SectionIR): BlockLayoutResult {
  const dims = computePageDimensions(section);
  const contentHeight = dims.contentArea.height;
  const pages: PageContent[] = [];
  let currentPage: PositionedParagraph[] = [];
  let y = 0;
  let pageIndex = 0;

  for (const para of section.paragraphs) {
    const spacingBefore = para.spacingBefore ?? 0;
    const spacingAfter = para.spacingAfter ?? DEFAULT_SPACING_AFTER;
    const paraHeight = estimateParagraphHeight(para);

    // Check if this paragraph fits on the current page
    const totalHeight = y + spacingBefore + paraHeight;

    if (totalHeight > contentHeight && currentPage.length > 0) {
      // Start a new page
      pages.push({ pageIndex, paragraphs: currentPage });
      pageIndex++;
      currentPage = [];
      y = 0;
    }

    // Add spacing before (skip at top of page)
    if (currentPage.length > 0) {
      y += spacingBefore;
    }

    currentPage.push({
      paragraph: para,
      y,
      height: paraHeight,
    });

    y += paraHeight + spacingAfter;
  }

  // Flush the last page
  if (currentPage.length > 0) {
    pages.push({ pageIndex, paragraphs: currentPage });
  }

  // Always have at least one page
  if (pages.length === 0) {
    pages.push({ pageIndex: 0, paragraphs: [] });
  }

  return {
    pages,
    pageWidth: dims.pageWidth,
    pageHeight: dims.pageHeight,
  };
}

/**
 * Lay out all sections of a document into a flat list of pages.
 *
 * Each section starts on a new page (no continuous section breaks).
 */
export function layoutDocument(sections: SectionIR[]): BlockLayoutResult[] {
  return sections.map(layoutSection);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Estimate the height of a paragraph in points.
 *
 * This is a rough estimate based on font size and line spacing.
 * A real implementation would measure text and compute line breaks.
 */
export function estimateParagraphHeight(para: ParagraphIR): number {
  if (para.runs.length === 0) {
    // Empty paragraph: height is one line at default font size
    return DEFAULT_FONT_SIZE * DEFAULT_LINE_SPACING;
  }

  // Find the largest font size in the paragraph
  let maxFontSize = DEFAULT_FONT_SIZE;
  for (const run of para.runs) {
    if (run.fontSize !== undefined && run.fontSize > maxFontSize) {
      maxFontSize = run.fontSize;
    }
  }

  const lineSpacing = para.lineSpacing ?? DEFAULT_LINE_SPACING;

  // Estimate: one line of text at the largest font size
  // A real layout engine would count lines after word-wrapping
  return maxFontSize * lineSpacing;
}
