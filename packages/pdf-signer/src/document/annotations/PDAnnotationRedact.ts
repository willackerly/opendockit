/**
 * PDAnnotationRedact — /Subtype /Redact annotation.
 *
 * Marks an area of the page for redaction. When applied (burned in),
 * the content underneath is permanently removed from the content stream
 * and replaced with a filled rectangle in the interior color.
 *
 * PDF 2.0 spec (ISO 32000-2:2020), section 12.5.6.23.
 * Widely supported by viewers even in PDF 1.7 documents.
 */

import { PDAnnotation, colorToArray } from './PDAnnotation.js';
import type { AnnotationOptions } from './PDAnnotation.js';
import type { NativeDocumentContext } from '../NativeDocumentContext.js';
import type { Color } from '../colors.js';
import { rgb } from '../colors.js';
import {
  COSArray,
  COSFloat,
  COSInteger,
  COSString,
} from '../../pdfbox/cos/COSTypes.js';
import { generateRedactAppearance } from './AppearanceGenerator.js';

export interface RedactAnnotationOptions extends AnnotationOptions {
  /** QuadPoints defining the precise redaction region (same format as Highlight). */
  quadPoints?: number[];
  /** Interior color — fill color shown after redaction is applied. Default: black. */
  interiorColor?: Color;
  /** Optional text to display over the redacted area (e.g., "[REDACTED]"). */
  overlayText?: string;
  /** Default appearance string for overlay text. */
  defaultAppearance?: string;
  /** Text justification: 0=left, 1=center, 2=right. */
  justification?: 0 | 1 | 2;
}

export class PDAnnotationRedact extends PDAnnotation {
  constructor(options: RedactAnnotationOptions) {
    // Default border color is red (indicates pending redaction)
    const opts = { color: rgb(1, 0, 0) as Color, ...options };
    super('Redact', opts);

    // /QuadPoints — if provided, use explicit; otherwise derive from rect
    if (options.quadPoints) {
      this._dict.setItem('QuadPoints', floatArray(options.quadPoints));
    } else {
      this._dict.setItem('QuadPoints', rectToQuadPoints(options.rect));
    }

    // /IC — interior color (fill after redaction; default black)
    const ic = options.interiorColor ?? rgb(0, 0, 0);
    this._dict.setItem('IC', colorToArray(ic));

    // /OverlayText — optional text to show in the redacted area
    if (options.overlayText !== undefined) {
      this._dict.setItem('OverlayText', new COSString(options.overlayText));
    }

    // /DA — default appearance for overlay text
    if (options.defaultAppearance !== undefined) {
      this._dict.setItem('DA', new COSString(options.defaultAppearance));
    }

    // /Q — text justification
    if (options.justification !== undefined) {
      this._dict.setItem('Q', new COSInteger(options.justification));
    }
  }

  override generateAppearance(ctx: NativeDocumentContext): void {
    generateRedactAppearance(ctx, this._dict);
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
