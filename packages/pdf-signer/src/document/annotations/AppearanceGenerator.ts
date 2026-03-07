/**
 * AppearanceGenerator — creates /AP /N appearance streams for annotations.
 *
 * Uses ContentStreamBuilder + NativeDocumentContext following the same
 * pattern as pdfbox-signer.ts:584-624 (proven to work in Adobe Reader).
 *
 * Critical: Resources on Form XObjects MUST be indirect objects (MEMORY.md).
 */

import type { NativeDocumentContext } from '../NativeDocumentContext.js';
import { ContentStreamBuilder } from '../content-stream/ContentStreamBuilder.js';
import type { Color } from '../colors.js';
import { rgb } from '../colors.js';
import {
  COSName,
  COSInteger,
  COSFloat,
  COSArray,
  COSDictionary,
  COSStream,
  COSObjectReference,
} from '../../pdfbox/cos/COSTypes.js';

// ---------------------------------------------------------------------------
// Core: create appearance stream XObject and wire into /AP /N
// ---------------------------------------------------------------------------

/**
 * Create a Form XObject appearance stream and set it as the annotation's
 * normal appearance (/AP /N).
 *
 * Returns the stream reference for testing/inspection.
 */
export function setNormalAppearance(
  ctx: NativeDocumentContext,
  annotDict: COSDictionary,
  bbox: [number, number, number, number],
  contentStreamBytes: Uint8Array,
  resources?: COSDictionary,
): COSObjectReference {
  // Build the Form XObject stream
  const stream = new COSStream();
  stream.setItem('Type', new COSName('XObject'));
  stream.setItem('Subtype', new COSName('Form'));

  const bboxArr = new COSArray();
  bboxArr.setDirect(true);
  for (const v of bbox) {
    bboxArr.add(Number.isInteger(v) ? new COSInteger(v) : new COSFloat(v));
  }
  stream.setItem('BBox', bboxArr);

  // Resources MUST be indirect (Adobe Reader requirement)
  if (resources) {
    const resRef = ctx.register(resources);
    stream.setItem('Resources', resRef);
  }

  stream.setData(contentStreamBytes);
  const streamRef = ctx.register(stream);

  // Set /AP /N on the annotation
  let apDict = annotDict.getItem('AP');
  if (!(apDict instanceof COSDictionary)) {
    apDict = new COSDictionary();
    (apDict as COSDictionary).setDirect(true);
    annotDict.setItem('AP', apDict);
  }
  (apDict as COSDictionary).setItem('N', streamRef);

  return streamRef;
}

// ---------------------------------------------------------------------------
// Per-annotation-type appearance generators
// ---------------------------------------------------------------------------

/** Generate highlight appearance: transparent yellow rectangle over QuadPoints. */
export function generateHighlightAppearance(
  ctx: NativeDocumentContext,
  annotDict: COSDictionary,
): void {
  const rect = getRect(annotDict);
  if (!rect) return;
  const color = getColor(annotDict) ?? rgb(1, 1, 0);
  const [llx, lly, urx, ury] = rect;
  const w = urx - llx;
  const h = ury - lly;

  const b = new ContentStreamBuilder();
  b.pushGraphicsState();
  // Multiply blend mode for highlight effect
  b.raw('/Multiply gs');
  b.setFillColor(color);
  b.rectangle(0, 0, w, h);
  b.fill();
  b.popGraphicsState();

  // Resources with ExtGState for Multiply blend
  const gsDict = new COSDictionary();
  gsDict.setItem('Type', new COSName('ExtGState'));
  gsDict.setItem('BM', new COSName('Multiply'));
  const gsRef = ctx.register(gsDict);

  const extGState = new COSDictionary();
  extGState.setDirect(true);
  extGState.setItem('Multiply', gsRef);

  const resources = new COSDictionary();
  resources.setItem('ExtGState', extGState);

  setNormalAppearance(ctx, annotDict, [0, 0, w, h], b.toBytes(), resources);
}

