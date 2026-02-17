# SlideKit: Progressive-Fidelity PPTX Renderer Architecture

## Design Philosophy

**Core principle:** The TS/JS layer owns orchestration, parsing, and simple rendering.
WASM modules are **leaf-node rendering accelerators** loaded on demand — not a monolith
we're trying to decompose.

**Why NOT start with LibreOffice WASM and "pick it apart":**

LibreOffice is a ~25M LOC C++ monolith with deeply entangled subsystems. Its PPTX import
code touches VCL (rendering), i18n, fontconfig, ICU, freetype, harfbuzz, libxml2, and
dozens of internal abstractions. Extracting individual rendering capabilities from it is
harder than building them. The build takes hours, the binary is 50MB+ compressed, and the
internal APIs are not stable. You'd spend more time fighting the monolith than building.

**What LibreOffice WASM IS useful for:** a reference oracle for visual regression testing.
Run it headless server-side (or in a CI pipeline) to generate "ground truth" slide renders
that your progressive renderer is converging toward.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SlideKit (Pure TypeScript)                     │
│                                                                   │
│  ┌──────────┐   ┌──────────────┐   ┌───────────────────────┐    │
│  │ ZIP Layer │──▶│ OOXML Parser │──▶│  Slide IR (JSON AST)  │    │
│  │ (JSZip)   │   │ (TS)         │   │                       │    │
│  └──────────┘   └──────────────┘   └───────────┬───────────┘    │
│                                                  │                │
│                          ┌───────────────────────┼────────┐      │
│                          ▼                       ▼        ▼      │
│                  ┌──────────────┐  ┌──────────┐ ┌────────────┐  │
│                  │ TS Renderers │  │  WASM    │ │ Fallback   │  │
│                  │ (Canvas2D /  │  │ Modules  │ │ (grey box  │  │
│                  │  SVG / DOM)  │  │ (on-     │ │  + badge)  │  │
│                  │              │  │  demand) │ │            │  │
│                  └──────────────┘  └──────────┘ └────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              Capability Registry & Router                  │    │
│  │  "Can I render this element?" → renderer | wasm | fallback │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: ZIP + OOXML Parser (Pure TypeScript)

### 1.1 Unzip Layer

- **JSZip** (BSD) — battle-tested, streams, works in browser + Node
- Extract `[Content_Types].xml`, `_rels/.rels`, `ppt/presentation.xml`
- Lazy extraction: only decompress slide XML + media when that slide is requested
- Emit progress events: `onProgress({ phase: 'unzip', slideIndex, total })`

### 1.2 PresentationML Parser

All pure TypeScript. The PPTX structure is:

```
ppt/
  presentation.xml          ← slide list, slide size, default text styles
  _rels/presentation.xml.rels
  slideMasters/slideMaster1.xml
  slideLayouts/slideLayout1.xml
  slides/slide1.xml         ← actual slide content
  theme/theme1.xml          ← colors, fonts, effects
  media/                    ← images, audio, video
```

Parse into a **Slide IR (intermediate representation)** — a clean JSON AST:

```typescript
interface SlideIR {
  dimensions: { width: number; height: number }; // in EMU
  background: BackgroundIR;
  elements: SlideElementIR[]; // z-ordered
  notes?: string;
  transitions?: TransitionIR;
}

type SlideElementIR =
  | ShapeIR // rectangles, ovals, preset geometries, custom paths
  | TextBoxIR // text frames with paragraph/run structure
  | ImageIR // embedded or linked images
  | TableIR // grid with merged cells
  | ChartIR // chart data + type
  | GroupIR // grouped elements (recursive)
  | SmartArtIR // decomposed to shapes if possible
  | ConnectorIR // line connectors
  | MediaIR // audio/video
  | OleObjectIR // embedded objects
  | UnsupportedIR; // ← CRITICAL: everything we can't parse yet

interface UnsupportedIR {
  kind: 'unsupported';
  elementType: string; // e.g. 'mc:AlternateContent', 'dgm:relIds'
  xmlTag: string; // original tag name
  bounds: BoundingBox; // we can always extract position/size
  rawXml?: string; // optionally preserve for debugging
  reason: string; // human-readable: "SmartArt diagrams not yet supported"
}
```

