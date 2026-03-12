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
  FillIR,
  SpacingIR,
  RgbaColor,
  TabStopIR,
} from '../../ir/index.js';
import type { RenderContext } from './render-context.js';
import { emuToScaledPx } from './render-context.js';
import { hundredthsPtToPt } from '../../units/index.js';
import { resolveThemeFont } from '../../theme/font-resolver.js';
import type { ThemeIR } from '../../ir/index.js';
import type { RenderBackend } from './render-backend.js';
import { colorToRgba } from '../../color/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default font size in points when none is specified. */
const DEFAULT_FONT_SIZE_PT = 18;

// ---------------------------------------------------------------------------
// Text measurement cache — avoids redundant backend.measureText() calls for
// identical font+text pairs within and across paragraphs.
// ---------------------------------------------------------------------------

const measurementCache = new Map<string, number>();

/** Clear the text measurement cache (e.g. between slides or after font changes). */
export function clearMeasurementCache(): void {
  measurementCache.clear();
}

/** Default left/right body insets in EMU (OOXML default: 0.1 inches = 91,440 EMU). */
const DEFAULT_LR_INSET_EMU = 91440;

/** Default top/bottom body insets in EMU (OOXML default: 0.05 inches = 45,720 EMU). */
const DEFAULT_TB_INSET_EMU = 45720;

/**
 * Default line spacing as percentage (100% = single spacing).
 *
 * ECMA-376 ss 21.1.2.2.11 (a:lnSpc): "If this element is omitted then the
 * spacing between two lines of text should be determined by the point size
 * of the largest piece of text within a line."  This is effectively 100%
 * of font size — the font's built-in metrics (ascent + descent + line gap)
 * handle additional visual leading.  Apache POI confirms this default
 * (DrawTextParagraph.java: `spacing = 100d` when getLineSpacing() is null).
 */
const DEFAULT_LINE_SPACING_PCT = 100;

/** Default hyperlink color (OOXML hlink theme color fallback). */
const DEFAULT_HYPERLINK_COLOR = 'rgba(5, 99, 193, 1)';

// ---------------------------------------------------------------------------
// Theme font placeholder resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a font family name that may be a theme font placeholder.
 *
 * OOXML allows typeface values like `+mj-lt` (major Latin), `+mn-lt`
 * (minor Latin), `+mn-cs` (minor Complex Script), etc. These must be
 * resolved to actual font names from the theme's font scheme before
 * being passed to the font resolver or Canvas2D.
 *
 * @param family - The raw font family string (may be a theme placeholder)
 * @param theme - The presentation theme (optional; if absent, returns as-is)
 * @returns The resolved font name, or the original string if not a placeholder
 */
function resolveThemeFontFamily(family: string, theme?: ThemeIR): string {
  if (!theme || !family) return family;
  const resolved = resolveThemeFont(family, theme);
  return resolved ?? family;
}

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

/**
 * Resolve field code text at render time.
 *
 * Replaces known field types with dynamic values from the render context.
 * Currently supports:
 * - `slidenum` → the 1-based slide number from rctx.slideNumber
 *
 * Falls back to the run's original text for unknown or unresolved fields.
 */
function resolveFieldText(run: RunIR, rctx: RenderContext): string {
  if (!run.fieldType) return run.text;
  if (run.fieldType === 'slidenum' && rctx.slideNumber != null) {
    return String(rctx.slideNumber);
  }
  return run.text;
}

/**
 * Resolve the underline color from an underlineFill.
 *
 * Only solid fills produce a usable color string. Returns `undefined`
 * for gradient, pattern, picture, or noFill — the caller should fall
 * back to the text fill color.
 */
function resolveUnderlineFillColor(fill: FillIR | undefined): string | undefined {
  if (fill && fill.type === 'solid') {
    return colorToRgba(fill.color);
  }
  return undefined;
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
/**
 * Map OOXML weight suffixes in font family names to CSS font-weight values.
 * OOXML encodes weight in the family name ("Barlow Light" = Barlow @ 300).
 * When the renderer also sets bold=true, the CSS weight must reflect the
 * intended result, not blindly layer "bold" on top of a Light family.
 */
const WEIGHT_SUFFIX_MAP: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  'extra light': 200,
  ultralight: 200,
  'ultra light': 200,
  light: 300,
  regular: 400,
  medium: 500,
  semibold: 600,
  'semi bold': 600,
  demibold: 600,
  'demi bold': 600,
  bold: 700,
  extrabold: 800,
  'extra bold': 800,
  ultrabold: 800,
  'ultra bold': 800,
  black: 900,
  heavy: 900,
};

/**
 * Extract CSS font-weight from a font family name that encodes weight
 * as a suffix (e.g. "Barlow Light" → { weight: 300, hasWeightSuffix: true }).
 * Returns null weight if no weight suffix detected.
 */
function extractWeightFromFamily(family: string): {
  weight: number | null;
  hasWeightSuffix: boolean;
} {
  const lower = family.toLowerCase().trim();
  // Check longest suffixes first to avoid partial matches
  const suffixes = Object.keys(WEIGHT_SUFFIX_MAP).sort((a, b) => b.length - a.length);
  for (const suffix of suffixes) {
    if (lower.endsWith(` ${suffix}`)) {
      return { weight: WEIGHT_SUFFIX_MAP[suffix], hasWeightSuffix: true };
    }
  }
  return { weight: null, hasWeightSuffix: false };
}

function buildFontString(
  props: CharacterPropertiesIR,
  resolveFont: (name: string) => string,
  fontScale?: number,
  rctx?: RenderContext,
  level?: number
): string {
  const style = props.italic ? 'italic ' : '';
  const sizePt = resolveFontSizePt(props, fontScale, rctx, level);
  const sizePx = ptToCanvasPx(sizePt, rctx ? textDpiScale(rctx) : 1);
  let family = props.fontFamily || props.latin;
  if (!family && rctx?.textDefaults) {
    const td = rctx.textDefaults;
    family =
      td.levels[level ?? 0]?.defaultCharacterProperties?.fontFamily ??
      td.levels[level ?? 0]?.defaultCharacterProperties?.latin ??
      td.defPPr?.defaultCharacterProperties?.fontFamily ??
      td.defPPr?.defaultCharacterProperties?.latin;
  }
  // Fall back to theme minor Latin font (OOXML default for body text), then sans-serif.
  family = family || rctx?.theme?.fontScheme?.minorLatin || 'sans-serif';
  // Resolve theme font placeholders (+mj-lt, +mn-lt, etc.) to actual names.
  family = resolveThemeFontFamily(family, rctx?.theme);

  // Decompose weight-suffixed family names into proper CSS weight.
  // "Barlow Light" + bold=true → weight 700, family "Barlow Light"
  // "Barlow Light" + bold=false → weight 300, family "Barlow Light"
  // "Barlow" + bold=true → weight bold, family "Barlow"
  const { weight: familyWeight, hasWeightSuffix } = extractWeightFromFamily(family);
  let weight: string;
  if (props.bold) {
    // Bold explicitly requested — use CSS "bold" (700) regardless of suffix
    weight = 'bold ';
  } else if (hasWeightSuffix && familyWeight != null) {
    // Family name encodes a specific weight — use it as numeric CSS weight
    weight = `${familyWeight} `;
  } else {
    weight = '';
  }

  const resolved = resolveFont(family);
  // Do NOT wrap resolved in quotes — resolveFontName() already returns a
  // properly formatted CSS font-family string (e.g. `'Barlow Light', sans-serif`
  // or `Carlito, 'Segoe UI', Arial, sans-serif`).  Wrapping in double quotes
  // turns the entire fallback stack into a single (invalid) family name.
  return `${style}${weight}${sizePx}px ${resolved}`;
}

/**
 * Convert a point value to canvas pixels accounting for DPI scale.
 * 1pt = 1/72 inch. At 96 DPI: 1pt = 96/72 = 1.333... px.
 */
function ptToCanvasPx(pt: number, dpiScale: number): number {
  return pt * (96 / 72) * dpiScale;
}

/**
 * Compute the effective DPI scale for text (pt-based) measurements,
 * compensating for accumulated group transform scaling.
 *
 * When text is inside a group with non-uniform scaling (scaleX != scaleY),
 * we apply a compensating `ctx.scale(1/gsx, 1/gsy)` transform in
 * renderTextBody to undo the distortion. In that case, text uses the
 * base dpiScale directly (no counter-scaling needed in font size).
 *
 * EMU-based measurements (insets, margins) are NOT affected — they use
 * `emuToScaledPx(emu, rctx)` which bypasses this adjustment.
 */
