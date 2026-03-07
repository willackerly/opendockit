/**
 * PDFForm — native-only form wrapper.
 *
 * Uses NativeFormReader for read/write of fields,
 * and NativeDocumentContext for form field creation.
 */

import { PDFFont } from './PDFFont.js';
import {
  PDFField,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFButton,
  PDFSignature,
} from './fields/index.js';
import type { FlattenOptions } from './options.js';
import type { NativeDocumentContext } from './NativeDocumentContext.js';
import type { NativeFieldInfo } from './NativeFormReader.js';
import {
  readFields,
  getAcroFormDict,
} from './NativeFormReader.js';
import {
  COSName,
  COSString,
  COSInteger,
  COSArray,
  COSDictionary,
  COSObjectReference,
  COSStream,
} from '../pdfbox/cos/COSTypes.js';
import { ContentStreamBuilder } from './content-stream/ContentStreamBuilder.js';
import { rgb } from './colors.js';
import {
  generateAllFieldAppearances,
  generateTextFieldAppearance,
  generateDropdownAppearance,
} from './fields/FieldAppearanceGenerator.js';

export class PDFForm {
  /** @internal — native document context */ readonly _nativeCtx: NativeDocumentContext;
  /** @internal — cached native field list */ private _nativeFields?: NativeFieldInfo[];

  /** @internal */
  constructor(nativeCtx: NativeDocumentContext) {
    this._nativeCtx = nativeCtx;
  }

  /** @internal */
  static _wrapNative(ctx: NativeDocumentContext): PDFForm {
    return new PDFForm(ctx);
  }

  private _getNativeFields(): NativeFieldInfo[] {
    if (!this._nativeFields) {
      this._nativeFields = readFields(this._nativeCtx);
    }
    return this._nativeFields;
  }

  /** @internal — invalidate cached fields after mutation. */
  private _invalidateCache(): void {
    this._nativeFields = undefined;
  }

  hasXFA(): boolean {
    const acroForm = getAcroFormDict(this._nativeCtx);
    if (!acroForm) return false;
    return acroForm.containsKey('XFA');
  }

  deleteXFA(): void {
    const acroForm = getAcroFormDict(this._nativeCtx);
    if (acroForm) acroForm.removeItem('XFA');
  }

  getFields(): PDFField[] {
    return this._getNativeFields().map((info) => PDFField._wrapNative(info));
  }

  getFieldMaybe(name: string): PDFField | undefined {
    const info = this._getNativeFields().find((f) => f.name === name);
    return info ? PDFField._wrapNative(info) : undefined;
  }

  getField(name: string): PDFField {
    const info = this._getNativeFields().find((f) => f.name === name);
    if (!info) {
      throw new Error(
        `No field named "${name}" exists in this document.`,
      );
    }
    return PDFField._wrapNative(info);
  }

  getTextField(name: string): PDFTextField {
    const info = this._getNativeFields().find((f) => f.name === name);
    if (!info) {
      throw new Error(
        `No field named "${name}" exists in this document.`,
      );
    }
    if (info.type !== 'Tx') {
      throw new Error(
        `Field "${name}" is not a text field (type: ${info.type}).`,
      );
    }
    return PDFTextField._createNative(info, this._nativeCtx);
  }

  getButton(name: string): PDFButton {
    const info = this._getNativeFields().find((f) => f.name === name);
    if (!info) throw new Error(`No field named "${name}" exists in this document.`);
    if (info.type !== 'Btn') throw new Error(`Field "${name}" is not a button (type: ${info.type}).`);
    return PDFButton._createNative(info, this._nativeCtx);
  }

  getCheckBox(name: string): PDFCheckBox {
    const info = this._getNativeFields().find((f) => f.name === name);
    if (!info) throw new Error(`No field named "${name}" exists in this document.`);
    if (info.type !== 'Btn') throw new Error(`Field "${name}" is not a checkbox (type: ${info.type}).`);
    return PDFCheckBox._createNative(info, this._nativeCtx);
  }

