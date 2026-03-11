/**
 * NativeCanvasGraphics — renders OperatorList to Canvas 2D.
 *
 * Takes the evaluated OperatorList from evaluator.ts and dispatches
 * each operation to the Canvas 2D API. Maintains a graphics state
 * stack for save/restore, handles text rendering with matrix math,
 * and draws images.
 *
 * Coordinate system:
 *   PDF: origin at bottom-left, Y increases upward.
 *   Canvas: origin at top-left, Y increases downward.
 *   We apply a viewport transform that flips Y and scales.
 */

import { OPS } from './ops.js';
import type { OperatorList } from './operator-list.js';
import type {
  NativeFont,
  Glyph,
  NativeImage,
  NativeShading,
  NativeTilingPattern,
} from './evaluator.js';
import type { RenderDiagnosticsCollector } from './types.js';

// ---------------------------------------------------------------------------
// Graphics state
// ---------------------------------------------------------------------------

interface GraphicsState {
  fillColor: string | CanvasPattern;
  strokeColor: string | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  miterLimit: number;
  dashArray: number[];
  dashPhase: number;
  fillAlpha: number;
  strokeAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;

  // Font state
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;

  // Text state
  charSpacing: number;
  wordSpacing: number;
  horizontalScaling: number; // percentage: 100 = normal
  textLeading: number;
  textRise: number;
  textRenderingMode: number;
}

function defaultState(): GraphicsState {
  return {
    fillColor: '#000000',
    strokeColor: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    dashArray: [],
    dashPhase: 0,
    fillAlpha: 1,
    strokeAlpha: 1,
    globalCompositeOperation: 'source-over',
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: 12,
    fontWeight: 'normal',
    fontStyle: 'normal',
    charSpacing: 0,
    wordSpacing: 0,
    horizontalScaling: 100,
    textLeading: 0,
    textRise: 0,
    textRenderingMode: 0,
  };
}

function cloneState(s: GraphicsState): GraphicsState {
  return { ...s, dashArray: [...s.dashArray] };
}

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

export class NativeCanvasGraphics {
  private ctx: CanvasRenderingContext2D;
  private stateStack: GraphicsState[] = [];
  private state: GraphicsState = defaultState();

  // Text matrices (6-element arrays: [a, b, c, d, e, f])
  private textMatrix = IDENTITY.slice();
  private textLineMatrix = IDENTITY.slice();
  private inTextBlock = false;

  // Current path (for deferred clip)
  private pendingClip: 'nonzero' | 'evenodd' | null = null;

  // Track current point for curveTo2 (v operator)
  private currentPoint: [number, number] = [0, 0];

  private diagnostics?: RenderDiagnosticsCollector;

  constructor(ctx: CanvasRenderingContext2D, diagnostics?: RenderDiagnosticsCollector) {
    this.ctx = ctx;
    this.diagnostics = diagnostics;
  }