function textDpiScale(rctx: RenderContext): number {
  // When group scaling is present, renderTextBody applies a compensating
  // ctx.scale(1/gsx, 1/gsy) transform, so text layout uses base dpiScale.
  return rctx.dpiScale;
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
 * Returns percentage value (e.g. 100 for 1.0x single spacing).
 *
 * @param lnSpcReduction - Optional line spacing reduction from normAutofit
 *                         (percentage points to subtract, e.g. 20 reduces
 *                         120% to 100%).  Result is clamped to a minimum
 *                         of 100% (single spacing).
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
  backend: RenderBackend,
  text: string,
  fontString: string,
  _rctx?: RenderContext,
  _family?: string,
  _fontSizePx?: number,
  _bold?: boolean,
  _italic?: boolean
): number {
  const cacheKey = `${fontString}\0${text}`;
  const cached = measurementCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // Always use Canvas2D for horizontal text measurement. This ensures wrapping
  // decisions match actual rendered widths (including kerning and OpenType shaping).
  // The metrics DB linear advance widths caused wrapping divergence where text
  // would wrap at different points than the actual Canvas2D drawing.
  backend.font = fontString;
  const metrics = backend.measureText(text);
  // Use visual width (actualBoundingBoxRight) when available and tighter than
  // advance width. This removes the last character's right-side bearing from
  // wrap decisions, matching PowerPoint's behavior at line break points.
  // For italic text where glyphs overhang, actualBoundingBoxRight > width,
  // so we keep using advance width — no regression risk.
  let width: number;
  if (
    typeof metrics.actualBoundingBoxRight === 'number' &&
    metrics.actualBoundingBoxRight < metrics.width
  ) {
    width = metrics.actualBoundingBoxRight;
  } else {
    width = metrics.width;
  }

  measurementCache.set(cacheKey, width);
  return width;
}

/**
 * Get the font's normalized line height multiplier from the metrics DB.
 *
 * In OOXML, percentage-based line spacing (spcPct) is relative to the font's
 * "single spacing" — the font's declared line height (ascender + |descender| +
 * lineGap) / unitsPerEm. So 100% line spacing for Barlow (lineHeight=1.2) means
 * 120% of the point size, not 100%.
 *
 * Returns 1.0 as fallback when metrics are unavailable.
 */
