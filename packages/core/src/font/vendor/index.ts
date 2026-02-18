/**
 * Vendored font parsers for metric extraction.
 *
 * These are zero-dependency TrueType/CFF parsers originally from pdfbox-ts,
 * stripped to only export metric data (no raw font bytes for embedding).
 */

export { parseTrueType } from './truetype-parser.js';
export type { TrueTypeFontInfo } from './truetype-parser.js';

export { parseCFFFont } from './cff-parser.js';
export type { CFFParseResult } from './cff-parser.js';
