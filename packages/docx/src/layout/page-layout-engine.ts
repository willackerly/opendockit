/**
 * Page layout engine — orchestrates the DOCX layout pipeline.
 *
 * Takes a {@link DocumentIR} and produces a {@link LayoutDocument} with
 * fully positioned pages, blocks, lines, and runs.
 *
 * The pipeline is:
 * 1. For each section, compute page dimensions (page size + margins)
 * 2. For each paragraph, resolve effective styles
 * 3. Break each paragraph into lines via {@link breakParagraphIntoLines}
 * 4. Stack blocks vertically, inserting page breaks when content overflows
 * 5. Return a flat list of {@link LayoutPage}
 *
 * All coordinates are in typographic points (1/72").
 */

import type { DocumentIR, SectionIR } from '../model/document-ir.js';
import { computePageDimensions } from './page-layout.js';
import { breakParagraphIntoLines } from './line-breaker.js';
import { layoutTable, DEFAULT_TABLE_SPACING_AFTER } from './table-layout.js';
import type {
  LayoutDocument,
  LayoutPage,
  LayoutBlock,
  LayoutParagraphBlock,
  LayoutTableBlock,
  TextMeasurer,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default spacing after paragraph in points (Word default: 8pt). */
const DEFAULT_SPACING_AFTER = 8;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Lay out an entire document into pages.
 *
 * @param document - The parsed document IR.
 * @param measurer - Text measurement provider.
 * @returns A {@link LayoutDocument} with all pages.
 */
export function layoutDocumentPages(document: DocumentIR, measurer: TextMeasurer): LayoutDocument {
  const allPages: LayoutPage[] = [];
  let globalPageIndex = 0;

  for (const section of document.sections) {
    const sectionPages = layoutSectionPages(section, measurer, globalPageIndex);
    for (const page of sectionPages) {
      allPages.push(page);
    }
    globalPageIndex += sectionPages.length;
  }

  return { pages: allPages };
}

/**
 * Lay out a single section into pages.
 *
 * Each section can have its own page size and margins. Paragraphs are
 * broken into lines and stacked vertically. When the Y cursor exceeds
 * the content area height, a new page is started.
 *
 * @param section - The section IR with paragraphs.
 * @param measurer - Text measurement provider.
 * @param startPageIndex - Global page index for the first page of this section.
 * @returns Array of {@link LayoutPage} for this section.
 */
export function layoutSectionPages(
  section: SectionIR,
  measurer: TextMeasurer,
  startPageIndex = 0
): LayoutPage[] {
  const dims = computePageDimensions(section);
  const contentWidth = dims.contentArea.width;
  const contentHeight = dims.contentArea.height;

  const pages: LayoutPage[] = [];
  let currentBlocks: LayoutBlock[] = [];
  let y = 0;
  let pageIndex = startPageIndex;

  /**
   * Commit the current page and start a new one.
   */
  function commitPage(): void {
    pages.push({
      pageIndex,
      blocks: currentBlocks,
      pageWidth: dims.pageWidth,
      pageHeight: dims.pageHeight,
      contentArea: dims.contentArea,
    });
    pageIndex++;
    currentBlocks = [];
    y = 0;
  }

  // Use blocks if available, otherwise fall back to paragraphs only
  const blockElements =
    section.blocks && section.blocks.length > 0
      ? section.blocks
      : section.paragraphs.map((p) => ({ kind: 'paragraph' as const, paragraph: p }));

  for (const blockEl of blockElements) {
    if (blockEl.kind === 'paragraph') {
      const para = blockEl.paragraph;
      // Resolve spacing
      const spacingBefore = para.spacingBefore ?? 0;
      const spacingAfter = para.spacingAfter ?? DEFAULT_SPACING_AFTER;

      // Break paragraph into lines
      const lines = breakParagraphIntoLines(para, contentWidth, measurer);

      // Compute block height (sum of line heights)
      const blockHeight = lines.reduce((sum, line) => sum + line.height, 0);

      // Apply spacing before (skip at top of page)
      const effectiveSpacingBefore = currentBlocks.length > 0 ? spacingBefore : 0;

      // Check if block fits on the current page
      const totalNeeded = y + effectiveSpacingBefore + blockHeight;
      if (totalNeeded > contentHeight && currentBlocks.length > 0) {
        // Doesn't fit — commit current page and start new one
        commitPage();
      }

      // Apply spacing before (recalculate — may have changed after page break)
      const actualSpacingBefore = currentBlocks.length > 0 ? spacingBefore : 0;
      y += actualSpacingBefore;

      // Create the block
      const block: LayoutParagraphBlock = {
        kind: 'paragraph',
        lines,
        y,
        height: blockHeight,
        paragraph: para,
        spacingBefore: actualSpacingBefore,
        spacingAfter,
      };

      currentBlocks.push(block);
      y += blockHeight + spacingAfter;
    } else if (blockEl.kind === 'table') {
      const tableIR = blockEl.table;
      const spacingBefore = 0;
      const spacingAfter = DEFAULT_TABLE_SPACING_AFTER;

      // Lay out the table
      const tableResult = layoutTable(tableIR, contentWidth, measurer);

      // Apply spacing before (skip at top of page)
      const effectiveSpacingBefore = currentBlocks.length > 0 ? spacingBefore : 0;

      // Check if table fits on the current page
      const totalNeeded = y + effectiveSpacingBefore + tableResult.height;
      if (totalNeeded > contentHeight && currentBlocks.length > 0) {
        commitPage();
      }

      const actualSpacingBefore = currentBlocks.length > 0 ? spacingBefore : 0;
      y += actualSpacingBefore;

      const block: LayoutTableBlock = {
        kind: 'table',
        y,
        height: tableResult.height,
        tableLayout: tableResult,
        table: tableIR,
        spacingBefore: actualSpacingBefore,
        spacingAfter,
      };

      currentBlocks.push(block);
      y += tableResult.height + spacingAfter;
    }
  }

  // Commit the last page (or create an empty page for empty sections)
  if (currentBlocks.length > 0 || pages.length === 0) {
    commitPage();
  }

  return pages;
}
