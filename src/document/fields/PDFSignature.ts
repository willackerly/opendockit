/**
 * PDFSignature — native COS form field.
 */

import { PDFField } from './PDFField.js';
import type { NativeFieldInfo } from '../NativeFormReader.js';

export class PDFSignature extends PDFField {
  /** @internal */
  constructor(info: NativeFieldInfo) {
    super(info);
  }

  /** @internal */
  static _createNative(info: NativeFieldInfo): PDFSignature {
    return new PDFSignature(info);
  }

  needsAppearancesUpdate(): boolean {
    return false;
  }
}
