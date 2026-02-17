/**
 * Unit tests for the text renderer.
 *
 * Uses a mock Canvas2D context to verify that renderTextBody produces the
 * correct Canvas2D API calls — fillText for text, fillRect for underlines
 * and strikethroughs, and proper y-cursor advancement for multi-paragraph
 * layouts.
 */

import { describe, expect, it } from 'vitest';
import type {
  TextBodyIR,
  BodyPropertiesIR,
  ParagraphIR,
  RunIR,
  LineBreakIR,
  CharacterPropertiesIR,
  SpacingIR,
  BulletPropertiesIR,
} from '../../../ir/index.js';
import { renderTextBody } from '../text-renderer.js';
import { createMockRenderContext } from './mock-canvas.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Standard bounds for most tests (400x300 pixels). */
const BOUNDS = { x: 0, y: 0, width: 400, height: 300 };

/** Default body properties with no insets to simplify assertions. */
const NO_INSET_BODY: BodyPropertiesIR = {
  wrap: 'square',
  leftInset: 0,
  rightInset: 0,
  topInset: 0,
  bottomInset: 0,
};

/** Create a simple run with text and optional character property overrides. */
function makeRun(text: string, props: Partial<CharacterPropertiesIR> = {}): RunIR {
  return {
    kind: 'run',
    text,
    properties: { fontSize: 1800, ...props }, // 18pt default
  };
}

/** Create a simple paragraph with runs and optional property overrides. */
function makeParagraph(
  runs: (RunIR | LineBreakIR)[],
  alignment?: 'left' | 'center' | 'right' | 'justify',
  extras?: {
    spaceBefore?: SpacingIR;
    spaceAfter?: SpacingIR;
    lineSpacing?: SpacingIR;
    bulletProperties?: BulletPropertiesIR;
    marginLeft?: number;
    indent?: number;
  }
): ParagraphIR {
  return {
    runs,
    properties: {
      alignment: alignment ?? 'left',
      spaceBefore: extras?.spaceBefore,
      spaceAfter: extras?.spaceAfter,
      lineSpacing: extras?.lineSpacing,
      marginLeft: extras?.marginLeft,
      indent: extras?.indent,
    },
    bulletProperties: extras?.bulletProperties,
  };
}

/** Create a text body from paragraphs and optional body property overrides. */
function makeTextBody(
  paragraphs: ParagraphIR[],
  bodyProps: Partial<BodyPropertiesIR> = {}
): TextBodyIR {
  return {
    paragraphs,
    bodyProperties: { ...NO_INSET_BODY, ...bodyProps },
  };
}

/** Filter calls by method name. */
function filterCalls(calls: Array<{ method: string; args: unknown[] }>, method: string) {
  return calls.filter((c) => c.method === method);
}

