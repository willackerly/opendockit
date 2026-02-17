/**
 * Basic text measurement for layout calculations.
 *
 * Uses Canvas2D measureText() when available (browser/OffscreenCanvas),
 * falls back to character-width estimation (Node.js/tests).
 */

// ---------------------------------------------------------------------------
// Average character width ratios (relative to font size)
// ---------------------------------------------------------------------------

/** Ratio of average character width to font size for monospace fonts. */
const MONOSPACE_RATIO = 0.6;

/** Ratio of average character width to font size for serif fonts. */
const SERIF_RATIO = 0.5;

/** Ratio of average character width to font size for sans-serif fonts. */
const SANS_SERIF_RATIO = 0.48;

/**
 * Known monospace font families (lowercase) for ratio classification.
 */
const MONOSPACE_FONTS = new Set([
  'consolas',
  'courier new',
  'courier',
  'lucida console',
  'monospace',
  'ms gothic',
  'andale mono',
  'monaco',
  'menlo',
  'source code pro',
  'fira code',
  'jetbrains mono',
]);

/**
 * Known serif font families (lowercase) for ratio classification.
 */
const SERIF_FONTS = new Set([
  'times new roman',
  'times',
  'georgia',
  'cambria',
  'cambria math',
  'palatino',
  'palatino linotype',
  'book antiqua',
  'garamond',
  'serif',
  'ms mincho',
  'ms pmincho',
  'yu mincho',
  'simsun',
  'mingliu',
  'pmingliu',
  'batang',
]);

// ---------------------------------------------------------------------------
// Canvas singleton (lazy-initialized, browser only)
// ---------------------------------------------------------------------------

let cachedCtx: CanvasRenderingContext2D | null | undefined;

function getCanvasContext(): CanvasRenderingContext2D | null {
  if (cachedCtx !== undefined) {
    return cachedCtx;
  }

  // Try OffscreenCanvas first (available in modern browsers and workers)
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const canvas = new OffscreenCanvas(1, 1);
      cachedCtx = (canvas.getContext('2d') as CanvasRenderingContext2D | null) ?? null;
      return cachedCtx;
    } catch {
      // Fall through to document.createElement
    }
  }

  // Try regular Canvas (browser with DOM)
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      cachedCtx = canvas.getContext('2d');
      return cachedCtx;
    } catch {
      cachedCtx = null;
      return null;
    }
  }

  cachedCtx = null;
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Estimate average character width as a ratio of font size.
 * Used as fallback when Canvas is not available.
 *
 * @param fontFamily - CSS font-family string
 * @returns ratio of average character width to font size
 */
export function getAverageCharWidthRatio(fontFamily: string): number {
  const key = fontFamily.toLowerCase().trim();

  // Check primary font name (first entry before comma)
  const primary = key.split(',')[0].trim().replace(/['"]/g, '');

  if (MONOSPACE_FONTS.has(primary) || key.includes('monospace')) {
    return MONOSPACE_RATIO;
  }

  if (SERIF_FONTS.has(primary) || (key.includes('serif') && !key.includes('sans-serif'))) {
    return SERIF_RATIO;
  }

  return SANS_SERIF_RATIO;
}

/**
 * Estimate the width of a text string in pixels.
 * Uses Canvas2D measureText() when available (browser), falls back to
 * character-width estimation (Node.js/tests).
 *
 * @param text - text string to measure
 * @param fontSizePx - font size in pixels
 * @param fontFamily - CSS font-family string
 * @returns estimated width in pixels
 */
export function estimateTextWidth(text: string, fontSizePx: number, fontFamily: string): number {
  if (text.length === 0) {
    return 0;
  }

  const ctx = getCanvasContext();
  if (ctx !== null) {
    ctx.font = `${fontSizePx}px ${fontFamily}`;
    return ctx.measureText(text).width;
  }

  // Fallback: character-count estimation
  const ratio = getAverageCharWidthRatio(fontFamily);
  return text.length * fontSizePx * ratio;
}

/**
 * Calculate line height from font size and optional line spacing.
 *
 * @param fontSizePx - font size in pixels
 * @param lineSpacingPct - line spacing as percentage (100 = single, 150 = 1.5x).
 *                         Defaults to 120 (standard 1.2x line height).
 * @returns line height in pixels
 */
export function getLineHeight(fontSizePx: number, lineSpacingPct = 120): number {
  return fontSizePx * (lineSpacingPct / 100);
}
