# Known Issues

**Last updated:** 2026-02-18

## Active Blockers

None.

## Known Gaps

### Placeholder Inheritance (partially implemented)

- Slide elements that reference placeholders inherit text defaults, visual properties, and body properties from layout -> master cascade
- Remaining gaps: inherited text *content* (empty slide placeholders don't show layout/master placeholder text)

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
- Font substitution table maps common Office fonts to system alternatives.
- Precomputed font metrics system (24 families, 68 faces, 409KB bundle) provides accurate text layout without actual fonts installed. `measureFragment()` uses the metrics DB before falling back to Canvas2D measurement.
- Includes Google Fonts used in Slides exports: Barlow, Barlow Light, Play, Roboto Slab, Roboto Slab Light, Roboto Slab SemiBold, Lato, Lato Light, Arimo, Comfortaa, Open Sans, Noto Sans Symbols.
- Gaps remain for Verdana, Trebuchet MS, Tahoma, Aptos, and C-series Office fonts (Corbel, Candara, Constantia) — no OFL metric-compatible replacements exist.
- Font metrics do not include kerning pairs; text width measurement is character-by-character. This can cause line breaks at slightly different positions than the original (~1-3% width error on long text runs).
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

### Font String Quoting Bug (resolved 2026-02-18)

- `buildFontString()` wrapped the resolved font name in double quotes, turning CSS fallback stacks like `'Barlow Light', sans-serif` into a single invalid family name `"'Barlow Light', sans-serif"`.
- This broke ALL non-system fonts. Fixed by removing the outer quotes.
- Visual regression: 41/54 slides improved, median RMSE dropped from 0.17 to 0.13.

### Style References (resolved 2026-02-17)

- `a:style` elements with `lnRef`, `fillRef`, `effectRef`, `fontRef` are now resolved against the theme's format scheme.
- Shapes that rely on theme styles render correctly.
