# Quick Context

**Last updated:** 2026-02-18
**Branch:** main
**Phase:** 3 (stragglers) — Core rendering pipeline complete

## What Is This?

OpenDocKit is a progressive-fidelity, 100% client-side OOXML renderer. It reads PPTX files (eventually DOCX/XLSX) and renders them in the browser using Canvas2D, with optional WASM modules for advanced features.

## Current State

The full rendering pipeline is implemented and working:

- **1,284 tests** passing (1,206 core + 78 pptx), typecheck clean, lint clean
- **@opendockit/core**: OPC reader, XML parser, unit conversions, IR types, theme engine (colors + fonts + formats), font system with precomputed metrics (12 families, 43 faces, lineHeight/lineGap), all DrawingML parsers (fill, line, effect, transform, text, picture, group, table, hyperlinks), geometry engine (187 presets + path builder + custom geometry), all Canvas2D renderers (shape, fill, line, effect, text, picture, group, table, connector), media cache, capability registry, WASM module loader
- **@opendockit/pptx**: Presentation parser, slide master/layout/slide parsers, background renderer, slide renderer (with placeholder property inheritance), SlideKit viewport API (hyperlinks, notes)

### Font Metrics System (new)

Precomputed font metrics from OFL fonts for accurate text layout without actual fonts installed:

- **12 families, 43 faces** in 262KB bundle (auto-loaded by SlideKit)
- Vendored TrueType/CFF parsers from pdfbox-ts for extraction
- `measureFragment()` uses metrics DB before Canvas2D fallback
- Extraction script at `scripts/extract-font-metrics.mjs` for adding more fonts
- Coverage: Calibri, Calibri Light, Cambria, Arial, Times New Roman, Courier New, Georgia, Segoe UI, Arial Narrow, Palatino Linotype, Bookman Old Style, Century Schoolbook
- Gaps (no OFL replacement): Verdana, Trebuchet MS, Tahoma, Aptos, Corbel/Candara/Constantia

## What's Next

Phase 3 stragglers (remaining):

1. **Progressive render pipeline** — wire capability registry into SlideKit for live progressive loading
2. **Connector routing** — shape-to-shape endpoint resolution via connection sites
3. **Visual test fixtures** — comprehensive test PPTX files + LibreOffice oracle comparison

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
├── core/   @opendockit/core   — OPC, DrawingML, themes, geometry, capability registry, WASM loader
└── pptx/   @opendockit/pptx   — PresentationML parser, slide renderer, SlideKit API
```

## Blockers

None currently.
