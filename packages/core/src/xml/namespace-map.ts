/**
 * OOXML namespace constants and prefix mappings.
 *
 * Every OOXML document uses namespace-prefixed tag names (e.g. `a:solidFill`,
 * `p:sp`). This module provides the canonical URI for each prefix and
 * bidirectional lookup maps used by the parser configuration and downstream
 * consumers.
 *
 * Reference: ECMA-376 Part 1, Annex A (namespace URIs).
 * Oracle: python-pptx oxml/ns.py
 */

// ---------------------------------------------------------------------------
// DrawingML (shared across PPTX/DOCX/XLSX)
// ---------------------------------------------------------------------------

/** DrawingML main namespace — shapes, fills, lines, effects, text. */
export const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

/** DrawingML chart namespace. */
export const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';

/** DrawingML diagram namespace. */
export const NS_DGM = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';

/** DrawingML picture namespace. */
export const NS_PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';

/** DrawingML spreadsheet drawing namespace. */
export const NS_XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';

/** DrawingML presentation drawing namespace. */
export const NS_PD = 'http://schemas.openxmlformats.org/drawingml/2006/presentationDrawing';

/** DrawingML word processing drawing namespace. */
export const NS_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';

// ---------------------------------------------------------------------------
// Format-specific
// ---------------------------------------------------------------------------

/** PresentationML main namespace. */
export const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';

/** WordprocessingML main namespace. */
export const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// ---------------------------------------------------------------------------
// Office Document relationships
// ---------------------------------------------------------------------------

/** Office Document relationships namespace. */
export const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// ---------------------------------------------------------------------------
// OPC (Open Packaging Conventions)
// ---------------------------------------------------------------------------

/** OPC Content Types namespace. */
export const NS_CONTENT_TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types';

/** OPC Relationships namespace. */
export const NS_RELATIONSHIPS = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** OPC Core Properties namespace. */
export const NS_CP = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties';

// ---------------------------------------------------------------------------
// Markup Compatibility
// ---------------------------------------------------------------------------

/** Markup Compatibility namespace. */
export const NS_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';

// ---------------------------------------------------------------------------
// Microsoft Office extensions
// ---------------------------------------------------------------------------

/** Drawing 2010 extensions. */
export const NS_A14 = 'http://schemas.microsoft.com/office/drawing/2010/main';

/** Drawing 2014 extensions. */
export const NS_A16 = 'http://schemas.microsoft.com/office/drawing/2014/main';

/** PowerPoint 2010 extensions. */
export const NS_P14 = 'http://schemas.microsoft.com/office/powerpoint/2010/main';

/** Word 2010 processing shape. */
export const NS_WPS = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape';

/** Word 2010 processing canvas. */
export const NS_WPC = 'http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas';

/** Word 2010 processing group. */
export const NS_WPG = 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup';

/** Mac Office 2008 namespace. */
export const NS_MO = 'http://schemas.microsoft.com/office/mac/office/2008/main';

// ---------------------------------------------------------------------------
// Office Document extended/math
// ---------------------------------------------------------------------------

/** Extended properties namespace. */
export const NS_EP = 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties';

/** Office Math namespace. */
export const NS_M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

// ---------------------------------------------------------------------------
// Dublin Core
// ---------------------------------------------------------------------------

/** Dublin Core elements. */
export const NS_DC = 'http://purl.org/dc/elements/1.1/';

/** Dublin Core terms. */
export const NS_DCTERMS = 'http://purl.org/dc/terms/';

/** Dublin Core DCMI Type. */
export const NS_DCMITYPE = 'http://purl.org/dc/dcmitype/';

// ---------------------------------------------------------------------------
// VML / legacy
// ---------------------------------------------------------------------------

/** VML namespace. */
export const NS_V = 'urn:schemas-microsoft-com:vml';

/** VML Office namespace. */
export const NS_O = 'urn:schemas-microsoft-com:office:office';

// ---------------------------------------------------------------------------
// Other
// ---------------------------------------------------------------------------

/** XML Schema Instance namespace. */
export const NS_XSI = 'http://www.w3.org/2001/XMLSchema-instance';

// ---------------------------------------------------------------------------
// Prefix ↔ URI maps
// ---------------------------------------------------------------------------

/**
 * Prefix-to-URI mapping. Used by parser configuration and namespace-aware
 * lookups. Mirrors python-pptx `_nsmap` with additional Microsoft extension
 * prefixes needed for modern OOXML files.
 */
export const NAMESPACE_MAP: Record<string, string> = {
  a: NS_A,
  c: NS_C,
  cp: NS_CP,
  ct: NS_CONTENT_TYPES,
  dc: NS_DC,
  dcmitype: NS_DCMITYPE,
  dcterms: NS_DCTERMS,
  dgm: NS_DGM,
  ep: NS_EP,
  m: NS_M,
  mc: NS_MC,
  mo: NS_MO,
  o: NS_O,
  p: NS_P,
  pd: NS_PD,
  pic: NS_PIC,
  pr: NS_RELATIONSHIPS,
  r: NS_R,
  v: NS_V,
  w: NS_W,
  wp: NS_WP,
  wpc: NS_WPC,
  wpg: NS_WPG,
  wps: NS_WPS,
  xdr: NS_XDR,
  xsi: NS_XSI,
  a14: NS_A14,
  a16: NS_A16,
  p14: NS_P14,
};

/**
 * URI-to-prefix reverse lookup. Built from {@link NAMESPACE_MAP}.
 * If two prefixes map to the same URI, the last one wins — but in practice
 * our map is 1:1.
 */
export const PREFIX_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(NAMESPACE_MAP).map(([prefix, uri]) => [uri, prefix])
);
