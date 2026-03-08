/**
 * @opendockit/pdf/extraction — PDF content extraction (text + images).
 *
 * Re-exports extraction functionality from @opendockit/pdf-signer/extraction.
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
} from '@opendockit/pdf-signer/extraction';

export type {
  TextItem,
  PageText,
  TextExtractionOptions,
  ExtractedImage,
  ImageExtractionOptions,
  FontDecoder,
  ObjectResolver,
  DocumentParseResult,
} from '@opendockit/pdf-signer/extraction';
