/**
 * PDFPage — native-only page wrapper.
 *
 * All drawing methods use ContentStreamBuilder for operator generation.
 * Resource registration and content stream injection use COS dict manipulation.
 */

import { PDFFont } from './PDFFont.js';
import { PDFImage } from './PDFImage.js';
import type { Color } from './colors.js';
import { rgb } from './colors.js';
import type { Rotation } from './rotations.js';
import { degrees } from './rotations.js';
import { ContentStreamBuilder } from './content-stream/ContentStreamBuilder.js';
import {
  COSInteger,
  COSFloat,
  COSDictionary,
  COSArray,
  COSObjectReference,
} from '../pdfbox/cos/COSTypes.js';
import type { PDFDocument } from './PDFDocument.js';
import type { PDAnnotation } from './annotations/PDAnnotation.js';
import type {
  PDFPageDrawTextOptions,
  PDFPageDrawImageOptions,
  PDFPageDrawSVGOptions,
  PDFPageDrawLineOptions,
  PDFPageDrawRectangleOptions,
  PDFPageDrawSquareOptions,
  PDFPageDrawEllipseOptions,
  PDFPageDrawCircleOptions,
  BlendMode,
} from './options.js';

// ---------------------------------------------------------------------------
// PDFPage
// ---------------------------------------------------------------------------

export class PDFPage {
  /** @internal — COS page dict */
  readonly _nativePageDict?: COSDictionary;
  /** @internal — COS page object reference */
  readonly _nativePageRef?: COSObjectReference;
  /** @internal — parent document (for context access) */
  readonly _doc?: PDFDocument;

  // State tracking
  private _font?: PDFFont;
  private _fontSize = 24;
  private _fontColor: Color = rgb(0, 0, 0);
  private _lineHeight?: number;
  private _x = 0;
  private _y = 0;

  // Per-page resource caches (avoid duplicate registrations)
  private _fontKeys = new Map<string, string>(); // ref string → key name
  private _imageKeys = new Map<string, string>(); // ref string → key name

  /** @internal */
  constructor(
    nativePageDict: COSDictionary,
    nativePageRef: COSObjectReference,
    doc: PDFDocument,
  ) {
    this._nativePageDict = nativePageDict;
    this._nativePageRef = nativePageRef;
    this._doc = doc;
  }

  /** @internal — create a native page */
  static _createNative(
    pageDict: COSDictionary,
    pageRef: COSObjectReference,
    doc: PDFDocument,
  ): PDFPage {
    return new PDFPage(pageDict, pageRef, doc);
  }

  get node(): never {
    throw new Error('PDFPage.node is not available. Use _nativePageDict for COS-level access.');
  }

  get ref(): COSObjectReference | undefined {
    return this._nativePageRef;
  }

  // --- Rotation ---

  setRotation(angle: Rotation): void {
    const deg = 'angle' in angle ? (angle as any).angle : (angle as any).angle;
    this._nativePageDict!.setItem('Rotate', new COSInteger(deg));
  }

  getRotation(): Rotation {
    const val = this._nativePageDict!.getInt('Rotate');
    return degrees(val);
  }

  // --- Size ---

  setSize(width: number, height: number): void {
    this.setMediaBox(0, 0, width, height);
  }

  setWidth(width: number): void {
    const { height } = this.getSize();
    this.setMediaBox(0, 0, width, height);
  }

  setHeight(height: number): void {
    const { width } = this.getSize();
    this.setMediaBox(0, 0, width, height);
  }

  getSize(): { width: number; height: number } {
    let mb = this._nativePageDict!.getItem('MediaBox');
    // Resolve indirect MediaBox reference
    if (mb instanceof COSObjectReference && this._doc?._nativeCtx) {
      mb = this._doc._nativeCtx.resolveRef(mb);
    }
    if (!(mb instanceof COSArray)) return { width: 612, height: 792 };
    return {
      width: this._cosArrayNum(mb, 2),
      height: this._cosArrayNum(mb, 3),
    };
  }

