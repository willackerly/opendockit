# Quick Context

**Last updated:** 2026-03-10
**Branch:** main
**Phase:** Phase 4 (Waves 0-4) complete — PDF/Office unified architecture

## What Is This?

OpenDocKit is a progressive-fidelity, 100% client-side OOXML renderer and editor. It reads PPTX and DOCX files (eventually XLSX) and renders them in the browser using Canvas2D, with optional WASM modules for advanced features. The editing pipeline supports programmatic mutations (move, resize, text edit, delete, slide reorder/delete) with surgical XML patching for full-fidelity save. Phase 4 adds a PDF/Office unified architecture: a RenderBackend abstraction (CanvasBackend + PDFBackend), unified element model (PageModel/PageElement), cross-format text search, clipboard serialize/deserialize, PDF export pipeline, and batch PPTX→PDF conversion.

## Where to Find Things

| Looking for... | Go to... |
|---|---|
| Project overview | `QUICKCONTEXT.md` (this file) |
| Getting started | `README.md` |
| Package overview | `packages/<name>/README.md` |
| Module internals | `packages/<name>/**/MODULE.md` |
| Architecture | `docs/architecture/README.md` |
| Test coverage | `docs/testing/COVERAGE.md` |
| Testing tools & scripts | `scripts/README.md`, `docs/testing/README.md` |
| Font system | `packages/core/src/font/MODULE.md` |
| Visual regression | `docs/testing/README.md` § Visual Regression |
| Plans & decisions | `docs/plans/README.md` |
| DX issues | `developer-experience-issues.md` |
| Agent norms | `AGENTS.md` |
| Known issues | `KNOWN_ISSUES.md` |
| Roadmap | `TODO.md` |

## Current State

The full PPTX rendering pipeline is implemented, tested, and visually validated. The editing pipeline (Phase 0-3) is complete. Phase 4 (Waves 0-4) of the PDF/Office unified architecture is complete:

- **4,434 tests** passing (1,768 core + 331 elements + 208 render + 370 pptx + 1,604 pdf-signer + 129 docx + 24 pdf), typecheck clean
- **Visual regression**: 54-slide real-world PPTX with per-slide RMSE baselines (`pnpm test:visual`) + 10-file corpus (67 slides) with self-referential regression guard (`pnpm test:visual:corpus`) + PDF visual regression with RMSE baselines (`pnpm test:visual:pdf`)
- **@opendockit/core**: OPC reader, XML parser, unit conversions, IR types, theme engine (colors + fonts + formats), font system with precomputed metrics (42 families, 130 faces) + bundled WOFF2 fonts (42 families, ~5MB, 100% offline), all DrawingML parsers (fill, line, effect, transform, text, picture, group, table, hyperlinks, video placeholder detection, field codes, diagram drawing), geometry engine (187 presets + path builder + custom geometry), all Canvas2D renderers (shape, fill, line, effect, text, picture, group, table, connector) with justify/distributed alignment + character spacing + text body rotation + font-metric-based line height + ascender baseline positioning + text outline + underline fill color, media cache, capability registry, WASM module loader, diagnostics system (DiagnosticEmitter + RenderContext wiring)
- **@opendockit/pptx**: Presentation parser, slide master/layout/slide parsers, background renderer, slide renderer (with placeholder property inheritance + table textDefaults), SlideKit viewport API (hyperlinks, notes, element inspector), SmartArt fallback renderer, chart cached image fallback renderer
- **@opendockit/elements**: Unified element model — PageModel/PageElement types, spatial utilities, dirty tracking. Shared contract between PPTX and PDF renderers.
- **@opendockit/render**: Shared render utilities — font metrics, color resolution, matrix math. Used by both CanvasBackend and PDFBackend.
- **@opendockit/pdf**: PDF rendering package — PDFBackend implementation, PDF export pipeline, basic shapes/fills, batch PPTX→PDF conversion script.
- **@opendockit/docx**: DOCX rendering package — WordprocessingML parser (document/paragraph/run/styles/numbering/section), block layout engine, DocKit viewport with Canvas2D rendering. 129 tests.
- **@opendockit/pdf-signer**: Signing primitives (COS objects, COSWriter, xref generation, signature dictionary patching) — ported from Apache PDFBox.
- **@opendockit/core edit module**: Branded EMU types (compile-time unit safety), EditablePresentation with dirty tracking (WeakSet-based, mirrors pdfbox-ts COSUpdateTracker), element ID registry (`partUri#shapeId`), XML reconstitution engine (surgical DOM patching via @xmldom/xmldom), OPC Package Writer (JSZip-based, unchanged parts copied as raw bytes), IR re-derivation engine (zero-alloc fast path for clean elements)
- **@opendockit/pptx edit module**: EditableSlideKit API (load/edit/save), editable builder (IR → mutable model), save pipeline (dirty part patching → OPC writer → ZIP)
- **Dev tools**: Unified viewer (`tools/viewer/`) with element inspector, edit mode (move/resize/text/delete/save), thumbnail sidebar, perf overlay, PPTX + PDF format detection. Element debug viewer (`tools/element-debug/`) for SBS comparison with RMSE analysis. Shared Vite aliases (`tools/shared/vite-aliases.ts`). CLI: `pnpm sbs -- --pptx <path> --ref-dir <dir>` for automated SBS report generation. Test harness deprecated (superseded by viewer)

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
- **TTF bundles**: 42 families available as raw TTF for PDF embedding (`packages/core/src/font/data/ttf/`), with `ttf-loader.ts` for dynamic loading + caching
- **PDF custom font embedding**: Text in PDF exports uses custom TrueType fonts (Type0/CIDFontType2 with Identity-H encoding) instead of standard font fallback. Fonts are subsetted to include only used glyphs, reducing PDF size

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

