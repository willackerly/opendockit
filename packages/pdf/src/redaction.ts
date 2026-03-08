/**
 * @opendockit/pdf/redaction — PDF content stream redaction.
 *
 * Re-exports redaction functionality from @opendockit/pdf-signer/redaction.
 */

export {
  applyRedactions,
  tokenizeContentStream,
  parseOperations,
} from '@opendockit/pdf-signer/redaction';

export type {
  RedactionRect,
  RedactionColor,
  CSToken,
  CSOperation,
} from '@opendockit/pdf-signer/redaction';
