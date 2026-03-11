# Known Issues

**Last updated:** 2026-03-10

## Active Bugs (Priority)

### PDF NativeRenderer — Quality (2026-03-10)

**Avg RMSE: 0.069 against pdftoppm ground truth** (USG Briefing, 30 pages). Down from 0.14 — 51% reduction. 24/30 pages FAIR (< 0.08), 6 BAD.

**Fixed this session (13 bugs):** ICC stream color space (#1 — backgrounds decoded as gray), JPEG SMask application, Form XObject state isolation, fillStroke path destruction, image mask fill color, horizontal text scaling (Tz), Type 0 sampled function decode, stitching function recursion, tiling patterns, ImageData Node.js crash, per-character text positioning, ICCBased N=2, browser JPEG crosshatch.

**Open issues:**

| Priority | Issue | Details | Effort |
|----------|-------|---------|--------|
| **Next** | Element-level diffing | Shift from pixel RMSE to structural comparison using evaluator's element DOM vs Poppler ground truth | Medium |
| **P1** | ExtGState SMask | Transparency groups on page 29 — `handleExtGState()` ignores `/SMask` key, requires offscreen compositing | Hard |
| **P2** | Font substitution | Canvas uses system fonts, not PDF embedded fonts. Infrastructure built (FontExtractor + FontRegistrar) but disabled — causes metric regressions on some pages | Medium |
| **P2** | Negative fontSize | Flips text upside-down. `renderGlyph()` unconditionally flips Y | Easy |
| **P3** | CS/cs color space tracking | Operators ignored; colors inferred from component count. Fails for Separation/Lab/CalRGB | Medium |
| **P3** | Separation/DeviceN | Treated as grayscale instead of evaluating tint transform function | Hard |

### Resolved: Bundled Font Loading Broken in Vite Dev Mode (2026-02-27)

- **ALL 42 bundled WOFF2 fonts silently failed to load** — FIXED: `loadBundledFont()` used `import(/* @vite-ignore */ entry.module)` with relative `.js` paths. In Vite dev mode, workspace packages are served from source (`.ts` files), not compiled output (`.js`). The `@vite-ignore` directive bypassed Vite's module resolution, so the browser tried to fetch `.js` files that didn't exist. Every font silently fell back to generic sans-serif.
- **Fix:** Use `new URL(path, import.meta.url).href` to construct correct absolute URLs, and detect Vite dev mode (HTTP protocol) to swap `.js → .ts` extension. Production builds and Node.js continue using compiled `.js` files.
- **Root cause lesson:** Dynamic imports with `@vite-ignore` in workspace packages served via `@fs/` bypass ALL of Vite's module resolution — extension mapping, alias resolution, and transformation. See AGENTS.md "Vite + Workspace Packages" section.

### Resolved: Font Loading Missed Master/Layout Fonts (2026-02-27)

- **Font loading missed master/layout content fonts** — FIXED: `_collectNeededFontFamilies()` only checked theme fonts (majorLatin/minorLatin) and embedded font typefaces. Fonts declared in master/layout XML (e.g. `<a:defRPr>` in `<a:lstStyle>`, `<p:txStyles>`) were never discovered, so the viewer fell back to generic serif/sans-serif. Fix: regex-scan master/layout XML parts for `typeface="..."` attributes at load time. This catches all font references from `<a:latin>`, `<a:ea>`, `<a:cs>`, `<a:sym>`, `<a:buFont>`, etc.

### Resolved: Viewer Edit Mode Bugs (2026-02-27)

- **Grouped element nudge crashes on media resolution** — FIXED: `deriveIR()` for dirty groups now deep-clones children so `_loadSlideMedia()` can mutate `imagePartUri` without hitting `Object.freeze` barriers. Root cause was shallow copy (`{ ...orig }`) leaving children referencing frozen `PictureIR` objects.

- **Pictures not selectable in edit mode** — FIXED: `handleEditClick` used `(element as any).id` to find editable elements, but `.id` only exists on shapes. Pictures use `nonVisualProperties.name`, tables use position-based IDs. Fix: `editModeHitTest` now returns the `editableId` directly from the edit model iteration, eliminating the need to reconstruct composite IDs from kind-specific IR fields.
- **Hit-test regression** — FIXED: Edit mode now uses `editModeHitTest()` that builds element list from `deriveIR()` (current edit model positions) for slide-layer elements, and cached IR for master/layout layers. After edits, clicking at the new position correctly re-selects the moved element.
- **Nudge doesn't update canvas** — FIXED: Root cause was string/number type mismatch in `renderSlideWithOverrides()`. IR elements store `.id` as string (from XML parsing), but the overrides map used numeric keys. `Map.has("42")` when key is `42` (number) always returned false. Fixed by converting with `Number(rawId)` before lookup.
- **E2E test coverage** — DONE: 19 Playwright E2E tests covering click-to-select, nudge (button + keyboard), apply changes, delete, text edit, escape, save PPTX, inspector scan, grouped elements, picture selection. All passing.

## Active Blockers

None.

## Known Gaps

### Connector Routing (cosmetic)

- Connectors render correctly (straight, bent, curved) but endpoints snap to shape bounding-box edges rather than OOXML connection site coordinates
- Visual impact: connector start/end points may be a few pixels off
- Fix requires: shape position registry + connection site geometry lookup per preset shape

### Text Property Gaps (from XML audit)

- `<a:buSzPts>` (absolute bullet size) — parsed (2026-02-24)
- `<a:buSzPct>` (bullet size percentage) — parsing bug fixed (was 100x too small, 2026-02-23)
- Table cell margins (`marL/marR/marT/marB` on `<a:tcPr>`) — now parsed with OOXML defaults (2026-02-23)
- Table cell vertical alignment (`anchor` on `<a:tcPr>`) — now parsed (2026-02-23)
- `anchorCtr` — now consumed by text renderer for horizontal centering (2026-02-24)
- ~~`vert` (text direction)~~ DONE: parsed + rendered via canvas rotation (vert/vert270 full, eaVert/wordArtVert approximated)
- `marR` (right paragraph margin) — now parsed and rendered (2026-02-24)
- `cap` (capitalization) — now parsed with all-caps and small-caps support (2026-02-24)
- Space-after on last paragraph — now correctly omitted per spec (2026-02-24)
- `a:endParaRPr` — now parsed for correct empty paragraph sizing (2026-02-24)
- `a:uFill` — underline fill color parsed and rendered (2026-02-26)
- `a:ln` on `a:rPr` (text outline) — parsed and rendered via strokeText (2026-02-26)
- **Remaining gaps:** `a:effectLst` on `a:rPr` (text shadow/glow/reflection), `numCol`/`spcCol` (multi-column text bodies), underline/strikethrough positioning (geometric heuristic, not OS/2 metrics)

### SmartArt & Charts

- **SmartArt fallback** — DONE (2026-02-25): pre-rendered DrawingML from `dsp:drawing`/`dsp:spTree` parts parsed and rendered. Full layout engine deferred.
- **Chart cached image fallback** — DONE (2026-02-26): follows slide→chart→cached raster image relationship chain. Full ChartML parser deferred to Phase 4.

### Visual Regression Targets (IC CISO deck)

User-flagged issues from visual diff review (2026-02-24):

- ~~**Slide 11** — Numbered bullet items badly misspaced~~ FIXED: table cell margins/alignment (RMSE 0.1586→0.1420)
- ~~**Slide 13** — Severely unreadable render; arrow artifacts~~ FIXED: multi-path geometry rendering
- **Slide 9** — Vertical line spacing (RMSE 0.1627). endParaRPr fix applied but remaining diff is from font metric/engine differences, not layout
- ~~**Slide 46** — Bullet text overflow (RMSE 0.1490)~~ IMPROVED: endParaRPr empty paragraph sizing (RMSE 0.1490→0.1372)
- **Slide 17** — "Safe Harbor" text spacing (RMSE 0.1060). Confirmed: primarily unrendered 3D background image, text positioning is accurate
- ~~**Slide 16** — Left column text vertical offset~~ FIXED: table cell anchor="ctr" vertical alignment (RMSE 0.1014→0.0800)
- ~~**Page numbers** — Not rendering~~ FIXED: placeholder content inheritance from `<a:fld>` elements
- ~~**Arrow shapes** — Rendering artifacts~~ FIXED: `buildPresetPaths()` preserves per-path fill/stroke metadata

### Diagnostic/Warning System — DONE (2026-02-25)

- DiagnosticEmitter + RenderContext wiring + SlideKit `onDiagnostic` callback
- Emissions in: effect-renderer, fill-renderer, picture-renderer, connector-renderer, text-renderer (vert approximation), slide-viewport (missing font)

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
- Text measurement now uses Canvas2D directly (includes kerning/shaping when fonts are loaded). Metrics DB used only for vertical metrics (ascent, descent, line height).
- Line spacing uses the font's declared line height metric (e.g., Barlow lineHeight=1.2), matching PowerPoint's interpretation of "single spacing".

### Table Row Auto-Height — DONE (2026-02-25)

- ~~OOXML table row heights are minimums — rows should expand to fit content text.~~
- Implemented via `measureTextBodyHeight()` + row expansion in table-renderer.
- Multi-row-span cell expansion not yet handled.

### Canvas2D Limitations

- Canvas2D can't do 3D effects, reflections, or advanced filters natively.
- These require CanvasKit (Skia WASM) — deferred to Phase 4+.
- Canvas2D text metrics are imprecise for complex scripts (Arabic, CJK vertical).

### Memory Concerns

- Large PPTX files (100MB+) with embedded media need lazy extraction (implemented via OPC reader).
- WASM modules (CanvasKit ~1.5MB, HarfBuzz ~800KB) should be loaded on demand (implemented via WASM loader).
- Media LRU cache currently unbounded — needs configurable size limits.

## Resolved Issues

### Empty Paragraph Sizing / endParaRPr (resolved 2026-02-24)

- **Root cause**: Empty paragraphs in OOXML have `<a:r><a:rPr/><a:t/></a:r>` (run with empty text and no fontSize) plus `<a:endParaRPr sz="1200"/>`. The empty-text run resolved its font size from textDefaults (18pt) instead of the endParaRPr (12pt), making spacer paragraphs too tall.
- **Fix**: After line building, detect paragraphs where all runs have empty text and override line height using endParaProperties font size.
- Also fixed: `anchorCtr`, `marR`, `cap`, space-after on last paragraph.
- Visual regression: 4 slides improved (41, 43, 46, 50), 0 regressions.

### Text Drift / Vertical Offset (resolved 2026-02-23)

- **Root cause 1**: `ascentPx` calculated as `lineHeight - lineGap` which equals `(ascender + |descender|) / upm * fontSize` — the full glyph extent, not just the ascent. This pushed ALL text down by ~6-10px at typical sizes. Fixed to use `vm.ascender` directly.
- **Root cause 2**: Percentage-based line spacing used `fontSizePt * pct` instead of `fontSizePt * fontLineHeight * pct`. For fonts like Barlow (lineHeight=1.2), this made text ~20% more compact than PowerPoint. Fixed to use font's declared line height metric.
- **Root cause 3**: Field codes (`<a:fld>`) like slide numbers were silently dropped by the paragraph parser. Fixed to parse like regular runs.
- Visual regression: 35 slides improved across the three fixes, 0 net regressions.

### Font String Quoting Bug (resolved 2026-02-18)

- `buildFontString()` wrapped the resolved font name in double quotes, turning CSS fallback stacks like `'Barlow Light', sans-serif` into a single invalid family name `"'Barlow Light', sans-serif"`.
- This broke ALL non-system fonts. Fixed by removing the outer quotes.
- Visual regression: 41/54 slides improved, median RMSE dropped from 0.17 to 0.13.

### Style References (resolved 2026-02-17)

- `a:style` elements with `lnRef`, `fillRef`, `effectRef`, `fontRef` are now resolved against the theme's format scheme.
- Shapes that rely on theme styles render correctly.