**Key design decisions:**

- The IR is **serializable** — you can cache it, send it to a worker, persist it
- Every element has a `bounds: BoundingBox` — even unsupported ones can be positioned
- **Theme resolution happens at parse time** — colors, fonts resolved to concrete values
- **Slide master/layout inheritance** resolved at parse time (not render time)

### 1.3 Theme & Style Resolution

The OOXML theme/master/layout cascade is one of the trickiest parts:

```
Theme (colors, fonts, effects)
  └─▶ SlideMaster (default shapes, text styles, background)
        └─▶ SlideLayout (placeholder positions, additional shapes)
              └─▶ Slide (actual content, overrides)
```

Resolve this in the parser so renderers see final concrete values:

- `schemeClr val="accent1"` → `#4472C4` (resolved from theme)
- `<a:latin typeface="+mj-lt"/>` → `"Calibri"` (resolved from theme fonts)
- Placeholder text styles inherited from master → layout → slide

---

## Layer 2: Capability Registry & Router

This is the architectural heart that enables progressive fidelity.

```typescript
interface RenderCapability {
  canRender(element: SlideElementIR): RenderVerdict;
}

type RenderVerdict =
  | { status: 'full'; renderer: ElementRenderer }
  | { status: 'partial'; renderer: ElementRenderer; missing: string[] }
  | { status: 'needs-wasm'; moduleId: string; estimatedSize: number }
  | { status: 'unsupported'; reason: string };

class CapabilityRegistry {
  private renderers: Map<string, RenderCapability[]> = new Map();

  // Register renderers with priority (TS first, WASM fallback)
  register(elementKind: string, capability: RenderCapability, priority: number): void;

  // Route an element to the best available renderer
  route(element: SlideElementIR): RenderPlan {
    // 1. Try TS renderers in priority order
    // 2. If needs-wasm, return deferred plan with download info
    // 3. If nothing works, return fallback (grey box)
  }
}
```

### Per-slide render planning

Before rendering a slide, walk all elements and build a **RenderPlan**:

```typescript
interface RenderPlan {
  immediate: Array<{ element: SlideElementIR; renderer: ElementRenderer }>;
  deferred: Array<{
    element: SlideElementIR;
    moduleId: string;
    estimatedBytes: number;
  }>;
  unsupported: Array<{
    element: SlideElementIR;
    reason: string;
  }>;
}
```

This enables the UX you described:

1. Render all `immediate` elements instantly
2. Show grey boxes with badges for `unsupported` elements
3. Show progress spinners for `deferred` elements, download WASM, re-render in place

---

## Layer 3: TypeScript Renderers (Ship Day 1)

Target **Canvas2D** as primary output. It's available everywhere, performs well,
and avoids DOM/CSS layout quirks. (Optional: SVG output for accessibility/print.)

### 3.1 What TS can handle well (80% of real slides)

| Element                                  | Complexity | Notes                                 |
| ---------------------------------------- | ---------- | ------------------------------------- |
| Rectangles, rounded rects                | Low        | Canvas2D native                       |
| Solid fills, gradient fills              | Low        | Linear/radial gradients in Canvas2D   |
| Images (png, jpg, svg)                   | Low        | drawImage + createImageBitmap         |
| Text (basic)                             | Medium     | measureText + fillText, line wrapping |
| Lines, arrows                            | Low        | Paths + custom arrow heads            |
| Tables                                   | Medium     | Grid layout + cell rendering          |
| Ovals, circles                           | Low        | Canvas2D arc/ellipse                  |
| Simple preset shapes                     | Medium     | ~40 most common of 200+ presets       |
| Drop shadows                             | Low        | Canvas2D shadowBlur/shadowOffset      |
| Opacity/transparency                     | Low        | globalAlpha                           |
| Rotation, flip                           | Low        | Canvas2D transforms                   |
| Slide backgrounds (solid/gradient/image) | Low        | Full-canvas fill                      |

