/**
 * PDAnnotationHighlight — /Subtype /Highlight text markup annotation.
 */

import { PDAnnotation } from './PDAnnotation.js';
import type { AnnotationOptions } from './PDAnnotation.js';
import type { NativeDocumentContext } from '../NativeDocumentContext.js';
import type { Color } from '../colors.js';
import { rgb } from '../colors.js';
import { COSArray, COSFloat } from '../../pdfbox/cos/COSTypes.js';
import { generateHighlightAppearance } from './AppearanceGenerator.js';

export interface HighlightOptions extends AnnotationOptions {
  quadPoints?: number[];
}

export class PDAnnotationHighlight extends PDAnnotation {
  constructor(options: HighlightOptions) {
    // Default highlight color is yellow
    const opts = { color: rgb(1, 1, 0) as Color, ...options };
    super('Highlight', opts);

    if (options.quadPoints) {
      this._dict.setItem('QuadPoints', floatArray(options.quadPoints));
    } else {
      this._dict.setItem('QuadPoints', rectToQuadPoints(options.rect));
    }
  }

  override generateAppearance(ctx: NativeDocumentContext): void {
    generateHighlightAppearance(ctx, this._dict);
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
  // PDF spec order: upper-left, upper-right, lower-left, lower-right
  return floatArray([llx, ury, urx, ury, llx, lly, urx, lly]);
}
