/**
 * Native standard font metrics and text encoding — zero pdf-lib dependencies.
 */

// Encoding tables
export {
  WinAnsiEncoding,
  SymbolEncoding,
  ZapfDingbatsEncoding,
  encodingForFont,
  encodeTextToHex,
} from './encoding.js';
export type { EncodedGlyph, FontEncoding } from './encoding.js';

// Font metrics
export { StandardFontMetrics, registerFont } from './StandardFontMetrics.js';
export type { FontMetricsData } from './StandardFontMetrics.js';

// Text layout
export { layoutMultilineText, TextAlignment } from './TextLayout.js';
export type {
  TextPosition,
  MultilineTextLayout,
  LayoutOptions,
} from './TextLayout.js';

// TrueType parser
export { parseTrueType } from './TrueTypeParser.js';
export type { TrueTypeFontInfo } from './TrueTypeParser.js';

// CFF/OpenType parser
export { parseCFFFont } from './CFFParser.js';
export type { CFFParseResult } from './CFFParser.js';

// CMap builder
export { buildToUnicodeCMap } from './CMapBuilder.js';

// Font flags
export { computeFontFlags } from './FontFlags.js';

// TrueType subsetter
export { subsetTrueTypeFont } from './TrueTypeSubsetter.js';
export type { SubsetResult } from './TrueTypeSubsetter.js';
