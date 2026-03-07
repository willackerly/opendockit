/**
 * PDFCheckBox — native COS form field.
 */

import { PDFField } from './PDFField.js';
import type { PDFPage } from '../PDFPage.js';
import type { FieldAppearanceOptions } from '../options.js';
import type { NativeFieldInfo } from '../NativeFormReader.js';
import type { NativeDocumentContext } from '../NativeDocumentContext.js';
import { COSName, COSArray } from '../../pdfbox/cos/COSTypes.js';
import { generateCheckBoxAppearance } from './FieldAppearanceGenerator.js';

export class PDFCheckBox extends PDFField {
  /** @internal */ private readonly _nativeCtx?: NativeDocumentContext;

  /** @internal */
  constructor(info: NativeFieldInfo, ctx: NativeDocumentContext) {
    super(info);
    this._nativeCtx = ctx;
  }

  /** @internal */
  static _createNative(info: NativeFieldInfo, ctx: NativeDocumentContext): PDFCheckBox {
    return new PDFCheckBox(info, ctx);
  }

  check(): void {
    this._native!.dict.setItem('V', new COSName('Yes'));
    this._native!.dict.setItem('AS', new COSName('Yes'));
    this._native!.value = 'Yes';
    // Update appearance stream
    if (this._nativeCtx) {
      try {
        generateCheckBoxAppearance(this._nativeCtx, this._native!.dict, true);
      } catch { /* appearance already exists from creation */ }
    }
  }

  uncheck(): void {
    this._native!.dict.setItem('V', new COSName('Off'));
    this._native!.dict.setItem('AS', new COSName('Off'));
    this._native!.value = 'Off';
    // Update appearance stream
    if (this._nativeCtx) {
      try {
        generateCheckBoxAppearance(this._nativeCtx, this._native!.dict, false);
      } catch { /* appearance already exists from creation */ }
    }
  }

  isChecked(): boolean {
    return this._native!.value === 'Yes';
  }

  addToPage(page: PDFPage, _options?: FieldAppearanceOptions): void {
    if (this._native && page._nativePageDict) {
      addWidgetToPage(this._native, page);
      return;
    }
    throw new Error('PDFCheckBox.addToPage() requires native mode pages.');
  }

  needsAppearancesUpdate(): boolean {
    return false;
  }

  defaultUpdateAppearances(): void {
    // No-op for native
  }

  updateAppearances(_provider?: unknown): void {
    // No-op for native
  }
}

function addWidgetToPage(info: NativeFieldInfo, page: PDFPage): void {
  // Get or create /Annots on page
  let annots = page._nativePageDict!.getItem('Annots');
  if (!(annots instanceof COSArray)) {
    annots = new COSArray();
    (annots as COSArray).setDirect(true);
    page._nativePageDict!.setItem('Annots', annots);
  }
  (annots as COSArray).add(info.ref);
  // Set /P on widget
  if (page._nativePageRef) {
    info.dict.setItem('P', page._nativePageRef);
  }
}
