/**
 * ImageExtractor — extract images from PDF pages.
 *
 * Walks page /Resources/XObject dictionaries, finds image XObjects
 * (/Subtype /Image), and extracts their data.
 *
 * For DCTDecode (JPEG) images, the raw stream bytes ARE the JPEG file.
 * For FlateDecode images, the data is decompressed to raw pixel bytes.
 * SMask (alpha channel) is extracted separately when present.
 */

import {
  COSName,
  COSArray,
  COSInteger,
  COSDictionary,
  COSStream,
  COSFloat,
  COSObjectReference,
} from '../../pdfbox/cos/COSTypes.js';
import type { COSBase } from '../../pdfbox/cos/COSBase.js';
import { getDecompressedStreamData, getRawStreamData, getStreamFilters } from './StreamDecoder.js';
import { loadAndParseDocument, type DocumentParseResult } from './DocumentLoader.js';
import type { ObjectResolver } from './FontDecoder.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExtractedImage {
  /** Page index (0-based). */
  pageIndex: number;
  /** Resource name in the page's XObject dictionary (e.g. "Im1"). */
  name: string;
  /** Image width in pixels. */
  width: number;
  /** Image height in pixels. */
  height: number;
  /** Bits per component (typically 8). */
  bitsPerComponent: number;
  /** Color space name ("DeviceRGB", "DeviceGray", "DeviceCMYK", "ICCBased", etc.). */
  colorSpace: string;
  /** Image data: raw JPEG bytes if DCTDecode, decompressed pixels otherwise. */
  data: Uint8Array;
  /** The primary filter used on this image stream. */
  filter: string;
  /** Whether this image has a soft mask (alpha channel). */
  hasSMask: boolean;
  /** Soft mask (alpha) data, decompressed. Only present if hasSMask is true. */
  smaskData?: Uint8Array;
}

