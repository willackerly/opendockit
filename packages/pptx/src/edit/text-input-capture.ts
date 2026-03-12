/**
 * Text input capture — hidden textarea for keyboard and IME input.
 *
 * Creates an off-screen textarea element that captures keyboard events,
 * including IME composition for CJK and other complex input methods.
 * The textarea is kept invisible but focusable to intercept all text input.
 */

/**
 * TextInputCapture — hidden textarea overlay for capturing text input.
 *
 * Positioned off-screen (left: -9999px) and kept focused during text editing
 * mode. Forwards input, composition, and keydown events to registered handlers.
 */
export class TextInputCapture {
  private _textarea: HTMLTextAreaElement | null = null;
  private _onInput: ((text: string) => void) | null = null;
  private _onCompositionEnd: ((text: string) => void) | null = null;
  private _onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private _composing = false;

  // Bound event handlers for proper cleanup.
  private _handleInput = (): void => {
    if (this._composing) return;
    const text = this._textarea?.value ?? '';
    if (text && this._onInput) {
      this._onInput(text);
    }
    this.clear();
  };

  private _handleCompositionStart = (): void => {
    this._composing = true;
  };

  private _handleCompositionEnd = (e: CompositionEvent): void => {
    this._composing = false;
    if (this._onCompositionEnd) {
      this._onCompositionEnd(e.data ?? '');
    }
    this.clear();
  };

  private _handleKeyDown = (e: KeyboardEvent): void => {
    if (this._onKeyDown) {
      this._onKeyDown(e);
    }
  };

  /**
   * Create and attach the hidden textarea to the DOM.
   *
   * The textarea is styled to be invisible but focusable:
   * - Positioned off-screen (left: -9999px)
   * - 1x1 pixel, transparent
   * - No autocomplete, autocorrect, or spellcheck
   */
  attach(container: HTMLElement): void {
    if (this._textarea) return;

    const ta = container.ownerDocument.createElement('textarea');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    ta.style.width = '1px';
    ta.style.height = '1px';
    ta.style.opacity = '0';
    ta.style.padding = '0';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.resize = 'none';
    ta.style.overflow = 'hidden';
    ta.setAttribute('autocomplete', 'off');
    ta.setAttribute('autocorrect', 'off');
    ta.setAttribute('spellcheck', 'false');
    ta.setAttribute('tabindex', '-1');
    ta.setAttribute('aria-hidden', 'true');

    ta.addEventListener('input', this._handleInput);
    ta.addEventListener('compositionstart', this._handleCompositionStart);
    ta.addEventListener('compositionend', this._handleCompositionEnd);
    ta.addEventListener('keydown', this._handleKeyDown);

    container.appendChild(ta);
    this._textarea = ta;
  }

  /** Remove the textarea from the DOM and clean up event listeners. */
  detach(): void {
    if (!this._textarea) return;

    this._textarea.removeEventListener('input', this._handleInput);
    this._textarea.removeEventListener('compositionstart', this._handleCompositionStart);
    this._textarea.removeEventListener('compositionend', this._handleCompositionEnd);
    this._textarea.removeEventListener('keydown', this._handleKeyDown);
    this._textarea.remove();
    this._textarea = null;
    this._composing = false;
  }

  /** Focus the textarea to start capturing input. */
  focus(): void {
    this._textarea?.focus();
  }

  /** Blur the textarea to stop capturing input. */
  blur(): void {
    this._textarea?.blur();
  }

  /** Register a handler for non-composition text input. */
  onInput(handler: (text: string) => void): void {
    this._onInput = handler;
  }

  /** Register a handler for IME composition end events. */
  onCompositionEnd(handler: (text: string) => void): void {
    this._onCompositionEnd = handler;
  }

  /** Register a handler for keydown events. */
  onKeyDown(handler: (e: KeyboardEvent) => void): void {
    this._onKeyDown = handler;
  }

  /** Clear the textarea content after processing input. */
  clear(): void {
    if (this._textarea) {
      this._textarea.value = '';
    }
  }

  /** Whether the textarea is currently attached to the DOM. */
  get isAttached(): boolean {
    return this._textarea !== null;
  }
}
