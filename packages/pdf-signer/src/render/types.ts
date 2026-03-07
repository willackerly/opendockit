/**
 * Render module types.
 */

/** Options for rendering a PDF page. */
export interface RenderOptions {
  /** Scale factor for rendering. Default: 1.5 (~108 DPI on letter-size). */
  scale?: number;
  /** Background color (CSS color string). Default: 'white'. */
  background?: string;
}

/** Result of rendering a PDF page. */
export interface RenderResult {
  /** Rendered page as PNG bytes. */
  png: Uint8Array;
  /** Width of the rendered image in pixels. */
  width: number;
  /** Height of the rendered image in pixels. */
  height: number;
  /** The page index that was rendered (0-based). */
  pageIndex: number;
}
