/**
 * PDAnnotationInk — /Subtype /Ink annotation.
 */

import { PDAnnotation } from './PDAnnotation.js';
import type { AnnotationOptions } from './PDAnnotation.js';
import type { NativeDocumentContext } from '../NativeDocumentContext.js';
import { COSArray, COSFloat } from '../../pdfbox/cos/COSTypes.js';
import { generateInkAppearance } from './AppearanceGenerator.js';

export interface InkOptions extends AnnotationOptions {
  inkList: number[][]; // Array of paths, each path is [x1, y1, x2, y2, ...]
}

export class PDAnnotationInk extends PDAnnotation {
  constructor(options: InkOptions) {
    super('Ink', options);

    // /InkList — array of arrays
    const inkListArr = new COSArray();
    inkListArr.setDirect(true);
    for (const path of options.inkList) {
      const pathArr = new COSArray();
      pathArr.setDirect(true);
      for (const v of path) pathArr.add(new COSFloat(v));
      inkListArr.add(pathArr);
    }
    this._dict.setItem('InkList', inkListArr);
  }

  override generateAppearance(ctx: NativeDocumentContext): void {
    generateInkAppearance(ctx, this._dict);
  }
}