  getWidth(): number {
    return this.getSize().width;
  }

  getHeight(): number {
    return this.getSize().height;
  }

  // --- Boxes ---

  setMediaBox(x: number, y: number, width: number, height: number): void {
    this._setCosBox('MediaBox', x, y, width, height);
  }

  setCropBox(x: number, y: number, width: number, height: number): void {
    this._setCosBox('CropBox', x, y, width, height);
  }

  setBleedBox(x: number, y: number, width: number, height: number): void {
    this._setCosBox('BleedBox', x, y, width, height);
  }

  setTrimBox(x: number, y: number, width: number, height: number): void {
    this._setCosBox('TrimBox', x, y, width, height);
  }

  setArtBox(x: number, y: number, width: number, height: number): void {
    this._setCosBox('ArtBox', x, y, width, height);
  }

  getMediaBox(): { x: number; y: number; width: number; height: number } {
    return this._getCosBox('MediaBox');
  }

  getCropBox(): { x: number; y: number; width: number; height: number } {
    return this._getCosBox('CropBox') ?? this.getMediaBox();
  }

  getBleedBox(): { x: number; y: number; width: number; height: number } {
    return this._getCosBox('BleedBox') ?? this.getMediaBox();
  }

  getTrimBox(): { x: number; y: number; width: number; height: number } {
    return this._getCosBox('TrimBox') ?? this.getMediaBox();
  }

  getArtBox(): { x: number; y: number; width: number; height: number } {
    return this._getCosBox('ArtBox') ?? this.getMediaBox();
  }

  // --- Content transforms ---

  translateContent(x: number, y: number): void {
    const b = new ContentStreamBuilder();
    b.translate(x, y);
    this._pushContentStream(b.toBytes());
  }

  scale(x: number, y: number): void {
    this.scaleContent(x, y);
  }

  scaleContent(x: number, y: number): void {
    const b = new ContentStreamBuilder();
    b.scale(x, y);
    this._pushContentStream(b.toBytes());
  }

  scaleAnnotations(_x: number, _y: number): void {
    // TRACKED-TASK: native scaleAnnotations
  }

  // --- Annotations ---

  /**
   * Add an annotation to this page.
   * Registers the annotation dict as an indirect object, adds to /Annots array,
   * sets /P (page ref) on the annotation, and generates appearance if available.
   */
  addAnnotation(annotation: PDAnnotation): void {
    if (!this._nativePageDict || !this._doc?._nativeCtx) {
      throw new Error('PDFPage.addAnnotation() requires native mode.');
    }
    const ctx = this._doc._nativeCtx;

    // 1. Register annotation dict as indirect object
    const annotRef = ctx.register(annotation._dict);
    annotation._ref = annotRef;

    // 2. Set /P (page reference) on annotation
    if (this._nativePageRef) {
      annotation._dict.setItem('P', this._nativePageRef);
    }

    // 3. Get or create /Annots array on page
    let annots = this._nativePageDict.getItem('Annots');
    if (annots instanceof COSObjectReference) {
      annots = ctx.resolveRef(annots);
      if (annots) this._nativePageDict.setItem('Annots', annots);
    }
    if (!(annots instanceof COSArray)) {
      annots = new COSArray();
      (annots as COSArray).setDirect(true);
      this._nativePageDict.setItem('Annots', annots);
    }

    // 4. Add annotation ref to /Annots
    (annots as COSArray).add(annotRef);

    // 5. Generate appearance if the annotation supports it
    annotation.generateAppearance(ctx);
  }

  /**
   * Get annotations from this page.
   * Returns PDAnnotation wrappers for each entry in /Annots.
   */
  getAnnotationDicts(): COSDictionary[] {
    if (!this._nativePageDict || !this._doc?._nativeCtx) {
      throw new Error('PDFPage.getAnnotationDicts() requires native mode.');
    }
    const ctx = this._doc._nativeCtx;
    let annots = this._nativePageDict.getItem('Annots');
    if (annots instanceof COSObjectReference) {
      annots = ctx.resolveRef(annots);
    }
    if (!(annots instanceof COSArray)) return [];

    const result: COSDictionary[] = [];
    for (let i = 0; i < (annots as COSArray).size(); i++) {
      let entry = (annots as COSArray).get(i);
      if (entry instanceof COSObjectReference) {
        entry = ctx.resolveRef(entry);
      }
      if (entry instanceof COSDictionary) {
        result.push(entry);
      }
    }
    return result;
  }

