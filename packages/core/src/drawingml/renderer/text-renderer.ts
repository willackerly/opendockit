/**
 * Text renderer — renders DrawingML text bodies to a Canvas2D context.
 *
 * Takes a TextBodyIR and renders paragraphs and runs within a bounding
 * rectangle. Handles font styling, line wrapping, paragraph alignment,
 * vertical alignment, bullets, underlines, and strikethroughs.
 *
 * Phase 1 scope:
 * - Basic text rendering with font, size, color, bold, italic
 * - Word-boundary line wrapping (when body wrap is 'square')
 * - Paragraph alignment (left, center, right)
 * - Vertical alignment (top, middle, bottom)
 * - Bullet characters
 * - Space before/after paragraphs
 * - Underline and strikethrough decorations
 * - Baseline shift (superscript/subscript)
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 21.1.2 (Text)
 *            Apache POI DrawTextParagraph / DrawTextFragment
 */

import type {
  TextBodyIR,
  ParagraphIR,
  CharacterPropertiesIR,
  SpacingIR,
  ResolvedColor,
  RgbaColor,
} from '../../ir/index.js';
import type { RenderContext } from './render-context.js';
import { emuToScaledPx } from './render-context.js';
import { hundredthsPtToPt } from '../../units/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default font size in points when none is specified. */
const DEFAULT_FONT_SIZE_PT = 18;

/** Default body insets in EMU (OOXML default: 0.1 inches = 91,440 EMU). */
const DEFAULT_INSET_EMU = 91440;

/** Default line spacing as percentage (120% = 1.2x font size). */
const DEFAULT_LINE_SPACING_PCT = 120;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** A measured text fragment ready for drawing. */
interface TextFragment {
  text: string;
  fontString: string;
  fillStyle: string;
  widthPx: number;
  fontSizePt: number;
  props: CharacterPropertiesIR;
}

/** A wrapped line consisting of one or more text fragments. */
interface WrappedLine {
  fragments: TextFragment[];
  widthPx: number;
  heightPx: number;
  ascentPx: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a ResolvedColor as a CSS rgba() string. */
function colorToRgba(c: ResolvedColor): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
}

/**
 * Resolve a font size from CharacterPropertiesIR to typographic points.
 * DrawingML stores font sizes in hundredths of a point (e.g. 1800 = 18pt).
 *
 * @param props - Character properties containing font size.
 * @param fontScale - Optional font scale factor from normAutofit (percentage,
 *                    e.g. 80 means 80%). Applied multiplicatively to the
 *                    resolved font size.
 */
function resolveFontSizePt(props: CharacterPropertiesIR, fontScale?: number): number {
  let sizePt: number;
  if (props.fontSize != null) {
    sizePt = hundredthsPtToPt(props.fontSize);
  } else {
    sizePt = DEFAULT_FONT_SIZE_PT;
  }
  if (fontScale != null) {
    sizePt = sizePt * (fontScale / 100);
  }
  return sizePt;
}

/**
 * Build a CSS font string for Canvas2D from character properties.
 *
 * Canvas2D accepts font strings in the format:
 *   [font-style] [font-weight] font-size font-family
 *
 * We use `pt` units which Canvas2D handles natively.
 *
 * @param fontScale - Optional font scale factor from normAutofit (percentage).
 */
function buildFontString(
  props: CharacterPropertiesIR,
  resolveFont: (name: string) => string,
  fontScale?: number
): string {
  const style = props.italic ? 'italic ' : '';
  const weight = props.bold ? 'bold ' : '';
  const sizePt = resolveFontSizePt(props, fontScale);
  const family = props.fontFamily || props.latin || 'sans-serif';
  const resolved = resolveFont(family);
  return `${style}${weight}${sizePt}pt "${resolved}"`;
}

/**
 * Convert a point value to canvas pixels accounting for DPI scale.
 * 1pt = 1/72 inch. At 96 DPI: 1pt = 96/72 = 1.333... px.
 */
function ptToCanvasPx(pt: number, dpiScale: number): number {
  return pt * (96 / 72) * dpiScale;
}

/**
 * Resolve spacing (space-before, space-after) to canvas pixels.
 *
 * SpacingIR can be either absolute points or a percentage of the font size.
 * For percentage spacing, 100 = 100% of font size = single spacing.
 */
