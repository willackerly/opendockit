/**
 * PDAnnotationRubberStamp — /Subtype /Stamp annotation.
 */

import { PDAnnotation } from './PDAnnotation.js';
import type { AnnotationOptions } from './PDAnnotation.js';
import type { NativeDocumentContext } from '../NativeDocumentContext.js';
import { StampName } from './types.js';
import { COSName } from '../../pdfbox/cos/COSTypes.js';
import { generateStampAppearance } from './AppearanceGenerator.js';

export interface StampOptions extends AnnotationOptions {
  stampName?: StampName | string;
}

export class PDAnnotationRubberStamp extends PDAnnotation {
  constructor(options: StampOptions) {
    super('Stamp', options);

    // /Name (stamp type) — default Draft
    const name = options.stampName ?? StampName.DRAFT;
    this._dict.setItem('Name', new COSName(name));
  }

  override generateAppearance(ctx: NativeDocumentContext): void {
    generateStampAppearance(ctx, this._dict);
  }
}
