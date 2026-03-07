import { COSArray, COSDictionary, COSInteger, COSName, COSObjectReference } from '../cos/COSTypes';
import type { COSBase } from '../cos/COSBase';
import { parseCOSDictionary } from './cosParser';
import { parsePdfTrailer } from './trailer';
import { UnsupportedPdfFeatureError } from '../../errors/UnsupportedPdfFeatureError';
import { safeInflate as inflate } from './safe-inflate';
import { extractStreamObject } from './xref';
import { COSDocumentState } from '../writer/COSDocumentState';
import { XRefEntryType } from '../writer/XRefEntries';

const LATIN1_DECODER = new TextDecoder('latin1');

export interface ParsedObject {
  objectNumber: number;
  generationNumber: number;
  body: string;
}

/**
 * Resolves an indirect object by number, dispatching between regular objects
 * and objects compressed inside Object Streams (type-2 xref entries).
 */
export type ObjectResolver = (objectNumber: number, generation?: number) => ParsedObject;

/**
 * Create a resolver that uses xref entries to dispatch between regular objects
 * and objects inside Object Streams.
 */
export function createObjectResolver(
  state: COSDocumentState,
  pdfBytes: Uint8Array
): ObjectResolver {
  return (objectNumber: number, generation: number = 0): ParsedObject => {
    const location = state.getLocation(objectNumber, generation);
    if (!location) {
      // Fallback to regex search
      return extractIndirectObject(pdfBytes, objectNumber);
    }
    if (location.entry.type === XRefEntryType.OBJECT_STREAM) {
      const parentNumber = location.entry.objectStreamParent;
      if (parentNumber === undefined) {
        throw new Error('Object stream parent missing');
      }
      const parentLocation =
        state.getLocation(parentNumber, 0) ??
        state.getLocation(parentNumber, location.entry.generation ?? 0);
      if (!parentLocation) {
        throw new Error(
          `Object stream parent ${parentNumber} not found in xref table`
        );
      }
      const parentOffset = parentLocation.entry.byteOffset;
      if (parentOffset === undefined) {
        throw new Error(
          `Object stream parent ${parentNumber} missing byte offset`
        );
      }
      return extractObjectFromObjectStream(
        pdfBytes,
        parentOffset,
        parentNumber,
        objectNumber
      );
    }
    // Use xref byte offset to read the correct version of the object
    // (avoids regex finding an earlier version in incremental-save PDFs)
    const offset = location.entry.byteOffset;
    if (offset !== undefined) {
      return extractIndirectObjectAtOffset(pdfBytes, objectNumber, offset);
    }
    return extractIndirectObject(pdfBytes, objectNumber);
  };
}

/**
 * Create a simple resolver that only uses regex-based extraction (no xref awareness).
 * Used as a fallback when no COSDocumentState is available.
 */
export function createRawResolver(pdfBytes: Uint8Array): ObjectResolver {
  return (objectNumber: number, _generation?: number): ParsedObject => {
    return extractIndirectObject(pdfBytes, objectNumber);
  };
}

export function extractIndirectObject(
  pdfBytes: Uint8Array,
  objectNumber: number
): ParsedObject {
  const pdfText = LATIN1_DECODER.decode(pdfBytes);
  const pattern = new RegExp(
    `\\b${objectNumber}\\s+(\\d+)\\s+obj\\s*([\\s\\S]*?)\\s*endobj`,
    'm'
  );
  const match = pattern.exec(pdfText);
  if (!match) {
    throw new Error(`Object ${objectNumber} not found in PDF`);
  }

  return {
    objectNumber,
    generationNumber: Number(match[1]),
    body: match[2].trim(),
  };
}

/**
 * Extract an indirect object at a known byte offset from the xref table.
 * This avoids regex finding an earlier version in incremental-save PDFs.
 */
function extractIndirectObjectAtOffset(
  pdfBytes: Uint8Array,
  objectNumber: number,
  offset: number
): ParsedObject {
  const pdfText = LATIN1_DECODER.decode(pdfBytes);
  // Parse from the known offset: "N G obj ... endobj"
  const slice = pdfText.slice(offset);
  const pattern = /^(\d+)\s+(\d+)\s+obj\s*([\s\S]*?)\s*endobj/m;
  const match = pattern.exec(slice);
  if (!match || Number(match[1]) !== objectNumber) {
    // Fallback to regex search (offset may point to wrong object in corrupt xrefs)
    return extractIndirectObject(pdfBytes, objectNumber);
  }

  return {
    objectNumber,
    generationNumber: Number(match[2]),
    body: match[3].trim(),
  };
}

