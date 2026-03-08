# Quick Context

**Last updated:** 2026-03-08
**Branch:** main
**Phase:** Phase 4 (Waves 0-4) complete — PDF/Office unified architecture

## What Is This?

OpenDocKit is a progressive-fidelity, 100% client-side OOXML renderer and editor. It reads PPTX files (eventually DOCX/XLSX) and renders them in the browser using Canvas2D, with optional WASM modules for advanced features. The editing pipeline supports programmatic mutations (move, resize, text edit, delete, slide reorder/delete) with surgical XML patching for full-fidelity save. Phase 4 adds a PDF/Office unified architecture: a RenderBackend abstraction (CanvasBackend + PDFBackend), unified element model (PageModel/PageElement), cross-format text search, clipboard serialize/deserialize, PDF export pipeline, and batch PPTX→PDF conversion.

## Current State

The full PPTX rendering pipeline is implemented, tested, and visually validated. The editing pipeline (Phase 0-3) is complete. Phase 4 (Waves 0-4) of the PDF/Office unified architecture is complete:

- **3,841 tests** passing (1,570 core + 146 elements + 201 render + 322 pptx + 1,578 pdf-signer + 24 pdf), typecheck clean
- **Visual regression**: 54-slide real-world PPTX with per-slide RMSE baselines (`pnpm test:visual`) + 10-file corpus (67 slides) with self-referential regression guard (`pnpm test:visual:corpus`) + PDF visual regression with RMSE baselines (`pnpm test:visual:pdf`)
- **@opendockit/core**: OPC reader, XML parser, unit conversions, IR types, theme engine (colors + fonts + formats), font system with precomputed metrics (42 families, 130 faces) + bundled WOFF2 fonts (42 families, ~5MB, 100% offline), all DrawingML parsers (fill, line, effect, transform, text, picture, group, table, hyperlinks, video placeholder detection, field codes, diagram drawing), geometry engine (187 presets + path builder + custom geometry), all Canvas2D renderers (shape, fill, line, effect, text, picture, group, table, connector) with justify/distributed alignment + character spacing + text body rotation + font-metric-based line height + ascender baseline positioning + text outline + underline fill color, media cache, capability registry, WASM module loader, diagnostics system (DiagnosticEmitter + RenderContext wiring)
- **@opendockit/pptx**: Presentation parser, slide master/layout/slide parsers, background renderer, slide renderer (with placeholder property inheritance + table textDefaults), SlideKit viewport API (hyperlinks, notes, element inspector), SmartArt fallback renderer, chart cached image fallback renderer
- **@opendockit/elements**: Unified element model — PageModel/PageElement types, spatial utilities, dirty tracking. Shared contract between PPTX and PDF renderers.
- **@opendockit/render**: Shared render utilities — font metrics, color resolution, matrix math. Used by both CanvasBackend and PDFBackend.
- **@opendockit/pdf**: PDF rendering package — PDFBackend implementation, PDF export pipeline, basic shapes/fills, batch PPTX→PDF conversion script.
- **@opendockit/pdf-signer**: Signing primitives (COS objects, COSWriter, xref generation, signature dictionary patching) — ported from Apache PDFBox.
- **@opendockit/core edit module**: Branded EMU types (compile-time unit safety), EditablePresentation with dirty tracking (WeakSet-based, mirrors pdfbox-ts COSUpdateTracker), element ID registry (`partUri#shapeId`), XML reconstitution engine (surgical DOM patching via @xmldom/xmldom), OPC Package Writer (JSZip-based, unchanged parts copied as raw bytes), IR re-derivation engine (zero-alloc fast path for clean elements)
- **@opendockit/pptx edit module**: EditableSlideKit API (load/edit/save), editable builder (IR → mutable model), save pipeline (dirty part patching → OPC writer → ZIP)
- **Dev tools**: Element inspector in viewer (click-to-highlight with z-order hit testing, group recursion, tooltip with kind/name/position/layer), interactive edit mode (click-to-select any element kind including pictures/tables, move/resize/text/delete, nudge arrows, save PPTX download), instant edit feedback via deriveIR + renderSlideWithOverrides (single-slide re-render, no save/reload cycle), unified viewer with PPTX + PDF format detection

### RenderBackend Abstraction

All 10 renderers migrated from `rctx.ctx: CanvasRenderingContext2D` to `rctx.backend: RenderBackend`. CanvasBackend is a 1:1 passthrough to Canvas2D. PDFBackend produces PDF content streams via `@opendockit/pdf`. SlideKit wraps the canvas context with `new CanvasBackend(ctx)`.

### Font System

5-tier font loading (highest priority first):
1. **User-supplied fonts** — app provides ArrayBuffer/URL
2. **PPTX embedded fonts** — EOT parser extracts from the file
3. **Bundled WOFF2 fonts** — 42 families shipped in the npm package (~5MB base64 TS modules, tree-shakeable)
4. **OFL CDN fallback** — metrically compatible open fonts
5. **Google Fonts CDN fallback** — for Google Slides fonts

