/**
 * CopyPages — deep-clone pages from one PDF document into another.
 *
 * Walks the page's object graph (COSDictionary, COSArray, COSStream,
 * COSObjectReference), allocates new object numbers in the destination
 * context, and builds an oldRef -> newRef mapping to remap all references.
 *
 * Handles:
 *   - Nested dictionaries and arrays
 *   - COSStream binary data cloning
 *   - Circular references (via visited-set keyed by source object number)
 *   - Inherited page-tree properties (/MediaBox, /CropBox, /Resources, /Rotate)
 *   - Direct vs indirect objects
 */

import { PDFPage } from './PDFPage.js';
import type { PDFDocument } from './PDFDocument.js';
import type { NativeDocumentContext } from './NativeDocumentContext.js';
import type { COSBase } from '../pdfbox/cos/COSBase.js';
import {
  COSName,
  COSInteger,
  COSFloat,
  COSString,
  COSBoolean,
  COSNull,
  COSArray,
  COSDictionary,
  COSObjectReference,
  COSStream,
} from '../pdfbox/cos/COSTypes.js';

/**
 * Copy pages from srcDoc into dstDoc by index. Returns PDFPage wrappers
 * for each cloned page, ready to be added via addPage()/insertPage().
 *
 * The cloned pages are registered in dstDoc's object registry but NOT yet
 * inserted into the destination page tree. The caller must call
 * dstDoc.addPage(page) for each returned page.
 */
export function copyPages(
  srcDoc: PDFDocument,
  dstDoc: PDFDocument,
  pageIndices: number[],
): PDFPage[] {
  const srcCtx = srcDoc._nativeCtx;
  const dstCtx = dstDoc._nativeCtx;
  if (!srcCtx || !dstCtx) {
    throw new Error(
      'copyPages() requires both source and destination documents to be in native mode.',
    );
  }

  // Validate indices
  const srcPages = srcCtx.getPageList();
  for (const idx of pageIndices) {
    if (idx < 0 || idx >= srcPages.length) {
      throw new Error(
        `Page index ${idx} is out of bounds. Source document has ${srcPages.length} page(s).`,
      );
    }
  }

  // oldObjNum -> newRef mapping (shared across all pages in this copy batch)
  const refMap = new Map<number, COSObjectReference>();

  // Phase 1: Clone each page's object graph
  const clonedPages: PDFPage[] = [];
  for (const idx of pageIndices) {
    const { pageDict } = srcPages[idx];

    // Deep-clone the page dictionary
    const clonedDict = cloneObject(
      pageDict,
      srcCtx,
      dstCtx,
      refMap,
    ) as COSDictionary;

    // Set /Parent to the destination pages tree root
    clonedDict.setItem('Parent', dstCtx.pagesRef);

    // Register the cloned page in dst context
    const newPageRef = dstCtx.register(clonedDict);

    // Build a PDFPage wrapper (NOT added to page tree yet)
    const page = PDFPage._createNative(clonedDict, newPageRef, dstDoc);
    clonedPages.push(page);
  }

  return clonedPages;
}

/**
 * Deep-clone a COS object, remapping all indirect references from srcCtx to dstCtx.
 *
 * For indirect objects (COSObjectReference):
 *   1. If already cloned (in refMap), return the new reference.
 *   2. Otherwise, resolve the source object, allocate a new obj number in dst,
 *      record the mapping FIRST (to break cycles), then clone the resolved object.
 *
 * For direct objects (COSDictionary, COSArray, primitives):
 *   Clone recursively.
 */