export function extractObjectFromObjectStream(
  pdfBytes: Uint8Array,
  parentObjectOffset: number,
  parentObjectNumber: number,
  targetObjectNumber: number
): ParsedObject {
  const { dictionary, streamData } = extractStreamObject(
    pdfBytes,
    parentObjectOffset
  );
  const firstValue = getRequiredInt(dictionary, 'First');
  const nValue = getRequiredInt(dictionary, 'N');
  const decoded = decodeObjectStreamData(
    dictionary,
    streamData,
    parentObjectNumber
  );

  const headerBytes = decoded.slice(0, firstValue);
  const header = LATIN1_DECODER.decode(headerBytes).trim();
  const headerParts = header.split(/\s+/);
  if (headerParts.length < nValue * 2) {
    throw new Error('Object stream header truncated');
  }

  for (let i = 0; i < headerParts.length; i += 2) {
    const objectNumber = Number(headerParts[i]);
    const offset = Number(headerParts[i + 1]);
    const nextOffset =
      i + 2 < headerParts.length
        ? Number(headerParts[i + 3])
        : decoded.length - firstValue;
    if (objectNumber === targetObjectNumber) {
      const start = firstValue + offset;
      const end = firstValue + nextOffset;
      const bodyBytes = decoded.slice(start, end);
      return {
        objectNumber,
        generationNumber: 0,
        body: LATIN1_DECODER.decode(bodyBytes).trim(),
      };
    }
  }
  throw new Error(
    `Object ${targetObjectNumber} not found in parent object stream ${parentObjectNumber}`
  );
}

export interface AcroFormUpdatePlan {
  catalogDict: COSDictionary;
  acroFormObject?: {
    objectNumber: number;
    generationNumber: number;
    dict: COSDictionary;
  };
  existingFieldObjects?: Array<{
    objectNumber: number;
    generationNumber: number;
    dict: COSDictionary;
  }>;
  fieldCount: number;
  hasDocMdp: boolean;
  hasExistingSignatures: boolean;
}

export function buildAcroFormUpdatePlan(
  pdfBytesOrResolver: Uint8Array | ObjectResolver,
  catalogBody: string,
  widgetRef: COSObjectReference
): AcroFormUpdatePlan {
  const resolve: ObjectResolver =
    typeof pdfBytesOrResolver === 'function'
      ? pdfBytesOrResolver
      : createRawResolver(pdfBytesOrResolver);

  const catalogDict = parseCOSDictionary(catalogBody);
  const catalogHasDocMdp = detectCatalogDocMdp(resolve, catalogDict);
  const acroFormEntry = catalogDict.getItem('AcroForm');

  if (acroFormEntry instanceof COSObjectReference) {
    const parsed = parseReferencedAcroForm(resolve, acroFormEntry);
    const existingFields = collectFieldObjects(resolve, parsed.dict);
    const fieldCount = countFields(parsed.dict);
    const hasDocMdp =
      catalogHasDocMdp || detectDocMdp(resolve, existingFields);
    const hasExistingSignatures = detectExistingSignatures(
      resolve,
      existingFields
    );
    ensureAcroFormFields(parsed.dict, widgetRef);
    return {
      catalogDict,
      acroFormObject: parsed,
      existingFieldObjects: existingFields,
      fieldCount,
      hasDocMdp,
      hasExistingSignatures,
    };
  }

  if (acroFormEntry instanceof COSDictionary) {
    const existingFields = collectFieldObjects(resolve, acroFormEntry);
    const fieldCount = countFields(acroFormEntry);
    const hasDocMdp =
      catalogHasDocMdp || detectDocMdp(resolve, existingFields);
    const hasExistingSignatures = detectExistingSignatures(
      resolve,
      existingFields
    );
    ensureAcroFormFields(acroFormEntry, widgetRef);
    return {
      catalogDict,
      existingFieldObjects: existingFields,
      fieldCount,
      hasDocMdp,
      hasExistingSignatures,
    };
  }

  const newAcroForm = new COSDictionary();
  const fields = new COSArray();
  fields.add(widgetRef);
  newAcroForm.setItem(new COSName('Fields'), fields);
  newAcroForm.setItem(new COSName('SigFlags'), new COSInteger(3));
  catalogDict.setItem(new COSName('AcroForm'), newAcroForm);

  return {
    catalogDict,
    fieldCount: 0,
    hasDocMdp: catalogHasDocMdp,
    hasExistingSignatures: false,
  };
}

