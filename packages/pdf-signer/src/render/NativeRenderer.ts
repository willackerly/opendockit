/**
 * NativeRenderer — renders PDF pages directly from COS objects.
 *
 * Unlike PDFRenderer (which saves to bytes → re-parses via PDF.js),
 * NativeRenderer works directly with in-memory COS objects:
 *
 *   COSDictionary (page) → evaluatePage() → OperatorList → NativeCanvasGraphics → PNG
 *
 * This eliminates the save→re-parse round-trip, enabling instant
 * edit→render workflows.
 */

// Browser API declarations (lib: "dom" is not included in this package's tsconfig)
/* eslint-disable @typescript-eslint/no-redeclare */
declare function createImageBitmap(image: Blob): Promise<ImageBitmap>;
declare interface ImageBitmap { readonly width: number; readonly height: number; close(): void; }
declare class ImageData { constructor(data: Uint8ClampedArray, sw: number, sh: number); readonly data: Uint8ClampedArray; readonly width: number; readonly height: number; }

import type { RenderOptions, RenderResult, RenderDiagnostic } from './types.js';
import { RenderDiagnosticsCollector } from './types.js';
import { evaluatePage, evaluatePageWithElements } from './evaluator.js';
import type { PageElement } from '../elements/types.js';
import { NativeCanvasGraphics } from './canvas-graphics.js';
import { canvasToPng, isNodeEnvironment } from './canvas-factory.js';
import type { COSDictionary } from '../pdfbox/cos/COSTypes.js';
import { COSArray, COSFloat, COSInteger, COSObjectReference } from '../pdfbox/cos/COSTypes.js';
import type { ObjectResolver } from '../document/extraction/FontDecoder.js';
import type { NativeImage } from './evaluator.js';
import type { ExtractedFont } from '../document/extraction/FontExtractor.js';
import type { OperatorList } from './operator-list.js';
import { OPS } from './ops.js';
import { FontRegistrar } from './font-registrar.js';
import { CanvasTreeRecorder } from './canvas-tree-recorder.js';
import type { RenderTrace } from './canvas-tree-recorder.js';

