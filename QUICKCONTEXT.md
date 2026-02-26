# Quick Context

**Last updated:** 2026-02-25
**Branch:** main
**Phase:** 3.5 complete — diagnostics, vert text, RTL, tab stops, table auto-height, spAutoFit, placeholder content inheritance all landed

## What Is This?

OpenDocKit is a progressive-fidelity, 100% client-side OOXML renderer. It reads PPTX files (eventually DOCX/XLSX) and renders them in the browser using Canvas2D, with optional WASM modules for advanced features.

## Current State

The full PPTX rendering pipeline is implemented, tested, and visually validated:

- **1,389 tests** passing (1,296 core + 93 pptx), typecheck clean
- **Visual regression**: 54-slide real-world PPTX with per-slide RMSE baselines and regression guard (`pnpm test:visual`). Visual-compare uses bundled WOFF2 fonts (same as production) for accurate comparison.
- **@opendockit/core**: OPC reader, XML parser, unit conversions, IR types, theme engine (colors + fonts + formats), font system with precomputed metrics (42 families, 130 faces) + bundled WOFF2 fonts (42 families, ~5MB, 100% offline), all DrawingML parsers (fill, line, effect, transform, text, picture, group, table, hyperlinks, video placeholder detection, field codes), geometry engine (187 presets + path builder + custom geometry), all Canvas2D renderers (shape, fill, line, effect, text, picture, group, table, connector) with justify/distributed alignment + character spacing + text body rotation + font-metric-based line height + ascender baseline positioning, media cache, capability registry, WASM module loader
- **@opendockit/pptx**: Presentation parser, slide master/layout/slide parsers, background renderer, slide renderer (with placeholder property inheritance + table textDefaults), SlideKit viewport API (hyperlinks, notes)

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

### Visual Regression Pipeline

- Script: `pnpm test:visual` (or `node scripts/visual-compare.mjs`)
- Renders 54-slide PPTX via headless Chromium, compares against PDF reference PNGs using ImageMagick RMSE
- Per-slide baselines with regression guard: fails on RMSE increase > 0.008 threshold
- `--update-baselines` flag to lock in improvements after intentional changes

## What's Next

### Deferred (not blocking — tackle when needed)

1. **Connector routing** — shape-to-shape endpoint resolution via connection sites (current: connectors render but endpoints are edge-of-bounding-box, not snapped to connection site geometry)
2. **Broader visual test corpus** — more PPTX files covering edge cases

### Phase 4: Charts + Export (future)

7. **ChartML** parser and renderer
8. **CanvasKit** WASM integration (3D effects, reflections, advanced filters)
9. **Slide transitions**
10. **PDF export** via RenderBackend abstraction
11. **SVG export**

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
