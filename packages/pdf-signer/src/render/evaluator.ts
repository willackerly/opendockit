/**
 * evaluator.ts — Native PDF content stream evaluator.
 *
 * Walks content streams from COS objects and produces an OperatorList.
 * This eliminates the save→re-parse round-trip that PDFRenderer.fromDocument()
 * currently requires (save to bytes → PDF.js re-parse → render).
 *
 * Architecture:
 *   COSDictionary (page) → tokenize → CSOperation[] → evaluate → OperatorList
 *
 * Reuses existing infrastructure:
 * - tokenizeContentStream() / parseOperations() for content stream parsing
 * - FontDecoder for text decoding + glyph widths
 * - StreamDecoder for stream decompression
 * - ObjectResolver for indirect reference resolution
 */

import { OPS } from './ops.js';
import { OperatorList } from './operator-list.js';
import {
  tokenizeContentStream,
  parseOperations,
} from '../document/redaction/ContentStreamRedactor.js';
import type { CSToken, CSOperation } from '../document/redaction/ContentStreamRedactor.js';
import {
  buildFontDecoder,
  type FontDecoder,
  type ObjectResolver,
} from '../document/extraction/FontDecoder.js';
import { getDecompressedStreamData } from '../document/extraction/StreamDecoder.js';
import {
  extractEmbeddedFont,
  type ExtractedFont,
} from '../document/extraction/FontExtractor.js';
import {
  COSName,
  COSArray,
  COSInteger,
  COSFloat,
  COSDictionary,
  COSStream,
  COSObjectReference,
} from '../pdfbox/cos/COSTypes.js';
import type { COSBase } from '../pdfbox/cos/COSBase.js';
import { StandardFontMetrics } from '../document/fonts/StandardFontMetrics.js';
import { encodingForFont } from '../document/fonts/encoding.js';
import type {
  PageElement,
  TextElement,
  ShapeElement,
  PathElement,
  ImageElement,
  Color,
} from '../elements/types.js';
import type { RenderDiagnosticsCollector } from './types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** CSS font descriptor for canvas rendering. */
export interface NativeFont {
  family: string; // e.g. 'Helvetica, Arial, sans-serif'
  weight: string; // 'normal' | 'bold'
  style: string; // 'normal' | 'italic'
}

/** A decoded glyph for text rendering. */
export interface Glyph {
  unicode: string; // Decoded character(s)
  width: number; // Advance width in glyph units (typically 1/1000 em)
}

/** Decoded image for canvas rendering. */
export interface NativeImage {
  width: number;
  height: number;
  data: Uint8Array; // RGBA pixel data (always RGBA, even for JPEG which is pre-decoded)
  isJpeg: boolean;
  /** Soft mask alpha data (grayscale, same dimensions as image). */
  smaskData?: Uint8Array;
  /** Browser-decoded ImageBitmap (avoids RGBA round-trip for JPEGs). */
  bitmap?: ImageBitmap;
}

/** A gradient stop for shading patterns. */
export interface ShadingStop {
  offset: number; // 0..1
  color: string; // CSS color string
}

/** Decoded shading pattern for canvas rendering. */
export interface NativeShading {
  type: 'linear' | 'radial';
  coords: number[]; // linear: [x0,y0,x1,y1], radial: [x0,y0,r0,x1,y1,r1]
  stops: ShadingStop[];
}

// ---------------------------------------------------------------------------
// Matrix math helpers (for element extraction)
// ---------------------------------------------------------------------------

function identityMatrix(): number[] {
  return [1, 0, 0, 1, 0, 0];
}

