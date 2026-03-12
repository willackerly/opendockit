# OpenDocKit

Progressive-fidelity, 100% client-side OOXML document renderer.

Renders PPTX presentations (and eventually DOCX/XLSX) directly in the browser using Canvas2D, with on-demand WASM modules for advanced features. No server dependencies. No paid SDKs.

## Highlights

- **Full PPTX rendering** — 187 preset geometries, tables, SmartArt, connectors, text auto-fit, gradients, effects
- **Native PDF rendering** — 85+ content stream operators, embedded font patching (pure-TS, no python), RMSE 0.042 vs pdftoppm
- **PDF signing** — byte-for-byte parity with Apache PDFBox, visual signatures, multi-user, RFC 3161 timestamps, LTV
- **Cross-format element tracing** — per-element PPTX↔PDF comparison with property-level diffs (font, position, color, size)
- **PDF export** — PPTX→PDF with custom TrueType font embedding, font subsetting, per-glyph advance widths
- **Interactive editing** — move, resize, text edit, delete elements with surgical XML patching for lossless save
- **42 bundled font families** — 100% offline rendering, no CDN required (~5MB WOFF2)
- **4,534 tests** — visual regression pipeline, 30-page RMSE comparison harness, 1000+ PDF corpus validation

## Status

**Alpha** — Phase 4 (PDF/Office unified architecture) complete. PPTX rendering, editing, and PDF export operational. Phase 5+ (performance, cross-format save, in-canvas editing) in planning — see [`docs/plans/STRATEGIC_ROADMAP.md`](docs/plans/STRATEGIC_ROADMAP.md).

## Quick Start

```bash
pnpm install
pnpm build
pnpm test
```

## Packages

| Package                    | Description                                                                   | Status   |
| -------------------------- | ----------------------------------------------------------------------------- | -------- |
| `@opendockit/core`         | Shared OOXML infrastructure (OPC, DrawingML, themes, colors, fonts, geometry) | Complete |
| `@opendockit/pptx`         | PPTX renderer and editor (SlideKit)                                           | Complete |
| `@opendockit/elements`     | Unified element model (PageModel/PageElement), spatial utilities              | Complete |
| `@opendockit/render`       | Shared render utilities: font metrics, color resolution, matrix math          | Complete |
| `@opendockit/pdf`          | PDF rendering (PDFBackend), PDF export pipeline, batch PPTX→PDF conversion    | Alpha    |
| `@opendockit/pdf-signer`   | PDF engine: signing, native rendering, element extraction, font patching      | Complete |
| `@opendockit/fonts`        | Offline font companion (42 OFL families, WOFF2 + TTF)                         | Complete |
| `@opendockit/docx`         | DOCX renderer (WordprocessingML parser + block layout)                         | Alpha    |
| `@opendockit/xlsx`         | XLSX renderer (future)                                                        | Planned  |

### Dev Tools

| Tool | Description |
|------|-------------|
| `tools/element-debug/` | Side-by-side PPTX↔PDF element diff viewer with click-to-inspect |
| `tools/viewer/` | Unified PPTX + PDF viewer with element inspector and edit mode |
| `tools/test-harness/` | Enhanced test harness with toolbar, slide panel, canvas editor |
| `scripts/per-element-regression.mjs` | CI per-element regression guard (headless Playwright) |
| `scripts/visual-compare.mjs` | Visual regression pipeline (RMSE comparison) |

## Architecture

The key insight: **DrawingML is shared across all three OOXML formats.** Shapes, fills, effects, pictures, charts, and themes use identical markup regardless of whether they appear in a PPTX, DOCX, or XLSX.

The RenderBackend abstraction decouples renderers from their output target: `CanvasBackend` writes to Canvas2D, `PDFBackend` produces PDF content streams, and `TracingBackend` captures a structured render trace with world-space coordinates for per-element debugging and cross-format comparison. All 10 DrawingML renderers use `rctx.backend: RenderBackend`.

### Cross-Format Element Tracing & Diff

The deepest document rendering debug infrastructure available in any open-source OOXML renderer:

**TracingBackend** wraps any `RenderBackend` and captures a structured trace of every visual operation — text draws, shape fills/strokes, images — with world-space coordinates in points, shape attribution, and paragraph/run indices. Zero cost when disabled.

**Element Matching** (`@opendockit/elements`) matches PPTX trace elements against PDF-extracted elements using a three-pass algorithm: exact text match → fuzzy text similarity (LCS > 0.7) → spatial IoU (> 0.3).

**Property Diff** compares matched pairs property-by-property — position, size, font family, font size, bold/italic, color (Euclidean RGB distance) — with severity thresholds: match (<1pt), minor (1-3pt), major (3-8pt), critical (>8pt).

