/**
 * PDFButton — native COS form field.
 */

import { PDFField } from './PDFField.js';
import type { PDFFont } from '../PDFFont.js';
import type { PDFImage } from '../PDFImage.js';
import type { PDFPage } from '../PDFPage.js';
import type { FieldAppearanceOptions, ImageAlignment } from '../options.js';
import type { NativeFieldInfo } from '../NativeFormReader.js';
import type { NativeDocumentContext } from '../NativeDocumentContext.js';
import { COSArray } from '../../pdfbox/cos/COSTypes.js';

export class PDFButton extends PDFField {
  /** @internal */
  constructor(info: NativeFieldInfo, _ctx: NativeDocumentContext) {
    super(info);
  }

  /** @internal */
  static _createNative(info: NativeFieldInfo, ctx: NativeDocumentContext): PDFButton {
    return new PDFButton(info, ctx);
  }

  setImage(_image: PDFImage, _alignment?: ImageAlignment): void {
    // No-op for native
  }

  setFontSize(_fontSize: number): void {
    // No-op for native
  }

  addToPage(
    _text: string,
    page: PDFPage,
    _options?: FieldAppearanceOptions,
  ): void {
    if (this._native && page._nativePageDict) {
      let annots = page._nativePageDict.getItem('Annots');
      if (!(annots instanceof COSArray)) {
        annots = new COSArray();
        (annots as COSArray).setDirect(true);
        page._nativePageDict.setItem('Annots', annots);
      }
      (annots as COSArray).add(this._native.ref);
      if (page._nativePageRef) {
        this._native.dict.setItem('P', page._nativePageRef);
      }
      return;
    }
    throw new Error('PDFButton.addToPage() requires native mode pages.');
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