function multiplyMatrices(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

function transformPoint(m: number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Convert CMYK [0-1] to RGB Color. */
function cmykToRgb(c: number, m: number, y: number, k: number): Color {
  return {
    r: (1 - c) * (1 - k),
    g: (1 - m) * (1 - k),
    b: (1 - y) * (1 - k),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a page's content stream and produce an OperatorList.
 *
 * @param pageDict  The page's COSDictionary (must have /Contents and /Resources)
 * @param resolve   Function to dereference COSObjectReference values
 * @returns OperatorList ready for NativeCanvasGraphics
 */
export function evaluatePage(
  pageDict: COSDictionary,
  resolve: ObjectResolver,
  diagnostics?: RenderDiagnosticsCollector,
): OperatorList {
  const opList = new OperatorList();
  const contentData = getPageContentData(pageDict, resolve);
  if (!contentData || contentData.length === 0) return opList;

  const resourcesDict = getResourcesDict(pageDict, resolve);
  const tokens = tokenizeContentStream(contentData);
  const operations = parseOperations(tokens);

  const ctx = new EvalContext(resourcesDict, resolve, opList, diagnostics);
  ctx.processOperations(operations);

  return opList;
}

/**
 * Evaluate a page's content stream and produce BOTH an OperatorList and PageElements.
 * The OperatorList is unchanged from evaluatePage(). Elements are a parallel extraction.
 */
export function evaluatePageWithElements(
  pageDict: COSDictionary,
  resolve: ObjectResolver,
  diagnostics?: RenderDiagnosticsCollector,
): { opList: OperatorList; elements: PageElement[] } {
  const opList = new OperatorList();
  const contentData = getPageContentData(pageDict, resolve);
  if (!contentData || contentData.length === 0) return { opList, elements: [] };

  const resourcesDict = getResourcesDict(pageDict, resolve);
  const tokens = tokenizeContentStream(contentData);
  const operations = parseOperations(tokens);

  const ctx = new EvalContext(resourcesDict, resolve, opList, diagnostics);
  ctx.processOperations(operations);

  return { opList, elements: ctx.getElements() };
}

// ---------------------------------------------------------------------------
// Internal: evaluation context (carries state across operators)
// ---------------------------------------------------------------------------

class EvalContext {
  private resources: COSDictionary | undefined;
  private resolve: ObjectResolver;
  private opList: OperatorList;
  private fontCache = new Map<
    string,
    { decoder: FontDecoder; css: NativeFont; stdWidthFn: ((code: number) => number) | null }
  >();
  private currentFont: {
    decoder: FontDecoder;
    css: NativeFont;
    stdWidthFn: ((code: number) => number) | null;
  } | null = null;
  private recursionDepth = 0;

  // Element collection state
  private elements: PageElement[] = [];
  private elementId = 0;
  private opIndex = 0;

  // Graphics state tracking for element extraction
  private ctm: number[] = [1, 0, 0, 1, 0, 0];
  private ctmStack: number[][] = [];
  private textMatrix: number[] = [1, 0, 0, 1, 0, 0];
  private textLineMatrix: number[] = [1, 0, 0, 1, 0, 0];
  private fontSize = 0;
  private textLeading = 0;
  private fontName = '';
  private fillColor: Color = { r: 0, g: 0, b: 0 };
  private strokeColor: Color = { r: 0, g: 0, b: 0 };
  private lineWidth = 1;

  // Path accumulation
  private pathOps: Array<{ op: string; args: number[] }> = [];
  private pathStartOpIndex = 0;
  private pathMinX = Infinity;
  private pathMinY = Infinity;
  private pathMaxX = -Infinity;
  private pathMaxY = -Infinity;

  private diagnostics?: RenderDiagnosticsCollector;

  constructor(
    resources: COSDictionary | undefined,
    resolve: ObjectResolver,
    opList: OperatorList,
    diagnostics?: RenderDiagnosticsCollector,
  ) {
    this.resources = resources;
    this.resolve = resolve;
    this.opList = opList;
    this.diagnostics = diagnostics;
  }

  getElements(): PageElement[] {
    return this.elements;
  }

  processOperations(operations: CSOperation[]): void {
    for (const op of operations) {
      this.processOp(op);
    }
  }

  // ---- Main dispatch ----

  private processOp(op: CSOperation): void {
    const { operator, operands } = op;
    this.opIndex++;

    switch (operator) {
      // ---- Graphics state ----
      case 'q':
        this.ctmStack.push([...this.ctm]);
        this.opList.addOp(OPS.save);
        break;
      case 'Q':
        if (this.ctmStack.length > 0) this.ctm = this.ctmStack.pop()!;
        this.opList.addOp(OPS.restore);
        break;
      case 'cm': {
        const cmArgs = nums(operands, 6);
        this.ctm = multiplyMatrices(cmArgs, this.ctm);
        this.opList.addOpArgs(OPS.transform, cmArgs);
        break;
      }
      case 'w': {
        const wArgs = nums(operands, 1);
        this.lineWidth = wArgs[0];
        this.opList.addOpArgs(OPS.setLineWidth, wArgs);
        break;
      }
      case 'J':
        this.opList.addOpArgs(OPS.setLineCap, nums(operands, 1));
        break;
      case 'j':
        this.opList.addOpArgs(OPS.setLineJoin, nums(operands, 1));
        break;
      case 'M':
        this.opList.addOpArgs(OPS.setMiterLimit, nums(operands, 1));
        break;
      case 'd':
        this.handleSetDash(operands);
        break;
      case 'ri':
        break; // Rendering intent — no canvas equivalent
      case 'i':
        break; // Flatness — no canvas equivalent
      case 'gs':
        this.handleExtGState(operands);
        break;

      // ---- Path construction ----
      case 'm': {
        const mArgs = nums(operands, 2);
        this.pathOps = [{ op: 'm', args: mArgs }];
        this.pathStartOpIndex = this.opIndex;
        this.pathMinX = mArgs[0];
        this.pathMinY = mArgs[1];
        this.pathMaxX = mArgs[0];
        this.pathMaxY = mArgs[1];
        this.opList.addOpArgs(OPS.moveTo, mArgs);
        break;
      }
      case 'l': {
        const lArgs = nums(operands, 2);
        this.pathOps.push({ op: 'l', args: lArgs });
        this.updatePathBounds(lArgs[0], lArgs[1]);
        this.opList.addOpArgs(OPS.lineTo, lArgs);
        break;
      }
      case 'c': {
        const cArgs = nums(operands, 6);
        this.pathOps.push({ op: 'c', args: cArgs });
        this.updatePathBounds(cArgs[0], cArgs[1]);
        this.updatePathBounds(cArgs[2], cArgs[3]);
        this.updatePathBounds(cArgs[4], cArgs[5]);
        this.opList.addOpArgs(OPS.curveTo, cArgs);
        break;
      }
      case 'v': {
        const vArgs = nums(operands, 4);
        this.pathOps.push({ op: 'v', args: vArgs });
        this.updatePathBounds(vArgs[0], vArgs[1]);
        this.updatePathBounds(vArgs[2], vArgs[3]);
        this.opList.addOpArgs(OPS.curveTo2, vArgs);
        break;
      }
      case 'y': {
        const yArgs = nums(operands, 4);
        this.pathOps.push({ op: 'y', args: yArgs });
        this.updatePathBounds(yArgs[0], yArgs[1]);
        this.updatePathBounds(yArgs[2], yArgs[3]);
        this.opList.addOpArgs(OPS.curveTo3, yArgs);
        break;
      }
      case 'h':
        this.pathOps.push({ op: 'h', args: [] });
        this.opList.addOp(OPS.closePath);
        break;
      case 're': {
        const reArgs = nums(operands, 4);
        this.pathOps.push({ op: 're', args: reArgs });
        const [rx, ry, rw, rh] = reArgs;
        this.updatePathBounds(rx, ry);
        this.updatePathBounds(rx + rw, ry + rh);
        if (this.pathOps.length === 1) {
          // First path op — set start index
          this.pathStartOpIndex = this.opIndex;
          this.pathMinX = Math.min(rx, rx + rw);
          this.pathMinY = Math.min(ry, ry + rh);
          this.pathMaxX = Math.max(rx, rx + rw);
          this.pathMaxY = Math.max(ry, ry + rh);
        }
        this.opList.addOpArgs(OPS.rectangle, reArgs);
        break;
      }

      // ---- Path painting ----
      case 'S':
        this.emitPathElement(operator);
        this.opList.addOp(OPS.stroke);
        break;
      case 's':
        this.emitPathElement(operator);
        this.opList.addOp(OPS.closeStroke);
        break;
      case 'f':
      case 'F':
        this.emitPathElement(operator);
        this.opList.addOp(OPS.fill);
        break;
      case 'f*':
        this.emitPathElement(operator);
        this.opList.addOp(OPS.eoFill);
        break;
      case 'B':
        this.emitPathElement(operator);
        this.opList.addOp(OPS.fillStroke);
        break;
      case 'B*':
        this.emitPathElement(operator);
        this.opList.addOp(OPS.eoFillStroke);
        break;
      case 'b':
        this.emitPathElement(operator);
        this.opList.addOp(OPS.closeFillStroke);
        break;
      case 'b*':
        this.emitPathElement(operator);
        this.opList.addOp(OPS.closeEOFillStroke);
        break;
      case 'n':
        // endPath (no paint / clip-only) — don't emit element
        this.pathOps = [];
        this.pathMinX = Infinity;
        this.pathMinY = Infinity;
        this.pathMaxX = -Infinity;
        this.pathMaxY = -Infinity;
        this.opList.addOp(OPS.endPath);
        break;

      // ---- Clipping ----
      case 'W':
        this.opList.addOp(OPS.clip);
        break;
      case 'W*':
        this.opList.addOp(OPS.eoClip);
        break;

      // ---- Text ----
      case 'BT':
        this.textMatrix = identityMatrix();
        this.textLineMatrix = identityMatrix();
        this.opList.addOp(OPS.beginText);
        break;
      case 'ET':
        this.opList.addOp(OPS.endText);
        break;
      case 'Tc':
        this.opList.addOpArgs(OPS.setCharSpacing, nums(operands, 1));
        break;
      case 'Tw':
        this.opList.addOpArgs(OPS.setWordSpacing, nums(operands, 1));
        break;
      case 'Tz':
        this.opList.addOpArgs(OPS.setHScale, nums(operands, 1));
        break;
      case 'TL': {
        const tlArgs = nums(operands, 1);
        this.textLeading = tlArgs[0];
        this.opList.addOpArgs(OPS.setLeading, tlArgs);
        break;
      }
      case 'Tf':
        this.handleSetFont(operands);
        break;
      case 'Tr':
        this.opList.addOpArgs(OPS.setTextRenderingMode, nums(operands, 1));
        break;
      case 'Ts':
        this.opList.addOpArgs(OPS.setTextRise, nums(operands, 1));
        break;
      case 'Td': {
        const tdArgs = nums(operands, 2);
        const tdTranslation: number[] = [1, 0, 0, 1, tdArgs[0], tdArgs[1]];
        this.textLineMatrix = multiplyMatrices(tdTranslation, this.textLineMatrix);
        this.textMatrix = [...this.textLineMatrix];
        this.opList.addOpArgs(OPS.moveText, tdArgs);
        break;
      }
      case 'TD': {
        const tdBigArgs = nums(operands, 2);
        this.textLeading = -tdBigArgs[1];
        const tdBigTranslation: number[] = [1, 0, 0, 1, tdBigArgs[0], tdBigArgs[1]];
        this.textLineMatrix = multiplyMatrices(tdBigTranslation, this.textLineMatrix);
        this.textMatrix = [...this.textLineMatrix];
        this.opList.addOpArgs(OPS.setLeadingMoveText, tdBigArgs);
        break;
      }
      case 'Tm': {
        const tmArgs = nums(operands, 6);
        this.textMatrix = [...tmArgs];
        this.textLineMatrix = [...tmArgs];
        this.opList.addOpArgs(OPS.setTextMatrix, tmArgs);
        break;
      }
      case 'T*': {
        const tStarTranslation: number[] = [1, 0, 0, 1, 0, -this.textLeading];
        this.textLineMatrix = multiplyMatrices(tStarTranslation, this.textLineMatrix);
        this.textMatrix = [...this.textLineMatrix];
        this.opList.addOp(OPS.nextLine);
        break;
      }
      case 'Tj':
        this.handleShowText(operands);
        break;
      case 'TJ':
        this.handleShowSpacedText(operands);
        break;
      case "'":
        this.handleNextLineShowText(operands);
        break;
      case '"':
        this.handleNextLineSetSpacingShowText(operands);
        break;

      // ---- Color (device color spaces) ----
      case 'G': {
        const gStrokeArgs = nums(operands, 1);
        this.strokeColor = { r: gStrokeArgs[0], g: gStrokeArgs[0], b: gStrokeArgs[0] };
        this.opList.addOpArgs(OPS.setStrokeGray, gStrokeArgs);
        break;
      }
      case 'g': {
        const gFillArgs = nums(operands, 1);
        this.fillColor = { r: gFillArgs[0], g: gFillArgs[0], b: gFillArgs[0] };
        this.opList.addOpArgs(OPS.setFillGray, gFillArgs);
        break;
      }
      case 'RG': {
        const rgStrokeArgs = nums(operands, 3);
        this.strokeColor = { r: rgStrokeArgs[0], g: rgStrokeArgs[1], b: rgStrokeArgs[2] };
        this.opList.addOpArgs(OPS.setStrokeRGBColor, rgStrokeArgs);
        break;
      }
      case 'rg': {
        const rgFillArgs = nums(operands, 3);
        this.fillColor = { r: rgFillArgs[0], g: rgFillArgs[1], b: rgFillArgs[2] };
        this.opList.addOpArgs(OPS.setFillRGBColor, rgFillArgs);
        break;
      }
      case 'K': {
        const kStrokeArgs = nums(operands, 4);
        this.strokeColor = cmykToRgb(
          kStrokeArgs[0],
          kStrokeArgs[1],
          kStrokeArgs[2],
          kStrokeArgs[3]
        );
        this.opList.addOpArgs(OPS.setStrokeCMYKColor, kStrokeArgs);
        break;
      }
      case 'k': {
        const kFillArgs = nums(operands, 4);
        this.fillColor = cmykToRgb(kFillArgs[0], kFillArgs[1], kFillArgs[2], kFillArgs[3]);
        this.opList.addOpArgs(OPS.setFillCMYKColor, kFillArgs);
        break;
      }
      case 'CS':
        break; // Color space set — tracked for SC/sc
      case 'cs':
        break;
      case 'SC':
      case 'SCN':
        this.handleSetColor(operands, true);
        break;
      case 'sc':
      case 'scn':
        this.handleSetColor(operands, false);
        break;

      // ---- XObjects ----
      case 'Do':
        this.handleDo(operands);
        break;

      // ---- Inline images ----
      case 'BI':
        this.handleInlineImage(operands);
        break;

      // ---- Marked content ----
      case 'BMC':
        this.opList.addOpArgs(OPS.beginMarkedContent, [nameStr(operands, 0)]);
        break;
      case 'BDC':
        this.opList.addOpArgs(OPS.beginMarkedContentProps, [nameStr(operands, 0), null]);
        break;
      case 'EMC':
        this.opList.addOp(OPS.endMarkedContent);
        break;
      case 'MP':
        this.opList.addOpArgs(OPS.markPoint, [nameStr(operands, 0)]);
        break;
      case 'DP':
        this.opList.addOpArgs(OPS.markPointProps, [nameStr(operands, 0), null]);
        break;

      // ---- Compatibility ----
      case 'BX':
        break; // Begin compatibility — no-op
      case 'EX':
        break; // End compatibility — no-op

      // ---- Shading ----
      case 'sh':
        this.handleShading(operands);
        break;

      // ---- Type 3 font ----
      case 'd0':
        break; // setCharWidth — Phase 5
      case 'd1':
        break; // setCharWidthAndBounds — Phase 5

      default:
        break; // Unknown operator — skip silently
    }
  }

  /** Update path bounding box with a new point. */
  private updatePathBounds(x: number, y: number): void {
    if (x < this.pathMinX) this.pathMinX = x;
    if (y < this.pathMinY) this.pathMinY = y;
    if (x > this.pathMaxX) this.pathMaxX = x;
    if (y > this.pathMaxY) this.pathMaxY = y;
  }

  /**
   * Detect m/l/l/l/h pattern as a rectangle.
   * Returns true if the path is: moveTo, lineTo, lineTo, lineTo, closePath
   * and the 4 points form an axis-aligned rectangle.
   */
  private isRectanglePath(): boolean {
    if (this.pathOps.length !== 5) return false;
    if (this.pathOps[0].op !== 'm') return false;
    if (this.pathOps[1].op !== 'l') return false;
    if (this.pathOps[2].op !== 'l') return false;
    if (this.pathOps[3].op !== 'l') return false;
    if (this.pathOps[4].op !== 'h') return false;

    // Check if points form an axis-aligned rectangle:
    // exactly 2 unique X values and 2 unique Y values among the 4 points
    const [x0, y0] = this.pathOps[0].args;
    const [x1, y1] = this.pathOps[1].args;
    const [x2, y2] = this.pathOps[2].args;
    const [x3, y3] = this.pathOps[3].args;
    const xs = new Set([x0, x1, x2, x3]);
    const ys = new Set([y0, y1, y2, y3]);
    return xs.size === 2 && ys.size === 2;
  }

  /** Emit a TextElement from decoded glyphs at the current text position. */
  private emitTextElement(glyphs: Glyph[]): void {
    if (glyphs.length === 0) return;

    // Compute text string and advance width
    let text = '';
    let totalWidth = 0;
    for (const g of glyphs) {
      text += g.unicode;
      totalWidth += g.width;
    }
    if (text.trim().length === 0) return; // skip whitespace-only runs

    // Scale glyph-unit width to user space: (totalWidth / 1000) * fontSize
    const advanceWidth = (totalWidth / 1000) * this.fontSize;

    // Text position in user space: textMatrix * CTM
    const tm = multiplyMatrices(this.textMatrix, this.ctm);
    const [tx, ty] = [tm[4], tm[5]];

    // Approximate font height from fontSize (ascent + descent ~ 1.2 * fontSize)
    const fontHeight = this.fontSize * 1.2;

    // CSS info for the run
    const css = this.currentFont?.css ?? {
      family: 'sans-serif',
      weight: 'normal',
      style: 'normal',
    };

    const element: TextElement = {
      id: `e${this.elementId++}`,
      type: 'text',
      x: tx,
      y: ty,
      width: advanceWidth,
      height: fontHeight,
      rotation: 0,
      opacity: 1,
      index: String(this.elements.length),
      parentId: null,
      locked: false,
      paragraphs: [
        {
          runs: [
            {
              text,
              fontFamily: css.family,
              fontSize: this.fontSize,
              bold: css.weight === 'bold',
              italic: css.style === 'italic',
              color: { ...this.fillColor },
              x: 0,
              y: 0,
              width: advanceWidth,
              height: fontHeight,
            },
          ],
        },
      ],
      source: {
        format: 'pdf' as const,
        opRange: [this.opIndex, this.opIndex],
        ctm: [...this.ctm],
        textMatrix: [...this.textMatrix],
        fontName: this.fontName,
      },
    };
    this.elements.push(element);

    // Advance text matrix by the glyph width
    const advance: number[] = [1, 0, 0, 1, advanceWidth, 0];
    this.textMatrix = multiplyMatrices(advance, this.textMatrix);
  }

  /** Build SVG path data string from accumulated pathOps. */
  private buildSvgPathData(): string {
    const parts: string[] = [];
    for (const op of this.pathOps) {
      switch (op.op) {
        case 'm':
          parts.push(`M${op.args[0]} ${op.args[1]}`);
          break;
        case 'l':
          parts.push(`L${op.args[0]} ${op.args[1]}`);
          break;
        case 'c':
          parts.push(
            `C${op.args[0]} ${op.args[1]} ${op.args[2]} ${op.args[3]} ${op.args[4]} ${op.args[5]}`
          );
          break;
        case 'v':
          parts.push(`C${op.args[0]} ${op.args[1]} ${op.args[2]} ${op.args[3]}`);
          break;
        case 'y':
          parts.push(`C${op.args[0]} ${op.args[1]} ${op.args[2]} ${op.args[3]}`);
          break;
        case 'h':
          parts.push('Z');
          break;
        case 're': {
          const [x, y, w, h] = op.args;
          parts.push(`M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`);
          break;
        }
      }
    }
    return parts.join(' ');
  }

  /** Emit a ShapeElement or PathElement from accumulated path ops, then reset path state. */
  private emitPathElement(operator: string): void {
    if (this.pathOps.length === 0) return;

    // Transform path bounds by CTM
    const [x1, y1] = transformPoint(this.ctm, this.pathMinX, this.pathMinY);
    const [x2, y2] = transformPoint(this.ctm, this.pathMaxX, this.pathMaxY);
    const bx = Math.min(x1, x2);
    const by = Math.min(y1, y2);
    const bw = Math.abs(x2 - x1);
    const bh = Math.abs(y2 - y1);

    // Determine if it's a simple rect or complex path
    const isRect =
      (this.pathOps.length === 1 && this.pathOps[0].op === 're') || this.isRectanglePath();
    const isFilled = ['f', 'F', 'f*', 'B', 'B*', 'b', 'b*'].includes(operator);
    const isStroked = ['S', 's', 'B', 'B*', 'b', 'b*'].includes(operator);

    const element: ShapeElement | PathElement = isRect
      ? {
          id: `e${this.elementId++}`,
          type: 'shape' as const,
          x: bx,
          y: by,
          width: bw,
          height: bh,
          rotation: 0,
          opacity: 1,
          index: String(this.elements.length),
          parentId: null,
          locked: false,
          shapeType: 'rectangle',
          fill: isFilled ? { type: 'solid' as const, color: { ...this.fillColor } } : null,
          stroke: isStroked ? { color: { ...this.strokeColor }, width: this.lineWidth } : null,
          source: {
            format: 'pdf' as const,
            opRange: [this.pathStartOpIndex, this.opIndex],
            ctm: [...this.ctm],
          },
        }
      : {
          id: `e${this.elementId++}`,
          type: 'path' as const,
          x: bx,
          y: by,
          width: bw,
          height: bh,
          rotation: 0,
          opacity: 1,
          index: String(this.elements.length),
          parentId: null,
          locked: false,
          d: this.buildSvgPathData(),
          fill: isFilled ? { type: 'solid' as const, color: { ...this.fillColor } } : null,
          stroke: isStroked ? { color: { ...this.strokeColor }, width: this.lineWidth } : null,
          source: {
            format: 'pdf' as const,
            opRange: [this.pathStartOpIndex, this.opIndex],
            ctm: [...this.ctm],
          },
        };
    this.elements.push(element);

    // Reset path state
    this.pathOps = [];
    this.pathMinX = Infinity;
    this.pathMinY = Infinity;
    this.pathMaxX = -Infinity;
    this.pathMaxY = -Infinity;
  }

  // ================================================================
  // Complex operator handlers
  // ================================================================

  private handleSetDash(operands: CSToken[]): void {
    const dashArray: number[] = [];
    let dashPhase = 0;
    let inArray = false;
    let lastNumberAfterArray: number | undefined;

    for (const t of operands) {
      if (t.type === 'array_start') {
        inArray = true;
        continue;
      }
      if (t.type === 'array_end') {
        inArray = false;
        continue;
      }
      if (t.type === 'number') {
        const v = t.numValue ?? parseFloat(t.value);
        if (inArray) {
          dashArray.push(v);
        } else {
          lastNumberAfterArray = v;
        }
      }
    }

    if (lastNumberAfterArray !== undefined) dashPhase = lastNumberAfterArray;
    this.opList.addOpArgs(OPS.setDash, [dashArray, dashPhase]);
  }

  private handleExtGState(operands: CSToken[]): void {
    const name = nameStr(operands, 0);
    if (!name || !this.resources) return;

    const extGStateRes = resolveItem(this.resources, 'ExtGState', this.resolve);
    if (!(extGStateRes instanceof COSDictionary)) return;

    const gsDict = resolveItem(extGStateRes, name, this.resolve);
    if (!(gsDict instanceof COSDictionary)) return;

    // Emit individual state ops for each ExtGState parameter
    const lw = gsDict.getItem('LW');
    if (lw && isNumeric(lw)) this.opList.addOpArgs(OPS.setLineWidth, [numVal(lw)]);

    const lc = gsDict.getItem('LC');
    if (lc && isNumeric(lc)) this.opList.addOpArgs(OPS.setLineCap, [numVal(lc)]);

    const lj = gsDict.getItem('LJ');
    if (lj && isNumeric(lj)) this.opList.addOpArgs(OPS.setLineJoin, [numVal(lj)]);

    const ml = gsDict.getItem('ML');
    if (ml && isNumeric(ml)) this.opList.addOpArgs(OPS.setMiterLimit, [numVal(ml)]);

    // Alpha (stroke and fill)
    const CA = gsDict.getItem('CA');
    const ca = gsDict.getItem('ca');
    const bm = gsDict.getCOSName('BM');
    if ((CA && isNumeric(CA)) || (ca && isNumeric(ca)) || bm) {
      const gstate = new Map<string, any>();
      if (CA && isNumeric(CA)) gstate.set('strokeAlpha', numVal(CA));
      if (ca && isNumeric(ca)) gstate.set('fillAlpha', numVal(ca));
      if (bm) gstate.set('globalCompositeOperation', blendModeToCSS(bm.getName()));
      this.opList.addOpArgs(OPS.setGState, [gstate]);
    }
  }

  // ---- Font ----

  private handleSetFont(operands: CSToken[]): void {
    const fontNameVal = nameStr(operands, 0);
    const fontSizeVal = num(operands, 0); // first (and only) number token in Tf operands
    if (!fontNameVal) return;

    // Track for element extraction
    this.fontName = fontNameVal;
    this.fontSize = fontSizeVal;

    let fontInfo = this.fontCache.get(fontNameVal);
    if (!fontInfo) {
      fontInfo = this.resolveFont(fontNameVal);
      if (fontInfo) this.fontCache.set(fontNameVal, fontInfo);
    }

    this.currentFont = fontInfo ?? undefined;
    const css = fontInfo?.css ?? {
      family: 'Helvetica, Arial, sans-serif',
      weight: 'normal',
      style: 'normal',
    };
    const embeddedFont = fontInfo?.extractedFont ?? undefined;
    this.opList.addOpArgs(OPS.setFont, [fontNameVal, fontSizeVal, css, embeddedFont]);
  }

  private resolveFont(
    fontName: string
  ): {
    decoder: FontDecoder;
    css: NativeFont;
    stdWidthFn: ((code: number) => number) | null;
    extractedFont: ExtractedFont | undefined;
  } | null {
    if (!this.resources) return null;

    const fontRes = resolveItem(this.resources, 'Font', this.resolve);
    if (!(fontRes instanceof COSDictionary)) return null;

    const fontDict = resolveItem(fontRes, fontName, this.resolve);
    if (!(fontDict instanceof COSDictionary)) return null;

    try {
      const decoder = buildFontDecoder(fontDict, this.resolve);
      const css = cssForPdfFont(decoder.fontName);
      const stdWidthFn = buildStdWidthFn(decoder.fontName);

      // Extract embedded font program (if present)
      let extractedFont: ExtractedFont | undefined;
      try {
        extractedFont = extractEmbeddedFont(fontDict, this.resolve);
      } catch {
        // Non-critical — fall back to CSS fonts
      }

      return { decoder, css, stdWidthFn, extractedFont };
    } catch (err) {
      this.diagnostics?.warn('font', `Failed to build font decoder for "${fontName}"`, {
        error: String(err),
      });
      return null;
    }
  }

  // ---- Text rendering ----

  private handleShowText(operands: CSToken[]): void {
    if (operands.length === 0) return;
    const glyphs = this.decodeTextToken(operands[0]);
    this.opList.addOpArgs(OPS.showText, [glyphs]);
    this.emitTextElement(glyphs);
  }

  private handleShowSpacedText(operands: CSToken[]): void {
    // TJ: operands are the array elements (from parseOperations)
    const items: (Glyph | number)[] = [];

    for (const token of operands) {
      if (token.type === 'array_start' || token.type === 'array_end') continue;
      if (token.type === 'number') {
        items.push(token.numValue ?? parseFloat(token.value));
      } else if (token.type === 'string' || token.type === 'hexstring') {
        items.push(...this.decodeTextToken(token));
      }
    }

    this.opList.addOpArgs(OPS.showSpacedText, [items]);

    // Collect all glyphs for element emission
    const glyphs: Glyph[] = [];
    let spacingAdjust = 0; // accumulated numeric spacing (in glyph units)
    for (const item of items) {
      if (typeof item === 'number') {
        // TJ numeric values: negative = advance right, positive = move left
        // Values are in thousandths of a unit of text space
        spacingAdjust -= item;
      } else {
        glyphs.push(item);
      }
    }
    if (glyphs.length > 0) {
      this.emitTextElement(glyphs);
      // Apply TJ spacing adjustment to text matrix (on top of glyph advance
      // already applied by emitTextElement)
      if (spacingAdjust !== 0) {
        const spacingAdvance = (spacingAdjust / 1000) * this.fontSize;
        this.textMatrix = multiplyMatrices([1, 0, 0, 1, spacingAdvance, 0], this.textMatrix);
      }
    }
  }

  private handleNextLineShowText(operands: CSToken[]): void {
    if (operands.length === 0) return;
    // ' is equivalent to T* Tj — advance to next line first
    const tStarTranslation: number[] = [1, 0, 0, 1, 0, -this.textLeading];
    this.textLineMatrix = multiplyMatrices(tStarTranslation, this.textLineMatrix);
    this.textMatrix = [...this.textLineMatrix];
    const glyphs = this.decodeTextToken(operands[0]);
    this.opList.addOpArgs(OPS.nextLineShowText, [glyphs]);
    this.emitTextElement(glyphs);
  }

  private handleNextLineSetSpacingShowText(operands: CSToken[]): void {
    if (operands.length < 3) return;
    const aw = num(operands, 0);
    const ac = num(operands, 1);
    // " is equivalent to: aw Tw, ac Tc, string ' (which is T* Tj)
    // Advance text position to next line
    const tStarTranslation: number[] = [1, 0, 0, 1, 0, -this.textLeading];
    this.textLineMatrix = multiplyMatrices(tStarTranslation, this.textLineMatrix);
    this.textMatrix = [...this.textLineMatrix];
    const glyphs = this.decodeTextToken(operands[2]);
    this.opList.addOpArgs(OPS.nextLineSetSpacingShowText, [aw, ac, glyphs]);
    this.emitTextElement(glyphs);
  }

  private decodeTextToken(token: CSToken): Glyph[] {
    const glyphs: Glyph[] = [];
    const decoder = this.currentFont?.decoder;
    const stdWidthFn = this.currentFont?.stdWidthFn ?? null;

    if (!decoder) {
      // No font resolved — decode as raw ASCII
      const text = token.type === 'hexstring' ? hexToAscii(token.value) : token.value;
      for (const ch of text) {
        glyphs.push({ unicode: ch, width: 500 });
      }
      return glyphs;
    }

    if (token.type === 'hexstring') {
      const hex = token.value;
      const step = decoder.isComposite ? 4 : 2;
      for (let i = 0; i + step - 1 < hex.length; i += step) {
        const chunk = hex.substring(i, i + step);
        const code = parseInt(chunk, 16);
        const unicode = decoder.decodeHex(chunk);
        let width = decoder.getCharWidth(code);
        if (width === 0 && stdWidthFn) width = stdWidthFn(code);
        glyphs.push({ unicode, width });
      }
    } else {
      // Literal string — decode byte by byte
      const bytes = new Uint8Array(token.value.length);
      for (let i = 0; i < token.value.length; i++) {
        bytes[i] = token.value.charCodeAt(i);
      }

      if (decoder.isComposite) {
        for (let i = 0; i + 1 < bytes.length; i += 2) {
          const code = (bytes[i] << 8) | bytes[i + 1];
          const hex = code.toString(16).padStart(4, '0');
          const unicode = decoder.decodeHex(hex);
          let width = decoder.getCharWidth(code);
          if (width === 0 && stdWidthFn) width = stdWidthFn(code);
          glyphs.push({ unicode, width });
        }
      } else {
        for (let i = 0; i < bytes.length; i++) {
          const code = bytes[i];
          const hex = code.toString(16).padStart(2, '0');
          const unicode = decoder.decodeHex(hex);
          let width = decoder.getCharWidth(code);
          if (width === 0 && stdWidthFn) width = stdWidthFn(code);
          glyphs.push({ unicode, width });
        }
      }
    }

    return glyphs;
  }

  // ---- Inline images ----

  private handleInlineImage(operands: CSToken[]): void {
    // Parse inline image dictionary from operands
    // Tokens between BI and ID are key/value pairs
    // Tokens between ID and EI are raw image data (stored as string tokens)
    const params = new Map<string, string | number>();
    let dataBytes: Uint8Array | null = null;

    let i = 0;
    // Parse key/value pairs
    while (i + 1 < operands.length) {
      const keyToken = operands[i];
      const valToken = operands[i + 1];

      if (!keyToken || !valToken) break;

      // Stop when we hit data tokens (after ID)
      if (keyToken.type === 'string' && keyToken.value.length > 10) {
        // This is image data, not a key
        dataBytes = stringToBytes(keyToken.value);
        break;
      }

      const key = expandInlineImageKey(keyToken.value);
      if (valToken.type === 'number') {
        params.set(key, valToken.numValue ?? parseFloat(valToken.value));
      } else {
        params.set(key, expandInlineImageValue(key, valToken.value));
      }
      i += 2;
    }

    // Collect remaining data bytes
    if (!dataBytes) {
      const dataTokens: string[] = [];
      for (let j = i; j < operands.length; j++) {
        if (operands[j].type === 'string' || operands[j].type === 'hexstring') {
          dataTokens.push(operands[j].value);
        }
      }
      if (dataTokens.length > 0) {
        dataBytes = stringToBytes(dataTokens.join(''));
      }
    }

    if (!dataBytes) return;

    const width = typeof params.get('Width') === 'number' ? (params.get('Width') as number) : 0;
    const height = typeof params.get('Height') === 'number' ? (params.get('Height') as number) : 0;
    if (width <= 0 || height <= 0) return;

    const bpc =
      typeof params.get('BitsPerComponent') === 'number'
        ? (params.get('BitsPerComponent') as number)
        : 8;
    const cs = (params.get('ColorSpace') as string) ?? 'DeviceGray';

    // Check for JPEG filter
    const filter = (params.get('Filter') as string) ?? '';
    if (filter === 'DCTDecode' || filter === 'JPXDecode') {
      // Can't easily decode JPEG inline; emit raw with RGBA fallback
      return;
    }

    // Decode pixel data based on color space
    let image: NativeImage | null = null;
    switch (cs) {
      case 'DeviceGray':
      case 'G':
        image = decodeGrayImage(dataBytes, width, height, bpc);
        break;
      case 'DeviceRGB':
      case 'RGB':
        image = decodeRGBImage(dataBytes, width, height);
        break;
      case 'DeviceCMYK':
      case 'CMYK':
        image = decodeCMYKImage(dataBytes, width, height);
        break;
      default:
        // Heuristic
        if (dataBytes.length >= width * height * 3) {
          image = decodeRGBImage(dataBytes, width, height);
        } else if (dataBytes.length >= width * height) {
          image = decodeGrayImage(dataBytes, width, height, 8);
        }
    }

    if (image) {
      this.opList.addOpArgs(OPS.paintInlineImageXObject, [image]);
    }
  }

  // ---- Shading ----

  private handleShading(operands: CSToken[]): void {
    const shadingName = nameStr(operands, 0);
    if (!shadingName || !this.resources) return;

    const shadingRes = resolveItem(this.resources, 'Shading', this.resolve);
    if (!(shadingRes instanceof COSDictionary)) return;

    const shadingDict = resolveItem(shadingRes, shadingName, this.resolve);
    if (!(shadingDict instanceof COSDictionary)) return;

    const shading = decodeShadingPattern(shadingDict, this.resolve);
    if (shading) {
      this.opList.addOpArgs(OPS.shadingFill, [shading]);
    }
  }

  // ---- Color ----

  private handleSetColor(operands: CSToken[], isStroke: boolean): void {
    const components = operands
      .filter((t) => t.type === 'number')
      .map((t) => t.numValue ?? parseFloat(t.value));

    if (components.length === 1) {
      const color: Color = { r: components[0], g: components[0], b: components[0] };
      if (isStroke) this.strokeColor = color;
      else this.fillColor = color;
      this.opList.addOpArgs(isStroke ? OPS.setStrokeGray : OPS.setFillGray, components);
    } else if (components.length === 3) {
      const color: Color = { r: components[0], g: components[1], b: components[2] };
      if (isStroke) this.strokeColor = color;
      else this.fillColor = color;
      this.opList.addOpArgs(isStroke ? OPS.setStrokeRGBColor : OPS.setFillRGBColor, components);
    } else if (components.length === 4) {
      const color = cmykToRgb(components[0], components[1], components[2], components[3]);
      if (isStroke) this.strokeColor = color;
      else this.fillColor = color;
      this.opList.addOpArgs(isStroke ? OPS.setStrokeCMYKColor : OPS.setFillCMYKColor, components);
    } else if (components.length === 0) {
      // Pattern color space — operand is a name, not a number
      const patternName = operands.find((t) => t.type === 'name');
      if (patternName) {
        this.diagnostics?.warn('color', `Pattern color space not implemented: /${patternName.value}`, {
          isStroke,
          operands: operands.map((t) => t.value),
        });
      }
    }
  }

  // ---- XObjects ----

  private handleDo(operands: CSToken[]): void {
    const name = nameStr(operands, 0);
    if (!name || !this.resources) return;

    const xobjRes = resolveItem(this.resources, 'XObject', this.resolve);
    if (!(xobjRes instanceof COSDictionary)) return;

    const xobj = resolveItem(xobjRes, name, this.resolve);
    if (!xobj) return;

    if (xobj instanceof COSStream) {
      const dict = xobj.getDictionary?.() ?? (xobj as unknown as COSDictionary);
      const subtype = dict.getCOSName('Subtype');

      if (subtype?.getName() === 'Form') {
        this.handleFormXObject(xobj, dict);
      } else if (subtype?.getName() === 'Image') {
        this.handleImageXObject(xobj, dict, name);
      }
    }
  }

  private handleFormXObject(stream: COSStream, dict: COSDictionary): void {
    // Guard against infinite recursion (circular form references)
    if (this.recursionDepth > 10) return;

    // Get /Matrix (default = identity)
    let matrix = [1, 0, 0, 1, 0, 0];
    const matrixArr = dict.getItem('Matrix');
    if (matrixArr instanceof COSArray && matrixArr.size() >= 6) {
      matrix = [];
      for (let i = 0; i < 6; i++) matrix.push(cosNum(matrixArr, i));
    }

    // Get /BBox (required by spec)
    let bbox = [0, 0, 1, 1];
    const bboxArr = dict.getItem('BBox');
    if (bboxArr instanceof COSArray && bboxArr.size() >= 4) {
      bbox = [];
      for (let i = 0; i < 4; i++) bbox.push(cosNum(bboxArr, i));
    }

    this.opList.addOpArgs(OPS.paintFormXObjectBegin, [matrix, bbox]);

    // Recursively evaluate the form's content stream
    const data = getDecompressedStreamData(stream);
    if (data && data.length > 0) {
      let formResources = resolveItem(dict, 'Resources', this.resolve) as COSDictionary | undefined;
      if (!(formResources instanceof COSDictionary)) formResources = this.resources;

      const tokens = tokenizeContentStream(data);
      const operations = parseOperations(tokens);

      const formCtx = new EvalContext(formResources, this.resolve, this.opList);
      formCtx.fontCache = new Map(this.fontCache);
      formCtx.recursionDepth = this.recursionDepth + 1;
      // Inherit parent CTM (multiply form matrix with parent CTM)
      formCtx.ctm = multiplyMatrices(matrix, this.ctm);
      // Share element state — form elements go into parent's element list
      formCtx.elements = this.elements;
      formCtx.elementId = this.elementId;
      formCtx.processOperations(operations);
      // Sync element ID back to parent
      this.elementId = formCtx.elementId;
    }

    this.opList.addOp(OPS.paintFormXObjectEnd);
  }

  private handleImageXObject(stream: COSStream, dict: COSDictionary, xobjName?: string): void {
    const width = dict.getInt('Width', 0);
    const height = dict.getInt('Height', 0);
    if (width <= 0 || height <= 0) return;

    try {
      const image = decodeImageXObject(stream, dict, this.resolve);
      if (image) {
        this.opList.addOpArgs(OPS.paintImageXObject, [image]);

        // Emit ImageElement — image is drawn in unit square [0,0,1,1] mapped by CTM
        const [ix, iy] = transformPoint(this.ctm, 0, 0);
        const [ix2, iy2] = transformPoint(this.ctm, 1, 1);
        const imgElement: ImageElement = {
          id: `e${this.elementId++}`,
          type: 'image',
          x: Math.min(ix, ix2),
          y: Math.min(iy, iy2),
          width: Math.abs(ix2 - ix),
          height: Math.abs(iy2 - iy),
          rotation: 0,
          opacity: 1,
          index: String(this.elements.length),
          parentId: null,
          locked: false,
          imageRef: xobjName ?? '',
          mimeType: image.isJpeg ? 'image/jpeg' : 'image/png',
          objectFit: 'fill',
          source: {
            format: 'pdf' as const,
            opRange: [this.opIndex, this.opIndex],
            ctm: [...this.ctm],
          },
        };
        this.elements.push(imgElement);
      }
    } catch (err) {
      this.diagnostics?.warn('image', `Failed to decode image XObject "${xobjName ?? 'unknown'}"`, {
        error: String(err),
        width,
        height,
      });
    }
  }
}

// ================================================================
// Image decoding
// ================================================================

function decodeImageXObject(
  stream: COSStream,
  dict: COSDictionary,
  resolve: ObjectResolver
): NativeImage | null {
  const width = dict.getInt('Width', 0);
  const height = dict.getInt('Height', 0);
  if (width <= 0 || height <= 0) return null;

  // Check if JPEG — pass through raw bytes for canvas to decode
  const filters = getStreamFilters(dict);
  const lastFilter = filters[filters.length - 1] ?? '';
  if (lastFilter === 'DCTDecode' || lastFilter === 'JPXDecode') {
    const image: NativeImage = { width, height, data: stream.getData(), isJpeg: true };
    // Store SMask data for JPEG images — will be applied after browser pre-decode
    // converts the JPEG to RGBA pixels in preDecodeJpegs()
    const smaskData = extractSMask(dict, resolve, width, height);
    if (smaskData) {
      image.smaskData = smaskData;
    }
    return image;
  }

  // Decompress the stream
  let data = getDecompressedStreamData(stream);
  if (!data || data.length === 0) return null;

  const bpc = dict.getInt('BitsPerComponent', 8);
  const cs = resolveColorSpace(dict, resolve);

  // Apply /Decode array if present — remaps raw pixel values to color component values
  const decodeItem = dict.getItem('Decode');
  if (decodeItem instanceof COSArray && decodeItem.size() >= 2) {
    const decode: number[] = [];
    for (let i = 0; i < decodeItem.size(); i++) {
      const v = decodeItem.get(i);
      if (v instanceof COSFloat || v instanceof COSInteger) {
        decode.push(v.getValue());
      } else {
        decode.push(i % 2 === 0 ? 0 : 1); // default [0, 1] per component
      }
    }
    // Check if Decode differs from default [0,1,0,1,...] — skip remap if default
    const isNonDefault = decode.some((v, i) => (i % 2 === 0 ? v !== 0 : v !== 1));
    if (isNonDefault) {
      const maxVal = (1 << bpc) - 1;
      const numComponents = Math.floor(decode.length / 2);
      const newData = new Uint8Array(data.length);
      const pixelCount = width * height;
      if (bpc === 8 && numComponents > 0) {
        for (let p = 0; p < pixelCount; p++) {
          for (let c = 0; c < numComponents; c++) {
            const idx = p * numComponents + c;
            if (idx < data.length) {
              const dMin = decode[2 * c];
              const dMax = decode[2 * c + 1];
              const mapped = dMin + (data[idx] / maxVal) * (dMax - dMin);
              newData[idx] = Math.round(Math.max(0, Math.min(1, mapped)) * 255);
            }
          }
        }
        data = newData;
      }
    }
  }

  // Image mask (1-bit)
  const imageMaskVal = dict.getItem('ImageMask');
  const isImageMask =
    (imageMaskVal instanceof COSName && imageMaskVal.getName() === 'true') ||
    (imageMaskVal && 'booleanValue' in imageMaskVal && (imageMaskVal as any).booleanValue === true);

  if (isImageMask || (bpc === 1 && cs === 'DeviceGray')) {
    return decodeImageMask(data, width, height);
  }

  let image: NativeImage | null;
  switch (cs) {
    case 'DeviceGray':
    case 'CalGray':
      image = decodeGrayImage(data, width, height, bpc);
      break;
    case 'DeviceRGB':
    case 'CalRGB':
      image = decodeRGBImage(data, width, height);
      break;
    case 'DeviceCMYK':
      image = decodeCMYKImage(data, width, height);
      break;
    case 'Indexed':
      image = decodeIndexedImage(data, width, height, bpc, dict, resolve);
      break;
    case 'ICCBased2':
      // 2-component ICC profile — use first channel as gray, skip second
      image = decode2ComponentImage(data, width, height);
      break;
    case 'Separation':
    case 'DeviceN':
      image = decodeGrayImage(data, width, height, bpc);
      break;
    default:
      if (data.length >= width * height * 3) image = decodeRGBImage(data, width, height);
      else if (data.length >= width * height) image = decodeGrayImage(data, width, height, 8);
      else image = null;
  }

  // Extract SMask (soft mask) if present — applies transparency
  if (image && !image.isJpeg) {
    const smaskData = extractSMask(dict, resolve, image.width, image.height);
    if (smaskData) {
      // Apply SMask as alpha channel directly to the RGBA data
      for (let i = 0; i < image.width * image.height; i++) {
        image.data[i * 4 + 3] = smaskData[i];
      }
    }
  }

  return image;
}

function getStreamFilters(dict: COSDictionary): string[] {
  const filter = dict.getItem('Filter');
  if (filter instanceof COSName) return [filter.getName()];
  if (filter instanceof COSArray) {
    const result: string[] = [];
    for (let i = 0; i < filter.size(); i++) {
      const f = filter.get(i);
      if (f instanceof COSName) result.push(f.getName());
    }
    return result;
  }
  return [];
}

function resolveColorSpace(dict: COSDictionary, resolve: ObjectResolver): string {
  let cs: COSBase | undefined = dict.getItem('ColorSpace');
  if (cs instanceof COSObjectReference) cs = resolve(cs);

  if (cs instanceof COSName) return cs.getName();

  if (cs instanceof COSArray && cs.size() > 0) {
    let first: COSBase | undefined = cs.get(0);
    if (first instanceof COSObjectReference) first = resolve(first);
    if (first instanceof COSName) {
      const name = first.getName();
      if (name === 'ICCBased' && cs.size() > 1) {
        let iccObj: COSBase | undefined = cs.get(1);
        if (iccObj instanceof COSObjectReference) iccObj = resolve(iccObj);
        if (iccObj instanceof COSDictionary || iccObj instanceof COSStream) {
          const iccDict = iccObj instanceof COSStream ? iccObj.getDictionary() : iccObj;
          const n = iccDict.getInt('N', 3);
          if (n === 1) return 'DeviceGray';
          if (n === 2) return 'ICCBased2'; // 2-component ICC (rare — approximate as gray)
          if (n === 3) return 'DeviceRGB';
          if (n === 4) return 'DeviceCMYK';
        }
      }
      // Indexed color space: [/Indexed base hival lookup]
      if (name === 'Indexed' && cs.size() >= 4) {
        return 'Indexed';
      }
      // Separation/DeviceN — approximate as DeviceGray
      if (name === 'Separation') return 'Separation';
      if (name === 'DeviceN') return 'DeviceN';
      return name;
    }
  }

  return 'DeviceGray';
}

/**
 * Extract and decode the /SMask (soft mask) stream from an image dictionary.
 * Returns a grayscale alpha array (one byte per pixel), or undefined if no SMask.
 */
function extractSMask(
  dict: COSDictionary,
  resolve: ObjectResolver,
  imgWidth: number,
  imgHeight: number,
): Uint8Array | undefined {
  let smaskRef: COSBase | undefined = dict.getItem('SMask');
  if (!smaskRef) return undefined;
  if (smaskRef instanceof COSObjectReference) smaskRef = resolve(smaskRef);
  if (!(smaskRef instanceof COSStream)) return undefined;

  const smaskDict = smaskRef.getDictionary();
  const smaskWidth = smaskDict.getInt('Width', imgWidth);
  const smaskHeight = smaskDict.getInt('Height', imgHeight);
  const smaskBpc = smaskDict.getInt('BitsPerComponent', 8);

  const smaskData = getDecompressedStreamData(smaskRef);
  if (!smaskData || smaskData.length === 0) return undefined;

  // The SMask is a grayscale image — extract one alpha value per pixel
  const pixelCount = smaskWidth * smaskHeight;
  const alpha = new Uint8Array(pixelCount);
  const maxVal = (1 << smaskBpc) - 1;

  if (smaskBpc === 8) {
    for (let i = 0; i < pixelCount && i < smaskData.length; i++) {
      alpha[i] = smaskData[i];
    }
  } else if (smaskBpc === 4) {
    const rowBytes = Math.ceil((smaskWidth * 4) / 8);
    for (let y = 0; y < smaskHeight; y++) {
      for (let x = 0; x < smaskWidth; x++) {
        const bitOffset = x * 4;
        const byteIdx = y * rowBytes + Math.floor(bitOffset / 8);
        const shift = 4 - (bitOffset % 8);
        const val = (smaskData[byteIdx] >> shift) & 0x0f;
        alpha[y * smaskWidth + x] = Math.round((val / maxVal) * 255);
      }
    }
  } else if (smaskBpc === 2) {
    const rowBytes = Math.ceil((smaskWidth * 2) / 8);
    for (let y = 0; y < smaskHeight; y++) {
      for (let x = 0; x < smaskWidth; x++) {
        const bitOffset = x * 2;
        const byteIdx = y * rowBytes + Math.floor(bitOffset / 8);
        const shift = 6 - (bitOffset % 8);
        const val = (smaskData[byteIdx] >> shift) & 0x03;
        alpha[y * smaskWidth + x] = Math.round((val / maxVal) * 255);
      }
    }
  } else {
    // Generic fallback
    for (let i = 0; i < pixelCount && i < smaskData.length; i++) {
      alpha[i] = Math.round((smaskData[i] / maxVal) * 255);
    }
  }

  // If SMask dimensions differ from image, resample using nearest-neighbor
  if (smaskWidth !== imgWidth || smaskHeight !== imgHeight) {
    const resampled = new Uint8Array(imgWidth * imgHeight);
    for (let dy = 0; dy < imgHeight; dy++) {
      for (let dx = 0; dx < imgWidth; dx++) {
        const sx = Math.min(Math.floor((dx / imgWidth) * smaskWidth), smaskWidth - 1);
        const sy = Math.min(Math.floor((dy / imgHeight) * smaskHeight), smaskHeight - 1);
        resampled[dy * imgWidth + dx] = alpha[sy * smaskWidth + sx];
      }
    }
    return resampled;
  }

  return alpha;
}

function decodeImageMask(data: Uint8Array, width: number, height: number): NativeImage {
  const rgba = new Uint8Array(width * height * 4);
  let srcByte = 0;
  let srcBit = 7;
  const rowBytes = Math.ceil(width / 8);

  for (let y = 0; y < height; y++) {
    srcByte = y * rowBytes;
    srcBit = 7;
    for (let x = 0; x < width; x++) {
      const bit = (data[srcByte] >> srcBit) & 1;
      const idx = (y * width + x) * 4;
      // Image mask: 0 = painted (opaque), 1 = masked (transparent)
      rgba[idx] = 0;
      rgba[idx + 1] = 0;
      rgba[idx + 2] = 0;
      rgba[idx + 3] = bit === 0 ? 255 : 0;
      srcBit--;
      if (srcBit < 0) {
        srcBit = 7;
        srcByte++;
      }
    }
  }

  return { width, height, data: rgba, isJpeg: false };
}

/**
 * Decode a 2-component image (e.g. ICCBased N=2).
 * Uses first component as grayscale luminance, ignores second.
 */
function decode2ComponentImage(data: Uint8Array, width: number, height: number): NativeImage {
  const rgba = new Uint8Array(width * height * 4);
  const pixelCount = width * height;

  for (let i = 0; i < pixelCount; i++) {
    const gray = data[i * 2] ?? 0;
    rgba[i * 4] = gray;
    rgba[i * 4 + 1] = gray;
    rgba[i * 4 + 2] = gray;
    rgba[i * 4 + 3] = 255;
  }

  return { width, height, data: rgba, isJpeg: false };
}

function decodeGrayImage(
  data: Uint8Array,
  width: number,
  height: number,
  bpc: number
): NativeImage {
  const rgba = new Uint8Array(width * height * 4);
  const maxVal = (1 << bpc) - 1;
  const pixelCount = width * height;

  if (bpc === 8) {
    // Fast path: one byte per pixel
    for (let i = 0; i < pixelCount && i < data.length; i++) {
      const gray = data[i];
      rgba[i * 4] = gray;
      rgba[i * 4 + 1] = gray;
      rgba[i * 4 + 2] = gray;
      rgba[i * 4 + 3] = 255;
    }
  } else if (bpc === 4) {
    // 2 pixels per byte (high nibble first)
    const rowBytes = Math.ceil((width * 4) / 8);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bitOffset = x * 4;
        const byteIdx = y * rowBytes + Math.floor(bitOffset / 8);
        const shift = 4 - (bitOffset % 8);
        const val = (data[byteIdx] >> shift) & 0x0f;
        const gray = Math.round((val / maxVal) * 255);
        const idx = (y * width + x) * 4;
        rgba[idx] = gray;
        rgba[idx + 1] = gray;
        rgba[idx + 2] = gray;
        rgba[idx + 3] = 255;
      }
    }
  } else if (bpc === 2) {
    // 4 pixels per byte
    const rowBytes = Math.ceil((width * 2) / 8);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bitOffset = x * 2;
        const byteIdx = y * rowBytes + Math.floor(bitOffset / 8);
        const shift = 6 - (bitOffset % 8);
        const val = (data[byteIdx] >> shift) & 0x03;
        const gray = Math.round((val / maxVal) * 255);
        const idx = (y * width + x) * 4;
        rgba[idx] = gray;
        rgba[idx + 1] = gray;
        rgba[idx + 2] = gray;
        rgba[idx + 3] = 255;
      }
    }
  } else {
    // Generic fallback (bpc=16, etc.) — read one byte per pixel
    for (let i = 0; i < pixelCount && i < data.length; i++) {
      const gray = Math.round((data[i] / maxVal) * 255);
      rgba[i * 4] = gray;
      rgba[i * 4 + 1] = gray;
      rgba[i * 4 + 2] = gray;
      rgba[i * 4 + 3] = 255;
    }
  }

  return { width, height, data: rgba, isJpeg: false };
}

