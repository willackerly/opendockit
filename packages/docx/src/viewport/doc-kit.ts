/**
 * DocKit — the public API for loading and rendering DOCX documents.
 *
 * Mirrors the SlideKit API pattern from `@opendockit/pptx`. Provides a
 * high-level interface for loading a DOCX file, computing layout, and
 * rendering individual pages to a Canvas2D context.
 *
 * Usage:
 * ```ts
 * const kit = await DocKit.fromOpcData(docxArrayBuffer);
 * console.log(`Pages: ${kit.pageCount}`);
 * kit.renderPage(0, canvas);
 * ```
 */

import { OpcPackageReader } from '@opendockit/core/opc';
import type { DocumentIR, SectionIR } from '../model/document-ir.js';
import { parseDocument } from '../parser/document.js';
import { layoutDocument } from '../layout/block-layout.js';
import { computePageDimensions } from '../layout/page-layout.js';
import type { BlockLayoutResult, PositionedParagraph } from '../layout/block-layout.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Options for rendering a page. */
export interface RenderOptions {
  /** DPI scale factor (default: 1). */
  dpiScale?: number;
  /** Background color (default: '#FFFFFF'). */
  backgroundColor?: string;
}

/** Information about a loaded document. */
export interface LoadedDocument {
  /** Total number of pages across all sections. */
  pageCount: number;
  /** Number of sections in the document. */
  sectionCount: number;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Flattened page reference pointing to a section and page within it. */
interface PageRef {
  sectionIndex: number;
  section: SectionIR;
  layoutResult: BlockLayoutResult;
  pageIndexInSection: number;
}

// ---------------------------------------------------------------------------
// DocKit class
// ---------------------------------------------------------------------------

export class DocKit {
  private readonly _document: DocumentIR;
  private readonly _layouts: BlockLayoutResult[];
  private readonly _pageRefs: PageRef[];

  private constructor(document: DocumentIR) {
    this._document = document;
    this._layouts = layoutDocument(document.sections);

    // Build a flat page reference list
    this._pageRefs = [];
    for (let si = 0; si < document.sections.length; si++) {
      const section = document.sections[si];
      const layout = this._layouts[si];
      for (let pi = 0; pi < layout.pages.length; pi++) {
        this._pageRefs.push({
          sectionIndex: si,
          section,
          layoutResult: layout,
          pageIndexInSection: pi,
        });
      }
    }
  }

  /**
   * Create a DocKit from raw DOCX file data.
   *
   * @param data - The raw bytes of the DOCX file.
   * @returns A new DocKit instance ready for rendering.
   */
  static async fromOpcData(data: ArrayBuffer | Uint8Array): Promise<DocKit> {
    const pkg = await OpcPackageReader.open(data);
    const document = await parseDocument(pkg);
    return new DocKit(document);
  }

  /**
   * Create a DocKit from an already-parsed {@link DocumentIR}.
   *
   * Useful for testing or when the document has been parsed elsewhere.
   */
  static fromDocumentIR(document: DocumentIR): DocKit {
    return new DocKit(document);
  }

  /** The parsed document IR. */
  get document(): DocumentIR {
    return this._document;
  }

  /** Total number of pages across all sections. */
  get pageCount(): number {
    return this._pageRefs.length;
  }

  /** Number of sections in the document. */
  get sectionCount(): number {
    return this._document.sections.length;
  }

  /**
   * Get the page dimensions for a given page index.
   */
  getPageDimensions(pageIndex: number): { width: number; height: number } {
    this.validatePageIndex(pageIndex);
    const ref = this._pageRefs[pageIndex];
    return {
      width: ref.layoutResult.pageWidth,
      height: ref.layoutResult.pageHeight,
    };
  }