/** Generate underline appearance: thin line below text baseline. */
export function generateUnderlineAppearance(
  ctx: NativeDocumentContext,
  annotDict: COSDictionary,
): void {
  const rect = getRect(annotDict);
  if (!rect) return;
  const color = getColor(annotDict) ?? rgb(0, 0, 0);
  const [llx, lly, urx, ury] = rect;
  const w = urx - llx;
  const h = ury - lly;

  const b = new ContentStreamBuilder();
  b.pushGraphicsState();
  b.setStrokeColor(color);
  b.setLineWidth(1);
  b.moveTo(0, 1);
  b.lineTo(w, 1);
  b.stroke();
  b.popGraphicsState();

  setNormalAppearance(ctx, annotDict, [0, 0, w, h], b.toBytes());
}

/** Generate strikeout appearance: line through text midline. */
export function generateStrikeoutAppearance(
  ctx: NativeDocumentContext,
  annotDict: COSDictionary,
): void {
  const rect = getRect(annotDict);
  if (!rect) return;
  const color = getColor(annotDict) ?? rgb(0, 0, 0);
  const [llx, lly, urx, ury] = rect;
  const w = urx - llx;
  const h = ury - lly;
  const midY = h / 2;

  const b = new ContentStreamBuilder();
  b.pushGraphicsState();
  b.setStrokeColor(color);
  b.setLineWidth(1);
  b.moveTo(0, midY);
  b.lineTo(w, midY);
  b.stroke();
  b.popGraphicsState();

  setNormalAppearance(ctx, annotDict, [0, 0, w, h], b.toBytes());
}

/** Generate squiggly appearance: wavy line below baseline. */
export function generateSquigglyAppearance(
  ctx: NativeDocumentContext,
  annotDict: COSDictionary,
): void {
  const rect = getRect(annotDict);
  if (!rect) return;
  const color = getColor(annotDict) ?? rgb(0, 0, 0);
  const [llx, lly, urx, ury] = rect;
  const w = urx - llx;
  const h = ury - lly;

  const b = new ContentStreamBuilder();
  b.pushGraphicsState();
  b.setStrokeColor(color);
  b.setLineWidth(0.7);
  // Draw squiggly wave using small segments
  const amplitude = 1.5;
  const wavelength = 4;
  b.moveTo(0, 1);
  for (let x = 0; x < w; x += wavelength) {
    const cp1x = x + wavelength / 4;
    const cp1y = 1 + amplitude;
    const cp2x = x + wavelength / 2;
    const cp2y = 1 + amplitude;
    const endx = Math.min(x + wavelength / 2, w);
    const endy = 1;
    b.appendBezierCurve(cp1x, cp1y, cp2x, cp2y, endx, endy);
    if (endx < w) {
      const cp3x = endx + wavelength / 4;
      const cp3y = 1 - amplitude;
      const cp4x = endx + wavelength / 2;
      const cp4y = 1 - amplitude;
      const end2x = Math.min(endx + wavelength / 2, w);
      const end2y = 1;
      b.appendBezierCurve(cp3x, cp3y, cp4x, cp4y, end2x, end2y);
    }
  }
  b.stroke();
  b.popGraphicsState();

  setNormalAppearance(ctx, annotDict, [0, 0, w, h], b.toBytes());
}

/** Generate text (sticky note) appearance: small icon shape. */
export function generateTextAppearance(
  ctx: NativeDocumentContext,
  annotDict: COSDictionary,
): void {
  const color = getColor(annotDict) ?? rgb(1, 1, 0);
  const size = 24;

  const b = new ContentStreamBuilder();
  b.pushGraphicsState();
  b.setFillColor(color);
  b.setStrokeColor(rgb(0, 0, 0));
  b.setLineWidth(0.5);
  // Draw a simple speech bubble icon
  b.rectangle(1, 1, size - 2, size - 6);
  b.fillAndStroke();
  // Fold triangle at bottom-right
  b.moveTo(size - 8, 1);
  b.lineTo(size - 2, 1);
  b.lineTo(size - 2, 7);
  b.closePath();
  b.setFillColor(rgb(1, 1, 1));
  b.fill();
  b.popGraphicsState();

  setNormalAppearance(ctx, annotDict, [0, 0, size, size], b.toBytes());
}

