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
import type { NativeFont, Glyph, NativeImage } from './evaluator.js';

// ---------------------------------------------------------------------------
// Graphics state
// ---------------------------------------------------------------------------

interface GraphicsState {
  fillColor: string;
  strokeColor: string;
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

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
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
      case OPS.save: this.save(); break;
      case OPS.restore: this.restore(); break;
      case OPS.transform: this.transform(args!); break;
      case OPS.setLineWidth: this.setLineWidth(args![0]); break;
      case OPS.setLineCap: this.setLineCap(args![0]); break;
      case OPS.setLineJoin: this.setLineJoin(args![0]); break;
      case OPS.setMiterLimit: this.setMiterLimit(args![0]); break;
      case OPS.setDash: this.setDash(args![0], args![1]); break;
      case OPS.setGState: this.setGState(args![0]); break;

      // ---- Path construction ----
      case OPS.moveTo: this.ctx.moveTo(args![0], args![1]); break;
      case OPS.lineTo: this.ctx.lineTo(args![0], args![1]); break;
      case OPS.curveTo: this.ctx.bezierCurveTo(args![0], args![1], args![2], args![3], args![4], args![5]); break;
      case OPS.curveTo2: {
        // v: first control point is current point (not provided)
        // Canvas doesn't have this — we'd need to track current point.
        // Approximation: use quadraticCurveTo
        this.ctx.quadraticCurveTo(args![0], args![1], args![2], args![3]);
        break;
      }
      case OPS.curveTo3: {
        // y: second control point equals endpoint
        this.ctx.bezierCurveTo(args![0], args![1], args![2], args![3], args![2], args![3]);
        break;
      }
      case OPS.closePath: this.ctx.closePath(); break;
      case OPS.rectangle: this.ctx.rect(args![0], args![1], args![2], args![3]); break;

      // ---- Path painting ----
      case OPS.stroke: this.strokePath(); break;
      case OPS.closeStroke: this.ctx.closePath(); this.strokePath(); break;
      case OPS.fill: this.fillPath('nonzero'); break;
      case OPS.eoFill: this.fillPath('evenodd'); break;
      case OPS.fillStroke: this.fillPath('nonzero'); this.strokePath(); break;
      case OPS.eoFillStroke: this.fillPath('evenodd'); this.strokePath(); break;
      case OPS.closeFillStroke: this.ctx.closePath(); this.fillPath('nonzero'); this.strokePath(); break;
      case OPS.closeEOFillStroke: this.ctx.closePath(); this.fillPath('evenodd'); this.strokePath(); break;
      case OPS.endPath: this.endPath(); break;
      case OPS.clip: this.pendingClip = 'nonzero'; break;
      case OPS.eoClip: this.pendingClip = 'evenodd'; break;

      // ---- Text ----
      case OPS.beginText: this.beginText(); break;
      case OPS.endText: this.endText(); break;
      case OPS.setCharSpacing: this.state.charSpacing = args![0]; break;
      case OPS.setWordSpacing: this.state.wordSpacing = args![0]; break;
      case OPS.setHScale: this.state.horizontalScaling = args![0]; break;
      case OPS.setLeading: this.state.textLeading = args![0]; break;
      case OPS.setFont: this.setFont(args![0], args![1], args![2]); break;
      case OPS.setTextRenderingMode: this.state.textRenderingMode = args![0]; break;
      case OPS.setTextRise: this.state.textRise = args![0]; break;
      case OPS.moveText: this.moveText(args![0], args![1]); break;
      case OPS.setLeadingMoveText: this.setLeadingMoveText(args![0], args![1]); break;
      case OPS.setTextMatrix: this.setTextMatrix(args!); break;
      case OPS.nextLine: this.nextLine(); break;
      case OPS.showText: this.showText(args![0]); break;
      case OPS.showSpacedText: this.showSpacedText(args![0]); break;
      case OPS.nextLineShowText: this.nextLine(); this.showText(args![0]); break;
      case OPS.nextLineSetSpacingShowText: {
        this.state.wordSpacing = args![0];
        this.state.charSpacing = args![1];
        this.nextLine();
        this.showText(args![2]);
        break;
      }

      // ---- Color ----
      case OPS.setStrokeGray: this.state.strokeColor = grayToCSS(args![0]); this.applyStrokeColor(); break;
      case OPS.setFillGray: this.state.fillColor = grayToCSS(args![0]); this.applyFillColor(); break;
      case OPS.setStrokeRGBColor: this.state.strokeColor = rgbToCSS(args![0], args![1], args![2]); this.applyStrokeColor(); break;
      case OPS.setFillRGBColor: this.state.fillColor = rgbToCSS(args![0], args![1], args![2]); this.applyFillColor(); break;
      case OPS.setStrokeCMYKColor: this.state.strokeColor = cmykToCSS(args![0], args![1], args![2], args![3]); this.applyStrokeColor(); break;
      case OPS.setFillCMYKColor: this.state.fillColor = cmykToCSS(args![0], args![1], args![2], args![3]); this.applyFillColor(); break;
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