export interface ImageExtractionOptions {
  /** Extract only from these page indices (0-based). If omitted, all pages. */
  pages?: number[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract all images from a PDF.
 */
export async function extractImages(
  pdfBytes: Uint8Array,
  options?: ImageExtractionOptions,
): Promise<ExtractedImage[]> {
  const doc = loadAndParseDocument(pdfBytes);
  const pageIndices = options?.pages;
  const results: ExtractedImage[] = [];

  const pageList = getPageList(doc);

  for (let i = 0; i < pageList.length; i++) {
    if (pageIndices && !pageIndices.includes(i)) continue;

    const { pageDict } = pageList[i];
    const pageImages = extractPageImages(pageDict, doc.resolve, i);
    results.push(...pageImages);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Per-page image extraction
// ---------------------------------------------------------------------------

export function extractPageImages(
  pageDict: COSDictionary,
  resolve: ObjectResolver,
  pageIndex: number,
): ExtractedImage[] {
  const images: ExtractedImage[] = [];
  const resourcesDict = getResourcesDict(pageDict, resolve);
  if (!resourcesDict) return images;

  const xobjectEntry = resolveItem(resourcesDict, 'XObject', resolve);
  if (!(xobjectEntry instanceof COSDictionary)) return images;

  // Walk all entries in the XObject dictionary
  for (const [nameObj, _value] of xobjectEntry.entrySet()) {
    const name = nameObj.getName();
    const xobj = resolveItem(xobjectEntry, name, resolve);

    if (!(xobj instanceof COSStream)) continue;

    const dict = xobj.getDictionary();
    const subtype = resolveItem(dict, 'Subtype', resolve);
    if (!(subtype instanceof COSName) || subtype.getName() !== 'Image') continue;

    // This is an image XObject
    const image = extractImageFromStream(xobj, name, pageIndex, resolve);
    if (image) images.push(image);
  }

  return images;
}

// ---------------------------------------------------------------------------
// Image stream extraction
// ---------------------------------------------------------------------------

function extractImageFromStream(
  stream: COSStream,
  name: string,
  pageIndex: number,
  resolve: ObjectResolver,
): ExtractedImage | null {
  const dict = stream.getDictionary();

  const width = getIntFromDict(dict, 'Width', resolve, 0);
  const height = getIntFromDict(dict, 'Height', resolve, 0);
  const bpc = getIntFromDict(dict, 'BitsPerComponent', resolve, 8);
  const colorSpace = getColorSpaceName(dict, resolve);
  const filters = getStreamFilters(stream);
  const filter = filters[0] ?? 'none';

  // Determine data extraction strategy
  let data: Uint8Array;
  if (filter === 'DCTDecode' || filter === 'DCT') {
    // JPEG — raw bytes ARE the image file
    data = getRawStreamData(stream);
  } else if (filter === 'JPXDecode') {
    // JPEG 2000 — raw bytes ARE the image file
    data = getRawStreamData(stream);
  } else {
    // Other filters (FlateDecode, etc.) — decompress
    data = getDecompressedStreamData(stream);
  }

  if (data.length === 0) return null;

  // Extract soft mask if present
  let hasSMask = false;
  let smaskData: Uint8Array | undefined;

  const smaskEntry = resolveItem(dict, 'SMask', resolve);
  if (smaskEntry instanceof COSStream) {
    hasSMask = true;
    smaskData = getDecompressedStreamData(smaskEntry);
  }

  return {
    pageIndex,
    name,
    width,
    height,
    bitsPerComponent: bpc,
    colorSpace,
    data,
    filter,
    hasSMask,
    smaskData,
  };
}

// ---------------------------------------------------------------------------
// Color space parsing
// ---------------------------------------------------------------------------

function getColorSpaceName(dict: COSDictionary, resolve: ObjectResolver): string {
  const cs = resolveItem(dict, 'ColorSpace', resolve);

  if (cs instanceof COSName) {
    return cs.getName();
  }

  if (cs instanceof COSArray && cs.size() > 0) {
    const first = cs.get(0);
    if (first instanceof COSName) {
      return first.getName();
    }
  }

  return 'DeviceRGB';
}

// ---------------------------------------------------------------------------
// Page tree (shared with TextExtractor)
// ---------------------------------------------------------------------------

function getPageList(
  doc: DocumentParseResult,
): Array<{ pageDict: COSDictionary }> {
  const pages: Array<{ pageDict: COSDictionary }> = [];
  const catalog = doc.resolve(doc.catalogRef);
  if (!(catalog instanceof COSDictionary)) return pages;

  const pagesEntry = resolveItem(catalog, 'Pages', doc.resolve);
  if (!(pagesEntry instanceof COSDictionary)) return pages;

  walkPageTree(pagesEntry, pages, doc.resolve, []);
  return pages;
}

function walkPageTree(
  node: COSDictionary,
  result: Array<{ pageDict: COSDictionary }>,
  resolve: ObjectResolver,
  parentChain: COSDictionary[],
): void {
  const kidsEntry = resolveItem(node, 'Kids', resolve);
  if (!(kidsEntry instanceof COSArray)) return;

  for (let i = 0; i < kidsEntry.size(); i++) {
    let kid = kidsEntry.get(i);
    if (kid instanceof COSObjectReference) {
      kid = resolve(kid);
    }
    if (!(kid instanceof COSDictionary)) continue;

    const typeEntry = kid.getItem('Type');
    const typeName = typeEntry instanceof COSName ? typeEntry.getName() : undefined;

    if (typeName === 'Pages') {
      walkPageTree(kid, result, resolve, [...parentChain, node]);
    } else {
      applyInherited(kid, [...parentChain, node]);
      result.push({ pageDict: kid });
    }
  }
}

function applyInherited(pageDict: COSDictionary, chain: COSDictionary[]): void {
  for (const key of ['MediaBox', 'CropBox', 'Resources', 'Rotate']) {
    if (pageDict.getItem(key)) continue;
    for (let i = chain.length - 1; i >= 0; i--) {
      const val = chain[i].getItem(key);
      if (val) {
        pageDict.setItem(key, val);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveItem(
  dict: COSDictionary,
  key: string,
  resolve: ObjectResolver,
): COSBase | undefined {
  const entry = dict.getItem(key);
  if (entry instanceof COSObjectReference) {
    return resolve(entry);
  }
  return entry;
}

function getIntFromDict(
  dict: COSDictionary,
  key: string,
  resolve: ObjectResolver,
  defaultValue: number,
): number {
  const entry = resolveItem(dict, key, resolve);
  if (entry instanceof COSInteger) return entry.getValue();
  if (entry instanceof COSFloat) return Math.round(entry.getValue());
  return defaultValue;
}

function getResourcesDict(
  pageDict: COSDictionary,
  resolve: ObjectResolver,
): COSDictionary | undefined {
  const resources = resolveItem(pageDict, 'Resources', resolve);
  return resources instanceof COSDictionary ? resources : undefined;
}
