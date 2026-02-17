# OpenDocKit

Progressive-fidelity, 100% client-side OOXML document renderer.

Renders PPTX presentations (and eventually DOCX/XLSX) directly in the browser using Canvas2D, with on-demand WASM modules for advanced features. No server dependencies. No paid SDKs.

## Status

**Pre-alpha** — Phase 0 (Core Foundation) in progress.

## Quick Start

```bash
pnpm install
pnpm build
pnpm test
```

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| `@opendockit/core` | Shared OOXML infrastructure (OPC, DrawingML, themes, colors, fonts, geometry) | Phase 0 |
| `@opendockit/pptx` | PPTX renderer (SlideKit) | Phase 2 |
| `@opendockit/docx` | DOCX renderer (future) | Planned |
| `@opendockit/xlsx` | XLSX renderer (future) | Planned |

## Architecture

The key insight: **DrawingML is shared across all three OOXML formats.** Shapes, fills, effects, pictures, charts, and themes use identical markup regardless of whether they appear in a PPTX, DOCX, or XLSX.

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