  /**
   * Execute all operations in an OperatorList.
   */
  execute(opList: OperatorList): void {
    const { fnArray, argsArray } = opList;

    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i];
      const args = argsArray[i];
      this.dispatch(fn, args);
    }
  }

  // ---- Dispatch ----

  private dispatch(fn: number, args: any[] | null): void {
    switch (fn) {
      // ---- Graphics state ----
      case OPS.save:
        this.save();
        break;
      case OPS.restore:
        this.restore();
        break;
      case OPS.transform:
        this.transform(args!);
        break;
      case OPS.setLineWidth:
        this.setLineWidth(args![0]);
        break;
      case OPS.setLineCap:
        this.setLineCap(args![0]);
        break;
      case OPS.setLineJoin:
        this.setLineJoin(args![0]);
        break;
      case OPS.setMiterLimit:
        this.setMiterLimit(args![0]);
        break;
      case OPS.setDash:
        this.setDash(args![0], args![1]);
        break;
      case OPS.setGState:
        this.setGState(args![0]);
        break;

      // ---- Path construction ----
      case OPS.moveTo:
        this.ctx.moveTo(args![0], args![1]);
        this.currentPoint = [args![0], args![1]];
        break;
      case OPS.lineTo:
        this.ctx.lineTo(args![0], args![1]);
        this.currentPoint = [args![0], args![1]];
        break;
      case OPS.curveTo:
        this.ctx.bezierCurveTo(args![0], args![1], args![2], args![3], args![4], args![5]);
        this.currentPoint = [args![4], args![5]];
        break;
      case OPS.curveTo2: {
        // v: first control point is current point
        // args = [cp2x, cp2y, endX, endY]
        const cp1 = this.currentPoint;
        this.ctx.bezierCurveTo(cp1[0], cp1[1], args![0], args![1], args![2], args![3]);
        this.currentPoint = [args![2], args![3]];
        break;
      }
      case OPS.curveTo3: {
        // y: second control point equals endpoint
        this.ctx.bezierCurveTo(args![0], args![1], args![2], args![3], args![2], args![3]);
        this.currentPoint = [args![2], args![3]];
        break;
      }
      case OPS.closePath:
        this.ctx.closePath();
        break;
      case OPS.rectangle:
        this.ctx.rect(args![0], args![1], args![2], args![3]);
        this.currentPoint = [args![0], args![1]];
        break;

      // ---- Path painting ----
      case OPS.stroke:
        this.strokePath();
        break;
      case OPS.closeStroke:
        this.ctx.closePath();
        this.strokePath();
        break;
      case OPS.fill:
        this.fillPath('nonzero');
        break;
      case OPS.eoFill:
        this.fillPath('evenodd');
        break;
      case OPS.fillStroke:
        this.fillPath('nonzero');
        this.strokePath();
        break;
      case OPS.eoFillStroke:
        this.fillPath('evenodd');
        this.strokePath();
        break;
      case OPS.closeFillStroke:
        this.ctx.closePath();
        this.fillPath('nonzero');
        this.strokePath();
        break;
      case OPS.closeEOFillStroke:
        this.ctx.closePath();
        this.fillPath('evenodd');
        this.strokePath();
        break;
      case OPS.endPath:
        this.endPath();
        break;
      case OPS.clip:
        this.pendingClip = 'nonzero';
        break;
      case OPS.eoClip:
        this.pendingClip = 'evenodd';
        break;

      // ---- Text ----
      case OPS.beginText:
        this.beginText();
        break;
      case OPS.endText:
        this.endText();
        break;
      case OPS.setCharSpacing:
        this.state.charSpacing = args![0];
        break;
      case OPS.setWordSpacing:
        this.state.wordSpacing = args![0];
        break;
      case OPS.setHScale:
        this.state.horizontalScaling = args![0];
        break;
      case OPS.setLeading:
        this.state.textLeading = args![0];
        break;
      case OPS.setFont:
        this.setFont(args![0], args![1], args![2], args![3]);
        break;
      case OPS.setTextRenderingMode:
        this.state.textRenderingMode = args![0];
        break;
      case OPS.setTextRise:
        this.state.textRise = args![0];
        break;
      case OPS.moveText:
        this.moveText(args![0], args![1]);
        break;
      case OPS.setLeadingMoveText:
        this.setLeadingMoveText(args![0], args![1]);
        break;
      case OPS.setTextMatrix:
        this.setTextMatrix(args!);
        break;
      case OPS.nextLine:
        this.nextLine();
        break;
      case OPS.showText:
        this.showText(args![0]);
        break;
      case OPS.showSpacedText:
        this.showSpacedText(args![0]);
        break;
      case OPS.nextLineShowText:
        this.nextLine();
        this.showText(args![0]);
        break;
      case OPS.nextLineSetSpacingShowText: {
        this.state.wordSpacing = args![0];
        this.state.charSpacing = args![1];
        this.nextLine();
        this.showText(args![2]);
        break;
      }

      // ---- Color ----
      case OPS.setStrokeGray:
        this.state.strokeColor = grayToCSS(args![0]);
        this.applyStrokeColor();
        break;
      case OPS.setFillGray:
        this.state.fillColor = grayToCSS(args![0]);
        this.applyFillColor();
        break;
      case OPS.setStrokeRGBColor:
        this.state.strokeColor = rgbToCSS(args![0], args![1], args![2]);
        this.applyStrokeColor();
        break;
      case OPS.setFillRGBColor:
        this.state.fillColor = rgbToCSS(args![0], args![1], args![2]);
        this.applyFillColor();
        break;
      case OPS.setStrokeCMYKColor:
        this.state.strokeColor = cmykToCSS(args![0], args![1], args![2], args![3]);
        this.applyStrokeColor();
        break;
      case OPS.setFillCMYKColor:
        this.state.fillColor = cmykToCSS(args![0], args![1], args![2], args![3]);
        this.applyFillColor();
        break;
      case OPS.setStrokeColor: {
        const c = args ?? [];
        if (c.length === 1) this.state.strokeColor = grayToCSS(c[0]);
        else if (c.length === 3) this.state.strokeColor = rgbToCSS(c[0], c[1], c[2]);
        else if (c.length === 4) this.state.strokeColor = cmykToCSS(c[0], c[1], c[2], c[3]);
        this.applyStrokeColor();
        break;
      }
      case OPS.setFillColor: {
        const c = args ?? [];
        if (c.length === 1) this.state.fillColor = grayToCSS(c[0]);
        else if (c.length === 3) this.state.fillColor = rgbToCSS(c[0], c[1], c[2]);
        else if (c.length === 4) this.state.fillColor = cmykToCSS(c[0], c[1], c[2], c[3]);
        this.applyFillColor();
        break;
      }

      // ---- Shading ----
      case OPS.shadingFill:
        this.shadingFill(args![0]);
        break;

      // ---- Pattern fills ----
      case OPS.setFillPattern:
        this.setFillPattern(args![0]);
        break;
      case OPS.setStrokePattern:
        this.setStrokePattern(args![0]);
        break;

      // ---- XObjects ----
      case OPS.paintImageXObject:
        this.paintImage(args![0]);
        break;
      case OPS.paintInlineImageXObject:
        this.paintImage(args![0]);
        break;
      case OPS.paintFormXObjectBegin:
        this.paintFormBegin(args![0], args![1]);
        break;
      case OPS.paintFormXObjectEnd:
        this.paintFormEnd();
        break;

      // ---- Marked content (no-op for rendering) ----
      case OPS.beginMarkedContent:
        break;
      case OPS.beginMarkedContentProps:
        break;
      case OPS.endMarkedContent:
        break;
      case OPS.markPoint:
        break;
      case OPS.markPointProps:
        break;
      case OPS.beginCompat:
        break;
      case OPS.endCompat:
        break;

      default:
        this.diagnostics?.warn('operator', `Unknown PDF operator: ${fn}`);
        break;
    }
  }

  // ================================================================
  // Graphics state
  // ================================================================

  private save(): void {
    this.stateStack.push(cloneState(this.state));
    this.ctx.save();
  }

  private restore(): void {
    const prev = this.stateStack.pop();
    if (prev) this.state = prev;
    this.ctx.restore();
  }

  private transform(args: number[]): void {
    this.ctx.transform(args[0], args[1], args[2], args[3], args[4], args[5]);
  }

  private setLineWidth(w: number): void {
    this.state.lineWidth = w;
    this.ctx.lineWidth = w;
  }

  private setLineCap(cap: number): void {
    const caps: CanvasLineCap[] = ['butt', 'round', 'square'];
    this.state.lineCap = caps[cap] ?? 'butt';
    this.ctx.lineCap = this.state.lineCap;
  }

  private setLineJoin(join: number): void {
    const joins: CanvasLineJoin[] = ['miter', 'round', 'bevel'];
    this.state.lineJoin = joins[join] ?? 'miter';
    this.ctx.lineJoin = this.state.lineJoin;
  }

  private setMiterLimit(limit: number): void {
    this.state.miterLimit = limit;
    this.ctx.miterLimit = limit;
  }

  private setDash(dashArray: number[], dashPhase: number): void {
    this.state.dashArray = dashArray;
    this.state.dashPhase = dashPhase;
    this.ctx.setLineDash(dashArray);
    this.ctx.lineDashOffset = dashPhase;
  }

  private setGState(stateMap: Map<string, any>): void {
    if (stateMap.has('strokeAlpha')) {
      this.state.strokeAlpha = stateMap.get('strokeAlpha');
    }
    if (stateMap.has('fillAlpha')) {
      this.state.fillAlpha = stateMap.get('fillAlpha');
    }
    if (stateMap.has('globalCompositeOperation')) {
      this.state.globalCompositeOperation = stateMap.get('globalCompositeOperation');
      this.ctx.globalCompositeOperation = this.state.globalCompositeOperation;
    }
  }

  // ================================================================
  // Path painting
  // ================================================================

  private fillPath(rule: CanvasFillRule): void {
    this.applyFillColor();
    this.ctx.globalAlpha = this.state.fillAlpha;
    this.ctx.fill(rule);
    this.ctx.globalAlpha = 1;
    this.consumeClip();
  }

  private strokePath(): void {
    this.applyStrokeColor();
    this.ctx.globalAlpha = this.state.strokeAlpha;
    this.ctx.stroke();
    this.ctx.globalAlpha = 1;
    this.consumeClip();
  }

  private endPath(): void {
    this.consumeClip();
    this.ctx.beginPath();
  }

  /**
   * PDF clips are deferred: W or W* sets a pending clip, and the
   * NEXT path-painting operator (or n) actually applies it.
   */
  private consumeClip(): void {
    if (this.pendingClip) {
      this.ctx.clip(this.pendingClip === 'evenodd' ? 'evenodd' : 'nonzero');
      this.pendingClip = null;
    }
    this.ctx.beginPath();
  }

  // ================================================================
  // Color
  // ================================================================

  private applyFillColor(): void {
    this.ctx.fillStyle = this.state.fillColor;
  }

  private applyStrokeColor(): void {
    this.ctx.strokeStyle = this.state.strokeColor;
  }

  // ================================================================
  // Text
  // ================================================================

  private beginText(): void {
    this.inTextBlock = true;
    this.textMatrix = IDENTITY.slice();
    this.textLineMatrix = IDENTITY.slice();
  }

  private endText(): void {
    this.inTextBlock = false;
  }

  private setFont(_fontId: string, fontSize: number, css: NativeFont, registeredFamily?: string): void {
    this.state.fontSize = fontSize;
    // Use registered (embedded) font family if available, fall back to CSS
    this.state.fontFamily = registeredFamily
      ? `'${registeredFamily}'`
      : css.family;
    this.state.fontWeight = registeredFamily ? 'normal' : css.weight;
    this.state.fontStyle = registeredFamily ? 'normal' : css.style;
  }

  private moveText(tx: number, ty: number): void {
    const m: number[] = [1, 0, 0, 1, tx, ty];
    this.textLineMatrix = multiplyMatrices(m, this.textLineMatrix);
    this.textMatrix = this.textLineMatrix.slice();
  }

  private setLeadingMoveText(tx: number, ty: number): void {
    this.state.textLeading = -ty;
    this.moveText(tx, ty);
  }

  private setTextMatrix(args: number[]): void {
    this.textMatrix = [args[0], args[1], args[2], args[3], args[4], args[5]];
    this.textLineMatrix = this.textMatrix.slice();
  }

  private nextLine(): void {
    this.moveText(0, -this.state.textLeading);
  }

  private showText(glyphs: Glyph[]): void {
    if (!glyphs || glyphs.length === 0) return;

    const fontSize = this.state.fontSize;
    const charSpacing = this.state.charSpacing;
    const wordSpacing = this.state.wordSpacing;
    const hScale = this.state.horizontalScaling / 100;
    const textRise = this.state.textRise;
    const renderMode = this.state.textRenderingMode;

    // Skip invisible text (renderMode 3 = invisible)
    const shouldFill = renderMode % 2 === 0 || renderMode >= 4;
    const shouldStroke =
      renderMode === 1 || renderMode === 2 || renderMode === 5 || renderMode === 6;
    if (!shouldFill && !shouldStroke) return;

    // Render each character individually at its PDF-specified position.
    // PDF glyph widths define exact character advances — we cannot rely on
    // canvas's built-in font metrics (fillText with a multi-char string)
    // because they differ from the PDF's specified widths, causing characters
    // to pile up or gap apart.
    for (const glyph of glyphs) {
      const ch = glyph.unicode || '';
      if (ch) {
        const x = this.textMatrix[4];
        const y = this.textMatrix[5];
        this.renderGlyph(ch, x, y + textRise, fontSize, shouldFill, shouldStroke);
      }

      // Advance textMatrix by PDF-specified glyph width + spacing
      const glyphWidth = (glyph.width / 1000) * fontSize;
      const isSpace = glyph.unicode === ' ';
      const spacing = charSpacing + (isSpace ? wordSpacing : 0);
      const advance = (glyphWidth + spacing) * hScale;

      this.textMatrix[4] += advance * this.textMatrix[0];
      this.textMatrix[5] += advance * this.textMatrix[1];
    }
  }

  private showSpacedText(items: (Glyph | number)[]): void {
    if (!items || items.length === 0) return;

    const fontSize = this.state.fontSize;
    const hScale = this.state.horizontalScaling / 100;

    // Batch consecutive glyphs between numeric adjustments
    let glyphBatch: Glyph[] = [];

    for (const item of items) {
      if (typeof item === 'number') {
        // Flush any accumulated glyph batch before applying displacement
        if (glyphBatch.length > 0) {
          this.showText(glyphBatch);
          glyphBatch = [];
        }
        // Numeric displacement: negative = advance, in thousandths of text space unit
        const displacement = (-item / 1000) * fontSize * hScale;
        this.textMatrix[4] += displacement * this.textMatrix[0];
        this.textMatrix[5] += displacement * this.textMatrix[1];
      } else {
        // Accumulate glyph for batched rendering
        glyphBatch.push(item);
      }
    }

    // Flush remaining glyphs
    if (glyphBatch.length > 0) {
      this.showText(glyphBatch);
    }
  }

  private renderGlyph(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    fill: boolean,
    stroke: boolean
  ): void {
    if (!text) return;

    const ctx = this.ctx;
    ctx.save();

    // Apply text matrix rotation/scale (columns 0-1)
    // textMatrix = [a, b, c, d, tx, ty]
    // We apply the rotation/scale part, then position at (x, y)
    const [a, b, c, d] = this.textMatrix;

    // Apply CTM-relative text positioning
    ctx.transform(a, b, c, d, x, y);

    // Flip Y for text (PDF Y-up vs canvas Y-down after our viewport flip)
    ctx.scale(1, -1);

    // Set font
    const fontStr = `${this.state.fontStyle} ${this.state.fontWeight} ${Math.abs(fontSize)}px ${this.state.fontFamily}`;
    ctx.font = fontStr;

    if (fill) {
      ctx.globalAlpha = this.state.fillAlpha;
      ctx.fillStyle = this.state.fillColor;
      ctx.fillText(text, 0, 0);
    }

    if (stroke) {
      ctx.globalAlpha = this.state.strokeAlpha;
      ctx.strokeStyle = this.state.strokeColor;
      ctx.strokeText(text, 0, 0);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ================================================================
  // Shading
  // ================================================================

  private shadingFill(shading: NativeShading | null): void {
    if (!shading) return;

    const ctx = this.ctx;
    ctx.save();

    try {
      let gradient: CanvasGradient;

      if (shading.type === 'linear') {
        // Linear gradient: coords = [x0, y0, x1, y1]
        gradient = ctx.createLinearGradient(
          shading.coords[0],
          shading.coords[1],
          shading.coords[2],
          shading.coords[3]
        );
      } else if (shading.type === 'radial') {
        // Radial gradient: coords = [x0, y0, r0, x1, y1, r1]
        gradient = ctx.createRadialGradient(
          shading.coords[0],
          shading.coords[1],
          shading.coords[2],
          shading.coords[3],
          shading.coords[4],
          shading.coords[5]
        );
      } else {
        ctx.restore();
        return;
      }

      // Add color stops
      for (const stop of shading.stops) {
        gradient.addColorStop(stop.offset, stop.color);
      }

      ctx.fillStyle = gradient;
      // Fill the entire page area (shading fills are unbounded by default)
      // Use a very large rect to cover the visible area
      ctx.fillRect(-10000, -10000, 20000, 20000);
    } catch (err) {
      this.diagnostics?.warn('shading', 'Failed to paint shading fill', {
        shadingType: shading.type,
        error: String(err),
      });
    }

    ctx.restore();
  }

  // ================================================================
  // Tiling Patterns
  // ================================================================

  private setFillPattern(pattern: NativeTilingPattern): void {
    const canvasPattern = this.createTilingPattern(pattern);
    if (canvasPattern) {
      this.state.fillColor = canvasPattern;
      this.ctx.fillStyle = canvasPattern;
    }
  }

  private setStrokePattern(pattern: NativeTilingPattern): void {
    const canvasPattern = this.createTilingPattern(pattern);
    if (canvasPattern) {
      this.state.strokeColor = canvasPattern;
      this.ctx.strokeStyle = canvasPattern;
    }
  }

  private createTilingPattern(pattern: NativeTilingPattern): CanvasPattern | null {
    const { bbox, xStep, yStep, matrix, opList } = pattern;

    // Pattern cell dimensions (use xStep/yStep for tile size, bbox for drawing area)
    const cellWidth = Math.abs(xStep) || Math.abs(bbox[2] - bbox[0]) || 1;
    const cellHeight = Math.abs(yStep) || Math.abs(bbox[3] - bbox[1]) || 1;

    // Create offscreen canvas for the pattern tile
    const tileCanvas = createOffscreenCanvas(
      Math.ceil(cellWidth),
      Math.ceil(cellHeight)
    );
    if (!tileCanvas) {
      this.diagnostics?.warn('pattern', 'Could not create offscreen canvas for tiling pattern');
      return null;
    }

    const tileCtx = (tileCanvas as any).getContext('2d') as CanvasRenderingContext2D;
    if (!tileCtx) return null;

    // Set up coordinate system: translate so bbox origin maps to (0, 0)
    tileCtx.translate(-bbox[0], -bbox[1]);

    // Execute the pattern's sub-operations on the tile canvas
    const subGraphics = new NativeCanvasGraphics(tileCtx, this.diagnostics);
    subGraphics.execute(opList);

    // Create a repeating pattern from the tile
    try {
      const canvasPattern = this.ctx.createPattern(tileCanvas as any, 'repeat');
      if (canvasPattern && matrix) {
        // Apply the pattern's matrix transform
        // DOMMatrix expects [a, b, c, d, e, f]
        canvasPattern.setTransform(
          new DOMMatrix([matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]])
        );
      }
      return canvasPattern;
    } catch (err) {
      this.diagnostics?.warn('pattern', 'Failed to create canvas pattern', {
        error: String(err),
      });
      return null;
    }
  }

  // ================================================================
  // Images
  // ================================================================

  private paintImage(image: NativeImage): void {
    if (!image) return;

    const ctx = this.ctx;
    const { width, height, data, isJpeg } = image;

    try {
      ctx.save();

      // Apply graphics state alpha (matches text/shape behavior)
      ctx.globalAlpha = this.state.fillAlpha;

      // PDF images are drawn in a 1×1 unit square that the CTM scales.
      // Flip Y because pixel data is top-down but PDF image space is bottom-up.
      ctx.transform(1, 0, 0, -1, 0, 1);

      // Fast path: browser-decoded ImageBitmap (avoids RGBA round-trip)
      if (image.bitmap) {
        ctx.drawImage(image.bitmap as any, 0, 0, 1, 1);
        ctx.restore();
        return;
      }

      if (isJpeg) {
        // JPEG: decode raw bytes using node-canvas Image (sync)
        const jpegImage = decodeJpegSync(data);
        if (jpegImage) {
          ctx.drawImage(jpegImage as any, 0, 0, 1, 1);
          ctx.restore();
          return;
        }
        // Fallback: skip if decode fails
        ctx.restore();
        return;
      }

      // Create ImageData and draw via temp canvas (putImageData ignores transforms)
      const tempCanvas = createOffscreenCanvas(width, height);
      if (tempCanvas) {
        const tempCtx = (tempCanvas as any).getContext('2d')!;
        // Use ctx.createImageData() — works in both Node.js (node-canvas) and browser
        const imageData = tempCtx.createImageData(width, height);
        imageData.data.set(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength));
        tempCtx.putImageData(imageData, 0, 0);
        // Draw directly into the 1×1 unit square (Y already flipped above)
        ctx.drawImage(tempCanvas as any, 0, 0, 1, 1);
      }

      ctx.restore();
    } catch (err) {
      this.diagnostics?.warn('image', `Failed to paint image (${width}x${height}, jpeg=${isJpeg})`, {
        error: String(err),
        width,
        height,
        isJpeg,
      });
      try {
        ctx.restore();
      } catch {
        /* ignore */
      }
    }
  }

  // ================================================================
  // Form XObjects
  // ================================================================

  private paintFormBegin(matrix: number[], bbox: number[]): void {
    // Save both internal GraphicsState AND canvas state so that any
    // state changes inside the Form XObject (ExtGState alpha, blend mode,
    // colors, etc.) are fully restored when the form ends.
    this.save();

    // Apply the form's matrix
    if (matrix && matrix.length === 6) {
      this.ctx.transform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
    }

    // Clip to BBox
    if (bbox && bbox.length === 4) {
      const [x0, y0, x1, y1] = bbox;
      this.ctx.beginPath();
      this.ctx.rect(x0, y0, x1 - x0, y1 - y0);
      this.ctx.clip();
      this.ctx.beginPath();
    }
  }

  private paintFormEnd(): void {
    // Restore both internal GraphicsState AND canvas state, undoing any
    // state mutations that occurred inside the Form XObject.
    this.restore();
  }
}

