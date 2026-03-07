/**
 * PDFBox Port - TypeScript Implementation of Apache PDFBox Signature Components
 *
 * =============================================================================
 * This is a focused port of Apache PDFBox for PDF digital signatures
 * =============================================================================
 *
 * What's included:
 * - COS object model (PDF objects: dictionaries, arrays, names, etc.)
 * - COSWriter (PDF object serialization with automatic signature tracking)
 * - COSStandardOutputStream (position-tracking output stream)
 * - XRefWriter (cross-reference table formatting)
 *
 * What's NOT included (refer to PDFBox if needed):
 * - Full PDF reading/parsing (use pdf-lib for this)
 * - PDF compression
 * - PDF encryption
 * - PDF streams (beyond signature needs)
 * - Linearization
 *
 * For missing features, refer to:
 * reference-implementations/pdfbox/
 */

// Output Stream
export { COSStandardOutputStream, CRLF, LF, EOL } from './writer/COSStandardOutputStream';
export { RandomAccessBuffer } from './io/RandomAccessBuffer';
export type { RandomAccessReader } from './io/RandomAccessBuffer';
export { COSInputStream } from './io/COSInputStream';

// COS Object Model
export type { COSBase } from './cos/COSBase';
export { PDF_CONSTANTS } from './cos/COSBase';
export {
  COSName,
  COSInteger,
  COSString,
  COSArray,
  COSDictionary,
  COSFloat,
  COSObjectReference,
  COSBoolean,
  COSNull,
  COSStream,
} from './cos/COSTypes';
export {
  markObjectUpdated,
  isObjectUpdated,
  resetUpdateTracking,
  COSUpdateTracker,
  globalUpdateTracker,
} from './cos/COSUpdateInfo';

// Writer
export { COSWriter } from './writer/COSWriter';
export { COSObjectKey } from './writer/COSObjectKey';
export { XRefBuilder } from './writer/XRefBuilder';
export { IncrementalUpdateManager } from './writer/IncrementalUpdateManager';
export { IncrementalWriteContext } from './writer/IncrementalWriteContext';
export { FullWriteContext } from './writer/FullWriteContext';
export { saveFullDocument } from './writer/FullSaveWriter';
export {
  XRefEntryType,
  NormalXRefEntry,
  FreeXRefEntry,
  type TableXRefEntry,
} from './writer/XRefEntries';
export { COSWriterObjectStream } from './writer/COSWriterObjectStream';
export { ObjectStreamBuilder } from './writer/ObjectStreamBuilder';
export { ObjectStreamPool } from './writer/ObjectStreamPool';
export { COSDocumentState } from './writer/COSDocumentState';
export { ObjectNumberAllocator } from './writer/ObjectNumberAllocator';
export { prepareXrefEntries, buildXrefRanges } from './writer/xref-helpers';
export { buildXRefStream } from './writer/XRefStreamWriter';
export { loadRawIndirectObjects, loadParsedIndirectObjects } from './parser/full-document-loader';
export { findReachableObjects, filterReachableObjects } from './parser/object-graph';

// PDModel helpers
export { PDSignatureField } from './pdmodel/PDSignatureField';
// XRef
export type { XRefEntry } from './writer/XRefWriter';
export {
  formatXrefOffset,
  formatXrefGeneration,
  writeXrefEntry,
  writeXrefRange,
  writeXrefTable,
  writeTrailer,
} from './writer/XRefWriter';

// Trailer parsing utilities
export {
  parsePdfTrailer,
  buildIncrementalTrailerDictionary,
  computeDeterministicDocumentId,
  type TrailerInfo,
} from './parser/trailer';
export { parseXrefTable } from './parser/xref';