function decodeRGBImage(data: Uint8Array, width: number, height: number): NativeImage {
  const rgba = new Uint8Array(width * height * 4);
  const pixelCount = width * height;

  for (let i = 0; i < pixelCount; i++) {
    rgba[i * 4] = data[i * 3] ?? 0;
    rgba[i * 4 + 1] = data[i * 3 + 1] ?? 0;
    rgba[i * 4 + 2] = data[i * 3 + 2] ?? 0;
    rgba[i * 4 + 3] = 255;
  }

  return { width, height, data: rgba, isJpeg: false };
}

function decodeIndexedImage(
  data: Uint8Array,
  width: number,
  height: number,
  bpc: number,
  dict: COSDictionary,
  resolve: ObjectResolver
): NativeImage | null {
  // Indexed color space: [/Indexed base hival lookup]
  let csArr = dict.getItem('ColorSpace');
  if (csArr instanceof COSObjectReference) csArr = resolve(csArr);
  if (!(csArr instanceof COSArray) || csArr.size() < 4) return null;

  // base color space (to determine components per color)
  let baseCS = csArr.get(1);
  if (baseCS instanceof COSObjectReference) baseCS = resolve(baseCS);
  let componentsPerColor = 3; // default RGB
  if (baseCS instanceof COSName) {
    const baseName = baseCS.getName();
    if (baseName === 'DeviceGray' || baseName === 'CalGray') componentsPerColor = 1;
    else if (baseName === 'DeviceCMYK') componentsPerColor = 4;
  } else if (baseCS instanceof COSArray && baseCS.size() > 0) {
    let firstBase = baseCS.get(0);
    if (firstBase instanceof COSObjectReference) firstBase = resolve(firstBase);
    if (firstBase instanceof COSName) {
      const n = firstBase.getName();
      if (n === 'ICCBased' && baseCS.size() > 1) {
        let iccObj = baseCS.get(1);
        if (iccObj instanceof COSObjectReference) iccObj = resolve(iccObj);
        if (iccObj instanceof COSDictionary || iccObj instanceof COSStream) {
          const iccDict2 = iccObj instanceof COSStream ? iccObj.getDictionary() : iccObj;
          const nc = iccDict2.getInt('N', 3);
          componentsPerColor = nc;
        }
      }
    }
  }

  // hival = max index
  const hivalEntry = csArr.get(2);
  const hival =
    hivalEntry instanceof COSInteger
      ? hivalEntry.getValue()
      : hivalEntry instanceof COSFloat
        ? Math.floor(hivalEntry.getValue())
        : 255;

  // lookup table: string or stream
  let lookupEntry = csArr.get(3);
  if (lookupEntry instanceof COSObjectReference) lookupEntry = resolve(lookupEntry);

  let lookupData: Uint8Array;
  if (lookupEntry instanceof COSStream) {
    lookupData = getDecompressedStreamData(lookupEntry);
  } else if (lookupEntry && 'getData' in lookupEntry) {
    lookupData = (lookupEntry as any).getData();
  } else {
    // Could be a string — try to extract bytes
    return null;
  }

  if (!lookupData || lookupData.length === 0) return null;

  // Build palette: index → [R, G, B]
  const palette: Array<[number, number, number]> = [];
  for (let idx = 0; idx <= hival; idx++) {
    const offset = idx * componentsPerColor;
    let r = 0,
      g = 0,
      b = 0;
    if (componentsPerColor === 1) {
      const gray = lookupData[offset] ?? 0;
      r = g = b = gray;
    } else if (componentsPerColor === 3) {
      r = lookupData[offset] ?? 0;
      g = lookupData[offset + 1] ?? 0;
      b = lookupData[offset + 2] ?? 0;
    } else if (componentsPerColor === 4) {
      const c = (lookupData[offset] ?? 0) / 255;
      const m = (lookupData[offset + 1] ?? 0) / 255;
      const y = (lookupData[offset + 2] ?? 0) / 255;
      const k = (lookupData[offset + 3] ?? 0) / 255;
      r = Math.round(255 * (1 - c) * (1 - k));
      g = Math.round(255 * (1 - m) * (1 - k));
      b = Math.round(255 * (1 - y) * (1 - k));
    }
    palette.push([r, g, b]);
  }

  // Decode image: each pixel is an index into the palette
  const rgba = new Uint8Array(width * height * 4);
  const pixelCount = width * height;

  if (bpc === 8) {
    for (let i = 0; i < pixelCount; i++) {
      const idx = Math.min(data[i] ?? 0, hival);
      const [pr, pg, pb] = palette[idx] ?? [0, 0, 0];
      rgba[i * 4] = pr;
      rgba[i * 4 + 1] = pg;
      rgba[i * 4 + 2] = pb;
      rgba[i * 4 + 3] = 255;
    }
  } else if (bpc === 4) {
    for (let i = 0; i < pixelCount; i++) {
      const byteIdx = Math.floor(i / 2);
      const nibble = i % 2 === 0 ? (data[byteIdx] >> 4) & 0x0f : data[byteIdx] & 0x0f;
      const idx = Math.min(nibble, hival);
      const [pr, pg, pb] = palette[idx] ?? [0, 0, 0];
      rgba[i * 4] = pr;
      rgba[i * 4 + 1] = pg;
      rgba[i * 4 + 2] = pb;
      rgba[i * 4 + 3] = 255;
    }
  } else if (bpc === 2) {
    for (let i = 0; i < pixelCount; i++) {
      const byteIdx = Math.floor(i / 4);
      const shift = 6 - (i % 4) * 2;
      const val = (data[byteIdx] >> shift) & 0x03;
      const idx = Math.min(val, hival);
      const [pr, pg, pb] = palette[idx] ?? [0, 0, 0];
      rgba[i * 4] = pr;
      rgba[i * 4 + 1] = pg;
      rgba[i * 4 + 2] = pb;
      rgba[i * 4 + 3] = 255;
    }
  } else if (bpc === 1) {
    for (let i = 0; i < pixelCount; i++) {
      const byteIdx = Math.floor(i / 8);
      const bit = 7 - (i % 8);
      const val = (data[byteIdx] >> bit) & 1;
      const idx = Math.min(val, hival);
      const [pr, pg, pb] = palette[idx] ?? [0, 0, 0];
      rgba[i * 4] = pr;
      rgba[i * 4 + 1] = pg;
      rgba[i * 4 + 2] = pb;
      rgba[i * 4 + 3] = 255;
    }
  } else {
    // Unsupported bpc — fall back to 8-bit
    for (let i = 0; i < pixelCount; i++) {
      const idx = Math.min(data[i] ?? 0, hival);
      const [pr, pg, pb] = palette[idx] ?? [0, 0, 0];
      rgba[i * 4] = pr;
      rgba[i * 4 + 1] = pg;
      rgba[i * 4 + 2] = pb;
      rgba[i * 4 + 3] = 255;
    }
  }

  return { width, height, data: rgba, isJpeg: false };
}

