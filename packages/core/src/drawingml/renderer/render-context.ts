/**
 * Shared rendering context passed to all DrawingML renderers.
 *
 * This interface provides everything a renderer needs: a Canvas2D context,
 * DPI scale factor, theme data, media cache, and font resolution. It is
 * threaded through every renderer call to avoid global state.
 */

import type { ThemeIR } from '../../ir/index.js';
import type { MediaCache } from '../../media/index.js';
import { emuToPx } from '../../units/index.js';

/**
 * Shared rendering context passed to all renderers.
 */
export interface RenderContext {
  /** The Canvas2D rendering context. */
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  /** DPI scale factor (e.g., 2 for Retina). */
  dpiScale: number;
  /** The presentation theme. */
  theme: ThemeIR;
  /** Cache for loaded media (images). */
  mediaCache: MediaCache;
  /** Resolve a font name to an available font. */
  resolveFont: (fontName: string) => string;
}

/**
 * Convert EMU to scaled pixels in the current render context.
 *
 * Applies the context's DPI scale so that rendering is crisp on
 * high-density displays. The raw pixel value is returned without
 * rounding — the caller decides whether to snap to integers.
 */
export function emuToScaledPx(emu: number, rctx: RenderContext): number {
  return emuToPx(emu, 96 * rctx.dpiScale);
}
