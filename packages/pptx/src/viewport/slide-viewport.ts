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

import type { ThemeIR, SlideElementIR, HyperlinkIR, DrawingMLShapeIR } from '@opendockit/core';
import type { OpcPackage } from '@opendockit/core/opc';
import type { RelationshipMap } from '@opendockit/core/opc';
import { OpcPackageReader } from '@opendockit/core/opc';
import { MediaCache, loadAndCacheImage } from '@opendockit/core/media';
import type { RenderContext, DynamicRenderer } from '@opendockit/core/drawingml/renderer';
import { CapabilityRegistry } from '@opendockit/core/capability';
import type { CoverageReport } from '@opendockit/core/capability';
import { WasmModuleLoader } from '@opendockit/core/wasm';
import { emuToPx } from '@opendockit/core';
import {
  resolveFontName,
  FontMetricsDB,
  loadFont,
  extractFontFromEot,
  isGoogleFont,
  loadGoogleFonts,
  loadOflSubstitutes,
  hasOflSubstitute,
  hasBundledFont,
  loadBundledFonts,
} from '@opendockit/core/font';
import type { FontFaceMetrics, FontMetricsBundle } from '@opendockit/core/font';
import { metricsBundle } from '@opendockit/core/font/data/metrics-bundle';
import type {
  PresentationIR,
  SlideIR,
  SlideLayoutIR,
  SlideMasterIR,
  EnrichedSlideData,
  ColorMapOverride,
} from '../model/index.js';
import { parsePresentation } from '../parser/presentation.js';
import { parseSlide, parseNotesText } from '../parser/slide.js';
import { parseSlideLayout } from '../parser/slide-layout.js';
import { parseSlideMaster } from '../parser/slide-master.js';
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
  /**
   * User-supplied font data. Keys are CSS font-family names.
   * Values can be a single ArrayBuffer (registered as regular weight)
   * or an object with variants.
   */
  fonts?: Record<
    string,
    | ArrayBuffer
    | {
        regular?: ArrayBuffer;
        bold?: ArrayBuffer;
        italic?: ArrayBuffer;
        boldItalic?: ArrayBuffer;
      }
  >;
  /** Progress callback for loading and rendering phases. */
  onProgress?: (event: SlideKitProgressEvent) => void;
  /**
   * Called when slides should be re-rendered because a new capability
   * became available (e.g., a WASM module finished loading).
   *
   * The caller should call `renderSlide()` again for each index to get
   * upgraded rendering with the new capability.
   */
  onSlideInvalidated?: (slideIndices: number[]) => void;
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

/** A clickable hyperlink region on a rendered slide. */
export interface HyperlinkHitRegion {
  /** Bounding box in EMU coordinates (slide coordinate space). */
  bounds: { x: number; y: number; width: number; height: number };
  /** Resolved hyperlink target. */
  hyperlink: HyperlinkIR;
  /** Source type: 'shape' (whole shape is clickable) or 'run' (text run only). */
  source: 'shape' | 'run';
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
  private _userFonts: SlideKitOptions['fonts'];
  private _fontMetricsDB: FontMetricsDB;
  /** Set of font families successfully loaded at runtime. */
  private _loadedFonts = new Set<string>();
  private _onProgress: ((event: SlideKitProgressEvent) => void) | undefined;
  private _onSlideInvalidated: ((slideIndices: number[]) => void) | undefined;

  private _pkg: OpcPackage | undefined;
  private _presentation: PresentationIR | undefined;
  private _slideCache: Map<number, EnrichedSlideData> = new Map();
  private _layoutCache: Map<string, SlideLayoutIR> = new Map();
  private _masterCache: Map<string, SlideMasterIR> = new Map();
  private _mediaCache: MediaCache = new MediaCache();
  private _currentSlide = 0;
  private _disposed = false;

  /** Capability registry for progressive fidelity routing. */
  private _registry = new CapabilityRegistry();
  /** WASM module loader for deferred capabilities. */
  private _wasmLoader = new WasmModuleLoader();
  /** Dynamic renderers loaded at runtime (e.g., from WASM modules). */
  private _dynamicRenderers = new Map<string, DynamicRenderer>();
  /** Tracks which slides need re-rendering when a module loads. moduleId → slide indices. */
  private _deferredSlides = new Map<string, Set<number>>();
  /** Set of WASM module IDs currently being loaded (prevents duplicate fetches). */
  private _loadingModules = new Set<string>();
  /** Maps WASM module IDs to the element kinds they provide renderers for. */
  private _moduleKindMap = new Map<string, string[]>();

