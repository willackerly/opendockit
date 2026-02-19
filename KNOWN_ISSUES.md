# Known Issues

**Last updated:** 2026-02-19

## Active Blockers

None.

## Known Gaps

### Connector Routing (cosmetic)

- Connectors render correctly (straight, bent, curved) but endpoints snap to shape bounding-box edges rather than OOXML connection site coordinates
- Visual impact: connector start/end points may be a few pixels off
- Fix requires: shape position registry + connection site geometry lookup per preset shape

### spAutoFit Text (rare)

- `spAutoFit` (shape-auto-fit) is parsed but renders at normal size
- True implementation requires a layout feedback loop (render text -> measure -> resize shape -> re-render)
- `normAutofit` (shrink text to fit) works correctly with fontScale/lnSpcReduction

### Placeholder Inherited Content (moderate)

- Slide elements referencing placeholders inherit text defaults, visual properties, and body properties from layout -> master cascade
- Remaining gap: inherited text _content_ (empty slide placeholders don't show layout/master placeholder text)

### No Diagnostic/Warning System (next priority)

- Library silently falls back when features are unsupported (missing fonts, unknown elements)
- No way for consuming apps to know what the current PPTX needs that we can't render
- The capability registry already categorizes unsupported elements — needs to be wired into an app-facing event system

## Gotchas & Warnings

### OOXML Spec Complexity

- The OOXML spec (ECMA-376) is thousands of pages. Don't try to implement everything at once.
- DrawingML preset geometries alone define 200+ shapes with a custom formula language (187 implemented).
- PowerPoint's text layout has undocumented behaviors — accept approximate fidelity initially.

### Font Availability

- Users won't have Calibri/Cambria on non-Windows systems.
- Font substitution table maps common Office fonts to system alternatives.
- **42 families, 130 faces** in ~750KB metrics bundle + ~5MB bundled WOFF2 fonts (100% offline).
- 5-tier font loading: user-supplied → PPTX embedded (EOT) → bundled WOFF2 → OFL CDN → Google Fonts CDN.
- Gaps remain for Verdana, Trebuchet MS, Tahoma, Aptos, and C-series Office fonts (Corbel, Candara, Constantia) — no OFL metric-compatible replacements exist.
- Font metrics do not include kerning pairs; text width measurement is character-by-character (~1-3% width error on long text runs).

### Table Row Auto-Height (cosmetic)

- OOXML table row heights are minimums — rows should expand to fit content text.
- Currently rows render at the declared height; text that is taller than the row overflows visually.
- Impact: small-row tables show text overlapping rather than expanding.

### Canvas2D Limitations

- Canvas2D can't do 3D effects, reflections, or advanced filters natively.
- These require CanvasKit (Skia WASM) — deferred to Phase 4+.
- Canvas2D text metrics are imprecise for complex scripts (Arabic, CJK vertical).

### Memory Concerns

- Large PPTX files (100MB+) with embedded media need lazy extraction (implemented via OPC reader).
- WASM modules (CanvasKit ~1.5MB, HarfBuzz ~800KB) should be loaded on demand (implemented via WASM loader).
- Media LRU cache currently unbounded — needs configurable size limits.

## Resolved Issues

### Font String Quoting Bug (resolved 2026-02-18)

- `buildFontString()` wrapped the resolved font name in double quotes, turning CSS fallback stacks like `'Barlow Light', sans-serif` into a single invalid family name `"'Barlow Light', sans-serif"`.
- This broke ALL non-system fonts. Fixed by removing the outer quotes.
- Visual regression: 41/54 slides improved, median RMSE dropped from 0.17 to 0.13.

### Style References (resolved 2026-02-17)

- `a:style` elements with `lnRef`, `fillRef`, `effectRef`, `fontRef` are now resolved against the theme's format scheme.
- Shapes that rely on theme styles render correctly.