  getDropdown(name: string): PDFDropdown {
    const info = this._getNativeFields().find((f) => f.name === name);
    if (!info) throw new Error(`No field named "${name}" exists in this document.`);
    if (info.type !== 'Ch') throw new Error(`Field "${name}" is not a dropdown (type: ${info.type}).`);
    return PDFDropdown._createNative(info, this._nativeCtx);
  }

  getOptionList(name: string): PDFOptionList {
    const info = this._getNativeFields().find((f) => f.name === name);
    if (!info) throw new Error(`No field named "${name}" exists in this document.`);
    if (info.type !== 'Ch') throw new Error(`Field "${name}" is not an option list (type: ${info.type}).`);
    return PDFOptionList._createNative(info, this._nativeCtx);
  }

  getRadioGroup(name: string): PDFRadioGroup {
    const info = this._getNativeFields().find((f) => f.name === name);
    if (!info) throw new Error(`No field named "${name}" exists in this document.`);
    if (info.type !== 'Btn') throw new Error(`Field "${name}" is not a radio group (type: ${info.type}).`);
    return PDFRadioGroup._createNative(info, this._nativeCtx);
  }

  getSignature(name: string): PDFSignature {
    const info = this._getNativeFields().find((f) => f.name === name);
    if (!info) throw new Error(`No field named "${name}" exists in this document.`);
    if (info.type !== 'Sig') throw new Error(`Field "${name}" is not a signature (type: ${info.type}).`);
    return PDFSignature._createNative(info);
  }

  // =========================================================================
  // Native form field creation
  // =========================================================================

  createTextField(name: string): PDFTextField {
    return this._createTextFieldNative(name);
  }

  createCheckBox(name: string): PDFCheckBox {
    return this._createCheckBoxNative(name);
  }

  createDropdown(name: string): PDFDropdown {
    return this._createDropdownNative(name);
  }

  createOptionList(name: string): PDFOptionList {
    return this._createOptionListNative(name);
  }

  createRadioGroup(name: string): PDFRadioGroup {
    return this._createRadioGroupNative(name);
  }

  createButton(name: string): PDFButton {
    return this._createButtonNative(name);
  }

  // =========================================================================
  // Form flattening
  // =========================================================================

  flatten(_options?: FlattenOptions): void {
    // Auto-generate appearances for fields that are missing them before flattening
    this._ensureAppearancesBeforeFlatten();
    this._flattenNative();
  }

  removeField(field: PDFField): void {
    const ctx = this._nativeCtx;
    const nativeInfo = field._native!;
    const fieldRef = nativeInfo.ref;
    const fieldDict = nativeInfo.dict;

    // 1. Remove from /AcroForm /Fields array
    const acroForm = getAcroFormDict(ctx);
    if (acroForm) {
      const fieldsEntry = acroForm.getItem('Fields');
      if (fieldsEntry instanceof COSArray) {
        removeRefFromArray(fieldsEntry, fieldRef);
      }
    }

    // 2. Remove widget annotations from page /Annots arrays
    const pages = ctx.getPageList();
    for (const { pageDict } of pages) {
      let annotsEntry = pageDict.getItem('Annots');
      if (annotsEntry instanceof COSObjectReference) {
        annotsEntry = ctx.resolveRef(annotsEntry);
      }
      if (!(annotsEntry instanceof COSArray)) continue;

      // Remove the field's own ref (merged field+widget)
      removeRefFromArray(annotsEntry, fieldRef);

      // Remove child widget refs from /Kids
      const kidsEntry = fieldDict.getItem('Kids');
      if (kidsEntry instanceof COSArray) {
        for (let k = 0; k < kidsEntry.size(); k++) {
          const kidEntry = kidsEntry.get(k);
          if (kidEntry instanceof COSObjectReference) {
            removeRefFromArray(annotsEntry, kidEntry);
          }
        }
      }
    }

    this._invalidateCache();
  }

