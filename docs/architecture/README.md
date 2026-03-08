# Architecture Documentation

## Core Documents

| Doc                      | Description                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CANVASKIT_STRATEGY.md`  | **CanvasKit / Skia WASM integration strategy.** Lazy-load architecture, bundle size analysis, Canvas2D vs CanvasKit capabilities, phased implementation plan. Cross-project relevance with pdfbox-ts. **Read this for rendering roadmap.**    |
| `OOXML_RENDERER.md`      | Comprehensive multi-format architecture. Covers the shared core, format-specific layers (PPTX/DOCX/XLSX), the OOXML sharing matrix, DrawingML integration points, text divergence analysis, and phased implementation plan. **Start here.** |
| `PPTX_SLIDEKIT.md`       | Detailed PPTX-specific renderer design. Covers the progressive rendering pipeline, capability registry, WASM module loading, fallback system, testing strategy, and public API surface.                                                     |
| `RENDER_BACKEND.md`      | **RenderBackend abstraction.** Interface, CanvasBackend, PDFBackend, migration pattern, known gaps.                                                                                                                                         |

## Architecture Decision Records

See `../adr/` for individual decisions.

## Key Principles

1. **Shared DrawingML core** — shapes, fills, effects, pictures, charts are format-agnostic
2. **Format-specific document models** — no premature "universal document" abstraction
3. **TS envelope owns everything** — WASM modules are leaf-node accelerators
4. **Progressive fidelity** — render what you can, badge what you can't, load WASM on demand
5. **IR is data, not a file format** — serializable JSON, cacheable, transferable
6. **100% client-side** — no server dependencies

## RenderBackend Abstraction

All DrawingML renderers use `rctx.backend: RenderBackend` instead of `rctx.ctx: CanvasRenderingContext2D` directly. This indirection enables swapping the rendering target between Canvas2D and PDF without modifying any renderer logic.

**Interface** (`packages/core/src/drawingml/renderer/render-backend.ts`): 72 Canvas2D-mirroring methods covering path operations, state management, transforms, fill/stroke, text, and images.

**Implementations:**

- `CanvasBackend` — 1:1 passthrough to `CanvasRenderingContext2D`. Zero behavioral difference; SlideKit wraps the raw `ctx` with `new CanvasBackend(ctx)`.
- `PDFBackend` — Translates Canvas2D calls to PDF content stream operators. Y-flip applied at construction. See `RENDER_BACKEND.md` for full operator mapping and known gaps.

**Migration:** All 10 DrawingML renderers (`shape-renderer.ts`, `fill-renderer.ts`, `line-renderer.ts`, `text-renderer.ts`, `effect-renderer.ts`, `picture-renderer.ts`, `group-renderer.ts`, `table-renderer.ts`, `connector-renderer.ts`, `background-renderer.ts`) were migrated from `rctx.ctx` to `rctx.backend` in Wave 1 of the PDF/Office merger. Zero visual regression.

## Unified Element Model

`@opendockit/elements` provides a format-agnostic `PageModel` / `PageElement` type system shared between PPTX and PDF.

**Key types:**

- `PageModel` — flat list of `PageElement`s on a fixed-size canvas (width/height in points)
- `PageElement` — discriminated union: `ShapeElement | TextElement | ImageElement | GroupElement | PathElement | TableElement`
- `PptxSource` — source bag on each PPTX-origin element, preserving original EMU values for lossless round-trip
- `PdfSource` — source bag on each PDF-origin element, preserving COS object references

**Features:** spatial queries (hit-test, bounds, overlap), dirty tracking (WeakSet-based `EditTracker`), text search, clipboard serialization.

**Bridge:** `packages/pptx/src/elements/` contains the `SlideElementIR → PageElement` converter with `PptxSource` bags. The interaction layer works in points; the save pipeline applies deltas back to original EMU values via `source.offX += deltaPoints * 12700`.

See `../ELEMENT_MODEL_BRIEF.md` for design rationale and key decisions.

## PDF Export Pipeline

PPTX slides are exported to PDF via the RenderBackend abstraction:

```
PPTX parse → SlideElementIR → renderSlide(rctx) → PDFBackend → ContentStreamBuilder → PDF bytes
```

`PDFBackend` maps each Canvas2D call to PDF content stream operators:

| Canvas2D | PDF operators |
| -------- | ------------- |
| `save/restore` | `q / Q` |
| `translate/scale/rotate` | `cm` matrix |
| `moveTo/lineTo/bezierCurveTo` | `m / l / c` |
| `fill/stroke` | `f / S / B` |
| `setFillColor/setStrokeColor` | `rg / RG` |
| `lineWidth` | `w` |
| `rect` | `re` |
| `fillText` | `BT / Tf / Tm / Tj / ET` |
| `drawImage` | XObject + `Do` |

**Current gaps** (Wave 3+): inline text rendering, gradient shading (Type 2/3 functions), image embedding, table borders, connector paths. Gradients currently approximated with first-stop solid color.

See `../plans/fan-out-strategy.md` (Wave 2+) for the implementation roadmap.
