/**
 * Unit tests for measureCursorPosition.
 *
 * Uses the same mock Canvas2D context as the text renderer tests to verify
 * that cursor position measurement returns correct coordinates within
 * rendered text bodies.
 */

import { describe, expect, it } from 'vitest';
import type {
  TextBodyIR,
  BodyPropertiesIR,
  ParagraphIR,
  RunIR,
  CharacterPropertiesIR,
} from '../../../ir/index.js';
import { measureCursorPosition } from '../text-renderer.js';
import { createMockRenderContext } from './mock-canvas.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BOUNDS = { x: 0, y: 0, width: 400, height: 300 };

const NO_INSET_BODY: BodyPropertiesIR = {
  wrap: 'square',
  leftInset: 0,
  rightInset: 0,
  topInset: 0,
  bottomInset: 0,
};

function makeRun(text: string, props: Partial<CharacterPropertiesIR> = {}): RunIR {
  return {
    kind: 'run',
    text,
    properties: { fontSize: 1800, ...props }, // 18pt default
  };
}

function makeParagraph(runs: RunIR[]): ParagraphIR {
  return {
    runs,
    properties: { alignment: 'left' },
  };
}

function makeTextBody(
  paragraphs: ParagraphIR[],
  bodyProps: Partial<BodyPropertiesIR> = {},
): TextBodyIR {
  return {
    paragraphs,
    bodyProperties: { ...NO_INSET_BODY, ...bodyProps },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('measureCursorPosition', () => {
  it('returns position at the start of text (offset 0)', () => {
    const rctx = createMockRenderContext();
    const textBody = makeTextBody([makeParagraph([makeRun('Hello')])]);

    const pos = measureCursorPosition(rctx.backend, textBody, {
      paragraphIndex: 0,
      runIndex: 0,
      charOffset: 0,
    }, BOUNDS, rctx);

    expect(pos).not.toBeNull();
    // At offset 0, x should be at the left edge (no text measured before cursor).
    expect(pos!.x).toBe(0);
    expect(pos!.y).toBe(0);
    expect(pos!.height).toBeGreaterThan(0);
  });

  it('returns position at the end of text', () => {
    const rctx = createMockRenderContext();
    const textBody = makeTextBody([makeParagraph([makeRun('Hello')])]);

    const pos = measureCursorPosition(rctx.backend, textBody, {
      paragraphIndex: 0,
      runIndex: 0,
      charOffset: 5,
    }, BOUNDS, rctx);

    expect(pos).not.toBeNull();
    // At offset 5, x should be after the full "Hello" text width.
    // Mock measureText returns text.length * sizePx * 0.5 (advance width).
    // 18pt at 96/72 dpi = 24px, each char = 12px, "Hello" = 60px (approx).
    expect(pos!.x).toBeGreaterThan(0);
    expect(pos!.y).toBe(0);
  });

  it('returns position between characters', () => {
    const rctx = createMockRenderContext();
    const textBody = makeTextBody([makeParagraph([makeRun('Hello')])]);

    const posAt2 = measureCursorPosition(rctx.backend, textBody, {
      paragraphIndex: 0,
      runIndex: 0,
      charOffset: 2,
    }, BOUNDS, rctx);

    const posAt4 = measureCursorPosition(rctx.backend, textBody, {
      paragraphIndex: 0,
      runIndex: 0,
      charOffset: 4,
    }, BOUNDS, rctx);

    expect(posAt2).not.toBeNull();
    expect(posAt4).not.toBeNull();
    // Position at offset 4 should be further right than at offset 2.
    expect(posAt4!.x).toBeGreaterThan(posAt2!.x);
    // Both on the same line.
    expect(posAt2!.y).toBe(posAt4!.y);
  });

  it('returns position in the second paragraph', () => {
    const rctx = createMockRenderContext();
    const textBody = makeTextBody([
      makeParagraph([makeRun('First')]),
      makeParagraph([makeRun('Second')]),
    ]);

    const posP0 = measureCursorPosition(rctx.backend, textBody, {
      paragraphIndex: 0,
      runIndex: 0,
      charOffset: 0,
    }, BOUNDS, rctx);

    const posP1 = measureCursorPosition(rctx.backend, textBody, {
      paragraphIndex: 1,
      runIndex: 0,
      charOffset: 0,
    }, BOUNDS, rctx);

    expect(posP0).not.toBeNull();
    expect(posP1).not.toBeNull();
    // Second paragraph should be below the first.
    expect(posP1!.y).toBeGreaterThan(posP0!.y);
  });

  it('returns position in the second run of a paragraph', () => {
    const rctx = createMockRenderContext();
    const textBody = makeTextBody([
      makeParagraph([makeRun('Hello '), makeRun('World')]),
    ]);

    // Cursor at start of second run (runIndex=1, charOffset=0).
    const pos = measureCursorPosition(rctx.backend, textBody, {
      paragraphIndex: 0,
      runIndex: 1,
      charOffset: 0,
    }, BOUNDS, rctx);

    expect(pos).not.toBeNull();
    // Should be after "Hello " but before "World".
    expect(pos!.x).toBeGreaterThan(0);
  });

  it('returns null for out-of-range paragraph index', () => {
    const rctx = createMockRenderContext();
    const textBody = makeTextBody([makeParagraph([makeRun('Hello')])]);

    const pos = measureCursorPosition(rctx.backend, textBody, {
      paragraphIndex: 5,
      runIndex: 0,
      charOffset: 0,
    }, BOUNDS, rctx);

    expect(pos).toBeNull();
  });

  it('returns null for negative paragraph index', () => {
    const rctx = createMockRenderContext();
    const textBody = makeTextBody([makeParagraph([makeRun('Hello')])]);

    const pos = measureCursorPosition(rctx.backend, textBody, {
      paragraphIndex: -1,
      runIndex: 0,
      charOffset: 0,
    }, BOUNDS, rctx);

    expect(pos).toBeNull();
  });

  it('handles vertical alignment (middle)', () => {
    const rctx = createMockRenderContext();
    const textBody = makeTextBody(
      [makeParagraph([makeRun('Hello')])],
      { verticalAlign: 'middle' },
    );

    const pos = measureCursorPosition(rctx.backend, textBody, {
      paragraphIndex: 0,
      runIndex: 0,
      charOffset: 0,
    }, BOUNDS, rctx);

    expect(pos).not.toBeNull();
    // With middle alignment, y should be offset from the top.
    expect(pos!.y).toBeGreaterThan(0);
  });

  it('accounts for body insets', () => {
    const rctx = createMockRenderContext();
    const insets = 91440; // 1 inch = 96px at 96dpi
    const textBody = makeTextBody(
      [makeParagraph([makeRun('Hello')])],
      { leftInset: insets, topInset: insets },
    );

    const pos = measureCursorPosition(rctx.backend, textBody, {
      paragraphIndex: 0,
      runIndex: 0,
      charOffset: 0,
    }, BOUNDS, rctx);

    expect(pos).not.toBeNull();
    // x and y should be offset by the inset.
    expect(pos!.x).toBeGreaterThan(0);
    expect(pos!.y).toBeGreaterThan(0);
  });
});
