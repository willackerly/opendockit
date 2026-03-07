/**
 * pdfbox-ts/redaction — PDF content stream redaction.
 *
 * Standalone entrypoint for redacting content from PDF streams.
 * Also exports the content stream tokenizer/parser used by extraction.
 */

export {
  applyRedactions,
  tokenizeContentStream,
  parseOperations,
} from './document/redaction/index.js';

export type {
  RedactionRect,
  RedactionColor,
  CSToken,
  CSOperation,
} from './document/redaction/index.js';
