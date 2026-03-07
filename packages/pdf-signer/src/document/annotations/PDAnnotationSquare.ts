/**
 * PDAnnotationSquare — /Subtype /Square annotation.
 */

import { PDAnnotation, colorToArray } from './PDAnnotation.js';
import type { AnnotationOptions } from './PDAnnotation.js';
import type { NativeDocumentContext } from '../NativeDocumentContext.js';
import type { Color } from '../colors.js';
import { generateSquareAppearance } from './AppearanceGenerator.js';

export interface SquareAnnotationOptions extends AnnotationOptions {
  interiorColor?: Color;
}

export class PDAnnotationSquare extends PDAnnotation {
  constructor(options: SquareAnnotationOptions) {
    super('Square', options);

    if (options.interiorColor) {
      this._dict.setItem('IC', colorToArray(options.interiorColor));
    }
  }

  override generateAppearance(ctx: NativeDocumentContext): void {
    generateSquareAppearance(ctx, this._dict);
  }
}