  updateFieldAppearances(_font?: PDFFont): void {
    // Generate appearance streams for all fields
    generateAllFieldAppearances(this._nativeCtx);
  }

  markFieldAsDirty(_fieldRef: unknown): void {
    // No-op for native forms
  }

  markFieldAsClean(_fieldRef: unknown): void {
    // No-op for native forms
  }

  fieldIsDirty(_fieldRef: unknown): boolean {
    return false;
  }

  getDefaultFont(): never {
    throw new Error(
      'PDFForm.getDefaultFont() is not available natively. ' +
      'Use PDFDocument.embedFont() to create fonts.',
    );
  }

  // =========================================================================
  // Pre-flatten appearance generation
  // =========================================================================

  /**
   * Walk all fields and generate appearance streams for any widget
   * that is missing /AP /N. Called automatically by flatten() so that
   * text fields (which only had /NeedAppearances) get real appearances
   * before their content is baked into the page.
   */
  private _ensureAppearancesBeforeFlatten(): void {
    try {
      const fields = this._getNativeFields();
      for (const field of fields) {
        // Check if the widget already has an /AP /N entry
        let hasAppearance = false;
        const ap = field.dict.getItem('AP');
        if (ap instanceof COSDictionary) {
          const n = ap.getItem('N');
          hasAppearance = n != null;
        }
        if (hasAppearance) continue;

        // Generate appearance based on field type
        switch (field.type) {
          case 'Tx':
            generateTextFieldAppearance(this._nativeCtx, field.dict, field.value ?? '');
            break;
          case 'Ch':
            generateDropdownAppearance(this._nativeCtx, field.dict, field.value ?? '');
            break;
          // Btn and Sig types already have appearances from creation
        }
      }
    } catch {
      // If appearance generation fails, flatten will proceed without appearances
      // (the field will simply be invisible after flattening)
    }
  }

  // =========================================================================
  // Native field creation internals
  // =========================================================================

  private _assertNoExistingField(name: string): void {
    const existing = this._getNativeFields().find((f) => f.name === name);
    if (existing) {
      throw new Error(`A field named "${name}" already exists.`);
    }
  }

  private _createTextFieldNative(name: string): PDFTextField {
    this._assertNoExistingField(name);
    const ctx = this._nativeCtx;
    ctx.ensureDefaultResources();

    // Merged field+widget dict
    const dict = new COSDictionary();
    dict.setItem('Type', new COSName('Annot'));
    dict.setItem('Subtype', new COSName('Widget'));
    dict.setItem('FT', new COSName('Tx'));
    dict.setItem('T', new COSString(name));
    dict.setItem('DA', new COSString('/Helv 12 Tf 0 g'));
    dict.setItem('Ff', new COSInteger(0));
    // Default empty rect — must use addToPage to position
    dict.setItem('Rect', makeRect(0, 0, 0, 0));

    const ref = ctx.register(dict);
    ctx.ensureFieldsArray().add(ref);
    this._invalidateCache();

    const info: NativeFieldInfo = {
      name,
      type: 'Tx',
      value: undefined,
      flags: 0,
      dict,
      ref,
    };
    return PDFTextField._createNative(info, ctx);
  }

