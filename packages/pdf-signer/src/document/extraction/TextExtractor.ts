/**
 * TextExtractor — extract text content from PDF pages.
 *
 * Parses content streams, tracks graphics state (CTM, text matrix, font, spacing),
 * decodes character codes via FontDecoder, and reconstructs readable text with
 * line and paragraph breaks.
 *
 * Reuses tokenizeContentStream() and parseOperations() from the redaction module.
 */

import {
  COSName,
  COSArray,
  COSDictionary,
  COSStream,
  COSObjectReference,
} from '../../pdfbox/cos/COSTypes.js';
import type { COSBase } from '../../pdfbox/cos/COSBase.js';
import { tokenizeContentStream, parseOperations } from '../redaction/ContentStreamRedactor.js';
import type { CSToken, CSOperation } from '../redaction/ContentStreamRedactor.js';
import { buildFontDecoder, type FontDecoder, type ObjectResolver } from './FontDecoder.js';
import { getDecompressedStreamData } from './StreamDecoder.js';
import { loadAndParseDocument, type DocumentParseResult } from './DocumentLoader.js';
import { identityMatrix, multiplyMatrices, transformPoint } from '../../util/matrix-ops.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
  fontSize: number;
}

export interface PageText {
  pageIndex: number;
  items: TextItem[];
  /** Reconstructed full text with line and paragraph breaks. */
  text: string;
}

