/**
 * pdfbox-ts/extraction — PDF content extraction (text + images).
 *
 * Standalone entrypoint that doesn't pull in the signing pipeline,
 * font metrics data, or other heavy modules.
 */

export {
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
} from './document/extraction/index.js';

export type {
  TextItem,
  PageText,
  TextExtractionOptions,
  ExtractedImage,
  ImageExtractionOptions,
  FontDecoder,
  ObjectResolver,
  DocumentParseResult,
} from './document/extraction/index.js';