  private _createCheckBoxNative(name: string): PDFCheckBox {
    this._assertNoExistingField(name);
    const ctx = this._nativeCtx;
    ctx.ensureDefaultResources();

    const dict = new COSDictionary();
    dict.setItem('Type', new COSName('Annot'));
    dict.setItem('Subtype', new COSName('Widget'));
    dict.setItem('FT', new COSName('Btn'));
    dict.setItem('T', new COSString(name));
    dict.setItem('V', new COSName('Off'));
    dict.setItem('Ff', new COSInteger(0));
    dict.setItem('Rect', makeRect(0, 0, 0, 0));

    // Build /AP with /N containing /Yes and /Off appearance states
    const apDict = new COSDictionary();
    apDict.setDirect(true);
    const nDict = new COSDictionary();
    nDict.setDirect(true);

    // /Yes: checkmark
    const yesStream = buildCheckboxAppearance(ctx, true);
    nDict.setItem('Yes', yesStream);
    // /Off: empty
    const offStream = buildCheckboxAppearance(ctx, false);
    nDict.setItem('Off', offStream);
    apDict.setItem('N', nDict);
    dict.setItem('AP', apDict);

    // /AS (appearance state)
    dict.setItem('AS', new COSName('Off'));

    const ref = ctx.register(dict);
    ctx.ensureFieldsArray().add(ref);
    this._invalidateCache();

    const info: NativeFieldInfo = {
      name,
      type: 'Btn',
      value: 'Off',
      flags: 0,
      dict,
      ref,
    };
    return PDFCheckBox._createNative(info, ctx);
  }

  private _createDropdownNative(name: string): PDFDropdown {
    this._assertNoExistingField(name);
    const ctx = this._nativeCtx;
    ctx.ensureDefaultResources();

    const dict = new COSDictionary();
    dict.setItem('Type', new COSName('Annot'));
    dict.setItem('Subtype', new COSName('Widget'));
    dict.setItem('FT', new COSName('Ch'));
    dict.setItem('T', new COSString(name));
    dict.setItem('DA', new COSString('/Helv 12 Tf 0 g'));
    // Bit 18 = Combo (dropdown)
    dict.setItem('Ff', new COSInteger(1 << 17));
    dict.setItem('Opt', new COSArray());
    dict.setItem('Rect', makeRect(0, 0, 0, 0));

    const ref = ctx.register(dict);
    ctx.ensureFieldsArray().add(ref);
    this._invalidateCache();

    const info: NativeFieldInfo = {
      name,
      type: 'Ch',
      value: undefined,
      flags: 1 << 17,
      dict,
      ref,
    };
    return PDFDropdown._createNative(info, ctx);
  }

  private _createOptionListNative(name: string): PDFOptionList {
    this._assertNoExistingField(name);
    const ctx = this._nativeCtx;
    ctx.ensureDefaultResources();

    const dict = new COSDictionary();
    dict.setItem('Type', new COSName('Annot'));
    dict.setItem('Subtype', new COSName('Widget'));
    dict.setItem('FT', new COSName('Ch'));
    dict.setItem('T', new COSString(name));
    dict.setItem('DA', new COSString('/Helv 12 Tf 0 g'));
    dict.setItem('Ff', new COSInteger(0)); // No Combo = list box
    dict.setItem('Opt', new COSArray());
    dict.setItem('Rect', makeRect(0, 0, 0, 0));

    const ref = ctx.register(dict);
    ctx.ensureFieldsArray().add(ref);
    this._invalidateCache();

    const info: NativeFieldInfo = {
      name,
      type: 'Ch',
      value: undefined,
      flags: 0,
      dict,
      ref,
    };
    return PDFOptionList._createNative(info, ctx);
  }

  private _createRadioGroupNative(name: string): PDFRadioGroup {
    this._assertNoExistingField(name);
    const ctx = this._nativeCtx;
    ctx.ensureDefaultResources();

    const dict = new COSDictionary();
    dict.setItem('FT', new COSName('Btn'));
    dict.setItem('T', new COSString(name));
    dict.setItem('V', new COSName('Off'));
    // Bit 26 = Radio, Bit 16 = NoToggleToOff
    dict.setItem('Ff', new COSInteger((1 << 25) | (1 << 15)));
    dict.setItem('Kids', new COSArray());

    const ref = ctx.register(dict);
    ctx.ensureFieldsArray().add(ref);
    this._invalidateCache();

    const info: NativeFieldInfo = {
      name,
      type: 'Btn',
      value: 'Off',
      flags: (1 << 25) | (1 << 15),
      dict,
      ref,
    };
    return PDFRadioGroup._createNative(info, ctx);
  }