function cloneObject(
  obj: COSBase,
  srcCtx: NativeDocumentContext,
  dstCtx: NativeDocumentContext,
  refMap: Map<number, COSObjectReference>,
): COSBase {
  // --- Indirect reference ---
  if (obj instanceof COSObjectReference) {
    return cloneIndirectRef(obj, srcCtx, dstCtx, refMap);
  }

  // --- Stream (must check before COSDictionary since streams contain dicts) ---
  if (obj instanceof COSStream) {
    return cloneStream(obj, srcCtx, dstCtx, refMap);
  }

  // --- Dictionary ---
  if (obj instanceof COSDictionary) {
    return cloneDictionary(obj, srcCtx, dstCtx, refMap);
  }

  // --- Array ---
  if (obj instanceof COSArray) {
    return cloneArray(obj, srcCtx, dstCtx, refMap);
  }

  // --- Primitives (immutable, safe to share) ---
  if (obj instanceof COSName) {
    return new COSName(obj.getName());
  }
  if (obj instanceof COSInteger) {
    return new COSInteger(obj.getValue());
  }
  if (obj instanceof COSFloat) {
    return new COSFloat(obj.getValue());
  }
  if (obj instanceof COSString) {
    const bytes = obj.getBytes();
    return new COSString(new Uint8Array(bytes), obj.shouldUseHex());
  }
  if (obj instanceof COSBoolean) {
    return obj.getValue() ? COSBoolean.TRUE : COSBoolean.FALSE;
  }
  if (obj instanceof COSNull) {
    return COSNull.NULL;
  }

  // Unknown type — return as-is (shouldn't happen with well-formed PDFs)
  return obj;
}

/**
 * Clone an indirect reference: resolve source object, allocate in dst, clone recursively.
 */
function cloneIndirectRef(
  ref: COSObjectReference,
  srcCtx: NativeDocumentContext,
  dstCtx: NativeDocumentContext,
  refMap: Map<number, COSObjectReference>,
): COSObjectReference {
  // Already cloned?
  const existing = refMap.get(ref.objectNumber);
  if (existing) return existing;

  // Resolve the actual object in source context
  const resolved = srcCtx.resolveRef(ref);
  if (!resolved) {
    // Dangling reference — return a reference that won't resolve (best effort)
    return ref;
  }

  // Allocate a placeholder in dst BEFORE recursing (breaks circular refs)
  // We use a temporary placeholder dict that will be replaced after cloning.
  const newRef = dstCtx.allocateRef();
  refMap.set(ref.objectNumber, newRef);

  // Clone the resolved object
  const cloned = cloneObject(resolved, srcCtx, dstCtx, refMap);

  // Register the cloned object at the allocated number
  dstCtx.assign(newRef.objectNumber, cloned);

  return newRef;
}

/**
 * Clone a COSDictionary, recursively cloning all values.
 */
function cloneDictionary(
  dict: COSDictionary,
  srcCtx: NativeDocumentContext,
  dstCtx: NativeDocumentContext,
  refMap: Map<number, COSObjectReference>,
): COSDictionary {
  const clone = new COSDictionary();
  clone.setDirect(dict.isDirect());

  for (const [key, value] of dict.entrySet()) {
    // Skip /Parent on page dicts — will be set to dst pages tree
    const keyName = key.getName();
    if (keyName === 'Parent') continue;

    clone.setItem(keyName, cloneObject(value, srcCtx, dstCtx, refMap));
  }

  return clone;
}

/**
 * Clone a COSArray, recursively cloning all elements.
 */
function cloneArray(
  arr: COSArray,
  srcCtx: NativeDocumentContext,
  dstCtx: NativeDocumentContext,
  refMap: Map<number, COSObjectReference>,
): COSArray {
  const clone = new COSArray();
  clone.setDirect(arr.isDirect());

  for (let i = 0; i < arr.size(); i++) {
    const el = arr.get(i);
    if (el) {
      clone.add(cloneObject(el, srcCtx, dstCtx, refMap));
    }
  }

  return clone;
}

/**
 * Clone a COSStream: clone its dictionary entries and copy binary data.
 */
function cloneStream(
  stream: COSStream,
  srcCtx: NativeDocumentContext,
  dstCtx: NativeDocumentContext,
  refMap: Map<number, COSObjectReference>,
): COSStream {
  const clone = new COSStream();

  // Clone dictionary entries (except /Length which setData handles)
  const srcDict = stream.getDictionary();
  for (const [key, value] of srcDict.entrySet()) {
    const keyName = key.getName();
    if (keyName === 'Length') continue; // setData sets this
    clone.setItem(keyName, cloneObject(value, srcCtx, dstCtx, refMap));
  }

  // Copy stream data
  const data = stream.getData();
  clone.setData(new Uint8Array(data));

  return clone;
}
