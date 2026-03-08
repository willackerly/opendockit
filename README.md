# OpenDocKit

Progressive-fidelity, 100% client-side OOXML document renderer.

Renders PPTX presentations (and eventually DOCX/XLSX) directly in the browser using Canvas2D, with on-demand WASM modules for advanced features. No server dependencies. No paid SDKs.

## Status

**Alpha** — Phase 4 (PDF/Office unified architecture) complete. PPTX rendering, editing, and PDF export operational.

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
| `@opendockit/pdf-signer`   | PDF signing primitives (COS objects, xref generation, signature dict)         | Complete |
| `@opendockit/docx`         | DOCX renderer (future)                                                        | Planned  |
| `@opendockit/xlsx`         | XLSX renderer (future)                                                        | Planned  |

## Architecture

The key insight: **DrawingML is shared across all three OOXML formats.** Shapes, fills, effects, pictures, charts, and themes use identical markup regardless of whether they appear in a PPTX, DOCX, or XLSX.

The RenderBackend abstraction decouples renderers from their output target: `CanvasBackend` writes to Canvas2D, `PDFBackend` produces PDF content streams. All 10 DrawingML renderers use `rctx.backend: RenderBackend`.

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
├── core/         — OPC, DrawingML, themes, geometry
├── pptx/         — PresentationML parser, SlideKit API
├── elements/     — Unified element model (PageModel/PageElement)
├── render/       — Font metrics, color resolution, matrix math
├── pdf/          — PDF export, PDFBackend, batch conversion
├── pdf-signer/   — PDF signing primitives
└── wasm-modules/ — On-demand WASM accelerators (future)
```

See `docs/architecture/` for full details.

## Design Philosophy

1. **Progressive fidelity** — render what we can immediately, grey-box what we can't, load WASM for advanced features on demand
2. **100% client-side** — no server dependencies, works offline
3. **Transparent capability reporting** — the renderer knows exactly what it supports and tells you
4. **Inspectable code** — TS/JS envelope owns parsing and orchestration; WASM modules are leaf-node accelerators

## Documentation

See `docs/README.md` for the full documentation tree.

## License

MIT
