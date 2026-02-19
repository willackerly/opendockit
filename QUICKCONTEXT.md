# Quick Context

**Last updated:** 2026-02-19
**Branch:** main
**Phase:** 3 complete — moving to Phase 3.5 (diagnostics) then Phase 4

## What Is This?

OpenDocKit is a progressive-fidelity, 100% client-side OOXML renderer. It reads PPTX files (eventually DOCX/XLSX) and renders them in the browser using Canvas2D, with optional WASM modules for advanced features.

## Current State

The full PPTX rendering pipeline is implemented, tested, and visually validated:

- **1,290 tests** passing (1,208 core + 82 pptx), typecheck clean, lint clean
- **Visual regression**: 54-slide real-world PPTX, median RMSE 0.128 vs LibreOffice reference
- **@opendockit/core**: OPC reader, XML parser, unit conversions, IR types, theme engine (colors + fonts + formats), font system with precomputed metrics (24 families, 68 faces), all DrawingML parsers (fill, line, effect, transform, text, picture, group, table, hyperlinks), geometry engine (187 presets + path builder + custom geometry), all Canvas2D renderers (shape, fill, line, effect, text, picture, group, table, connector) with justify/distributed alignment + character spacing + text body rotation, media cache, capability registry, WASM module loader
- **@opendockit/pptx**: Presentation parser, slide master/layout/slide parsers, background renderer, slide renderer (with placeholder property inheritance), SlideKit viewport API (hyperlinks, notes)

### Font Metrics System

Precomputed font metrics from OFL fonts for accurate text layout without actual fonts installed:

- **24 families, 68 faces** in 409KB bundle (auto-loaded by SlideKit)
- Vendored TrueType/CFF parsers from pdfbox-ts for extraction
- `measureFragment()` uses metrics DB before Canvas2D fallback
- Extraction script at `scripts/extract-font-metrics.mjs` for adding more fonts
- Coverage: Calibri, Calibri Light, Cambria, Arial, Times New Roman, Courier New, Georgia, Segoe UI, Arial Narrow, Palatino Linotype, Bookman Old Style, Century Schoolbook, Barlow, Barlow Light, Roboto Slab, Roboto Slab Light, Roboto Slab SemiBold, Play, Lato, Lato Light, Arimo, Comfortaa, Open Sans, Noto Sans Symbols
- Gaps (no OFL replacement): Verdana, Trebuchet MS, Tahoma, Aptos, Corbel/Candara/Constantia

### Visual Regression Pipeline

- Script: `scripts/visual-compare.mjs` — Playwright + ImageMagick RMSE comparison
- Reference oracle: LibreOffice PDF export at 960x540
- Baselines: 54 slides with per-slide RMSE values (3-decimal precision)
- Results directory: `../pptx-pdf-comparisons/comparison-output/`

## What's Next

### Phase 3.5: Diagnostics & Observability (next up)

1. **Structured logging/warning system** — library-wide diagnostic messages that consuming apps can subscribe to. Warnings for unsupported features in the current PPTX (missing fonts, unimplemented elements, partial rendering). App decides how to display: console, toast/dismiss UI, diagnostic panel, etc.

### Deferred (not blocking — tackle when needed)

2. **Connector routing** — shape-to-shape endpoint resolution via connection sites (current: connectors render but endpoints are edge-of-bounding-box, not snapped to connection site geometry)
3. **spAutoFit text** — shape resize to fit text (current: parsed but renders at normal size; needs layout feedback loop)
4. **Placeholder inherited content** — empty slide placeholders don't show layout/master placeholder text (properties already inherit correctly)
5. **Broader visual test corpus** — more PPTX files covering edge cases

### Phase 4: Charts + Export (future)

6. **ChartML** parser and renderer
7. **CanvasKit** WASM integration (3D effects, reflections, advanced filters)
8. **Slide transitions**
9. **PDF export** via RenderBackend abstraction
10. **SVG export**

## Key Architecture Decisions

1. **No LibreOffice WASM** — too monolithic. Use as CI reference oracle only.
2. **TS envelope owns everything** — parsing, orchestration, simple rendering
3. **WASM modules are leaf-node accelerators** — CanvasKit, HarfBuzz, loaded on demand
4. **Shared DrawingML core** — ~40% of code shared across PPTX/DOCX/XLSX
5. **IR is serializable JSON** — not a file format, but cacheable and transferable
6. **Canvas2D primary renderer** — PDF/SVG backends added later via RenderBackend interface
7. **Capability registry** — routes elements to renderers, categorizes unsupported features

## Packages

```
packages/
├── core/   @opendockit/core   — OPC, DrawingML, themes, geometry, capability registry, WASM loader
└── pptx/   @opendockit/pptx   — PresentationML parser, slide renderer, SlideKit API
```

## Blockers

None currently.