  constructor(options: SlideKitOptions) {
    this._container = options.container;
    this._canvas = options.canvas;
    this._fontSubstitutions = options.fontSubstitutions ?? {};
    this._userFonts = options.fonts;
    this._onProgress = options.onProgress;
    this._onSlideInvalidated = options.onSlideInvalidated;

    // Initialize font metrics database with built-in metrics bundle.
    this._fontMetricsDB = new FontMetricsDB();
    this._fontMetricsDB.loadBundle(metricsBundle);

    // Determine DPI scale factor.
    if (options.dpiScale !== undefined) {
      this._dpiScale = options.dpiScale;
    } else if (typeof window !== 'undefined') {
      this._dpiScale = window.devicePixelRatio || 1;
    } else {
      this._dpiScale = 1;
    }

    // Register built-in TypeScript renderers as immediate capabilities.
    this._registerBuiltinRenderers();
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
    this._layoutCache.clear();
    this._masterCache.clear();
    this._currentSlide = 0;

    // Phase 3: Load fonts (user-supplied → embedded → OFL substitutes → Google Fonts)
    await this._loadFonts(this._pkg, this._presentation);

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
    const enriched = await this._getOrParseSlide(index);
    this._emitProgress('rendering', 1, 2, `Rendering slide ${index + 1}`);

    // Get or create canvas and context
    const ctx = this._getCanvasContext();
    if (!ctx) return;

    // Calculate pixel dimensions
    const slideWidthPx = emuToPx(pres.slideWidth, 96 * this._dpiScale);
    const slideHeightPx = emuToPx(pres.slideHeight, 96 * this._dpiScale);

    // Size the canvas for DPI scaling
    this._sizeCanvas(slideWidthPx, slideHeightPx);

    // Build merged color map: master → layout → slide (later overrides earlier).
    const colorMap: ColorMapOverride = {
      ...enriched.master.colorMap,
      ...(enriched.layout.colorMap ?? {}),
      ...(enriched.slide.colorMap ?? {}),
    };

    // Build the set of element kinds currently loading via WASM modules.
    const loadingKinds = this._getLoadingKinds();

    // Build render context — include dynamic renderers for progressive fidelity.
    const rctx: RenderContext = {
      ctx,
      dpiScale: this._dpiScale,
      theme: pres.theme,
      mediaCache: this._mediaCache,
      resolveFont: (name: string) => this._resolveFont(name),
      dynamicRenderers: this._dynamicRenderers.size > 0 ? this._dynamicRenderers : undefined,
      colorMap,
      fontMetricsDB: this._fontMetricsDB,
      loadingModuleKinds: loadingKinds.size > 0 ? loadingKinds : undefined,
    };

    // Clear and render
    ctx.clearRect(0, 0, slideWidthPx, slideHeightPx);
    renderSlide(enriched, rctx, slideWidthPx, slideHeightPx);

    // Check for deferred elements from all layers and kick off WASM loading.
    const allElements = [
      ...enriched.master.elements,
      ...enriched.layout.elements,
      ...enriched.slide.elements,
    ];
    this._handleDeferredElements(allElements, index);

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
   * Get the speaker notes text for a specific slide.
   *
   * Lazily parses the slide (and its notes) if not already cached.
   * Returns `undefined` if the slide has no speaker notes.
   *
   * @param slideIndex - Zero-based slide index.
   * @returns Plain text of the speaker notes, or `undefined` if none.
   */
  async getSlideNotes(slideIndex: number): Promise<string | undefined> {
    this._assertNotDisposed();
    this._assertLoaded();

    const pres = this._presentation!;
    if (slideIndex < 0 || slideIndex >= pres.slideCount) {
      throw new RangeError(`Slide index ${slideIndex} is out of range (0-${pres.slideCount - 1}).`);
    }

    const enriched = await this._getOrParseSlide(slideIndex);
    return enriched.slide.notes;
  }

  /**
   * Signal that specific slides should be re-rendered.
   *
   * Clears cached slide data for the given indices so that the next
   * `renderSlide()` call re-parses and re-renders with any newly
   * available capabilities.
   *
   * @param indices - Slide indices to invalidate. If empty, all slides
   *   are invalidated.
   */
  invalidateSlides(indices?: number[]): void {
    if (!indices || indices.length === 0) {
      this._slideCache.clear();
    } else {
      for (const i of indices) {
        this._slideCache.delete(i);
      }
    }
  }

  /**
   * Register a dynamic renderer for a specific element kind.
   *
   * After registering, call `invalidateSlides()` for affected slides
   * to trigger re-rendering with the new capability.
   */
  registerDynamicRenderer(elementKind: string, renderer: DynamicRenderer): void {
    this._dynamicRenderers.set(elementKind, renderer);
  }

  /**
   * Load additional font metrics for custom fonts.
   *
   * Use this to add metrics for fonts not included in the built-in bundle.
   * Metrics from loaded fonts will be used for text measurement during
   * rendering, providing accurate line-breaking even when the font is
   * not installed on the system.
   */
  loadFontMetrics(metrics: FontFaceMetrics): void {
    this._fontMetricsDB.loadFontMetrics(metrics);
  }

  /**
   * Load an entire font metrics bundle.
   */
  loadFontMetricsBundle(bundle: FontMetricsBundle): void {
    this._fontMetricsDB.loadBundle(bundle);
  }

  /**
   * Get all hyperlinks on a given slide.
   *
   * Returns an array of hyperlink hit regions with resolved targets.
   * Hyperlinks from `a:hlinkClick` on text runs and shape non-visual
   * properties are both included.
   *
   * Relationship IDs are resolved against the slide's `.rels` file.
   * External links become URLs; internal slide links are resolved to
   * 0-based slide indices.
   *
   * @param slideIndex - Zero-based slide index.
   * @returns Array of hyperlink hit regions, or empty array if none.
   */
  async getHyperlinks(slideIndex: number): Promise<HyperlinkHitRegion[]> {
    this._assertNotDisposed();
    this._assertLoaded();

    const pres = this._presentation!;
    if (slideIndex < 0 || slideIndex >= pres.slideCount) {
      throw new RangeError(`Slide index ${slideIndex} is out of range (0-${pres.slideCount - 1}).`);
    }

    const enriched = await this._getOrParseSlide(slideIndex);
    const ref = pres.slides[slideIndex];
    const pkg = this._pkg!;
    const rels = await pkg.getPartRelationships(ref.partUri);

    const regions: HyperlinkHitRegion[] = [];
    this._collectHyperlinks(enriched.slide.elements, rels, pres, regions);

    return regions;
  }

  /**
   * Get a per-element coverage report for a given slide.
   *
   * Returns the rendering status (immediate / deferred / unsupported)
   * for each element on the slide, plus summary counts. Useful for
   * dashboards and debugging progressive fidelity.
   *
   * @param slideIndex - Zero-based slide index.
   * @returns Coverage report with per-element status and summary.
   */
  async getCoverageReport(slideIndex: number): Promise<CoverageReport> {
    this._assertNotDisposed();
    this._assertLoaded();

    const pres = this._presentation!;
    if (slideIndex < 0 || slideIndex >= pres.slideCount) {
      throw new RangeError(`Slide index ${slideIndex} is out of range (0-${pres.slideCount - 1}).`);
    }

    const enriched = await this._getOrParseSlide(slideIndex);
    return this._registry.generateCoverageReport(enriched.slide.elements);
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
    this._layoutCache.clear();
    this._masterCache.clear();
    this._mediaCache.clear();
    this._deferredSlides.clear();
    this._dynamicRenderers.clear();
    this._loadingModules.clear();
    this._moduleKindMap.clear();
    this._loadedFonts.clear();
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
   * Delegates to the full `parsePresentation` parser which handles
   * OPC navigation, slide ordering via `p:sldIdLst`, layout/master
   * chain resolution, and theme parsing.
   */
  private async _parsePresentation(pkg: OpcPackage): Promise<PresentationIR> {
    return parsePresentation(pkg);
  }

  /**
   * Get a cached enriched slide or parse it from the OPC package.
   *
   * Parses the slide, layout, and master XML (with caching for shared
   * layouts/masters) and pre-loads media from all three layers.
   */
  private async _getOrParseSlide(index: number): Promise<EnrichedSlideData> {
    const cached = this._slideCache.get(index);
    if (cached) return cached;

    const pres = this._presentation!;
    const ref = pres.slides[index];
    if (!ref) {
      throw new RangeError(`No slide reference for index ${index}.`);
    }

    const slide = await this._parseSlideXml(ref.partUri, ref.layoutPartUri, ref.masterPartUri);
    const master = await this._getOrParseMaster(ref.masterPartUri);
    const layout = await this._getOrParseLayout(ref.layoutPartUri, ref.masterPartUri);

    // Pre-load images referenced by picture elements on all three layers.
    await Promise.all([
      this._loadSlideMedia(slide.elements, ref.partUri),
      this._loadSlideMedia(layout.elements, ref.layoutPartUri),
      this._loadSlideMedia(master.elements, ref.masterPartUri),
    ]);

    // Also load background images from master/layout/slide
    await this._loadBackgroundMedia(slide.background, ref.partUri);
    await this._loadBackgroundMedia(layout.background, ref.layoutPartUri);
    await this._loadBackgroundMedia(master.background, ref.masterPartUri);

    const enriched: EnrichedSlideData = { slide, layout, master };
    this._slideCache.set(index, enriched);
    return enriched;
  }

  /**
   * Get a cached slide master or parse it from the OPC package.
   */
  private async _getOrParseMaster(partUri: string): Promise<SlideMasterIR> {
    const cached = this._masterCache.get(partUri);
    if (cached) return cached;

    const pkg = this._pkg!;
    const masterXml = await pkg.getPartXml(partUri);
    const theme = this._presentation!.theme;
    const master = parseSlideMaster(masterXml, partUri, theme);

    this._masterCache.set(partUri, master);
    return master;
  }

  /**
   * Get a cached slide layout or parse it from the OPC package.
   */
  private async _getOrParseLayout(partUri: string, masterPartUri: string): Promise<SlideLayoutIR> {
    const cached = this._layoutCache.get(partUri);
    if (cached) return cached;

    const pkg = this._pkg!;
    const layoutXml = await pkg.getPartXml(partUri);
    const theme = this._presentation!.theme;
    const layout = parseSlideLayout(layoutXml, partUri, masterPartUri, theme);

    this._layoutCache.set(partUri, layout);
    return layout;
  }

  /**
   * Pre-load background picture images if the background uses a blipFill.
   *
   * Resolves the raw relationship ID to an absolute OPC part URI so that
   * cache keys are unique across different source parts (master vs layout
   * vs slide may each have an rId2 that refers to a different image).
   */
  private async _loadBackgroundMedia(
    background: import('../model/index.js').BackgroundIR | undefined,
    partUri: string
  ): Promise<void> {
    if (!background?.fill || background.fill.type !== 'picture') return;
    const uri = background.fill.imagePartUri;
    if (!uri) return;

    const pkg = this._pkg!;

    // If already resolved to absolute OPC path (from cached layout/master),
    // just ensure it's still in the media cache.
    if (uri.startsWith('/')) {
      if (!this._mediaCache.get(uri)) {
        try {
          const imageBytes = await pkg.getPart(uri);
          await loadAndCacheImage(uri, imageBytes, this._mediaCache);
        } catch {
          // Silently skip — renderer will show white fallback.
        }
      }
      return;
    }

    // Normal path: resolve raw rId to absolute OPC URI.
    const rels = await pkg.getPartRelationships(partUri);
    const rel = rels.getById(uri);
    if (!rel || rel.targetMode === 'External') return;

    const resolvedUri = rel.target; // e.g. "/ppt/media/image15.png"
    // Update fill's imagePartUri to resolved URI so the renderer looks up the
    // correct cache entry.
    (background.fill as { imagePartUri: string }).imagePartUri = resolvedUri;

    if (this._mediaCache.get(resolvedUri)) return;

    try {
      const imageBytes = await pkg.getPart(resolvedUri);
      await loadAndCacheImage(resolvedUri, imageBytes, this._mediaCache);
    } catch {
      // Silently skip — renderer will show white fallback.
    }
  }

  /**
   * Parse a single slide's XML into a SlideIR.
   *
   * Loads the slide XML from the OPC package and delegates to the
   * full `parseSlide` parser for shape tree, background, and color
   * map override extraction. Also resolves speaker notes from the
   * slide's notesSlide relationship.
   */
  private async _parseSlideXml(
    partUri: string,
    layoutPartUri: string,
    masterPartUri: string
  ): Promise<SlideIR> {
    const pkg = this._pkg!;
    const slideXml = await pkg.getPartXml(partUri);
    const theme = this._presentation!.theme;
    const slide = parseSlide(slideXml, partUri, layoutPartUri, masterPartUri, theme);

    // Parse speaker notes (if present) from the notesSlide relationship.
    const notes = await parseNotesText(pkg, partUri);
    if (notes !== undefined) {
      slide.notes = notes;
    }

    return slide;
  }

  /**
   * Register the built-in TypeScript renderers with the capability registry.
   *
   * These are all 'immediate' — available without any async loading.
   * Deferred (WASM) renderers can be registered later and will take
   * precedence if they have higher priority.
   */
  private _registerBuiltinRenderers(): void {
    const builtins: Array<{ id: string; kinds: string[] }> = [
      { id: 'ts-shape', kinds: ['shape'] },
      { id: 'ts-picture', kinds: ['picture'] },
      { id: 'ts-group', kinds: ['group'] },
      { id: 'ts-connector', kinds: ['connector'] },
      { id: 'ts-table', kinds: ['table'] },
    ];

    for (const { id, kinds } of builtins) {
      this._registry.register({
        id,
        kind: 'immediate',
        canRender: (el) => kinds.includes(el.kind),
        priority: 0,
      });
    }

    // Register known deferred (WASM) capabilities at lower priority.
    // These will show grey boxes until their modules load.
    const deferred: Array<{
      id: string;
      moduleId: string;
      kinds: string[];
      estimatedBytes: number;
    }> = [
      { id: 'wasm-chart', moduleId: 'chart-render', kinds: ['chart'], estimatedBytes: 500_000 },
    ];

    for (const def of deferred) {
      this._registry.register({
        id: def.id,
        kind: 'deferred',
        canRender: (el) => def.kinds.includes(el.kind),
        priority: 0,
        moduleId: def.moduleId,
        estimatedBytes: def.estimatedBytes,
      });
      this._moduleKindMap.set(def.moduleId, def.kinds);
    }
  }

  /**
   * After rendering a slide, check for deferred elements and kick off
   * WASM module loading if needed.
   *
   * When a module loads, it fires `onSlideInvalidated` so the caller
   * can re-render affected slides with the new capability.
   */
  private _handleDeferredElements(elements: SlideElementIR[], slideIndex: number): void {
    const plan = this._registry.planRender(elements);

    if (plan.deferred.length === 0) return;

    // Group deferred elements by module ID and track which slides need them.
    for (const entry of plan.deferred) {
      let slides = this._deferredSlides.get(entry.moduleId);
      if (!slides) {
        slides = new Set();
        this._deferredSlides.set(entry.moduleId, slides);
      }
      slides.add(slideIndex);

      // Kick off loading if not already in progress.
      this._loadDeferredModule(entry.moduleId);
    }
  }

  /**
   * Start loading a WASM module if not already loading.
   *
   * When the module loads successfully, it registers a dynamic renderer
   * for all element kinds the module handles (looked up from
   * `_moduleKindMap`) and fires `onSlideInvalidated` for affected slides.
   */
  private _loadDeferredModule(moduleId: string): void {
    if (this._loadingModules.has(moduleId)) return;
    if (this._disposed) return;

    this._loadingModules.add(moduleId);

    this._wasmLoader
      .load(moduleId, (progress) => {
        this._emitProgress(
          'loading',
          progress.bytesLoaded,
          progress.bytesTotal,
          `Loading ${moduleId}: ${progress.percent}%`
        );
      })
      .then((wasmModule) => {
        if (this._disposed) return;

        // The WASM module's exports provide a render function.
        // Register it as a dynamic renderer for all element kinds this module covers.
        const renderFn = wasmModule.exports['render'];
        const targetKinds = this._moduleKindMap.get(moduleId) ?? [];
        if (typeof renderFn === 'function' && targetKinds.length > 0) {
          for (const kind of targetKinds) {
            this._dynamicRenderers.set(kind, renderFn as DynamicRenderer);
          }
        }

        // Upgrade the registry entry from deferred to immediate.
        this._registry.register({
          id: `wasm-${moduleId}`,
          kind: 'immediate',
          canRender: (el) => targetKinds.includes(el.kind),
          priority: 10, // Higher than the deferred registration.
        });

        // Notify caller which slides need re-rendering.
        const affectedSlides = this._deferredSlides.get(moduleId);
        if (affectedSlides && affectedSlides.size > 0) {
          const indices = [...affectedSlides];
          // Clear slide cache so re-render picks up new media/state.
          this.invalidateSlides(indices);
          this._onSlideInvalidated?.(indices);
          this._deferredSlides.delete(moduleId);
        }
      })
      .catch(() => {
        // WASM load failed — slides keep their grey-box placeholders.
        // Not fatal: the presentation is still usable.
      })
      .finally(() => {
        this._loadingModules.delete(moduleId);
      });
  }

  /**
   * Build the set of element kinds whose WASM modules are currently loading.
   *
   * Used to pass to the render context so grey-box placeholders can show
   * a "loading..." indicator instead of a static label.
   */
  private _getLoadingKinds(): Set<string> {
    const kinds = new Set<string>();
    for (const moduleId of this._loadingModules) {
      const moduleKinds = this._moduleKindMap.get(moduleId);
      if (moduleKinds) {
        for (const k of moduleKinds) kinds.add(k);
      }
    }
    return kinds;
  }

  /**
   * Pre-load all images referenced by picture elements on a slide.
   *
   * Walks the element tree (including groups), resolves each picture's
   * relationship ID to an absolute OPC part URI, extracts the image bytes,
   * decodes them, and populates the media cache so the renderer can draw them.
   *
   * Each element's `imagePartUri` is mutated from the raw rId to the resolved
   * absolute URI. This is critical because rIds are scoped to their source
   * part — the same rId (e.g. "rId2") in a master and a layout may reference
   * different images. Using the absolute OPC URI as the cache key prevents
   * collisions.
   */
  private async _loadSlideMedia(elements: SlideElementIR[], slidePartUri: string): Promise<void> {
    const pkg = this._pkg!;

    // Collect references to all picture elements so we can mutate their
    // imagePartUri from the raw rId to the resolved absolute OPC URI.
    const pictureEls: Array<{ kind: 'picture'; imagePartUri: string }> = [];
    const walk = (els: SlideElementIR[]) => {
      for (const el of els) {
        if (el.kind === 'picture' && el.imagePartUri) {
          pictureEls.push(el);
        } else if (el.kind === 'group') {
          walk(el.children);
        }
      }
    };
    walk(elements);

    if (pictureEls.length === 0) return;

    // Get the source part's relationship map (resolves rId → OPC part URI).
    const rels = await pkg.getPartRelationships(slidePartUri);

    // Load all images in parallel.
    await Promise.all(
      pictureEls.map(async (el) => {
        const uri = el.imagePartUri;

        // If the URI is already an absolute OPC path (starts with "/"), it was
        // resolved in a previous call on cached layout/master elements. Just
        // ensure it's still in the media cache (it may have been LRU-evicted).
        if (uri.startsWith('/')) {
          if (!this._mediaCache.get(uri)) {
            try {
              const imageBytes = await pkg.getPart(uri);
              await loadAndCacheImage(uri, imageBytes, this._mediaCache);
            } catch {
              // Silently skip — renderer will draw a placeholder.
            }
          }
          return;
        }

        // Normal path: resolve raw rId to absolute OPC URI.
        const rel = rels.getById(uri);
        if (!rel || rel.targetMode === 'External') return;

        const resolvedUri = rel.target; // e.g. "/ppt/media/image15.png"
        // Update the element's imagePartUri to the resolved URI so the
        // renderer looks up the correct cache entry.
        el.imagePartUri = resolvedUri;

        // Skip if already cached (e.g. same image used by multiple elements).
        if (this._mediaCache.get(resolvedUri)) return;

        try {
          const imageBytes = await pkg.getPart(resolvedUri);
          await loadAndCacheImage(resolvedUri, imageBytes, this._mediaCache);
        } catch {
          // Silently skip images that fail to load — the renderer will
          // draw a placeholder instead.
        }
      })
    );
  }

  /**
   * Recursively collect hyperlinks from slide elements.
   *
   * Walks shapes and groups, collecting both shape-level hyperlinks
   * (from p:cNvPr/a:hlinkClick) and text-run hyperlinks (from
   * a:rPr/a:hlinkClick). Resolves relationship IDs to URLs and
   * slide indices.
   */
  private _collectHyperlinks(
    elements: SlideElementIR[],
    rels: RelationshipMap,
    pres: PresentationIR,
    regions: HyperlinkHitRegion[]
  ): void {
    for (const el of elements) {
      if (el.kind === 'shape') {
        this._collectShapeHyperlinks(el, rels, pres, regions);
      } else if (el.kind === 'group') {
        this._collectHyperlinks(el.children, rels, pres, regions);
      }
    }
  }

  /**
   * Collect hyperlinks from a single shape element.
   */
  private _collectShapeHyperlinks(
    shape: DrawingMLShapeIR,
    rels: RelationshipMap,
    pres: PresentationIR,
    regions: HyperlinkHitRegion[]
  ): void {
    const transform = shape.properties.transform;

    // Shape-level hyperlink (clickable entire shape)
    if (shape.hyperlink && transform) {
      const resolved = this._resolveHyperlink(shape.hyperlink, rels, pres);
      if (resolved) {
        regions.push({
          bounds: {
            x: transform.position.x,
            y: transform.position.y,
            width: transform.size.width,
            height: transform.size.height,
          },
          hyperlink: resolved,
          source: 'shape',
        });
      }
    }

    // Text run hyperlinks
    if (shape.textBody && transform) {
      for (const para of shape.textBody.paragraphs) {
        for (const run of para.runs) {
          if (run.kind === 'run' && run.hyperlink) {
            const resolved = this._resolveHyperlink(run.hyperlink, rels, pres);
            if (resolved) {
              // Use the shape bounds as the hit region for text runs.
              // Precise per-glyph hit testing would require layout info
              // that is not available outside the renderer.
              regions.push({
                bounds: {
                  x: transform.position.x,
                  y: transform.position.y,
                  width: transform.size.width,
                  height: transform.size.height,
                },
                hyperlink: resolved,
                source: 'run',
              });
            }
          }
        }
      }
    }
  }

  /**
   * Resolve a raw hyperlink IR by looking up its relationship ID.
   *
   * For external links, the relationship target is the URL.
   * For internal slide links, the target is resolved to a 0-based
   * slide index by matching the OPC part URI.
   *
   * Returns a new HyperlinkIR with resolved fields, or undefined
   * if the hyperlink cannot be resolved.
   */
  private _resolveHyperlink(
    hyperlink: HyperlinkIR,
    rels: RelationshipMap,
    pres: PresentationIR
  ): HyperlinkIR | undefined {
    const resolved: HyperlinkIR = {};

    // Preserve tooltip and action
    if (hyperlink.tooltip) resolved.tooltip = hyperlink.tooltip;
    if (hyperlink.action) resolved.action = hyperlink.action;

    // Resolve relationship ID to URL or slide reference
    if (hyperlink.relationshipId) {
      const rel = rels.getById(hyperlink.relationshipId);
      if (rel) {
        if (rel.targetMode === 'External') {
          resolved.url = rel.target;
        } else {
          // Internal reference — check if it's a slide
          const slideIndex = pres.slides.findIndex((s) => s.partUri === rel.target);
          if (slideIndex >= 0) {
            resolved.slideIndex = slideIndex;
          }
        }
      }
    }

    // Handle slide jump actions without r:id (e.g., first/last/next/prev)
    if (hyperlink.action && !resolved.url && resolved.slideIndex === undefined) {
      const action = hyperlink.action;
      if (action === 'ppaction://hlinkshowjump?jump=firstslide') {
        resolved.slideIndex = 0;
      } else if (action === 'ppaction://hlinkshowjump?jump=lastslide') {
        resolved.slideIndex = pres.slideCount - 1;
      }
      // next/prev are relative — consumers handle those based on current slide
    }

    // Only return if we resolved something meaningful
    if (!resolved.url && resolved.slideIndex === undefined && !resolved.action) {
      return undefined;
    }

    return resolved;
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
   * Load fonts using all available strategies in priority order.
   *
   * Priority: user-supplied → PPTX embedded → OFL substitutes → Google Fonts.
   * Each strategy marks loaded fonts in `_loadedFonts` so that `_resolveFont()`
   * can bypass the static substitution table.
   */
  private async _loadFonts(pkg: OpcPackage, pres: PresentationIR): Promise<void> {
    this._emitProgress('loading', 0, 5, 'Loading fonts');

    // Strategy 1: User-supplied fonts (highest priority)
    await this._loadUserSuppliedFonts();
    this._emitProgress('loading', 1, 5, 'User fonts loaded');

    // Strategy 2: PPTX embedded fonts
    await this._loadEmbeddedFonts(pkg, pres);
    this._emitProgress('loading', 2, 5, 'Embedded fonts loaded');

    // Collect font families still needed (not already loaded).
    const neededFamilies = this._collectNeededFontFamilies(pres);

    // Strategy 3: Bundled WOFF2 fonts (offline-capable, no network)
    const bundledFamilies = neededFamilies.filter(
      (f) => hasBundledFont(f) && !this._loadedFonts.has(f)
    );
    if (bundledFamilies.length > 0) {
      const bundledResults = await loadBundledFonts(bundledFamilies);
      for (const [family, ok] of bundledResults) {
        if (ok) this._loadedFonts.add(family);
      }
    }
    this._emitProgress('loading', 3, 5, 'Bundled fonts loaded');

    // Strategy 4: OFL substitutes CDN (fallback for unbundled fonts)
    const oflFamilies = neededFamilies.filter(
      (f) => hasOflSubstitute(f) && !this._loadedFonts.has(f)
    );
    if (oflFamilies.length > 0) {
      const oflResults = await loadOflSubstitutes(oflFamilies);
      for (const [family, ok] of oflResults) {
        if (ok) this._loadedFonts.add(family);
      }
    }
    this._emitProgress('loading', 4, 5, 'OFL substitutes loaded');

    // Strategy 5: Google Fonts CDN (fallback for unbundled fonts)
    const googleFamilies = neededFamilies.filter(
      (f) => isGoogleFont(f) && !this._loadedFonts.has(f)
    );
    if (googleFamilies.length > 0) {
      const gfResults = await loadGoogleFonts(googleFamilies);
      for (const [family, ok] of gfResults) {
        if (ok) this._loadedFonts.add(family);
      }
    }
    this._emitProgress('loading', 5, 5, 'All fonts loaded');
  }

  /**
   * Load user-supplied font data from SlideKitOptions.fonts.
   */
  private async _loadUserSuppliedFonts(): Promise<void> {
    if (!this._userFonts) return;

    const promises: Promise<void>[] = [];
    for (const [family, data] of Object.entries(this._userFonts)) {
      if (data instanceof ArrayBuffer) {
        promises.push(
          loadFont(family, data).then((ok) => {
            if (ok) this._loadedFonts.add(family);
          })
        );
      } else {
        // Object with variant keys
        const variants: Array<{
          buf: ArrayBuffer;
          desc: FontFaceDescriptors;
        }> = [];
        if (data.regular) variants.push({ buf: data.regular, desc: {} });
        if (data.bold) variants.push({ buf: data.bold, desc: { weight: 'bold' } });
        if (data.italic) variants.push({ buf: data.italic, desc: { style: 'italic' } });
        if (data.boldItalic)
          variants.push({ buf: data.boldItalic, desc: { weight: 'bold', style: 'italic' } });

        for (const v of variants) {
          promises.push(
            loadFont(family, v.buf, v.desc).then((ok) => {
              if (ok) this._loadedFonts.add(family);
            })
          );
        }
      }
    }
    await Promise.all(promises);
  }

  /**
   * Load fonts embedded in the PPTX package (from p:embeddedFontLst).
   *
   * Extracts the raw OpenType data from EOT containers and registers
   * each variant via the FontFace API.
   */
  private async _loadEmbeddedFonts(pkg: OpcPackage, pres: PresentationIR): Promise<void> {
    if (!pres.embeddedFonts || pres.embeddedFonts.length === 0) return;

    const promises: Promise<void>[] = [];

    for (const ref of pres.embeddedFonts) {
      // Skip if already loaded by user-supplied fonts.
      if (this._loadedFonts.has(ref.typeface)) continue;

      const variants: Array<{
        partUri: string;
        desc: FontFaceDescriptors;
      }> = [];
      if (ref.regular) variants.push({ partUri: ref.regular, desc: {} });
      if (ref.bold) variants.push({ partUri: ref.bold, desc: { weight: 'bold' } });
      if (ref.italic) variants.push({ partUri: ref.italic, desc: { style: 'italic' } });
      if (ref.boldItalic)
        variants.push({ partUri: ref.boldItalic, desc: { weight: 'bold', style: 'italic' } });

      for (const v of variants) {
        promises.push(
          (async () => {
            try {
              const rawBytes = await pkg.getPart(v.partUri);
              const fontData = extractFontFromEot(new Uint8Array(rawBytes));
              const ok = await loadFont(ref.typeface, fontData.buffer as ArrayBuffer, v.desc);
              if (ok) this._loadedFonts.add(ref.typeface);
            } catch {
              // Skip fonts that fail to extract or load.
            }
          })()
        );
      }
    }

    await Promise.all(promises);
  }

  /**
   * Collect font families referenced in the presentation that are not yet loaded.
   *
   * Checks the theme font scheme and embedded font list for family names.
   */
  private _collectNeededFontFamilies(pres: PresentationIR): string[] {
    const families = new Set<string>();

    // Theme fonts
    if (pres.theme.fontScheme) {
      families.add(pres.theme.fontScheme.majorLatin);
      families.add(pres.theme.fontScheme.minorLatin);
    }

    // Embedded font typefaces (may need OFL/Google fallback if embed failed)
    if (pres.embeddedFonts) {
      for (const ref of pres.embeddedFonts) {
        families.add(ref.typeface);
      }
    }

    // Filter out already-loaded fonts.
    return [...families].filter((f) => !this._loadedFonts.has(f));
  }

  /**
   * Resolve a font name through the priority chain:
   * 1. User-provided substitution overrides
   * 2. Runtime-loaded fonts (embedded, CDN, user-supplied) — use original name
   * 3. Static substitution table (cross-platform CSS font stacks)
   */
  private _resolveFont(fontName: string): string {
    // User substitution overrides always win.
    if (this._fontSubstitutions[fontName]) {
      return this._fontSubstitutions[fontName];
    }
    // If we loaded this font at runtime, use it directly.
    if (this._loadedFonts.has(fontName)) {
      return `'${fontName}', sans-serif`;
    }
    // Fall back to the static substitution table.
    return resolveFontName(fontName);
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
}
