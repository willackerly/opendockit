/**
 * SlideKit — the public API for loading and rendering PPTX presentations.
 *
 * Provides a high-level interface for:
 * - Loading a PPTX file from binary data
 * - Rendering individual slides to a Canvas2D context
 * - Navigating between slides
 * - Managing canvas lifecycle and DPI scaling
 *
 * Browser-only: uses HTMLCanvasElement and related DOM APIs. The model
 * and parser layers remain Node.js-compatible.
 *
 * Usage:
 * ```ts
 * const kit = new SlideKit({ container: document.getElementById('viewer')! });
 * const info = await kit.load(pptxArrayBuffer);
 * await kit.renderSlide(0);
 * await kit.nextSlide();
 * kit.dispose();
 * ```
 */

import type { ThemeIR } from '@opendockit/core';
import type { OpcPackage } from '@opendockit/core/opc';
import { OpcPackageReader } from '@opendockit/core/opc';
import { MediaCache } from '@opendockit/core/media';
import type { RenderContext } from '@opendockit/core/drawingml/renderer';
import { emuToPx } from '@opendockit/core';
import type { PresentationIR, SlideIR } from '../model/index.js';
import { renderSlide } from '../renderer/index.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/** Options for constructing a {@link SlideKit} instance. */
export interface SlideKitOptions {
  /** Container element to render into. A canvas will be created inside it. */
  container?: HTMLElement;
  /** Canvas element to render onto (alternative to container). */
  canvas?: HTMLCanvasElement;
  /** DPI scale factor. Defaults to `window.devicePixelRatio` or 1. */
  dpiScale?: number;
  /** Font name substitution overrides (source font -> replacement font). */
  fontSubstitutions?: Record<string, string>;
  /** Progress callback for loading and rendering phases. */
  onProgress?: (event: SlideKitProgressEvent) => void;
}

/** Progress event emitted during load and render operations. */
export interface SlideKitProgressEvent {
  /** Current phase of the operation. */
  phase: 'loading' | 'parsing' | 'rendering';
  /** Current progress within the phase (0-based). */
  current: number;
  /** Total items in the phase. */
  total: number;
  /** Optional human-readable message. */
  message?: string;
}

/** Summary information returned after loading a PPTX file. */
export interface LoadedPresentation {
  /** Total number of slides. */
  slideCount: number;
  /** Slide width in EMU. */
  slideWidth: number;
  /** Slide height in EMU. */
  slideHeight: number;
  /** The resolved presentation theme. */
  theme: ThemeIR;
}

// ---------------------------------------------------------------------------
// SlideKit
// ---------------------------------------------------------------------------

/**
 * The main public API for rendering PPTX presentations.
 *
 * Manages the full lifecycle: open OPC package, parse presentation
 * metadata, lazily parse individual slides, render to Canvas2D with
 * proper DPI scaling, and navigate between slides.
 */
export class SlideKit {
  private _container: HTMLElement | undefined;
  private _canvas: HTMLCanvasElement | undefined;
  private _dpiScale: number;
  private _fontSubstitutions: Record<string, string>;
  private _onProgress: ((event: SlideKitProgressEvent) => void) | undefined;

  private _pkg: OpcPackage | undefined;
  private _presentation: PresentationIR | undefined;
  private _slideCache: Map<number, SlideIR> = new Map();
  private _mediaCache: MediaCache = new MediaCache();
  private _currentSlide = 0;
  private _disposed = false;

