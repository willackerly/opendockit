/**
 * PDFTextField — native COS form field.
 *
 * getText() reads /V from COS dict, setText() writes /V and sets /NeedAppearances.
 */

import { PDFField } from './PDFField.js';
import type { PDFFont } from '../PDFFont.js';
import type { PDFImage } from '../PDFImage.js';
import type { PDFPage } from '../PDFPage.js';
import type { FieldAppearanceOptions, TextAlignment } from '../options.js';
import type { NativeFieldInfo } from '../NativeFormReader.js';
import type { NativeDocumentContext } from '../NativeDocumentContext.js';
import { COSString, COSInteger, COSArray } from '../../pdfbox/cos/COSTypes.js';
import { FF_MULTILINE } from '../NativeFormReader.js';
import { setNeedAppearances } from '../NativeFormReader.js';
import { generateTextFieldAppearance } from './FieldAppearanceGenerator.js';

export class PDFTextField extends PDFField {
  /** @internal */ private readonly _nativeCtx?: NativeDocumentContext;

  /** @internal */
  constructor(info: NativeFieldInfo, ctx: NativeDocumentContext) {
    super(info);
    this._nativeCtx = ctx;
  }

  /** @internal */
  static _createNative(info: NativeFieldInfo, ctx: NativeDocumentContext): PDFTextField {
    return new PDFTextField(info, ctx);
  }

  getText(): string | undefined {
    return this._native!.value;
  }

  setText(text: string | undefined): void {
    if (text === undefined) {
      this._native!.dict.removeItem('V');
    } else {
      this._native!.dict.setItem('V', new COSString(text));
    }
    // Update cached value
    this._native!.value = text;
    // Generate appearance stream so field renders without /NeedAppearances
    try {
      generateTextFieldAppearance(this._nativeCtx!, this._native!.dict, text ?? '');
    } catch {
      // Fallback: set /NeedAppearances if appearance generation fails
      setNeedAppearances(this._nativeCtx!);
    }
  }

  getAlignment(): TextAlignment {
    const q = this._native!.dict.getInt('Q', 0);
    return q as TextAlignment;
  }

  setAlignment(alignment: TextAlignment): void {
    this._native!.dict.setItem('Q', new COSInteger(alignment as number));
  }

  getMaxLength(): number | undefined {
    const maxLen = this._native!.dict.getItem('MaxLen');
    if (maxLen instanceof COSInteger) return maxLen.getValue();
    return undefined;
  }

  setMaxLength(maxLength?: number): void {
    if (maxLength === undefined) {
      this._native!.dict.removeItem('MaxLen');
    } else {
      this._native!.dict.setItem('MaxLen', new COSInteger(maxLength));
    }
  }

  removeMaxLength(): void {
    this._native!.dict.removeItem('MaxLen');
  }

  setImage(_image: PDFImage): void {
    throw new Error(
      'PDFTextField.setImage() is not yet implemented natively. ' +
      'This feature will be available in a future release.',
    );
  }

  setFontSize(fontSize: number): void {
    // Update DA string if possible
    const da = this._native!.dict.getString('DA') ?? '';
    const updated = da.replace(/\d+(\.\d+)?\s+Tf/, `${fontSize} Tf`);
    this._native!.dict.setItem('DA', new COSString(updated || `/Helv ${fontSize} Tf 0 g`));
  }

  isMultiline(): boolean {
    return (this._native!.flags & FF_MULTILINE) !== 0;
  }

  enableMultiline(): void {
    this._native!.flags |= FF_MULTILINE;
    this._native!.dict.setItem('Ff', new COSInteger(this._native!.flags));
  }

  disableMultiline(): void {
    this._native!.flags &= ~FF_MULTILINE;
    this._native!.dict.setItem('Ff', new COSInteger(this._native!.flags));
  }

  isPassword(): boolean {
    return (this._native!.flags & (1 << 13)) !== 0;
  }

  enablePassword(): void {
    this._native!.flags |= (1 << 13);
    this._native!.dict.setItem('Ff', new COSInteger(this._native!.flags));
  }

  disablePassword(): void {
    this._native!.flags &= ~(1 << 13);
    this._native!.dict.setItem('Ff', new COSInteger(this._native!.flags));
  }

  isFileSelector(): boolean {
    return false;
  }

  enableFileSelection(): void {
    // No-op
  }

  disableFileSelection(): void {
    // No-op
  }

  isSpellChecked(): boolean {
    return true; // Default is spell-checked
  }

  enableSpellChecking(): void {
    // No-op
  }

  disableSpellChecking(): void {
    // No-op
  }

  isScrollable(): boolean {
    return true; // Default is scrollable
  }

  enableScrolling(): void {
    // No-op
  }

  disableScrolling(): void {
    // No-op
  }

  isCombed(): boolean {
    return false;
  }

  enableCombing(): void {
    // No-op
  }

  disableCombing(): void {
    // No-op
  }

  isRichFormatted(): boolean {
    return false;
  }

  enableRichFormatting(): void {
    // No-op
  }

  disableRichFormatting(): void {
    // No-op
  }

  addToPage(page: PDFPage, _options?: FieldAppearanceOptions): void {
    if (this._native && page._nativePageDict) {
      addWidgetToPage(this._native, page);
      return;
    }
    throw new Error('PDFTextField.addToPage() requires native mode pages.');
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

function addWidgetToPage(info: NativeFieldInfo, page: PDFPage): void {
  const pageDict = page._nativePageDict!;
  let annots = pageDict.getItem('Annots');
  if (!(annots instanceof COSArray)) {
    annots = new COSArray();
    (annots as COSArray).setDirect(true);
    pageDict.setItem('Annots', annots);
  }
  (annots as COSArray).add(info.ref);
  if (page._nativePageRef) {
    info.dict.setItem('P', page._nativePageRef);
  }
}
