/**
 * PDFRadioGroup — native COS form field.
 */

import { PDFField } from './PDFField.js';
import type { PDFPage } from '../PDFPage.js';
import type { FieldAppearanceOptions } from '../options.js';
import type { NativeFieldInfo } from '../NativeFormReader.js';
import type { NativeDocumentContext } from '../NativeDocumentContext.js';
import {
  COSName,
  COSInteger,
  COSArray,
  COSDictionary,
  COSStream,
} from '../../pdfbox/cos/COSTypes.js';
import { ContentStreamBuilder } from '../content-stream/ContentStreamBuilder.js';
import { rgb } from '../colors.js';
import { setNeedAppearances } from '../NativeFormReader.js';

export class PDFRadioGroup extends PDFField {
  /** @internal */ private readonly _nativeCtx?: NativeDocumentContext;

  /** @internal */
  constructor(info: NativeFieldInfo, ctx: NativeDocumentContext) {
    super(info);
    this._nativeCtx = ctx;
  }

  /** @internal */
  static _createNative(info: NativeFieldInfo, ctx: NativeDocumentContext): PDFRadioGroup {
    return new PDFRadioGroup(info, ctx);
  }

  getOptions(): string[] {
    const kids = this._native!.dict.getItem('Kids');
    if (!(kids instanceof COSArray)) return [];
    const result: string[] = [];
    for (let i = 0; i < kids.size(); i++) {
      result.push(`option${i}`);
    }
    return result;
  }

  getSelected(): string | undefined {
    return this._native!.value === 'Off' ? undefined : this._native!.value;
  }

  select(option: string): void {
    this._native!.dict.setItem('V', new COSName(option));
    this._native!.value = option;
    setNeedAppearances(this._nativeCtx!);
  }

  clear(): void {
    this._native!.dict.setItem('V', new COSName('Off'));
    this._native!.value = 'Off';
    setNeedAppearances(this._nativeCtx!);
  }

  isOffToggleable(): boolean {
    return false;
  }

  enableOffToggling(): void {
    // No-op
  }

  disableOffToggling(): void {
    // No-op
  }

  isMutuallyExclusive(): boolean {
    return true;
  }

  enableMutualExclusion(): void {
    // No-op
  }

  disableMutualExclusion(): void {
    // No-op
  }

  addOptionToPage(
    option: string,
    page: PDFPage,
    _options?: FieldAppearanceOptions,
  ): void {
    if (this._native && this._nativeCtx && page._nativePageDict) {
      const ctx = this._nativeCtx;
      // Create a widget annotation for this radio option
      const widget = new COSDictionary();
      widget.setItem('Type', new COSName('Annot'));
      widget.setItem('Subtype', new COSName('Widget'));
      widget.setItem('Parent', this._native.ref);
      widget.setItem('Rect', makeRect(0, 0, 12, 12));
      widget.setItem('AS', new COSName('Off'));

      // Build /AP with /N containing /<option> and /Off
      const apDict = new COSDictionary();
      apDict.setDirect(true);
      const nDict = new COSDictionary();
      nDict.setDirect(true);
      nDict.setItem(option, buildRadioAppearance(ctx, true));
      nDict.setItem('Off', buildRadioAppearance(ctx, false));
      apDict.setItem('N', nDict);
      widget.setItem('AP', apDict);

      if (page._nativePageRef) {
        widget.setItem('P', page._nativePageRef);
      }

      const widgetRef = ctx.register(widget);

      // Add to /Kids
      let kids = this._native.dict.getItem('Kids');
      if (!(kids instanceof COSArray)) {
        kids = new COSArray();
        this._native.dict.setItem('Kids', kids);
      }
      (kids as COSArray).add(widgetRef);

      // Add to page /Annots
      let annots = page._nativePageDict.getItem('Annots');
      if (!(annots instanceof COSArray)) {
        annots = new COSArray();
        (annots as COSArray).setDirect(true);
        page._nativePageDict.setItem('Annots', annots);
      }
      (annots as COSArray).add(widgetRef);
      return;
    }
    throw new Error('PDFRadioGroup.addOptionToPage() requires native mode.');
  }

  needsAppearancesUpdate(): boolean {
    return false;
  }

  defaultUpdateAppearances(): void {
    // No-op for native
  }

  updateAppearances(_provider?: unknown): void {
    // No-op for native
  }
}

function makeRect(x: number, y: number, w: number, h: number): COSArray {
  const arr = new COSArray();
  arr.setDirect(true);
  arr.add(new COSInteger(x));
  arr.add(new COSInteger(y));
  arr.add(new COSInteger(w));
  arr.add(new COSInteger(h));
  return arr;
}

function buildRadioAppearance(ctx: NativeDocumentContext, selected: boolean): import('../../pdfbox/cos/COSTypes.js').COSObjectReference {
  const size = 12;
  const stream = new COSStream();
  stream.setItem('Type', new COSName('XObject'));
  stream.setItem('Subtype', new COSName('Form'));
  const bbox = new COSArray();
  bbox.setDirect(true);
  bbox.add(new COSInteger(0));
  bbox.add(new COSInteger(0));
  bbox.add(new COSInteger(size));
  bbox.add(new COSInteger(size));
  stream.setItem('BBox', bbox);

  const b = new ContentStreamBuilder();
  // Draw circle outline
  const KAPPA = 4 * ((Math.sqrt(2) - 1) / 3);
  const r = 5;
  const cx = 6, cy = 6;

  b.pushGraphicsState();
  b.setStrokeColor(rgb(0, 0, 0));
  b.setLineWidth(0.5);
  b.translate(cx, cy);
  b.moveTo(0, -r);
  b.appendBezierCurve(KAPPA * r, -r, r, -KAPPA * r, r, 0);
  b.appendBezierCurve(r, KAPPA * r, KAPPA * r, r, 0, r);
  b.appendBezierCurve(-KAPPA * r, r, -r, KAPPA * r, -r, 0);
  b.appendBezierCurve(-r, -KAPPA * r, -KAPPA * r, -r, 0, -r);
  b.stroke();

  if (selected) {
    // Filled inner circle
    const ir = 3;
    b.setFillColor(rgb(0, 0, 0));
    b.moveTo(0, -ir);
    b.appendBezierCurve(KAPPA * ir, -ir, ir, -KAPPA * ir, ir, 0);
    b.appendBezierCurve(ir, KAPPA * ir, KAPPA * ir, ir, 0, ir);
    b.appendBezierCurve(-KAPPA * ir, ir, -ir, KAPPA * ir, -ir, 0);
    b.appendBezierCurve(-ir, -KAPPA * ir, -KAPPA * ir, -ir, 0, -ir);
    b.fill();
  }
  b.popGraphicsState();

  stream.setData(b.toBytes());
  return ctx.register(stream);
}