  private _createButtonNative(name: string): PDFButton {
    this._assertNoExistingField(name);
    const ctx = this._nativeCtx;
    ctx.ensureDefaultResources();

    const dict = new COSDictionary();
    dict.setItem('Type', new COSName('Annot'));
    dict.setItem('Subtype', new COSName('Widget'));
    dict.setItem('FT', new COSName('Btn'));
    dict.setItem('T', new COSString(name));
    dict.setItem('DA', new COSString('/Helv 12 Tf 0 g'));
    // Bit 25 = Pushbutton
    dict.setItem('Ff', new COSInteger(1 << 24));
    dict.setItem('Rect', makeRect(0, 0, 0, 0));

    const ref = ctx.register(dict);
    ctx.ensureFieldsArray().add(ref);
    this._invalidateCache();

    const info: NativeFieldInfo = {
      name,
      type: 'Btn',
      value: undefined,
      flags: 1 << 24,
      dict,
      ref,
    };
    return PDFButton._createNative(info, ctx);
  }

  // =========================================================================
  // Native flatten
  // =========================================================================

  private _flattenNative(): void {
    const ctx = this._nativeCtx;
    const acroForm = getAcroFormDict(ctx);
    if (!acroForm) return;

    const pages = ctx.getPageList();

    // For each page, find widget annotations and bake their appearances
    for (const { pageDict } of pages) {
      let annotsEntry = pageDict.getItem('Annots');
      if (annotsEntry instanceof COSObjectReference) {
        annotsEntry = ctx.resolveRef(annotsEntry);
      }
      if (!(annotsEntry instanceof COSArray)) continue;
      const annots = annotsEntry;

      // Collect non-widget annotations to keep
      const keepAnnots = new COSArray();
      keepAnnots.setDirect(true);

      for (let i = 0; i < annots.size(); i++) {
        let entry = annots.get(i);
        const entryRef = entry instanceof COSObjectReference ? entry : undefined;
        if (entry instanceof COSObjectReference) {
          entry = ctx.resolveRef(entry);
        }
        if (!(entry instanceof COSDictionary)) {
          if (entryRef) keepAnnots.add(entryRef);
          continue;
        }

        const subtypeName = entry.getCOSName('Subtype');
        if (!subtypeName || subtypeName.getName() !== 'Widget') {
          // Keep non-widget annotations
          if (entryRef) keepAnnots.add(entryRef);
          continue;
        }

        // This is a widget — try to bake its appearance into the page
        this._flattenWidget(ctx, entry, pageDict);
      }

      // Replace /Annots with non-widget entries only
      if (keepAnnots.size() > 0) {
        pageDict.setItem('Annots', keepAnnots);
      } else {
        pageDict.removeItem('Annots');
      }
    }

    // Also handle field /Kids widgets that may not be in page /Annots
    const fieldsArr = acroForm.getItem('Fields');
    if (fieldsArr instanceof COSArray) {
      this._flattenFieldWidgets(ctx, fieldsArr, pages);
    }

    // Clear /AcroForm /Fields
    acroForm.setItem('Fields', new COSArray());
    acroForm.removeItem('NeedAppearances');
    this._invalidateCache();
  }

