/**
 * PDAnnotationLink — /Subtype /Link annotation.
 */

import { PDAnnotation } from './PDAnnotation.js';
import type { AnnotationOptions } from './PDAnnotation.js';
import { ANNOTATION_FLAG_PRINT } from './types.js';
import {
  COSName,
  COSString,
  COSDictionary,
  COSInteger,
} from '../../pdfbox/cos/COSTypes.js';

export interface LinkOptions extends AnnotationOptions {
  uri?: string;
  destination?: string;
}

export class PDAnnotationLink extends PDAnnotation {
  constructor(options: LinkOptions) {
    // Links default to PRINT flag but no visible border
    const opts = { flags: ANNOTATION_FLAG_PRINT, ...options };
    super('Link', opts);

    // /A (action dictionary for URI)
    if (options.uri) {
      const action = new COSDictionary();
      action.setDirect(true);
      action.setItem('S', new COSName('URI'));
      action.setItem('URI', new COSString(options.uri));
      this._dict.setItem('A', action);
    }

    // /Dest (named destination)
    if (options.destination) {
      this._dict.setItem('Dest', new COSString(options.destination));
    }

    // Default: no visible border
    if (!options.borderWidth) {
      const bs = new COSDictionary();
      bs.setDirect(true);
      bs.setItem('Type', new COSName('Border'));
      bs.setItem('W', new COSInteger(0));
      this._dict.setItem('BS', bs);
    }
  }
}