// ================================================================
// Color conversion helpers
// ================================================================

function grayToCSS(g: number): string {
  const v = Math.round(clamp01(g) * 255);
  return `rgb(${v},${v},${v})`;
}

function rgbToCSS(r: number, g: number, b: number): string {
  return `rgb(${Math.round(clamp01(r) * 255)},${Math.round(clamp01(g) * 255)},${Math.round(clamp01(b) * 255)})`;
}

function cmykToCSS(c: number, m: number, y: number, k: number): string {
  const r = Math.round(255 * (1 - clamp01(c)) * (1 - clamp01(k)));
  const g = Math.round(255 * (1 - clamp01(m)) * (1 - clamp01(k)));
  const b = Math.round(255 * (1 - clamp01(y)) * (1 - clamp01(k)));
  return `rgb(${r},${g},${b})`;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ================================================================
// Matrix math
// ================================================================

const IDENTITY = [1, 0, 0, 1, 0, 0];

function multiplyMatrices(m1: number[], m2: number[]): number[] {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

// ================================================================
// Canvas helpers
// ================================================================

/**
 * Decode JPEG bytes synchronously using node-canvas's Image.
 * In Node.js, setting img.src = Buffer is synchronous.
 * Returns null if decoding fails or in browser environment.
 */
function decodeJpegSync(data: Uint8Array): any | null {
  try {
    // Node.js: use node-canvas Image (sync decode)
    if (
      typeof globalThis.OffscreenCanvas === 'undefined' &&
      typeof process !== 'undefined' &&
      process.versions?.node
    ) {
      const { Image } = require('canvas');
      const img = new Image();
      img.src = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      if (img.width > 0 && img.height > 0) {
        return img;
      }
    }
  } catch {
    // Decode failed
  }
  return null;
}

function createOffscreenCanvas(
  width: number,
  height: number
): OffscreenCanvas | HTMLCanvasElement | null {
  // Node.js: use node-canvas if available
  if (typeof globalThis.OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  // Node.js without OffscreenCanvas — try require('canvas')
  try {
    // Dynamic require for node-canvas
    const { createCanvas } = require('canvas');
    return createCanvas(width, height);
  } catch {
    return null;
  }
}
