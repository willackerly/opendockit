/**
 * Caret renderer — draws a blinking text cursor on the canvas.
 *
 * Renders a thin vertical bar at the cursor position within a text body.
 * Supports blinking at a configurable interval and position updates.
 */

/** Default blink interval in milliseconds (standard 530ms on/off). */
const DEFAULT_BLINK_INTERVAL_MS = 530;

/** Caret width in canvas pixels. */
const CARET_WIDTH_PX = 2;

/**
 * CaretRenderer — renders a blinking caret on a Canvas2D context.
 *
 * Call `show()` to position and start blinking, `hide()` to stop,
 * and `render()` each frame to draw the caret when visible.
 */
export class CaretRenderer {
  private _x = 0;
  private _y = 0;
  private _height = 0;
  private _visible = false;
  private _blinkOn = true;
  private _blinkInterval: ReturnType<typeof setInterval> | null = null;
  private _color = '#000';

  /**
   * Show the caret at the given position and start blinking.
   *
   * @param x - Left edge of the caret in canvas pixels.
   * @param y - Top edge of the caret in canvas pixels.
   * @param height - Caret height in canvas pixels.
   */
  show(x: number, y: number, height: number): void {
    this._x = x;
    this._y = y;
    this._height = height;
    this._visible = true;
    this._blinkOn = true;
    this._startBlink();
  }

  /** Stop blinking and hide the caret. */
  hide(): void {
    this._visible = false;
    this._blinkOn = false;
    this._stopBlink();
  }

  /**
   * Draw the caret on the canvas context.
   *
   * Should be called every frame. Only draws when the caret is visible
   * and the blink state is "on".
   */
  render(ctx: CanvasRenderingContext2D): void {
    if (!this._visible || !this._blinkOn) return;
    ctx.save();
    ctx.fillStyle = this._color;
    ctx.fillRect(this._x, this._y, CARET_WIDTH_PX, this._height);
    ctx.restore();
  }

  /**
   * Update caret position without restarting the blink cycle.
   *
   * @param x - New left edge in canvas pixels.
   * @param y - New top edge in canvas pixels.
   * @param height - New height in canvas pixels.
   */
  moveTo(x: number, y: number, height: number): void {
    this._x = x;
    this._y = y;
    this._height = height;
    // Reset blink to "on" when moving so the caret is immediately visible.
    this._blinkOn = true;
  }

  /** Set the caret color (CSS color string). */
  set color(value: string) {
    this._color = value;
  }

  /** Current caret position and dimensions. */
  get position(): { x: number; y: number; height: number } {
    return { x: this._x, y: this._y, height: this._height };
  }

  /** Whether the caret is currently visible (showing, not just blink-on). */
  get isVisible(): boolean {
    return this._visible;
  }

  /** Clean up the blink timer. */
  dispose(): void {
    this.hide();
  }

  private _startBlink(): void {
    this._stopBlink();
    this._blinkInterval = setInterval(() => {
      this._blinkOn = !this._blinkOn;
    }, DEFAULT_BLINK_INTERVAL_MS);
  }

  private _stopBlink(): void {
    if (this._blinkInterval !== null) {
      clearInterval(this._blinkInterval);
      this._blinkInterval = null;
    }
  }
}
