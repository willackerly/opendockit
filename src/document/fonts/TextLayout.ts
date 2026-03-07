/**
 * Multi-line text layout with word wrap for standard fonts.
 * Zero pdf-lib dependencies.
 */

import type { StandardFontMetrics } from './StandardFontMetrics.js';
import type { FontEncoding } from './encoding.js';
import { encodeTextToHex } from './encoding.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export enum TextAlignment {
  Left = 0,
  Center = 1,
  Right = 2,
}

export interface TextPosition {
  text: string;
  encoded: string;
  x: number;
  y: number;
  width: number;
}

export interface MultilineTextLayout {
  lines: TextPosition[];
  fontSize: number;
  lineHeight: number;
}

export interface LayoutOptions {
  metrics: StandardFontMetrics;
  encoding: FontEncoding;
  bounds: { x: number; y: number; width: number; height: number };
  alignment?: TextAlignment;
  fontSize?: number;
  lineHeight?: number;
  wordBreaks?: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_WORD_BREAKS = [' '];

function splitWords(text: string, wordBreaks: string[]): string[] {
  // Split on any of the word break characters, keeping the delimiter
  const parts: string[] = [''];
  for (const char of text) {
    if (wordBreaks.includes(char)) {
      parts[parts.length - 1] += char;
      parts.push('');
    } else {
      parts[parts.length - 1] += char;
    }
  }
  return parts.filter(p => p.length > 0);
}

function wrapLine(
  text: string,
  maxWidth: number,
  metrics: StandardFontMetrics,
  encoding: FontEncoding,
  fontSize: number,
  wordBreaks: string[],
): string[] {
  if (maxWidth <= 0) return [text];

  const textWidth = metrics.widthOfTextAtSize(text, fontSize, encoding);
  if (textWidth <= maxWidth) return [text];

  const words = splitWords(text, wordBreaks);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine + word;
    const candidateWidth = metrics.widthOfTextAtSize(
      candidate,
      fontSize,
      encoding,
    );

    if (candidateWidth <= maxWidth || currentLine === '') {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Layout multi-line text within a bounding box.
 * Handles word wrap, alignment, and auto font sizing.
 *
 * Returns positioned lines with hex-encoded text ready for PDF operators.
 */
export function layoutMultilineText(
  text: string,
  options: LayoutOptions,
): MultilineTextLayout {
  const {
    metrics,
    encoding,
    bounds,
    alignment = TextAlignment.Left,
    wordBreaks = DEFAULT_WORD_BREAKS,
  } = options;

  let fontSize = options.fontSize ?? 12;
  const lineHeight =
    options.lineHeight ?? metrics.heightAtSize(fontSize) * 1.2;

  // Split by explicit newlines first
  const paragraphs = text.split('\n');

  // Wrap each paragraph
  const wrappedLines: string[] = [];
  for (const para of paragraphs) {
    if (para === '') {
      wrappedLines.push('');
    } else {
      const wrapped = wrapLine(
        para,
        bounds.width,
        metrics,
        encoding,
        fontSize,
        wordBreaks,
      );
      wrappedLines.push(...wrapped);
    }
  }

  // Position lines from top to bottom within bounds
  // PDF coordinate system: y increases upward, bounds.y is bottom-left
  const lines: TextPosition[] = [];
  const startY = bounds.y + bounds.height - lineHeight;

  for (let i = 0; i < wrappedLines.length; i++) {
    const lineText = wrappedLines[i];
    const y = startY - i * lineHeight;

    if (y < bounds.y - lineHeight) break; // Out of bounds

    const width = lineText.length > 0
      ? metrics.widthOfTextAtSize(lineText, fontSize, encoding)
      : 0;

    let x = bounds.x;
    if (alignment === TextAlignment.Center) {
      x = bounds.x + (bounds.width - width) / 2;
    } else if (alignment === TextAlignment.Right) {
      x = bounds.x + bounds.width - width;
    }

    const encoded = lineText.length > 0
      ? encodeTextToHex(lineText, encoding)
      : '';

    lines.push({ text: lineText, encoded, x, y, width });
  }

  return { lines, fontSize, lineHeight };
}
