/**
 * Layout IR types — output of the DOCX page layout engine.
 *
 * These types represent the fully resolved, positioned layout of a document.
 * All coordinates and dimensions are in typographic points (1/72").
 *
 * The layout pipeline transforms `DocumentIR` (parser output) into
 * `LayoutDocument` (layout output):
 *
 *   DocumentIR → PageLayoutEngine → LayoutDocument
 *     (sections, paragraphs, runs)   (pages, blocks, lines, runs)
 *
 * The renderer then iterates `LayoutDocument` to draw positioned text
 * onto a Canvas2D context.
 */

import type { ParagraphIR, RunIR } from '../model/document-ir.js';
import type { ContentArea } from './page-layout.js';

// ---------------------------------------------------------------------------
// Text measurement abstraction
// ---------------------------------------------------------------------------

/**
 * Result of measuring a text string with a given font.
 *
 * All values are in points. The `ascent` and `descent` values are used
 * to compute line height and baseline positioning.
 */
export interface TextMeasurement {
  /** Advance width of the text in points. */
  width: number;
  /** Distance from the baseline to the top of the tallest glyph, in points. */
  ascent: number;
  /** Distance from the baseline to the bottom of the deepest glyph, in points. */
  descent: number;
}

/**
 * Abstract interface for measuring text.
 *
 * Decouples the layout engine from Canvas2D so that:
 * - Layout can run in Node.js tests with a mock (fixed-width) measurer
 * - Layout can use font-metrics-DB-based measurement for accuracy
 * - The same layout engine works with any rendering backend
 *
 * In production, the implementation wraps `CanvasRenderingContext2D.measureText()`.
 */
export interface TextMeasurer {
  /**
   * Measure the given text string rendered in the given font.
   *
   * @param text - The text to measure.
   * @param fontString - A CSS font string (e.g., `'bold 12pt Calibri'`).
   * @returns Measurement result with width, ascent, and descent in points.
   */
  measureText(text: string, fontString: string): TextMeasurement;
}

// ---------------------------------------------------------------------------
// Run-level layout
// ---------------------------------------------------------------------------

/**
 * A single measured and positioned text run on a line.
 *
 * Each `LayoutRun` corresponds to a contiguous stretch of text with
 * uniform formatting that has been measured and assigned an X position
 * on its parent line.
 */
export interface LayoutRun {
  /** The text content of this run (may be a substring of the source RunIR). */
  text: string;

  /** X offset from the left edge of the content area, in points. */
  x: number;

  /** Measured advance width of this run's text, in points. */
  width: number;

  /** CSS font string for Canvas2D rendering (e.g., `'italic bold 14pt Calibri'`). */
  fontString: string;

  /** CSS color string for Canvas2D fillStyle (e.g., `'#000000'` or `'#FF0000'`). */
  fillStyle: string;

  /** Back-reference to the source run IR (for decorations, superscript, etc.). */
  sourceRun: RunIR;
}

// ---------------------------------------------------------------------------
// Line-level layout
// ---------------------------------------------------------------------------

/**
 * A single wrapped line of text within a paragraph.
 *
 * Lines are produced by the {@link LineBreaker} and stacked vertically
 * by the layout engine. Each line has a height (including leading) and
 * a baseline position relative to the line top.
 */
export interface LayoutLine {
  /** Positioned runs on this line. */
  runs: LayoutRun[];

  /** Total content width of all runs on this line, in points. */
  width: number;

  /**
   * Line height including leading, in points.
   *
   * Computed from the tallest run's font metrics and the paragraph's
   * line spacing setting.
   */
  height: number;

  /**
   * Distance from the top of the line box to the text baseline, in points.
   *
   * Used for vertical alignment when runs have different font sizes
   * (the baseline must align across all runs on the line).
   */
  ascent: number;

  /** Y offset from the top of the containing block, in points. */
  y: number;
}

// ---------------------------------------------------------------------------
// Block-level layout
// ---------------------------------------------------------------------------

/**
 * A laid-out paragraph block positioned on a page.
 *
 * Contains the paragraph's wrapped lines and its vertical position
 * within the page's content area. Spacing before/after is resolved
 * from paragraph properties, style defaults, and document defaults.
 */
export interface LayoutBlock {
  /** Discriminator for future block types (tables, images, etc.). */
  kind: 'paragraph';

  /** Wrapped and positioned lines within this block. */
  lines: LayoutLine[];

  /** Y offset from the top of the page's content area, in points. */
  y: number;

  /**
   * Total height of this block, in points.
   *
   * Includes all line heights but excludes spacing before/after
   * (spacing is accounted for in the Y cursor during layout).
   */
  height: number;

  /** Back-reference to the source paragraph IR. */
  paragraph: ParagraphIR;

  /** Resolved space before this paragraph, in points. */
  spacingBefore: number;

  /** Resolved space after this paragraph, in points. */
  spacingAfter: number;
}

// ---------------------------------------------------------------------------
// Page-level layout
// ---------------------------------------------------------------------------

/**
 * A single page of laid-out content.
 *
 * Contains positioned blocks and the page geometry (dimensions + margins).
 * The renderer uses `contentArea` to translate block coordinates into
 * absolute page coordinates.
 */
export interface LayoutPage {
  /** Zero-based page index within the document. */
  pageIndex: number;

  /** Positioned blocks on this page. */
  blocks: LayoutBlock[];

  /** Page width in points (from section properties). */
  pageWidth: number;

  /** Page height in points (from section properties). */
  pageHeight: number;

  /** Content area within the page (position and size of the text region). */
  contentArea: ContentArea;
}

// ---------------------------------------------------------------------------
// Document-level layout
// ---------------------------------------------------------------------------

/**
 * Complete layout result for an entire document.
 *
 * A flat list of pages across all sections. Each page knows its own
 * geometry (different sections can have different page sizes).
 */
export interface LayoutDocument {
  /** All pages in document order. */
  pages: LayoutPage[];
}
