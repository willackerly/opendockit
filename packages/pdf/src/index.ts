/**
 * @opendockit/pdf — PDF document engine.
 *
 * Re-exports general PDF functionality from @opendockit/pdf-signer,
 * excluding signing-specific code (PKCS#7, CMS, TSA, LTV, verification).
 *
 * This package is the public API for:
 * - Creating, loading, and modifying PDF documents
 * - Embedding fonts, images, and pages
 * - Form fields and field appearances
 * - Annotations (highlight, underline, stamp, ink, etc.)
 * - Content stream building
 * - Redaction
 * - PDF/A compliance
 * - Content extraction (text + images)
 * - Page copying and font subsetting
 * - Encryption and decryption
 */

// =============================================================================
// Document API
// =============================================================================

export {
  // Classes
  PDFDocument,
  PDFPage,
  PDFFont,
  PDFImage,
  PDFEmbeddedPage,
  PDFForm,
  // Form fields
  PDFField,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFButton,
  PDFSignature,
  // Color factories
  rgb,
  cmyk,
  grayscale,
  colorToComponents,
  componentsToColor,
  ColorTypes,
  // Rotation factories
  degrees,
  radians,
  degreesToRadians,
  radiansToDegrees,
  toRadians,
  toDegrees,
  reduceRotation,
  adjustDimsForRotation,
  RotationTypes,
  // Enums
  StandardFonts,
  ParseSpeeds,
  BlendMode,
  LineCapStyle,
  TextRenderingMode,
  TextAlignment,
  ImageAlignment,
  AFRelationship,
  // Constants
  PageSizes,
  // Annotations
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
  // Content stream builder
  ContentStreamBuilder,
  formatNumber,
  // Native font metrics
  StandardFontMetrics,
  WinAnsiEncoding,
  SymbolEncoding,
  ZapfDingbatsEncoding,
  encodingForFont,
  encodeTextToHex,
  layoutMultilineText,
  NativeTextAlignment,
  // Field appearance generation
  generateTextFieldAppearance,
  generateCheckBoxAppearance,
  generateDropdownAppearance,
  generateAllFieldAppearances,
  // Redaction
  applyRedactions,
  tokenizeContentStream,
  parseOperations,
  // Page copying
  copyPages,
  // CFF/OpenType parser
  parseCFFFont,
  // Font subsetting
  subsetTrueTypeFont,
  // PDF/A compliance
  applyPDFAConformance,
  generateXMPMetadata,
  buildSRGBICCProfile,
  // Content extraction
  extractText,
  extractTextContent,
  extractImages,
  extractPageText,
  extractPageImages,
  joinTextItems,
  getDecompressedStreamData,
  getRawStreamData,
  getStreamFilters,
  parseToUnicodeCMap,
  buildFontDecoder,
  glyphNameToUnicode,
  loadAndParseDocument,
} from '@opendockit/pdf-signer';

// =============================================================================
// Document API types
// =============================================================================

export type {
  // Annotation option types
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
  RedactAnnotationOptions,
  // Redaction types
  RedactionRect,
  RedactionColor,
  CSToken,
  CSOperation,
  // CFF/OpenType types
  CFFParseResult,
  // Font subsetting types
  SubsetResult,
  // PDF/A types
  PDFALevel,
  XMPMetadataOptions,
  // Color types
  Color,
  RGB,
  CMYK,
  Grayscale,
  // Rotation types
  Rotation,
  Radians,
  Degrees,
  // Option types
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
  // Content stream types
  DrawRectOptions,
  DrawLineOptions,
  DrawImageOptions,
  DrawTextOptions,
  DrawTextLinesOptions,
  // Font metrics types
  FontMetricsData,
  FontEncoding,
  EncodedGlyph,
  TextPosition,
  MultilineTextLayout,
  LayoutOptions,
  // Content extraction types
  TextItem,
  PageText,
  TextExtractionOptions,
  ExtractedImage,
  ImageExtractionOptions,
  ExtractionFontDecoder,
  DocumentParseResult,
} from '@opendockit/pdf-signer';

// =============================================================================
// Encryption / Decryption API
// =============================================================================

export {
  PDFEncryptor,
  PDFDecryptor,
  computePermissions,
  parsePermissions,
  parseEncryptionDict,
  getEncryptionDescription,
  validateEncryption,
} from '@opendockit/pdf-signer';

export type {
  PDFPermissions,
  EncryptOptions,
  EncryptionDict,
} from '@opendockit/pdf-signer';

// =============================================================================
// Element Model
// =============================================================================

export type {
  PageModel,
  PageElement,
  ElementBase,
  TextElement,
  ShapeElement,
  ImageElement,
  PathElement,
  GroupElement,
  PdfSource,
  PptxSource,
  Paragraph,
  TextRun,
  Fill,
  Stroke,
  ElementColor,
} from '@opendockit/pdf-signer';