      // ---- XObjects ----
      case OPS.paintImageXObject: this.paintImage(args![0]); break;
      case OPS.paintInlineImageXObject: this.paintImage(args![0]); break;
      case OPS.paintFormXObjectBegin: this.paintFormBegin(args![0], args![1]); break;
      case OPS.paintFormXObjectEnd: this.paintFormEnd(); break;

      // ---- Marked content (no-op for rendering) ----
      case OPS.beginMarkedContent: break;
      case OPS.beginMarkedContentProps: break;
      case OPS.endMarkedContent: break;
      case OPS.markPoint: break;
      case OPS.markPointProps: break;
      case OPS.beginCompat: break;
      case OPS.endCompat: break;

      default: break; // Unknown op — skip
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

  private setFont(_fontId: string, fontSize: number, css: NativeFont): void {
    this.state.fontSize = fontSize;
    this.state.fontFamily = css.family;
    this.state.fontWeight = css.weight;
    this.state.fontStyle = css.style;
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
    const shouldFill = (renderMode % 2 === 0) || renderMode >= 4;
    const shouldStroke = renderMode === 1 || renderMode === 2 || renderMode === 5 || renderMode === 6;
    if (!shouldFill && !shouldStroke) return;

    for (const glyph of glyphs) {
      // Compute glyph position from textMatrix
      const x = this.textMatrix[4];
      const y = this.textMatrix[5];

      // Render the glyph
      this.renderGlyph(glyph.unicode, x, y + textRise, fontSize, shouldFill, shouldStroke);

      // Advance text position
      // Width is in 1/1000 of text space unit
      const glyphWidth = (glyph.width / 1000) * fontSize;
      const isSpace = glyph.unicode === ' ';
      const spacing = charSpacing + (isSpace ? wordSpacing : 0);
      const advance = (glyphWidth + spacing) * hScale;

      // Advance textMatrix by [advance, 0] in text space
      this.textMatrix[4] += advance * this.textMatrix[0];
      this.textMatrix[5] += advance * this.textMatrix[1];
    }
  }

  private showSpacedText(items: (Glyph | number)[]): void {
    if (!items || items.length === 0) return;

    const fontSize = this.state.fontSize;
    const hScale = this.state.horizontalScaling / 100;

    for (const item of items) {
      if (typeof item === 'number') {
        // Numeric displacement: negative = advance, in thousandths of text space unit
        const displacement = (-item / 1000) * fontSize * hScale;
        this.textMatrix[4] += displacement * this.textMatrix[0];
        this.textMatrix[5] += displacement * this.textMatrix[1];
      } else {
        // Glyph
        this.showText([item]);
      }
    }
  }

  private renderGlyph(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    fill: boolean,
    stroke: boolean,
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
  // Images
  // ================================================================

  private paintImage(image: NativeImage): void {
    if (!image) return;

    const ctx = this.ctx;
    const { width, height, data, isJpeg, decoded } = image;

    if (isJpeg && !decoded) {
      // JPEG not yet decoded (no pre-decode pass ran).
      // This should not happen when NativeRenderer is used — it runs decodeJpegImages()
      // before executing the op list. But if execute() is called directly, skip gracefully.
      return;
    }

    // RGBA pixel data → ImageData → putImageData via temp canvas
    try {
      // PDF image space: origin at bottom-left, 1 unit = full image
      // Current transform positions the image in page space
      ctx.save();

      // PDF images are drawn in a 1×1 unit square that the CTM scales.
      // The CTM is already applied. We need to flip Y because our pixel
      // data is top-down but PDF image space is bottom-up.
      ctx.transform(1, 0, 0, -1, 0, 1);

      if (decoded) {
        // Pre-decoded canvas element (e.g. from async JPEG decode)
        ctx.drawImage(decoded as any, 0, 0, 1, 1);
      } else {
        // Scale from 1×1 to pixel dimensions for putImageData
        ctx.scale(1 / width, 1 / height);

        // Create ImageData and draw
        const imageData = new ImageData(
          new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
          width,
          height,
        );

        // Use a temp canvas for the image (putImageData ignores transforms)
        const tempCanvas = createOffscreenCanvas(width, height);
        if (tempCanvas) {
          const tempCtx = tempCanvas.getContext('2d')!;
          tempCtx.putImageData(imageData, 0, 0);
          ctx.drawImage(tempCanvas as any, 0, 0);
        }
      }

      ctx.restore();
    } catch {
      // Skip images that fail to render
    }
  }

  // ================================================================
  // Form XObjects
  // ================================================================

  private paintFormBegin(matrix: number[], bbox: number[]): void {
    this.ctx.save();

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
    this.ctx.restore();
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

function createOffscreenCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement | null {
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