/** Generate FreeText appearance: bordered rectangle with text. */
export function generateFreeTextAppearance(
  ctx: NativeDocumentContext,
  annotDict: COSDictionary,
): void {
  const rect = getRect(annotDict);
  if (!rect) return;
  const [llx, lly, urx, ury] = rect;
  const w = urx - llx;
  const h = ury - lly;

  // Parse /DA for font info
  const daStr = annotDict.getString('DA') ?? '/Helv 12 Tf 0 g';
  const fontMatch = daStr.match(/\/(\S+)\s+([\d.]+)\s+Tf/);
  const fontSize = fontMatch ? parseFloat(fontMatch[2]) : 12;

  const contents = annotDict.getString('Contents') ?? '';

  // Embed Helvetica as standard font for the appearance
  const fontRef = ctx.embedStandardFont('Helvetica');
  const fontKey = 'F1';

  const b = new ContentStreamBuilder();
  b.pushGraphicsState();
  // Border
  b.setStrokeColor(rgb(0, 0, 0));
  b.setLineWidth(1);
  b.rectangle(0.5, 0.5, w - 1, h - 1);
  b.stroke();
  // Text
  b.beginText();
  b.setFontAndSize(fontKey, fontSize);
  b.setFillingGrayscaleColor(0);
  b.moveText(2, h - fontSize - 2);
  // Simple hex encode for WinAnsi
  const hex = simpleWinAnsiHex(contents);
  b.showText(hex);
  b.endText();
  b.popGraphicsState();

  // Resources with font
  const fontDict = new COSDictionary();
  fontDict.setDirect(true);
  fontDict.setItem(fontKey, fontRef);
  const resources = new COSDictionary();
  resources.setItem('Font', fontDict);

  setNormalAppearance(ctx, annotDict, [0, 0, w, h], b.toBytes(), resources);
}

/** Generate stamp appearance: rotated colored text. */
export function generateStampAppearance(
  ctx: NativeDocumentContext,
  annotDict: COSDictionary,
): void {
  const rect = getRect(annotDict);
  if (!rect) return;
  const color = getColor(annotDict) ?? rgb(1, 0, 0);
  const [llx, lly, urx, ury] = rect;
  const w = urx - llx;
  const h = ury - lly;

  const nameEntry = annotDict.getCOSName('Name');
  const stampText = nameEntry?.getName() ?? 'Draft';

  const fontRef = ctx.embedStandardFont('Helvetica-Bold');
  const fontKey = 'F1';
  const fontSize = Math.min(w / (stampText.length * 0.6), h * 0.6);

  const b = new ContentStreamBuilder();
  b.pushGraphicsState();
  // Border rectangle
  b.setStrokeColor(color);
  b.setLineWidth(3);
  b.rectangle(2, 2, w - 4, h - 4);
  b.stroke();
  // Stamp text centered
  b.beginText();
  b.setFontAndSize(fontKey, fontSize);
  b.setFillColor(color);
  const textWidth = stampText.length * fontSize * 0.6;
  const tx = (w - textWidth) / 2;
  const ty = (h - fontSize) / 2;
  b.moveText(tx, ty);
  b.showText(simpleWinAnsiHex(stampText));
  b.endText();
  b.popGraphicsState();

  const fontDict = new COSDictionary();
  fontDict.setDirect(true);
  fontDict.setItem(fontKey, fontRef);
  const resources = new COSDictionary();
  resources.setItem('Font', fontDict);

  setNormalAppearance(ctx, annotDict, [0, 0, w, h], b.toBytes(), resources);
}

