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
  RunIR,
  BulletPropertiesIR,
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

/** Default hyperlink color (OOXML hlink theme color fallback). */
const DEFAULT_HYPERLINK_COLOR = 'rgba(5, 99, 193, 1)';

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
 * @param rctx  - Optional render context for textDefaults inheritance.
 * @param level - Optional paragraph level for textDefaults lookup.
 */
function resolveFontSizePt(
  props: CharacterPropertiesIR,
  fontScale?: number,
  rctx?: RenderContext,
  level?: number
): number {
  let sizePt: number;
  if (props.fontSize != null) {
    sizePt = hundredthsPtToPt(props.fontSize);
  } else {
    // Try inherited font size from textDefaults
    const inherited = rctx?.textDefaults;
    const inheritedSize =
      inherited?.levels[level ?? 0]?.defaultCharacterProperties?.fontSize ??
      inherited?.defPPr?.defaultCharacterProperties?.fontSize;
    if (inheritedSize != null) {
      sizePt = hundredthsPtToPt(inheritedSize);
    } else {
      sizePt = DEFAULT_FONT_SIZE_PT;
    }
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
 * We use `px` units in the canvas coordinate system (device pixels).
 * Since our canvas backing store is sized at `logicalSize * dpiScale`
 * without a compensating `ctx.scale()`, CSS units like `pt` would
 * render at 1x on a 2x canvas — appearing half-size on retina displays.
 * Converting to device pixels via `ptToCanvasPx()` keeps fonts consistent
 * with all other coordinate-space measurements.
 *
 * @param fontScale - Optional font scale factor from normAutofit (percentage).
 * @param rctx  - Optional render context for textDefaults inheritance.
 * @param level - Optional paragraph level for textDefaults lookup.
 */
function buildFontString(
  props: CharacterPropertiesIR,
  resolveFont: (name: string) => string,
  fontScale?: number,
  rctx?: RenderContext,
  level?: number
): string {
  const style = props.italic ? 'italic ' : '';
  const weight = props.bold ? 'bold ' : '';
  const sizePt = resolveFontSizePt(props, fontScale, rctx, level);
  const sizePx = ptToCanvasPx(sizePt, rctx?.dpiScale ?? 1);
  let family = props.fontFamily || props.latin;
  if (!family && rctx?.textDefaults) {
    const td = rctx.textDefaults;
    family =
      td.levels[level ?? 0]?.defaultCharacterProperties?.fontFamily ??
      td.levels[level ?? 0]?.defaultCharacterProperties?.latin ??
      td.defPPr?.defaultCharacterProperties?.fontFamily ??
      td.defPPr?.defaultCharacterProperties?.latin;
  }
  family = family || 'sans-serif';
  const resolved = resolveFont(family);
  return `${style}${weight}${sizePx}px "${resolved}"`;
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
 * Measure a text fragment, preferring precomputed font metrics when available.
 *
 * When a FontMetricsDB is present on the render context and has metrics for
 * the requested font family, uses per-character advance widths from real font
 * files. This gives correct line-breaking even when the actual font (e.g.
 * Calibri) is substituted with a different font for visual rendering.
 *
 * Falls back to Canvas2D measurement when no precomputed metrics are available.
 */
function measureFragment(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  fontString: string,
  rctx?: RenderContext,
  family?: string,
  fontSizePx?: number,
  bold?: boolean,
  italic?: boolean
): number {
  if (rctx?.fontMetricsDB && family && fontSizePx != null) {
    const w = rctx.fontMetricsDB.measureText(
      text,
      family,
      fontSizePx,
      bold ?? false,
      italic ?? false
    );
    if (w !== undefined) return w;
  }
  ctx.font = fontString;
  return ctx.measureText(text).width;
}

/**
 * Get the default font size for a paragraph by inspecting its runs.
 * Falls back to inherited textDefaults, then DEFAULT_FONT_SIZE_PT.
 *
 * @param fontScale - Optional font scale factor from normAutofit (percentage).
 * @param rctx     - Optional render context for textDefaults inheritance.
 */
function getParagraphFontSizePt(
  paragraph: ParagraphIR,
  fontScale?: number,
  rctx?: RenderContext
): number {
  for (const run of paragraph.runs) {
    if (run.properties.fontSize != null) {
      const basePt = hundredthsPtToPt(run.properties.fontSize);
      return fontScale != null ? basePt * (fontScale / 100) : basePt;
    }
  }
  // Try inherited font size from textDefaults
  const level = paragraph.properties.level ?? 0;
  const inherited = rctx?.textDefaults;
  const inheritedSize =
    inherited?.levels[level]?.defaultCharacterProperties?.fontSize ??
    inherited?.defPPr?.defaultCharacterProperties?.fontSize;
  if (inheritedSize != null) {
    const basePt = hundredthsPtToPt(inheritedSize);
    return fontScale != null ? basePt * (fontScale / 100) : basePt;
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

/**
 * Resolve inherited text color from the textDefaults chain.
 *
 * Checks the textDefaults for the given paragraph level first, then falls
 * back to defPPr, then to the standard tx1→dk1 theme color resolution.
 *
 * This is what makes section divider title text render white: the master's
 * txStyles/titleStyle carries a white color default that overrides the
 * usual tx1→dk1 fallback.
 */
function resolveInheritedTextColor(rctx: RenderContext, level: number): string {
  const td = rctx.textDefaults;
  if (td) {
    const color =
      td.levels[level]?.defaultCharacterProperties?.color ??
      td.defPPr?.defaultCharacterProperties?.color;
    if (color) return colorToRgba(color);
  }
  return resolveDefaultTextColor(rctx);
}

/**
 * Resolve the hyperlink color from the theme's hlink color.
 *
 * Falls back to a standard blue when the theme has no hlink entry.
 */
function resolveHyperlinkColor(rctx: RenderContext): string {
  const scheme = rctx.theme?.colorScheme;
  if (scheme) {
    const hlink = (scheme as unknown as Record<string, RgbaColor | undefined>)['hlink'];
    if (hlink) return colorToRgba(hlink);
  }
  return DEFAULT_HYPERLINK_COLOR;
}

/**
 * Apply default hyperlink styling to a run's rendering properties.
 *
 * When a run has a hyperlink:
 * - Color defaults to the theme's hlink color (unless explicitly set)
 * - Underline defaults to 'single' (unless explicitly set)
 *
 * Returns a new CharacterPropertiesIR with hyperlink defaults applied,
 * plus the resolved fill style for the fragment.
 */
function applyHyperlinkDefaults(
  run: RunIR,
  fillStyle: string,
  rctx: RenderContext
): { props: CharacterPropertiesIR; fillStyle: string } {
  if (!run.hyperlink) {
    return { props: run.properties, fillStyle };
  }

  // Override color only if the run has no explicit color
  const effectiveFillStyle = run.properties.color ? fillStyle : resolveHyperlinkColor(rctx);

  // Override underline only if not explicitly set
  const effectiveProps: CharacterPropertiesIR = {
    ...run.properties,
    underline: run.properties.underline ?? 'single',
  };

  return { props: effectiveProps, fillStyle: effectiveFillStyle };
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
  lnSpcReduction?: number,
  firstLineIndentPx?: number
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
    if (isFirstLine) {
      const indent = firstLineIndentPx ?? 0;
      if (indent < 0) {
        // Hanging indent: bullet hangs left of text margin.
        // Text starts at availableWidth position (same as continuation).
        // No width reduction — bullet is outside the text margin.
        return availableWidth;
      }
      // Positive indent: first line starts further right.
      return Math.max(0, availableWidth - indent - bulletWidth);
    }
    return availableWidth;
  }

  const paragraphLevel = paragraph.properties.level ?? 0;

  for (const run of paragraph.runs) {
    if (run.kind === 'lineBreak') {
      // Force a line break. If we have no fragments, push an empty line
      // with the height of the line break's font.
      if (currentFragments.length === 0) {
        const fontSizePt = resolveFontSizePt(run.properties, fontScale, rctx, paragraphLevel);
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
    const fontString = buildFontString(
      run.properties,
      resolveFont,
      fontScale,
      rctx,
      paragraphLevel
    );
    const fontSizePt = resolveFontSizePt(run.properties, fontScale, rctx, paragraphLevel);
    let fillStyle = run.properties.color
      ? colorToRgba(run.properties.color)
      : resolveInheritedTextColor(rctx, paragraphLevel);

    // Apply default hyperlink styling (blue + underline) for linked runs.
    const { props: effectiveProps, fillStyle: effectiveFillStyle } = applyHyperlinkDefaults(
      run,
      fillStyle,
      rctx
    );
    fillStyle = effectiveFillStyle;

    const lineSpacingPct = resolveLineSpacingPct(paragraph.properties.lineSpacing, lnSpcReduction);
    const fragmentHeightPx =
      lineSpacingPct >= 0
        ? ptToCanvasPx(fontSizePt * (lineSpacingPct / 100), dpiScale)
        : ptToCanvasPx(-lineSpacingPct, dpiScale);

    // Resolve the original font family name (before substitution) for metrics lookup.
    let rawFamily = run.properties.fontFamily || run.properties.latin;
    if (!rawFamily && rctx.textDefaults) {
      const td = rctx.textDefaults;
      rawFamily =
        td.levels[paragraphLevel]?.defaultCharacterProperties?.fontFamily ??
        td.levels[paragraphLevel]?.defaultCharacterProperties?.latin ??
        td.defPPr?.defaultCharacterProperties?.fontFamily ??
        td.defPPr?.defaultCharacterProperties?.latin;
    }
    rawFamily = rawFamily || 'sans-serif';
    const fontSizePx = ptToCanvasPx(fontSizePt, dpiScale);

    // Compute ascent using font metrics when available (pdf.js pattern):
    //   firstLineHeight = (lineHeight - lineGap) * fontSize
    // This gives the glyph extent without inter-line spacing, which is
    // more accurate for baseline positioning than assuming ascent = fontSize.
    let ascentPx = fontSizePx; // fallback: ascent = full font size
    if (rctx.fontMetricsDB && rawFamily) {
      const vm = rctx.fontMetricsDB.getVerticalMetrics(
        rawFamily,
        fontSizePx,
        run.properties.bold ?? false,
        run.properties.italic ?? false
      );
      if (vm?.lineHeight != null && vm?.lineGap != null) {
        ascentPx = vm.lineHeight - vm.lineGap;
      }
    }

    // Split into words, preserving spaces for accurate measurement.
    const words = run.text.split(/(?<=\s)/);

    for (const word of words) {
      const wordWidth = measureFragment(
        ctx,
        word,
        fontString,
        rctx,
        rawFamily,
        fontSizePx,
        run.properties.bold,
        run.properties.italic
      );
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
        props: effectiveProps,
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
    const fontSizePt = getParagraphFontSizePt(paragraph, fontScale, rctx);
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
// Auto-numbering helpers
// ---------------------------------------------------------------------------

/**
 * Convert a 1-based index to a Roman numeral string.
 * Handles values 1-3999.
 */
export function toRoman(n: number): string {
  if (n < 1 || n > 3999) return String(n);
  const lookup: [number, string][] = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ];
  let result = '';
  let remaining = n;
  for (const [value, numeral] of lookup) {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  }
  return result;
}

/**
 * Convert a 1-based index to an alphabetic label.
 * 1→a, 2→b, ..., 26→z, 27→aa, 28→ab, etc.
 */
export function toAlpha(n: number): string {
  if (n < 1) return String(n);
  let result = '';
  let remaining = n;
  while (remaining > 0) {
    remaining--; // Make 0-based
    result = String.fromCharCode(97 + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26);
  }
  return result;
}

/**
 * Format an auto-number bullet based on the OOXML auto-numbering type.
 *
 * @param type  - The autoNumType from BulletPropertiesIR (e.g. 'arabicPeriod').
 * @param index - The 1-based numbering index for this paragraph.
 */
export function formatAutoNumber(type: string | undefined, index: number): string {
  switch (type) {
    case 'arabicPeriod':
      return `${index}.`;
    case 'arabicParenR':
      return `${index})`;
    case 'arabicParenBoth':
      return `(${index})`;
    case 'romanUcPeriod':
      return `${toRoman(index).toUpperCase()}.`;
    case 'romanLcPeriod':
      return `${toRoman(index)}.`;
    case 'romanUcParenR':
      return `${toRoman(index).toUpperCase()})`;
    case 'romanLcParenR':
      return `${toRoman(index)})`;
    case 'alphaUcPeriod':
      return `${toAlpha(index).toUpperCase()}.`;
    case 'alphaLcPeriod':
      return `${toAlpha(index)}.`;
    case 'alphaLcParenR':
      return `${toAlpha(index)})`;
    case 'alphaUcParenR':
      return `${toAlpha(index).toUpperCase()})`;
    case 'alphaLcParenBoth':
      return `(${toAlpha(index)})`;
    case 'alphaUcParenBoth':
      return `(${toAlpha(index).toUpperCase()})`;
    default:
      return `${index}.`;
  }
}

// ---------------------------------------------------------------------------
// Bullet rendering
// ---------------------------------------------------------------------------

/**
 * Measure the bullet for a paragraph and return its width in canvas pixels.
 * Returns 0 if the paragraph has no bullet.
 *
 * @param fontScale    - Optional font scale from normAutofit (percentage).
 * @param autoNumIndex - The computed 1-based index for autoNum bullets.
 */
function measureBullet(
  paragraph: ParagraphIR,
  rctx: RenderContext,
  fontScale?: number,
  autoNumIndex?: number,
  bulletOverride?: BulletPropertiesIR
): { text: string; fontString: string; fillStyle: string; widthPx: number } | null {
  const bullet = bulletOverride ?? paragraph.bulletProperties;
  if (!bullet || bullet.type === 'none') return null;

  let bulletChar: string;
  if (bullet.type === 'char' && bullet.char) {
    bulletChar = bullet.char;
  } else if (bullet.type === 'autoNum') {
    bulletChar = formatAutoNumber(bullet.autoNumType, autoNumIndex ?? 1);
  } else {
    return null;
  }

  const paragraphFontSizePt = getParagraphFontSizePt(paragraph, fontScale, rctx);
  const sizePercent = bullet.sizePercent ?? 100;
  const bulletFontSizePt = paragraphFontSizePt * (sizePercent / 100);

  const fontFamily = bullet.font || 'sans-serif';
  const resolved = rctx.resolveFont(fontFamily);
  const bulletFontSizePx = ptToCanvasPx(bulletFontSizePt, rctx.dpiScale);
  const fontString = `${bulletFontSizePx}px "${resolved}"`;

  const bulletLevel = paragraph.properties.level ?? 0;
  const fillStyle = bullet.color
    ? colorToRgba(bullet.color)
    : resolveInheritedTextColor(rctx, bulletLevel);

  const textWithGap = bulletChar + ' ';
  const widthPx = measureFragment(
    rctx.ctx,
    textWithGap,
    fontString,
    rctx,
    fontFamily,
    bulletFontSizePx,
    false,
    false
  );

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

  // Track auto-numbering counters per indent level.
  // When a numbered paragraph appears, increment its level's counter.
  // When a non-numbered paragraph or a shallower level appears, reset
  // deeper-level counters so that nested lists restart correctly.
  const autoNumCounters = new Map<number, number>(); // level → current count

  for (let pi = 0; pi < textBody.paragraphs.length; pi++) {
    const paragraph = textBody.paragraphs[pi];
    const fontSizePt = getParagraphFontSizePt(paragraph, fontScale, rctx);

    // Resolve paragraph properties with inheritance from textDefaults.
    const paragraphLevel = paragraph.properties.level ?? 0;
    const inheritedPProps =
      rctx.textDefaults?.levels[paragraphLevel]?.paragraphProperties ??
      rctx.textDefaults?.defPPr?.paragraphProperties;

    const effectiveMarginLeft = paragraph.properties.marginLeft ?? inheritedPProps?.marginLeft;
    const effectiveIndent = paragraph.properties.indent ?? inheritedPProps?.indent;
    const effectiveSpaceBefore = paragraph.properties.spaceBefore ?? inheritedPProps?.spaceBefore;
    const effectiveSpaceAfter = paragraph.properties.spaceAfter ?? inheritedPProps?.spaceAfter;

    const spaceBeforePx = resolveSpacingPx(effectiveSpaceBefore, fontSizePt, dpiScale);
    const spaceAfterPx = resolveSpacingPx(effectiveSpaceAfter, fontSizePt, dpiScale);

    const marginLeftPx = effectiveMarginLeft ? emuToScaledPx(effectiveMarginLeft, rctx) : 0;
    const indentPx = effectiveIndent ? emuToScaledPx(effectiveIndent, rctx) : 0;

    // Compute auto-number index if this paragraph uses autoNum bullets.
    // Only inherit bullet properties from textDefaults when the paragraph
    // has visible text. Empty placeholder paragraphs (e.g. layout/master
    // body placeholders with no content) should not render orphan bullets.
    let autoNumIndex: number | undefined;
    const hasVisibleText = paragraph.runs.some((r) => r.kind === 'run' && r.text.length > 0);
    const bulletProps =
      paragraph.bulletProperties ??
      (hasVisibleText
        ? (rctx.textDefaults?.levels[paragraphLevel]?.bulletProperties ??
          rctx.textDefaults?.defPPr?.bulletProperties)
        : undefined);
    if (bulletProps?.type === 'autoNum') {
      const level = paragraph.properties.level ?? 0;
      // Reset counters for any deeper levels.
      for (const key of autoNumCounters.keys()) {
        if (key > level) {
          autoNumCounters.delete(key);
        }
      }
      const startAt = bulletProps.startAt ?? 1;
      const current = autoNumCounters.get(level);
      if (current == null) {
        // First numbered paragraph at this level — start at startAt.
        autoNumIndex = startAt;
      } else {
        autoNumIndex = current + 1;
      }
      autoNumCounters.set(level, autoNumIndex);
    } else {
      // Non-numbered paragraph: reset counters at this level and deeper
      // so that numbering restarts if it resumes later.
      const level = paragraph.properties.level ?? 0;
      for (const key of autoNumCounters.keys()) {
        if (key >= level) {
          autoNumCounters.delete(key);
        }
      }
    }

    const bullet = measureBullet(paragraph, rctx, fontScale, autoNumIndex, bulletProps);
    const bulletWidth = bullet ? bullet.widthPx : 0;

    const availableWidth = shouldWrap ? textAreaWidth - marginLeftPx : Infinity;
    const lines = wrapParagraph(
      paragraph,
      rctx,
      availableWidth,
      bulletWidth,
      fontScale,
      lnSpcReduction,
      indentPx
    );

    const alignment = paragraph.properties.alignment ?? inheritedPProps?.alignment ?? 'left';

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

  // Only clip when autoFit is 'shrink' (text already scaled to fit).
  // Default OOXML behavior (autoFit='none') allows text to overflow visually.
  if (body.autoFit === 'shrink') {
    ctx.beginPath();
    ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.clip();
  }

  let cursorY = textAreaY + verticalOffset;

  for (let pi = 0; pi < paragraphLayouts.length; pi++) {
    const layout = paragraphLayouts[pi];

    // Apply space before (skip for first paragraph).
    if (pi > 0) {
      cursorY += layout.spaceBeforePx;
    }

    // For hanging indent (negative indent): bullet at marginLeft+indent, text at marginLeft.
    // For positive indent: first line text at marginLeft+indent, continuation at marginLeft.
    const textBaseX = textAreaX + layout.marginLeftPx;
    const hangingIndent = layout.indentPx < 0;
    const bulletX = hangingIndent
      ? textAreaX + Math.max(0, layout.marginLeftPx + layout.indentPx)
      : textBaseX;
    const firstLineTextX = hangingIndent ? textBaseX : textBaseX + layout.indentPx;
    const textAvailableWidth = textAreaWidth - layout.marginLeftPx;

    for (let li = 0; li < layout.lines.length; li++) {
      const line = layout.lines[li];
      const isFirst = li === 0;

      // Compute alignment offset for this line.
      const lineAvailableWidth =
        isFirst && !hangingIndent
          ? Math.max(0, textAvailableWidth - layout.indentPx)
          : textAvailableWidth;
      let lineX = isFirst && !hangingIndent ? firstLineTextX : textBaseX;
      const totalLineWidth =
        line.widthPx + (isFirst && layout.bullet && !hangingIndent ? layout.bullet.widthPx : 0);

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
        if (hangingIndent) {
          // Hanging indent: bullet draws at bulletX, text stays at lineX.
          ctx.fillText(layout.bullet.text, bulletX, baselineY);
        } else {
          // Normal: bullet drawn inline before text.
          ctx.fillText(layout.bullet.text, drawX, baselineY);
          drawX += layout.bullet.widthPx;
        }
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
