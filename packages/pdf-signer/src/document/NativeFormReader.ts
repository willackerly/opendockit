/**
 * NativeFormReader — reads AcroForm field metadata from COS objects.
 *
 * Walks the /AcroForm → /Fields array in the catalog, resolves indirect refs,
 * and returns a flat list of field descriptors. Supports hierarchical field names,
 * /Kids arrays, and all standard field types (/Tx, /Btn, /Ch, /Sig).
 *
 * Phase 7: Enables getForm().getFields() / getTextField() on native documents
 * without requiring pdf-lib.
 */

import type { NativeDocumentContext } from './NativeDocumentContext.js';
import {
  COSName,
  COSString,
  COSArray,
  COSDictionary,
  COSObjectReference,
  COSBoolean,
} from '../pdfbox/cos/COSTypes.js';

/** Field type as detected from the /FT key. */
export type NativeFieldType = 'Tx' | 'Btn' | 'Ch' | 'Sig' | 'Unknown';

/** Descriptor for a single AcroForm field. */
export interface NativeFieldInfo {
  /** Fully-qualified field name (parent.child notation). */
  name: string;
  /** Field type from /FT. */
  type: NativeFieldType;
  /** Field value (string for text, name for checkbox/radio, undefined if unset). */
  value: string | undefined;
  /** Field flags from /Ff (0 if not present). */
  flags: number;
  /** The COS dictionary for this field. */
  dict: COSDictionary;
  /** The indirect reference to this field object. */
  ref: COSObjectReference;
}

// AcroForm field flags (PDF spec Table 221)
/** Bit 1: ReadOnly */
export const FF_READ_ONLY = 1 << 0;
/** Bit 2: Required */
export const FF_REQUIRED = 1 << 1;
/** Bit 3: NoExport */
export const FF_NO_EXPORT = 1 << 2;
/** Bit 13: Multiline (text fields) */
export const FF_MULTILINE = 1 << 12;
/** Bit 14: Password (text fields) */
export const FF_PASSWORD = 1 << 13;
/** Bit 21: NoToggleToOff (button fields) */
export const FF_NO_TOGGLE_TO_OFF = 1 << 20;
/** Bit 26: Radio (button fields) */
export const FF_RADIO = 1 << 25;
/** Bit 25: Pushbutton (button fields) */
export const FF_PUSHBUTTON = 1 << 24;
/** Bit 18: Combo (choice fields) */
export const FF_COMBO = 1 << 17;

/**
 * Read all fields from the AcroForm in a native document context.
 *
 * Returns an empty array if there is no AcroForm or no /Fields array.
 */
export function readFields(ctx: NativeDocumentContext): NativeFieldInfo[] {
  const acroFormEntry = ctx.catalog.getItem('AcroForm');
  if (!acroFormEntry) return [];

  let acroFormDict: COSDictionary | undefined;

  if (acroFormEntry instanceof COSObjectReference) {
    const resolved = ctx.resolveRef(acroFormEntry);
    if (resolved instanceof COSDictionary) {
      acroFormDict = resolved;
    }
  } else if (acroFormEntry instanceof COSDictionary) {
    acroFormDict = acroFormEntry;
  }

  if (!acroFormDict) return [];

  const fieldsEntry = acroFormDict.getItem('Fields');
  if (!fieldsEntry) return [];

  let fieldsArray: COSArray | undefined;
  if (fieldsEntry instanceof COSArray) {
    fieldsArray = fieldsEntry;
  } else if (fieldsEntry instanceof COSObjectReference) {
    const resolved = ctx.resolveRef(fieldsEntry);
    if (resolved instanceof COSArray) {
      fieldsArray = resolved;
    }
  }

  if (!fieldsArray) return [];

  const result: NativeFieldInfo[] = [];
  walkFieldArray(ctx, fieldsArray, '', result);
  return result;
}

/**
 * Get the AcroForm dictionary from the catalog, or undefined if none.
 */
export function getAcroFormDict(ctx: NativeDocumentContext): COSDictionary | undefined {
  const entry = ctx.catalog.getItem('AcroForm');
  if (!entry) return undefined;

  if (entry instanceof COSObjectReference) {
    const resolved = ctx.resolveRef(entry);
    return resolved instanceof COSDictionary ? resolved : undefined;
  }
  if (entry instanceof COSDictionary) return entry;
  return undefined;
}

/**
 * Set /NeedAppearances true on the AcroForm dictionary.
 * Creates the AcroForm dict if it doesn't exist.
 */
