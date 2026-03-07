/**
 * PDAnnotationFreeText — /Subtype /FreeText annotation.
 */

import { PDAnnotation } from './PDAnnotation.js';
import type { AnnotationOptions } from './PDAnnotation.js';
import type { NativeDocumentContext } from '../NativeDocumentContext.js';
import { FreeTextAlignment } from './types.js';
import { COSString, COSInteger } from '../../pdfbox/cos/COSTypes.js';
import { generateFreeTextAppearance } from './AppearanceGenerator.js';

export interface FreeTextOptions extends AnnotationOptions {
  defaultAppearance?: string;
  alignment?: FreeTextAlignment;
  fontSize?: number;
  fontName?: string;
}

export class PDAnnotationFreeText extends PDAnnotation {
  constructor(options: FreeTextOptions) {
    super('FreeText', options);

    // /DA (default appearance string) — required for FreeText
    const fontSize = options.fontSize ?? 12;
    const fontName = options.fontName ?? 'Helv';
    const da = options.defaultAppearance ?? `/${fontName} ${fontSize} Tf 0 g`;
    this._dict.setItem('DA', new COSString(da));

    // /Q (alignment)
    if (options.alignment !== undefined) {
      this._dict.setItem('Q', new COSInteger(options.alignment));
    }
  }

  override generateAppearance(ctx: NativeDocumentContext): void {
    generateFreeTextAppearance(ctx, this._dict);
  }
}