### 3.2 What needs work but is doable in TS

| Element                            | Complexity | Approach                            |
| ---------------------------------- | ---------- | ----------------------------------- |
| Text auto-fit (shrink to fit)      | High       | Binary search on font size          |
| Bullet lists (multi-level)         | Medium     | Indent + bullet char from numbering |
| Text columns                       | Medium     | Split text flow into column rects   |
| Pattern fills                      | Medium     | Canvas2D createPattern              |
| Preset shape geometries (full set) | High       | Port the 200+ shape formulas        |
| Connector routing                  | Medium     | A\* or simple orthogonal routing    |

### 3.3 Preset Geometry Engine

OOXML defines 200+ preset shapes (e.g., `flowChartProcess`, `chevron`,
`leftRightArrow`). Each is defined by a **shape guide formula language** —
basically parameterized path construction with variables like `adj1`, `adj2`
(user-adjustable handles).

The spec defines these in "Annex D" of ISO 29500-1. Each shape is:

- A set of **guide formulas** (`val`, `*/`, `+-`, `sin`, `cos`, `at2`, `mod`, etc.)
- A set of **path segments** (`moveTo`, `lnTo`, `arcTo`, `cubicBezTo`, `close`)
- **Adjust values** (handles the user can drag)
- **Connection sites** and **text rectangles**

This is a pure math/geometry problem — perfect for TypeScript:

```typescript
interface PresetGeometry {
  name: string;
  avLst: AdjustValue[]; // default handle positions
  gdLst: ShapeGuide[]; // formula list
  pathLst: ShapePath[]; // drawing paths
  cxnLst?: ConnectionSite[];
  rect?: TextRect;
}

// Evaluate all guides, then walk paths emitting Canvas2D commands
function renderPresetShape(
  ctx: CanvasRenderingContext2D,
  geo: PresetGeometry,
  bounds: BoundingBox,
  adjustValues?: Map<string, number>
): void {
  const env = evaluateGuides(geo.gdLst, bounds, adjustValues);
  for (const path of geo.pathLst) {
    ctx.beginPath();
    for (const cmd of path.commands) {
      switch (cmd.type) {
        case 'moveTo':
          ctx.moveTo(env.resolve(cmd.x), env.resolve(cmd.y));
          break;
        case 'lnTo':
          ctx.lineTo(env.resolve(cmd.x), env.resolve(cmd.y));
          break;
        case 'arcTo':
          /* ... elliptical arc approximation ... */ break;
        case 'cubicBezTo':
          ctx.bezierCurveTo(/* ... */);
          break;
        case 'close':
          ctx.closePath();
          break;
      }
    }
    applyFillAndStroke(ctx, path);
  }
}
```

**Phased rollout:** Start with the 40 most common shapes (covers ~95% of real slides),
add the rest progressively. Each shape is an isolated unit — easy to test.

---

## Layer 4: WASM Modules (On-Demand)

### Module inventory (each independently loadable):

| Module          | Language          | Size (est.) | Loads when...                                      |
| --------------- | ----------------- | ----------- | -------------------------------------------------- |
| `text-layout`   | Rust + HarfBuzz   | ~800KB      | Complex scripts (Arabic, Devanagari, CJK vertical) |
| `chart-render`  | Rust or C++       | ~400KB      | Slide contains ChartML                             |
| `effect-engine` | C++ (Skia subset) | ~1.5MB      | 3D effects, reflections, artistic effects          |
| `emf-wmf`       | C/C++             | ~200KB      | Embedded EMF/WMF metafiles                         |
| `smartart`      | TS (no WASM)      | N/A         | SmartArt decomposition to shapes                   |