function decodeCMYKImage(data: Uint8Array, width: number, height: number): NativeImage {
  const rgba = new Uint8Array(width * height * 4);
  const pixelCount = width * height;

  for (let i = 0; i < pixelCount; i++) {
    const c = data[i * 4] / 255;
    const m = data[i * 4 + 1] / 255;
    const y = data[i * 4 + 2] / 255;
    const k = data[i * 4 + 3] / 255;
    rgba[i * 4] = Math.round(255 * (1 - c) * (1 - k));
    rgba[i * 4 + 1] = Math.round(255 * (1 - m) * (1 - k));
    rgba[i * 4 + 2] = Math.round(255 * (1 - y) * (1 - k));
    rgba[i * 4 + 3] = 255;
  }

  return { width, height, data: rgba, isJpeg: false };
}

// ================================================================
// Helpers
// ================================================================

function getPageContentData(pageDict: COSDictionary, resolve: ObjectResolver): Uint8Array | null {
  const contents = resolveItem(pageDict, 'Contents', resolve);

  if (contents instanceof COSStream) {
    return getDecompressedStreamData(contents);
  }

  if (contents instanceof COSArray) {
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < contents.size(); i++) {
      let el: COSBase | undefined = contents.get(i);
      if (el instanceof COSObjectReference) el = resolve(el);
      if (el instanceof COSStream) {
        chunks.push(getDecompressedStreamData(el));
        chunks.push(new Uint8Array([0x20])); // space separator
      }
    }
    if (chunks.length === 0) return null;

    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  return null;
}

