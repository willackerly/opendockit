/**
 * Unified PDF document API — the public surface of pdfbox-ts.
 *
 * All operations are fully native (no pdf-lib dependency).
 *
 * Usage:
 *   import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdfbox-ts';
 */

// --- Wrapper classes ---
export { PDFDocument } from './PDFDocument.js';
export { PDFPage } from './PDFPage.js';
export { PDFFont } from './PDFFont.js';
export { PDFImage } from './PDFImage.js';
export { PDFEmbeddedPage } from './PDFEmbeddedPage.js';
export { PDFForm } from './PDFForm.js';

// --- Form field wrappers ---
export {
  PDFField,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFButton,
  PDFSignature,
} from './fields/index.js';

// --- Field appearance generation ---
export {
  generateTextFieldAppearance,
  generateCheckBoxAppearance,
  generateDropdownAppearance,
  generateAllFieldAppearances,
} from './fields/FieldAppearanceGenerator.js';

// --- Native types (no pdf-lib delegation) ---

// Colors
export {
  rgb,
  cmyk,
  grayscale,
  colorToComponents,
  componentsToColor,
  ColorTypes,
} from './colors.js';
export type { Color, RGB, CMYK, Grayscale } from './colors.js';

// Rotations
export {
  degrees,
  radians,
  degreesToRadians,
  radiansToDegrees,
  toRadians,
  toDegrees,
  reduceRotation,
  adjustDimsForRotation,
  RotationTypes,
} from './rotations.js';
export type { Rotation, Radians, Degrees } from './rotations.js';

// Standard fonts
export { StandardFonts } from './StandardFonts.js';

// Page sizes
export { PageSizes } from './sizes.js';

// Content stream builder
export { ContentStreamBuilder } from './content-stream/index.js';
export { formatNumber } from './content-stream/index.js';
export type {
  DrawRectOptions,
  DrawLineOptions,
  DrawImageOptions,
  DrawTextOptions,
  DrawTextLinesOptions,
  DrawEllipseOptions,
} from './content-stream/index.js';

// Native font metrics
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
} from './fonts/index.js';
export { TextAlignment as NativeTextAlignment } from './fonts/index.js';
export type {
  FontMetricsData,
  FontEncoding,
  EncodedGlyph,
  TextPosition,
  MultilineTextLayout,
  LayoutOptions,
  CFFParseResult,
  SubsetResult,
} from './fonts/index.js';

// --- Annotations ---
export {
  PDAnnotation,
  PDAnnotationHighlight,
  PDAnnotationUnderline,
  PDAnnotationStrikeout,
  PDAnnotationSquiggly,
  PDAnnotationText,
  PDAnnotationFreeText,
  PDAnnotationRubberStamp,
  PDAnnotationLine,
  PDAnnotationSquare,
  PDAnnotationCircle,
  PDAnnotationInk,
  PDAnnotationLink,
  PDAnnotationRedact,
  ANNOTATION_FLAG_INVISIBLE,
  ANNOTATION_FLAG_HIDDEN,
  ANNOTATION_FLAG_PRINT,
  ANNOTATION_FLAG_NO_ZOOM,
  ANNOTATION_FLAG_NO_ROTATE,
  ANNOTATION_FLAG_NO_VIEW,
  ANNOTATION_FLAG_READ_ONLY,
  ANNOTATION_FLAG_LOCKED,
  ANNOTATION_FLAG_TOGGLE_NO_VIEW,
  ANNOTATION_FLAG_LOCKED_CONTENTS,
  StampName,
  TextIconName,
  LineEndingStyle,
  FreeTextAlignment,
} from './annotations/index.js';
export type {
  AnnotationOptions,
  HighlightOptions,
  UnderlineOptions,
  StrikeoutOptions,
  SquigglyOptions,
  TextAnnotationOptions,
  FreeTextOptions,
  StampOptions,
  LineOptions,
  SquareAnnotationOptions,
  CircleAnnotationOptions,
  InkOptions,
  LinkOptions,
} from './annotations/index.js';
export type { RedactAnnotationOptions } from './annotations/index.js';

// --- Redaction ---
export {
  applyRedactions,
  tokenizeContentStream,
  parseOperations,
} from './redaction/index.js';
export type {
  RedactionRect,
  RedactionColor,
  CSToken,
  CSOperation,
} from './redaction/index.js';

// --- PDF/A compliance ---
export {
  applyPDFAConformance,
  generateXMPMetadata,
  buildSRGBICCProfile,
} from './pdfa/index.js';
export type {
  PDFALevel,
  XMPMetadataOptions,
} from './pdfa/index.js';

// --- Content extraction ---
export {
  extractText,
  extractTextContent,
  extractPageText,
  joinTextItems,
  extractImages,
  extractPageImages,
  getDecompressedStreamData,
  getRawStreamData,
  getStreamFilters,
  parseToUnicodeCMap,
  detectCodeLength,
  buildFontDecoder,
  glyphNameToUnicode,
  loadAndParseDocument,
} from './extraction/index.js';
export type {
  TextItem,
  PageText,
  TextExtractionOptions,
  ExtractedImage,
  ImageExtractionOptions,
  FontDecoder as ExtractionFontDecoder,
  DocumentParseResult,
} from './extraction/index.js';

// --- Page copying ---
export { copyPages } from './CopyPages.js';

// Options & enums
export {
  ParseSpeeds,
  BlendMode,
  LineCapStyle,
  TextRenderingMode,
  TextAlignment,
  ImageAlignment,
  AFRelationship,
} from './options.js';
export type {
  LoadOptions,
  CreateOptions,
  SaveOptions,
  Base64SaveOptions,
  EmbedFontOptions,
  SetTitleOptions,
  AttachmentOptions,
  PDFPageDrawTextOptions,
  PDFPageDrawImageOptions,
  PDFPageDrawPageOptions,
  PDFPageDrawSVGOptions,
  PDFPageDrawLineOptions,
  PDFPageDrawRectangleOptions,
  PDFPageDrawSquareOptions,
  PDFPageDrawEllipseOptions,
  PDFPageDrawCircleOptions,
  FieldAppearanceOptions,
  FlattenOptions,
} from './options.js';