### Loading protocol:

```typescript
class WasmModuleLoader {
  private cache: Map<string, WebAssembly.Module> = new Map();
  private loading: Map<string, Promise<WebAssembly.Module>> = new Map();

  async load(
    moduleId: string,
    onProgress: (loaded: number, total: number) => void
  ): Promise<WasmModule> {
    // 1. Check in-memory cache
    if (this.cache.has(moduleId)) return this.instantiate(moduleId);

    // 2. Check Cache API (persists across sessions)
    const cached = await caches.match(`/wasm/${moduleId}.wasm`);
    if (cached) {
      /* ... */
    }

    // 3. Stream download with progress
    const response = await fetch(`/wasm/${moduleId}.wasm`);
    const reader = response.body!.getReader();
    const total = parseInt(response.headers.get('content-length') || '0');
    // ... stream chunks, report progress, compile streaming ...

    // 4. WebAssembly.compileStreaming for fastest load
    const module = await WebAssembly.compileStreaming(response);
    this.cache.set(moduleId, module);
    return this.instantiate(moduleId);
  }
}
```

### Why Skia/CanvasKit for the effect engine?

For the subset of PPTX features that Canvas2D can't handle well:

- **3D bevel/extrusion effects** — need a real 3D pipeline
- **Artistic effects** (blur, glow, soft edges, reflection) — Skia has GPU-accelerated filters
- **Complex gradient meshes**
- **High-quality text rendering** with proper subpixel positioning

CanvasKit (Skia WASM) is ~1.5MB gzipped, GPU-accelerated via WebGL, and has
production-quality text shaping (HarfBuzz + ICU built in). Load it only when a slide
actually needs these features.

---

## Layer 5: Fallback & Transparency System

### Grey Box Rendering

```typescript
function renderUnsupported(
  ctx: CanvasRenderingContext2D,
  element: UnsupportedIR,
  options: { showDebugInfo: boolean }
): void {
  const { x, y, width, height } = emuToPixels(element.bounds);

  // Hatched grey box
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x, y, width, height);
  drawHatchPattern(ctx, x, y, width, height, '#ddd');

  // Border
  ctx.strokeStyle = '#bbb';
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(x, y, width, height);

  // Badge
  const badge = `⚠ ${element.elementType}`;
  ctx.fillStyle = '#888';
  ctx.font = '11px system-ui';
  ctx.fillText(badge, x + 4, y + 14);

  if (options.showDebugInfo) {
    ctx.fillStyle = '#aaa';
    ctx.font = '9px monospace';
    ctx.fillText(element.reason, x + 4, y + 28);
    ctx.fillText(element.xmlTag, x + 4, y + 40);
  }
}
```

### Coverage Report API

```typescript
interface CoverageReport {
  totalElements: number;
  rendered: number;
  partial: number;
  unsupported: number;
  wasmRequired: number;
  details: Array<{
    slideIndex: number;
    elementIndex: number;
    kind: string;
    status: 'full' | 'partial' | 'unsupported' | 'wasm-pending';
    missing?: string[];
  }>;
}

// Consumer can display: "Slide 3: 12/14 elements rendered (2 need chart module)"
slidekit.getCoverageReport(): CoverageReport;
```

---

## Layer 6: Slide Viewport & UX

### Progressive Rendering Pipeline