/** Generate line appearance. */
export function generateLineAppearance(
  ctx: NativeDocumentContext,
  annotDict: COSDictionary,
): void {
  const rect = getRect(annotDict);
  if (!rect) return;
  const color = getColor(annotDict) ?? rgb(0, 0, 0);
  const [llx, lly, urx, ury] = rect;
  const w = urx - llx;
  const h = ury - lly;

  // Get /L [x1 y1 x2 y2]
  const lineArr = annotDict.getItem('L') as COSArray | undefined;
  let x1 = 0, y1 = 0, x2 = w, y2 = h;
  if (lineArr instanceof COSArray && lineArr.size() >= 4) {
    x1 = cosNum(lineArr, 0) - llx;
    y1 = cosNum(lineArr, 1) - lly;
    x2 = cosNum(lineArr, 2) - llx;
    y2 = cosNum(lineArr, 3) - lly;
  }

  const borderWidth = getBorderWidth(annotDict);

  const b = new ContentStreamBuilder();
  b.pushGraphicsState();
  b.setStrokeColor(color);
  b.setLineWidth(borderWidth);
  b.moveTo(x1, y1);
  b.lineTo(x2, y2);
  b.stroke();
  b.popGraphicsState();

  setNormalAppearance(ctx, annotDict, [0, 0, w, h], b.toBytes());
}

/** Generate square appearance: rectangle with border + optional fill. */
export function generateSquareAppearance(
  ctx: NativeDocumentContext,
  annotDict: COSDictionary,
): void {
  const rect = getRect(annotDict);
  if (!rect) return;
  const color = getColor(annotDict) ?? rgb(0, 0, 0);
  const [llx, lly, urx, ury] = rect;
  const w = urx - llx;
  const h = ury - lly;
  const borderWidth = getBorderWidth(annotDict);
  const ic = getInteriorColor(annotDict);
  const half = borderWidth / 2;

  const b = new ContentStreamBuilder();
  b.pushGraphicsState();
  b.setStrokeColor(color);
  b.setLineWidth(borderWidth);
  if (ic) b.setFillColor(ic);
  b.rectangle(half, half, w - borderWidth, h - borderWidth);
  if (ic) {
    b.fillAndStroke();
  } else {
    b.stroke();
  }
  b.popGraphicsState();

  setNormalAppearance(ctx, annotDict, [0, 0, w, h], b.toBytes());
}

/** Generate circle appearance: ellipse with border + optional fill. */
export function generateCircleAppearance(
  ctx: NativeDocumentContext,
  annotDict: COSDictionary,
): void {
  const rect = getRect(annotDict);
  if (!rect) return;
  const color = getColor(annotDict) ?? rgb(0, 0, 0);
  const [llx, lly, urx, ury] = rect;
  const w = urx - llx;
  const h = ury - lly;
  const borderWidth = getBorderWidth(annotDict);
  const ic = getInteriorColor(annotDict);
  const cx = w / 2;
  const cy = h / 2;
  const rx = (w - borderWidth) / 2;
  const ry = (h - borderWidth) / 2;

  const KAPPA = 4 * ((Math.sqrt(2) - 1) / 3);

  const b = new ContentStreamBuilder();
  b.pushGraphicsState();
  b.setStrokeColor(color);
  b.setLineWidth(borderWidth);
  if (ic) b.setFillColor(ic);

  // Translate to center
  b.translate(cx, cy);
  // Draw ellipse with 4 Bezier curves
  b.moveTo(0, -ry);
  b.appendBezierCurve(KAPPA * rx, -ry, rx, -KAPPA * ry, rx, 0);
  b.appendBezierCurve(rx, KAPPA * ry, KAPPA * rx, ry, 0, ry);
  b.appendBezierCurve(-KAPPA * rx, ry, -rx, KAPPA * ry, -rx, 0);
  b.appendBezierCurve(-rx, -KAPPA * ry, -KAPPA * rx, -ry, 0, -ry);

  if (ic) {
    b.fillAndStroke();
  } else {
    b.stroke();
  }
  b.popGraphicsState();

  setNormalAppearance(ctx, annotDict, [0, 0, w, h], b.toBytes());
}