  private _flattenWidget(
    ctx: NativeDocumentContext,
    widget: COSDictionary,
    pageDict: COSDictionary,
  ): void {
    // Get appearance stream from /AP /N
    let apEntry = widget.getItem('AP');
    if (apEntry instanceof COSObjectReference) {
      apEntry = ctx.resolveRef(apEntry);
    }
    if (!(apEntry instanceof COSDictionary)) return;

    let normalAp = apEntry.getItem('N');

    // Track the original COSObjectReference for the appearance stream
    // so we don't re-register an already-registered object.
    let normalApRef: COSObjectReference | undefined;

    // If /N is a dict (state dictionary like checkbox), pick the current /AS
    if (normalAp instanceof COSObjectReference) {
      const resolved = ctx.resolveRef(normalAp);
      if (resolved instanceof COSDictionary && !(resolved instanceof COSStream)) {
        // It's a state dict — get the selected state
        const asName = widget.getCOSName('AS');
        const stateName = asName?.getName() ?? 'Yes';
        normalAp = resolved.getItem(stateName);
        if (normalAp instanceof COSObjectReference) {
          normalApRef = normalAp;
          normalAp = ctx.resolveRef(normalAp);
        }
      } else {
        normalApRef = normalAp;
        normalAp = resolved;
      }
    } else if (normalAp instanceof COSDictionary && !(normalAp instanceof COSStream)) {
      const asName = widget.getCOSName('AS');
      const stateName = asName?.getName() ?? 'Yes';
      normalAp = normalAp.getItem(stateName);
      if (normalAp instanceof COSObjectReference) {
        normalApRef = normalAp;
        normalAp = ctx.resolveRef(normalAp);
      }
    } else if (normalAp instanceof COSObjectReference) {
      normalApRef = normalAp;
      normalAp = ctx.resolveRef(normalAp);
    }

    if (!normalAp) return;

    // Get /Rect to determine placement
    const rectArr = widget.getItem('Rect');
    if (!(rectArr instanceof COSArray) || rectArr.size() < 4) return;
    const rx1 = cosNum(rectArr, 0);
    const ry1 = cosNum(rectArr, 1);
    const rx2 = cosNum(rectArr, 2);
    const ry2 = cosNum(rectArr, 3);
    const rw = rx2 - rx1;
    const rh = ry2 - ry1;
    if (rw <= 0 || rh <= 0) return;

    // Register the appearance as XObject on page resources
    const resources = ensureResourcesDict(pageDict, ctx);
    let xobjDict = resources.getItem('XObject');
    if (xobjDict instanceof COSObjectReference) {
      xobjDict = ctx.resolveRef(xobjDict);
      if (xobjDict) resources.setItem('XObject', xobjDict);
    }
    if (!(xobjDict instanceof COSDictionary)) {
      xobjDict = new COSDictionary();
      (xobjDict as COSDictionary).setDirect(true);
      resources.setItem('XObject', xobjDict);
    }

    // Generate unique key
    let idx = 1;
    while ((xobjDict as COSDictionary).getItem(`Flat${idx}`)) idx++;
    const key = `Flat${idx}`;

    // Use the original ref if available, otherwise register the object
    const apRef = normalApRef ?? ctx.register(normalAp);
    (xobjDict as COSDictionary).setItem(key, apRef);

    // Get /BBox for transform calculation
    let bx1 = 0, by1 = 0, bx2 = rw, by2 = rh;
    if (normalAp instanceof COSStream) {
      const bbox = normalAp.getDictionary().getItem('BBox');
      if (bbox instanceof COSArray && bbox.size() >= 4) {
        bx1 = cosNum(bbox, 0);
        by1 = cosNum(bbox, 1);
        bx2 = cosNum(bbox, 2);
        by2 = cosNum(bbox, 3);
      }
    } else if (normalAp instanceof COSDictionary) {
      const bbox = normalAp.getItem('BBox');
      if (bbox instanceof COSArray && bbox.size() >= 4) {
        bx1 = cosNum(bbox, 0);
        by1 = cosNum(bbox, 1);
        bx2 = cosNum(bbox, 2);
        by2 = cosNum(bbox, 3);
      }
    }

    // Calculate transform matrix
    const bw = bx2 - bx1;
    const bh = by2 - by1;
    const sx = bw > 0 ? rw / bw : 1;
    const sy = bh > 0 ? rh / bh : 1;
    const tx = rx1 - bx1 * sx;
    const ty = ry1 - by1 * sy;

    // Append to page content stream: q sx 0 0 sy tx ty cm /key Do Q
    const b = new ContentStreamBuilder();
    b.pushGraphicsState();
    b.concatMatrix(sx, 0, 0, sy, tx, ty);
    b.drawXObject(key);
    b.popGraphicsState();

    appendContentStream(ctx, pageDict, b.toBytes());
  }

