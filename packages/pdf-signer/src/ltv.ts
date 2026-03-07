/**
 * pdfbox-ts/ltv — Long-Term Validation (LTV) support.
 *
 * Standalone entrypoint for adding DSS/VRI dictionaries to signed PDFs.
 * Doesn't pull in the signing pipeline or document API.
 */

export { addLtvToPdf, LtvError, computeVriKey } from './signer/ltv.js';
export type { LtvOptions, LtvResult } from './signer/ltv';
