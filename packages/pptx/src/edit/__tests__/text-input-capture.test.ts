/**
 * Unit tests for TextInputCapture.
 *
 * Uses lightweight DOM mocks since the test environment does not include jsdom.
 * The mock accurately simulates HTMLTextAreaElement behavior for event handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextInputCapture } from '../text-input-capture.js';

// ---------------------------------------------------------------------------
// Minimal DOM mocks
// ---------------------------------------------------------------------------

interface MockEventTarget {
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatchEvent: (event: { type: string; data?: string; key?: string }) => void;
}

function createMockTextarea(): HTMLTextAreaElement & MockEventTarget {
  const listeners = new Map<string, Set<(e: unknown) => void>>();

  const el = {
    value: '',
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
    remove: vi.fn(),
    addEventListener: vi.fn((type: string, handler: (e: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
    }),
    removeEventListener: vi.fn((type: string, handler: (e: unknown) => void) => {
      listeners.get(type)?.delete(handler);
    }),
    dispatchEvent(event: { type: string; data?: string; key?: string; bubbles?: boolean }) {
      const handlers = listeners.get(event.type);
      if (handlers) {
        for (const h of handlers) h(event);
      }
    },
  };

  return el as unknown as HTMLTextAreaElement & MockEventTarget;
}

function createMockContainer(textarea: HTMLTextAreaElement): HTMLElement {
  const children: HTMLTextAreaElement[] = [];

  return {
    ownerDocument: {
      createElement: vi.fn(() => textarea),
    },
    appendChild: vi.fn((child: HTMLTextAreaElement) => {
      children.push(child);
    }),
    querySelector: vi.fn((selector: string) => {
      if (selector === 'textarea') return children[0] ?? null;
      return null;
    }),
    querySelectorAll: vi.fn((selector: string) => {
      if (selector === 'textarea') return children;
      return [];
    }),
  } as unknown as HTMLElement;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TextInputCapture', () => {
  let capture: TextInputCapture;
  let textarea: HTMLTextAreaElement & MockEventTarget;
  let container: HTMLElement;

  beforeEach(() => {
    textarea = createMockTextarea();
    container = createMockContainer(textarea);
    capture = new TextInputCapture();
  });

  it('attach creates a hidden textarea with correct attributes', () => {
    capture.attach(container);

    expect(container.ownerDocument.createElement).toHaveBeenCalledWith('textarea');
    expect(container.appendChild).toHaveBeenCalledWith(textarea);
    expect(textarea.style.position).toBe('absolute');
    expect(textarea.style.left).toBe('-9999px');
    expect(textarea.style.opacity).toBe('0');
    expect(textarea.setAttribute).toHaveBeenCalledWith('autocomplete', 'off');
    expect(textarea.setAttribute).toHaveBeenCalledWith('autocorrect', 'off');
    expect(textarea.setAttribute).toHaveBeenCalledWith('spellcheck', 'false');
    expect(capture.isAttached).toBe(true);
  });

  it('detach removes the textarea and cleans up listeners', () => {
    capture.attach(container);
    capture.detach();

    expect(textarea.remove).toHaveBeenCalled();
    expect(textarea.removeEventListener).toHaveBeenCalled();
    expect(capture.isAttached).toBe(false);
  });

  it('input events fire the onInput callback', () => {
    const handler = vi.fn();
    capture.onInput(handler);
    capture.attach(container);

    textarea.value = 'hello';
    textarea.dispatchEvent({ type: 'input', bubbles: true });

    expect(handler).toHaveBeenCalledWith('hello');
  });

  it('input events clear the textarea after firing', () => {
    capture.onInput(vi.fn());
    capture.attach(container);

    textarea.value = 'test';
    textarea.dispatchEvent({ type: 'input', bubbles: true });

    expect(textarea.value).toBe('');
  });

  it('keydown events fire the onKeyDown callback', () => {
    const handler = vi.fn();
    capture.onKeyDown(handler);
    capture.attach(container);

    textarea.dispatchEvent({ type: 'keydown', key: 'Backspace' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].key).toBe('Backspace');
  });

  it('compositionend events fire the onCompositionEnd callback', () => {
    const handler = vi.fn();
    capture.onCompositionEnd(handler);
    capture.attach(container);

    textarea.dispatchEvent({ type: 'compositionstart' });
    textarea.dispatchEvent({ type: 'compositionend', data: '\u4F60\u597D' });

    expect(handler).toHaveBeenCalledWith('\u4F60\u597D');
  });

  it('input events are suppressed during IME composition', () => {
    const inputHandler = vi.fn();
    capture.onInput(inputHandler);
    capture.attach(container);

    textarea.dispatchEvent({ type: 'compositionstart' });
    textarea.value = '\u4F60';
    textarea.dispatchEvent({ type: 'input', bubbles: true });

    expect(inputHandler).not.toHaveBeenCalled();
  });

  it('focus delegates to the textarea', () => {
    capture.attach(container);
    capture.focus();
    expect(textarea.focus).toHaveBeenCalled();
  });

  it('blur delegates to the textarea', () => {
    capture.attach(container);
    capture.blur();
    expect(textarea.blur).toHaveBeenCalled();
  });

  it('attach is idempotent (does not create duplicate textareas)', () => {
    capture.attach(container);
    capture.attach(container);
    expect(container.appendChild).toHaveBeenCalledTimes(1);
  });

  it('detach is safe when not attached', () => {
    expect(() => capture.detach()).not.toThrow();
  });

  it('clear empties the textarea value', () => {
    capture.attach(container);
    textarea.value = 'some text';
    capture.clear();
    expect(textarea.value).toBe('');
  });

  it('multiple attach/detach cycles work', () => {
    capture.attach(container);
    expect(capture.isAttached).toBe(true);
    capture.detach();
    expect(capture.isAttached).toBe(false);

    // Re-create textarea mock for second attach (original was "removed").
    const textarea2 = createMockTextarea();
    const container2 = createMockContainer(textarea2);
    capture.attach(container2);
    expect(capture.isAttached).toBe(true);
    capture.detach();
    expect(capture.isAttached).toBe(false);
  });
});