  private _flattenFieldWidgets(
    ctx: NativeDocumentContext,
    fieldsArr: COSArray,
    pages: Array<{ pageDict: COSDictionary; pageRef: COSObjectReference }>,
  ): void {
    for (let i = 0; i < fieldsArr.size(); i++) {
      let entry = fieldsArr.get(i);
      if (entry instanceof COSObjectReference) {
        entry = ctx.resolveRef(entry);
      }
      if (!(entry instanceof COSDictionary)) continue;

      // Check for /Kids (radio group with multiple widgets)
      const kidsEntry = entry.getItem('Kids');
      if (kidsEntry instanceof COSArray) {
        this._flattenFieldWidgets(ctx, kidsEntry, pages);
      }
    }
  }

}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRect(x: number, y: number, w: number, h: number): COSArray {
  const arr = new COSArray();
  arr.setDirect(true);
  arr.add(new COSInteger(x));
  arr.add(new COSInteger(y));
  arr.add(new COSInteger(w));
  arr.add(new COSInteger(h));
  return arr;
}

function cosNum(arr: COSArray, idx: number): number {
  const el = arr.get(idx);
  if (!el) return 0;
  if ('getValue' in el) return (el as any).getValue();
  return 0;
}

function buildCheckboxAppearance(
  ctx: NativeDocumentContext,
  checked: boolean,
): COSObjectReference {
  const size = 12;
  const stream = new COSStream();
  stream.setItem('Type', new COSName('XObject'));
  stream.setItem('Subtype', new COSName('Form'));
  const bbox = new COSArray();
  bbox.setDirect(true);
  bbox.add(new COSInteger(0));
  bbox.add(new COSInteger(0));
  bbox.add(new COSInteger(size));
  bbox.add(new COSInteger(size));
  stream.setItem('BBox', bbox);

  const b = new ContentStreamBuilder();
  if (checked) {
    // Draw checkmark
    b.pushGraphicsState();
    b.setStrokeColor(rgb(0, 0, 0));
    b.setLineWidth(1.5);
    b.moveTo(2, 5);
    b.lineTo(5, 2);
    b.lineTo(10, 10);
    b.stroke();
    b.popGraphicsState();
  }
  // Empty for unchecked

  stream.setData(b.toBytes());
  return ctx.register(stream);
}

function ensureResourcesDict(
  pageDict: COSDictionary,
  ctx: NativeDocumentContext,
): COSDictionary {
  let resources = pageDict.getItem('Resources');
  if (resources instanceof COSObjectReference) {
    resources = ctx.resolveRef(resources);
    if (resources) pageDict.setItem('Resources', resources);
  }
  if (resources instanceof COSDictionary) return resources;
  const dict = new COSDictionary();
  dict.setDirect(true);
  pageDict.setItem('Resources', dict);
  return dict;
}

function removeRefFromArray(arr: COSArray, ref: COSObjectReference): void {
  for (let i = arr.size() - 1; i >= 0; i--) {
    const elem = arr.get(i);
    if (elem instanceof COSObjectReference && elem.equals(ref)) {
      arr.remove(i);
    }
  }
}

function appendContentStream(
  ctx: NativeDocumentContext,
  pageDict: COSDictionary,
  bytes: Uint8Array,
): void {
  const ref = ctx.createStream(bytes);
  let contents = pageDict.getItem('Contents');
  if (contents instanceof COSObjectReference) {
    const arr = new COSArray();
    arr.setDirect(true);
    arr.add(contents);
    pageDict.setItem('Contents', arr);
    contents = arr;
  }
  if (contents instanceof COSArray) {
    contents.add(ref);
  } else {
    const arr = new COSArray();
    arr.setDirect(true);
    arr.add(ref);
    pageDict.setItem('Contents', arr);
  }
}
