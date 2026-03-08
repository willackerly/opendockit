/**
 * @opendockit/pdf/fonts — PDF font metrics and encoding.
 *
 * Re-exports font functionality from @opendockit/pdf-signer/fonts.
 */

export {
  StandardFontMetrics,
  WinAnsiEncoding,
  SymbolEncoding,
  ZapfDingbatsEncoding,
  encodingForFont,
  encodeTextToHex,
  layoutMultilineText,
  parseCFFFont,
  subsetTrueTypeFont,
  TextAlignment,
} from '@opendockit/pdf-signer/fonts';

export type {
  FontMetricsData,
  FontEncoding,
  EncodedGlyph,
  TextPosition,
  MultilineTextLayout,
  LayoutOptions,
  CFFParseResult,
  SubsetResult,
} from '@opendockit/pdf-signer/fonts';