function resolveSpacingPx(
  spacing: SpacingIR | undefined,
  fontSizePt: number,
  dpiScale: number
): number {
  if (!spacing) return 0;
  if (spacing.unit === 'pt') {
    return ptToCanvasPx(spacing.value, dpiScale);
  }
  // Percentage: value of 100 = 100% of font size
  return ptToCanvasPx((spacing.value / 100) * fontSizePt, dpiScale);
}

/**
 * Resolve line spacing to a multiplier.
 *
 * SpacingIR with unit 'pct': value 100 = single space (1.0x).
 * SpacingIR with unit 'pt': absolute spacing returned as-is via special path.
 *
 * Returns percentage value (e.g. 120 for 1.2x).
 *
 * @param lnSpcReduction - Optional line spacing reduction from normAutofit
 *                         (percentage points to subtract, e.g. 20 reduces
 *                         120% to 100%).
 */
function resolveLineSpacingPct(spacing: SpacingIR | undefined, lnSpcReduction?: number): number {
  let result: number;
  if (!spacing) {
    result = DEFAULT_LINE_SPACING_PCT;
  } else if (spacing.unit === 'pct') {
    result = spacing.value;
  } else {
    // For absolute pt spacing, we return it as a negative sentinel
    // so the caller knows to use it directly.
    return -spacing.value;
  }
  if (lnSpcReduction != null) {
    result = Math.max(100, result - lnSpcReduction);
  }
  return result;
}

/**
 * Measure a text fragment using the Canvas2D context.
 */
function measureFragment(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  fontString: string
): number {
  ctx.font = fontString;
  return ctx.measureText(text).width;
}

/**
 * Get the default font size for a paragraph by inspecting its runs.
 * Falls back to DEFAULT_FONT_SIZE_PT if no runs have a font size.
 *
 * @param fontScale - Optional font scale factor from normAutofit (percentage).
 */
function getParagraphFontSizePt(paragraph: ParagraphIR, fontScale?: number): number {
  for (const run of paragraph.runs) {
    if (run.properties.fontSize != null) {
      const basePt = hundredthsPtToPt(run.properties.fontSize);
      return fontScale != null ? basePt * (fontScale / 100) : basePt;
    }
  }
  const basePt = DEFAULT_FONT_SIZE_PT;
  return fontScale != null ? basePt * (fontScale / 100) : basePt;
}

/**
 * Default color map used when no explicit color map is provided.
 *
 * Maps scheme color roles to theme color slots, matching the OOXML default:
 *   bg1 → lt1, tx1 → dk1, bg2 → lt2, tx2 → dk2
 */
const DEFAULT_COLOR_MAP: Record<string, string> = {
  bg1: 'lt1',
  tx1: 'dk1',
  bg2: 'lt2',
  tx2: 'dk2',
};

/**
 * Resolve the default text color from the theme via the color map.
 *
 * When text has no explicit color, OOXML specifies that it should use the
 * 'tx1' role, which maps (via the slide's color map) to a theme color slot
 * — typically 'dk1'. This ensures that text on dark backgrounds resolves
 * to white/light colors rather than always defaulting to black.
 *
 * Resolution chain: tx1 → colorMap['tx1'] → theme.colorScheme[slot]
 *
 * Falls back to black (rgba(0, 0, 0, 1)) if the theme or color map is
 * missing the required entries.
 */
function resolveDefaultTextColor(rctx: RenderContext): string {
  const colorMap = rctx.colorMap ?? DEFAULT_COLOR_MAP;
  const themeSlot = colorMap['tx1'] ?? 'dk1';
  const scheme = rctx.theme?.colorScheme;
  if (scheme) {
    const color = (scheme as unknown as Record<string, RgbaColor | undefined>)[themeSlot];
    if (color) {
      return colorToRgba(color);
    }
  }
  return 'rgba(0, 0, 0, 1)';
}

// ---------------------------------------------------------------------------
// Line wrapping
// ---------------------------------------------------------------------------

/**
 * Break paragraph runs into wrapped lines that fit within the given width.
 *
 * Uses a word-boundary wrapping strategy: splits on spaces, measures each
 * word, and wraps when the current line would overflow.
 *
 * @param fontScale - Optional font scale from normAutofit (percentage).
 * @param lnSpcReduction - Optional line spacing reduction from normAutofit (percentage).
 */
