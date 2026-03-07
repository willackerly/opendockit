/**
 * PDAnnotationText — /Subtype /Text (sticky note) annotation.
 */

import { PDAnnotation } from './PDAnnotation.js';
import type { AnnotationOptions } from './PDAnnotation.js';
import type { NativeDocumentContext } from '../NativeDocumentContext.js';
import { TextIconName } from './types.js';
import { COSName, COSBoolean } from '../../pdfbox/cos/COSTypes.js';
import { generateTextAppearance } from './AppearanceGenerator.js';

export interface TextAnnotationOptions extends AnnotationOptions {
  iconName?: TextIconName | string;
  open?: boolean;
}

export class PDAnnotationText extends PDAnnotation {
  constructor(options: TextAnnotationOptions) {
    super('Text', options);

    // /Name (icon name) — default Comment
    const icon = options.iconName ?? TextIconName.COMMENT;
    this._dict.setItem('Name', new COSName(icon));

    // /Open
    if (options.open !== undefined) {
      this._dict.setItem('Open', options.open ? COSBoolean.TRUE : COSBoolean.FALSE);
    }
  }

  override generateAppearance(ctx: NativeDocumentContext): void {
    generateTextAppearance(ctx, this._dict);
  }
}
