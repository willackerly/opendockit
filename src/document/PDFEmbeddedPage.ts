/**
 * PDFEmbeddedPage — stub for embedded page support.
 *
 * Previously delegated entirely to pdf-lib. Now that pdf-lib is removed,
 * embedPdf/embedPage/embedPages throw "not implemented" errors.
 * This class is retained for type compatibility with existing consumer code.
 */

export class PDFEmbeddedPage {
  readonly _width: number;
  readonly _height: number;

  /** @internal */
  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
  }

  get ref(): never {
    throw new Error('PDFEmbeddedPage.ref is not available. Use copyPages() instead of embedPdf().');
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  scale(factor: number): { width: number; height: number } {
    return { width: this._width * factor, height: this._height * factor };
  }

  size(): { width: number; height: number } {
    return { width: this._width, height: this._height };
  }

  async embed(): Promise<void> {
    // No-op
  }
}
