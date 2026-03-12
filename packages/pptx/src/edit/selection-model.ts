/**
 * Selection model — text selection state for in-canvas text editing.
 *
 * Tracks anchor and focus positions within a DrawingML text body, supporting
 * collapsed cursors and range selections. Pure logic — no DOM or canvas deps.
 */

/** A position within a DrawingML text body. */
export interface TextPosition {
  /** Paragraph index within the text body. */
  paragraphIndex: number;
  /** Run index within the paragraph. */
  runIndex: number;
  /** Character offset within the run. */
  charOffset: number;
}

/**
 * SelectionModel — manages cursor position and text selection state.
 *
 * Supports collapsed selections (cursor), extended range selections,
 * and ordered range retrieval for text manipulation operations.
 */
export class SelectionModel {
  private _anchor: TextPosition | null = null;
  private _focus: TextPosition | null = null;

  /** Set cursor position (collapsed selection). */
  setCursor(pos: TextPosition): void {
    this._anchor = { ...pos };
    this._focus = { ...pos };
  }

  /** Extend selection from anchor to new focus. */
  extendTo(pos: TextPosition): void {
    this._focus = { ...pos };
  }

  /** The anchor (start) of the selection. */
  get anchor(): TextPosition | null {
    return this._anchor;
  }

  /** The focus (end / caret) of the selection. */
  get focus(): TextPosition | null {
    return this._focus;
  }

  /** Whether there is a non-collapsed selection (anchor !== focus). */
  get hasSelection(): boolean {
    if (!this._anchor || !this._focus) return false;
    return SelectionModel.compare(this._anchor, this._focus) !== 0;
  }

  /**
   * Get the selected range as [start, end] in document order.
   * Returns null if no selection exists.
   */
  getOrderedRange(): [TextPosition, TextPosition] | null {
    if (!this._anchor || !this._focus) return null;
    const cmp = SelectionModel.compare(this._anchor, this._focus);
    if (cmp <= 0) {
      return [{ ...this._anchor }, { ...this._focus }];
    }
    return [{ ...this._focus }, { ...this._anchor }];
  }

  /** Clear selection state. */
  clear(): void {
    this._anchor = null;
    this._focus = null;
  }

  /**
   * Compare two TextPositions in document order.
   *
   * @returns -1 if a is before b, 0 if equal, 1 if a is after b.
   */
  static compare(a: TextPosition, b: TextPosition): number {
    if (a.paragraphIndex !== b.paragraphIndex) {
      return a.paragraphIndex < b.paragraphIndex ? -1 : 1;
    }
    if (a.runIndex !== b.runIndex) {
      return a.runIndex < b.runIndex ? -1 : 1;
    }
    if (a.charOffset !== b.charOffset) {
      return a.charOffset < b.charOffset ? -1 : 1;
    }
    return 0;
  }
}
