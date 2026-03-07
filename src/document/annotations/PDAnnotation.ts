/**
 * PDAnnotation — base annotation class wrapping COSDictionary.
 *
 * Uses composition (not inheritance) — matches PDFField/PDSignatureField patterns.
 * Each annotation subclass sets subtype-specific entries on the dict.
 */

import type { Color } from '../colors.js';
import type { NativeDocumentContext } from '../NativeDocumentContext.js';
import {
  COSName,
  COSString,
  COSFloat,
  COSInteger,
  COSArray,
  COSDictionary,
  COSObjectReference,
} from '../../pdfbox/cos/COSTypes.js';
import { ANNOTATION_FLAG_PRINT } from './types.js';

export interface AnnotationOptions {
  rect: [number, number, number, number];
  contents?: string;
  author?: string;
  modifiedDate?: Date;
  color?: Color;
  flags?: number;
  opacity?: number;
  borderWidth?: number;
  borderStyle?: 'S' | 'D' | 'B' | 'I' | 'U';
}

export class PDAnnotation {
  readonly _dict: COSDictionary;
  _ref?: COSObjectReference;

  constructor(subtype: string, options: AnnotationOptions) {
    this._dict = new COSDictionary();
    this._dict.setItem('Type', new COSName('Annot'));
    this._dict.setItem('Subtype', new COSName(subtype));

    // /Rect [llx lly urx ury]
    const rectArr = new COSArray();
    rectArr.setDirect(true);
    for (const v of options.rect) {
      rectArr.add(Number.isInteger(v) ? new COSInteger(v) : new COSFloat(v));
    }
    this._dict.setItem('Rect', rectArr);

    // /Contents
    if (options.contents !== undefined) {
      this._dict.setItem('Contents', new COSString(options.contents));
    }

    // /T (author)
    if (options.author !== undefined) {
      this._dict.setItem('T', new COSString(options.author));
    }

    // /M (modified date)
    if (options.modifiedDate !== undefined) {
      this._dict.setItem('M', new COSString(formatAnnotDate(options.modifiedDate)));
    }

    // /C (color) — array of 0, 1, 3, or 4 components
    if (options.color) {
      this._dict.setItem('C', colorToArray(options.color));
    }

    // /F (flags) — default PRINT
    const flags = options.flags ?? ANNOTATION_FLAG_PRINT;
    this._dict.setItem('F', new COSInteger(flags));

    // /CA (opacity)
    if (options.opacity !== undefined) {
      this._dict.setItem('CA', new COSFloat(options.opacity));
    }

    // /BS (border style)
    if (options.borderWidth !== undefined || options.borderStyle !== undefined) {
      const bs = new COSDictionary();
      bs.setDirect(true);
      bs.setItem('Type', new COSName('Border'));
      if (options.borderWidth !== undefined) {
        bs.setItem('W', Number.isInteger(options.borderWidth)
          ? new COSInteger(options.borderWidth) : new COSFloat(options.borderWidth));
      }
      if (options.borderStyle !== undefined) {
        bs.setItem('S', new COSName(options.borderStyle));
      }
      this._dict.setItem('BS', bs);
    }
  }

  getCOSObject(): COSDictionary {
    return this._dict;
  }

  generateAppearance(_ctx: NativeDocumentContext): void {
    // Override in subclasses — no-op by default
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAnnotDate(date: Date): string {
  const y = date.getUTCFullYear().toString();
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = date.getUTCDate().toString().padStart(2, '0');
  const h = date.getUTCHours().toString().padStart(2, '0');
  const min = date.getUTCMinutes().toString().padStart(2, '0');
  const s = date.getUTCSeconds().toString().padStart(2, '0');
  return `D:${y}${m}${d}${h}${min}${s}Z`;
}

/** Convert a Color to a COS array of components. */
export function colorToArray(color: Color): COSArray {
  const arr = new COSArray();
  arr.setDirect(true);
  if ('red' in color) {
    arr.add(new COSFloat(color.red));
    arr.add(new COSFloat(color.green));
    arr.add(new COSFloat(color.blue));
  } else if ('cyan' in color) {
    arr.add(new COSFloat(color.cyan));
    arr.add(new COSFloat(color.magenta));
    arr.add(new COSFloat(color.yellow));
    arr.add(new COSFloat(color.key));
  } else if ('gray' in color) {
    arr.add(new COSFloat(color.gray));
  }
  return arr;
}