  // --- Position & font state ---

  resetPosition(): void {
    this._x = 0;
    this._y = this.getHeight();
  }

  setFont(font: PDFFont): void {
    this._font = font;
  }

  setFontSize(fontSize: number): void {
    this._fontSize = fontSize;
  }

  setFontColor(fontColor: Color): void {
    this._fontColor = fontColor;
  }

  setLineHeight(lineHeight: number): void {
    this._lineHeight = lineHeight;
  }

  getPosition(): { x: number; y: number } {
    return { x: this._x, y: this._y };
  }

  getX(): number {
    return this._x;
  }

  getY(): number {
    return this._y;
  }

  moveTo(x: number, y: number): void {
    this._x = x;
    this._y = y;
  }

  moveDown(yDecrease: number): void {
    this._y -= yDecrease;
  }

  moveUp(yIncrease: number): void {
    this._y += yIncrease;
  }

  moveLeft(xDecrease: number): void {
    this._x -= xDecrease;
  }

  moveRight(xIncrease: number): void {
    this._x += xIncrease;
  }

  // --- Operators (low-level) ---

  pushOperators(..._operator: unknown[]): void {
    throw new Error('PDFPage.pushOperators() is not available. Use ContentStreamBuilder instead.');
  }

  // =========================================================================
  // Resource registration helpers (dual-mode)
  // =========================================================================

  /** Register font on page, return key name (e.g. 'F1'). Cached per page. */
  private _ensureFontKey(font: PDFFont): string {
    const nativeRef = font._nativeRef;
    if (!nativeRef) throw new Error('Native font has no COS reference.');
    const refKey = nativeRef.toReferenceString();
    const existing = this._fontKeys.get(refKey);
    if (existing) return existing;

    const resources = this._ensureResourcesDict();
    let fontDict = resources.getItem('Font');
    // Resolve indirect Font dict reference
    if (fontDict instanceof COSObjectReference && this._doc?._nativeCtx) {
      fontDict = this._doc._nativeCtx.resolveRef(fontDict);
      if (fontDict) resources.setItem('Font', fontDict);
    }
    if (!(fontDict instanceof COSDictionary)) {
      fontDict = new COSDictionary();
      (fontDict as COSDictionary).setDirect(true);
      resources.setItem('Font', fontDict);
    }
    // Find next available key, avoiding collisions with existing fonts
    let idx = this._fontKeys.size + 1;
    while ((fontDict as COSDictionary).getItem(`F${idx}`)) idx++;
    const key = `F${idx}`;
    (fontDict as COSDictionary).setItem(key, nativeRef);
    this._fontKeys.set(refKey, key);
    return key;
  }

  /** Register image XObject on page, return key name (e.g. 'Image1'). */
  private _ensureImageKey(image: PDFImage): string {
    const nativeRef = image._nativeRef;
    if (!nativeRef) throw new Error('Native image has no COS reference.');
    const refKey = nativeRef.toReferenceString();
    const existing = this._imageKeys.get(refKey);
    if (existing) return existing;

    const resources = this._ensureResourcesDict();
    let xobjDict = resources.getItem('XObject');
    // Resolve indirect XObject dict reference
    if (xobjDict instanceof COSObjectReference && this._doc?._nativeCtx) {
      xobjDict = this._doc._nativeCtx.resolveRef(xobjDict);
      if (xobjDict) resources.setItem('XObject', xobjDict);
    }
    if (!(xobjDict instanceof COSDictionary)) {
      xobjDict = new COSDictionary();
      (xobjDict as COSDictionary).setDirect(true);
      resources.setItem('XObject', xobjDict);
    }
    // Find next available key, avoiding collisions
    let idx = this._imageKeys.size + 1;
    while ((xobjDict as COSDictionary).getItem(`Image${idx}`)) idx++;
    const key = `Image${idx}`;
    (xobjDict as COSDictionary).setItem(key, nativeRef);
    this._imageKeys.set(refKey, key);
    return key;
  }