```typescript
class SlideViewport {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private registry: CapabilityRegistry;
  private wasmLoader: WasmModuleLoader;

  async renderSlide(slideIR: SlideIR, options: RenderOptions): Promise<void> {
    const plan = this.registry.planRender(slideIR);

    // Phase 1: Background (always immediate)
    this.renderBackground(slideIR.background);

    // Phase 2: Immediate elements (TS renderers)
    for (const { element, renderer } of plan.immediate) {
      renderer.render(this.ctx, element);
    }

    // Phase 3: Unsupported → grey boxes
    for (const { element, reason } of plan.unsupported) {
      renderUnsupported(this.ctx, element, options);
    }

    // Phase 4: Deferred → spinners, then progressive fill-in
    const deferredPromises = plan.deferred.map(async ({ element, moduleId }) => {
      // Show spinner at element bounds
      this.renderSpinner(element.bounds, moduleId);

      // Load WASM module with progress
      const module = await this.wasmLoader.load(moduleId, (loaded, total) => {
        this.updateProgress(element.bounds, loaded, total);
      });

      // Re-render this element region
      const renderer = module.getRenderer(element);
      this.clearRegion(element.bounds);
      renderer.render(this.ctx, element);
    });

    await Promise.allSettled(deferredPromises);
  }
}
```

---

## Testing Strategy

### Visual Regression with LibreOffice Oracle

This is where LibreOffice becomes valuable — not as code to embed, but as a
reference renderer in CI:

```bash
# CI pipeline: for each test PPTX
libreoffice --headless --convert-to png --outdir reference/ test.pptx
node slidekit-render.js test.pptx --outdir actual/
pixelmatch reference/slide1.png actual/slide1.png diff/slide1.png --threshold 0.1
```

Test categories:

1. **Corpus tests** — grab 1000 real-world PPTXs, render every slide, track diff scores over time
2. **Feature unit tests** — one PPTX per feature (specific shape, gradient type, text layout case)
3. **Preset geometry tests** — render all 200+ presets, compare against PowerPoint reference
4. **Coverage tracking** — % of elements across corpus that render as full/partial/unsupported

### Spec Compliance Matrix

Maintain a living document mapping OOXML spec sections to implementation status:

```
PresentationML
├── Slide structure          ✅ full
├── Slide masters            ✅ full
├── Slide layouts            ✅ full
├── Notes                    ✅ full
├── Transitions              🔶 partial (fade, push only)
├── Animations               ❌ not yet
└── Comments                 ✅ full

DrawingML
├── Shapes
│   ├── Rectangles           ✅ full
│   ├── Preset geometries    🔶 40/200+
│   ├── Custom geometries    ✅ full
│   └── Shape groups         ✅ full
├── Text
│   ├── Basic runs/paragraphs ✅ full
│   ├── Auto-fit             🔶 shrink-to-fit only
│   ├── Columns              ❌ not yet
│   ├── Vertical text        ❌ needs wasm:text-layout
│   └── Complex scripts      ❌ needs wasm:text-layout
├── Fills
│   ├── Solid                ✅ full
│   ├── Linear gradient      ✅ full
│   ├── Radial gradient      ✅ full
│   ├── Pattern              🔶 basic patterns
│   └── Picture fill         ✅ full
├── Effects
│   ├── Shadow               ✅ full (Canvas2D shadow)
│   ├── Reflection           ❌ needs wasm:effect-engine
│   ├── Glow                 ❌ needs wasm:effect-engine
│   ├── Soft edges           ❌ needs wasm:effect-engine
│   └── 3D                   ❌ needs wasm:effect-engine
└── Charts
    ├── Bar/Column           ❌ needs wasm:chart-render (or TS)
    ├── Line                 ❌ needs wasm:chart-render (or TS)
    ├── Pie                  ❌ needs wasm:chart-render (or TS)
    └── Scatter              ❌ needs wasm:chart-render (or TS)
```

---

## Implementation Phases

### Phase 0: Foundation (Weeks 1-3)

- [ ] Project scaffolding: TypeScript, build system, test harness
- [ ] JSZip integration with lazy slide extraction + progress events
- [ ] PresentationML parser: presentation.xml, slide list, dimensions
- [ ] Theme parser: color schemes, font schemes
- [ ] Basic slide master / layout resolution