function parseReferencedAcroForm(
  resolve: ObjectResolver,
  ref: COSObjectReference
) {
  let acroFormObject: ParsedObject;
  try {
    acroFormObject = resolve(ref.objectNumber, ref.generationNumber);
  } catch (error) {
    throw new UnsupportedPdfFeatureError({
      feature: 'missing-acroform-object',
      message: `Failed to resolve existing AcroForm object ${ref.objectNumber} ${ref.generationNumber} R.`,
      recommendation:
        "Port PDFBox's COSParser to traverse indirect references deterministically.",
      context: { cause: (error as Error).message },
    });
  }
  return {
    objectNumber: acroFormObject.objectNumber,
    generationNumber: acroFormObject.generationNumber,
    dict: parseCOSDictionary(acroFormObject.body),
  };
}

function getRequiredInt(dict: COSDictionary, key: string): number {
  const value = dict.getItem(key);
  if (value instanceof COSInteger) {
    return value.getValue();
  }
  throw new Error(`Missing ${key} in object stream dictionary`);
}

function decodeObjectStreamData(
  dictionary: COSDictionary,
  data: Uint8Array,
  parentObjectNumber: number
): Uint8Array {
  const filter = dictionary.getItem('Filter');
  if (!filter) {
    return data;
  }
  if (filter instanceof COSName) {
    return applyFilter(filter.getName(), data, parentObjectNumber);
  }
  if (filter instanceof COSArray) {
    return filter.getElements().reduce((current, entry) => {
      if (entry instanceof COSName) {
        return applyFilter(entry.getName(), current, parentObjectNumber);
      }
      throw new UnsupportedPdfFeatureError({
        feature: 'object-stream-filter',
        message: `Unsupported filter entry in object stream ${parentObjectNumber}.`,
        recommendation:
          "Port PDFBox's Filter decoding helpers (e.g., LZWDecode, ASCII85Decode) so complex object streams can be parsed.",
      });
    }, data);
  }
  throw new UnsupportedPdfFeatureError({
    feature: 'object-stream-filter',
    message: `Unsupported filter type on object stream ${parentObjectNumber}.`,
    recommendation:
      "Port PDFBox's Filter decoding helpers to handle non-name filter entries.",
  });
}

function applyFilter(
  name: string,
  data: Uint8Array,
  parentObjectNumber: number
): Uint8Array {
  if (name === 'FlateDecode') {
    return inflate(data);
  }
  throw new UnsupportedPdfFeatureError({
    feature: 'object-stream-filter',
    message: `Unsupported filter ${name} on object stream ${parentObjectNumber}.`,
    recommendation:
      "Port PDFBox's Filter classes (e.g., LZWDecode, ASCII85Decode) to decode this object stream.",
    context: { filter: name, objectStream: parentObjectNumber },
  });
}

function ensureAcroFormFields(
  acroFormDict: COSDictionary,
  widgetRef: COSObjectReference
): void {
  let fields = acroFormDict.getCOSArray('Fields');
  if (!fields) {
    fields = new COSArray();
    acroFormDict.setItem(new COSName('Fields'), fields);
  }
  const hasWidget = fields
    .getElements()
    .some(
      (entry) =>
        entry instanceof COSObjectReference && entry.equals(widgetRef)
    );
  if (!hasWidget) {
    fields.add(widgetRef);
  }

  const existingFlags = acroFormDict.getInt('SigFlags', 0);
  const mergedFlags = existingFlags | 0x3;
  acroFormDict.setItem(new COSName('SigFlags'), new COSInteger(mergedFlags));
}

