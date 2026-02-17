# Known Issues

**Last updated:** 2026-02-17

## Active Blockers

None.

## Known Gaps

### Placeholder Inheritance (not yet implemented)

- Slide elements that reference placeholders (idx/type) should inherit text, formatting, and transforms from layout -> master
- Without this, slides relying on master/layout templates will render with missing content
- Tracked in TODO.md "Phase 3 Stragglers"

### Style References (not yet implemented)

- `a:style` elements with `lnRef`, `fillRef`, `effectRef`, `fontRef` are not yet resolved against the theme's format scheme
- Shapes that rely on theme styles will render without formatting
- Tracked in TODO.md "Phase 3 Stragglers"

### spAutoFit Text

- `spAutoFit` (shape-auto-fit) is parsed but renders at normal size
- True implementation requires a layout feedback loop (render text -> measure -> resize shape -> re-render)
- `normAutofit` (shrink text to fit) works correctly with fontScale/lnSpcReduction

## Gotchas & Warnings

### OOXML Spec Complexity

- The OOXML spec (ECMA-376) is thousands of pages. Don't try to implement everything at once.
- DrawingML preset geometries alone define 200+ shapes with a custom formula language (187 implemented).
- PowerPoint's text layout has undocumented behaviors — accept approximate fidelity initially.

### Font Availability

- Users won't have Calibri/Cambria on non-Windows systems.
- Font substitution table is critical for cross-platform rendering.
- Embedded fonts in PPTX are rare but must be handled.

### Canvas2D Limitations

- Canvas2D can't do 3D effects, reflections, or advanced filters natively.
- These require CanvasKit (Skia WASM) — deferred to Phase 4+.
- Canvas2D text metrics are imprecise for complex scripts (Arabic, CJK vertical).

### Memory Concerns

- Large PPTX files (100MB+) with embedded media need lazy extraction.
- WASM modules (CanvasKit ~1.5MB, HarfBuzz ~800KB) should be loaded on demand.
- Media LRU cache needs configurable size limits.

## Resolved Issues

(None yet — no production bugs reported)