function getResourcesDict(
  pageDict: COSDictionary,
  resolve: ObjectResolver
): COSDictionary | undefined {
  const resources = resolveItem(pageDict, 'Resources', resolve);
  return resources instanceof COSDictionary ? resources : undefined;
}

function resolveItem(
  dict: COSDictionary,
  key: string,
  resolve: ObjectResolver
): COSBase | undefined {
  let item: COSBase | undefined = dict.getItem(key);
  if (item instanceof COSObjectReference) item = resolve(item);
  return item ?? undefined;
}

/** Extract N numeric values from operands. */
function nums(operands: CSToken[], count: number): number[] {
  const result: number[] = [];
  let j = 0;
  for (let i = 0; i < operands.length && j < count; i++) {
    if (operands[i].type === 'number') {
      result.push(operands[i].numValue ?? (parseFloat(operands[i].value) || 0));
      j++;
    }
  }
  // Pad with zeros if not enough operands
  while (result.length < count) result.push(0);
  return result;
}

/** Extract single number from operands at given index (counting only number tokens). */
function num(operands: CSToken[], index: number): number {
  let j = 0;
  for (const t of operands) {
    if (t.type === 'number') {
      if (j === index) return t.numValue ?? (parseFloat(t.value) || 0);
      j++;
    }
  }
  return 0;
}