const DEFAULT_SCALE = 1.5;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class NativeRenderer {
  private pages: Array<{ pageDict: COSDictionary }>;
  private resolve: ObjectResolver;
  private fontRegistrar: FontRegistrar;

  private constructor(pages: Array<{ pageDict: COSDictionary }>, resolve: ObjectResolver) {
    this.pages = pages;
    this.resolve = resolve;
    this.fontRegistrar = new FontRegistrar();
  }

  /**
   * Create a NativeRenderer from a pdfbox-ts PDFDocument.
   * Works with both created and loaded documents.
   */
  static fromDocument(doc: any /* PDFDocument */): NativeRenderer {
    const ctx = doc._nativeCtx;
    if (!ctx) {
      throw new Error(
        'NativeRenderer.fromDocument() requires a native PDFDocument. ' +
          'Use PDFRenderer for legacy documents.'
      );
    }

    const pageList = ctx.getPageList() as Array<{
      pageDict: COSDictionary;
      pageRef: COSObjectReference;
    }>;

    const resolve: ObjectResolver = (ref: COSObjectReference) => ctx.resolveRef(ref);

    return new NativeRenderer(
      pageList.map((p) => ({ pageDict: p.pageDict })),
      resolve
    );
  }

  /**
   * Create a NativeRenderer from raw page dicts + resolver.
   * Low-level API for direct COS access.
   */
  static fromPages(
    pages: Array<{ pageDict: COSDictionary }>,
    resolve: ObjectResolver
  ): NativeRenderer {
    return new NativeRenderer(pages, resolve);
  }

  /** Number of pages. */
  get pageCount(): number {
    return this.pages.length;
  }

  /**
   * Render a single page directly to a caller-provided canvas.
   * Skips PNG conversion — ideal for browser display.
   *
   * @param pageIndex  0-based page index
   * @param canvas     HTMLCanvasElement already in the DOM
   * @param options    Rendering options (scale, background)
   * @returns width, height, and render time in ms
   */
  async renderPageToCanvas(
    pageIndex: number,
    canvas: HTMLCanvasElement,
    options?: RenderOptions
  ): Promise<{ width: number; height: number; timeMs: number; diagnostics?: RenderDiagnostic[] }> {
    if (pageIndex < 0 || pageIndex >= this.pages.length) {
      throw new RangeError(`Page index ${pageIndex} out of range (0..${this.pages.length - 1})`);
    }

    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const scale = options?.scale ?? DEFAULT_SCALE;
    const background = options?.background ?? 'white';
    const pageDict = this.pages[pageIndex].pageDict;
    const diagnostics = new RenderDiagnosticsCollector();

    // Use CropBox for visible dimensions (falls back to MediaBox)
    const visibleBox = getVisibleBox(pageDict, this.resolve);
    const pageWidth = visibleBox[2] - visibleBox[0];
    const pageHeight = visibleBox[3] - visibleBox[1];

    const canvasWidth = Math.floor(pageWidth * scale);
    const canvasHeight = Math.floor(pageHeight * scale);

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext('2d')!;

    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // Transform: scale + flip Y, offset by visible box origin
    context.transform(scale, 0, 0, -scale, -visibleBox[0] * scale, visibleBox[3] * scale);

    const opList = evaluatePage(pageDict, this.resolve, diagnostics);

    // Pre-register embedded PDF fonts for canvas rendering
    await this.preRegisterFonts(opList, diagnostics);

    // Pre-decode JPEG images in browser (createImageBitmap is async)
    await this.preDecodeJpegs(opList, diagnostics);

    const graphics = new NativeCanvasGraphics(context, diagnostics);
    graphics.execute(opList);

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      width: canvasWidth,
      height: canvasHeight,
      timeMs: t1 - t0,
      diagnostics: diagnostics.length > 0 ? diagnostics.items : undefined,
    };
  }

  /**
   * Render a single page to PNG.
   *
   * @param pageIndex  0-based page index
   * @param options    Rendering options (scale, background)
   * @returns PNG bytes + dimensions
   */
  async renderPage(pageIndex: number, options?: RenderOptions): Promise<RenderResult> {
    if (pageIndex < 0 || pageIndex >= this.pages.length) {
      throw new RangeError(`Page index ${pageIndex} out of range (0..${this.pages.length - 1})`);
    }

    const scale = options?.scale ?? DEFAULT_SCALE;
    const background = options?.background ?? 'white';
    const pageDict = this.pages[pageIndex].pageDict;
    const diagnostics = new RenderDiagnosticsCollector();

    // Use CropBox for visible dimensions (falls back to MediaBox)
    const visibleBox = getVisibleBox(pageDict, this.resolve);
    const pageWidth = visibleBox[2] - visibleBox[0];
    const pageHeight = visibleBox[3] - visibleBox[1];

    const canvasWidth = Math.floor(pageWidth * scale);
    const canvasHeight = Math.floor(pageHeight * scale);

    // Create canvas
    const { canvas, context } = await createCanvas(canvasWidth, canvasHeight);

    // Fill background
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // Set up viewport transform: scale + flip Y
    // PDF coordinate system: origin at bottom-left, Y goes up
    // Canvas: origin at top-left, Y goes down
    // Transform: scale + flip Y, offset by visible box origin
    context.transform(scale, 0, 0, -scale, -visibleBox[0] * scale, visibleBox[3] * scale);

    // Evaluate page content stream → OperatorList
    const opList = evaluatePage(pageDict, this.resolve, diagnostics);

    // Pre-register embedded PDF fonts for canvas rendering
    await this.preRegisterFonts(opList, diagnostics);

    // Pre-decode JPEG images in browser (createImageBitmap is async)
    await this.preDecodeJpegs(opList, diagnostics);

    // Render OperatorList to canvas
    const graphics = new NativeCanvasGraphics(context, diagnostics);
    graphics.execute(opList);

    // Convert to PNG
    const png = await canvasToPng(canvas);

    return {
      png,
      width: canvasWidth,
      height: canvasHeight,
      pageIndex,
      diagnostics: diagnostics.length > 0 ? diagnostics.items : undefined,
    };
  }

  /**
   * Render all pages to PNG.
   */
  async renderAllPages(options?: RenderOptions): Promise<RenderResult[]> {
    const results: RenderResult[] = [];
    for (let i = 0; i < this.pages.length; i++) {
      results.push(await this.renderPage(i, options));
    }
    return results;
  }

  /**
   * Render a page and capture a structured trace of all canvas operations.
   *
   * Returns the same RenderTrace format as PPTX TracingBackend, so the
   * downstream pipeline (traceToElements → matchElements → generateDiffReport)
   * works identically for both formats.
   *
   * @param pageIndex  0-based page index
   * @param options    Rendering options (scale, background)
   * @returns RenderTrace with all text/shape/image events in render order
   */
  async renderPageWithTrace(
    pageIndex: number,
    options?: RenderOptions,
  ): Promise<{ result: RenderResult; trace: RenderTrace }> {
    if (pageIndex < 0 || pageIndex >= this.pages.length) {
      throw new RangeError(`Page index ${pageIndex} out of range (0..${this.pages.length - 1})`);
    }

    const scale = options?.scale ?? DEFAULT_SCALE;
    const background = options?.background ?? 'white';
    const pageDict = this.pages[pageIndex].pageDict;
    const diagnostics = new RenderDiagnosticsCollector();

    const visibleBox = getVisibleBox(pageDict, this.resolve);
    const pageWidth = visibleBox[2] - visibleBox[0];
    const pageHeight = visibleBox[3] - visibleBox[1];

    const canvasWidth = Math.floor(pageWidth * scale);
    const canvasHeight = Math.floor(pageHeight * scale);

    const { canvas, context } = await createCanvas(canvasWidth, canvasHeight);

    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // Set up viewport transform
    context.transform(scale, 0, 0, -scale, -visibleBox[0] * scale, visibleBox[3] * scale);

    const opList = evaluatePage(pageDict, this.resolve, diagnostics);
    await this.preDecodeJpegs(opList, diagnostics);

    // Create recorder and set its initial CTM to match the viewport transform
    const recorder = new CanvasTreeRecorder(pageWidth, pageHeight);
    recorder.applyTransform(scale, 0, 0, -scale, -visibleBox[0] * scale, visibleBox[3] * scale);

    // Render with recorder attached
    const graphics = new NativeCanvasGraphics(context, diagnostics);
    graphics.recorder = recorder;
    graphics.execute(opList);

    const png = await canvasToPng(canvas);
    const trace = recorder.getTrace(`pdf:page${pageIndex}`);

    return {
      result: {
        png,
        width: canvasWidth,
        height: canvasHeight,
        pageIndex,
        diagnostics: diagnostics.length > 0 ? diagnostics.items : undefined,
      },
      trace,
    };
  }

  /**
   * Extract positioned elements from a page.
   * Returns a flat array of elements (text, shapes, images, paths)
   * with positions in PDF points (1/72").
   *
   * @param pageIndex  0-based page index
   * @returns PageElement[] — flat, z-ordered (back to front)
   */
  getPageElements(pageIndex: number): PageElement[] {
    if (pageIndex < 0 || pageIndex >= this.pages.length) {
      throw new RangeError(`Page index ${pageIndex} out of range (0..${this.pages.length - 1})`);
    }

    const pageDict = this.pages[pageIndex].pageDict;
    const { elements } = evaluatePageWithElements(pageDict, this.resolve);
    return elements;
  }

  /**
   * Clean up resources (temp font files, etc.).
   * Call this when done rendering to free resources.
   */
  async dispose(): Promise<void> {
    await this.fontRegistrar.cleanup();
  }

  // -----------------------------------------------------------------------
  // Font pre-registration
  // -----------------------------------------------------------------------

  /**
   * Walk the OperatorList and pre-register any embedded fonts.
   *
   * For each OPS.setFont with an ExtractedFont 4th arg (rawBytes),
   * registers the font with the canvas system and replaces the 4th arg
   * with the registered family name string.
   *
   * If registration fails (corrupt font, unsupported format), the 4th arg
   * is set to undefined so canvas-graphics falls back to CSS fonts.
   */
  private async preRegisterFonts(
    opList: OperatorList,
    diagnostics: RenderDiagnosticsCollector,
  ): Promise<void> {
    const { fnArray, argsArray } = opList;

    for (let i = 0; i < fnArray.length; i++) {
      if (fnArray[i] !== OPS.setFont || !argsArray[i]) continue;

      const args = argsArray[i]!;
      const embeddedFont = args[3] as ExtractedFont | string | undefined;

      // Skip if no embedded font, or if already registered (string = family name)
      if (!embeddedFont || typeof embeddedFont === 'string') continue;
      if (!embeddedFont.rawBytes || embeddedFont.rawBytes.length === 0) {
        args[3] = undefined;
        continue;
      }

      try {
        const family = await this.fontRegistrar.register(
          embeddedFont.fontName,
          embeddedFont.rawBytes,
          {
            fontType: embeddedFont.fontType,
            charCodeToUnicode: embeddedFont.charCodeToUnicode,
            metrics: embeddedFont.metrics ? {
              ascender: embeddedFont.metrics.ascender,
              descender: embeddedFont.metrics.descender,
              unitsPerEm: embeddedFont.metrics.unitsPerEm,
            } : undefined,
          },
        );
        // Replace ExtractedFont object with the registered family name string
        args[3] = family;
        const css = args[2] as { family: string; weight: string; style: string };
        diagnostics.info('font', `Registered embedded font "${embeddedFont.fontName}" → "${family}" (css="${css.family}", ${embeddedFont.rawBytes.length}B, ${embeddedFont.charCodeToUnicode?.size ?? 0} cmap entries)`, {
          pdfFontName: embeddedFont.fontName,
          registeredFamily: family,
          cssFallback: css.family,
          byteLength: embeddedFont.rawBytes.length,
          cmapEntries: embeddedFont.charCodeToUnicode?.size ?? 0,
        });
      } catch (err) {
        diagnostics.warn('font', `Failed to register embedded font "${embeddedFont.fontName}": ${err instanceof Error ? err.message : String(err)}`, {
          error: String(err),
          fontType: embeddedFont.fontType,
          byteLength: embeddedFont.rawBytes.length,
        });
        // Fall back to CSS — clear the 4th arg
        args[3] = undefined;
      }
    }
  }

  // -----------------------------------------------------------------------
  // JPEG pre-decode (browser only)
  // -----------------------------------------------------------------------

  /**
   * Pre-decode JPEG images in the OperatorList for browser environments.
   *
   * In Node.js, node-canvas's Image decodes JPEG synchronously via `img.src = Buffer`.
   * In browsers, there's no sync JPEG→RGBA path. We use `createImageBitmap()` + OffscreenCanvas
   * to async-decode JPEGs before the synchronous `execute()` loop.
   *
   * After pre-decode, the NativeImage's `data` contains RGBA pixels and `isJpeg` is set to false,
   * so the sync path in canvas-graphics can handle it like any other image.
   */
  private async preDecodeJpegs(
    opList: OperatorList,
    diagnostics: RenderDiagnosticsCollector,
  ): Promise<void> {
    // Only needed in browser — Node.js has sync JPEG decode
    if (isNodeEnvironment) return;
    if (typeof createImageBitmap === 'undefined') return;

    const { fnArray, argsArray } = opList;
    const promises: Array<{ index: number; promise: Promise<ImageBitmap | null> }> = [];

    for (let i = 0; i < fnArray.length; i++) {
      if (
        (fnArray[i] === OPS.paintImageXObject || fnArray[i] === OPS.paintInlineImageXObject) &&
        argsArray[i]
      ) {
        const image = argsArray[i]![0] as NativeImage | null;
        if (image?.isJpeg && image.data) {
          promises.push({
            index: i,
            promise: this.decodeJpegAsync(image.data, image.width, image.height, diagnostics),
          });
        }
      }
    }

    if (promises.length === 0) return;

    const results = await Promise.allSettled(promises.map((p) => p.promise));

    for (let j = 0; j < promises.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled' && result.value) {
        const image = argsArray[promises[j].index]![0] as NativeImage;
        const bitmap = result.value;

        // If image has an SMask, we need RGBA pixels to apply alpha.
        // Otherwise, keep the ImageBitmap for direct drawing (avoids crosshatch artifacts).
        if (image.smaskData) {
          // Decode to RGBA to apply soft mask
          const oc = new OffscreenCanvas(bitmap.width, bitmap.height);
          const octx = oc.getContext('2d')!;
          octx.drawImage(bitmap, 0, 0);
          bitmap.close();
          const imgData = octx.getImageData(0, 0, oc.width, oc.height);
          image.data = new Uint8Array(imgData.data.buffer, imgData.data.byteOffset, imgData.data.byteLength);
          image.width = imgData.width;
          image.height = imgData.height;
          (image as any).isJpeg = false;

          // Apply SMask as alpha channel
          const pixelCount = image.width * image.height;
          for (let i = 0; i < pixelCount; i++) {
            image.data[i * 4 + 3] = image.smaskData[i];
          }
          image.smaskData = undefined;
        } else {
          // Store bitmap directly — paintImage will use ctx.drawImage(bitmap, ...)
          image.bitmap = bitmap;
          image.width = bitmap.width;
          image.height = bitmap.height;
          (image as any).isJpeg = false;
        }
      }
    }
  }

  private async decodeJpegAsync(
    jpegData: Uint8Array,
    _width: number,
    _height: number,
    diagnostics: RenderDiagnosticsCollector,
  ): Promise<ImageBitmap | null> {
    try {
      const blob = new Blob([jpegData as BlobPart], { type: 'image/jpeg' });
      return await createImageBitmap(blob);
    } catch (err) {
      diagnostics.warn('image', `Failed to async-decode JPEG (${_width}x${_height})`, {
        error: String(err),
      });
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience function
// ---------------------------------------------------------------------------

/**
 * Render a single page from a PDFDocument using the native pipeline.
 * No save→re-parse round-trip.
 */
export async function renderPageNative(
  doc: any /* PDFDocument */,
  pageIndex = 0,
  options?: RenderOptions
): Promise<RenderResult> {
  const renderer = NativeRenderer.fromDocument(doc);
  return renderer.renderPage(pageIndex, options);
}

/**
 * Extract positioned elements from a PDFDocument page.
 * Convenience wrapper around NativeRenderer.getPageElements().
 */
export function getPageElements(doc: any /* PDFDocument */, pageIndex = 0): PageElement[] {
  const renderer = NativeRenderer.fromDocument(doc);
  return renderer.getPageElements(pageIndex);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMediaBox(
  pageDict: COSDictionary,
  resolve: ObjectResolver
): [number, number, number, number] {
  let mb = pageDict.getItem('MediaBox');
  if (mb instanceof COSObjectReference) mb = resolve(mb);
  if (mb instanceof COSArray && mb.size() >= 4) {
    return [cosNum(mb, 0), cosNum(mb, 1), cosNum(mb, 2), cosNum(mb, 3)];
  }
  // Default to US Letter
  return [0, 0, 612, 792];
}

/**
 * Get the effective visible area (CropBox if present, else MediaBox).
 * CropBox defines the region of the page to which the contents are clipped.
 */
function getVisibleBox(
  pageDict: COSDictionary,
  resolve: ObjectResolver
): [number, number, number, number] {
  let cb = pageDict.getItem('CropBox');
  if (cb instanceof COSObjectReference) cb = resolve(cb);
  if (cb instanceof COSArray && cb.size() >= 4) {
    return [cosNum(cb, 0), cosNum(cb, 1), cosNum(cb, 2), cosNum(cb, 3)];
  }
  return getMediaBox(pageDict, resolve);
}

function cosNum(arr: COSArray, idx: number): number {
  const el = arr.get(idx);
  if (!el) return 0;
  if (el instanceof COSInteger) return el.getValue();
  if (el instanceof COSFloat) return el.getValue();
  if ('getValue' in el) return (el as any).getValue();
  return 0;
}

async function createCanvas(
  width: number,
  height: number
): Promise<{ canvas: any; context: CanvasRenderingContext2D }> {
  if (isNodeEnvironment) {
    const { createCanvas: nodeCreateCanvas } = await import('canvas');
    const canvas = nodeCreateCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') as any };
  }

  // Browser
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d')!;
    return { canvas, context: context as any };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, context: canvas.getContext('2d')! };
}