/** Generate ink appearance: Bezier curves from InkList paths. */
export function generateInkAppearance(
  ctx: NativeDocumentContext,
  annotDict: COSDictionary,
): void {
  const rect = getRect(annotDict);
  if (!rect) return;
  const color = getColor(annotDict) ?? rgb(0, 0, 0);
  const [llx, lly, urx, ury] = rect;
  const w = urx - llx;
  const h = ury - lly;
  const borderWidth = getBorderWidth(annotDict);

  const inkList = annotDict.getItem('InkList');
  if (!(inkList instanceof COSArray)) return;

  const b = new ContentStreamBuilder();
  b.pushGraphicsState();
  b.setStrokeColor(color);
  b.setLineWidth(borderWidth);
  b.setLineCap(1); // Round cap
  b.setLineJoin(1); // Round join

  for (let i = 0; i < inkList.size(); i++) {
    const path = inkList.get(i);
    if (!(path instanceof COSArray) || path.size() < 2) continue;

    const x0 = cosNum(path, 0) - llx;
    const y0 = cosNum(path, 1) - lly;
    b.moveTo(x0, y0);

    for (let j = 2; j < path.size(); j += 2) {
      const px = cosNum(path, j) - llx;
      const py = cosNum(path, j + 1) - lly;
      b.lineTo(px, py);
    }
  }
  b.stroke();
  b.popGraphicsState();

  setNormalAppearance(ctx, annotDict, [0, 0, w, h], b.toBytes());
}

/** Generate redact appearance: red outline rectangle (indicates pending redaction). */
export function generateRedactAppearance(
  ctx: NativeDocumentContext,
  annotDict: COSDictionary,
): void {
  const rect = getRect(annotDict);
  if (!rect) return;
  const color = getColor(annotDict) ?? rgb(1, 0, 0);
  const [llx, lly, urx, ury] = rect;
  const w = urx - llx;
  const h = ury - lly;

  const b = new ContentStreamBuilder();
  b.pushGraphicsState();
  // Light red fill to indicate pending redaction area
  b.setFillingRgbColor(1, 0.85, 0.85);
  b.rectangle(1, 1, w - 2, h - 2);
  b.fill();
  // Red dashed outline
  b.setStrokeColor(color);
  b.setLineWidth(1.5);
  b.setDashPattern([4, 2], 0);
  b.rectangle(0.5, 0.5, w - 1, h - 1);
  b.stroke();
  b.popGraphicsState();

  setNormalAppearance(ctx, annotDict, [0, 0, w, h], b.toBytes());
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRect(dict: COSDictionary): [number, number, number, number] | undefined {
  const rectEntry = dict.getItem('Rect');
  if (!(rectEntry instanceof COSArray) || rectEntry.size() < 4) return undefined;
  return [
    cosNum(rectEntry, 0),
    cosNum(rectEntry, 1),
    cosNum(rectEntry, 2),
    cosNum(rectEntry, 3),
  ];
}

function cosNum(arr: COSArray, idx: number): number {
  const el = arr.get(idx);
  if (!el) return 0;
  if ('getValue' in el) return (el as any).getValue();
  return 0;
}

function getColor(dict: COSDictionary): Color | undefined {
  const cArr = dict.getItem('C');
  if (!(cArr instanceof COSArray)) return undefined;
  if (cArr.size() === 3) {
    return rgb(cosNum(cArr, 0), cosNum(cArr, 1), cosNum(cArr, 2));
  }
  if (cArr.size() === 1) {
    const g = cosNum(cArr, 0);
    return { type: 0 as any, gray: g } as any;
  }
  return undefined;
}

function getInteriorColor(dict: COSDictionary): Color | undefined {
  const icArr = dict.getItem('IC');
  if (!(icArr instanceof COSArray)) return undefined;
  if (icArr.size() === 3) {
    return rgb(cosNum(icArr, 0), cosNum(icArr, 1), cosNum(icArr, 2));
  }
  return undefined;
}

function getBorderWidth(dict: COSDictionary): number {
  const bs = dict.getItem('BS');
  if (bs instanceof COSDictionary) {
    const wEntry = bs.getItem('W');
    if (wEntry && 'getValue' in wEntry) return (wEntry as any).getValue();
  }
  return 1;
}

/** Simple WinAnsi hex encoding for standard ASCII text. */
function simpleWinAnsiHex(text: string): string {
  let hex = '';
  for (let i = 0; i < text.length; i++) {
    hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(2, '0');
  }
  return hex;
}