/** Extract name or string value from operand at given index. */
function nameStr(operands: CSToken[], index: number): string {
  if (index >= operands.length) return '';
  return operands[index].value;
}

function cosNum(arr: COSArray, idx: number): number {
  const el = arr.get(idx);
  if (!el) return 0;
  if (el instanceof COSInteger) return el.getValue();
  if (el instanceof COSFloat) return el.getValue();
  if ('getValue' in el) return (el as any).getValue();
  return 0;
}

function isNumeric(obj: COSBase | undefined): boolean {
  return obj instanceof COSInteger || obj instanceof COSFloat;
}

function numVal(obj: COSBase | undefined): number {
  if (obj instanceof COSInteger) return obj.getValue();
  if (obj instanceof COSFloat) return obj.getValue();
  return 0;
}

function hexToAscii(hex: string): string {
  let result = '';
  for (let i = 0; i + 1 < hex.length; i += 2) {
    result += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
  }
  return result;
}

// ================================================================
// Font name → CSS mapping
// ================================================================

const STANDARD_FONT_CSS: Record<string, NativeFont> = {
  // Standard 14 PDF fonts
  Helvetica: { family: 'Helvetica, Arial, sans-serif', weight: 'normal', style: 'normal' },
  'Helvetica-Bold': { family: 'Helvetica, Arial, sans-serif', weight: 'bold', style: 'normal' },
  'Helvetica-Oblique': {
    family: 'Helvetica, Arial, sans-serif',
    weight: 'normal',
    style: 'italic',
  },
  'Helvetica-BoldOblique': {
    family: 'Helvetica, Arial, sans-serif',
    weight: 'bold',
    style: 'italic',
  },
  'Times-Roman': { family: '"Times New Roman", Times, serif', weight: 'normal', style: 'normal' },
  'Times-Bold': { family: '"Times New Roman", Times, serif', weight: 'bold', style: 'normal' },
  'Times-Italic': { family: '"Times New Roman", Times, serif', weight: 'normal', style: 'italic' },
  'Times-BoldItalic': {
    family: '"Times New Roman", Times, serif',
    weight: 'bold',
    style: 'italic',
  },
  Courier: { family: '"Courier New", Courier, monospace', weight: 'normal', style: 'normal' },
  'Courier-Bold': { family: '"Courier New", Courier, monospace', weight: 'bold', style: 'normal' },
  'Courier-Oblique': {
    family: '"Courier New", Courier, monospace',
    weight: 'normal',
    style: 'italic',
  },
  'Courier-BoldOblique': {
    family: '"Courier New", Courier, monospace',
    weight: 'bold',
    style: 'italic',
  },
  Symbol: { family: 'Symbol, serif', weight: 'normal', style: 'normal' },
  ZapfDingbats: { family: 'ZapfDingbats, serif', weight: 'normal', style: 'normal' },

  // Common PostScript / PDF producer font names
  ArialMT: { family: 'Arial, Helvetica, sans-serif', weight: 'normal', style: 'normal' },
  'Arial-BoldMT': { family: 'Arial, Helvetica, sans-serif', weight: 'bold', style: 'normal' },
  'Arial-ItalicMT': { family: 'Arial, Helvetica, sans-serif', weight: 'normal', style: 'italic' },
  'Arial-BoldItalicMT': { family: 'Arial, Helvetica, sans-serif', weight: 'bold', style: 'italic' },
  TimesNewRomanPSMT: { family: '"Times New Roman", Times, serif', weight: 'normal', style: 'normal' },
  'TimesNewRomanPS-BoldMT': { family: '"Times New Roman", Times, serif', weight: 'bold', style: 'normal' },
  'TimesNewRomanPS-ItalicMT': { family: '"Times New Roman", Times, serif', weight: 'normal', style: 'italic' },
  'TimesNewRomanPS-BoldItalicMT': { family: '"Times New Roman", Times, serif', weight: 'bold', style: 'italic' },
  CourierNewPSMT: { family: '"Courier New", Courier, monospace', weight: 'normal', style: 'normal' },
  'CourierNewPS-BoldMT': { family: '"Courier New", Courier, monospace', weight: 'bold', style: 'normal' },
  'CourierNewPS-ItalicMT': { family: '"Courier New", Courier, monospace', weight: 'normal', style: 'italic' },
  'CourierNewPS-BoldItalicMT': { family: '"Courier New", Courier, monospace', weight: 'bold', style: 'italic' },

  // Microsoft Office fonts
  Calibri: { family: 'Calibri, "Segoe UI", sans-serif', weight: 'normal', style: 'normal' },
  'Calibri-Bold': { family: 'Calibri, "Segoe UI", sans-serif', weight: 'bold', style: 'normal' },
  'Calibri-Italic': { family: 'Calibri, "Segoe UI", sans-serif', weight: 'normal', style: 'italic' },
  'Calibri-BoldItalic': { family: 'Calibri, "Segoe UI", sans-serif', weight: 'bold', style: 'italic' },
  'Calibri-Light': { family: 'Calibri, "Segoe UI", sans-serif', weight: '300', style: 'normal' },
  CambriaMath: { family: '"Cambria Math", Cambria, serif', weight: 'normal', style: 'normal' },
  Cambria: { family: 'Cambria, "Times New Roman", serif', weight: 'normal', style: 'normal' },
  'Cambria-Bold': { family: 'Cambria, "Times New Roman", serif', weight: 'bold', style: 'normal' },
  Verdana: { family: 'Verdana, Geneva, sans-serif', weight: 'normal', style: 'normal' },
  'Verdana-Bold': { family: 'Verdana, Geneva, sans-serif', weight: 'bold', style: 'normal' },
  'Verdana-Italic': { family: 'Verdana, Geneva, sans-serif', weight: 'normal', style: 'italic' },
  'Verdana-BoldItalic': { family: 'Verdana, Geneva, sans-serif', weight: 'bold', style: 'italic' },
  Tahoma: { family: 'Tahoma, Geneva, sans-serif', weight: 'normal', style: 'normal' },
  'Tahoma-Bold': { family: 'Tahoma, Geneva, sans-serif', weight: 'bold', style: 'normal' },
  Georgia: { family: 'Georgia, "Times New Roman", serif', weight: 'normal', style: 'normal' },
  'Georgia-Bold': { family: 'Georgia, "Times New Roman", serif', weight: 'bold', style: 'normal' },
  'Georgia-Italic': { family: 'Georgia, "Times New Roman", serif', weight: 'normal', style: 'italic' },
  'Georgia-BoldItalic': { family: 'Georgia, "Times New Roman", serif', weight: 'bold', style: 'italic' },
};

