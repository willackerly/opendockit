/**
 * Line breaker — breaks a paragraph into wrapped lines of text.
 *
 * Takes a {@link ParagraphIR} and a content width, and produces
 * {@link LayoutLine}[] with positioned {@link LayoutRun}[] on each line.
 *
 * The algorithm is greedy word-boundary wrapping:
 * 1. Iterate through runs, splitting text at word boundaries (spaces)
 * 2. Measure each word fragment with the run's font
 * 3. Accumulate words on the current line until the line overflows
 * 4. When overflow occurs, commit the current line and start a new one
 * 5. Handle first-line indent (positive or hanging)
 *
 * This mirrors the wrapping logic in the PPTX text renderer
 * (`packages/core/src/drawingml/renderer/text-renderer.ts:wrapParagraph()`)
 * but operates on the simpler DOCX IR types.
 *
 * All coordinates and dimensions are in typographic points (1/72").
 */

import type { ParagraphIR, RunIR } from '../model/document-ir.js';
import type { LayoutLine, LayoutRun, TextMeasurer } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default font size when none specified (Word default: 11pt Calibri). */
const DEFAULT_FONT_SIZE = 11;

/** Default font family. */
const DEFAULT_FONT_FAMILY = 'Calibri, sans-serif';

/** Default line spacing multiplier (Word default: 1.15). */
const DEFAULT_LINE_SPACING = 1.15;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Break a paragraph into wrapped lines.
 *
 * @param paragraph - The paragraph IR to break into lines.
 * @param contentWidth - Available width for text in points.
 * @param measurer - Text measurement provider.
 * @returns An array of layout lines with positioned runs.
 */
