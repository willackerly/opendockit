/**
 * PDAnnotationUnderline — /Subtype /Underline text markup annotation.
 */

import { PDAnnotation } from './PDAnnotation.js';
import type { AnnotationOptions } from './PDAnnotation.js';
import type { NativeDocumentContext } from '../NativeDocumentContext.js';
import { COSArray, COSFloat } from '../../pdfbox/cos/COSTypes.js';
import { generateUnderlineAppearance } from './AppearanceGenerator.js';

export interface UnderlineOptions extends AnnotationOptions {
  quadPoints?: number[];
}

export class PDAnnotationUnderline extends PDAnnotation {
  constructor(options: UnderlineOptions) {
    super('Underline', options);

    if (options.quadPoints) {
      this._dict.setItem('QuadPoints', floatArray(options.quadPoints));
    } else {
      this._dict.setItem('QuadPoints', rectToQuadPoints(options.rect));
    }
  }

  override generateAppearance(ctx: NativeDocumentContext): void {
    generateUnderlineAppearance(ctx, this._dict);
  }
}

function floatArray(values: number[]): COSArray {
  const arr = new COSArray();
  arr.setDirect(true);
  for (const v of values) arr.add(new COSFloat(v));
  return arr;
}

function rectToQuadPoints(rect: [number, number, number, number]): COSArray {
  const [llx, lly, urx, ury] = rect;
  return floatArray([llx, ury, urx, ury, llx, lly, urx, lly]);
}