function cssForPdfFont(baseFontName: string): NativeFont {
  // Strip subset prefix: "ABCDEF+Helvetica-Bold" → "Helvetica-Bold"
  const name = baseFontName.replace(/^[A-Z]{6}\+/, '');

  if (name in STANDARD_FONT_CSS) return STANDARD_FONT_CSS[name];

  // Heuristic: parse weight/style from font name
  const normalized = name.replace(/[,+]/g, '-');
  const isBold = /Bold/i.test(normalized);
  const isItalic = /Italic|Oblique/i.test(normalized);
  const isLight = /Light/i.test(normalized);

  // Extract base name: remove style suffixes and non-alpha chars
  const baseName = normalized.split('-')[0].replace(/[^a-zA-Z0-9\s]/g, '') || 'sans-serif';

  // Try common name variants that aren't in the table
  const lower = baseName.toLowerCase();
  if (lower === 'arial' || lower === 'arialmt') {
    return { family: 'Arial, Helvetica, sans-serif', weight: isBold ? 'bold' : 'normal', style: isItalic ? 'italic' : 'normal' };
  }
  if (lower.startsWith('timesnewroman') || lower === 'timesnewromanpsmt') {
    return { family: '"Times New Roman", Times, serif', weight: isBold ? 'bold' : 'normal', style: isItalic ? 'italic' : 'normal' };
  }
  if (lower.startsWith('couriernew') || lower === 'couriernewpsmt') {
    return { family: '"Courier New", Courier, monospace', weight: isBold ? 'bold' : 'normal', style: isItalic ? 'italic' : 'normal' };
  }

  return {
    family: `"${baseName}", sans-serif`,
    weight: isBold ? 'bold' : (isLight ? '300' : 'normal'),
    style: isItalic ? 'italic' : 'normal',
  };
}

/**
 * Build a fallback width function for standard 14 fonts.
 * Returns null if the font is not a standard font.
 *
 * Maps character code → glyph name (via encoding) → width (via StandardFontMetrics).
 */
function buildStdWidthFn(fontName: string): ((code: number) => number) | null {
  if (!StandardFontMetrics.isStandardFont(fontName)) return null;

  const metrics = StandardFontMetrics.load(fontName);
  const encoding = encodingForFont(fontName);

  // Build a code→width map for all encodable codepoints
  const widthByCode = new Map<number, number>();
  for (let cp = 0; cp < 256; cp++) {
    try {
      const glyph = encoding.encode(cp);
      const w = metrics.widthOfGlyph(glyph.name);
      widthByCode.set(glyph.code, w);
    } catch {
      // Not encodable
    }
  }

  return (code: number) => widthByCode.get(code) ?? 500;
}

// ================================================================
// Inline image helpers
// ================================================================

/** Expand abbreviated inline image dictionary keys to their full names. */
function expandInlineImageKey(key: string): string {
  const map: Record<string, string> = {
    BPC: 'BitsPerComponent',
    CS: 'ColorSpace',
    D: 'Decode',
    DP: 'DecodeParms',
    F: 'Filter',
    H: 'Height',
    IM: 'ImageMask',
    I: 'Interpolate',
    W: 'Width',
  };
  return map[key] ?? key;
}

