/**
 * PDFOptionList — native COS form field.
 */

import { PDFField } from './PDFField.js';
import type { PDFFont } from '../PDFFont.js';
import type { PDFPage } from '../PDFPage.js';
import type { FieldAppearanceOptions } from '../options.js';
import type { NativeFieldInfo } from '../NativeFormReader.js';
import type { NativeDocumentContext } from '../NativeDocumentContext.js';
import { COSString, COSArray } from '../../pdfbox/cos/COSTypes.js';
import { setNeedAppearances } from '../NativeFormReader.js';

export class PDFOptionList extends PDFField {
  /** @internal */ private readonly _nativeCtx?: NativeDocumentContext;

  /** @internal */
  constructor(info: NativeFieldInfo, ctx: NativeDocumentContext) {
    super(info);
    this._nativeCtx = ctx;
  }

  /** @internal */
  static _createNative(info: NativeFieldInfo, ctx: NativeDocumentContext): PDFOptionList {
    return new PDFOptionList(info, ctx);
  }

  getOptions(): string[] {
    return getOptStrings(this._native!.dict);
  }

  getSelected(): string[] {
    return this._native!.value ? [this._native!.value] : [];
  }

  setOptions(options: string[]): void {
    const optArr = new COSArray();
    for (const opt of options) optArr.add(new COSString(opt));
    this._native!.dict.setItem('Opt', optArr);
    setNeedAppearances(this._nativeCtx!);
  }

  addOptions(options: string | string[]): void {
    const opts = Array.isArray(options) ? options : [options];
    let optArr = this._native!.dict.getItem('Opt');
    if (!(optArr instanceof COSArray)) {
      optArr = new COSArray();
      this._native!.dict.setItem('Opt', optArr);
    }
    for (const opt of opts) (optArr as COSArray).add(new COSString(opt));
    setNeedAppearances(this._nativeCtx!);
  }

  select(options: string | string[], _merge?: boolean): void {
    const val = Array.isArray(options) ? options[0] : options;
    this._native!.dict.setItem('V', new COSString(val));
    this._native!.value = val;
    setNeedAppearances(this._nativeCtx!);
  }

  clear(): void {
    this._native!.dict.removeItem('V');
    this._native!.value = undefined;
    setNeedAppearances(this._nativeCtx!);
  }

  setFontSize(_fontSize: number): void {
    // No-op for native
  }

  isSorted(): boolean {
    return false;
  }

  enableSorting(): void {
    // No-op
  }

  disableSorting(): void {
    // No-op
  }

  isMultiselect(): boolean {
    return false;
  }

  enableMultiselect(): void {
    // No-op
  }

  disableMultiselect(): void {
    // No-op
  }

  isSelectOnClick(): boolean {
    return false;
  }

  enableSelectOnClick(): void {
    // No-op
  }

  disableSelectOnClick(): void {
    // No-op
  }

  addToPage(page: PDFPage, _options?: FieldAppearanceOptions): void {
    if (this._native && page._nativePageDict) {
      addWidgetToPage(this._native, page);
      return;
    }
    throw new Error('PDFOptionList.addToPage() requires native mode pages.');
  }

  needsAppearancesUpdate(): boolean {
    return false;
  }

  defaultUpdateAppearances(_font: PDFFont): void {
    // No-op for native
  }

  updateAppearances(_font: PDFFont, _provider?: unknown): void {
    // No-op for native
  }
}

function getOptStrings(dict: import('../../pdfbox/cos/COSTypes.js').COSDictionary): string[] {
  const optEntry = dict.getItem('Opt');
  if (!(optEntry instanceof COSArray)) return [];
  const result: string[] = [];
  for (let i = 0; i < optEntry.size(); i++) {
    const item = optEntry.get(i);
    if (item instanceof COSString) result.push(item.getString());
  }
  return result;
}

function addWidgetToPage(info: NativeFieldInfo, page: PDFPage): void {
  let annots = page._nativePageDict!.getItem('Annots');
  if (!(annots instanceof COSArray)) {
    annots = new COSArray();
    (annots as COSArray).setDirect(true);
    page._nativePageDict!.setItem('Annots', annots);
  }
  (annots as COSArray).add(info.ref);
  if (page._nativePageRef) {
    info.dict.setItem('P', page._nativePageRef);
  }
}