export function setNeedAppearances(ctx: NativeDocumentContext): void {
  let acroForm = getAcroFormDict(ctx);
  if (!acroForm) {
    // Create AcroForm dict and wire to catalog
    acroForm = new COSDictionary();
    acroForm.setItem('Fields', new COSArray());
    const ref = ctx.register(acroForm);
    ctx.catalog.setItem('AcroForm', ref);
  }
  acroForm.setItem('NeedAppearances', COSBoolean.TRUE);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/**
 * Recursively walk a /Fields (or /Kids) array and collect field descriptors.
 */
function walkFieldArray(
  ctx: NativeDocumentContext,
  array: COSArray,
  parentName: string,
  result: NativeFieldInfo[],
): void {
  for (let i = 0; i < array.size(); i++) {
    const element = array.get(i);
    if (!(element instanceof COSObjectReference)) continue;

    const obj = ctx.resolveRef(element);
    if (!(obj instanceof COSDictionary)) continue;

    processFieldDict(ctx, obj, element, parentName, result);
  }
}

/**
 * Process a single field dictionary. If it has /Kids, recurse.
 * If it's a terminal field (or has both /T and a widget), add to result.
 */
function processFieldDict(
  ctx: NativeDocumentContext,
  dict: COSDictionary,
  ref: COSObjectReference,
  parentName: string,
  result: NativeFieldInfo[],
): void {
  // Build the fully-qualified name
  const partialName = getStringValue(dict, 'T');
  const fullName = parentName
    ? (partialName ? `${parentName}.${partialName}` : parentName)
    : (partialName ?? '');

  // Check for /Kids array
  const kidsEntry = dict.getItem('Kids');
  let kidsArray: COSArray | undefined;
  if (kidsEntry instanceof COSArray) {
    kidsArray = kidsEntry;
  } else if (kidsEntry instanceof COSObjectReference) {
    const resolved = ctx.resolveRef(kidsEntry);
    if (resolved instanceof COSArray) {
      kidsArray = resolved;
    }
  }

  if (kidsArray && kidsArray.size() > 0) {
    // Check if kids are widget annotations (have /Subtype /Widget) or field dicts
    // If the first kid has /T, treat them as sub-fields; otherwise they're widgets
    const firstKidRef = kidsArray.get(0);
    let firstKid: COSDictionary | undefined;
    if (firstKidRef instanceof COSObjectReference) {
      const resolved = ctx.resolveRef(firstKidRef);
      if (resolved instanceof COSDictionary) firstKid = resolved;
    } else if (firstKidRef instanceof COSDictionary) {
      firstKid = firstKidRef;
    }

    const firstKidHasT = firstKid?.containsKey('T');

    if (firstKidHasT) {
      // Kids are sub-fields — recurse
      walkFieldArray(ctx, kidsArray, fullName, result);
      return;
    }

    // Kids are widget annotations — this is a terminal field
    // (The field itself carries the /FT, /V, /Ff; kids are just visual widgets)
  }

  // Terminal field — extract metadata
  const fieldType = getFieldType(dict, ctx);
  const value = getFieldValue(dict, ctx);
  const flags = dict.getInt('Ff', 0);

  result.push({
    name: fullName,
    type: fieldType,
    value,
    flags,
    dict,
    ref,
  });
}

/**
 * Determine field type from /FT. Walks up parent chain if /FT is inherited.
 */
function getFieldType(dict: COSDictionary, ctx: NativeDocumentContext): NativeFieldType {
  // Check directly on this dict
  const ft = dict.getCOSName('FT');
  if (ft) {
    return mapFieldType(ft.getName());
  }

  // PDF spec: /FT can be inherited from parent
  const parentEntry = dict.getItem('Parent');
  if (parentEntry instanceof COSObjectReference) {
    const parent = ctx.resolveRef(parentEntry);
    if (parent instanceof COSDictionary) {
      return getFieldType(parent, ctx);
    }
  }

  return 'Unknown';
}

/**
 * Map /FT name to NativeFieldType.
 */
function mapFieldType(ftName: string): NativeFieldType {
  switch (ftName) {
    case 'Tx': return 'Tx';
    case 'Btn': return 'Btn';
    case 'Ch': return 'Ch';
    case 'Sig': return 'Sig';
    default: return 'Unknown';
  }
}

/**
 * Get field value from /V entry.
 * - COSString → text value
 * - COSName → name value (for checkboxes/radios: "Yes", "Off", etc.)
 */
function getFieldValue(dict: COSDictionary, ctx: NativeDocumentContext): string | undefined {
  let vEntry = dict.getItem('V');

  // Resolve indirect reference
  if (vEntry instanceof COSObjectReference) {
    vEntry = ctx.resolveRef(vEntry);
  }

  if (!vEntry) return undefined;

  if (vEntry instanceof COSString) {
    return decodeStringValue(vEntry);
  }
  if (vEntry instanceof COSName) {
    return vEntry.getName();
  }

  return undefined;
}

/**
 * Get a string value from a dictionary key.
 * Handles UTF-16BE BOM (0xFE 0xFF) — pdf-lib encodes all strings this way.
 */
function getStringValue(dict: COSDictionary, key: string): string | undefined {
  const entry = dict.getItem(key);
  if (entry instanceof COSString) return decodeStringValue(entry);
  if (entry instanceof COSName) return entry.getName();
  return undefined;
}

/**
 * Decode a COSString, detecting UTF-16BE BOM.
 */
function decodeStringValue(cosStr: COSString): string {
  const bytes = cosStr.getBytes();
  // Detect UTF-16BE BOM (0xFE 0xFF)
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    let result = '';
    for (let i = 2; i < bytes.length - 1; i += 2) {
      result += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return result;
  }
  return cosStr.getString();
}
