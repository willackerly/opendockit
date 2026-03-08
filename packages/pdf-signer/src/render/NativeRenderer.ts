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

import type { RenderOptions, RenderResult } from './types.js';
import { evaluatePage, evaluatePageWithElements } from './evaluator.js';
import type { PageElement } from '../elements/types.js';
import { NativeCanvasGraphics } from './canvas-graphics.js';
import { canvasToPng, isNodeEnvironment } from './canvas-factory.js';
import type { COSDictionary } from '../pdfbox/cos/COSTypes.js';
import { COSArray, COSFloat, COSInteger, COSObjectReference } from '../pdfbox/cos/COSTypes.js';
import type { ObjectResolver } from '../document/extraction/FontDecoder.js';

const DEFAULT_SCALE = 1.5;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class NativeRenderer {
  private pages: Array<{ pageDict: COSDictionary }>;
  private resolve: ObjectResolver;

  private constructor(pages: Array<{ pageDict: COSDictionary }>, resolve: ObjectResolver) {
    this.pages = pages;
    this.resolve = resolve;
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
  ): Promise<{ width: number; height: number; timeMs: number }> {
    if (pageIndex < 0 || pageIndex >= this.pages.length) {
      throw new RangeError(`Page index ${pageIndex} out of range (0..${this.pages.length - 1})`);
    }

    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const scale = options?.scale ?? DEFAULT_SCALE;
    const background = options?.background ?? 'white';
    const pageDict = this.pages[pageIndex].pageDict;

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

    const opList = evaluatePage(pageDict, this.resolve);
    const graphics = new NativeCanvasGraphics(context);
    graphics.execute(opList);

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return { width: canvasWidth, height: canvasHeight, timeMs: t1 - t0 };
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
    const opList = evaluatePage(pageDict, this.resolve);

    // Render OperatorList to canvas
    const graphics = new NativeCanvasGraphics(context);
    graphics.execute(opList);

    // Convert to PNG
    const png = await canvasToPng(canvas);

    return { png, width: canvasWidth, height: canvasHeight, pageIndex };
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
