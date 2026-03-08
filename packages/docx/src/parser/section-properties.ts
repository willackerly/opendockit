/**
 * Section properties parser — extracts page dimensions and margins
 * from `<w:sectPr>` elements.
 *
 * Section properties define the page layout for a document section,
 * including page size, margins, orientation, headers/footers, and
 * column layout.
 *
 * All OOXML values are in twips (DXA = twentieths of a point).
 *
 * Reference: ECMA-376, Part 1, Section 17.6.17 (sectPr).
 */

import type { XmlElement } from '@opendockit/core';
import { dxaToPt } from '@opendockit/core';
import type { SectionIR } from '../model/document-ir.js';

// ---------------------------------------------------------------------------
// Constants — US Letter defaults
// ---------------------------------------------------------------------------

/** US Letter width in twips: 8.5" * 1440 DXA/inch = 12240 */
const DEFAULT_PAGE_WIDTH_DXA = 12240;
/** US Letter height in twips: 11" * 1440 DXA/inch = 15840 */
const DEFAULT_PAGE_HEIGHT_DXA = 15840;
/** Default margin: 1" = 1440 twips */
const DEFAULT_MARGIN_DXA = 1440;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a `<w:sectPr>` element into partial {@link SectionIR} properties
 * (page size and margins).
 *
 * @returns An object with page dimensions and margins in points.
 */
export function parseSectionProperties(
  sectPr: XmlElement | undefined
): Pick<
  SectionIR,
  'pageWidth' | 'pageHeight' | 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight'
> {
  if (sectPr === undefined) {
    return defaultSectionDimensions();
  }

  // Page size: <w:pgSz w:w="12240" w:h="15840"/>
  const pgSz = sectPr.child('w:pgSz');
  let widthDxa = DEFAULT_PAGE_WIDTH_DXA;
  let heightDxa = DEFAULT_PAGE_HEIGHT_DXA;

  if (pgSz !== undefined) {
    const w = pgSz.attr('w:w');
    const h = pgSz.attr('w:h');
    if (w !== undefined) {
      const parsed = parseInt(w, 10);
      if (!Number.isNaN(parsed)) widthDxa = parsed;
    }
    if (h !== undefined) {
      const parsed = parseInt(h, 10);
      if (!Number.isNaN(parsed)) heightDxa = parsed;
    }
  }

  // Page margins: <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
  const pgMar = sectPr.child('w:pgMar');
  let topDxa = DEFAULT_MARGIN_DXA;
  let rightDxa = DEFAULT_MARGIN_DXA;
  let bottomDxa = DEFAULT_MARGIN_DXA;
  let leftDxa = DEFAULT_MARGIN_DXA;

  if (pgMar !== undefined) {
    topDxa = parseDxaAttr(pgMar, 'w:top', DEFAULT_MARGIN_DXA);
    rightDxa = parseDxaAttr(pgMar, 'w:right', DEFAULT_MARGIN_DXA);
    bottomDxa = parseDxaAttr(pgMar, 'w:bottom', DEFAULT_MARGIN_DXA);
    leftDxa = parseDxaAttr(pgMar, 'w:left', DEFAULT_MARGIN_DXA);
  }

  return {
    pageWidth: dxaToPt(widthDxa),
    pageHeight: dxaToPt(heightDxa),
    marginTop: dxaToPt(topDxa),
    marginBottom: dxaToPt(bottomDxa),
    marginLeft: dxaToPt(leftDxa),
    marginRight: dxaToPt(rightDxa),
  };
}

/**
 * Return default section dimensions (US Letter, 1" margins) in points.
 */
export function defaultSectionDimensions(): Pick<
  SectionIR,
  'pageWidth' | 'pageHeight' | 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight'
> {
  return {
    pageWidth: dxaToPt(DEFAULT_PAGE_WIDTH_DXA),
    pageHeight: dxaToPt(DEFAULT_PAGE_HEIGHT_DXA),
    marginTop: dxaToPt(DEFAULT_MARGIN_DXA),
    marginBottom: dxaToPt(DEFAULT_MARGIN_DXA),
    marginLeft: dxaToPt(DEFAULT_MARGIN_DXA),
    marginRight: dxaToPt(DEFAULT_MARGIN_DXA),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse an integer DXA attribute, returning a default if absent or invalid. */
function parseDxaAttr(el: XmlElement, name: string, defaultValue: number): number {
  const raw = el.attr(name);
  if (raw === undefined) return defaultValue;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? defaultValue : n;
}