**Verifiable:** parse any PPTX, emit SlideIR JSON, validate structure

### Phase 1: Text & Shapes (Weeks 4-8)

- [ ] Shape parser: sp, grpSp with transforms (position, rotation, flip)
- [ ] Solid fill, linear/radial gradient fill
- [ ] Line/outline rendering (stroke, dash patterns, line ends)
- [ ] TextBody parser: paragraphs, runs, character properties
- [ ] Text renderer: basic wrapping, alignment, font resolution
- [ ] Image elements (blipFill)
- [ ] Top-40 preset geometries
- [ ] Canvas2D rendering pipeline with SlideViewport

**Verifiable:** render typical corporate slides (title + bullets + images)

### Phase 2: Progressive Fidelity Infrastructure (Weeks 9-12)

- [ ] Capability registry + router
- [ ] RenderPlan generation
- [ ] Grey-box fallback renderer with badges
- [ ] WASM module loader with Cache API + progress
- [ ] Coverage report API
- [ ] Visual regression CI against LibreOffice reference renders

**Verifiable:** can articulate exactly what any given PPTX needs that we don't have yet

### Phase 3: Expanding Coverage (Weeks 13-20)

- [ ] Table renderer
- [ ] Remaining preset geometries (batch implementation)
- [ ] Auto-fit text (shrink-to-fit, auto-size)
- [ ] Master slide background rendering
- [ ] Slide transitions (CSS animation for common ones)
- [ ] Connector shapes
- [ ] Hyperlinks, action buttons
- [ ] First WASM module: chart renderer (or pure TS with d3/chart.js)

**Verifiable:** 90%+ element coverage on a 1000-PPTX corpus

### Phase 4: WASM Accelerators (Weeks 21-30)

- [ ] CanvasKit integration for advanced effects
- [ ] HarfBuzz WASM for complex text shaping
- [ ] EMF/WMF metafile renderer
- [ ] SmartArt decomposition

---

## Key Technical Decisions

### EMU (English Metric Units)

All OOXML coordinates are in EMUs: 1 inch = 914400 EMU, 1 pt = 12700 EMU.
Convert once at parse time, store in the IR as EMU, convert to pixels at render
time using the viewport's DPI scaling.

### Font Handling

The hardest practical problem. Strategy:

1. Parse theme font declarations + per-run font specs
2. Use CSS `FontFace` API to check availability
3. Provide a font substitution table (Calibri→Arial, Cambria→Georgia, etc.)
4. For embedded fonts (rare in PPTX), extract from the ZIP
5. Show font warning badges when substitution occurs

### Worker Architecture

For large presentations, run the parser in a Web Worker:

```typescript
// Main thread
const worker = new Worker('slidekit-worker.js');
worker.postMessage({ type: 'parse', buffer: pptxArrayBuffer });
worker.onmessage = (e) => {
  if (e.data.type === 'slide-ready') {
    viewport.renderSlide(e.data.slideIR);
  }
};
```

### Memory Management

PPTX files can be large (100MB+ with embedded video). Strategy:

- Parse slide XML on demand (don't parse all 200 slides at once)
- Release media blobs after rendering (re-extract from ZIP if needed)
- Use `OffscreenCanvas` in workers where available
- WASM modules: explicit `free()` calls, not GC-dependent

---

## Dependencies (All OSS-friendly licenses)

| Library               | License | Purpose                               |
| --------------------- | ------- | ------------------------------------- |
| JSZip                 | MIT     | ZIP extraction                        |
| canvaskit-wasm        | BSD-3   | Advanced 2D rendering (optional WASM) |
| sax / fast-xml-parser | MIT     | XML parsing                           |
| harfbuzz-wasm         | MIT     | Complex text shaping (optional WASM)  |
| opentype.js           | MIT     | Font parsing/metrics (TS)             |

No AGPL. No copyleft. Full embedding freedom.
