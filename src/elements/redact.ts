/**
 * Element-based redaction v2 -- surgical content removal using the element model.
 *
 * Instead of guessing what content is under a rectangle (point-in-rect),
 * this uses the element model to KNOW exactly what will be removed.
 * Each element carries a `source.opRange` that maps it back to content stream
 * operation indices, enabling precise removal.
 */

import type { PageElement, PdfSource } from './types.js';
import { queryElementsInRect, type Rect } from './spatial.js';
import { getRedactionPreview, formatRedactionLog } from './redaction-preview.js';
import {
  tokenizeContentStream,
  parseOperations,
} from '../document/redaction/ContentStreamRedactor.js';
import type { CSOperation, CSToken } from '../document/redaction/ContentStreamRedactor.js';
import { evaluatePageWithElements } from '../render/evaluator.js';
import type { COSDictionary } from '../pdfbox/cos/COSTypes.js';
import type { ObjectResolver } from '../document/extraction/FontDecoder.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ElementRedactionOptions {
  /** Interior fill color (default: black). */
  interiorColor?: { r: number; g: number; b: number };
  /** Log removed content to console (default: true). */
  verbose?: boolean;
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

function serializeToken(token: CSToken): string {
  switch (token.type) {
    case 'number':
      return token.value;
    case 'string': {
      // Re-escape for PDF parenthesized string
      let escaped = '';
      for (const ch of token.value) {
        if (ch === '(' || ch === ')' || ch === '\\') escaped += '\\' + ch;
        else escaped += ch;
      }
      return `(${escaped})`;
    }
    case 'hexstring':
      return `<${token.value}>`;
    case 'name':
      return `/${token.value}`;
    case 'array_start':
      return '[';
    case 'array_end':
      return ']';
    case 'boolean':
    case 'null':
      return token.value;
    case 'operator':
      return token.value;
    default:
      return token.value;
  }
}

function serializeOperation(op: CSOperation): string {
  const parts: string[] = [];
  for (const operand of op.operands) {
    parts.push(serializeToken(operand));
  }
  if (op.operator) {
    parts.push(op.operator);
  }
  return parts.join(' ');
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  const s = n.toString();
  if (s.includes('e') || s.includes('E')) {
    return n.toFixed(6).replace(/\.?0+$/, '');
  }
  return s;
}

// ---------------------------------------------------------------------------
// Core: apply element-based redaction
// ---------------------------------------------------------------------------

/**
 * Apply element-based redaction to a content stream.
 *
 * Takes the ORIGINAL content stream bytes + the elements to remove.
 * Returns the rewritten content stream with those elements' operations removed
 * and fill rectangles appended.
 *
 * @param contentStream  Raw content stream bytes
 * @param elementsToRemove  Elements whose operations should be removed (must have PdfSource with opRange)
 * @param redactionRects  Rectangles to fill after removal
 * @param options  Redaction options
 * @returns Rewritten content stream
 */
export function applyElementRedaction(
  contentStream: Uint8Array,
  elementsToRemove: PageElement[],
  redactionRects: Array<Rect>,
  options?: ElementRedactionOptions,
): Uint8Array {
  const color = options?.interiorColor ?? { r: 0, g: 0, b: 0 };

  // 1. Parse the content stream into operations
  const tokens = tokenizeContentStream(contentStream);
  const operations = parseOperations(tokens);

  // 2. Build a set of operation indices to remove from element sources
  const removalSet = new Set<number>();
  for (const el of elementsToRemove) {
    const source = el.source as PdfSource | undefined;
    if (!source || source.format !== 'pdf') continue;
    const [start, end] = source.opRange;
    for (let i = start; i <= end; i++) {
      removalSet.add(i);
    }
  }

  // 3. Walk operations, skip those in the removal set, serialize the rest
  const lines: string[] = [];
  for (let i = 0; i < operations.length; i++) {
    if (removalSet.has(i)) continue;
    lines.push(serializeOperation(operations[i]));
  }

  // 4. Append fill rectangles
  if (redactionRects.length > 0) {
    lines.push('q');
    lines.push(`${formatNum(color.r)} ${formatNum(color.g)} ${formatNum(color.b)} rg`);
    for (const rect of redactionRects) {
      lines.push(
        `${formatNum(rect.x)} ${formatNum(rect.y)} ${formatNum(rect.width)} ${formatNum(rect.height)} re`,
      );
      lines.push('f');
    }
    lines.push('Q');
  }

  const result = lines.join('\n');
  return new TextEncoder().encode(result);
}

// ---------------------------------------------------------------------------
// High-level: redact content by rectangle (one-liner API)
// ---------------------------------------------------------------------------

/**
 * High-level redaction: extract elements, query rect, remove matching ops.
 *
 * This is the "one-liner" API that replaces the old applyRedactions.
 * It uses the element model for surgical removal instead of point-in-rect guessing.
 *
 * @param contentStream  Raw content stream bytes
 * @param pageDict  COS dictionary for the page
 * @param resolve  Object resolver for indirect references
 * @param rects  Rectangles defining areas to redact
 * @param options  Redaction options
 * @returns Rewritten content stream with redacted content removed
 */
export function redactContentByRect(
  contentStream: Uint8Array,
  pageDict: COSDictionary,
  resolve: ObjectResolver,
  rects: Array<Rect>,
  options?: ElementRedactionOptions,
): Uint8Array {
  // 1. Extract elements from the page
  const { elements } = evaluatePageWithElements(pageDict, resolve);

  // 2. Query which elements overlap the redaction rects
  const toRemove: PageElement[] = [];
  for (const rect of rects) {
    toRemove.push(...queryElementsInRect(elements, rect));
  }
  // Deduplicate by id
  const unique = [...new Map(toRemove.map(e => [e.id, e])).values()];

  // 3. Log preview if verbose
  if (options?.verbose !== false) {
    for (const rect of rects) {
      const preview = getRedactionPreview(elements, rect);
      console.log(formatRedactionLog(preview));
    }
  }

  // 4. Apply element-based redaction
  return applyElementRedaction(contentStream, unique, rects, { ...options, verbose: false });
}
