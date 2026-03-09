/**
 * pdfbox-ts — TypeScript port of Apache PDFBox signing primitives.
 *
 * Byte-for-byte parity with Java PDFBox for incremental PDF signing.
 * Unified PDF document API (Strangler Fig over pdf-lib).
 */

// --- Signing API ---
export {
  signPDFWithPDFBox,
  preparePdfWithAppearance,
  signPreparedPdfWithPDFBox,
} from './signer/pdfbox-signer.js';
export { PDFBOX_TS_VERSION, getPdfboxTsVersion } from './version.js';
export { fetchTimestampToken, TSAError } from './signer/tsa.js';
export { addLtvToPdf, LtvError, computeVriKey } from './signer/ltv.js';
export type { LtvOptions, LtvResult } from './signer/ltv';
export { verifySignatures } from './signer/verify.js';
export type { SignatureVerificationResult, ChainStatus, TimestampInfo } from './signer/verify';
export type { PreparedPdf } from './signer/pdfbox-signer';
export type {
  BrowserKeypairSigner,
  CertificateChain,
  SignatureOptions,
  SignatureAppearance,
  AppearanceMode,
  SignatureObjectNumbers,
  SignedPDFResult
} from './types';

// --- Encryption/Decryption API ---
export {
  PDFEncryptor,
  PDFDecryptor,
  computePermissions,
  parsePermissions,
  parseEncryptionDict,
  getEncryptionDescription,
  validateEncryption,
} from './pdfbox/crypto/index.js';
export type { PDFPermissions, EncryptOptions, EncryptionDict } from './pdfbox/crypto/index.js';

// --- Document API (native, with optional pdf-lib fallback for copyPages/drawSvgPath) ---
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
  // Content stream builder (Phase 2)
  ContentStreamBuilder,
  formatNumber,
  // Native font metrics (Phase 3)
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
  // TrueType font parsing and embedding
  parseTrueType,
  computeFontFlags,
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
} from './document/index.js';

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
  // TrueType font types
  TrueTypeFontInfo,
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
  // Content stream types (Phase 2)
  DrawRectOptions,
  DrawLineOptions,
  DrawImageOptions,
  DrawTextOptions,
  DrawTextLinesOptions,
  // Font metrics types (Phase 3)
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
} from './document/index.js';

// --- Element Model ---
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
  Color as ElementColor,
} from './elements/types.js';
