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
import {
  renderTextBody,
  measureTextBodyHeight,
  toRoman,
  toAlpha,
  formatAutoNumber,
} from '../text-renderer.js';
import { createMockRenderContext } from './mock-canvas.js';
import { DiagnosticEmitter } from '../../../diagnostics/index.js';

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
    rtl?: boolean;
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
      rtl: extras?.rtl,
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
    expect(rctx.ctx.font).toContain('48px'); // 36pt * 96/72 = 48px
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
    // The font string format is: "italic bold 32px \"Arial\"" (24pt * 96/72 = 32px)
    expect(rctx.ctx.font).toContain('italic');
    expect(rctx.ctx.font).toContain('bold');
    expect(rctx.ctx.font).toContain('32px');
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
  // Theme font placeholder resolution
  // -------------------------------------------------------------------------

  it('resolves +mj-lt theme font placeholder to major Latin font', () => {
    const rctx = createMockRenderContext();
    // Simulate an unresolved theme ref: fontFamily not set, latin has placeholder.
    const body = makeTextBody([
      makeParagraph([makeRun('ThemeFont', { fontFamily: undefined, latin: '+mj-lt' })]),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    // The mock theme has majorLatin: 'Calibri Light'.
    // Since resolveFont is identity, the font string should contain 'Calibri Light'.
    expect(rctx.ctx.font).toContain('Calibri Light');
    expect(rctx.ctx.font).not.toContain('+mj-lt');
  });

  it('resolves +mn-lt theme font placeholder to minor Latin font', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([
      makeParagraph([makeRun('MinorFont', { fontFamily: undefined, latin: '+mn-lt' })]),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    // The mock theme has minorLatin: 'Calibri'.
    expect(rctx.ctx.font).toContain('Calibri');
    expect(rctx.ctx.font).not.toContain('+mn-lt');
  });

  it('resolves theme font placeholder in fontFamily field', () => {
    const rctx = createMockRenderContext();
    // Even if fontFamily itself has the placeholder (edge case).
    const body = makeTextBody([
      makeParagraph([makeRun('ThemeFamilyRef', { fontFamily: '+mj-lt', latin: undefined })]),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    expect(rctx.ctx.font).toContain('Calibri Light');
    expect(rctx.ctx.font).not.toContain('+mj-lt');
  });

  it('passes through unresolvable theme font ref gracefully', () => {
    const rctx = createMockRenderContext();
    // +mn-cs is not defined in the minimal mock theme (no minorComplexScript).
    const body = makeTextBody([
      makeParagraph([makeRun('CSFont', { fontFamily: undefined, latin: '+mn-cs' })]),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    // Should fall through to the original placeholder (not crash), since the
    // theme doesn't have minorComplexScript defined.
    const allText = allFillTexts(rctx.ctx._calls);
    expect(allText).toContain('CSFont');
  });

  it('resolves theme font placeholder in textDefaults', () => {
    const rctx = createMockRenderContext();
    // Set textDefaults with a theme font ref in defaultCharacterProperties.
    rctx.textDefaults = {
      levels: {
        0: {
          defaultCharacterProperties: {
            fontFamily: undefined,
            latin: '+mj-lt',
            fontSize: 1800,
          },
        },
      },
    };
    // Run with no explicit font — should inherit from textDefaults.
    const body = makeTextBody([
      makeParagraph([makeRun('Inherited', { fontFamily: undefined, latin: undefined })]),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    expect(rctx.ctx.font).toContain('Calibri Light');
    expect(rctx.ctx.font).not.toContain('+mj-lt');
  });

  it('resolves theme font placeholder in bullet font', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([
      makeParagraph([makeRun('BulletItem')], 'left', {
        bulletProperties: {
          type: 'char',
          char: '\u2022',
          font: '+mn-lt',
        },
      }),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    // The bullet should render, and its font should be resolved.
    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    const bulletCall = fillTexts.find((c) => (c.args[0] as string).includes('\u2022'));
    expect(bulletCall).toBeDefined();
    // The bullet's font shouldn't contain the raw placeholder.
    // Note: We can't easily check the bullet's font string directly since
    // ctx.font is overwritten by subsequent runs, but we verify no crash.
    const allText = allFillTexts(rctx.ctx._calls);
    expect(allText).toContain('BulletItem');
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

  it('clips to the bounds rectangle when autoFit is shrink', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Clipped')])], { autoFit: 'shrink' });

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

  it('does not clip when autoFit is none (allows overflow)', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Overflow')])]);

    renderTextBody(body, rctx, BOUNDS);

    const clipCalls = filterCalls(rctx.ctx._calls, 'clip');
    expect(clipCalls.length).toBe(0);
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
    expect(normalFont).toContain('24px'); // 18pt * 96/72 = 24px

    rctx.ctx._calls.length = 0;

    renderTextBody(bodyScaled, rctx, BOUNDS);
    const scaledFont = rctx.ctx.font;
    expect(scaledFont).toContain('12px'); // 9pt * 96/72 = 12px
  });

  it('does not apply font scale when autoFit is not shrink', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('NoScale')])], {
      autoFit: 'spAutoFit',
      fontScale: 50, // should be ignored since autoFit is not 'shrink'
    });

    renderTextBody(body, rctx, BOUNDS);

    // Font should still be the full 18pt = 24px.
    expect(rctx.ctx.font).toContain('24px');
  });

  it('applies line spacing reduction when autoFit is shrink', () => {
    const rctx = createMockRenderContext();
    // Two paragraphs with explicit 120% line spacing: measure the gap.
    // With 20% reduction it becomes 100% (clamped at minimum 100%).
    const lnSpc120: SpacingIR = { value: 120, unit: 'pct' };
    const bodyNormal = makeTextBody([
      makeParagraph([makeRun('First')], undefined, { lineSpacing: lnSpc120 }),
      makeParagraph([makeRun('Second')], undefined, { lineSpacing: lnSpc120 }),
    ]);
    const bodyReduced = makeTextBody(
      [
        makeParagraph([makeRun('First')], undefined, { lineSpacing: lnSpc120 }),
        makeParagraph([makeRun('Second')], undefined, { lineSpacing: lnSpc120 }),
      ],
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

  // -------------------------------------------------------------------------
  // Auto-numbering
  // -------------------------------------------------------------------------

  it('renders auto-numbered bullets with sequential indices', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([
      makeParagraph([makeRun('First')], 'left', {
        bulletProperties: { type: 'autoNum', autoNumType: 'arabicPeriod' },
      }),
      makeParagraph([makeRun('Second')], 'left', {
        bulletProperties: { type: 'autoNum', autoNumType: 'arabicPeriod' },
      }),
      makeParagraph([makeRun('Third')], 'left', {
        bulletProperties: { type: 'autoNum', autoNumType: 'arabicPeriod' },
      }),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    const bulletTexts = fillTexts.map((c) => c.args[0] as string).filter((t) => /^\d+\.\s/.test(t));

    expect(bulletTexts).toEqual(['1. ', '2. ', '3. ']);
  });

  it('respects startAt for auto-numbered bullets', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([
      makeParagraph([makeRun('A')], 'left', {
        bulletProperties: { type: 'autoNum', autoNumType: 'arabicPeriod', startAt: 5 },
      }),
      makeParagraph([makeRun('B')], 'left', {
        bulletProperties: { type: 'autoNum', autoNumType: 'arabicPeriod' },
      }),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    const bulletTexts = fillTexts.map((c) => c.args[0] as string).filter((t) => /^\d+\.\s/.test(t));

    expect(bulletTexts).toEqual(['5. ', '6. ']);
  });

  it('resets auto-number counters when a non-numbered paragraph intervenes', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([
      makeParagraph([makeRun('One')], 'left', {
        bulletProperties: { type: 'autoNum', autoNumType: 'arabicPeriod' },
      }),
      makeParagraph([makeRun('Two')], 'left', {
        bulletProperties: { type: 'autoNum', autoNumType: 'arabicPeriod' },
      }),
      // Non-numbered paragraph breaks the sequence.
      makeParagraph([makeRun('Break')]),
      makeParagraph([makeRun('Restart')], 'left', {
        bulletProperties: { type: 'autoNum', autoNumType: 'arabicPeriod' },
      }),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    const bulletTexts = fillTexts.map((c) => c.args[0] as string).filter((t) => /^\d+\.\s/.test(t));

    // After the break, numbering restarts from 1.
    expect(bulletTexts).toEqual(['1. ', '2. ', '1. ']);
  });

  it('tracks auto-number counters independently per level', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([
      makeParagraph([makeRun('L0-1')], 'left', {
        bulletProperties: { type: 'autoNum', autoNumType: 'arabicPeriod' },
      }),
      makeParagraph([makeRun('L1-1')], 'left', {
        bulletProperties: { type: 'autoNum', autoNumType: 'arabicPeriod' },
      }),
      makeParagraph([makeRun('L0-2')], 'left', {
        bulletProperties: { type: 'autoNum', autoNumType: 'arabicPeriod' },
      }),
    ]);
    // Set levels: first and third at level 0, second at level 1.
    body.paragraphs[0].properties.level = 0;
    body.paragraphs[1].properties.level = 1;
    body.paragraphs[2].properties.level = 0;

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    const bulletTexts = fillTexts.map((c) => c.args[0] as string).filter((t) => /^\d+\.\s/.test(t));

    // Level 0: 1, 2. Level 1: 1 (resets because level 0 paragraph resets deeper).
    expect(bulletTexts).toEqual(['1. ', '1. ', '2. ']);
  });

  it('renders roman numeral auto-numbers', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([
      makeParagraph([makeRun('A')], 'left', {
        bulletProperties: { type: 'autoNum', autoNumType: 'romanUcPeriod' },
      }),
      makeParagraph([makeRun('B')], 'left', {
        bulletProperties: { type: 'autoNum', autoNumType: 'romanUcPeriod' },
      }),
      makeParagraph([makeRun('C')], 'left', {
        bulletProperties: { type: 'autoNum', autoNumType: 'romanUcPeriod' },
      }),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    const bulletTexts = fillTexts
      .map((c) => c.args[0] as string)
      .filter((t) => /^[IVXLCDM]+\.\s/.test(t));

    expect(bulletTexts).toEqual(['I. ', 'II. ', 'III. ']);
  });

  it('renders alpha auto-numbers', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([
      makeParagraph([makeRun('X')], 'left', {
        bulletProperties: { type: 'autoNum', autoNumType: 'alphaLcPeriod' },
      }),
      makeParagraph([makeRun('Y')], 'left', {
        bulletProperties: { type: 'autoNum', autoNumType: 'alphaLcPeriod' },
      }),
      makeParagraph([makeRun('Z')], 'left', {
        bulletProperties: { type: 'autoNum', autoNumType: 'alphaLcPeriod' },
      }),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    const bulletTexts = fillTexts
      .map((c) => c.args[0] as string)
      .filter((t) => /^[a-z]+\.\s/.test(t));

    expect(bulletTexts).toEqual(['a. ', 'b. ', 'c. ']);
  });

  it('renders text outline (strokeText before fillText)', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([
      makeParagraph([
        makeRun('Outlined', {
          outline: {
            width: 19050, // ~1.5pt in EMU
            color: { r: 255, g: 0, b: 0, a: 1 },
          },
        }),
      ]),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    const calls = rctx.ctx._calls;
    const strokeCalls = filterCalls(calls, 'strokeText');
    const fillCalls = filterCalls(calls, 'fillText');

    // There should be exactly one strokeText call for the outlined text.
    expect(strokeCalls.length).toBe(1);
    expect(strokeCalls[0].args[0]).toBe('Outlined');

    // There should be exactly one fillText call for the outlined text.
    const outlinedFillCalls = fillCalls.filter((c) => c.args[0] === 'Outlined');
    expect(outlinedFillCalls.length).toBe(1);

    // strokeText must come BEFORE fillText (stroke behind fill).
    const strokeIdx = calls.findIndex(
      (c) => c.method === 'strokeText' && c.args[0] === 'Outlined'
    );
    const fillIdx = calls.findIndex(
      (c) => c.method === 'fillText' && c.args[0] === 'Outlined'
    );
    expect(strokeIdx).toBeLessThan(fillIdx);
  });

  it('does not render strokeText when no outline is set', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Plain text')])]);

    renderTextBody(body, rctx, BOUNDS);

    const strokeCalls = filterCalls(rctx.ctx._calls, 'strokeText');
    expect(strokeCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Auto-numbering helper unit tests
// ---------------------------------------------------------------------------

describe('toRoman', () => {
  it('converts basic values', () => {
    expect(toRoman(1)).toBe('i');
    expect(toRoman(4)).toBe('iv');
    expect(toRoman(5)).toBe('v');
    expect(toRoman(9)).toBe('ix');
    expect(toRoman(10)).toBe('x');
    expect(toRoman(14)).toBe('xiv');
    expect(toRoman(40)).toBe('xl');
    expect(toRoman(50)).toBe('l');
    expect(toRoman(90)).toBe('xc');
    expect(toRoman(100)).toBe('c');
    expect(toRoman(400)).toBe('cd');
    expect(toRoman(500)).toBe('d');
    expect(toRoman(900)).toBe('cm');
    expect(toRoman(1000)).toBe('m');
  });

  it('converts complex values', () => {
    expect(toRoman(3)).toBe('iii');
    expect(toRoman(58)).toBe('lviii');
    expect(toRoman(1994)).toBe('mcmxciv');
    expect(toRoman(3999)).toBe('mmmcmxcix');
  });

  it('returns string representation for out-of-range values', () => {
    expect(toRoman(0)).toBe('0');
    expect(toRoman(-1)).toBe('-1');
    expect(toRoman(4000)).toBe('4000');
  });
});

describe('toAlpha', () => {
  it('converts single-letter values', () => {
    expect(toAlpha(1)).toBe('a');
    expect(toAlpha(2)).toBe('b');
    expect(toAlpha(26)).toBe('z');
  });

  it('converts multi-letter values', () => {
    expect(toAlpha(27)).toBe('aa');
    expect(toAlpha(28)).toBe('ab');
    expect(toAlpha(52)).toBe('az');
    expect(toAlpha(53)).toBe('ba');
    expect(toAlpha(702)).toBe('zz');
    expect(toAlpha(703)).toBe('aaa');
  });

  it('returns string representation for values < 1', () => {
    expect(toAlpha(0)).toBe('0');
    expect(toAlpha(-1)).toBe('-1');
  });
});

describe('formatAutoNumber', () => {
  it('formats arabicPeriod', () => {
    expect(formatAutoNumber('arabicPeriod', 1)).toBe('1.');
    expect(formatAutoNumber('arabicPeriod', 10)).toBe('10.');
  });

  it('formats arabicParenR', () => {
    expect(formatAutoNumber('arabicParenR', 1)).toBe('1)');
    expect(formatAutoNumber('arabicParenR', 5)).toBe('5)');
  });

  it('formats arabicParenBoth', () => {
    expect(formatAutoNumber('arabicParenBoth', 3)).toBe('(3)');
  });

  it('formats romanUcPeriod', () => {
    expect(formatAutoNumber('romanUcPeriod', 1)).toBe('I.');
    expect(formatAutoNumber('romanUcPeriod', 4)).toBe('IV.');
    expect(formatAutoNumber('romanUcPeriod', 14)).toBe('XIV.');
  });

  it('formats romanLcPeriod', () => {
    expect(formatAutoNumber('romanLcPeriod', 1)).toBe('i.');
    expect(formatAutoNumber('romanLcPeriod', 4)).toBe('iv.');
  });

  it('formats romanUcParenR', () => {
    expect(formatAutoNumber('romanUcParenR', 3)).toBe('III)');
  });

  it('formats romanLcParenR', () => {
    expect(formatAutoNumber('romanLcParenR', 3)).toBe('iii)');
  });

  it('formats alphaUcPeriod', () => {
    expect(formatAutoNumber('alphaUcPeriod', 1)).toBe('A.');
    expect(formatAutoNumber('alphaUcPeriod', 26)).toBe('Z.');
  });

  it('formats alphaLcPeriod', () => {
    expect(formatAutoNumber('alphaLcPeriod', 1)).toBe('a.');
    expect(formatAutoNumber('alphaLcPeriod', 3)).toBe('c.');
  });

  it('formats alphaLcParenR', () => {
    expect(formatAutoNumber('alphaLcParenR', 1)).toBe('a)');
  });

  it('formats alphaUcParenR', () => {
    expect(formatAutoNumber('alphaUcParenR', 2)).toBe('B)');
  });

  it('formats alphaLcParenBoth', () => {
    expect(formatAutoNumber('alphaLcParenBoth', 3)).toBe('(c)');
  });

  it('formats alphaUcParenBoth', () => {
    expect(formatAutoNumber('alphaUcParenBoth', 3)).toBe('(C)');
  });

  it('defaults to arabicPeriod for undefined type', () => {
    expect(formatAutoNumber(undefined, 1)).toBe('1.');
    expect(formatAutoNumber(undefined, 7)).toBe('7.');
  });

  it('defaults to arabicPeriod for unknown type', () => {
    expect(formatAutoNumber('unknownType', 5)).toBe('5.');
  });
});

// ---------------------------------------------------------------------------
// Vertical text direction
// ---------------------------------------------------------------------------

describe('renderTextBody — vertical text direction', () => {
  it('applies 90° CW rotation for vert mode', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Hello')])], { vert: 'vert' });

    renderTextBody(body, rctx, BOUNDS);

    // Should have translate-rotate-translate sequence for 90° CW
    const rotateCalls = filterCalls(rctx.ctx._calls, 'rotate');
    expect(rotateCalls.length).toBeGreaterThanOrEqual(1);
    // The vert rotation should be PI/2 (90° CW)
    expect(rotateCalls.some((c) => Math.abs((c.args[0] as number) - Math.PI / 2) < 0.001)).toBe(
      true
    );
  });

  it('applies 90° CCW rotation for vert270 mode', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Hello')])], { vert: 'vert270' });

    renderTextBody(body, rctx, BOUNDS);

    const rotateCalls = filterCalls(rctx.ctx._calls, 'rotate');
    expect(rotateCalls.length).toBeGreaterThanOrEqual(1);
    // The vert270 rotation should be -PI/2 (90° CCW)
    expect(rotateCalls.some((c) => Math.abs((c.args[0] as number) + Math.PI / 2) < 0.001)).toBe(
      true
    );
  });

  it('does not apply rotation for horz mode', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Hello')])], { vert: 'horz' });

    renderTextBody(body, rctx, BOUNDS);

    const rotateCalls = filterCalls(rctx.ctx._calls, 'rotate');
    // No rotation should be applied (only body rotation would add rotate calls,
    // and we haven't set body.rotation)
    expect(rotateCalls.length).toBe(0);
  });

  it('does not apply rotation when vert is undefined', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Hello')])]);

    renderTextBody(body, rctx, BOUNDS);

    const rotateCalls = filterCalls(rctx.ctx._calls, 'rotate');
    expect(rotateCalls.length).toBe(0);
  });

  it('applies 90° CW rotation for eaVert mode (approximation)', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Hello')])], { vert: 'eaVert' });

    renderTextBody(body, rctx, BOUNDS);

    const rotateCalls = filterCalls(rctx.ctx._calls, 'rotate');
    expect(rotateCalls.length).toBeGreaterThanOrEqual(1);
    expect(rotateCalls.some((c) => Math.abs((c.args[0] as number) - Math.PI / 2) < 0.001)).toBe(
      true
    );
  });

  it('applies 90° CW rotation for wordArtVert mode (approximation)', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Hello')])], { vert: 'wordArtVert' });

    renderTextBody(body, rctx, BOUNDS);

    const rotateCalls = filterCalls(rctx.ctx._calls, 'rotate');
    expect(rotateCalls.length).toBeGreaterThanOrEqual(1);
    expect(rotateCalls.some((c) => Math.abs((c.args[0] as number) - Math.PI / 2) < 0.001)).toBe(
      true
    );
  });

  it('emits diagnostic for eaVert approximation', () => {
    const events: Array<{ category: string; message: string }> = [];
    const emitter = new DiagnosticEmitter((e: { category: string; message: string }) =>
      events.push(e)
    );
    const rctx = createMockRenderContext();
    rctx.diagnostics = emitter;
    const body = makeTextBody([makeParagraph([makeRun('Hello')])], { vert: 'eaVert' });

    renderTextBody(body, rctx, BOUNDS);

    expect(
      events.some((e) => e.category === 'partial-rendering' && e.message.includes('eaVert'))
    ).toBe(true);
  });

  it('emits diagnostic for wordArtVert approximation', () => {
    const events: Array<{ category: string; message: string }> = [];
    const emitter = new DiagnosticEmitter((e: { category: string; message: string }) =>
      events.push(e)
    );
    const rctx = createMockRenderContext();
    rctx.diagnostics = emitter;
    const body = makeTextBody([makeParagraph([makeRun('Hello')])], { vert: 'wordArtVert' });

    renderTextBody(body, rctx, BOUNDS);

    expect(
      events.some((e) => e.category === 'partial-rendering' && e.message.includes('wordArtVert'))
    ).toBe(true);
  });

  it('does not emit diagnostic for vert mode (fully supported)', () => {
    const events: Array<{ category: string; message: string }> = [];
    const emitter = new DiagnosticEmitter((e: { category: string; message: string }) =>
      events.push(e)
    );
    const rctx = createMockRenderContext();
    rctx.diagnostics = emitter;
    const body = makeTextBody([makeParagraph([makeRun('Hello')])], { vert: 'vert' });

    renderTextBody(body, rctx, BOUNDS);

    expect(events.some((e) => e.category === 'partial-rendering')).toBe(false);
  });

  it('translates around bounds center for vert rotation', () => {
    const rctx = createMockRenderContext();
    const bounds = { x: 100, y: 50, width: 200, height: 300 };
    const body = makeTextBody([makeParagraph([makeRun('Hello')])], { vert: 'vert' });

    renderTextBody(body, rctx, bounds);

    // Center of bounds: cx=200, cy=200
    const translateCalls = filterCalls(rctx.ctx._calls, 'translate');
    // Should have translate(cx, cy) before rotate and translate(-cx, -cy) after
    expect(translateCalls.length).toBeGreaterThanOrEqual(2);
    // First translate should be to center (200, 200)
    expect(translateCalls[0].args).toEqual([200, 200]);
    // Second translate should be back (-200, -200)
    expect(translateCalls[1].args).toEqual([-200, -200]);
  });

  it('still renders text after vert rotation', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Vertical')])], { vert: 'vert' });

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    expect(fillTexts.length).toBeGreaterThanOrEqual(1);
    expect(fillTexts.some((c) => c.args[0] === 'Vertical')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RTL (right-to-left) text rendering
// ---------------------------------------------------------------------------

describe('RTL text rendering', () => {
  it('renders RTL paragraph with mirrored alignment (left becomes right)', () => {
    const rctx = createMockRenderContext();
    // LTR left-aligned paragraph should start near x=0.
    const bodyLtr = makeTextBody([makeParagraph([makeRun('LTR')], 'left')]);

    renderTextBody(bodyLtr, rctx, BOUNDS);
    const ltrCalls = filterCalls(rctx.ctx._calls, 'fillText');
    const ltrCall = ltrCalls.find((c) => c.args[0] === 'LTR');
    expect(ltrCall).toBeDefined();
    const ltrX = ltrCall!.args[1] as number;

    rctx.ctx._calls.length = 0;

    // RTL paragraph with 'left' alignment should be mirrored to right-aligned.
    const bodyRtl = makeTextBody([makeParagraph([makeRun('RTL')], 'left', { rtl: true })]);

    renderTextBody(bodyRtl, rctx, BOUNDS);
    const rtlCalls = filterCalls(rctx.ctx._calls, 'fillText');
    const rtlCall = rtlCalls.find((c) => c.args[0] === 'RTL');
    expect(rtlCall).toBeDefined();
    const rtlX = rtlCall!.args[1] as number;

    // RTL 'left' alignment → right-aligned, so x should be much greater.
    expect(rtlX).toBeGreaterThan(ltrX);
    // Specifically, it should be past the center of the 400px bounds.
    expect(rtlX).toBeGreaterThan(BOUNDS.width / 2);
  });

  it('renders RTL paragraph with right alignment as left-aligned', () => {
    const rctx = createMockRenderContext();
    // LTR right-aligned paragraph.
    const bodyLtrRight = makeTextBody([makeParagraph([makeRun('LTR-R')], 'right')]);

    renderTextBody(bodyLtrRight, rctx, BOUNDS);
    const ltrRightCalls = filterCalls(rctx.ctx._calls, 'fillText');
    const ltrRightCall = ltrRightCalls.find((c) => c.args[0] === 'LTR-R');
    expect(ltrRightCall).toBeDefined();
    const ltrRightX = ltrRightCall!.args[1] as number;

    rctx.ctx._calls.length = 0;

    // RTL paragraph with 'right' alignment should be mirrored to left-aligned.
    const bodyRtlRight = makeTextBody([makeParagraph([makeRun('RTL-R')], 'right', { rtl: true })]);

    renderTextBody(bodyRtlRight, rctx, BOUNDS);
    const rtlRightCalls = filterCalls(rctx.ctx._calls, 'fillText');
    const rtlRightCall = rtlRightCalls.find((c) => c.args[0] === 'RTL-R');
    expect(rtlRightCall).toBeDefined();
    const rtlRightX = rtlRightCall!.args[1] as number;

    // RTL 'right' alignment → left-aligned, so x should be near 0.
    expect(rtlRightX).toBeLessThan(ltrRightX);
    expect(rtlRightX).toBeLessThan(BOUNDS.width / 2);
  });

  it('renders RTL paragraph with center alignment unchanged', () => {
    const rctx = createMockRenderContext();
    // LTR centered paragraph.
    const bodyLtrCenter = makeTextBody([makeParagraph([makeRun('Center')], 'center')]);

    renderTextBody(bodyLtrCenter, rctx, BOUNDS);
    const ltrCalls = filterCalls(rctx.ctx._calls, 'fillText');
    const ltrCall = ltrCalls.find((c) => c.args[0] === 'Center');
    expect(ltrCall).toBeDefined();
    const ltrX = ltrCall!.args[1] as number;

    rctx.ctx._calls.length = 0;

    // RTL centered paragraph — center alignment should remain the same.
    const bodyRtlCenter = makeTextBody([
      makeParagraph([makeRun('Center')], 'center', { rtl: true }),
    ]);

    renderTextBody(bodyRtlCenter, rctx, BOUNDS);
    const rtlCalls = filterCalls(rctx.ctx._calls, 'fillText');
    const rtlCall = rtlCalls.find((c) => c.args[0] === 'Center');
    expect(rtlCall).toBeDefined();
    const rtlX = rtlCall!.args[1] as number;

    // Center alignment should produce the same x position for both LTR and RTL.
    expect(rtlX).toBeCloseTo(ltrX, 1);
  });

  it('renders RTL bullet on the right side of the text', () => {
    const rctx = createMockRenderContext();
    // LTR bullet.
    const bodyLtr = makeTextBody([
      makeParagraph([makeRun('Item')], 'left', {
        bulletProperties: { type: 'char', char: '\u2022' },
      }),
    ]);

    renderTextBody(bodyLtr, rctx, BOUNDS);
    const ltrCalls = filterCalls(rctx.ctx._calls, 'fillText');
    const ltrBullet = ltrCalls.find((c) => (c.args[0] as string).includes('\u2022'));
    const ltrItem = ltrCalls.find((c) => c.args[0] === 'Item');
    expect(ltrBullet).toBeDefined();
    expect(ltrItem).toBeDefined();
    const ltrBulletX = ltrBullet!.args[1] as number;
    const ltrItemX = ltrItem!.args[1] as number;

    // LTR: bullet should be to the left of text.
    expect(ltrBulletX).toBeLessThanOrEqual(ltrItemX);

    rctx.ctx._calls.length = 0;

    // RTL bullet.
    const bodyRtl = makeTextBody([
      makeParagraph([makeRun('Item')], 'left', {
        bulletProperties: { type: 'char', char: '\u2022' },
        rtl: true,
      }),
    ]);

    renderTextBody(bodyRtl, rctx, BOUNDS);
    const rtlCalls = filterCalls(rctx.ctx._calls, 'fillText');
    const rtlBullet = rtlCalls.find((c) => (c.args[0] as string).includes('\u2022'));
    const rtlItem = rtlCalls.find((c) => c.args[0] === 'Item');
    expect(rtlBullet).toBeDefined();
    expect(rtlItem).toBeDefined();
    const rtlBulletX = rtlBullet!.args[1] as number;
    const rtlItemX = rtlItem!.args[1] as number;

    // RTL: bullet should be to the right of text.
    expect(rtlBulletX).toBeGreaterThan(rtlItemX);
  });

  it('does not affect non-RTL paragraphs', () => {
    const rctx = createMockRenderContext();
    // Two paragraphs: one RTL, one LTR.
    const body = makeTextBody([
      makeParagraph([makeRun('RTL-Text')], 'left', { rtl: true }),
      makeParagraph([makeRun('LTR-Text')], 'left'),
    ]);

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    const rtlCall = fillTexts.find((c) => c.args[0] === 'RTL-Text');
    const ltrCall = fillTexts.find((c) => c.args[0] === 'LTR-Text');
    expect(rtlCall).toBeDefined();
    expect(ltrCall).toBeDefined();

    const rtlX = rtlCall!.args[1] as number;
    const ltrX = ltrCall!.args[1] as number;

    // RTL paragraph (left alignment mirrored to right) should be far right.
    // LTR paragraph should be near the left edge.
    expect(rtlX).toBeGreaterThan(ltrX);
  });
});

// ---------------------------------------------------------------------------
// Tab stop tests
// ---------------------------------------------------------------------------

describe('renderTextBody — tab stops', () => {
  it('advances past tab character using default tab size (1 inch)', () => {
    const rctx = createMockRenderContext();
    // Text: "A\tB" — A is rendered, then tab advances to next tab stop, then B.
    const body = makeTextBody([makeParagraph([makeRun('A\tB')])]);

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    // Should have separate fragments: 'A', '\t' (not drawn as visible text), 'B'.
    const textFragments = fillTexts.map((c) => c.args[0] as string);
    expect(textFragments).toContain('A');
    expect(textFragments).toContain('B');

    // B should start at a position past A — at least at the default tab stop (1 inch = 96px).
    const aCall = fillTexts.find((c) => c.args[0] === 'A');
    const bCall = fillTexts.find((c) => c.args[0] === 'B');
    expect(aCall).toBeDefined();
    expect(bCall).toBeDefined();
    const bX = bCall!.args[1] as number;
    const aX = aCall!.args[1] as number;
    // B should be significantly past A (at least one tab stop away).
    expect(bX).toBeGreaterThan(aX + 50);
  });

  it('advances past tab using custom defaultTabSize from bodyProperties', () => {
    const rctx = createMockRenderContext();
    // defaultTabSize = 457200 EMU = 0.5 inch = 48px at dpi 96
    const body = makeTextBody([makeParagraph([makeRun('X\tY')])], {
      defaultTabSize: 457200,
    });

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    const xCall = fillTexts.find((c) => c.args[0] === 'X');
    const yCall = fillTexts.find((c) => c.args[0] === 'Y');
    expect(xCall).toBeDefined();
    expect(yCall).toBeDefined();
    const yX = yCall!.args[1] as number;
    const xX = xCall!.args[1] as number;
    // Y should be past X. With 0.5-inch tab at 96dpi = 48px grid.
    expect(yX).toBeGreaterThan(xX);
  });

  it('uses explicit tabStops from paragraph properties', () => {
    const rctx = createMockRenderContext();
    // Set explicit tab stop at 2 inches (1828800 EMU = 192px).
    const body = makeTextBody([
      {
        runs: [makeRun('A\tB')],
        properties: {
          alignment: 'left' as const,
          tabStops: [{ position: 1828800, alignment: 'l' as const }],
        },
      },
    ]);

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    const bCall = fillTexts.find((c) => c.args[0] === 'B');
    expect(bCall).toBeDefined();
    // B should be near 192px (the explicit tab stop position).
    const bX = bCall!.args[1] as number;
    expect(bX).toBeGreaterThanOrEqual(190);
    expect(bX).toBeLessThan(200);
  });

  it('handles multiple tabs in sequence', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('A\t\tB')])]);

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    const aCall = fillTexts.find((c) => c.args[0] === 'A');
    const bCall = fillTexts.find((c) => c.args[0] === 'B');
    expect(aCall).toBeDefined();
    expect(bCall).toBeDefined();

    // With two tabs, B should be at least 2 tab stops away from A.
    const bX = bCall!.args[1] as number;
    const aX = aCall!.args[1] as number;
    expect(bX).toBeGreaterThan(aX + 100);
  });

  it('renders text without tabs normally (no regression)', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Hello World')])]);

    renderTextBody(body, rctx, BOUNDS);

    const fillTexts = filterCalls(rctx.ctx._calls, 'fillText');
    const allText = fillTexts.map((c) => c.args[0] as string).join('');
    expect(allText).toContain('Hello');
    expect(allText).toContain('World');
  });
});

// ---------------------------------------------------------------------------
// measureTextBodyHeight tests
// ---------------------------------------------------------------------------

describe('measureTextBodyHeight', () => {
  it('returns positive height for a single paragraph', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([makeParagraph([makeRun('Hello')])]);

    const height = measureTextBodyHeight(body, rctx, BOUNDS);

    // Should be > 0 (at least one line of text).
    expect(height).toBeGreaterThan(0);
  });

  it('returns taller height for more paragraphs', () => {
    const rctx = createMockRenderContext();
    const body1 = makeTextBody([makeParagraph([makeRun('One')])]);
    const body2 = makeTextBody([
      makeParagraph([makeRun('One')]),
      makeParagraph([makeRun('Two')]),
      makeParagraph([makeRun('Three')]),
    ]);

    const height1 = measureTextBodyHeight(body1, rctx, BOUNDS);
    const height2 = measureTextBodyHeight(body2, rctx, BOUNDS);

    expect(height2).toBeGreaterThan(height1);
  });

  it('includes insets in the returned height', () => {
    const rctx = createMockRenderContext();
    const bodyNoInset = makeTextBody([makeParagraph([makeRun('Test')])]);
    const bodyWithInset = makeTextBody([makeParagraph([makeRun('Test')])], {
      topInset: 914400, // 1 inch = 96px
      bottomInset: 914400,
    });

    const heightNoInset = measureTextBodyHeight(bodyNoInset, rctx, BOUNDS);
    const heightWithInset = measureTextBodyHeight(bodyWithInset, rctx, BOUNDS);

    // With 2 inch insets total, the height should be at least 192px more.
    expect(heightWithInset).toBeGreaterThan(heightNoInset + 180);
  });

  it('returns inset-only height for empty text body', () => {
    const rctx = createMockRenderContext();
    const body = makeTextBody([], {
      topInset: 457200, // 0.5 inch = 48px
      bottomInset: 457200,
    });

    const height = measureTextBodyHeight(body, rctx, BOUNDS);

    // Should be approximately topInset + bottomInset = 96px.
    expect(height).toBeCloseTo(96, 0);
  });

  it('accounts for larger font size', () => {
    const rctx = createMockRenderContext();
    const bodySmall = makeTextBody([makeParagraph([makeRun('Text', { fontSize: 1200 })])]);
    const bodyLarge = makeTextBody([makeParagraph([makeRun('Text', { fontSize: 3600 })])]);

    const heightSmall = measureTextBodyHeight(bodySmall, rctx, BOUNDS);
    const heightLarge = measureTextBodyHeight(bodyLarge, rctx, BOUNDS);

    expect(heightLarge).toBeGreaterThan(heightSmall);
  });
});