Precomputed font metrics for accurate text layout without actual fonts installed:
- **42 families, 130 faces** in ~750KB metrics bundle (auto-loaded by SlideKit)
- Coverage: all major Office fonts (via OFL substitutes), Google Fonts families, and common presentation fonts
- Gaps (no OFL replacement): Verdana, Trebuchet MS, Tahoma, Aptos, Corbel/Candara/Constantia
- Extraction: `scripts/extract-font-metrics.mjs` | Bundling: `scripts/bundle-woff2-fonts.py`
- Theme font placeholders (`+mj-lt`, `+mn-lt`, `+mn-cs`) resolved to actual font names via theme
- The metrics bundle in `@opendockit/core` is the authoritative source; `@opendockit/render` imports from core, not a copy

### Visual Regression Pipeline

- **PDF-referenced**: `pnpm test:visual` — renders 54-slide PPTX via headless Chromium, compares against PDF reference PNGs using ImageMagick RMSE. Per-slide baselines with regression guard (fails on RMSE increase > 0.008 threshold). `--update-baselines` flag to lock in improvements.
- **Self-referential corpus**: `pnpm test:visual:corpus` — renders 10 corpus PPTX files (67 slides), bootstraps baselines on first run, detects regressions on subsequent runs (RMSE threshold 0.003). Baselines stored in `test-data/corpus-baselines/` (gitignored).
- **PDF visual regression**: `pnpm test:visual:pdf` — PDF rendering with RMSE baselines (9 PDFs/18 pages baselined, 2026-03-07).

### Editing Pipeline (Phase 0-3 — complete)

Three-layer architecture, no XML during editing:
1. **Original XML Parts** — cold storage, touched only on save
2. **Flat Edit Model** — hot, mutable, EMU integers, dirty flags
3. **Render IR** — derived from Layer 2, lazy, read-only

Supported operations: moveElement, resizeElement, setText, deleteElement, reorderSlides, deleteSlide. Save pipeline: only dirty parts reconstituted via surgical XML patching, unchanged parts copied as raw bytes (byte-identical). 24 round-trip tests + 6 visual regression tests for edits.

Cross-project alignment with pdfbox-ts: EditTracker mirrors COSUpdateTracker pattern, branded types shared (EMU in OpenDocKit, Points in pdfbox-ts).

## What's Next

### Phase 4: Charts + Export (partially done)

Complete (Waves 0-4, 2026-03-07/08):
- RenderBackend abstraction (CanvasBackend + PDFBackend)
- Unified element model: @opendockit/elements
- Unified render utilities: @opendockit/render
- PDF rendering package: @opendockit/pdf
- PDF export pipeline (basic shapes/fills)
- Cross-format text search
- Clipboard serialize/deserialize
- Batch PPTX→PDF conversion script
- Unified viewer (PPTX + PDF format detection)

Still deferred:
1. **Full ChartML** parser and renderer (bar, pie, line, scatter, combo) — cached image fallback already renders chart previews
2. **CanvasKit** WASM integration (3D effects, reflections, advanced filters)
3. **Slide transitions**
4. **SVG export**

### Deferred (not blocking — tackle when needed)

1. **Connector routing** — shape-to-shape endpoint resolution via connection sites (current: connectors render but endpoints are edge-of-bounding-box, not snapped to connection site geometry)
2. **Text effects on runs** — `a:effectLst` on `a:rPr` (text shadow/glow/reflection) not parsed
3. **Multi-column text bodies** — `numCol`/`spcCol` parsed into IR but not consumed
4. **Synthetic test fixtures** — PPTX files targeting specific features in isolation

## Key Architecture Decisions

1. **No LibreOffice WASM** — too monolithic. Use as CI reference oracle only.
2. **TS envelope owns everything** — parsing, orchestration, simple rendering
3. **WASM modules are leaf-node accelerators** — CanvasKit, HarfBuzz, loaded on demand
4. **Shared DrawingML core** — ~40% of code shared across PPTX/DOCX/XLSX
5. **IR is serializable JSON** — not a file format, but cacheable and transferable
6. **RenderBackend abstraction** — CanvasBackend (Canvas2D) and PDFBackend (PDF export) share one renderer codebase
7. **Capability registry** — routes elements to renderers, categorizes unsupported features

## Packages

```
packages/
├── core/         @opendockit/core         — OPC, DrawingML, themes, geometry, capability registry, WASM loader
├── pptx/         @opendockit/pptx         — PresentationML parser, slide renderer, SlideKit API
├── elements/     @opendockit/elements     — Unified element model (PageModel/PageElement), spatial utilities, dirty tracking
├── render/       @opendockit/render       — Shared render utilities: font metrics, color resolution, matrix math
├── pdf/          @opendockit/pdf          — PDF rendering (PDFBackend), PDF export pipeline, batch conversion
├── pdf-signer/   @opendockit/pdf-signer   — PDF signing primitives (COS objects, COSWriter, xref, signature dict)
└── wasm-modules/ —                        — On-demand WASM accelerators (future)
```

## Blockers

None currently.

## Active Bugs

None currently.