function getFontLineHeightMultiplier(
  rctx: RenderContext,
  rawFamily: string,
  fontSizePx: number,
  bold: boolean,
  italic: boolean
): number {
  if (rctx.fontMetricsDB) {
    const vm = rctx.fontMetricsDB.getVerticalMetrics(rawFamily, fontSizePx, bold, italic);
    if (vm?.lineHeight != null && fontSizePx > 0) {
      // Use the font's natural line height multiplier directly.
      // OOXML spec (ECMA-376 ss 21.1.2.2.11): 100% line spacing uses the font's
      // built-in metrics (ascender + |descender| + lineGap). PowerPoint respects
      // this — no artificial cap.
      return vm.lineHeight / fontSizePx;
    }
  }
  return 1.2;
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
  // For empty paragraphs, use the end-of-paragraph run properties (a:endParaRPr).
  // This is critical: empty spacer paragraphs specify their font size here,
  // and without it they'd fall back to 18pt default — making gaps too tall.
  if (paragraph.endParaProperties?.fontSize != null) {
    const basePt = hundredthsPtToPt(paragraph.endParaProperties.fontSize);
    return fontScale != null ? basePt * (fontScale / 100) : basePt;
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
 * Get the paragraph's representative font family from its first run.
 *
 * Falls back to inherited textDefaults, then generic 'sans-serif'.
 * Used to resolve the font's line height multiplier for spacing
 * calculations that precede per-run iteration.
 */
function getParagraphFontFamily(paragraph: ParagraphIR, rctx?: RenderContext): string {
  for (const run of paragraph.runs) {
    const family = run.properties.fontFamily ?? run.properties.latin;
    if (family) return resolveThemeFontFamily(family, rctx?.theme);
  }
  // For empty paragraphs, use the end-of-paragraph font family.
  if (paragraph.endParaProperties) {
    const family = paragraph.endParaProperties.fontFamily ?? paragraph.endParaProperties.latin;
    if (family) return resolveThemeFontFamily(family, rctx?.theme);
  }
  const level = paragraph.properties.level ?? 0;
  const inherited = rctx?.textDefaults;
  const raw =
    inherited?.levels[level]?.defaultCharacterProperties?.fontFamily ??
    inherited?.levels[level]?.defaultCharacterProperties?.latin ??
    inherited?.defPPr?.defaultCharacterProperties?.fontFamily ??
    inherited?.defPPr?.defaultCharacterProperties?.latin ??
    rctx?.theme?.fontScheme?.minorLatin ??
    'sans-serif';
  return resolveThemeFontFamily(raw, rctx?.theme);
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
 * @param effectiveLineSpacing - Resolved line spacing (with textDefaults inheritance applied).
 */
function wrapParagraph(
  paragraph: ParagraphIR,
  rctx: RenderContext,
  availableWidth: number,
  bulletWidth: number,
  fontScale?: number,
  lnSpcReduction?: number,
  firstLineIndentPx?: number,
  effectiveLineSpacing?: SpacingIR,
  defaultTabSizePx?: number,
  tabStops?: TabStopIR[]
): WrappedLine[] {
  const { backend, resolveFont } = rctx;
  const dpiScale = textDpiScale(rctx);
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

  // Helper to push an empty line for a line break element.
  function pushBrEmptyLine(brRun: (typeof paragraph.runs)[number]): void {
    const fontSizePt = resolveFontSizePt(brRun.properties, fontScale, rctx, paragraphLevel);
    const fontSizePxBr = ptToCanvasPx(fontSizePt, dpiScale);
    const brLhMul = getFontLineHeightMultiplier(rctx, 'sans-serif', fontSizePxBr, false, false);
    const lineSpacingPct = resolveLineSpacingPct(effectiveLineSpacing, lnSpcReduction);
    const heightPx =
      lineSpacingPct >= 0
        ? ptToCanvasPx(fontSizePt * brLhMul * (lineSpacingPct / 100), dpiScale)
        : ptToCanvasPx(-lineSpacingPct, dpiScale);
    lines.push({
      fragments: [],
      widthPx: 0,
      heightPx,
      ascentPx: fontSizePxBr,
    });
    isFirstLine = false;
  }

  // Track the last BR run so we can emit a trailing empty line if the
  // paragraph ends with a line break (e.g. heading + BR before bullets).
  let trailingBrRun: (typeof paragraph.runs)[number] | null = null;

  // Pre-compute tab stop positions once per paragraph (not per run).
  const effectiveTabSizePx = defaultTabSizePx ?? emuToScaledPx(914400, rctx);
  const tabStopPositionsPx = tabStops
    ? tabStops
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((ts) => emuToScaledPx(ts.position, rctx))
    : [];

  for (const run of paragraph.runs) {
    if (run.kind === 'lineBreak') {
      // Force a line break. If we have no fragments, push an empty line
      // with the height of the line break's font.
      if (currentFragments.length === 0) {
        pushBrEmptyLine(run);
      } else {
        commitLine();
      }
      // Remember this BR — if it's the last run, we need a trailing empty line.
      trailingBrRun = run;
      continue;
    }

    // Any text run after a BR means the BR was mid-paragraph, not trailing.
    trailingBrRun = null;

    // run.kind === 'run'
    // Replace field code text at render time (e.g. slidenum → actual number).
    let effectiveText = resolveFieldText(run, rctx);

    // Apply capitalization transform (cap attribute from a:rPr).
    if (run.properties.cap === 'all') {
      effectiveText = effectiveText.toUpperCase();
    } else if (run.properties.cap === 'small') {
      // Small caps: uppercase the text; font size reduction handled at draw time.
      effectiveText = effectiveText.toUpperCase();
    }

    // Small caps: reduce font size to ~80% for the uppercased text.
    const capScale = run.properties.cap === 'small' ? 80 : undefined;
    const effectiveFontScale =
      capScale != null && fontScale != null
        ? fontScale * (capScale / 100)
        : (capScale ?? fontScale);

    const fontString = buildFontString(
      run.properties,
      resolveFont,
      effectiveFontScale,
      rctx,
      paragraphLevel
    );
    const fontSizePt = resolveFontSizePt(run.properties, effectiveFontScale, rctx, paragraphLevel);
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
    // Fall back to theme minor Latin font (OOXML default for body text), then sans-serif.
    rawFamily = rawFamily || rctx.theme?.fontScheme?.minorLatin || 'sans-serif';
    // Resolve theme font placeholders (+mj-lt, +mn-lt, etc.) to actual names.
    rawFamily = resolveThemeFontFamily(rawFamily, rctx.theme);
    const fontSizePx = ptToCanvasPx(fontSizePt, dpiScale);

    // Compute line height using the font's natural line height multiplier.
    // In OOXML, percentage line spacing is relative to the font's "single spacing"
    // (ascender + |descender| + lineGap) / upm, NOT just the point size.
    const bold = run.properties.bold ?? false;
    const italic = run.properties.italic ?? false;
    const fontLhMul = getFontLineHeightMultiplier(rctx, rawFamily, fontSizePx, bold, italic);
    const lineSpacingPct = resolveLineSpacingPct(effectiveLineSpacing, lnSpcReduction);
    const fragmentHeightPx =
      lineSpacingPct >= 0
        ? ptToCanvasPx(fontSizePt * fontLhMul * (lineSpacingPct / 100), dpiScale)
        : ptToCanvasPx(-lineSpacingPct, dpiScale);

    // Compute ascent using font metrics when available.
    let ascentPx = fontSizePx; // fallback: ascent = full font size
    if (rctx.fontMetricsDB) {
      const vm = rctx.fontMetricsDB.getVerticalMetrics(rawFamily, fontSizePx, bold, italic);
      if (vm?.ascender != null) {
        ascentPx = vm.ascender;
      }
    }

    // Split into words, preserving spaces for accurate measurement.
    const words = effectiveText.split(/(?<=\s)/);

    // Character spacing: extra width per character from `spc` attribute.
    const charSpacing = run.properties.spacing;
    const charSpacingPx =
      charSpacing != null && charSpacing !== 0
        ? ptToCanvasPx(hundredthsPtToPt(charSpacing), dpiScale)
        : 0;


    // Track accumulated text within this run on the current line.
    // Measuring the full accumulated text preserves inter-word kerning pairs
    // that would be lost when measuring words individually and summing.
    let runAccText = '';
    let runAccWidth = 0;

    for (const word of words) {
      // Check if this word contains tab characters.
      if (word.indexOf('\t') >= 0) {
        // Tabs break kerning context — reset the accumulator.
        runAccText = '';
        runAccWidth = 0;

        // Split the word on tab boundaries, keeping tabs as separators.
        const tabParts = word.split(/(\t)/);
        for (const part of tabParts) {
          if (part === '\t') {
            // Tab character: advance to next tab stop position.
            let nextTabPos: number | undefined;
            for (const stopPx of tabStopPositionsPx) {
              if (stopPx > currentLineWidth + 0.5) {
                nextTabPos = stopPx;
                break;
              }
            }
            if (nextTabPos == null) {
              nextTabPos =
                Math.ceil((currentLineWidth + 0.5) / effectiveTabSizePx) * effectiveTabSizePx;
            }
            const tabAdvance = Math.max(0, nextTabPos - currentLineWidth);
            currentFragments.push({
              text: '\t',
              fontString,
              fillStyle,
              widthPx: tabAdvance,
              fontSizePt,
              props: effectiveProps,
            });
            currentLineWidth += tabAdvance;
            currentLineHeight = Math.max(currentLineHeight, fragmentHeightPx);
            currentAscent = Math.max(currentAscent, ascentPx);
          } else if (part.length > 0) {
            let partWidth = measureFragment(
              backend,
              part,
              fontString,
              rctx,
              rawFamily,
              fontSizePx,
              run.properties.bold,
              run.properties.italic
            );
            if (charSpacingPx !== 0) {
              partWidth += charSpacingPx * part.length;
            }
            const lineAvail = getLineAvailableWidth();
            if (currentLineWidth + partWidth > lineAvail && currentFragments.length > 0) {
              commitLine();
            }
            currentFragments.push({
              text: part,
              fontString,
              fillStyle,
              widthPx: partWidth,
              fontSizePt,
              props: effectiveProps,
            });
            currentLineWidth += partWidth;
            currentLineHeight = Math.max(currentLineHeight, fragmentHeightPx);
            currentAscent = Math.max(currentAscent, ascentPx);
          }
        }
        continue;
      }

      // Measure accumulated text including this word for kerning-aware width.
      const testText = runAccText + word;
      let testWidth = measureFragment(
        backend,
        testText,
        fontString,
        rctx,
        rawFamily,
        fontSizePx,
        run.properties.bold,
        run.properties.italic
      );
      if (charSpacingPx !== 0 && testText.length > 0) {
        testWidth += charSpacingPx * testText.length;
      }

      // Word width = delta from accumulated measurement (includes kerning context).
      const wordWidth = testWidth - runAccWidth;
      const lineAvail = getLineAvailableWidth();

      // For overflow check, compute total line width using accumulated run width.
      const otherRunsWidth = currentLineWidth - runAccWidth;

      // Wrap if this word would overflow — but not if the line is empty
      // (a single word wider than the line must still be placed).
      if (otherRunsWidth + testWidth > lineAvail && currentFragments.length > 0) {
        commitLine();
        // Reset run accumulator for new line and re-measure this word standalone.
        runAccText = word;
        runAccWidth = measureFragment(
          backend,
          word,
          fontString,
          rctx,
          rawFamily,
          fontSizePx,
          run.properties.bold,
          run.properties.italic
        );
        if (charSpacingPx !== 0 && word.length > 0) {
          runAccWidth += charSpacingPx * word.length;
        }

        currentFragments.push({
          text: word,
          fontString,
          fillStyle,
          widthPx: runAccWidth,
          fontSizePt,
          props: effectiveProps,
        });
        currentLineWidth = runAccWidth;
      } else {
        runAccText = testText;
        runAccWidth = testWidth;

        currentFragments.push({
          text: word,
          fontString,
          fillStyle,
          widthPx: wordWidth,
          fontSizePt,
          props: effectiveProps,
        });
        currentLineWidth += wordWidth;
      }
      currentLineHeight = Math.max(currentLineHeight, fragmentHeightPx);
      currentAscent = Math.max(currentAscent, ascentPx);
    }
  }

  // Commit any remaining fragments as the last line.
  if (currentFragments.length > 0) {
    commitLine();
  }

  // If the paragraph ended with a BR (e.g. "heading text" + BR before next
  // paragraph's bullets), the BR creates a trailing empty line.
  if (trailingBrRun != null) {
    pushBrEmptyLine(trailingBrRun);
  }

  // If there are no lines at all (empty paragraph), create a single
  // empty line with the default font height.
  if (lines.length === 0) {
    const fontSizePt = getParagraphFontSizePt(paragraph, fontScale, rctx);
    const fontSizePxEmpty = ptToCanvasPx(fontSizePt, dpiScale);
    const emptyLhMul = getFontLineHeightMultiplier(
      rctx,
      getParagraphFontFamily(paragraph, rctx),
      fontSizePxEmpty,
      false,
      false
    );
    const lineSpacingPct = resolveLineSpacingPct(effectiveLineSpacing, lnSpcReduction);
    const heightPx =
      lineSpacingPct >= 0
        ? ptToCanvasPx(fontSizePt * emptyLhMul * (lineSpacingPct / 100), dpiScale)
        : ptToCanvasPx(-lineSpacingPct, dpiScale);
    lines.push({
      fragments: [],
      widthPx: 0,
      heightPx,
      ascentPx: fontSizePxEmpty,
    });
  }

  // If the paragraph has only empty-text runs, the line height was computed
  // using the run's inherited font size (from textDefaults). But OOXML
  // endParaRPr specifies the correct font size for the paragraph mark.
  // Override the line height using endParaRPr when all runs are empty text.
  if (
    paragraph.endParaProperties?.fontSize != null &&
    lines.length === 1 &&
    paragraph.runs.length > 0 &&
    paragraph.runs.every((r) => r.kind === 'run' && r.text === '')
  ) {
    const endParaSizePt = hundredthsPtToPt(paragraph.endParaProperties.fontSize);
    const scaledSizePt = fontScale != null ? endParaSizePt * (fontScale / 100) : endParaSizePt;
    const endParaSizePx = ptToCanvasPx(scaledSizePt, dpiScale);
    const endParaFamily = resolveThemeFontFamily(
      paragraph.endParaProperties.fontFamily ??
        paragraph.endParaProperties.latin ??
        getParagraphFontFamily(paragraph, rctx),
      rctx.theme
    );
    const endParaLhMul = getFontLineHeightMultiplier(
      rctx,
      endParaFamily,
      endParaSizePx,
      false,
      false
    );
    const lineSpacingPct = resolveLineSpacingPct(effectiveLineSpacing, lnSpcReduction);
    const heightPx =
      lineSpacingPct >= 0
        ? ptToCanvasPx(scaledSizePt * endParaLhMul * (lineSpacingPct / 100), dpiScale)
        : ptToCanvasPx(-lineSpacingPct, dpiScale);
    lines[0] = {
      fragments: lines[0].fragments,
      widthPx: lines[0].widthPx,
      heightPx,
      ascentPx: endParaSizePx,
    };
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
  const bulletFontSizePt = bullet.sizePoints
    ? bullet.sizePoints
    : paragraphFontSizePt * ((bullet.sizePercent ?? 100) / 100);

  const fontFamily = resolveThemeFontFamily(bullet.font || 'sans-serif', rctx.theme);
  const resolved = rctx.resolveFont(fontFamily);
  const bulletFontSizePx = ptToCanvasPx(bulletFontSizePt, textDpiScale(rctx));
  const fontString = `${bulletFontSizePx}px "${resolved}"`;

  const bulletLevel = paragraph.properties.level ?? 0;
  const fillStyle = bullet.color
    ? colorToRgba(bullet.color)
    : resolveInheritedTextColor(rctx, bulletLevel);

  const textWithGap = bulletChar + ' ';
  const widthPx = measureFragment(
    rctx.backend,
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
 * Draw a wavy line segment using quadratic bezier curves.
 */
function drawWavyLine(
  backend: RenderBackend,
  x: number,
  y: number,
  width: number,
  amplitude: number,
  wavelength: number
): void {
  backend.beginPath();
  backend.moveTo(x, y);
  const halfWave = wavelength / 2;
  let cx = x;
  let direction = 1;
  while (cx < x + width) {
    const segEnd = Math.min(cx + halfWave, x + width);
    const cpX = (cx + segEnd) / 2;
    const cpY = y + amplitude * direction;
    backend.quadraticCurveTo(cpX, cpY, segEnd, y);
    direction *= -1;
    cx = segEnd;
  }
  backend.stroke();
}

/**
 * Draw underline decoration beneath text.
 */
function drawUnderline(
  backend: RenderBackend,
  x: number,
  baselineY: number,
  width: number,
  fontSizePx: number,
  fillStyle: string,
  style: string = 'single'
): void {
  const underlineY = baselineY + fontSizePx * 0.15;
  const thinThickness = Math.max(1, fontSizePx * 0.05);
  const isHeavy =
    style === 'heavy' ||
    style === 'dottedHeavy' ||
    style === 'dashHeavy' ||
    style === 'dashLongHeavy' ||
    style === 'dotDashHeavy' ||
    style === 'dotDotDashHeavy' ||
    style === 'wavyHeavy';
  const thickness = isHeavy ? thinThickness * 2 : thinThickness;

  // Wavy variants — use bezier curves.
  if (style === 'wavy' || style === 'wavyHeavy' || style === 'wavyDouble') {
    backend.save();
    backend.strokeStyle = fillStyle;
    backend.lineWidth = thickness;
    const amplitude = fontSizePx * 0.04;
    const wavelength = fontSizePx * 0.2;
    drawWavyLine(backend, x, underlineY, width, amplitude, wavelength);
    if (style === 'wavyDouble') {
      const gap = thickness * 2.5;
      drawWavyLine(backend, x, underlineY + gap, width, amplitude, wavelength);
    }
    backend.restore();
    return;
  }

  // Double variant — two thin parallel lines.
  if (style === 'double') {
    const gap = thinThickness * 2;
    backend.fillStyle = fillStyle;
    backend.fillRect(x, underlineY, width, thinThickness);
    backend.fillRect(x, underlineY + gap, width, thinThickness);
    return;
  }

  // Dash/dot patterns — use setLineDash with strokeRect.
  const dot = thickness * 1.5;
  const dashShort = fontSizePx * 0.15;
  const dashLong = fontSizePx * 0.3;
  const dashGap = fontSizePx * 0.1;

  let dashPattern: number[] | null = null;
  switch (style) {
    case 'dotted':
    case 'dottedHeavy':
      dashPattern = [dot, dashGap];
      break;
    case 'dash':
    case 'dashHeavy':
      dashPattern = [dashShort, dashGap];
      break;
    case 'dashLong':
    case 'dashLongHeavy':
      dashPattern = [dashLong, dashGap];
      break;
    case 'dotDash':
    case 'dotDashHeavy':
      dashPattern = [dot, dashGap, dashShort, dashGap];
      break;
    case 'dotDotDash':
    case 'dotDotDashHeavy':
      dashPattern = [dot, dashGap, dot, dashGap, dashShort, dashGap];
      break;
  }

  if (dashPattern) {
    backend.save();
    backend.strokeStyle = fillStyle;
    backend.lineWidth = thickness;
    backend.setLineDash(dashPattern);
    backend.beginPath();
    const lineY = underlineY + thickness / 2;
    backend.moveTo(x, lineY);
    backend.lineTo(x + width, lineY);
    backend.stroke();
    backend.setLineDash([]);
    backend.restore();
    return;
  }

  // Default: solid single / heavy.
  backend.fillStyle = fillStyle;
  backend.fillRect(x, underlineY, width, thickness);
}

/**
 * Draw strikethrough decoration through text.
 */
function drawStrikethrough(
  backend: RenderBackend,
  x: number,
  baselineY: number,
  width: number,
  fontSizePx: number,
  fillStyle: string,
  style: string = 'single'
): void {
  const strikeY = baselineY - fontSizePx * 0.3;
  const thickness = Math.max(1, fontSizePx * 0.05);
  backend.fillStyle = fillStyle;

  if (style === 'double') {
    const gap = thickness * 2;
    backend.fillRect(x, strikeY - gap / 2, width, thickness);
    backend.fillRect(x, strikeY + gap / 2, width, thickness);
  } else {
    backend.fillRect(x, strikeY, width, thickness);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Measure the total height (in scaled px) a text body needs to render all
 * its content, including body insets. This runs the same Phase 1 layout as
 * {@link renderTextBody} but does not draw anything.
 *
 * Used by spAutoFit (shape-auto-fit) to expand shape height to fit text.
 *
 * @param textBody - The text body IR to measure.
 * @param rctx     - The shared render context.
 * @param boundsWidth - The available width in scaled px (shape width).
 * @returns The total required height in scaled px, or 0 if degenerate.
 */
export function measureTextBodyHeight(
  textBody: TextBodyIR,
  rctx: RenderContext,
  boundsWidth: number
): number {
  const dpiScale = textDpiScale(rctx);
  const body = textBody.bodyProperties;

  // Calculate text area by applying body insets.
  const leftInset = emuToScaledPx(body.leftInset ?? DEFAULT_LR_INSET_EMU, rctx);
  const rightInset = emuToScaledPx(body.rightInset ?? DEFAULT_LR_INSET_EMU, rctx);
  const topInset = emuToScaledPx(body.topInset ?? DEFAULT_TB_INSET_EMU, rctx);
  const bottomInset = emuToScaledPx(body.bottomInset ?? DEFAULT_TB_INSET_EMU, rctx);

  const textAreaWidth = boundsWidth - leftInset - rightInset;
  if (textAreaWidth <= 0) return 0;

  const shouldWrap = body.wrap !== 'none';

  // spAutoFit does not use font scaling — text stays at declared size.
  const fontScale = body.autoFit === 'shrink' ? body.fontScale : undefined;
  const lnSpcReduction = body.autoFit === 'shrink' ? body.lnSpcReduction : undefined;

  let totalHeight = 0;
  const autoNumCounters = new Map<number, number>();

  for (let pi = 0; pi < textBody.paragraphs.length; pi++) {
    const paragraph = textBody.paragraphs[pi];
    const fontSizePt = getParagraphFontSizePt(paragraph, fontScale, rctx);

    const paragraphLevel = paragraph.properties.level ?? 0;
    const inheritedPProps =
      rctx.textDefaults?.levels[paragraphLevel]?.paragraphProperties ??
      rctx.textDefaults?.defPPr?.paragraphProperties;

    const effectiveMarginLeft = paragraph.properties.marginLeft ?? inheritedPProps?.marginLeft;
    const effectiveMarginRight = paragraph.properties.marginRight ?? inheritedPProps?.marginRight;
    const effectiveIndent = paragraph.properties.indent ?? inheritedPProps?.indent;
    const effectiveSpaceBefore = paragraph.properties.spaceBefore ?? inheritedPProps?.spaceBefore;
    const effectiveSpaceAfter = paragraph.properties.spaceAfter ?? inheritedPProps?.spaceAfter;
    const effectiveLineSpacing = paragraph.properties.lineSpacing ?? inheritedPProps?.lineSpacing;

    const paraFamily = getParagraphFontFamily(paragraph, rctx);
    const paraFontSizePx = ptToCanvasPx(fontSizePt, dpiScale);
    const paraLhMul = getFontLineHeightMultiplier(rctx, paraFamily, paraFontSizePx, false, false);
    const singleSpacingPt = fontSizePt * paraLhMul;
    const spaceBeforePx = resolveSpacingPx(effectiveSpaceBefore, singleSpacingPt, dpiScale);
    const spaceAfterPx = resolveSpacingPx(effectiveSpaceAfter, singleSpacingPt, dpiScale);

    const marginLeftPx = effectiveMarginLeft ? emuToScaledPx(effectiveMarginLeft, rctx) : 0;
    const marginRightPx = effectiveMarginRight ? emuToScaledPx(effectiveMarginRight, rctx) : 0;
    const indentPx = effectiveIndent ? emuToScaledPx(effectiveIndent, rctx) : 0;

    // Auto-numbering tracking (mirrors renderTextBody).
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
      for (const key of autoNumCounters.keys()) {
        if (key > level) autoNumCounters.delete(key);
      }
      const startAt = bulletProps.startAt ?? 1;
      const current = autoNumCounters.get(level);
      autoNumIndex = current == null ? startAt : current + 1;
      autoNumCounters.set(level, autoNumIndex);
    } else {
      const level = paragraph.properties.level ?? 0;
      for (const key of autoNumCounters.keys()) {
        if (key >= level) autoNumCounters.delete(key);
      }
    }

    const bullet = measureBullet(paragraph, rctx, fontScale, autoNumIndex, bulletProps);
    const bulletWidth = bullet ? bullet.widthPx : 0;

    const availableWidth = shouldWrap ? textAreaWidth - marginLeftPx - marginRightPx : Infinity;
    const lines = wrapParagraph(
      paragraph,
      rctx,
      availableWidth,
      bulletWidth,
      fontScale,
      lnSpcReduction,
      indentPx,
      effectiveLineSpacing
    );

    const isFirstParagraph = pi === 0;
    const isLastParagraph = pi === textBody.paragraphs.length - 1;
    const applyFirstLastSpacing = body.spcFirstLastPara === true;
    const paragraphHeight =
      (isFirstParagraph && !applyFirstLastSpacing ? 0 : spaceBeforePx) +
      lines.reduce((sum, l) => sum + l.heightPx, 0) +
      (isLastParagraph && !applyFirstLastSpacing ? 0 : spaceAfterPx);

    totalHeight += paragraphHeight;
  }

  // Return total content height including insets.
  return totalHeight + topInset + bottomInset;
}

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
  const { backend } = rctx;
  const dpiScale = textDpiScale(rctx);
  const body = textBody.bodyProperties;

  // Calculate text area by applying body insets.
  const leftInset = emuToScaledPx(body.leftInset ?? DEFAULT_LR_INSET_EMU, rctx);
  const rightInset = emuToScaledPx(body.rightInset ?? DEFAULT_LR_INSET_EMU, rctx);
  const topInset = emuToScaledPx(body.topInset ?? DEFAULT_TB_INSET_EMU, rctx);
  const bottomInset = emuToScaledPx(body.bottomInset ?? DEFAULT_TB_INSET_EMU, rctx);

  let textAreaX = bounds.x + leftInset;
  let textAreaY = bounds.y + topInset;
  let textAreaWidth = bounds.width - leftInset - rightInset;
  let textAreaHeight = bounds.height - topInset - bottomInset;

  // Bail out if text area is degenerate.
  if (textAreaWidth <= 0 || textAreaHeight <= 0) return;

  // Determine vertical text mode and swap layout dimensions if needed.
  // Vertical modes rotate the text body so text flows top-to-bottom;
  // the shape's height becomes the effective width for text wrapping.
  const vertMode = body.vert;
  const isVertical =
    vertMode === 'vert' ||
    vertMode === 'vert270' ||
    vertMode === 'eaVert' ||
    vertMode === 'wordArtVert';
  if (isVertical) {
    // Swap layout dimensions: after rotation, the original height is
    // the available width for text wrapping and vice versa.
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    // Re-center text area with swapped dimensions
    const swappedWidth = textAreaHeight;
    const swappedHeight = textAreaWidth;
    textAreaX = cx - swappedWidth / 2;
    textAreaY = cy - swappedHeight / 2;
    textAreaWidth = swappedWidth;
    textAreaHeight = swappedHeight;
  }

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
    marginRightPx: number;
    indentPx: number;
    rtl: boolean;
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
    const effectiveMarginRight = paragraph.properties.marginRight ?? inheritedPProps?.marginRight;
    const effectiveIndent = paragraph.properties.indent ?? inheritedPProps?.indent;
    const effectiveSpaceBefore = paragraph.properties.spaceBefore ?? inheritedPProps?.spaceBefore;
    const effectiveSpaceAfter = paragraph.properties.spaceAfter ?? inheritedPProps?.spaceAfter;
    const effectiveLineSpacing = paragraph.properties.lineSpacing ?? inheritedPProps?.lineSpacing;

    // Percentage-based space-before/after is relative to the font's "single
    // spacing" (font size * lineHeight multiplier), not just font size alone.
    const paraFamily = getParagraphFontFamily(paragraph, rctx);
    const paraFontSizePx = ptToCanvasPx(fontSizePt, dpiScale);
    const paraLhMul = getFontLineHeightMultiplier(rctx, paraFamily, paraFontSizePx, false, false);
    const singleSpacingPt = fontSizePt * paraLhMul;
    const spaceBeforePx = resolveSpacingPx(effectiveSpaceBefore, singleSpacingPt, dpiScale);
    const spaceAfterPx = resolveSpacingPx(effectiveSpaceAfter, singleSpacingPt, dpiScale);

    const marginLeftPx = effectiveMarginLeft ? emuToScaledPx(effectiveMarginLeft, rctx) : 0;
    const marginRightPx = effectiveMarginRight ? emuToScaledPx(effectiveMarginRight, rctx) : 0;
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

    const availableWidth = shouldWrap ? textAreaWidth - marginLeftPx - marginRightPx : Infinity;

    // Resolve tab stops: paragraph-level → inherited from textDefaults.
    const effectiveTabStops = paragraph.properties.tabStops ?? inheritedPProps?.tabStops;

    // Convert defaultTabSize from EMU to px (body-level property).
    const defaultTabSizePx =
      body.defaultTabSize != null ? emuToScaledPx(body.defaultTabSize, rctx) : undefined;

    const lines = wrapParagraph(
      paragraph,
      rctx,
      availableWidth,
      bulletWidth,
      fontScale,
      lnSpcReduction,
      indentPx,
      effectiveLineSpacing,
      defaultTabSizePx,
      effectiveTabStops
    );

    const alignment = paragraph.properties.alignment ?? inheritedPProps?.alignment ?? 'left';
    const rtl = paragraph.properties.rtl ?? inheritedPProps?.rtl ?? false;

    const isFirstParagraph = pi === 0;
    const isLastParagraph = pi === textBody.paragraphs.length - 1;
    // By default, PowerPoint omits space-before on the first paragraph and
    // space-after on the last paragraph.  The bodyPr attribute
    // spcFirstLastPara="1" overrides this, applying spacing to all paragraphs.
    const applyFirstLastSpacing = body.spcFirstLastPara === true;
    const paragraphHeight =
      (isFirstParagraph && !applyFirstLastSpacing ? 0 : spaceBeforePx) +
      lines.reduce((sum, l) => sum + l.heightPx, 0) +
      (isLastParagraph && !applyFirstLastSpacing ? 0 : spaceAfterPx);

    totalHeight += paragraphHeight;

    paragraphLayouts.push({
      lines,
      spaceBeforePx,
      spaceAfterPx,
      alignment,
      bullet,
      marginLeftPx,
      marginRightPx,
      indentPx,
      rtl,
    });
  }

  // Phase 1b: Compute anchorCtr horizontal offset.
  // When anchorCtr is true, the entire text block is horizontally centered
  // within the text area (independent of per-paragraph alignment).
  let anchorCtrOffset = 0;
  if (body.anchorCtr) {
    let maxLineWidth = 0;
    for (const layout of paragraphLayouts) {
      for (const line of layout.lines) {
        const lineWidth =
          line.widthPx +
          layout.marginLeftPx +
          layout.marginRightPx +
          (layout.bullet ? layout.bullet.widthPx : 0);
        maxLineWidth = Math.max(maxLineWidth, lineWidth);
      }
    }
    if (maxLineWidth < textAreaWidth) {
      anchorCtrOffset = (textAreaWidth - maxLineWidth) / 2;
    }
  }

  // Phase 2: Compute vertical alignment offset.
  // Unlike horizontal alignment, OOXML vertical alignment allows text to
  // overflow symmetrically — centered text can extend above and below the
  // text area. We do NOT clamp to 0 here because that would silently
  // degrade middle/bottom alignment to top when the text is taller than
  // the available space.
  let verticalOffset = 0;
  const verticalAlign = body.verticalAlign ?? 'top';
  if (verticalAlign === 'middle') {
    verticalOffset = (textAreaHeight - totalHeight) / 2;
  } else if (verticalAlign === 'bottom' || verticalAlign === 'bottom4') {
    verticalOffset = textAreaHeight - totalHeight;
  }

  // Phase 3: Render each paragraph.
  backend.save();

  // Compensate for non-uniform group scaling on text.
  // Canvas2D ctx.scale() from group transforms distorts text glyphs, but
  // PowerPoint renders text at declared font size regardless of group
  // scaling. Applying the inverse scale here undoes the distortion so text
  // appears at natural proportions. Position mapping is preserved because
  // (pos / gsx) * gsx = pos in the outer coordinate system.
  const gsx = rctx.groupScaleX ?? 1;
  const gsy = rctx.groupScaleY ?? 1;
  if (gsx !== 1 || gsy !== 1) {
    backend.scale(1 / gsx, 1 / gsy);
  }

  // Only clip when autoFit is 'shrink' (text already scaled to fit).
  // Default OOXML behavior (autoFit='none') allows text to overflow visually.
  if (body.autoFit === 'shrink') {
    backend.beginPath();
    backend.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    backend.clip();
  }

  // Apply vertical text direction transform.
  // Rotates the canvas so that text laid out horizontally appears in the
  // correct vertical orientation. The layout dimensions were already swapped
  // above (before Phase 1) so text wrapping used the correct effective width.
  if (isVertical) {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    if (vertMode === 'vert' || vertMode === 'eaVert' || vertMode === 'wordArtVert') {
      // 90° clockwise: text reads top-to-bottom
      backend.translate(cx, cy);
      backend.rotate(Math.PI / 2);
      backend.translate(-cx, -cy);
    } else if (vertMode === 'vert270') {
      // 90° counter-clockwise: text reads bottom-to-top
      backend.translate(cx, cy);
      backend.rotate(-Math.PI / 2);
      backend.translate(-cx, -cy);
    }

    // Emit diagnostics for approximated complex vertical modes.
    if (vertMode === 'eaVert' || vertMode === 'wordArtVert') {
      rctx.diagnostics?.emit({
        category: 'partial-rendering',
        severity: 'info',
        message: `Vertical text mode "${vertMode}" approximated with simple 90° rotation (per-glyph upright rotation not implemented)`,
        context: { slideNumber: rctx.slideNumber },
      });
    }
  }

  // Apply text body rotation (independent of shape rotation).
  // Rotates the text within the text box around its center.
  const bodyRotation = body.rotation;
  if (bodyRotation != null && bodyRotation !== 0) {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    backend.translate(cx, cy);
    backend.rotate((bodyRotation * Math.PI) / 180);
    backend.translate(-cx, -cy);
  }

  let cursorY = textAreaY + verticalOffset;

  for (let pi = 0; pi < paragraphLayouts.length; pi++) {
    const layout = paragraphLayouts[pi];

    // Apply space before (skip for first paragraph unless spcFirstLastPara).
    const applyFirstLastSpacing = body.spcFirstLastPara === true;
    if (pi > 0 || applyFirstLastSpacing) {
      cursorY += layout.spaceBeforePx;
    }

    // For hanging indent (negative indent): bullet at marginLeft+indent, text at marginLeft.
    // For positive indent: first line text at marginLeft+indent, continuation at marginLeft.
    const isRtl = layout.rtl;

    // RTL: swap margin semantics — marginLeft becomes the right-side margin and vice versa.
    const effectiveMarginLeft = isRtl ? layout.marginRightPx : layout.marginLeftPx;
    const effectiveMarginRight = isRtl ? layout.marginLeftPx : layout.marginRightPx;

    const textBaseX = textAreaX + effectiveMarginLeft + anchorCtrOffset;
    const hangingIndent = layout.indentPx < 0;
    const bulletX = hangingIndent
      ? textAreaX + Math.max(0, effectiveMarginLeft + layout.indentPx)
      : textBaseX;
    const firstLineTextX = hangingIndent ? textBaseX : textBaseX + layout.indentPx;
    const textAvailableWidth = textAreaWidth - effectiveMarginLeft - effectiveMarginRight;

    // RTL: mirror alignment semantics.
    // In RTL, default/left alignment means right-aligned, and right alignment means left-aligned.
    let effectiveAlignment = layout.alignment;
    if (isRtl) {
      if (effectiveAlignment === 'left') {
        effectiveAlignment = 'right';
      } else if (effectiveAlignment === 'right') {
        effectiveAlignment = 'left';
      }
      // 'center', 'justify', 'distributed' remain unchanged.
    }

    // Set canvas direction for RTL text rendering.
    if (isRtl && 'direction' in backend) {
      (backend as unknown as { direction: string }).direction = 'rtl';
    }

    for (let li = 0; li < layout.lines.length; li++) {
      const line = layout.lines[li];
      const isFirst = li === 0;

      // Compute alignment offset for this line.
      // Use Canvas2D measurement for actual rendered widths to prevent
      // drift between precomputed metrics (used for line-wrapping) and the
      // browser's actual rendering font.
      const lineAvailableWidth =
        isFirst && !hangingIndent
          ? Math.max(0, textAvailableWidth - layout.indentPx)
          : textAvailableWidth;
      let lineX = isFirst && !hangingIndent ? firstLineTextX : textBaseX;

      // Measure actual rendered line width using Canvas2D.
      // Tab fragments use their pre-computed widthPx since measureText('\t')
      // doesn't account for tab stop positioning.
      let renderedLineWidth = 0;
      for (const frag of line.fragments) {
        if (frag.text === '\t') {
          renderedLineWidth += frag.widthPx;
        } else {
          backend.font = frag.fontString;
          renderedLineWidth += backend.measureText(frag.text).width;
        }
      }
      if (isFirst && layout.bullet && !hangingIndent) {
        backend.font = layout.bullet.fontString;
        renderedLineWidth += backend.measureText(layout.bullet.text).width;
      }

      if (effectiveAlignment === 'center') {
        lineX += (lineAvailableWidth - renderedLineWidth) / 2;
      } else if (effectiveAlignment === 'right') {
        lineX += lineAvailableWidth - renderedLineWidth;
      }
      // 'left': no offset. 'justify'/'distributed': handled below via word spacing.

      let drawX = lineX;
      const baselineY = cursorY + line.ascentPx;

      // Justify/distributed: distribute extra horizontal space between words.
      // Last line of paragraph renders left-aligned (standard justify behavior).
      // For RTL, the last line renders right-aligned instead.
      let justifyExtraPerGap = 0;
      const isLastLine = li === layout.lines.length - 1;
      if (
        (effectiveAlignment === 'justify' || effectiveAlignment === 'distributed') &&
        !isLastLine &&
        line.fragments.length > 1
      ) {
        // Count word gaps: fragments ending with whitespace (excluding the last fragment).
        let gapCount = 0;
        for (let fi = 0; fi < line.fragments.length - 1; fi++) {
          const t = line.fragments[fi].text;
          if (t.length > 0 && /\s$/.test(t)) {
            gapCount++;
          }
        }
        if (gapCount > 0) {
          const extraSpace = lineAvailableWidth - renderedLineWidth;
          if (extraSpace > 0) {
            justifyExtraPerGap = extraSpace / gapCount;
          }
        }
      }

      // For RTL justify: right-align the last line instead of left-aligning it.
      if (
        isRtl &&
        isLastLine &&
        (effectiveAlignment === 'justify' || effectiveAlignment === 'distributed')
      ) {
        lineX += lineAvailableWidth - renderedLineWidth;
        drawX = lineX;
      }

      // Draw bullet on the first line of the paragraph.
      if (li === 0 && layout.bullet) {
        backend.font = layout.bullet.fontString;
        backend.fillStyle = layout.bullet.fillStyle;
        if (isRtl) {
          // RTL: bullet appears on the right side (the "start" of the line in RTL).
          const bulletWidth = backend.measureText(layout.bullet.text).width;
          if (hangingIndent) {
            // Hanging indent RTL: bullet at the right margin area, mirroring
            // the LTR hanging indent position on the left.
            const rtlBulletX =
              textAreaX +
              textAreaWidth -
              effectiveMarginRight -
              Math.abs(layout.indentPx) +
              anchorCtrOffset;
            backend.fillText(layout.bullet.text, rtlBulletX, baselineY);
          } else {
            // Normal RTL inline bullet: bullet at the right end of the rendered content.
            // The renderedLineWidth already includes the bullet width, and the line
            // is right-aligned, so the bullet sits at the far right.
            const rtlBulletX = drawX + renderedLineWidth - bulletWidth;
            backend.fillText(layout.bullet.text, rtlBulletX, baselineY);
          }
        } else if (hangingIndent) {
          // Hanging indent: bullet draws at bulletX, text stays at lineX.
          backend.fillText(layout.bullet.text, bulletX, baselineY);
        } else {
          // Normal: bullet drawn inline before text.
          backend.fillText(layout.bullet.text, drawX, baselineY);
          drawX += backend.measureText(layout.bullet.text).width;
        }
      }

      // Draw each text fragment in the line.
      for (let fi = 0; fi < line.fragments.length; fi++) {
        const frag = line.fragments[fi];

        // Tab characters are invisible — advance by the pre-computed tab width
        // without drawing anything.
        if (frag.text === '\t') {
          drawX += frag.widthPx;
          continue;
        }

        backend.font = frag.fontString;
        backend.fillStyle = frag.fillStyle;

        const fontSizePx = ptToCanvasPx(frag.fontSizePt, dpiScale);

        // Character spacing: apply via Canvas letterSpacing when available.
        const fragSpacing = frag.props.spacing;
        if (fragSpacing != null && fragSpacing !== 0 && 'letterSpacing' in backend) {
          const spacingPx = ptToCanvasPx(hundredthsPtToPt(fragSpacing), dpiScale);
          (backend as unknown as { letterSpacing: string }).letterSpacing = `${spacingPx}px`;
        }

        // Baseline shift for superscript/subscript.
        let baselineShift = 0;
        if (frag.props.baseline != null && frag.props.baseline !== 0) {
          baselineShift = -(frag.props.baseline / 100) * fontSizePx;
        }

        // Draw highlight background behind text.
        if (frag.props.highlight) {
          const hlColor = colorToRgba(frag.props.highlight);
          const textMetrics = backend.measureText(frag.text);
          const hlHeight = line.heightPx;
          const hlY = cursorY;
          backend.fillStyle = hlColor;
          backend.fillRect(drawX, hlY, textMetrics.width, hlHeight);
          backend.fillStyle = frag.fillStyle;
        }

        // Draw text outline (stroke) behind fill for correct visual stacking.
        if (frag.props.outline && frag.props.outline.width != null) {
          const savedStrokeStyle = backend.strokeStyle;
          const savedLineWidth = backend.lineWidth;
          backend.lineWidth = emuToScaledPx(frag.props.outline.width, rctx);
          backend.strokeStyle = frag.props.outline.color
            ? colorToRgba(frag.props.outline.color)
            : frag.fillStyle;
          backend.strokeText(frag.text, drawX, baselineY + baselineShift);
          backend.strokeStyle = savedStrokeStyle;
          backend.lineWidth = savedLineWidth;
        }

        backend.fillText(frag.text, drawX, baselineY + baselineShift);

        // Measure the ACTUAL rendered width using Canvas2D for draw advancement.
        // Must be done BEFORE resetting letterSpacing so the measurement includes
        // the same spacing that was used during fillText.
        const renderedWidth = backend.measureText(frag.text).width;

        // Reset letterSpacing after drawing AND measuring.
        if (fragSpacing != null && fragSpacing !== 0 && 'letterSpacing' in backend) {
          (backend as unknown as { letterSpacing: string }).letterSpacing = '0px';
        }

        // Draw underline.
        if (frag.props.underline && frag.props.underline !== 'none') {
          const ulColor = resolveUnderlineFillColor(frag.props.underlineFill) ?? frag.fillStyle;
          drawUnderline(
            backend,
            drawX,
            baselineY + baselineShift,
            renderedWidth,
            fontSizePx,
            ulColor,
            frag.props.underline
          );
        }

        // Draw strikethrough.
        if (frag.props.strikethrough && frag.props.strikethrough !== 'none') {
          drawStrikethrough(
            backend,
            drawX,
            baselineY + baselineShift,
            renderedWidth,
            fontSizePx,
            frag.fillStyle,
            frag.props.strikethrough
          );
        }

        drawX += renderedWidth;

        // Justify: add extra space after word-ending fragments.
        if (
          justifyExtraPerGap > 0 &&
          fi < line.fragments.length - 1 &&
          frag.text.length > 0 &&
          /\s$/.test(frag.text)
        ) {
          drawX += justifyExtraPerGap;
        }
      }

      cursorY += line.heightPx;
    }

    // Reset canvas direction after rendering RTL paragraph.
    if (isRtl && 'direction' in backend) {
      (backend as unknown as { direction: string }).direction = 'ltr';
    }

    // Skip space-after on the last paragraph unless spcFirstLastPara is set,
    // matching the height calculation phase (lines 1030-1033).
    const isLastParagraph = pi === paragraphLayouts.length - 1;
    if (!isLastParagraph || applyFirstLastSpacing) {
      cursorY += layout.spaceAfterPx;
    }
  }

  backend.restore();
}

// ---------------------------------------------------------------------------
// Cursor measurement for text editing
// ---------------------------------------------------------------------------

/**
 * Measure the canvas position of a cursor at a given text position.
 *
 * Walks through the text body layout to find the (x, y, height) of a cursor
 * placed at the specified paragraph, run, and character offset. This mirrors
 * the layout logic of `renderTextBody` to produce accurate coordinates.
 *
 * @param backend - The render backend (Canvas2D) for text measurement.
 * @param textBody - The text body IR containing paragraphs and body properties.
 * @param position - The cursor position (paragraph, run, character offset).
 * @param bounds - The shape bounding rectangle in canvas coordinates.
 * @param rctx - The render context with theme, font resolver, and DPI scale.
 * @returns The cursor position {x, y, height} in canvas coordinates, or null
 *          if the position is out of range.
 */
export function measureCursorPosition(
  backend: RenderBackend,
  textBody: TextBodyIR,
  position: { paragraphIndex: number; runIndex: number; charOffset: number },
  bounds: { x: number; y: number; width: number; height: number },
  rctx: RenderContext,
): { x: number; y: number; height: number } | null {
  const dpiScale = textDpiScale(rctx);
  const body = textBody.bodyProperties;

  // Validate paragraph index.
  if (position.paragraphIndex < 0 || position.paragraphIndex >= textBody.paragraphs.length) {
    return null;
  }

  // Calculate text area (same as renderTextBody).
  const leftInset = emuToScaledPx(body.leftInset ?? DEFAULT_LR_INSET_EMU, rctx);
  const rightInset = emuToScaledPx(body.rightInset ?? DEFAULT_LR_INSET_EMU, rctx);
  const topInset = emuToScaledPx(body.topInset ?? DEFAULT_TB_INSET_EMU, rctx);
  const bottomInset = emuToScaledPx(body.bottomInset ?? DEFAULT_TB_INSET_EMU, rctx);

  const textAreaX = bounds.x + leftInset;
  const textAreaY = bounds.y + topInset;
  const textAreaWidth = bounds.width - leftInset - rightInset;
  const textAreaHeight = bounds.height - topInset - bottomInset;

  if (textAreaWidth <= 0 || textAreaHeight <= 0) return null;

  const shouldWrap = body.wrap !== 'none';
  const fontScale = body.autoFit === 'shrink' ? body.fontScale : undefined;
  const lnSpcReduction = body.autoFit === 'shrink' ? body.lnSpcReduction : undefined;

  // Layout all paragraphs to compute total height (needed for vertical alignment).
  interface CursorParagraphLayout {
    lines: WrappedLine[];
    spaceBeforePx: number;
    spaceAfterPx: number;
    alignment: 'left' | 'center' | 'right' | 'justify' | 'distributed';
    marginLeftPx: number;
    indentPx: number;
    bulletWidth: number;
  }

  const layouts: CursorParagraphLayout[] = [];
  let totalHeight = 0;

  for (let pi = 0; pi < textBody.paragraphs.length; pi++) {
    const paragraph = textBody.paragraphs[pi];
    const fontSizePt = getParagraphFontSizePt(paragraph, fontScale, rctx);
    const paragraphLevel = paragraph.properties.level ?? 0;
    const inheritedPProps =
      rctx.textDefaults?.levels[paragraphLevel]?.paragraphProperties ??
      rctx.textDefaults?.defPPr?.paragraphProperties;

    const effectiveMarginLeft = paragraph.properties.marginLeft ?? inheritedPProps?.marginLeft;
    const effectiveIndent = paragraph.properties.indent ?? inheritedPProps?.indent;
    const effectiveSpaceBefore = paragraph.properties.spaceBefore ?? inheritedPProps?.spaceBefore;
    const effectiveSpaceAfter = paragraph.properties.spaceAfter ?? inheritedPProps?.spaceAfter;
    const effectiveLineSpacing = paragraph.properties.lineSpacing ?? inheritedPProps?.lineSpacing;

    const paraFamily = getParagraphFontFamily(paragraph, rctx);
    const paraFontSizePx = ptToCanvasPx(fontSizePt, dpiScale);
    const paraLhMul = getFontLineHeightMultiplier(rctx, paraFamily, paraFontSizePx, false, false);
    const singleSpacingPt = fontSizePt * paraLhMul;
    const spaceBeforePx = resolveSpacingPx(effectiveSpaceBefore, singleSpacingPt, dpiScale);
    const spaceAfterPx = resolveSpacingPx(effectiveSpaceAfter, singleSpacingPt, dpiScale);

    const marginLeftPx = effectiveMarginLeft ? emuToScaledPx(effectiveMarginLeft, rctx) : 0;
    const indentPx = effectiveIndent ? emuToScaledPx(effectiveIndent, rctx) : 0;

    const hasVisibleText = paragraph.runs.some((r) => r.kind === 'run' && r.text.length > 0);
    const bulletProps =
      paragraph.bulletProperties ??
      (hasVisibleText
        ? (rctx.textDefaults?.levels[paragraphLevel]?.bulletProperties ??
          rctx.textDefaults?.defPPr?.bulletProperties)
        : undefined);
    const bullet = measureBullet(paragraph, rctx, fontScale, undefined, bulletProps);
    const bulletWidth = bullet ? bullet.widthPx : 0;

    const availableWidth = shouldWrap
      ? textAreaWidth - marginLeftPx
      : Infinity;

    const defaultTabSizePx =
      body.defaultTabSize != null ? emuToScaledPx(body.defaultTabSize, rctx) : undefined;
    const effectiveTabStops = paragraph.properties.tabStops ?? inheritedPProps?.tabStops;

    const lines = wrapParagraph(
      paragraph,
      rctx,
      availableWidth,
      bulletWidth,
      fontScale,
      lnSpcReduction,
      indentPx,
      effectiveLineSpacing,
      defaultTabSizePx,
      effectiveTabStops,
    );

    const alignment = paragraph.properties.alignment ?? inheritedPProps?.alignment ?? 'left';

    const isFirstParagraph = pi === 0;
    const isLastParagraph = pi === textBody.paragraphs.length - 1;
    const applyFirstLastSpacing = body.spcFirstLastPara === true;
    const paragraphHeight =
      (isFirstParagraph && !applyFirstLastSpacing ? 0 : spaceBeforePx) +
      lines.reduce((sum, l) => sum + l.heightPx, 0) +
      (isLastParagraph && !applyFirstLastSpacing ? 0 : spaceAfterPx);

    totalHeight += paragraphHeight;
    layouts.push({
      lines,
      spaceBeforePx,
      spaceAfterPx,
      alignment,
      marginLeftPx,
      indentPx,
      bulletWidth,
    });
  }

  // Compute vertical alignment offset.
  let verticalOffset = 0;
  const verticalAlign = body.verticalAlign ?? 'top';
  if (verticalAlign === 'middle') {
    verticalOffset = (textAreaHeight - totalHeight) / 2;
  } else if (verticalAlign === 'bottom' || verticalAlign === 'bottom4') {
    verticalOffset = textAreaHeight - totalHeight;
  }

  // Walk to the target position.
  let cursorY = textAreaY + verticalOffset;

  for (let pi = 0; pi < layouts.length; pi++) {
    const layout = layouts[pi];
    const applyFirstLastSpacing = body.spcFirstLastPara === true;

    if (pi > 0 || applyFirstLastSpacing) {
      cursorY += layout.spaceBeforePx;
    }

    const textBaseX = textAreaX + layout.marginLeftPx;
    const hangingIndent = layout.indentPx < 0;
    const firstLineTextX = hangingIndent ? textBaseX : textBaseX + layout.indentPx;
    const textAvailableWidth = textAreaWidth - layout.marginLeftPx;

    // Track cumulative run/character position through the wrapped lines.
    // Each line contains fragments from sequential runs. We need to map
    // (runIndex, charOffset) to a specific fragment on a specific line.
    let globalCharIndex = 0; // Flat char index across all runs in paragraph.

    // Compute target flat char index.
    const paragraph = textBody.paragraphs[pi];
    if (pi === position.paragraphIndex) {
      let targetCharIndex = 0;
      for (let ri = 0; ri < position.runIndex && ri < paragraph.runs.length; ri++) {
        const run = paragraph.runs[ri];
        targetCharIndex += run.kind === 'run' ? run.text.length : 0;
      }
      targetCharIndex += position.charOffset;

      // Walk lines to find which line contains the target position.
      for (let li = 0; li < layout.lines.length; li++) {
        const line = layout.lines[li];
        const isFirst = li === 0;

        // Compute lineX (alignment offset).
        const lineAvailableWidth =
          isFirst && !hangingIndent
            ? Math.max(0, textAvailableWidth - layout.indentPx)
            : textAvailableWidth;
        let lineX = isFirst && !hangingIndent ? firstLineTextX : textBaseX;

        // Measure rendered line width for alignment.
        let renderedLineWidth = 0;
        for (const frag of line.fragments) {
          if (frag.text === '\t') {
            renderedLineWidth += frag.widthPx;
          } else {
            backend.font = frag.fontString;
            renderedLineWidth += backend.measureText(frag.text).width;
          }
        }
        if (isFirst && layout.bulletWidth > 0 && !hangingIndent) {
          renderedLineWidth += layout.bulletWidth;
        }

        if (layout.alignment === 'center') {
          lineX += (lineAvailableWidth - renderedLineWidth) / 2;
        } else if (layout.alignment === 'right') {
          lineX += lineAvailableWidth - renderedLineWidth;
        }

        let drawX = lineX;
        // Account for bullet on first line.
        if (isFirst && layout.bulletWidth > 0 && !hangingIndent) {
          drawX += layout.bulletWidth;
        }

        // Count characters in this line.
        let lineChars = 0;
        for (const frag of line.fragments) {
          lineChars += frag.text.length;
        }

        if (
          globalCharIndex + lineChars >= targetCharIndex ||
          li === layout.lines.length - 1
        ) {
          // Target is on this line. Walk fragments to find exact x.
          let remaining = targetCharIndex - globalCharIndex;
          for (const frag of line.fragments) {
            if (remaining <= 0) break;
            if (remaining >= frag.text.length) {
              // Skip entire fragment.
              if (frag.text === '\t') {
                drawX += frag.widthPx;
              } else {
                backend.font = frag.fontString;
                drawX += backend.measureText(frag.text).width;
              }
              remaining -= frag.text.length;
            } else {
              // Cursor is within this fragment.
              const partial = frag.text.substring(0, remaining);
              backend.font = frag.fontString;
              drawX += backend.measureText(partial).width;
              remaining = 0;
            }
          }

          return {
            x: drawX,
            y: cursorY,
            height: line.heightPx,
          };
        }

        globalCharIndex += lineChars;
        cursorY += line.heightPx;
      }

      // Shouldn't reach here if position is valid, but return end-of-paragraph.
      const lastLine = layout.lines[layout.lines.length - 1];
      return {
        x: textBaseX,
        y: cursorY - (lastLine?.heightPx ?? 0),
        height: lastLine?.heightPx ?? ptToCanvasPx(DEFAULT_FONT_SIZE_PT, dpiScale),
      };
    }

    // Not the target paragraph — advance cursorY past all lines.
    for (const line of layout.lines) {
      cursorY += line.heightPx;
    }

    const isLastParagraph = pi === layouts.length - 1;
    const applyFirstLast = body.spcFirstLastPara === true;
    if (!isLastParagraph || applyFirstLast) {
      cursorY += layout.spaceAfterPx;
    }
  }

  return null;
}
