/**
 * Paragraph parser — extracts structure and formatting from a `<w:p>` element.
 *
 * A paragraph contains zero or more runs (`<w:r>`) and optional paragraph
 * properties (`<w:pPr>`). Properties include alignment, spacing, indentation,
 * and numbering/bullet references.
 *
 * Reference: ECMA-376, Part 1, Section 17.3.1 (Paragraphs).
 */

import type { XmlElement } from '@opendockit/core';
import { dxaToPt } from '@opendockit/core';
import type { ParagraphIR, ParagraphAlignment } from '../model/document-ir.js';
import { parseRun } from './run.js';

/** Valid OOXML alignment values mapped to our alignment type. */
const ALIGNMENT_MAP: Record<string, ParagraphAlignment> = {
  left: 'left',
  start: 'left',
  center: 'center',
  right: 'right',
  end: 'right',
  both: 'justify',
  distribute: 'justify',
};

/**
 * Parse a `<w:p>` element into a {@link ParagraphIR}.
 *
 * Extracts paragraph properties from `<w:pPr>` and runs from `<w:r>` children.
 */
export function parseParagraph(pEl: XmlElement): ParagraphIR {
  const pPr = pEl.child('w:pPr');
  const runs = pEl.allChildren('w:r').map(parseRun);

  const para: ParagraphIR = { runs };

  if (pPr !== undefined) {
    parseParagraphProperties(pPr, para);
  }

  return para;
}

/**
 * Parse paragraph properties from a `<w:pPr>` element and populate the
 * given {@link ParagraphIR} object.
 */
function parseParagraphProperties(pPr: XmlElement, para: ParagraphIR): void {
  // Style reference: <w:pStyle w:val="Heading1"/>
  const pStyle = pPr.child('w:pStyle');
  if (pStyle !== undefined) {
    const styleVal = pStyle.attr('w:val');
    if (styleVal !== undefined) {
      para.styleId = styleVal;
    }
  }

  // Alignment: <w:jc w:val="center"/>
  const jc = pPr.child('w:jc');
  if (jc !== undefined) {
    const jcVal = jc.attr('w:val');
    if (jcVal !== undefined && jcVal in ALIGNMENT_MAP) {
      para.alignment = ALIGNMENT_MAP[jcVal];
    }
  }

  // Spacing: <w:spacing w:before="240" w:after="120" w:line="276" w:lineRule="auto"/>
  const spacing = pPr.child('w:spacing');
  if (spacing !== undefined) {
    parseSpacing(spacing, para);
  }

  // Indentation: <w:ind w:left="720" w:right="0" w:firstLine="360"/>
  const ind = pPr.child('w:ind');
  if (ind !== undefined) {
    parseIndentation(ind, para);
  }

  // Numbering: <w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>
  const numPr = pPr.child('w:numPr');
  if (numPr !== undefined) {
    parseNumbering(numPr, para);
  }
}

/**
 * Parse spacing properties from a `<w:spacing>` element.
 *
 * - `w:before` / `w:after` are in twips (DXA).
 * - `w:line` with `w:lineRule="auto"` is in 240ths of a line (240 = single spacing).
 * - `w:line` with other lineRule values is in twips.
 */
function parseSpacing(spacingEl: XmlElement, para: ParagraphIR): void {
  const beforeVal = spacingEl.attr('w:before');
  if (beforeVal !== undefined) {
    const dxa = parseInt(beforeVal, 10);
    if (!Number.isNaN(dxa)) {
      para.spacingBefore = dxaToPt(dxa);
    }
  }

  const afterVal = spacingEl.attr('w:after');
  if (afterVal !== undefined) {
    const dxa = parseInt(afterVal, 10);
    if (!Number.isNaN(dxa)) {
      para.spacingAfter = dxaToPt(dxa);
    }
  }

  const lineVal = spacingEl.attr('w:line');
  const lineRule = spacingEl.attr('w:lineRule');
  if (lineVal !== undefined) {
    const lineNum = parseInt(lineVal, 10);
    if (!Number.isNaN(lineNum)) {
      if (lineRule === 'auto' || lineRule === undefined) {
        // Auto line spacing: value is in 240ths of a line (240 = 1.0x)
        para.lineSpacing = lineNum / 240;
      } else {
        // Exact or atLeast: value is in twips (DXA)
        // Store as points; layout can interpret lineRule if needed
        para.lineSpacing = dxaToPt(lineNum);
      }
    }
  }
}

/**
 * Parse indentation properties from a `<w:ind>` element.
 * All values are in twips (DXA).
 */
function parseIndentation(indEl: XmlElement, para: ParagraphIR): void {
  const leftVal = indEl.attr('w:left') ?? indEl.attr('w:start');
  if (leftVal !== undefined) {
    const dxa = parseInt(leftVal, 10);
    if (!Number.isNaN(dxa)) {
      para.indentLeft = dxaToPt(dxa);
    }
  }

  const rightVal = indEl.attr('w:right') ?? indEl.attr('w:end');
  if (rightVal !== undefined) {
    const dxa = parseInt(rightVal, 10);
    if (!Number.isNaN(dxa)) {
      para.indentRight = dxaToPt(dxa);
    }
  }

  const firstLineVal = indEl.attr('w:firstLine');
  if (firstLineVal !== undefined) {
    const dxa = parseInt(firstLineVal, 10);
    if (!Number.isNaN(dxa)) {
      para.indentFirstLine = dxaToPt(dxa);
    }
  }

  // Hanging indent is the opposite of first-line indent
  const hangingVal = indEl.attr('w:hanging');
  if (hangingVal !== undefined) {
    const dxa = parseInt(hangingVal, 10);
    if (!Number.isNaN(dxa)) {
      para.indentFirstLine = -dxaToPt(dxa);
    }
  }
}

/**
 * Parse numbering properties from a `<w:numPr>` element.
 * Extracts the list level for basic bullet/numbering support.
 */
function parseNumbering(numPr: XmlElement, para: ParagraphIR): void {
  const ilvl = numPr.child('w:ilvl');
  if (ilvl !== undefined) {
    const levelVal = ilvl.attr('w:val');
    if (levelVal !== undefined) {
      const level = parseInt(levelVal, 10);
      if (!Number.isNaN(level)) {
        para.numberingLevel = level;
      }
    }
  }

  // Basic bullet support: if we have a numbering reference, add a default bullet
  const numId = numPr.child('w:numId');
  if (numId !== undefined) {
    const numIdVal = numId.attr('w:val');
    if (numIdVal !== undefined && numIdVal !== '0') {
      // Default bullet character; proper resolution from numbering.xml
      // would override this, but for scaffold we use a generic bullet.
      if (para.bulletChar === undefined) {
        para.bulletChar = '\u2022';
      }
    }
  }
}