  /**
   * Create an ExtGState resource for opacity/blending.
   * Matches pdf-lib's `maybeEmbedGraphicsState`.
   */
  private _createGraphicsState(opts: {
    opacity?: number;
    borderOpacity?: number;
    blendMode?: BlendMode | string;
  }): string | undefined {
    if (
      opts.opacity === undefined &&
      opts.borderOpacity === undefined &&
      opts.blendMode === undefined
    ) {
      return undefined;
    }
    return this._createGraphicsStateNative(opts);
  }

  private _createGraphicsStateNative(opts: {
    opacity?: number;
    borderOpacity?: number;
    blendMode?: BlendMode | string;
  }): string | undefined {
    const ctx = this._doc!._nativeCtx!;
    const gsRef = ctx.createGraphicsState({
      fillOpacity: opts.opacity,
      strokeOpacity: opts.borderOpacity,
      blendMode: opts.blendMode as string | undefined,
    });

    const resources = this._ensureResourcesDict();
    let gsDict = resources.getItem('ExtGState') as COSDictionary | undefined;
    if (!gsDict) {
      gsDict = new COSDictionary();
      gsDict.setDirect(true);
      resources.setItem('ExtGState', gsDict);
    }
    const key = `GS${gsDict.size() + 1}`;
    gsDict.setItem(key, gsRef);
    return key;
  }

  /** Inject raw content stream bytes into the page. */
  private _pushContentStream(bytes: Uint8Array): void {
    const ctx = this._doc!._nativeCtx!;
    const ref = ctx.createStream(bytes);
    let contents = this._nativePageDict!.getItem('Contents');

    // Loaded pages may have /Contents as a single ref (N 0 R) instead of an array
    if (contents instanceof COSObjectReference) {
      const arr = new COSArray();
      arr.setDirect(true);
      arr.add(contents); // keep existing content stream
      this._nativePageDict!.setItem('Contents', arr);
      contents = arr;
    }

    if (contents instanceof COSArray) {
      contents.add(ref);
    } else {
      // No Contents yet — create array
      const arr = new COSArray();
      arr.setDirect(true);
      arr.add(ref);
      this._nativePageDict!.setItem('Contents', arr);
    }
  }

  // --- COS helpers ---

  private _ensureResourcesDict(): COSDictionary {
    let resources = this._nativePageDict!.getItem('Resources');
    // Resolve indirect reference (loaded pages may have /Resources as N 0 R)
    if (resources instanceof COSObjectReference && this._doc?._nativeCtx) {
      resources = this._doc._nativeCtx.resolveRef(resources);
      // Replace indirect ref with resolved dict for future access
      if (resources) {
        this._nativePageDict!.setItem('Resources', resources);
      }
    }
    if (resources instanceof COSDictionary) {
      return resources;
    }
    // Create if missing
    const dict = new COSDictionary();
    dict.setDirect(true);
    this._nativePageDict!.setItem('Resources', dict);
    return dict;
  }

  private _setCosBox(key: string, x: number, y: number, w: number, h: number): void {
    const arr = new COSArray();
    arr.setDirect(true);
    arr.add(this._numObj(x));
    arr.add(this._numObj(y));
    arr.add(this._numObj(w));
    arr.add(this._numObj(h));
    this._nativePageDict!.setItem(key, arr);
  }

  private _getCosBox(key: string): { x: number; y: number; width: number; height: number } {
    let item = this._nativePageDict!.getItem(key);
    // Resolve indirect reference (loaded pages may have boxes as N 0 R)
    if (item instanceof COSObjectReference && this._doc?._nativeCtx) {
      item = this._doc._nativeCtx.resolveRef(item);
    }
    if (!(item instanceof COSArray)) return { x: 0, y: 0, width: 612, height: 792 };
    return {
      x: this._cosArrayNum(item, 0),
      y: this._cosArrayNum(item, 1),
      width: this._cosArrayNum(item, 2),
      height: this._cosArrayNum(item, 3),
    };
  }