export function collectFieldObjects(
  resolve: ObjectResolver,
  acroFormDict: COSDictionary
): Array<{ objectNumber: number; generationNumber: number; dict: COSDictionary }> {
  const collection: Array<{
    objectNumber: number;
    generationNumber: number;
    dict: COSDictionary;
  }> = [];
  const fields = acroFormDict.getCOSArray('Fields');
  if (!fields) {
    return collection;
  }
  for (const entry of fields.getElements()) {
    if (entry instanceof COSObjectReference) {
      try {
        const parsed = resolve(entry.objectNumber, entry.generationNumber);
        const dict = parseCOSDictionary(parsed.body);
        collection.push({
          objectNumber: parsed.objectNumber,
          generationNumber: parsed.generationNumber,
          dict,
        });
      } catch {
        // Ignore missing field references; PDFBox would warn but continue.
      }
    }
  }
  return collection;
}

function countFields(acroFormDict: COSDictionary): number {
  const fields = acroFormDict.getCOSArray('Fields');
  return fields ? fields.getElements().length : 0;
}

function detectDocMdp(
  resolve: ObjectResolver,
  existingFields: Array<{
    objectNumber: number;
    generationNumber: number;
    dict: COSDictionary;
  }>
): boolean {
  for (const field of existingFields) {
    const value = field.dict.getItem(new COSName('V'));
    if (value instanceof COSObjectReference) {
      try {
        const signatureObj = resolve(value.objectNumber, value.generationNumber);
        const signatureDict = parseCOSDictionary(signatureObj.body);
        const references = signatureDict.getCOSArray('Reference');
        if (references) {
          for (const entry of references.getElements()) {
            const refDict = resolveReferenceWithResolver(entry, resolve);
            if (!refDict) {
              continue;
            }
            const transform = refDict.getItem(new COSName('TransformMethod'));
            if (
              transform instanceof COSName &&
              transform.getName() === 'DocMDP'
            ) {
              return true;
            }
          }
        }
      } catch {
        continue;
      }
    }
  }
  return false;
}

function detectCatalogDocMdp(
  resolve: ObjectResolver,
  catalogDict: COSDictionary
): boolean {
  const permsEntry = catalogDict.getItem(new COSName('Perms'));
  if (!permsEntry) {
    return false;
  }
  const permsDict = resolveReferenceWithResolver(permsEntry, resolve);
  if (!permsDict) {
    return false;
  }
  const docMdpEntry = permsDict.getItem(new COSName('DocMDP'));
  if (!docMdpEntry) {
    return false;
  }
  if (docMdpEntry instanceof COSDictionary) {
    return true;
  }
  if (docMdpEntry instanceof COSObjectReference) {
    return true;
  }
  return false;
}

function detectExistingSignatures(
  resolve: ObjectResolver,
  existingFields: Array<{
    objectNumber: number;
    generationNumber: number;
    dict: COSDictionary;
  }>
): boolean {
  for (const field of existingFields) {
    const value = field.dict.getItem(new COSName('V'));
    if (!value) {
      continue;
    }
    if (value instanceof COSDictionary) {
      return true;
    }
    if (value instanceof COSObjectReference) {
      try {
        const signatureObj = resolve(value.objectNumber, value.generationNumber);
        const signatureDict = parseCOSDictionary(signatureObj.body);
        const type = signatureDict.getItem(COSName.TYPE);
        if (type instanceof COSName && type.getName() === 'Sig') {
          return true;
        }
        if (signatureDict.containsKey(new COSName('Contents'))) {
          return true;
        }
      } catch {
        continue;
      }
    }
  }
  return false;
}

export interface DocumentSignatureSnapshot {
  hasDocMdp: boolean;
  hasSignedFields: boolean;
}

function inspectDocumentSignaturesInternal(
  pdfBytes: Uint8Array
): DocumentSignatureSnapshot {
  try {
    const trailer = parsePdfTrailer(pdfBytes);
    let resolve: ObjectResolver;
    try {
      const state = new COSDocumentState(pdfBytes, trailer);
      resolve = createObjectResolver(state, pdfBytes);
    } catch {
      // Fallback for PDFs without valid xref tables (e.g., synthetic test PDFs)
      resolve = createRawResolver(pdfBytes);
    }
    const catalogObject = resolve(
      trailer.rootRef.objectNumber,
      trailer.rootRef.generation
    );
    const catalogDict = parseCOSDictionary(catalogObject.body);
    let hasDocMdp = detectCatalogDocMdp(resolve, catalogDict);
    let hasSignedFields = false;

    const acroFormEntry = catalogDict.getItem('AcroForm');
    if (acroFormEntry instanceof COSObjectReference) {
      const parsed = parseReferencedAcroForm(resolve, acroFormEntry);
      const existingFields = collectFieldObjects(resolve, parsed.dict);
      hasDocMdp = hasDocMdp || detectDocMdp(resolve, existingFields);
      hasSignedFields = detectExistingSignatures(resolve, existingFields);
    } else if (acroFormEntry instanceof COSDictionary) {
      const existingFields = collectFieldObjects(resolve, acroFormEntry);
      hasDocMdp = hasDocMdp || detectDocMdp(resolve, existingFields);
      hasSignedFields = detectExistingSignatures(resolve, existingFields);
    }

    return { hasDocMdp, hasSignedFields };
  } catch {
    return { hasDocMdp: false, hasSignedFields: false };
  }
}

