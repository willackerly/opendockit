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
  /** Diagnostics collected during rendering (warnings/errors that were handled gracefully). */
  diagnostics?: RenderDiagnostic[];
}

// ---------------------------------------------------------------------------
// Render diagnostics — surfaces silent failures instead of swallowing them
// ---------------------------------------------------------------------------

export interface RenderDiagnostic {
  type: 'warning' | 'error';
  category: 'font' | 'image' | 'shading' | 'operator' | 'color' | 'pattern';
  message: string;
  details?: Record<string, unknown>;
}

/** Mutable collector threaded through the rendering pipeline. */
export class RenderDiagnosticsCollector {
  readonly items: RenderDiagnostic[] = [];

  warn(category: RenderDiagnostic['category'], message: string, details?: Record<string, unknown>): void {
    this.items.push({ type: 'warning', category, message, details });
  }

  error(category: RenderDiagnostic['category'], message: string, details?: Record<string, unknown>): void {
    this.items.push({ type: 'error', category, message, details });
  }

  get length(): number {
    return this.items.length;
  }
}
