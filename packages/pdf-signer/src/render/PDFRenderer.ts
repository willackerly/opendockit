/**
 * PDFRenderer — renders PDF pages to PNG using PDF.js.
 *
 * Works in both Node.js (via node-canvas) and browser (via native Canvas).
 * Can be created from raw PDF bytes or from a pdfbox-ts PDFDocument instance.
 *
 * Usage:
 *   import { PDFRenderer } from 'pdfbox-ts/render';
 *
 *   // From bytes
 *   const renderer = await PDFRenderer.create(pdfBytes);
 *   const { png, width, height } = await renderer.renderPage(0);
 *   renderer.destroy();
 *
 *   // From PDFDocument (renders current state)
 *   const doc = await PDFDocument.load(pdfBytes);
 *   doc.getPage(0).drawText('Hello');
 *   const renderer = await PDFRenderer.fromDocument(doc);
 *   const result = await renderer.renderPage(0);
 */

import type { RenderOptions, RenderResult } from './types.js';
import { createCanvasFactory, canvasToPng, isNodeEnvironment } from './canvas-factory.js';

// PDF.js types (loosely typed to avoid hard dep on pdfjs-dist types)
interface PDFJSDocument {
  numPages: number;
  getPage(pageNum: number): Promise<PDFJSPage>;
  canvasFactory: any;
  destroy(): Promise<void>;
}

interface PDFJSPage {
  getViewport(params: { scale: number; rotation?: number }): PDFJSViewport;
  render(params: any): { promise: Promise<void> };
}

interface PDFJSViewport {
  width: number;
  height: number;
  scale: number;
}

const DEFAULT_SCALE = 1.5;

export class PDFRenderer {
  private _pdfjsDoc: PDFJSDocument;
  private _destroyed = false;

  private constructor(pdfjsDoc: PDFJSDocument) {
    this._pdfjsDoc = pdfjsDoc;
  }

  /**
   * Create a renderer from raw PDF bytes.
   */
  static async create(pdfBytes: Uint8Array): Promise<PDFRenderer> {
    const pdfjsLib = await loadPdfjs();
    const CanvasFactory = await createCanvasFactory();

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBytes), // copy to avoid detached buffer issues
      useSystemFonts: true,
      isEvalSupported: false,
      ...(CanvasFactory ? { CanvasFactory } : {}),
    });

    const doc: PDFJSDocument = await loadingTask.promise;
    return new PDFRenderer(doc);
  }

  /**
   * Create a renderer from a pdfbox-ts PDFDocument.
   * Saves the document to bytes internally, then loads into PDF.js.
   */
  static async fromDocument(doc: any /* PDFDocument */): Promise<PDFRenderer> {
    if (typeof doc.save !== 'function') {
      throw new Error('PDFRenderer.fromDocument expects a PDFDocument with a save() method');
    }
    const bytes = await doc.save();
    return PDFRenderer.create(bytes);
  }

  /** Number of pages in the PDF. */
  get pageCount(): number {
    this._assertNotDestroyed();
    return this._pdfjsDoc.numPages;
  }

  /**
   * Render a single page to PNG.
   *
   * @param pageIndex  0-based page index
   * @param options    Rendering options (scale, background)
   * @returns PNG bytes, dimensions, and page index
   */
  async renderPage(pageIndex: number, options?: RenderOptions): Promise<RenderResult> {
    this._assertNotDestroyed();

    const scale = options?.scale ?? DEFAULT_SCALE;
    const background = options?.background ?? 'white';

    if (pageIndex < 0 || pageIndex >= this._pdfjsDoc.numPages) {
      throw new RangeError(
        `Page index ${pageIndex} out of range (0..${this._pdfjsDoc.numPages - 1})`,
      );
    }

    // PDF.js uses 1-based page numbers
    const page = await this._pdfjsDoc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale });

    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);

    // Create canvas via the document's own factory (ensures consistent native binding)
    const canvasFactory = this._pdfjsDoc.canvasFactory;
    const { canvas, context } = canvasFactory.create(width, height);

    // Fill background
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
    }

    // Render
    await page.render({ canvasContext: context, viewport }).promise;

    // Convert to PNG
    const png = await canvasToPng(canvas);

    // Clean up the canvas
    canvasFactory.destroy({ canvas, context });

    return { png, width, height, pageIndex };
  }

  /**
   * Render all pages to PNG.
   *
   * @param options  Rendering options (scale, background)
   * @returns Array of render results, one per page
   */
  async renderAllPages(options?: RenderOptions): Promise<RenderResult[]> {
    this._assertNotDestroyed();
    const results: RenderResult[] = [];
    for (let i = 0; i < this._pdfjsDoc.numPages; i++) {
      results.push(await this.renderPage(i, options));
    }
    return results;
  }

  /**
   * Release resources. The renderer cannot be used after this.
   */
  async destroy(): Promise<void> {
    if (!this._destroyed) {
      this._destroyed = true;
      await this._pdfjsDoc.destroy();
    }
  }

  private _assertNotDestroyed(): void {
    if (this._destroyed) {
      throw new Error('PDFRenderer has been destroyed');
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience function
// ---------------------------------------------------------------------------

/**
 * Render a single page of a PDF to PNG.
 *
 * This is a convenience wrapper around PDFRenderer for one-shot rendering.
 * For rendering multiple pages, create a PDFRenderer instance directly.
 *
 * @param source     Raw PDF bytes or a PDFDocument instance
 * @param pageIndex  0-based page index (default: 0)
 * @param options    Rendering options
 */
export async function renderPage(
  source: Uint8Array | { save(): Promise<Uint8Array> },
  pageIndex = 0,
  options?: RenderOptions,
): Promise<RenderResult> {
  const renderer =
    source instanceof Uint8Array
      ? await PDFRenderer.create(source)
      : await PDFRenderer.fromDocument(source);

  try {
    return await renderer.renderPage(pageIndex, options);
  } finally {
    await renderer.destroy();
  }
}

// ---------------------------------------------------------------------------
// PDF.js loader (lazy, works in both Node and browser)
// ---------------------------------------------------------------------------

let _pdfjsLib: any = null;

async function loadPdfjs(): Promise<any> {
  if (_pdfjsLib) return _pdfjsLib;

  if (isNodeEnvironment) {
    // Node.js — use legacy build (no DOM dependency)
    _pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } else {
    // Browser — use standard build
    _pdfjsLib = await import('pdfjs-dist');
  }

  return _pdfjsLib;
}