export function documentHasDocMdp(pdfBytes: Uint8Array): boolean {
  return inspectDocumentSignaturesInternal(pdfBytes).hasDocMdp;
}

export function documentHasExistingSignatures(pdfBytes: Uint8Array): boolean {
  return inspectDocumentSignaturesInternal(pdfBytes).hasSignedFields;
}

export function inspectDocumentSignatures(
  pdfBytes: Uint8Array
): DocumentSignatureSnapshot {
  return inspectDocumentSignaturesInternal(pdfBytes);
}

function resolveReferenceWithResolver(
  entry: COSBase,
  resolve: ObjectResolver
): COSDictionary | undefined {
  if (entry instanceof COSDictionary) {
    return entry;
  }
  if (entry instanceof COSObjectReference) {
    try {
      const parsed = resolve(entry.objectNumber, entry.generationNumber);
      return parseCOSDictionary(parsed.body);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Resolve the object number for a specific page by index.
 * Navigates catalog → /Pages → /Kids, handling nested page tree nodes.
 */
export function resolvePageObjectNumber(
  resolve: ObjectResolver,
  catalogBody: string,
  pageIndex: number
): { objectNumber: number; generationNumber: number } {
  const catalogDict = parseCOSDictionary(catalogBody);
  const pagesEntry = catalogDict.getItem('Pages');
  if (!pagesEntry || !(pagesEntry instanceof COSObjectReference)) {
    throw new Error('Catalog missing /Pages reference');
  }
  const pagesObj = resolve(pagesEntry.objectNumber, pagesEntry.generationNumber);
  const pagesDict = parseCOSDictionary(pagesObj.body);

  function findPage(
    dict: COSDictionary,
    target: number,
    countBefore: number
  ): { objectNumber: number; generationNumber: number } | null {
    const kids = dict.getCOSArray('Kids');
    if (!kids) {
      throw new Error('/Pages node missing /Kids array');
    }
    let offset = countBefore;
    for (const kid of kids.getElements()) {
      if (!(kid instanceof COSObjectReference)) continue;
      const kidObj = resolve(kid.objectNumber, kid.generationNumber);
      const kidDict = parseCOSDictionary(kidObj.body);
      const type = kidDict.getItem('Type');
      const typeName = type instanceof COSName ? type.getName() : '';
      if (typeName === 'Page') {
        if (offset === target) {
          return { objectNumber: kid.objectNumber, generationNumber: kid.generationNumber };
        }
        offset++;
      } else if (typeName === 'Pages') {
        const countVal = kidDict.getItem('Count');
        const count = countVal instanceof COSInteger ? countVal.getValue() : 0;
        if (target < offset + count) {
          return findPage(kidDict, target, offset);
        }
        offset += count;
      }
    }
    return null;
  }

  const result = findPage(pagesDict, pageIndex, 0);
  if (!result) {
    throw new Error(`Page index ${pageIndex} out of range`);
  }
  return result;
}

export function buildPageWidgetDictionary(
  pageBody: string,
  widgetRef: COSObjectReference
): COSDictionary {
  const pageDict = parseCOSDictionary(pageBody);
  let annots = pageDict.getCOSArray('Annots');
  if (!annots) {
    annots = new COSArray();
    pageDict.setItem(new COSName('Annots'), annots);
  }
  const exists = annots
    .getElements()
    .some(
      (entry) =>
        entry instanceof COSObjectReference && entry.equals(widgetRef)
    );
  if (!exists) {
    annots.add(widgetRef);
  }
  return pageDict;
}