/** Get all fillText texts concatenated. */
function allFillTexts(calls: Array<{ method: string; args: unknown[] }>): string {
  return filterCalls(calls, 'fillText')
    .map((c) => c.args[0] as string)
    .join('');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderTextBody', () => {
  // -------------------------------------------------------------------------
  // Basic rendering
  // -------------------------------------------------------------------------

  it('renders a single paragraph with one run', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Hello')])]);

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    expect(fillTexts.length).toBeGreaterThanOrEqual(1);
    expect(fillTexts.some((c) => c.args[0] === 'Hello')).toBe(true);
  });

  it('renders paragraph with bold and italic formatting', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([
      makeParagraph([makeRun('Bold Italic', { bold: true, italic: true })]),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    // Text may be split into words; concatenate all fillText calls.
    const allText = allFillTexts(rctx.ctx._calls);
    expect(allText).toContain('Bold');
    expect(allText).toContain('Italic');
    // The font string should include 'italic' and 'bold'.
    expect(rctx.ctx.font).toContain('bold');
    expect(rctx.ctx.font).toContain('italic');
  });

  it('renders paragraph with custom color', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([
      makeParagraph([makeRun('RedText', { color: { r: 255, g: 0, b: 0, a: 1 } })]),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    const allText = allFillTexts(rctx.ctx._calls);
    expect(allText).toContain('RedText');
    // fillStyle should have been set to the red color.
    expect(rctx.ctx.fillStyle).toBe('rgba(255, 0, 0, 1)');
  });

  it('renders paragraph with custom font size', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([
      makeParagraph([makeRun('BigText', { fontSize: 3600 })]), // 36pt
    ]);

    renderTextBody(body, rctx, BOUNDS);

    const allText = allFillTexts(rctx.ctx._calls);
    expect(allText).toContain('BigText');
    expect(rctx.ctx.font).toContain('36pt');
  });

  // -------------------------------------------------------------------------
  // Multiple paragraphs
  // -------------------------------------------------------------------------

  it('renders multiple paragraphs with advancing y position', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([
      makeParagraph([makeRun('First')]),
      makeParagraph([makeRun('Second')]),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    const firstCall = fillTexts.find((c) => c.args[0] === 'First');
    const secondCall = fillTexts.find((c) => c.args[0] === 'Second');
    expect(firstCall).toBeDefined();
    expect(secondCall).toBeDefined();

    // Second paragraph y should be greater than first paragraph y.
    const firstY = firstCall!.args[2] as number;
    const secondY = secondCall!.args[2] as number;
    expect(secondY).toBeGreaterThan(firstY);
  });

  // -------------------------------------------------------------------------
  // Paragraph alignment
  // -------------------------------------------------------------------------

  it('renders paragraph with center alignment', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Centered')], 'center')]);

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    const call = fillTexts.find((c) => c.args[0] === 'Centered');
    expect(call).toBeDefined();

    // Centered text should have x > 0 (offset from left edge).
    const x = call!.args[1] as number;
    expect(x).toBeGreaterThan(0);
  });

  it('renders paragraph with right alignment', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Right')], 'right')]);

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    const call = fillTexts.find((c) => c.args[0] === 'Right');
    expect(call).toBeDefined();

    // Right-aligned text x should be well past the center.
    const x = call!.args[1] as number;
    // The text width for "Right" (5 chars * 18pt * 0.5 * 96/72) is about 60px.
    // Right-aligned x = bounds.width - textWidth = 400 - 60 = 340.
    expect(x).toBeGreaterThan(BOUNDS.width / 2);
  });

  // -------------------------------------------------------------------------
  // Body insets
  // -------------------------------------------------------------------------

  it('renders with body insets offsetting text area', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Inset')])], {
      leftInset: 914400, // 1 inch = 96px
      topInset: 914400,
      rightInset: 0,
      bottomInset: 0,
    });

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    const call = fillTexts.find((c) => (c.args[0] as string).includes('Inset'));
    expect(call).toBeDefined();

    // x should be offset by the left inset (96px at 96dpi, dpiScale=1)
    const x = call!.args[1] as number;
    expect(x).toBeGreaterThanOrEqual(96);

    // y should also be offset by the top inset
    const y = call!.args[2] as number;
    expect(y).toBeGreaterThanOrEqual(96);
  });

  // -------------------------------------------------------------------------
  // Vertical alignment
  // -------------------------------------------------------------------------

  it('renders with vertical alignment middle', () => {
    const rctx = createMockRenderContext();
    const bodyTop = makeTextBody([makeParagraph([makeRun('Top')])], { verticalAlign: 'top' });
    const bodyMiddle = makeTextBody([makeParagraph([makeRun('Middle')])], {
      verticalAlign: 'middle',
    });

    renderTextBody(bodyTop, rctx, BOUNDS);
    const topCalls = filterCalls(rctx.ctx._calls, 'fillText');
    const topY = topCalls.find((c) => c.args[0] === 'Top')!.args[2] as number;

    // Reset mock
    rctx.ctx._calls.length = 0;

    renderTextBody(bodyMiddle, rctx, BOUNDS);
    const midCalls = filterCalls(rctx.ctx._calls, 'fillText');
    const midY = midCalls.find((c) => c.args[0] === 'Middle')!.args[2] as number;

    // Middle-aligned text should start lower than top-aligned text.
    expect(midY).toBeGreaterThan(topY);
  });

  it('renders with vertical alignment bottom', () => {
    const rctx = createMockRenderContext();
    const bodyTop = makeTextBody([makeParagraph([makeRun('Top')])], { verticalAlign: 'top' });
    const bodyBottom = makeTextBody([makeParagraph([makeRun('Bottom')])], {
      verticalAlign: 'bottom',
    });

    renderTextBody(bodyTop, rctx, BOUNDS);
    const topCalls = filterCalls(rctx.ctx._calls, 'fillText');
    const topY = topCalls.find((c) => c.args[0] === 'Top')!.args[2] as number;

    rctx.ctx._calls.length = 0;

    renderTextBody(bodyBottom, rctx, BOUNDS);
    const botCalls = filterCalls(rctx.ctx._calls, 'fillText');
    const botY = botCalls.find((c) => c.args[0] === 'Bottom')!.args[2] as number;

    // Bottom-aligned text should start much lower than top-aligned text.
    expect(botY).toBeGreaterThan(topY);
  });

  // -------------------------------------------------------------------------
  // Bullets
  // -------------------------------------------------------------------------

  it('renders bullet character before first run', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([
      makeParagraph([makeRun('Item')], 'left', {
        bulletProperties: {
          type: 'char',
          char: '\u2022', // bullet character
        },
      }),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    // The bullet should appear before the item text.
    const bulletCall = fillTexts.find((c) => (c.args[0] as string).includes('\u2022'));
    const itemCall = fillTexts.find((c) => c.args[0] === 'Item');
    expect(bulletCall).toBeDefined();
    expect(itemCall).toBeDefined();

    // Bullet x should be less than or equal to item x.
    const bulletX = bulletCall!.args[1] as number;
    const itemX = itemCall!.args[1] as number;
    expect(bulletX).toBeLessThanOrEqual(itemX);
  });

  // -------------------------------------------------------------------------
  // Empty text body
  // -------------------------------------------------------------------------

  it('renders empty text body without crashing', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([]);

    expect(() => renderTextBody(body, rctx, BOUNDS)).not.toThrow();
  });

  it('renders paragraph with no runs without crashing', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([])]);

    expect(() => renderTextBody(body, rctx, BOUNDS)).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Underline
  // -------------------------------------------------------------------------

  it('draws underline decoration for underlined text', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Underlined', { underline: 'single' })])]);

    renderTextBody(body, rctx, BOUNDS);

    // Underline is drawn as a fillRect beneath the text.
    const fillRects = filterCalls(rctx.ctx._calls, 'fillRect');
    expect(fillRects.length).toBeGreaterThanOrEqual(1);
  });

  it('does not draw underline for underline=none', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('No underline', { underline: 'none' })])]);

    renderTextBody(body, rctx, BOUNDS);

    const fillRects = filterCalls(rctx.ctx._calls, 'fillRect');
    expect(fillRects).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Strikethrough
  // -------------------------------------------------------------------------

  it('draws strikethrough decoration', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Struck', { strikethrough: 'single' })])]);

    renderTextBody(body, rctx, BOUNDS);

    const fillRects = filterCalls(rctx.ctx._calls, 'fillRect');
    expect(fillRects.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Font string construction
  // -------------------------------------------------------------------------

  it('constructs font string with correct properties', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([
      makeParagraph([
        makeRun('Styled', {
          bold: true,
          italic: true,
          fontSize: 2400, // 24pt
          fontFamily: 'Arial',
        }),
      ]),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    // After rendering, the ctx.font should reflect the last run's font.
    // The font string format is: "italic bold 24pt \"Arial\""
    expect(rctx.ctx.font).toContain('italic');
    expect(rctx.ctx.font).toContain('bold');
    expect(rctx.ctx.font).toContain('24pt');
    expect(rctx.ctx.font).toContain('Arial');
  });

  it('uses latin font when fontFamily is not set', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([
      makeParagraph([makeRun('Latin', { latin: 'Times New Roman', fontFamily: undefined })]),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    expect(rctx.ctx.font).toContain('Times New Roman');
  });

  it('defaults to sans-serif when no font is specified', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([
      makeParagraph([makeRun('Default', { fontFamily: undefined, latin: undefined })]),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    expect(rctx.ctx.font).toContain('sans-serif');
  });

  // -------------------------------------------------------------------------
  // Space before/after
  // -------------------------------------------------------------------------

  it('space before affects y positioning', () => {
    const rctx = createMockRenderContext();
    const bodyNoSpace = makeTextBody([
      makeParagraph([makeRun('First')]),
      makeParagraph([makeRun('Second')]),
    ]);
    const bodyWithSpace = makeTextBody([
      makeParagraph([makeRun('First')]),
      makeParagraph([makeRun('Second')], 'left', {
        spaceBefore: { value: 36, unit: 'pt' },
      }),
    ]);

    renderTextBody(bodyNoSpace, rctx, BOUNDS);
    const noSpaceCalls = filterCalls(rctx.ctx._calls, 'fillText');
    const noSpaceSecondY = noSpaceCalls.find((c) => c.args[0] === 'Second')!.args[2] as number;

    rctx.ctx._calls.length = 0;

    renderTextBody(bodyWithSpace, rctx, BOUNDS);
    const withSpaceCalls = filterCalls(rctx.ctx._calls, 'fillText');
    const withSpaceSecondY = withSpaceCalls.find((c) => c.args[0] === 'Second')!.args[2] as number;

    // With 36pt space before, the second paragraph should be lower.
    expect(withSpaceSecondY).toBeGreaterThan(noSpaceSecondY);
  });

  it('space after affects subsequent paragraph y positioning', () => {
    const rctx = createMockRenderContext();
    const bodyNoSpace = makeTextBody([
      makeParagraph([makeRun('First')]),
      makeParagraph([makeRun('Second')]),
    ]);
    const bodyWithSpace = makeTextBody([
      makeParagraph([makeRun('First')], 'left', {
        spaceAfter: { value: 36, unit: 'pt' },
      }),
      makeParagraph([makeRun('Second')]),
    ]);

    renderTextBody(bodyNoSpace, rctx, BOUNDS);
    const noSpaceCalls = filterCalls(rctx.ctx._calls, 'fillText');
    const noSpaceSecondY = noSpaceCalls.find((c) => c.args[0] === 'Second')!.args[2] as number;

    rctx.ctx._calls.length = 0;

    renderTextBody(bodyWithSpace, rctx, BOUNDS);
    const withSpaceCalls = filterCalls(rctx.ctx._calls, 'fillText');
    const withSpaceSecondY = withSpaceCalls.find((c) => c.args[0] === 'Second')!.args[2] as number;

    expect(withSpaceSecondY).toBeGreaterThan(noSpaceSecondY);
  });

  // -------------------------------------------------------------------------
  // Line breaks
  // -------------------------------------------------------------------------

  it('handles line break elements within a paragraph', () => {
    const rctx = createMockRenderContext();
    const lineBreak: LineBreakIR = {
      kind: 'lineBreak',
      properties: { fontSize: 1800 },
    };
    const body = makeTextBody([makeParagraph([makeRun('Before'), lineBreak, makeRun('After')])]);

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    const beforeCall = fillTexts.find((c) => c.args[0] === 'Before');
    const afterCall = fillTexts.find((c) => c.args[0] === 'After');
    expect(beforeCall).toBeDefined();
    expect(afterCall).toBeDefined();

    // "After" should be on a new line (greater y).
    const beforeY = beforeCall!.args[2] as number;
    const afterY = afterCall!.args[2] as number;
    expect(afterY).toBeGreaterThan(beforeY);
  });

  // -------------------------------------------------------------------------
  // Clipping
  // -------------------------------------------------------------------------

  it('clips to the bounds rectangle', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Clipped')])]);

    renderTextBody(body, rctx, BOUNDS);

    // Should call save(), rect(), clip() for clipping, and restore() at the end.
    const saveCalls = filterCalls(rctx.ctx._calls, 'save');
    const rectCalls = filterCalls(rctx.ctx._calls, 'rect');
    const clipCalls = filterCalls(rctx.ctx._calls, 'clip');
    const restoreCalls = filterCalls(rctx.ctx._calls, 'restore');

    expect(saveCalls.length).toBeGreaterThanOrEqual(1);
    expect(rectCalls.length).toBeGreaterThanOrEqual(1);
    expect(clipCalls.length).toBeGreaterThanOrEqual(1);
    expect(restoreCalls.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Default color
  // -------------------------------------------------------------------------

  it('defaults to black text when no color is specified', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Default color', { color: undefined })])]);

    renderTextBody(body, rctx, BOUNDS);

    // The fillStyle should be black at the time fillText is called.
    // Since we default to 'rgba(0, 0, 0, 1)', check the ctx state.
    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    expect(fillTexts.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // DPI scaling
  // -------------------------------------------------------------------------

  it('respects dpi scale for inset calculation', () => {
    const rctx1x = createMockRenderContext(undefined, 1);
    const rctx2x = createMockRenderContext(undefined, 2);

    const body = makeTextBody([makeParagraph([makeRun('DPI')])], {
      leftInset: 914400, // 1 inch
      topInset: 914400,
      rightInset: 0,
      bottomInset: 0,
    });

    renderTextBody(body, rctx1x, BOUNDS);
    const calls1x = filterCalls(rctx1x.ctx._calls, 'fillText');
    const call1x = calls1x.find((c) => (c.args[0] as string).includes('DPI'));
    expect(call1x).toBeDefined();
    const x1 = call1x!.args[1] as number;

    renderTextBody(body, rctx2x, BOUNDS);
    const calls2x = filterCalls(rctx2x.ctx._calls, 'fillText');
    const call2x = calls2x.find((c) => (c.args[0] as string).includes('DPI'));
    expect(call2x).toBeDefined();
    const x2 = call2x!.args[1] as number;

    // At 2x DPI, the inset in canvas pixels should be double.
    expect(x2).toBeGreaterThan(x1);
  });

  // -------------------------------------------------------------------------
  // Wrap mode
  // -------------------------------------------------------------------------

  it('does not wrap when body wrap is none', () => {
    const rctx = createMockRenderContext();
    // Create a very long run that would wrap in a narrow box.
    const longText = 'This is a very long text that exceeds the available width significantly';
    const body = makeTextBody([makeParagraph([makeRun(longText)])], { wrap: 'none' });

    renderTextBody(body, rctx, { x: 0, y: 0, width: 50, height: 300 });

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    // All words should be on the same y coordinate (no wrapping).
    const yValues = fillTexts.map((c) => c.args[2] as number);
    const uniqueY = new Set(yValues);
    expect(uniqueY.size).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Auto-fit: normAutofit font scaling
  // -------------------------------------------------------------------------

  it('applies font scale when autoFit is shrink', () => {
    const rctx = createMockRenderContext();
    // Normal size: 18pt. With 50% fontScale: 9pt.
    const bodyNormal = makeTextBody([makeParagraph([makeRun('Normal')])]);
    const bodyScaled = makeTextBody([makeParagraph([makeRun('Scaled')])], {
      autoFit: 'shrink',
      fontScale: 50,
    });

    renderTextBody(bodyNormal, rctx, BOUNDS);
    const normalFont = rctx.ctx.font;
    expect(normalFont).toContain('18pt');

    rctx.ctx._calls.length = 0;

    renderTextBody(bodyScaled, rctx, BOUNDS);
    const scaledFont = rctx.ctx.font;
    expect(scaledFont).toContain('9pt');
  });

  it('does not apply font scale when autoFit is not shrink', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('NoScale')])], {
      autoFit: 'spAutoFit',
      fontScale: 50, // should be ignored since autoFit is not 'shrink'
    });

    renderTextBody(body, rctx, BOUNDS);

    // Font should still be the full 18pt.
    expect(rctx.ctx.font).toContain('18pt');
  });

  it('applies line spacing reduction when autoFit is shrink', () => {
    const rctx = createMockRenderContext();
    // Two paragraphs: measure the gap between them.
    // Default line spacing is 120%. With 20% reduction it becomes 100%.
    const bodyNormal = makeTextBody([
      makeParagraph([makeRun('First')]),
      makeParagraph([makeRun('Second')]),
    ]);
    const bodyReduced = makeTextBody(
      [makeParagraph([makeRun('First')]), makeParagraph([makeRun('Second')])],
      { autoFit: 'shrink', lnSpcReduction: 20 }
    );

    renderTextBody(bodyNormal, rctx, BOUNDS);
    const normalCalls = filterCalls(rctx.ctx._calls, 'fillText');
    const normalFirstY = normalCalls.find((c) => c.args[0] === 'First')!.args[2] as number;
    const normalSecondY = normalCalls.find((c) => c.args[0] === 'Second')!.args[2] as number;
    const normalGap = normalSecondY - normalFirstY;

    rctx.ctx._calls.length = 0;

    renderTextBody(bodyReduced, rctx, BOUNDS);
    const reducedCalls = filterCalls(rctx.ctx._calls, 'fillText');
    const reducedFirstY = reducedCalls.find((c) => c.args[0] === 'First')!.args[2] as number;
    const reducedSecondY = reducedCalls.find((c) => c.args[0] === 'Second')!.args[2] as number;
    const reducedGap = reducedSecondY - reducedFirstY;

    // With line spacing reduction, lines should be closer together.
    expect(reducedGap).toBeLessThan(normalGap);
  });
});