export function breakParagraphIntoLines(
  paragraph: ParagraphIR,
  contentWidth: number,
  measurer: TextMeasurer
): LayoutLine[] {
  // Empty paragraph: return a single empty line with default height
  if (paragraph.runs.length === 0 || paragraph.runs.every((r) => r.text.length === 0)) {
    const fontSize = DEFAULT_FONT_SIZE;
    const lineSpacing = paragraph.lineSpacing ?? DEFAULT_LINE_SPACING;
    const lineHeight = fontSize * lineSpacing;
    return [
      {
        runs: [],
        width: 0,
        height: lineHeight,
        ascent: fontSize * 0.8,
        y: 0,
      },
    ];
  }

  // Compute effective indents
  const indentLeft = paragraph.indentLeft ?? 0;
  const indentRight = paragraph.indentRight ?? 0;
  const firstLineIndent = paragraph.indentFirstLine ?? 0;

  // Available width for first line vs continuation lines
  const firstLineWidth = Math.max(0, contentWidth - indentLeft - indentRight - firstLineIndent);
  const continuationWidth = Math.max(0, contentWidth - indentLeft - indentRight);

  // Break runs into word-level fragments
  const fragments = buildFragments(paragraph.runs, measurer);

  // Wrap fragments into lines
  const lines = wrapFragments(
    fragments,
    firstLineWidth,
    continuationWidth,
    paragraph.lineSpacing ?? DEFAULT_LINE_SPACING
  );

  // Assign Y offsets to each line
  let y = 0;
  for (const line of lines) {
    line.y = y;
    y += line.height;
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Internal: Fragment building
// ---------------------------------------------------------------------------

/**
 * A word-level fragment with measurement info.
 * Each fragment is a single "word" (or whitespace) from a run,
 * measured with the run's font.
 */
interface MeasuredFragment {
  /** The text of this fragment (a word or whitespace). */
  text: string;
  /** Measured advance width in points. */
  width: number;
  /** Whether this fragment is whitespace (can be trimmed at line end). */
  isSpace: boolean;
  /** CSS font string for rendering. */
  fontString: string;
  /** CSS fill style for rendering. */
  fillStyle: string;
  /** Font size in points (for line height calculation). */
  fontSize: number;
  /** Back-reference to the source RunIR. */
  sourceRun: RunIR;
}

/**
 * Split all runs into measured word-level fragments.
 *
 * Each run's text is split at word boundaries (spaces). Each resulting
 * word (and each space) becomes a separate {@link MeasuredFragment}
 * with its measured width.
 */
function buildFragments(runs: RunIR[], measurer: TextMeasurer): MeasuredFragment[] {
  const fragments: MeasuredFragment[] = [];

  for (const run of runs) {
    if (run.text.length === 0) continue;

    const fontString = buildDocxFontString(run);
    const fontSize = run.fontSize ?? DEFAULT_FONT_SIZE;
    const fillStyle = run.color ? `#${run.color}` : '#000000';

    // Split text into words and spaces
    const words = splitIntoWords(run.text);

    for (const word of words) {
      const isSpace = /^\s+$/.test(word);
      const measurement = measurer.measureText(word, fontString);
      fragments.push({
        text: word,
        width: measurement.width,
        isSpace,
        fontString,
        fillStyle,
        fontSize,
        sourceRun: run,
      });
    }
  }

  return fragments;
}

/**
 * Split text into alternating words and whitespace segments.
 *
 * Examples:
 * - "hello world" → ["hello", " ", "world"]
 * - "  two  spaces  " → ["  ", "two", "  ", "spaces", "  "]
 * - "word" → ["word"]
 */
function splitIntoWords(text: string): string[] {
  const result: string[] = [];
  const regex = /(\s+)/;
  const parts = text.split(regex);
  for (const part of parts) {
    if (part.length > 0) {
      result.push(part);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Internal: Line wrapping
// ---------------------------------------------------------------------------

/**
 * Wrap measured fragments into lines using greedy word-boundary algorithm.
 *
 * @param fragments - Measured word fragments to wrap.
 * @param firstLineWidth - Available width for the first line (pt).
 * @param continuationWidth - Available width for subsequent lines (pt).
 * @param lineSpacing - Line spacing multiplier.
 * @returns Wrapped lines with positioned runs.
 */
function wrapFragments(
  fragments: MeasuredFragment[],
  firstLineWidth: number,
  continuationWidth: number,
  lineSpacing: number
): LayoutLine[] {
  const lines: LayoutLine[] = [];
  let lineFragments: MeasuredFragment[] = [];
  let lineWidth = 0;
  let lineMaxFontSize = DEFAULT_FONT_SIZE;
  let isFirstLine = true;

  function getAvailableWidth(): number {
    return isFirstLine ? firstLineWidth : continuationWidth;
  }

  function commitLine(): void {
    // Trim trailing whitespace from the line
    while (lineFragments.length > 0 && lineFragments[lineFragments.length - 1].isSpace) {
      lineFragments.pop();
    }

    const lineHeight = lineMaxFontSize * lineSpacing;
    const ascent = lineMaxFontSize * 0.8;

    // Build positioned LayoutRuns by merging adjacent fragments with same formatting
    const runs = buildLineRuns(lineFragments);

    const totalWidth = runs.reduce((sum, r) => sum + r.width, 0);

    lines.push({
      runs,
      width: totalWidth,
      height: lineHeight,
      ascent,
      y: 0, // assigned later
    });

    lineFragments = [];
    lineWidth = 0;
    lineMaxFontSize = DEFAULT_FONT_SIZE;
    isFirstLine = false;
  }

  for (const frag of fragments) {
    // Track the maximum font size on the current line
    if (frag.fontSize > lineMaxFontSize) {
      lineMaxFontSize = frag.fontSize;
    }

    const available = getAvailableWidth();

    // If this is a non-space fragment that would overflow, commit the line first
    if (!frag.isSpace && lineWidth + frag.width > available && lineFragments.length > 0) {
      commitLine();
      // Re-check max font size for new line
      lineMaxFontSize = frag.fontSize;
    }

    lineFragments.push(frag);
    lineWidth += frag.width;
  }

  // Commit the last line
  if (lineFragments.length > 0) {
    commitLine();
  }

  return lines;
}

/**
 * Build positioned {@link LayoutRun}[] from a line's fragments.
 *
 * Merges adjacent fragments that share the same font and color into
 * a single run. Assigns X positions to each run.
 */
function buildLineRuns(fragments: MeasuredFragment[]): LayoutRun[] {
  if (fragments.length === 0) return [];

  const runs: LayoutRun[] = [];
  let x = 0;

  // Group adjacent fragments with the same formatting
  let currentText = '';
  let currentWidth = 0;
  let currentFont = fragments[0].fontString;
  let currentFill = fragments[0].fillStyle;
  let currentSource = fragments[0].sourceRun;
  let currentX = 0;

  for (const frag of fragments) {
    if (frag.fontString === currentFont && frag.fillStyle === currentFill) {
      // Same formatting: merge
      currentText += frag.text;
      currentWidth += frag.width;
    } else {
      // Different formatting: commit current run, start new one
      if (currentText.length > 0) {
        runs.push({
          text: currentText,
          x: currentX,
          width: currentWidth,
          fontString: currentFont,
          fillStyle: currentFill,
          sourceRun: currentSource,
        });
      }
      x += currentWidth;
      currentX = x;
      currentText = frag.text;
      currentWidth = frag.width;
      currentFont = frag.fontString;
      currentFill = frag.fillStyle;
      currentSource = frag.sourceRun;
    }
  }

  // Commit the last run
  if (currentText.length > 0) {
    runs.push({
      text: currentText,
      x: currentX,
      width: currentWidth,
      fontString: currentFont,
      fillStyle: currentFill,
      sourceRun: currentSource,
    });
  }

  return runs;
}

// ---------------------------------------------------------------------------
// Internal: Font string building
// ---------------------------------------------------------------------------

/**
 * Build a CSS font string from a DOCX {@link RunIR}.
 *
 * Produces a string like `"italic bold 12pt Calibri, sans-serif"` for
 * use with Canvas2D's `ctx.font` property and text measurement.
 *
 * This is a simplified version of the PPTX `buildFontString()` in
 * `text-renderer.ts`, adapted for the flatter DOCX RunIR structure.
 */
function buildDocxFontString(run: RunIR): string {
  const style = run.italic ? 'italic ' : '';
  const weight = run.bold ? 'bold ' : '';
  const size = run.fontSize ?? DEFAULT_FONT_SIZE;
  const family = run.fontFamily ?? DEFAULT_FONT_FAMILY;
  return `${style}${weight}${size}pt ${family}`;
}