### NativeRenderer (PDF Reading) Quality — Active Focus

**RMSE avg 0.069** against pdftoppm on USG Briefing (30 pages). Down from 0.14 — **51% reduction**. 24/30 pages FAIR (< 0.08), 6 pages BAD, worst page 29 at 0.19.

**Completed:** Form XObject state isolation, fillStroke path fix, image mask colors, horizontal text scaling, JPEG SMask application, ICC stream color space (was #1 bug — backgrounds decoded as gray), sampled/stitching gradient functions, tiling patterns, font extraction infrastructure.

**Remaining:** ExtGState SMask transparency groups (page 29 — Hard), font substitution differences, negative fontSize, CS/cs color space tracking, Separation/DeviceN tint transforms.

**Next direction:** Element-level structural diffing (evaluator already emits TextElement/ShapeElement/ImageElement) instead of pixel RMSE — more actionable for remaining issues like font rendering.

**Phase 3:** Tools consolidation — unify diagnostic scripts, streamline comparison infrastructure.

### Phase 4: Charts + Export (complete)

Waves 0-4 complete (2026-03-07/08):
- RenderBackend abstraction (CanvasBackend + PDFBackend)
- Unified element model: @opendockit/elements
- Unified render utilities: @opendockit/render
- PDF rendering package: @opendockit/pdf
- PDF export pipeline (shapes/fills + text with custom TrueType font embedding + font subsetting + JPEG/PNG image XObjects + gradient shading + transparency)
- Cross-format text search, clipboard serialize/deserialize, batch PPTX→PDF conversion
- Unified viewer (PPTX + PDF format detection)
- Font substitutions for Aptos, Verdana, Trebuchet MS, Corbel, Candara, Constantia
- NativeRenderer improvements: shading patterns, JPEG images, CropBox, indexed colors
- DOCX scaffold: @opendockit/docx package with full WordprocessingML parser + DocKit viewport (129 tests)
- PDF custom font embedding — 42 bundled font families as subsetted TrueType

Still deferred:
1. **CanvasKit** WASM integration (3D effects, reflections, advanced filters)
2. **Slide transitions**
3. **SVG export**

Permanently deferred:
- **ChartML** — cached image fallback renders chart previews. Not worth the complexity.

### Deferred (not blocking — tackle when needed)

1. **Connector routing** — shape-to-shape endpoint resolution via connection sites
2. **Text effects on runs** — `a:effectLst` on `a:rPr` (text shadow/glow/reflection) not parsed
3. **Multi-column text bodies** — `numCol`/`spcCol` parsed into IR but not consumed

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
├── docx/         @opendockit/docx         — WordprocessingML parser, block layout, DocKit viewport
├── pdf-signer/   @opendockit/pdf-signer   — PDF signing primitives (COS objects, COSWriter, xref, signature dict)
└── wasm-modules/ —                        — On-demand WASM accelerators (future)
```

## Blockers

None currently.

## Recent Changes

- **Multi-theme support**: Each slide master can now have its own theme (parsed from master's OPC relationships). Slides using different masters correctly resolve scheme colors from their master's theme, not just the presentation-level default.

## Active Bugs

### PDF NativeRenderer Quality (2026-03-10)

**Avg RMSE 0.069** against pdftoppm (down from 0.14 — 51% reduction). 24/30 pages FAIR. Fixed: ICC stream color space (#1 bug), JPEG SMask, Form XObject state, fillStroke path, image mask colors, horizontal scaling, sampled gradient functions, tiling patterns. Remaining: ExtGState SMask (transparency groups), font substitution, CS/cs tracking.

**Comparison harness**: `packages/pdf-signer/src/render/__tests__/pdf-compare-harness.test.ts` — generates HTML report at `packages/tmp/pdf-compare/usg-briefing/report.html`.
**PPTX SBS viewer**: `pnpm sbs -- --pptx <path> --ref-dir <dir>` or `node scripts/generate-sbs-viewer.mjs`.
**PowerPoint ground truth**: `~/dev/USG Briefing/PNG-USG Briefing Mar 7 - UNCLAS/` (30 slides, 2880x1620).