  constructor(options: SlideKitOptions) {
    this._container = options.container;
    this._canvas = options.canvas;
    this._fontSubstitutions = options.fontSubstitutions ?? {};
    this._onProgress = options.onProgress;

    // Determine DPI scale factor.
    if (options.dpiScale !== undefined) {
      this._dpiScale = options.dpiScale;
    } else if (typeof window !== 'undefined') {
      this._dpiScale = window.devicePixelRatio || 1;
    } else {
      this._dpiScale = 1;
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Load a PPTX file from binary data.
   *
   * Opens the OPC package, parses presentation metadata (slide list,
   * dimensions, theme), and returns a summary. Individual slides are
   * parsed lazily on first render.
   *
   * @param data - The raw PPTX file as an ArrayBuffer, Uint8Array, or Blob.
   * @returns Summary of the loaded presentation.
   */
  async load(data: ArrayBuffer | Uint8Array | Blob): Promise<LoadedPresentation> {
    this._assertNotDisposed();

    // Phase 1: Open OPC package
    this._emitProgress('loading', 0, 2, 'Opening OPC package');
    this._pkg = await OpcPackageReader.open(data);
    this._emitProgress('loading', 1, 2, 'Package opened');

    // Phase 2: Parse presentation metadata
    this._emitProgress('parsing', 0, 1, 'Parsing presentation');
    this._presentation = await this._parsePresentation(this._pkg);
    this._emitProgress('parsing', 1, 1, 'Presentation parsed');

    // Reset state
    this._slideCache.clear();
    this._currentSlide = 0;

    return {
      slideCount: this._presentation.slideCount,
      slideWidth: this._presentation.slideWidth,
      slideHeight: this._presentation.slideHeight,
      theme: this._presentation.theme,
    };
  }

  /**
   * Render a specific slide by index (0-based).
   *
   * Lazily parses the slide XML on first render, then renders the
   * background and all elements to the canvas.
   *
   * @param index - Zero-based slide index.
   */
  async renderSlide(index: number): Promise<void> {
    this._assertNotDisposed();
    this._assertLoaded();

    const pres = this._presentation!;
    if (index < 0 || index >= pres.slideCount) {
      throw new RangeError(`Slide index ${index} is out of range (0-${pres.slideCount - 1}).`);
    }

    this._currentSlide = index;

    // Parse slide if not cached
    this._emitProgress('rendering', 0, 2, `Parsing slide ${index + 1}`);
    const slide = await this._getOrParseSlide(index);
    this._emitProgress('rendering', 1, 2, `Rendering slide ${index + 1}`);

    // Get or create canvas and context
    const ctx = this._getCanvasContext();
    if (!ctx) return;

    // Calculate pixel dimensions
    const slideWidthPx = emuToPx(pres.slideWidth, 96 * this._dpiScale);
    const slideHeightPx = emuToPx(pres.slideHeight, 96 * this._dpiScale);

    // Size the canvas for DPI scaling
    this._sizeCanvas(slideWidthPx, slideHeightPx);

    // Build render context
    const rctx: RenderContext = {
      ctx,
      dpiScale: this._dpiScale,
      theme: pres.theme,
      mediaCache: this._mediaCache,
      resolveFont: (name: string) => this._resolveFont(name),
    };

    // Clear and render
    ctx.clearRect(0, 0, slideWidthPx, slideHeightPx);
    renderSlide(slide, rctx, slideWidthPx, slideHeightPx);

    this._emitProgress('rendering', 2, 2, 'Render complete');
  }

  /** Get the current slide index (0-based). */
  get currentSlide(): number {
    return this._currentSlide;
  }

  /** Navigate to the next slide. No-op if already on the last slide. */
  async nextSlide(): Promise<void> {
    this._assertLoaded();
    const pres = this._presentation!;
    if (this._currentSlide < pres.slideCount - 1) {
      await this.renderSlide(this._currentSlide + 1);
    }
  }

  /** Navigate to the previous slide. No-op if already on the first slide. */
  async previousSlide(): Promise<void> {
    this._assertLoaded();
    if (this._currentSlide > 0) {
      await this.renderSlide(this._currentSlide - 1);
    }
  }

  /** Navigate to a specific slide by index (0-based). */
  async goToSlide(index: number): Promise<void> {
    await this.renderSlide(index);
  }

  /**
   * Clean up resources: clear caches, remove created canvas elements,
   * and mark this instance as disposed. After calling dispose(), all
   * other methods will throw.
   */
  dispose(): void {
    if (this._disposed) return;

    this._disposed = true;
    this._slideCache.clear();
    this._mediaCache.clear();
    this._pkg = undefined;
    this._presentation = undefined;

    // If we created the canvas ourselves (via container), remove it.
    if (this._container && this._canvas) {
      if (this._canvas.parentElement === this._container) {
        this._container.removeChild(this._canvas);
      }
    }

    this._canvas = undefined;
  }

  // -------------------------------------------------------------------------
  // Internal methods
  // -------------------------------------------------------------------------

  /**
   * Parse top-level presentation metadata from the OPC package.
   *
   * This is a placeholder implementation that extracts slide dimensions
   * and theme from the presentation.xml part. The full parser is being
   * built concurrently by another agent and will replace this.
   */
  private async _parsePresentation(pkg: OpcPackage): Promise<PresentationIR> {
    const { REL_OFFICE_DOCUMENT, REL_SLIDE, REL_THEME } = await import('@opendockit/core/opc');

    // Find the main presentation part
    const rootRels = await pkg.getRootRelationships();
    const presRel = rootRels.getByType(REL_OFFICE_DOCUMENT)[0];
    if (!presRel) {
      throw new Error('Cannot find presentation part in OPC package.');
    }

    const presXml = await pkg.getPartXml(presRel.target);
    const presRels = await pkg.getPartRelationships(presRel.target);

    // Parse slide dimensions from p:sldSz
    const sldSz = presXml.child('p:sldSz');
    const slideWidth = sldSz ? parseInt(sldSz.attr('cx') ?? '12192000', 10) : 12192000;
    const slideHeight = sldSz ? parseInt(sldSz.attr('cy') ?? '6858000', 10) : 6858000;

    // Collect slide references
    const slideRels = presRels.getByType(REL_SLIDE);
    const slides = await Promise.all(
      slideRels.map(async (rel, idx) => {
        const slideRels2 = await pkg.getPartRelationships(rel.target);

        // Find layout and master
        const layoutRel = slideRels2.getByType(
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout'
        )[0];
        const layoutTarget = layoutRel?.target ?? '';

        let masterTarget = '';
        if (layoutTarget) {
          const layoutRels = await pkg.getPartRelationships(layoutTarget);
          const masterRel = layoutRels.getByType(
            'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster'
          )[0];
          masterTarget = masterRel?.target ?? '';
        }

        return {
          index: idx,
          partUri: rel.target,
          layoutPartUri: layoutTarget,
          masterPartUri: masterTarget,
          relationshipId: rel.id,
        };
      })
    );

    // Sort slides by relationship ID order (rId1, rId2, ...)
    slides.sort((a, b) => {
      const numA = parseInt(a.relationshipId.replace(/\D/g, ''), 10);
      const numB = parseInt(b.relationshipId.replace(/\D/g, ''), 10);
      return numA - numB;
    });

    // Reindex after sorting
    for (let i = 0; i < slides.length; i++) {
      slides[i].index = i;
    }

    // Parse theme
    const themeRel = presRels.getByType(REL_THEME)[0];
    let theme: ThemeIR;
    if (themeRel) {
      try {
        const { parseTheme } = await import('@opendockit/core/theme');
        const themeXml = await pkg.getPartXml(themeRel.target);
        theme = parseTheme(themeXml);
      } catch {
        theme = this._defaultTheme();
      }
    } else {
      theme = this._defaultTheme();
    }

    return {
      slideWidth,
      slideHeight,
      slideCount: slides.length,
      slides,
      theme,
    };
  }

  /**
   * Get a cached slide or parse it from the OPC package.
   */
  private async _getOrParseSlide(index: number): Promise<SlideIR> {
    const cached = this._slideCache.get(index);
    if (cached) return cached;

    const pres = this._presentation!;
    const ref = pres.slides[index];
    if (!ref) {
      throw new RangeError(`No slide reference for index ${index}.`);
    }

    // Parse the slide XML into SlideIR.
    // This is a basic implementation that extracts the shape tree.
    // The full parser agent will provide a more complete implementation.
    const slide = await this._parseSlideXml(ref.partUri, ref.layoutPartUri, ref.masterPartUri);
    this._slideCache.set(index, slide);
    return slide;
  }

  /**
   * Parse a single slide's XML into a SlideIR.
   *
   * This is a basic implementation that extracts elements from the
   * shape tree. The full parser agent will supply the complete version
   * with placeholder inheritance and background resolution.
   */
  private async _parseSlideXml(
    partUri: string,
    layoutPartUri: string,
    masterPartUri: string
  ): Promise<SlideIR> {
    const pkg = this._pkg!;
    // Load the slide XML. The full parser agent will supply proper
    // shape tree parsing; for now we just ensure the part exists.
    await pkg.getPartXml(partUri);

    // Return a minimal SlideIR. The parser agent will fill this in
    // with proper shape tree parsing and background resolution.
    return {
      partUri,
      elements: [],
      layoutPartUri,
      masterPartUri,
    };
  }

  /**
   * Get the Canvas2D rendering context, creating the canvas if needed.
   */
  private _getCanvasContext(): CanvasRenderingContext2D | null {
    if (!this._canvas && this._container) {
      if (typeof document === 'undefined') return null;
      this._canvas = document.createElement('canvas');
      this._canvas.style.display = 'block';
      this._canvas.style.maxWidth = '100%';
      this._canvas.style.height = 'auto';
      this._container.appendChild(this._canvas);
    }

    if (!this._canvas) return null;
    return this._canvas.getContext('2d');
  }

  /**
   * Set the canvas dimensions for DPI-correct rendering.
   *
   * The canvas physical size (width/height attributes) is set to
   * the scaled pixel dimensions. The CSS display size is set to the
   * logical (unscaled) dimensions so the browser displays it at the
   * correct visual size.
   */
  private _sizeCanvas(scaledWidth: number, scaledHeight: number): void {
    if (!this._canvas) return;

    this._canvas.width = scaledWidth;
    this._canvas.height = scaledHeight;

    // CSS display size = logical pixels (unscaled)
    const logicalWidth = scaledWidth / this._dpiScale;
    const logicalHeight = scaledHeight / this._dpiScale;
    this._canvas.style.width = `${logicalWidth}px`;
    this._canvas.style.height = `${logicalHeight}px`;
  }

  /**
   * Resolve a font name using substitution overrides, or return as-is.
   */
  private _resolveFont(fontName: string): string {
    return this._fontSubstitutions[fontName] ?? fontName;
  }

  /** Emit a progress event if a callback is registered. */
  private _emitProgress(
    phase: SlideKitProgressEvent['phase'],
    current: number,
    total: number,
    message?: string
  ): void {
    this._onProgress?.({ phase, current, total, message });
  }

  /** Throw if the instance has been disposed. */
  private _assertNotDisposed(): void {
    if (this._disposed) {
      throw new Error('SlideKit has been disposed. Create a new instance.');
    }
  }

  /** Throw if no presentation has been loaded. */
  private _assertLoaded(): void {
    if (!this._presentation) {
      throw new Error('No presentation loaded. Call load() first.');
    }
  }

  /** Create a minimal default theme when no theme part is found. */
  private _defaultTheme(): ThemeIR {
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const white = { r: 255, g: 255, b: 255, a: 1 };

    return {
      name: 'Default',
      colorScheme: {
        dk1: black,
        lt1: white,
        dk2: { r: 68, g: 84, b: 106, a: 1 },
        lt2: { r: 231, g: 230, b: 230, a: 1 },
        accent1: { r: 79, g: 129, b: 189, a: 1 },
        accent2: { r: 192, g: 80, b: 77, a: 1 },
        accent3: { r: 155, g: 187, b: 89, a: 1 },
        accent4: { r: 128, g: 100, b: 162, a: 1 },
        accent5: { r: 75, g: 172, b: 198, a: 1 },
        accent6: { r: 247, g: 150, b: 70, a: 1 },
        hlink: { r: 5, g: 99, b: 193, a: 1 },
        folHlink: { r: 149, g: 79, b: 114, a: 1 },
      },
      fontScheme: {
        majorLatin: 'Calibri Light',
        minorLatin: 'Calibri',
      },
      formatScheme: {
        fillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
        lineStyles: [{}, {}, {}],
        effectStyles: [[], [], []],
        bgFillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
      },
    };
  }
}
