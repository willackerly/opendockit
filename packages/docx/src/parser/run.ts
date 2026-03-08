/**
 * Run parser — extracts text and formatting from a `<w:r>` element.
 *
 * A "run" is a contiguous stretch of text with uniform character-level
 * formatting (bold, italic, font, size, color, etc.). Run properties
 * live in the optional `<w:rPr>` child element.
 *
 * Reference: ECMA-376, Part 1, Section 17.3.2 (Run).
 */

import type { XmlElement } from '@opendockit/core';
import { halfPointsToPt } from '@opendockit/core';
import type { RunIR } from '../model/document-ir.js';

/**
 * Parse a `<w:r>` element into a {@link RunIR}.
 *
 * Extracts text from `<w:t>` children and formatting from `<w:rPr>`.
 * Handles `<w:br/>` (line break) and `<w:tab/>` (tab character).
 */
export function parseRun(runEl: XmlElement): RunIR {
  const rPr = runEl.child('w:rPr');
  const run: RunIR = {
    text: extractRunText(runEl),
    ...parseRunProperties(rPr),
  };
  return run;
}

/**
 * Parse run properties from a `<w:rPr>` element.
 *
 * Can be called standalone for style default run properties
 * (e.g., from `<w:rPrDefault>` or style `<w:rPr>`).
 */
export function parseRunProperties(rPr: XmlElement | undefined): Partial<RunIR> {
  if (rPr === undefined) return {};

  const result: Partial<RunIR> = {};

  // Bold: <w:b/> or <w:b w:val="true"/>
  const bEl = rPr.child('w:b');
  if (bEl !== undefined) {
    result.bold = parseBooleanToggle(bEl);
  }

  // Italic: <w:i/> or <w:i w:val="true"/>
  const iEl = rPr.child('w:i');
  if (iEl !== undefined) {
    result.italic = parseBooleanToggle(iEl);
  }

  // Underline: <w:u w:val="single"/> (any non-"none" value means underlined)
  const uEl = rPr.child('w:u');
  if (uEl !== undefined) {
    const uVal = uEl.attr('w:val');
    result.underline = uVal !== undefined && uVal !== 'none';
  }

  // Strikethrough: <w:strike/> or <w:strike w:val="true"/>
  const strikeEl = rPr.child('w:strike');
  if (strikeEl !== undefined) {
    result.strikethrough = parseBooleanToggle(strikeEl);
  }

  // Font size: <w:sz w:val="24"/> (half-points, so 24 = 12pt)
  const szEl = rPr.child('w:sz');
  if (szEl !== undefined) {
    const szVal = szEl.attr('w:val');
    if (szVal !== undefined) {
      const halfPts = parseInt(szVal, 10);
      if (!Number.isNaN(halfPts)) {
        result.fontSize = halfPointsToPt(halfPts);
      }
    }
  }

  // Font family: <w:rFonts w:ascii="Calibri"/>
  const rFonts = rPr.child('w:rFonts');
  if (rFonts !== undefined) {
    // Priority: w:ascii > w:hAnsi > w:cs > w:eastAsia
    const fontName =
      rFonts.attr('w:ascii') ??
      rFonts.attr('w:hAnsi') ??
      rFonts.attr('w:cs') ??
      rFonts.attr('w:eastAsia');
    if (fontName !== undefined) {
      result.fontFamily = fontName;
    }
  }

  // Text color: <w:color w:val="FF0000"/>
  const colorEl = rPr.child('w:color');
  if (colorEl !== undefined) {
    const colorVal = colorEl.attr('w:val');
    if (colorVal !== undefined && colorVal !== 'auto') {
      result.color = colorVal;
    }
  }

  // Vertical alignment: <w:vertAlign w:val="superscript"/>
  const vertAlign = rPr.child('w:vertAlign');
  if (vertAlign !== undefined) {
    const vaVal = vertAlign.attr('w:val');
    if (vaVal === 'superscript') {
      result.superscript = true;
    } else if (vaVal === 'subscript') {
      result.subscript = true;
    }
  }

  return result;
}

/**
 * Extract the text content from a `<w:r>` element.
 *
 * Concatenates text from all `<w:t>` children, and substitutes
 * `<w:br/>` with newline and `<w:tab/>` with tab characters.
 */
function extractRunText(runEl: XmlElement): string {
  const parts: string[] = [];

  for (const child of runEl.children) {
    if (child.is('w:t')) {
      parts.push(child.text());
    } else if (child.is('w:br')) {
      parts.push('\n');
    } else if (child.is('w:tab')) {
      parts.push('\t');
    }
  }

  return parts.join('');
}

/**
 * Parse a WordprocessingML boolean toggle property.
 *
 * Elements like `<w:b/>` (with no val attribute) mean "true".
 * `<w:b w:val="false"/>` or `<w:b w:val="0"/>` mean "false".
 */
function parseBooleanToggle(el: XmlElement): boolean {
  const val = el.attr('w:val');
  if (val === undefined) return true; // bare element = true
  const lower = val.toLowerCase();
  return lower !== '0' && lower !== 'false' && lower !== 'off';
}
