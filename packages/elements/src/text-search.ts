/**
 * Text search across the unified element model.
 *
 * Searches TextElement paragraphs and runs, returning bounding-box-anchored
 * results suitable for highlight rendering. Works identically for PDF and
 * PPTX documents since both are expressed as PageModel/PageElement.
 */

import type { PageModel, TextElement, ElementBounds } from './types.js';

// ─── Public types ───────────────────────────────────────

export type { ElementBounds };

/** A single text search hit. */
export interface SearchResult {
  /** Zero-based index of the page this match is on. */
  pageIndex: number;
  /** The ID of the TextElement containing the match. */
  elementId: string;
  /** The full text of the paragraph containing the match. */
  text: string;
  /** Byte offset in `text` where the match starts. */
  matchStart: number;
  /** Byte offset in `text` where the match ends (exclusive). */
  matchEnd: number;
  /** Bounding box of the match in page points. */
  bounds: ElementBounds;
}

/** Options controlling search behaviour. */
export interface SearchOptions {
  /** Match regardless of letter case. Defaults to true (case-insensitive). */
  caseSensitive?: boolean;
  /** Only match complete words (boundaries: non-alphanumeric characters). */
  wholeWord?: boolean;
  /** Treat `query` as a regular expression pattern. */
  regex?: boolean;
}

// ─── Implementation ─────────────────────────────────────

/**
 * Search all pages for text matching `query`.
 *
 * Each TextElement's paragraphs are concatenated with newlines to form a
 * searchable string. Match positions are mapped back to element/paragraph
 * coordinates to produce per-hit bounding boxes.
 *
 * @param pages    Array of PageModel objects (from PDF or PPTX).
 * @param query    Search string or regex pattern (when `options.regex` is true).
 * @param options  Search behaviour flags.
 * @returns        Ordered list of matches (page order, then element order).
 */
export function searchText(
  pages: PageModel[],
  query: string,
  options: SearchOptions = {},
): SearchResult[] {
  if (!query) return [];

  const { caseSensitive = false, wholeWord = false, regex = false } = options;
  const pattern = buildPattern(query, { caseSensitive, wholeWord, regex });

  const results: SearchResult[] = [];

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    for (const element of page.elements) {
      if (element.type !== 'text') continue;
      const textEl = element as TextElement;
      searchElement(pageIndex, textEl, pattern, results);
    }
  }

  return results;
}

// ─── Internal helpers ────────────────────────────────────

/**
 * Build the RegExp used for matching.
 */
function buildPattern(
  query: string,
  opts: Required<Pick<SearchOptions, 'caseSensitive' | 'wholeWord' | 'regex'>>,
): RegExp {
  let src = opts.regex ? query : escapeRegex(query);
  if (opts.wholeWord) {
    src = `\\b${src}\\b`;
  }
  const flags = opts.caseSensitive ? 'g' : 'gi';
  return new RegExp(src, flags);
}

/** Escape special regex characters in a literal string. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Search one TextElement, appending any matches to `results`.
 *
 * Strategy: build a flat string from all paragraph runs, record offsets where
 * each run starts, then for each regex match map the character range back to
 * run positions to compute the bounding box.
 */
function searchElement(
  pageIndex: number,
  element: TextElement,
  pattern: RegExp,
  results: SearchResult[],
): void {
  for (const para of element.paragraphs) {
    if (para.runs.length === 0) continue;

    // Build flat paragraph string + run-start offsets.
    const runOffsets: number[] = [];
    let flat = '';
    for (const run of para.runs) {
      runOffsets.push(flat.length);
      flat += run.text;
    }

    if (!flat) continue;

    // Reset lastIndex so the regex starts from the beginning.
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(flat)) !== null) {
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;

      const bounds = matchBounds(element, para.runs, runOffsets, matchStart, matchEnd);

      results.push({
        pageIndex,
        elementId: element.id,
        text: flat,
        matchStart,
        matchEnd,
        bounds,
      });

      // Prevent infinite loop on zero-length matches (e.g. /a*/)
      if (match[0].length === 0) {
        pattern.lastIndex++;
      }
    }
  }
}

/**
 * Compute the bounding box for a character range [matchStart, matchEnd) within
 * the paragraph's runs.
 *
 * We union the bounding boxes of all runs that intersect the match range. When
 * a run is only partially covered we proportionally scale its width.
 */
function matchBounds(
  element: TextElement,
  runs: TextElement['paragraphs'][0]['runs'],
  runOffsets: number[],
  matchStart: number,
  matchEnd: number,
): ElementBounds {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const runStart = runOffsets[i];
    const runEnd = runStart + run.text.length;

    // Check if this run overlaps the match range
    if (runEnd <= matchStart || runStart >= matchEnd) continue;

    // Compute which fraction of the run is covered
    const coveredStart = Math.max(matchStart, runStart) - runStart;
    const coveredEnd = Math.min(matchEnd, runEnd) - runStart;
    const runLen = run.text.length;
    const frac = runLen > 0 ? 1 / runLen : 1;

    // Proportional x offsets within the run
    const xStart = run.x + run.width * (coveredStart * frac);
    const xEnd = run.x + run.width * (coveredEnd * frac);

    // Absolute coordinates (run positions are relative to element origin)
    const absX = element.x + xStart;
    const absY = element.y + run.y;
    const absRight = element.x + xEnd;
    const absBottom = absY + run.height;

    minX = Math.min(minX, absX);
    minY = Math.min(minY, absY);
    maxX = Math.max(maxX, absRight);
    maxY = Math.max(maxY, absBottom);
  }

  // Fallback to element bounds if no run was found (shouldn't happen)
  if (!isFinite(minX)) {
    return { x: element.x, y: element.y, width: element.width, height: element.height };
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