```
TracingBackend → traceToElements() → matchElements() → generateDiffReport()
     ↑                                      ↑
  PPTX render                         PDF extraction
  (Canvas2D)                       (NativeRenderer)
```

> **Ground truth rule:** Cross-format comparison PDFs **must** be exported from Microsoft PowerPoint — never from our own `exportPDF()`. Our PDF exporter has its own font mapping and rendering bugs; comparing against it tests our code against itself. Test fixtures are matched pairs: `foo.pptx` + `foo.pdf` (from PowerPoint).

```
                    @opendockit/core
                    ├── OPC (ZIP + rels)
                    ├── DrawingML parser/renderer
                    ├── Theme engine
                    ├── Color resolver
                    ├── Preset geometry engine
                    ├── Capability registry
                    └── WASM module loader
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        @opendockit/  @opendockit/  @opendockit/
        pptx          docx          xlsx
              │
              ▼
        RenderBackend
        ├── CanvasBackend  →  Canvas2D
        └── PDFBackend     →  @opendockit/pdf
```

```
packages/
├── core/         — OPC, DrawingML, themes, geometry, FontResolver
├── pptx/         — PresentationML parser, SlideKit API
├── elements/     — Unified element model (PageModel/PageElement)
├── render/       — Font metrics, color resolution, matrix math
├── pdf/          — PDF export, PDFBackend, batch conversion
├── pdf-signer/   — PDF engine: signing, native rendering, element extraction
├── fonts/        — Offline font companion (42 OFL families, WOFF2 + TTF)
├── docx/         — DOCX renderer (WordprocessingML parser + block layout)
└── wasm-modules/ — On-demand WASM accelerators (future)
```

See `docs/architecture/` for full details.

## Design Philosophy

1. **Offline-first** — every feature works without network access. Font metrics ship in-bundle for instant layout; font binaries available via companion package. Network is for enhancement (CDN fonts, updates), never a hard dependency.
2. **Progressive fidelity** — render something useful immediately, improve quality as resources load. Metrics-only text layout → font binary swap → WASM-accelerated effects. Never block on optional resources.
3. **100% client-side** — zero server dependencies. All parsing, rendering, editing, and export runs in the browser or Node.js.
4. **The IR is the product** — `PageElement[]` is the cross-format bridge. Every format reads into it; every output writes from it. Enriching this IR is the highest-leverage work.
5. **Progressive capability, not progressive compromise** — each tier (parse → layout → render → edit → save) works independently. Apps consume only what they need. Tree shaking eliminates the rest.
6. **Transparent capability reporting** — the renderer knows exactly what it supports and tells you.
7. **Inspectable code** — TS/JS envelope owns parsing and orchestration; WASM modules are leaf-node accelerators, not black boxes.

## Documentation

| Document | Purpose |
|----------|---------|
| `QUICKCONTEXT.md` | 30-second project orientation |
| `AGENTS.md` | Agent norms, workstreams, doc maintenance |
| `TODO.md` | Roadmap and task tracking |
| `KNOWN_ISSUES.md` | Current blockers and gotchas |
| `docs/MIGRATION_GUIDE.md` | pdfbox-ts → @opendockit/pdf-signer migration |
| `docs/architecture/` | System architecture, RenderBackend, element model |
| `docs/testing/` | Test coverage, visual regression, font testing |
| `docs/plans/STRATEGIC_ROADMAP.md` | Phase 5+ strategic roadmap (cross-format, editing, performance) |
| `docs/plans/` | All design plans, merge strategies, execution guides |
| `scripts/README.md` | Script registry and usage guide |
| `packages/*/README.md` | Per-package quick start |
| `packages/**/MODULE.md` | Detailed module documentation |

See `docs/README.md` for the full documentation tree.

## Roadmap

Phase 4 is complete. The strategic roadmap for Phase 5+ is in [`docs/plans/STRATEGIC_ROADMAP.md`](docs/plans/STRATEGIC_ROADMAP.md):

- **Phase 5:** Tree shaking + bundle optimization (core ~800KB → ~200KB gzip), spatial indexing + undo/redo, PDF/A-3 lossless round-trip
- **Phase 5.5:** Variable fonts, on-demand subsetting (hb-subset WASM), metrics compression, unified cross-format FontResolver
- **Phase 6:** OffscreenCanvas worker rendering, in-canvas text editing engine, CanvasKit/WebGPU backend
- **Phase 7:** Incremental PDF save, PageElement → OOXML synthesis, OOXML feature coverage registry
- **Phase 8:** CRDT collaborative editing (Yjs), AI-assisted document understanding, streaming parsing

Cross-project synergy with [blindpipe](https://github.com/willackerly/blindpipe) (zero-knowledge collaborative office suite) is documented in the roadmap — shared font stack, DOCX parser, and rendering engine could replace blindpipe's ~556MB ONLYOFFICE dependency with a ~5MB OpenDocKit stack.

## License

MIT
