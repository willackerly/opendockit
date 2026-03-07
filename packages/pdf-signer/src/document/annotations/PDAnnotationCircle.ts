/**
 * PDAnnotationCircle — /Subtype /Circle annotation.
 */

import { PDAnnotation, colorToArray } from './PDAnnotation.js';
import type { AnnotationOptions } from './PDAnnotation.js';
import type { NativeDocumentContext } from '../NativeDocumentContext.js';
import type { Color } from '../colors.js';
import { generateCircleAppearance } from './AppearanceGenerator.js';

export interface CircleAnnotationOptions extends AnnotationOptions {
  interiorColor?: Color;
}

export class PDAnnotationCircle extends PDAnnotation {
  constructor(options: CircleAnnotationOptions) {
    super('Circle', options);

    if (options.interiorColor) {
      this._dict.setItem('IC', colorToArray(options.interiorColor));
    }
  }

  override generateAppearance(ctx: NativeDocumentContext): void {
    generateCircleAppearance(ctx, this._dict);
  }
}
