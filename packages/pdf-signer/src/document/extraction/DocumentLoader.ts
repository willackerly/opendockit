/**
 * DocumentLoader — lightweight wrapper around the PDF parser for extraction.
 *
 * Provides a minimal parsed document with object resolution, without creating
 * a full NativeDocumentContext (which involves page tree walking and more).
 * This is used by TextExtractor and ImageExtractor for standalone extraction.
 */

import { parsePdfTrailer } from '../../pdfbox/parser/trailer.js';
import { loadParsedIndirectObjects } from '../../pdfbox/parser/full-document-loader.js';
import {
  COSObjectReference,
} from '../../pdfbox/cos/COSTypes.js';
import type { COSBase } from '../../pdfbox/cos/COSBase.js';
import type { ObjectResolver } from './FontDecoder.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DocumentParseResult {
  /** Resolve an indirect reference to its object. */
  resolve: ObjectResolver;
  /** The catalog reference. */
  catalogRef: COSObjectReference;
  /** All parsed objects by object number. */
  objects: Map<number, COSBase>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a PDF file into a lightweight document structure for extraction.
 * Throws if the PDF cannot be parsed.
 */
export function loadAndParseDocument(pdfBytes: Uint8Array): DocumentParseResult {
  const trailer = parsePdfTrailer(pdfBytes);
  const parsed = loadParsedIndirectObjects(pdfBytes, trailer);

  const objects = new Map<number, COSBase>();
  for (const p of parsed) {
    objects.set(p.key.objectNumber, p.object);
  }

  const resolve: ObjectResolver = (ref: COSObjectReference) => {
    return objects.get(ref.objectNumber);
  };

  const catalogRef = new COSObjectReference(
    trailer.rootRef.objectNumber,
    trailer.rootRef.generation,
  );

  return { resolve, catalogRef, objects };
}