function wrapParagraph(
  paragraph: ParagraphIR,
  rctx: RenderContext,
  availableWidth: number,
  bulletWidth: number,
  fontScale?: number,
  lnSpcReduction?: number
): WrappedLine[] {
  const { ctx, dpiScale, resolveFont } = rctx;
  const lines: WrappedLine[] = [];
  let currentFragments: TextFragment[] = [];
  let currentLineWidth = 0;
  let currentLineHeight = 0;
  let currentAscent = 0;
  let isFirstLine = true;

  function commitLine(): void {
    if (currentFragments.length > 0) {
      lines.push({
        fragments: currentFragments,
        widthPx: currentLineWidth,
        heightPx: currentLineHeight,
        ascentPx: currentAscent,
      });
    }
    currentFragments = [];
    currentLineWidth = 0;
    currentLineHeight = 0;
    currentAscent = 0;
    isFirstLine = false;
  }

  function getLineAvailableWidth(): number {
    return isFirstLine ? availableWidth - bulletWidth : availableWidth;
  }

  for (const run of paragraph.runs) {
    if (run.kind === 'lineBreak') {
      // Force a line break. If we have no fragments, push an empty line
      // with the height of the line break's font.
      if (currentFragments.length === 0) {
        const fontSizePt = resolveFontSizePt(run.properties, fontScale);
        const lineSpacingPct = resolveLineSpacingPct(
          paragraph.properties.lineSpacing,
          lnSpcReduction
        );
        const heightPx =
          lineSpacingPct >= 0
            ? ptToCanvasPx(fontSizePt * (lineSpacingPct / 100), dpiScale)
            : ptToCanvasPx(-lineSpacingPct, dpiScale);
        lines.push({
          fragments: [],
          widthPx: 0,
          heightPx,
          ascentPx: ptToCanvasPx(fontSizePt, dpiScale),
        });
        isFirstLine = false;
      } else {
        commitLine();
      }
      continue;
    }

    // run.kind === 'run'
    const fontString = buildFontString(run.properties, resolveFont, fontScale);
    const fontSizePt = resolveFontSizePt(run.properties, fontScale);
    const fillStyle = run.properties.color
      ? colorToRgba(run.properties.color)
      : resolveDefaultTextColor(rctx);

    const lineSpacingPct = resolveLineSpacingPct(paragraph.properties.lineSpacing, lnSpcReduction);
    const fragmentHeightPx =
      lineSpacingPct >= 0
        ? ptToCanvasPx(fontSizePt * (lineSpacingPct / 100), dpiScale)
        : ptToCanvasPx(-lineSpacingPct, dpiScale);
    const ascentPx = ptToCanvasPx(fontSizePt, dpiScale);

    // Split into words, preserving spaces for accurate measurement.
    const words = run.text.split(/(?<=\s)/);

    for (const word of words) {
      const wordWidth = measureFragment(ctx, word, fontString);
      const lineAvail = getLineAvailableWidth();

      // Wrap if this word would overflow — but not if the line is empty
      // (a single word wider than the line must still be placed).
      if (currentLineWidth + wordWidth > lineAvail && currentFragments.length > 0) {
        commitLine();
      }

      currentFragments.push({
        text: word,
        fontString,
        fillStyle,
        widthPx: wordWidth,
        fontSizePt,
        props: run.properties,
      });
      currentLineWidth += wordWidth;
      currentLineHeight = Math.max(currentLineHeight, fragmentHeightPx);
      currentAscent = Math.max(currentAscent, ascentPx);
    }
  }

  // Commit any remaining fragments as the last line.
  if (currentFragments.length > 0) {
    commitLine();
  }

  // If there are no lines at all (empty paragraph), create a single
  // empty line with the default font height.
  if (lines.length === 0) {
    const fontSizePt = getParagraphFontSizePt(paragraph, fontScale);
    const lineSpacingPct = resolveLineSpacingPct(paragraph.properties.lineSpacing, lnSpcReduction);
    const heightPx =
      lineSpacingPct >= 0
        ? ptToCanvasPx(fontSizePt * (lineSpacingPct / 100), dpiScale)
        : ptToCanvasPx(-lineSpacingPct, dpiScale);
    lines.push({
      fragments: [],
      widthPx: 0,
      heightPx,
      ascentPx: ptToCanvasPx(fontSizePt, dpiScale),
    });
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Bullet rendering
// ---------------------------------------------------------------------------

/**
 * Measure the bullet for a paragraph and return its width in canvas pixels.
 * Returns 0 if the paragraph has no bullet.
 *
 * @param fontScale - Optional font scale from normAutofit (percentage).
 */
function measureBullet(
  paragraph: ParagraphIR,
  rctx: RenderContext,
  fontScale?: number
): { text: string; fontString: string; fillStyle: string; widthPx: number } | null {
  const bullet = paragraph.bulletProperties;
  if (!bullet || bullet.type === 'none') return null;

  let bulletChar: string;
  if (bullet.type === 'char' && bullet.char) {
    bulletChar = bullet.char;
  } else if (bullet.type === 'autoNum') {
    // Simplified: render "1." for auto-numbering.
    bulletChar = '1.';
  } else {
    return null;
  }

  const paragraphFontSizePt = getParagraphFontSizePt(paragraph, fontScale);
  const sizePercent = bullet.sizePercent ?? 100;
  const bulletFontSizePt = paragraphFontSizePt * (sizePercent / 100);

  const fontFamily = bullet.font || 'sans-serif';
  const resolved = rctx.resolveFont(fontFamily);
  const fontString = `${bulletFontSizePt}pt "${resolved}"`;

  const fillStyle = bullet.color ? colorToRgba(bullet.color) : resolveDefaultTextColor(rctx);

  const textWithGap = bulletChar + ' ';
  const widthPx = measureFragment(rctx.ctx, textWithGap, fontString);

  return { text: textWithGap, fontString, fillStyle, widthPx };
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

/**
 * Draw underline decoration beneath text.
 */
function drawUnderline(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  baselineY: number,
  width: number,
  fontSizePx: number,
  fillStyle: string
): void {
  const underlineY = baselineY + fontSizePx * 0.15;
  const thickness = Math.max(1, fontSizePx * 0.05);
  ctx.fillStyle = fillStyle;
  ctx.fillRect(x, underlineY, width, thickness);
}

/**
 * Draw strikethrough decoration through text.
 */
function drawStrikethrough(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  baselineY: number,
  width: number,
  fontSizePx: number,
  fillStyle: string
): void {
  const strikeY = baselineY - fontSizePx * 0.3;
  const thickness = Math.max(1, fontSizePx * 0.05);
  ctx.fillStyle = fillStyle;
  ctx.fillRect(x, strikeY, width, thickness);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a text body within the given bounds (in pixels, already scaled).
 *
 * @param textBody - The text body IR to render.
 * @param rctx     - The shared render context.
 * @param bounds   - The bounding rectangle in canvas pixel coordinates.
 */
export function renderTextBody(
  textBody: TextBodyIR,
  rctx: RenderContext,
  bounds: { x: number; y: number; width: number; height: number }
): void {
  const { ctx, dpiScale } = rctx;
  const body = textBody.bodyProperties;

  // Calculate text area by applying body insets.
  const leftInset = emuToScaledPx(body.leftInset ?? DEFAULT_INSET_EMU, rctx);
  const rightInset = emuToScaledPx(body.rightInset ?? DEFAULT_INSET_EMU, rctx);
  const topInset = emuToScaledPx(body.topInset ?? DEFAULT_INSET_EMU, rctx);
  const bottomInset = emuToScaledPx(body.bottomInset ?? DEFAULT_INSET_EMU, rctx);

  const textAreaX = bounds.x + leftInset;
  const textAreaY = bounds.y + topInset;
  const textAreaWidth = bounds.width - leftInset - rightInset;
  const textAreaHeight = bounds.height - topInset - bottomInset;

  // Bail out if text area is degenerate.
  if (textAreaWidth <= 0 || textAreaHeight <= 0) return;

  const shouldWrap = body.wrap !== 'none';

  // Auto-fit: extract font scale and line spacing reduction for normAutofit.
  const fontScale = body.autoFit === 'shrink' ? body.fontScale : undefined;
  const lnSpcReduction = body.autoFit === 'shrink' ? body.lnSpcReduction : undefined;

  // Phase 1: Layout all paragraphs and compute total height.
  interface ParagraphLayout {
    lines: WrappedLine[];
    spaceBeforePx: number;
    spaceAfterPx: number;
    alignment: 'left' | 'center' | 'right' | 'justify' | 'distributed';
    bullet: ReturnType<typeof measureBullet>;
    marginLeftPx: number;
    indentPx: number;
  }

  const paragraphLayouts: ParagraphLayout[] = [];
  let totalHeight = 0;

  for (let pi = 0; pi < textBody.paragraphs.length; pi++) {
    const paragraph = textBody.paragraphs[pi];
    const fontSizePt = getParagraphFontSizePt(paragraph, fontScale);

    const spaceBeforePx = resolveSpacingPx(paragraph.properties.spaceBefore, fontSizePt, dpiScale);
    const spaceAfterPx = resolveSpacingPx(paragraph.properties.spaceAfter, fontSizePt, dpiScale);

    const marginLeftPx = paragraph.properties.marginLeft
      ? emuToScaledPx(paragraph.properties.marginLeft, rctx)
      : 0;
    const indentPx = paragraph.properties.indent
      ? emuToScaledPx(paragraph.properties.indent, rctx)
      : 0;

    const bullet = measureBullet(paragraph, rctx, fontScale);
    const bulletWidth = bullet ? bullet.widthPx : 0;

    const availableWidth = shouldWrap ? textAreaWidth - marginLeftPx : Infinity;
    const lines = wrapParagraph(
      paragraph,
      rctx,
      availableWidth,
      bulletWidth,
      fontScale,
      lnSpcReduction
    );

    const alignment = paragraph.properties.alignment ?? 'left';

    const paragraphHeight =
      (pi === 0 ? 0 : spaceBeforePx) + lines.reduce((sum, l) => sum + l.heightPx, 0) + spaceAfterPx;

    totalHeight += paragraphHeight;

    paragraphLayouts.push({
      lines,
      spaceBeforePx,
      spaceAfterPx,
      alignment,
      bullet,
      marginLeftPx,
      indentPx,
    });
  }

  // Phase 2: Compute vertical alignment offset.
  let verticalOffset = 0;
  const verticalAlign = body.verticalAlign ?? 'top';
  if (verticalAlign === 'middle') {
    verticalOffset = Math.max(0, (textAreaHeight - totalHeight) / 2);
  } else if (verticalAlign === 'bottom' || verticalAlign === 'bottom4') {
    verticalOffset = Math.max(0, textAreaHeight - totalHeight);
  }

  // Phase 3: Render each paragraph.
  ctx.save();
  ctx.beginPath();
  ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.clip();

  let cursorY = textAreaY + verticalOffset;

  for (let pi = 0; pi < paragraphLayouts.length; pi++) {
    const layout = paragraphLayouts[pi];

    // Apply space before (skip for first paragraph).
    if (pi > 0) {
      cursorY += layout.spaceBeforePx;
    }

    const baseX = textAreaX + layout.marginLeftPx;
    const lineAvailableWidth = textAreaWidth - layout.marginLeftPx;

    for (let li = 0; li < layout.lines.length; li++) {
      const line = layout.lines[li];

      // Compute alignment offset for this line.
      let lineX = baseX;
      const totalLineWidth = line.widthPx + (li === 0 && layout.bullet ? layout.bullet.widthPx : 0);

      if (layout.alignment === 'center') {
        lineX += (lineAvailableWidth - totalLineWidth) / 2;
      } else if (layout.alignment === 'right') {
        lineX += lineAvailableWidth - totalLineWidth;
      }
      // 'left', 'justify', 'distributed': no offset (justify is phase 4)

      let drawX = lineX;
      const baselineY = cursorY + line.ascentPx;

      // Draw bullet on the first line of the paragraph.
      if (li === 0 && layout.bullet) {
        ctx.font = layout.bullet.fontString;
        ctx.fillStyle = layout.bullet.fillStyle;
        ctx.fillText(layout.bullet.text, drawX, baselineY);
        drawX += layout.bullet.widthPx;
      }

      // Draw each text fragment in the line.
      for (const frag of line.fragments) {
        ctx.font = frag.fontString;
        ctx.fillStyle = frag.fillStyle;

        const fontSizePx = ptToCanvasPx(frag.fontSizePt, dpiScale);

        // Baseline shift for superscript/subscript.
        let baselineShift = 0;
        if (frag.props.baseline != null && frag.props.baseline !== 0) {
          baselineShift = -(frag.props.baseline / 100) * fontSizePx;
        }

        ctx.fillText(frag.text, drawX, baselineY + baselineShift);

        // Draw underline.
        if (frag.props.underline && frag.props.underline !== 'none') {
          drawUnderline(
            ctx,
            drawX,
            baselineY + baselineShift,
            frag.widthPx,
            fontSizePx,
            frag.fillStyle
          );
        }

        // Draw strikethrough.
        if (frag.props.strikethrough && frag.props.strikethrough !== 'none') {
          drawStrikethrough(
            ctx,
            drawX,
            baselineY + baselineShift,
            frag.widthPx,
            fontSizePx,
            frag.fillStyle
          );
        }

        drawX += frag.widthPx;
      }

      cursorY += line.heightPx;
    }

    cursorY += layout.spaceAfterPx;
  }

  ctx.restore();
}
