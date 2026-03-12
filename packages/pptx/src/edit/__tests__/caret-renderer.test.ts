import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CaretRenderer } from '../caret-renderer.js';

/** Create a minimal mock CanvasRenderingContext2D. */
function createMockCtx(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D;
}

describe('CaretRenderer', () => {
  let caret: CaretRenderer;

  beforeEach(() => {
    vi.useFakeTimers();
    caret = new CaretRenderer();
  });

  afterEach(() => {
    caret.dispose();
    vi.useRealTimers();
  });

  it('is not visible initially', () => {
    expect(caret.isVisible).toBe(false);
  });

  it('show makes the caret visible and sets position', () => {
    caret.show(100, 200, 24);
    expect(caret.isVisible).toBe(true);
    expect(caret.position).toEqual({ x: 100, y: 200, height: 24 });
  });

  it('hide stops the caret', () => {
    caret.show(100, 200, 24);
    caret.hide();
    expect(caret.isVisible).toBe(false);
  });

  it('render draws a filled rect at the correct position when visible', () => {
    const ctx = createMockCtx();
    caret.show(50, 75, 20);

    caret.render(ctx);

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.fillStyle).toBe('#000');
    expect(ctx.fillRect).toHaveBeenCalledWith(50, 75, 2, 20);
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('render does not draw when hidden', () => {
    const ctx = createMockCtx();
    caret.render(ctx);

    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('blink toggles visibility on interval', () => {
    const ctx = createMockCtx();
    caret.show(10, 20, 16);

    // Initially visible (blink on).
    caret.render(ctx);
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);

    // After one blink interval, should be off.
    vi.advanceTimersByTime(530);
    (ctx.fillRect as ReturnType<typeof vi.fn>).mockClear();
    caret.render(ctx);
    expect(ctx.fillRect).not.toHaveBeenCalled();

    // After another interval, should be on again.
    vi.advanceTimersByTime(530);
    caret.render(ctx);
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
  });

  it('moveTo updates position and resets blink to visible', () => {
    caret.show(10, 20, 16);

    // Advance to blink-off state.
    vi.advanceTimersByTime(530);

    // Move resets blink to on.
    caret.moveTo(30, 40, 18);
    expect(caret.position).toEqual({ x: 30, y: 40, height: 18 });

    const ctx = createMockCtx();
    caret.render(ctx);
    expect(ctx.fillRect).toHaveBeenCalledWith(30, 40, 2, 18);
  });

  it('dispose cleans up the blink timer', () => {
    caret.show(10, 20, 16);
    caret.dispose();

    expect(caret.isVisible).toBe(false);

    // Advancing timers should not cause errors.
    vi.advanceTimersByTime(5000);
  });

  it('color can be customized', () => {
    const ctx = createMockCtx();
    caret.color = 'red';
    caret.show(10, 20, 16);
    caret.render(ctx);

    expect(ctx.fillStyle).toBe('red');
  });

  it('show after hide restarts blinking', () => {
    const ctx = createMockCtx();
    caret.show(10, 20, 16);
    caret.hide();
    caret.show(50, 60, 24);

    caret.render(ctx);
    expect(ctx.fillRect).toHaveBeenCalledWith(50, 60, 2, 24);
  });
});