  private _cosArrayNum(arr: COSArray, idx: number): number {
    const el = arr.get(idx);
    if (!el) return 0;
    if ('getValue' in el) return (el as any).getValue();
    return 0;
  }

  private _numObj(n: number): COSInteger | COSFloat {
    return Number.isInteger(n) ? new COSInteger(n) : new COSFloat(n);
  }

  // --- Word wrapping ---

  private _wordWrap(
    lines: string[],
    font: PDFFont,
    size: number,
    maxWidth: number,
    wordBreaks: string[],
  ): string[] {
    const result: string[] = [];
    for (const line of lines) {
      if (font.widthOfTextAtSize(line, size) <= maxWidth) {
        result.push(line);
        continue;
      }
      const parts = this._splitByBreaks(line, wordBreaks);
      let currentLine = '';
      for (const part of parts) {
        const testLine = currentLine + part;
        if (
          currentLine !== '' &&
          font.widthOfTextAtSize(testLine, size) > maxWidth
        ) {
          result.push(currentLine);
          currentLine = part;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine !== '') result.push(currentLine);
    }
    return result;
  }

  private _splitByBreaks(text: string, breaks: string[]): string[] {
    if (breaks.length === 0) return [text];
    const escaped = breaks.map((b) =>
      b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    );
    const regex = new RegExp(`(${escaped.join('|')})`);
    return text.split(regex).filter((s) => s !== '');
  }

  // =========================================================================
  // Drawing methods (Phase 4 native ContentStreamBuilder)
  // =========================================================================

  drawText(text: string, options?: PDFPageDrawTextOptions): void {
    const font = options?.font ?? this._font;
    if (!font) {
      throw new Error('No font set. Call page.setFont() or pass font in options.');
    }

    const size = options?.size ?? this._fontSize;
    const color = options?.color ?? this._fontColor;
    const x = options?.x ?? this._x;
    const y = options?.y ?? this._y;
    const rotate = options?.rotate ?? degrees(0);
    const xSkew = options?.xSkew ?? degrees(0);
    const ySkew = options?.ySkew ?? degrees(0);
    const lineHeight = options?.lineHeight ?? this._lineHeight ?? size * 1.2;
    const maxWidth = options?.maxWidth;
    const wordBreaks = options?.wordBreaks ?? [' '];

    const fontKey = this._ensureFontKey(font);
    const gsKey = this._createGraphicsState({
      opacity: options?.opacity,
      borderOpacity: options?.opacity,
      blendMode: options?.blendMode,
    });

    let lines = text.split('\n');
    if (maxWidth !== undefined) {
      lines = this._wordWrap(lines, font, size, maxWidth, wordBreaks);
    }

    const hexLines = lines.map((line) => font.encodeTextToHex(line));

    const builder = new ContentStreamBuilder();
    builder.drawTextLines(hexLines, {
      font: fontKey,
      size,
      color,
      x,
      y,
      rotate,
      xSkew,
      ySkew,
      lineHeight,
      graphicsState: gsKey,
    });

    this._pushContentStream(builder.toBytes());

    // Update position cursor (matches pdf-lib behavior)
    this._x = x;
    this._y = y - lineHeight * (lines.length - 1);
  }

  // --- Drawing: rectangle ---

  drawRectangle(options?: PDFPageDrawRectangleOptions): void {
    const {
      x = 0,
      y = 0,
      width = 150,
      height = 100,
      rotate = degrees(0),
      xSkew = degrees(0),
      ySkew = degrees(0),
      borderWidth = 0,
      color = rgb(0, 0, 0),
      opacity,
      borderColor,
      borderOpacity,
      blendMode,
      borderDashArray,
      borderDashPhase,
      borderLineCap,
    } = options ?? {};

    const gsKey = this._createGraphicsState({
      opacity,
      borderOpacity: borderOpacity ?? opacity,
      blendMode,
    });

    const builder = new ContentStreamBuilder();
    builder.drawRect({
      x,
      y,
      width,
      height,
      borderWidth,
      color,
      borderColor,
      rotate,
      xSkew,
      ySkew,
      borderLineCap,
      borderDashArray,
      borderDashPhase,
      graphicsState: gsKey,
    });

    this._pushContentStream(builder.toBytes());
  }

  // --- Drawing: square (delegates to drawRectangle) ---

  drawSquare(options?: PDFPageDrawSquareOptions): void {
    const { size = 100, ...rest } = options ?? {};
    this.drawRectangle({ ...rest, width: size, height: size });
  }

  // --- Drawing: line ---

  drawLine(options: PDFPageDrawLineOptions): void {
    const {
      start,
      end,
      thickness = 1,
      color = rgb(0, 0, 0),
      opacity,
      lineCap,
      dashArray,
      dashPhase,
      blendMode,
    } = options;

    const gsKey = this._createGraphicsState({
      borderOpacity: opacity,
      blendMode,
    });

    const builder = new ContentStreamBuilder();
    builder.drawLine({
      start,
      end,
      thickness,
      color,
      dashArray,
      dashPhase,
      lineCap,
      graphicsState: gsKey,
    });

    this._pushContentStream(builder.toBytes());
  }

  // --- Drawing: image ---

  drawImage(image: PDFImage, options?: PDFPageDrawImageOptions): void {
    const {
      x = 0,
      y = 0,
      width = image.width,
      height = image.height,
      rotate = degrees(0),
      xSkew = degrees(0),
      ySkew = degrees(0),
      opacity,
      blendMode,
    } = options ?? {};

    const imageKey = this._ensureImageKey(image);
    const gsKey = this._createGraphicsState({
      opacity,
      blendMode,
    });

    const builder = new ContentStreamBuilder();
    builder.drawImage(imageKey, {
      x,
      y,
      width,
      height,
      rotate,
      xSkew,
      ySkew,
      graphicsState: gsKey,
    });

    this._pushContentStream(builder.toBytes());
  }

  // --- Drawing: ellipse ---

  drawEllipse(options?: PDFPageDrawEllipseOptions): void {
    const {
      x = 0,
      y = 0,
      xScale = 100,
      yScale = 100,
      rotate,
      color = rgb(0, 0, 0),
      opacity,
      borderColor,
      borderOpacity,
      borderWidth = 0,
      blendMode,
      borderDashArray,
      borderDashPhase,
      borderLineCap,
    } = options ?? {};

    const gsKey = this._createGraphicsState({
      opacity,
      borderOpacity: borderOpacity ?? opacity,
      blendMode,
    });

    const builder = new ContentStreamBuilder();
    builder.drawEllipse({
      x,
      y,
      xScale,
      yScale,
      rotate,
      color,
      borderColor,
      borderWidth,
      borderLineCap,
      borderDashArray,
      borderDashPhase,
      graphicsState: gsKey,
    });

    this._pushContentStream(builder.toBytes());
  }

  // --- Drawing: circle (delegates to drawEllipse) ---

  drawCircle(options?: PDFPageDrawCircleOptions): void {
    const { size = 100, ...rest } = options ?? {};
    this.drawEllipse({ ...rest, xScale: size, yScale: size });
  }

  // --- Drawing: not-yet-native methods ---

  drawPage(
    _embeddedPage: unknown,
    _options?: unknown,
  ): void {
    throw new Error(
      'PDFPage.drawPage() is not yet implemented natively. ' +
      'Use copyPages() + addPage() instead.',
    );
  }

  drawSvgPath(_path: string, _options?: PDFPageDrawSVGOptions): void {
    throw new Error(
      'PDFPage.drawSvgPath() is not yet implemented natively. ' +
      'This feature will be available in a future release.',
    );
  }
}
