/**
 * Ground Truth Extractor — parses `pdftotext -bbox-layout` XML output
 * into normalized element structures for element-level structural diffing.
 *
 * Requires Poppler's `pdftotext` to be installed and on PATH.
 */

import { execFileSync } from 'child_process';

// ─── Types ──────────────────────────────────────────────

export interface GroundTruthWord {
  text: string;
  x: number; // xMin (PDF points, top-left origin)
  y: number; // yMin
  width: number; // xMax - xMin
  height: number; // yMax - yMin
}

export interface GroundTruthLine {
  x: number;
  y: number;
  width: number;
  height: number;
  words: GroundTruthWord[];
}

export interface GroundTruthBlock {
  x: number;
  y: number;
  width: number;
  height: number;
  lines: GroundTruthLine[];
}

export interface GroundTruthPage {
  pageNum: number; // 1-based
  width: number; // points
  height: number; // points
  words: GroundTruthWord[];
  lines: GroundTruthLine[];
  blocks: GroundTruthBlock[];
}

// ─── Parsing Helpers ────────────────────────────────────

/** Parse a bounding box from xMin/yMin/xMax/yMax attributes */
function parseBBox(tag: string): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const xMin = parseFloat(attr(tag, 'xMin'));
  const yMin = parseFloat(attr(tag, 'yMin'));
  const xMax = parseFloat(attr(tag, 'xMax'));
  const yMax = parseFloat(attr(tag, 'yMax'));
  return {
    x: xMin,
    y: yMin,
    width: xMax - xMin,
    height: yMax - yMin,
  };
}

/** Extract a named attribute value from an XML tag string */
function attr(tag: string, name: string): string {
  const re = new RegExp(`${name}="([^"]*)"`, 'i');
  const m = tag.match(re);
  return m ? m[1] : '';
}

/** Decode basic HTML entities */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

/**
 * Parse the XML output from `pdftotext -bbox-layout` for a single page.
 *
 * The format is:
 * ```xml
 * <page width="..." height="...">
 *   <flow>
 *     <block xMin="..." yMin="..." xMax="..." yMax="...">
 *       <line xMin="..." yMin="..." xMax="..." yMax="...">
 *         <word xMin="..." yMin="..." xMax="..." yMax="...">text</word>
 *         ...
 *       </line>
 *     </block>
 *   </flow>
 * </page>
 * ```
 */
function parsePage(pageXml: string, pageNum: number): GroundTruthPage {
  // Extract page dimensions
  const pageTagMatch = pageXml.match(
    /<page\s+width="([^"]+)"\s+height="([^"]+)"/
  );
  if (!pageTagMatch) {
    throw new Error(`Could not find <page> tag in XML for page ${pageNum}`);
  }
  const width = parseFloat(pageTagMatch[1]);
  const height = parseFloat(pageTagMatch[2]);

  const allWords: GroundTruthWord[] = [];
  const allLines: GroundTruthLine[] = [];
  const allBlocks: GroundTruthBlock[] = [];

  // Extract blocks
  const blockRe =
    /<block\s+xMin="[^"]*"\s+yMin="[^"]*"\s+xMax="[^"]*"\s+yMax="[^"]*">[\s\S]*?<\/block>/g;
  let blockMatch;
  while ((blockMatch = blockRe.exec(pageXml)) !== null) {
    const blockStr = blockMatch[0];
    const blockTag = blockStr.match(
      /<block\s+xMin="[^"]*"\s+yMin="[^"]*"\s+xMax="[^"]*"\s+yMax="[^"]*">/
    )![0];
    const blockBBox = parseBBox(blockTag);

    const blockLines: GroundTruthLine[] = [];

    // Extract lines within block
    const lineRe =
      /<line\s+xMin="[^"]*"\s+yMin="[^"]*"\s+xMax="[^"]*"\s+yMax="[^"]*">[\s\S]*?<\/line>/g;
    let lineMatch;
    while ((lineMatch = lineRe.exec(blockStr)) !== null) {
      const lineStr = lineMatch[0];
      const lineTag = lineStr.match(
        /<line\s+xMin="[^"]*"\s+yMin="[^"]*"\s+xMax="[^"]*"\s+yMax="[^"]*">/
      )![0];
      const lineBBox = parseBBox(lineTag);

      const lineWords: GroundTruthWord[] = [];

      // Extract words within line
      const wordRe =
        /<word\s+xMin="([^"]*)"\s+yMin="([^"]*)"\s+xMax="([^"]*)"\s+yMax="([^"]*)">([\s\S]*?)<\/word>/g;
      let wordMatch;
      while ((wordMatch = wordRe.exec(lineStr)) !== null) {
        const xMin = parseFloat(wordMatch[1]);
        const yMin = parseFloat(wordMatch[2]);
        const xMax = parseFloat(wordMatch[3]);
        const yMax = parseFloat(wordMatch[4]);
        const text = decodeEntities(wordMatch[5]);

        const word: GroundTruthWord = {
          text,
          x: xMin,
          y: yMin,
          width: xMax - xMin,
          height: yMax - yMin,
        };
        lineWords.push(word);
        allWords.push(word);
      }

      const line: GroundTruthLine = {
        ...lineBBox,
        words: lineWords,
      };
      blockLines.push(line);
      allLines.push(line);
    }

    const block: GroundTruthBlock = {
      ...blockBBox,
      lines: blockLines,
    };
    allBlocks.push(block);
  }

  return {
    pageNum,
    width,
    height,
    words: allWords,
    lines: allLines,
    blocks: allBlocks,
  };
}

// ─── Public API ─────────────────────────────────────────

/**
 * Extract ground truth for a single page of a PDF.
 *
 * @param pdfPath - Absolute path to the PDF file
 * @param pageNum - 1-based page number
 * @returns Parsed ground truth with words, lines, and blocks
 */
export async function extractGroundTruth(
  pdfPath: string,
  pageNum: number
): Promise<GroundTruthPage> {
  const xml = execFileSync(
    'pdftotext',
    ['-bbox-layout', '-f', String(pageNum), '-l', String(pageNum), pdfPath, '-'],
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
  );

  // The XML contains a single <page> element
  const pageMatch = xml.match(/<page[\s\S]*?<\/page>/);
  if (!pageMatch) {
    throw new Error(
      `No <page> element found in pdftotext output for page ${pageNum}`
    );
  }

  return parsePage(pageMatch[0], pageNum);
}

/**
 * Extract ground truth for all pages of a PDF.
 *
 * Runs pdftotext once for the entire document and splits by page.
 *
 * @param pdfPath - Absolute path to the PDF file
 * @returns Array of parsed ground truth pages (1-indexed pageNum)
 */
export async function extractAllPages(
  pdfPath: string
): Promise<GroundTruthPage[]> {
  const xml = execFileSync('pdftotext', ['-bbox-layout', pdfPath, '-'], {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  });

  const pages: GroundTruthPage[] = [];
  const pageRe = /<page[\s\S]*?<\/page>/g;
  let match;
  let pageNum = 1;
  while ((match = pageRe.exec(xml)) !== null) {
    pages.push(parsePage(match[0], pageNum));
    pageNum++;
  }

  return pages;
}
