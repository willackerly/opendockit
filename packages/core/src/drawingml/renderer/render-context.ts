/**
 * Shared rendering context passed to all DrawingML renderers.
 *
 * This interface provides everything a renderer needs: a Canvas2D context,
 * DPI scale factor, theme data, media cache, and font resolution. It is
 * threaded through every renderer call to avoid global state.
 */

import type { SlideElementIR, ThemeIR, ListStyleIR } from '../../ir/index.js';
import type { MediaCache } from '../../media/index.js';
import type { FontMetricsDB } from '../../font/font-metrics-db.js';
import { emuToPx } from '../../units/index.js';

/**
 * A dynamically loaded renderer for a specific element kind.
 *
 * Used by the progressive fidelity pipeline: when a WASM module loads,
 * it registers a render function here so that re-rendering a slide
 * uses the new capability instead of drawing a grey-box placeholder.
 */
export type DynamicRenderer = (element: SlideElementIR, rctx: RenderContext) => void;

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
  /**
   * Dynamically loaded renderers, keyed by element kind.
   *
   * When present, {@link renderSlideElement} checks this map before
   * the built-in switch. This allows WASM modules (or other lazy
   * capabilities) to upgrade rendering of specific element kinds
   * without modifying the core dispatch.
   */
  dynamicRenderers?: Map<string, DynamicRenderer>;
  /**
   * Effective color map for the current slide.
   *
   * Maps scheme color roles (e.g. 'tx1', 'bg1') to theme color slots
   * (e.g. 'dk1', 'lt1'). Merged from master → layout → slide overrides.
   *
   * Used by text renderers to resolve default text/background colors
   * when no explicit color is specified on a run.
   */
  colorMap?: Record<string, string>;
  /**
   * Merged text style defaults for the current shape.
   *
   * Built from shape lstStyle → layout lstStyle → master txStyles chain.
   * Used by text renderers to resolve inherited color/font/size/bullet
   * when paragraphs lack explicit properties.
   */
  textDefaults?: ListStyleIR;
  /**
   * Precomputed font metrics database for accurate text measurement.
   *
   * When present, text measurement uses per-character advance widths from
   * real font files instead of Canvas2D measurement. This gives correct
   * line-breaking and auto-fit even when the actual font (e.g. Calibri)
   * is substituted with a visually different font (e.g. Arial).
   */
  fontMetricsDB?: FontMetricsDB;
  /**
   * Element kinds whose WASM modules are currently being loaded.
   *
   * When present, renderers for deferred elements (chart, etc.) can show
   * a "loading..." indicator instead of a static grey-box placeholder.
   */
  loadingModuleKinds?: Set<string>;
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
