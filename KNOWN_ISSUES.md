# Known Issues

**Last updated:** 2026-02-16

## Active Blockers

None — greenfield project, Phase 0 not yet started.

## Gotchas & Warnings

### OOXML Spec Complexity

- The OOXML spec (ECMA-376) is thousands of pages. Don't try to implement everything at once.
- DrawingML preset geometries alone define 200+ shapes with a custom formula language.
- PowerPoint's text layout has undocumented behaviors — accept approximate fidelity initially.

### Font Availability

- Users won't have Calibri/Cambria on non-Windows systems.
- Font substitution table is critical for cross-platform rendering.
- Embedded fonts in PPTX are rare but must be handled.

### Canvas2D Limitations

- Canvas2D can't do 3D effects, reflections, or advanced filters natively.
- These require CanvasKit (Skia WASM) — deferred to Phase 3+.
- Canvas2D text metrics are imprecise for complex scripts (Arabic, CJK vertical).

### Memory Concerns

- Large PPTX files (100MB+) with embedded media need lazy extraction.
- WASM modules (CanvasKit ~1.5MB, HarfBuzz ~800KB) should be loaded on demand.
- Media LRU cache needs configurable size limits.

## Resolved Issues

(None yet)
