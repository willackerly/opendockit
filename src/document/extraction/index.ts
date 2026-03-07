/**
 * PDF Content Extraction module — text and image extraction from PDF files.
 */

// Stream decompression
export {
  getDecompressedStreamData,
  getRawStreamData,
  getStreamFilters,
} from './StreamDecoder.js';

// CMap parsing
export {
  parseToUnicodeCMap,
  detectCodeLength,
} from './CMapParser.js';

// Font decoding
export {
  buildFontDecoder,
} from './FontDecoder.js';
export type {
  FontDecoder,
  ObjectResolver,
} from './FontDecoder.js';

// Adobe Glyph List
export {
  glyphNameToUnicode,
} from './AdobeGlyphList.js';

// Text extraction
export {
  extractText,
  extractTextContent,
  extractPageText,
  joinTextItems,
} from './TextExtractor.js';
export type {
  TextItem,
  PageText,
  TextExtractionOptions,
} from './TextExtractor.js';

// Image extraction
export {
  extractImages,
  extractPageImages,
} from './ImageExtractor.js';
export type {
  ExtractedImage,
  ImageExtractionOptions,
} from './ImageExtractor.js';

// Document loader
export {
  loadAndParseDocument,
} from './DocumentLoader.js';
export type {
  DocumentParseResult,
} from './DocumentLoader.js';
