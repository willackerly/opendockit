/**
 * PDAnnotationLine — /Subtype /Line annotation.
 */

import { PDAnnotation, colorToArray } from './PDAnnotation.js';
import type { AnnotationOptions } from './PDAnnotation.js';
import type { NativeDocumentContext } from '../NativeDocumentContext.js';
import type { Color } from '../colors.js';
import type { LineEndingStyle } from './types.js';
import { COSArray, COSFloat, COSName } from '../../pdfbox/cos/COSTypes.js';
import { generateLineAppearance } from './AppearanceGenerator.js';

export interface LineOptions extends AnnotationOptions {
  line: [number, number, number, number]; // [x1, y1, x2, y2]
  lineEndingStyles?: [LineEndingStyle, LineEndingStyle];
  interiorColor?: Color;
}

export class PDAnnotationLine extends PDAnnotation {
  constructor(options: LineOptions) {
    super('Line', options);

    // /L [x1 y1 x2 y2]
    const lineArr = new COSArray();
    lineArr.setDirect(true);
    for (const v of options.line) lineArr.add(new COSFloat(v));
    this._dict.setItem('L', lineArr);

    // /LE [start end]
    if (options.lineEndingStyles) {
      const leArr = new COSArray();
      leArr.setDirect(true);
      leArr.add(new COSName(options.lineEndingStyles[0]));
      leArr.add(new COSName(options.lineEndingStyles[1]));
      this._dict.setItem('LE', leArr);
    }

    // /IC (interior color)
    if (options.interiorColor) {
      this._dict.setItem('IC', colorToArray(options.interiorColor));
    }
  }

  override generateAppearance(ctx: NativeDocumentContext): void {
    generateLineAppearance(ctx, this._dict);
  }
}