  /**
   * Render a single page to a canvas element.
   *
   * Sets up the canvas size, applies DPI scaling, fills the background,
   * and renders each paragraph's text.
   *
   * @param pageIndex - Zero-based page index.
   * @param canvas - The canvas element to render onto.
   * @param options - Optional rendering configuration.
   */
  renderPage(pageIndex: number, canvas: HTMLCanvasElement, options?: RenderOptions): void {
    this.validatePageIndex(pageIndex);

    const ref = this._pageRefs[pageIndex];
    const page = ref.layoutResult.pages[ref.pageIndexInSection];
    const dims = computePageDimensions(ref.section);
    const dpiScale = options?.dpiScale ?? 1;
    const bgColor = options?.backgroundColor ?? '#FFFFFF';

    // Set canvas dimensions
    canvas.width = Math.ceil(dims.pageWidth * dpiScale);
    canvas.height = Math.ceil(dims.pageHeight * dpiScale);

    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    // Apply DPI scaling
    ctx.scale(dpiScale, dpiScale);

    // Fill background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, dims.pageWidth, dims.pageHeight);

    // Render paragraphs
    for (const positioned of page.paragraphs) {
      renderParagraph(ctx, positioned, dims.contentArea.x, dims.contentArea.y);
    }
  }

  /**
   * Render a page to a CanvasRenderingContext2D (for headless/off-screen).
   *
   * Unlike `renderPage`, this does not resize the canvas — the caller
   * is responsible for setting up the context.
   */
  renderPageToContext(pageIndex: number, ctx: CanvasRenderingContext2D): void {
    this.validatePageIndex(pageIndex);

    const ref = this._pageRefs[pageIndex];
    const page = ref.layoutResult.pages[ref.pageIndexInSection];
    const dims = computePageDimensions(ref.section);

    for (const positioned of page.paragraphs) {
      renderParagraph(ctx, positioned, dims.contentArea.x, dims.contentArea.y);
    }
  }

  private validatePageIndex(pageIndex: number): void {
    if (pageIndex < 0 || pageIndex >= this._pageRefs.length) {
      throw new RangeError(`Page index ${pageIndex} out of range [0, ${this._pageRefs.length})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

/** Default font size in points. */
const DEFAULT_FONT_SIZE = 11;

/** Default font family. */
const DEFAULT_FONT_FAMILY = 'Calibri, sans-serif';

/**
 * Render a positioned paragraph onto a Canvas2D context.
 */
function renderParagraph(
  ctx: CanvasRenderingContext2D,
  positioned: PositionedParagraph,
  contentX: number,
  contentY: number
): void {
  const para = positioned.paragraph;
  if (para.runs.length === 0) return;

  let x = contentX + (para.indentLeft ?? 0);

  // Handle first-line indent
  if (para.indentFirstLine !== undefined) {
    x += para.indentFirstLine;
  }

  // Handle bullet
  if (para.bulletChar !== undefined) {
    const bulletFontSize = para.runs[0]?.fontSize ?? DEFAULT_FONT_SIZE;
    ctx.font = `${bulletFontSize}pt ${DEFAULT_FONT_FAMILY}`;
    ctx.fillStyle = '#000000';
    ctx.fillText(para.bulletChar + ' ', x, contentY + positioned.y + bulletFontSize);
    x += ctx.measureText(para.bulletChar + ' ').width;
  }

  // Render each run
  for (const run of para.runs) {
    if (run.text.length === 0) continue;

    const fontSize = run.fontSize ?? DEFAULT_FONT_SIZE;
    const fontFamily = run.fontFamily ?? DEFAULT_FONT_FAMILY;

    // Build CSS font string
    const fontStyle = run.italic ? 'italic' : 'normal';
    const fontWeight = run.bold ? 'bold' : 'normal';
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}pt ${fontFamily}`;

    // Set text color
    ctx.fillStyle = run.color ? `#${run.color}` : '#000000';

    // Render text
    const textY = contentY + positioned.y + fontSize;
    ctx.fillText(run.text, x, textY);

    // Advance x position
    const textWidth = ctx.measureText(run.text).width;

    // Draw underline
    if (run.underline) {
      ctx.beginPath();
      ctx.moveTo(x, textY + 2);
      ctx.lineTo(x + textWidth, textY + 2);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw strikethrough
    if (run.strikethrough) {
      ctx.beginPath();
      const strikeY = textY - fontSize * 0.35;
      ctx.moveTo(x, strikeY);
      ctx.lineTo(x + textWidth, strikeY);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    x += textWidth;
  }
}