/** Expand abbreviated inline image values. */
function expandInlineImageValue(key: string, value: string): string {
  if (key === 'ColorSpace' || key === 'CS') {
    const csMap: Record<string, string> = {
      G: 'DeviceGray',
      RGB: 'DeviceRGB',
      CMYK: 'DeviceCMYK',
      I: 'Indexed',
    };
    return csMap[value] ?? value;
  }
  if (key === 'Filter' || key === 'F') {
    const fMap: Record<string, string> = {
      AHx: 'ASCIIHexDecode',
      A85: 'ASCII85Decode',
      LZW: 'LZWDecode',
      Fl: 'FlateDecode',
      RL: 'RunLengthDecode',
      CCF: 'CCITTFaxDecode',
      DCT: 'DCTDecode',
    };
    return fMap[value] ?? value;
  }
  return value;
}

/** Convert a raw string (byte-encoded) to Uint8Array. */
function stringToBytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
}

// ================================================================
// Shading pattern decoding
// ================================================================

function decodeShadingPattern(dict: COSDictionary, resolve: ObjectResolver): NativeShading | null {
  const shadingType = dict.getInt('ShadingType', 0);

  // Type 2 = axial (linear), Type 3 = radial
  if (shadingType !== 2 && shadingType !== 3) return null;

  // Get coordinates
  let coordsArr = dict.getItem('Coords');
  if (coordsArr instanceof COSObjectReference) coordsArr = resolve(coordsArr);
  if (!(coordsArr instanceof COSArray)) return null;

  const coords: number[] = [];
  for (let i = 0; i < coordsArr.size(); i++) {
    coords.push(cosNum(coordsArr, i));
  }

  // Type 2 (linear) needs 4 coords, Type 3 (radial) needs 6
  if (shadingType === 2 && coords.length < 4) return null;
  if (shadingType === 3 && coords.length < 6) return null;

  // Get the function that maps t → color
  const stops = decodeShadingFunction(dict, resolve);
  if (stops.length === 0) {
    // Fallback: black-to-white gradient
    return {
      type: shadingType === 2 ? 'linear' : 'radial',
      coords,
      stops: [
        { offset: 0, color: 'rgb(0,0,0)' },
        { offset: 1, color: 'rgb(255,255,255)' },
      ],
    };
  }

  return {
    type: shadingType === 2 ? 'linear' : 'radial',
    coords,
    stops,
  };
}

function decodeShadingFunction(shadingDict: COSDictionary, resolve: ObjectResolver): ShadingStop[] {
  const stops: ShadingStop[] = [];

  // Determine color space
  const cs = resolveColorSpace(shadingDict, resolve);

  // Get /Domain (default [0, 1])
  let domainArr = shadingDict.getItem('Domain');
  if (domainArr instanceof COSObjectReference) domainArr = resolve(domainArr);
  let domain = [0, 1];
  if (domainArr instanceof COSArray && domainArr.size() >= 2) {
    domain = [cosNum(domainArr, 0), cosNum(domainArr, 1)];
  }

  // Get /Function
  let funcEntry = shadingDict.getItem('Function');
  if (funcEntry instanceof COSObjectReference) funcEntry = resolve(funcEntry);

  if (!funcEntry) return stops;

  // Handle stitching function (Type 3) — array of sub-functions
  if (funcEntry instanceof COSArray) {
    // Multiple functions — each produces one color component
    // Common pattern: 3 functions for R, G, B
    const funcs: COSDictionary[] = [];
    for (let i = 0; i < funcEntry.size(); i++) {
      let f = funcEntry.get(i);
      if (f instanceof COSObjectReference) f = resolve(f);
      if (f instanceof COSDictionary || f instanceof COSStream) {
        funcs.push(f as COSDictionary);
      }
    }
    if (funcs.length > 0) {
      return decodeFunctionArray(funcs, domain, cs, resolve);
    }
    return stops;
  }

  const funcDict =
    funcEntry instanceof COSStream
      ? (funcEntry.getDictionary?.() ?? (funcEntry as unknown as COSDictionary))
      : (funcEntry as COSDictionary);

  if (!(funcDict instanceof COSDictionary)) return stops;

  const funcType = funcDict.getInt('FunctionType', -1);

  if (funcType === 2) {
    // Exponential interpolation: C0 + t^N * (C1 - C0)
    return decodeExponentialFunction(funcDict, domain, cs, resolve);
  } else if (funcType === 3) {
    // Stitching function
    return decodeStitchingFunction(funcDict, domain, cs, resolve);
  } else if (funcType === 0) {
    // Sampled function — sample at endpoints
    return decodeSampledFunction(funcDict, domain, cs, resolve);
  }

  return stops;
}

function decodeExponentialFunction(
  funcDict: COSDictionary,
  _domain: number[],
  cs: string,
  resolve: ObjectResolver
): ShadingStop[] {
  const N = funcDict.getInt('N', 1);

  // C0 = start color (default [0])
  const c0 = getNumberArray(funcDict, 'C0', resolve) ?? [0];
  // C1 = end color (default [1])
  const c1 = getNumberArray(funcDict, 'C1', resolve) ?? [1];

  const startColor = componentsToCSS(c0, cs);
  const endColor = componentsToCSS(c1, cs);

  const stops: ShadingStop[] = [
    { offset: 0, color: startColor },
    { offset: 1, color: endColor },
  ];

  // For non-linear functions (N != 1), add intermediate stops
  if (N !== 1) {
    const steps = 8;
    const result: ShadingStop[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const tN = Math.pow(t, N);
      const components = c0.map((v, idx) => v + tN * ((c1[idx] ?? 1) - v));
      result.push({ offset: t, color: componentsToCSS(components, cs) });
    }
    return result;
  }

  return stops;
}

function decodeStitchingFunction(
  funcDict: COSDictionary,
  domain: number[],
  cs: string,
  resolve: ObjectResolver
): ShadingStop[] {
  // Get sub-functions
  let funcsArr = funcDict.getItem('Functions');
  if (funcsArr instanceof COSObjectReference) funcsArr = resolve(funcsArr);
  if (!(funcsArr instanceof COSArray)) return [];

  // Get bounds
  const bounds = getNumberArray(funcDict, 'Bounds', resolve) ?? [];
  // Encode array (used by PDF spec for mapping — not needed for stop extraction)
  const _encode = getNumberArray(funcDict, 'Encode', resolve) ?? [];

  const stops: ShadingStop[] = [];
  const allBounds = [domain[0], ...bounds, domain[1]];
  const domainRange = domain[1] - domain[0];

  for (let i = 0; i < funcsArr.size(); i++) {
    let subFunc = funcsArr.get(i);
    if (subFunc instanceof COSObjectReference) subFunc = resolve(subFunc);
    if (!(subFunc instanceof COSDictionary) && !(subFunc instanceof COSStream)) continue;

    const subDict =
      subFunc instanceof COSStream
        ? (subFunc.getDictionary?.() ?? (subFunc as unknown as COSDictionary))
        : (subFunc as COSDictionary);

    const subType = subDict.getInt('FunctionType', -1);
    const t0 = allBounds[i];
    const t1 = allBounds[i + 1];

    if (subType === 2) {
      const subStops = decodeExponentialFunction(subDict, [t0, t1], cs, resolve);
      for (const s of subStops) {
        // Map offset from sub-domain to parent domain [0..1]
        const parentT = (t0 + s.offset * (t1 - t0) - domain[0]) / domainRange;
        stops.push({ offset: Math.max(0, Math.min(1, parentT)), color: s.color });
      }
    } else {
      // For unsupported sub-function types, sample at boundaries
      const offset0 = (t0 - domain[0]) / domainRange;
      const offset1 = (t1 - domain[0]) / domainRange;
      stops.push({ offset: Math.max(0, Math.min(1, offset0)), color: 'rgb(128,128,128)' });
      stops.push({ offset: Math.max(0, Math.min(1, offset1)), color: 'rgb(128,128,128)' });
    }
  }

  return stops;
}

function decodeSampledFunction(
  _funcDict: COSDictionary,
  _domain: number[],
  _cs: string,
  _resolve: ObjectResolver
): ShadingStop[] {
  // Sampled functions are complex — provide a fallback
  return [
    { offset: 0, color: 'rgb(0,0,0)' },
    { offset: 1, color: 'rgb(255,255,255)' },
  ];
}

function decodeFunctionArray(
  funcs: COSDictionary[],
  _domain: number[],
  cs: string,
  resolve: ObjectResolver
): ShadingStop[] {
  // Each function produces one color component
  // Sample at several points
  const steps = 8;
  const stops: ShadingStop[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const components: number[] = [];

    for (const funcDict of funcs) {
      const funcType = funcDict.getInt('FunctionType', -1);
      if (funcType === 2) {
        const N = funcDict.getInt('N', 1);
        const c0 = getNumberArray(funcDict, 'C0', resolve) ?? [0];
        const c1 = getNumberArray(funcDict, 'C1', resolve) ?? [1];
        const tN = Math.pow(t, N);
        components.push(c0[0] + tN * ((c1[0] ?? 1) - c0[0]));
      } else {
        components.push(t); // fallback: linear ramp
      }
    }

    stops.push({ offset: t, color: componentsToCSS(components, cs) });
  }

  return stops;
}

function getNumberArray(
  dict: COSDictionary,
  key: string,
  resolve: ObjectResolver
): number[] | null {
  let arr = dict.getItem(key);
  if (arr instanceof COSObjectReference) arr = resolve(arr);
  if (!(arr instanceof COSArray)) return null;

  const result: number[] = [];
  for (let i = 0; i < arr.size(); i++) {
    result.push(cosNum(arr, i));
  }
  return result;
}

function componentsToCSS(components: number[], _cs: string): string {
  if (components.length === 1) {
    // Gray
    const v = Math.round(Math.max(0, Math.min(1, components[0])) * 255);
    return `rgb(${v},${v},${v})`;
  } else if (components.length === 3) {
    // RGB (or CalRGB, Lab approximation)
    const r = Math.round(Math.max(0, Math.min(1, components[0])) * 255);
    const g = Math.round(Math.max(0, Math.min(1, components[1])) * 255);
    const b = Math.round(Math.max(0, Math.min(1, components[2])) * 255);
    return `rgb(${r},${g},${b})`;
  } else if (components.length === 4) {
    // CMYK
    const c = components[0],
      m = components[1],
      y = components[2],
      k = components[3];
    const r = Math.round(255 * (1 - Math.min(1, c)) * (1 - Math.min(1, k)));
    const g = Math.round(255 * (1 - Math.min(1, m)) * (1 - Math.min(1, k)));
    const b = Math.round(255 * (1 - Math.min(1, y)) * (1 - Math.min(1, k)));
    return `rgb(${r},${g},${b})`;
  }
  return 'rgb(0,0,0)';
}

function blendModeToCSS(mode: string): string {
  const map: Record<string, string> = {
    Normal: 'source-over',
    Multiply: 'multiply',
    Screen: 'screen',
    Overlay: 'overlay',
    Darken: 'darken',
    Lighten: 'lighten',
    ColorDodge: 'color-dodge',
    ColorBurn: 'color-burn',
    HardLight: 'hard-light',
    SoftLight: 'soft-light',
    Difference: 'difference',
    Exclusion: 'exclusion',
  };
  return map[mode] ?? 'source-over';
}
