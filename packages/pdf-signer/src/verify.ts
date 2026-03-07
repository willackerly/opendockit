/**
 * pdfbox-ts/verify — PDF signature verification.
 *
 * Standalone entrypoint that doesn't pull in the signing pipeline.
 * Only depends on the COS parser and cryptographic libraries.
 */

export { verifySignatures } from './signer/verify.js';
export type {
  SignatureVerificationResult,
  ChainStatus,
  TimestampInfo,
} from './signer/verify';