export interface TextExtractionOptions {
  /** Extract only these page indices (0-based). If omitted, all pages. */
  pages?: number[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract text from a PDF, returning structured text items per page.
 */
export async function extractText(
  pdfBytes: Uint8Array,
  options?: TextExtractionOptions,
): Promise<PageText[]> {
  const doc = loadAndParseDocument(pdfBytes);
  const pageIndices = options?.pages;
  const results: PageText[] = [];

  const pageList = getPageList(doc);

  for (let i = 0; i < pageList.length; i++) {
    if (pageIndices && !pageIndices.includes(i)) continue;

    const { pageDict } = pageList[i];
    const items = extractPageText(pageDict, doc.resolve);
    const text = joinTextItems(items);
    results.push({ pageIndex: i, items, text });
  }

  return results;
}

/**
 * Extract all text as a single string (convenience).
 */
export async function extractTextContent(
  pdfBytes: Uint8Array,
  options?: TextExtractionOptions,
): Promise<string> {
  const pages = await extractText(pdfBytes, options);
  return pages.map(p => p.text).join('\n\n');
}

// ---------------------------------------------------------------------------
// Page text extraction
// ---------------------------------------------------------------------------

export function extractPageText(
  pageDict: COSDictionary,
  resolve: ObjectResolver,
): TextItem[] {
  const contentData = getPageContentData(pageDict, resolve);
  if (!contentData || contentData.length === 0) return [];

  const fontCache = new Map<string, FontDecoder>();
  const resourcesDict = getResourcesDict(pageDict, resolve);

  const tokens = tokenizeContentStream(contentData);
  const operations = parseOperations(tokens);

  return processOperations(operations, resourcesDict, resolve, fontCache);
}

// ---------------------------------------------------------------------------
// Content stream retrieval
// ---------------------------------------------------------------------------

function getPageContentData(
  pageDict: COSDictionary,
  resolve: ObjectResolver,
): Uint8Array | null {
  const contents = resolveItem(pageDict, 'Contents', resolve);

  if (contents instanceof COSStream) {
    return getDecompressedStreamData(contents);
  }

  if (contents instanceof COSArray) {
    // Multiple content streams — concatenate
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < contents.size(); i++) {
      let el = contents.get(i);
      if (el instanceof COSObjectReference) {
        el = resolve(el);
      }
      if (el instanceof COSStream) {
        const data = getDecompressedStreamData(el);
        chunks.push(data);
        // Add a space separator between streams
        chunks.push(new Uint8Array([0x20]));
      }
    }
    if (chunks.length === 0) return null;

    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  return null;
}

function getResourcesDict(
  pageDict: COSDictionary,
  resolve: ObjectResolver,
): COSDictionary | undefined {
  const resources = resolveItem(pageDict, 'Resources', resolve);
  return resources instanceof COSDictionary ? resources : undefined;
}

// ---------------------------------------------------------------------------
// Page tree traversal (for extractText standalone usage)
// ---------------------------------------------------------------------------

function getPageList(
  doc: DocumentParseResult,
): Array<{ pageDict: COSDictionary }> {
  const pages: Array<{ pageDict: COSDictionary }> = [];
  const catalog = doc.resolve(doc.catalogRef);
  if (!(catalog instanceof COSDictionary)) return pages;

  const pagesEntry = resolveItem(catalog, 'Pages', doc.resolve);
  if (!(pagesEntry instanceof COSDictionary)) return pages;

  walkPageTree(pagesEntry, pages, doc.resolve, []);
  return pages;
}

function walkPageTree(
  node: COSDictionary,
  result: Array<{ pageDict: COSDictionary }>,
  resolve: ObjectResolver,
  parentChain: COSDictionary[],
): void {
  const kidsEntry = resolveItem(node, 'Kids', resolve);
  if (!(kidsEntry instanceof COSArray)) return;

  for (let i = 0; i < kidsEntry.size(); i++) {
    let kid = kidsEntry.get(i);
    if (kid instanceof COSObjectReference) {
      kid = resolve(kid);
    }
    if (!(kid instanceof COSDictionary)) continue;

    const typeEntry = kid.getItem('Type');
    const typeName = typeEntry instanceof COSName ? typeEntry.getName() : undefined;

    if (typeName === 'Pages') {
      walkPageTree(kid, result, resolve, [...parentChain, node]);
    } else {
      // Apply inherited properties
      applyInherited(kid, [...parentChain, node]);
      result.push({ pageDict: kid });
    }
  }
}

function applyInherited(pageDict: COSDictionary, chain: COSDictionary[]): void {
  for (const key of ['MediaBox', 'CropBox', 'Resources', 'Rotate']) {
    if (pageDict.getItem(key)) continue;
    for (let i = chain.length - 1; i >= 0; i--) {
      const val = chain[i].getItem(key);
      if (val) {
        pageDict.setItem(key, val);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Graphics state machine
// ---------------------------------------------------------------------------

interface TextState {
  // Transformation matrices
  ctm: number[];           // Current Transformation Matrix [a,b,c,d,e,f]
  textMatrix: number[];    // Text matrix
  textLineMatrix: number[]; // Text line matrix

  // Text state parameters
  fontSize: number;
  charSpacing: number;     // Tc
  wordSpacing: number;     // Tw
  horizontalScaling: number; // Tz (percentage, 100 = normal)
  textLeading: number;     // TL
  textRise: number;        // Ts
  renderMode: number;      // Tr

  // Current font
  currentFont: FontDecoder | null;
  currentFontName: string;
}

function cloneState(s: TextState): TextState {
  return {
    ctm: [...s.ctm],
    textMatrix: [...s.textMatrix],
    textLineMatrix: [...s.textLineMatrix],
    fontSize: s.fontSize,
    charSpacing: s.charSpacing,
    wordSpacing: s.wordSpacing,
    horizontalScaling: s.horizontalScaling,
    textLeading: s.textLeading,
    textRise: s.textRise,
    renderMode: s.renderMode,
    currentFont: s.currentFont,
    currentFontName: s.currentFontName,
  };
}


// ---------------------------------------------------------------------------
// Operation processing
// ---------------------------------------------------------------------------

function processOperations(
  operations: CSOperation[],
  resourcesDict: COSDictionary | undefined,
  resolve: ObjectResolver,
  fontCache: Map<string, FontDecoder>,
): TextItem[] {
  const items: TextItem[] = [];
  const stateStack: TextState[] = [];

  let state: TextState = {
    ctm: identityMatrix(),
    textMatrix: identityMatrix(),
    textLineMatrix: identityMatrix(),
    fontSize: 12,
    charSpacing: 0,
    wordSpacing: 0,
    horizontalScaling: 100,
    textLeading: 0,
    textRise: 0,
    renderMode: 0,
    currentFont: null,
    currentFontName: '',
  };

  for (const op of operations) {
    const { operator, operands } = op;

    switch (operator) {
      // --- Graphics state ---
      case 'q':
        stateStack.push(cloneState(state));
        break;

      case 'Q':
        if (stateStack.length > 0) {
          state = stateStack.pop()!;
        }
        break;

      case 'cm':
        if (operands.length >= 6) {
          const nums = operands.map(o => num(o));
          state.ctm = multiplyMatrices(nums, state.ctm);
        }
        break;

      // --- Text state ---
      case 'BT':
        state.textMatrix = identityMatrix();
        state.textLineMatrix = identityMatrix();
        break;

      case 'ET':
        break;

      case 'Tf':
        if (operands.length >= 2) {
          const fontName = operands[0].type === 'name' ? operands[0].value : '';
          state.fontSize = num(operands[1]);
          state.currentFontName = fontName;

          // Look up or build font decoder
          if (!fontCache.has(fontName) && resourcesDict) {
            const fontDict = lookupFont(fontName, resourcesDict, resolve);
            if (fontDict) {
              fontCache.set(fontName, buildFontDecoder(fontDict, resolve));
            }
          }
          state.currentFont = fontCache.get(fontName) ?? null;
        }
        break;

      case 'Tc':
        if (operands.length >= 1) state.charSpacing = num(operands[0]);
        break;

      case 'Tw':
        if (operands.length >= 1) state.wordSpacing = num(operands[0]);
        break;

      case 'Tz':
        if (operands.length >= 1) state.horizontalScaling = num(operands[0]);
        break;

      case 'TL':
        if (operands.length >= 1) state.textLeading = num(operands[0]);
        break;

      case 'Ts':
        if (operands.length >= 1) state.textRise = num(operands[0]);
        break;

      case 'Tr':
        if (operands.length >= 1) state.renderMode = num(operands[0]);
        break;

      case 'Tm':
        if (operands.length >= 6) {
          const nums = operands.map(o => num(o));
          state.textMatrix = [...nums];
          state.textLineMatrix = [...nums];
        }
        break;

      case 'Td': {
        if (operands.length >= 2) {
          const tx = num(operands[0]);
          const ty = num(operands[1]);
          state.textLineMatrix = multiplyMatrices([1, 0, 0, 1, tx, ty], state.textLineMatrix);
          state.textMatrix = [...state.textLineMatrix];
        }
        break;
      }

      case 'TD': {
        if (operands.length >= 2) {
          const tx = num(operands[0]);
          const ty = num(operands[1]);
          state.textLeading = -ty;
          state.textLineMatrix = multiplyMatrices([1, 0, 0, 1, tx, ty], state.textLineMatrix);
          state.textMatrix = [...state.textLineMatrix];
        }
        break;
      }

      case 'T*': {
        state.textLineMatrix = multiplyMatrices(
          [1, 0, 0, 1, 0, -state.textLeading],
          state.textLineMatrix,
        );
        state.textMatrix = [...state.textLineMatrix];
        break;
      }

      // --- Text showing operators ---
      case 'Tj': {
        const textStr = decodeStringOperand(operands, state);
        if (textStr) {
          const item = createTextItem(textStr, state);
          if (item) items.push(item);
          advanceTextPosition(textStr, state);
        }
        break;
      }

      case 'TJ': {
        // TJ array: mix of strings and numeric adjustments
        const tjItems = decodeTJArray(operands, state);
        for (const tj of tjItems) {
          if (typeof tj === 'string') {
            if (tj.length > 0) {
              const item = createTextItem(tj, state);
              if (item) items.push(item);
              advanceTextPosition(tj, state);
            }
          } else {
            // Numeric adjustment: move text position
            // Negative = move right, positive = move left (in thousandths of text space)
            const adjustment = -tj / 1000 * state.fontSize * (state.horizontalScaling / 100);
            state.textMatrix = multiplyMatrices(
              [1, 0, 0, 1, adjustment, 0],
              state.textMatrix,
            );
          }
        }
        break;
      }

      case '\'': {
        // Move to next line and show text
        state.textLineMatrix = multiplyMatrices(
          [1, 0, 0, 1, 0, -state.textLeading],
          state.textLineMatrix,
        );
        state.textMatrix = [...state.textLineMatrix];
        const textStr = decodeStringOperand(operands, state);
        if (textStr) {
          const item = createTextItem(textStr, state);
          if (item) items.push(item);
          advanceTextPosition(textStr, state);
        }
        break;
      }

      case '"': {
        // Set word/char spacing, move to next line, show text
        if (operands.length >= 3) {
          state.wordSpacing = num(operands[0]);
          state.charSpacing = num(operands[1]);
        }
        state.textLineMatrix = multiplyMatrices(
          [1, 0, 0, 1, 0, -state.textLeading],
          state.textLineMatrix,
        );
        state.textMatrix = [...state.textLineMatrix];
        const textStr = decodeStringOperand(operands.length >= 3 ? [operands[2]] : operands, state);
        if (textStr) {
          const item = createTextItem(textStr, state);
          if (item) items.push(item);
          advanceTextPosition(textStr, state);
        }
        break;
      }
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// String operand decoding
// ---------------------------------------------------------------------------

function decodeStringOperand(operands: CSToken[], state: TextState): string | null {
  if (operands.length === 0) return null;

  const token = operands[0];
  const font = state.currentFont;

  if (token.type === 'string') {
    // Literal string — convert to bytes
    const bytes = new Uint8Array(token.value.length);
    for (let i = 0; i < token.value.length; i++) {
      bytes[i] = token.value.charCodeAt(i) & 0xff;
    }
    return font ? font.decode(bytes) : latinDecode(bytes);
  }

  if (token.type === 'hexstring') {
    if (font) return font.decodeHex(token.value);
    return hexToLatin(token.value);
  }

  return null;
}

function decodeTJArray(
  operands: CSToken[],
  state: TextState,
): Array<string | number> {
  const result: Array<string | number> = [];
  let inArray = false;

  for (const token of operands) {
    if (token.type === 'array_start') {
      inArray = true;
      continue;
    }
    if (token.type === 'array_end') {
      inArray = false;
      continue;
    }

    if (!inArray) continue;

    if (token.type === 'number') {
      result.push(num(token));
    } else if (token.type === 'string') {
      const bytes = new Uint8Array(token.value.length);
      for (let i = 0; i < token.value.length; i++) {
        bytes[i] = token.value.charCodeAt(i) & 0xff;
      }
      result.push(state.currentFont ? state.currentFont.decode(bytes) : latinDecode(bytes));
    } else if (token.type === 'hexstring') {
      result.push(
        state.currentFont
          ? state.currentFont.decodeHex(token.value)
          : hexToLatin(token.value),
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Text item creation
// ---------------------------------------------------------------------------

function createTextItem(text: string, state: TextState): TextItem | null {
  if (text.length === 0) return null;

  // Get position in user space
  const [x, y] = transformPoint(
    state.ctm,
    ...transformPoint(state.textMatrix, 0, state.textRise),
  );

  const fontSize = Math.abs(state.fontSize);
  const scaleX = Math.abs(state.ctm[0]) || 1;
  const height = fontSize * scaleX;

  // Calculate text width
  const width = calculateTextWidth(text, state) * scaleX;

  return {
    text,
    x,
    y,
    width,
    height,
    fontName: state.currentFontName,
    fontSize: state.fontSize,
  };
}

function calculateTextWidth(text: string, state: TextState): number {
  const font = state.currentFont;
  const fontSize = state.fontSize;
  const hScale = state.horizontalScaling / 100;

  let totalWidth = 0;

  if (font) {
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const charWidth = font.getCharWidth(code) / 1000 * fontSize;
      const spacing = text[i] === ' '
        ? state.charSpacing + state.wordSpacing
        : state.charSpacing;
      totalWidth += (charWidth + spacing) * hScale;
    }
  } else {
    // Fallback: estimate 0.6 * fontSize per character
    totalWidth = text.length * fontSize * 0.6 * hScale;
  }

  return totalWidth;
}

function advanceTextPosition(text: string, state: TextState): void {
  const width = calculateTextWidth(text, state);
  state.textMatrix = multiplyMatrices([1, 0, 0, 1, width, 0], state.textMatrix);
}

// ---------------------------------------------------------------------------
// Font lookup
// ---------------------------------------------------------------------------

function lookupFont(
  fontName: string,
  resourcesDict: COSDictionary,
  resolve: ObjectResolver,
): COSDictionary | null {
  const fontsEntry = resolveItem(resourcesDict, 'Font', resolve);
  if (!(fontsEntry instanceof COSDictionary)) return null;

  const fontEntry = resolveItem(fontsEntry, fontName, resolve);
  if (fontEntry instanceof COSDictionary) return fontEntry;

  return null;
}

// ---------------------------------------------------------------------------
// Text reconstruction
// ---------------------------------------------------------------------------

/**
 * Join text items into readable text with line and paragraph breaks.
 * Sort by Y (descending, top-to-bottom), then X (ascending, left-to-right).
 * Group items into lines by Y proximity, detect word gaps by X spacing.
 */
export function joinTextItems(items: TextItem[]): string {
  if (items.length === 0) return '';

  // Sort: top-to-bottom (descending Y), then left-to-right (ascending X)
  const sorted = [...items].sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 1) return yDiff;
    return a.x - b.x;
  });

  // Group into lines by Y proximity
  const lines: TextItem[][] = [];
  let currentLine: TextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    // Same line if Y difference is small relative to font size
    const threshold = Math.max(item.height * 0.3, 2);
    if (Math.abs(item.y - currentY) <= threshold) {
      currentLine.push(item);
    } else {
      // Sort current line by X
      currentLine.sort((a, b) => a.x - b.x);
      lines.push(currentLine);
      currentLine = [item];
      currentY = item.y;
    }
  }
  // Push last line
  currentLine.sort((a, b) => a.x - b.x);
  lines.push(currentLine);

  // Build text from lines
  const lineTexts: string[] = [];
  let prevLineY = Infinity;

  for (const line of lines) {
    let lineText = '';
    for (let i = 0; i < line.length; i++) {
      const item = line[i];
      if (i > 0) {
        // Detect word gap: if the gap between previous item's end and this item's start
        // is larger than a typical character width, insert a space
        const prev = line[i - 1];
        const gap = item.x - (prev.x + prev.width);
        const avgCharWidth = prev.width / Math.max(prev.text.length, 1);
        if (gap > avgCharWidth * 0.3) {
          lineText += ' ';
        }
      }
      lineText += item.text;
    }

    // Detect paragraph break: if the Y gap between lines is significantly
    // larger than a normal line spacing
    if (prevLineY !== Infinity) {
      const lineGap = prevLineY - line[0].y;
      const avgHeight = line[0].height || 12;
      if (lineGap > avgHeight * 1.8) {
        lineTexts.push(''); // Insert paragraph break
      }
    }

    lineTexts.push(lineText);
    prevLineY = line[0].y;
  }

  return lineTexts.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(token: CSToken): number {
  return token.numValue ?? (parseFloat(token.value) || 0);
}

function latinDecode(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  return result;
}

function hexToLatin(hex: string): string {
  let result = '';
  for (let i = 0; i + 1 < hex.length; i += 2) {
    result += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
  }
  return result;
}

function resolveItem(
  dict: COSDictionary,
  key: string,
  resolve: ObjectResolver,
): COSBase | undefined {
  const entry = dict.getItem(key);
  if (entry instanceof COSObjectReference) {
    return resolve(entry);
  }
  return entry;
}
