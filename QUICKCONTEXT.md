# Quick Context

**Last updated:** 2026-02-16
**Branch:** main
**Phase:** 0 — Core Foundation

## What Is This?

OpenDocKit is a progressive-fidelity, 100% client-side OOXML renderer. It reads PPTX files (eventually DOCX/XLSX) and renders them in the browser using Canvas2D, with optional WASM modules for advanced features.

## Current State

- Monorepo scaffolded (pnpm workspaces)
- Two packages: `@opendockit/core` and `@opendockit/pptx`
- Architecture docs finalized (see `docs/architecture/`)
- No production code yet — starting Phase 0 implementation

## What's Next

Phase 0 deliverables (Weeks 1-3):
- OPC Package Reader (ZIP + content types + relationships)
- XML parser wrapper (fast-xml-parser with namespace support)
- Unit conversions (EMU, DXA, half-points)
- IR type definitions (all shared types)
- Theme parser (theme1.xml → ThemeIR)
- Color resolver (all 5 color types + transforms)
- Font resolver (substitution table + FontFace API)

## Key Architecture Decisions

1. **No LibreOffice WASM** — too monolithic. Use as CI reference oracle only.
2. **TS envelope owns everything** — parsing, orchestration, simple rendering
3. **WASM modules are leaf-node accelerators** — CanvasKit, HarfBuzz, loaded on demand
4. **Shared DrawingML core** — ~40% of code shared across PPTX/DOCX/XLSX
5. **IR is serializable JSON** — not a file format, but cacheable and transferable
6. **Canvas2D primary renderer** — PDF/SVG backends added later via RenderBackend interface

## Packages

```
packages/
├── core/   @opendockit/core   — OPC, DrawingML, themes, geometry, capability registry
└── pptx/   @opendockit/pptx   — PresentationML parser, slide renderer, SlideKit API
```

## Blockers

None currently — greenfield project.
