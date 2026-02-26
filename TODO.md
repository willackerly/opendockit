# TODO

**Last synced:** 2026-02-24

## Completed

### Phase 0: Core Foundation

- [x] OPC Package Reader (JSZip, lazy extraction, progress callbacks)
- [x] Content types parser (`[Content_Types].xml`)
- [x] Relationship resolver (`_rels/*.rels`)
- [x] Part URI resolution and normalization
- [x] XML parser wrapper (fast-xml-parser with namespace support)
- [x] OOXML namespace map (all xmlns URIs)
- [x] Common attribute parsing helpers
- [x] EMU, DXA, half-point conversions with exhaustive tests
- [x] IR types (ShapePropertiesIR, FillIR, LineIR, EffectIR, TransformIR, TextBodyIR, etc.)
- [x] Theme parser (theme1.xml -> ThemeIR)
- [x] Color resolver (all 5 types + 13 transforms)
- [x] Font resolver (substitution table + metrics)
- [x] Precomputed font metrics system (42 families, 130 faces, ~750KB bundle)
- [x] Vendored TrueType/CFF parsers from pdfbox-ts for font metric extraction
- [x] Font metrics extraction script (`scripts/extract-font-metrics.mjs`)
- [x] Font metrics for Google Fonts: Lato, Lato Light, Arimo, Comfortaa, Open Sans, Noto Sans Symbols
- [x] Bundled WOFF2 fonts (42 families, ~5MB, 100% offline rendering)
- [x] 5-tier font loading: user-supplied → embedded EOT → bundled WOFF2 → OFL CDN → Google Fonts CDN
- [x] EOT embedded font parser

### Phase 1: DrawingML Pipeline

- [x] Shape properties parser (a:spPr)
- [x] Fill parser (solid, gradient, pattern, picture)
- [x] Line parser (a:ln)
- [x] Effect parser (a:effectLst)
- [x] Transform parser (a:xfrm)
- [x] Text body parser (a:txBody -> paragraphs -> runs)
- [x] Picture parser (pic:pic + a:blipFill)
- [x] Group parser (a:grpSp - recursive)
- [x] Shape guide formula evaluator (16 OOXML operators)
- [x] Preset geometry definitions (187 shapes from Apache POI oracle)
- [x] Path builder (guide results -> canvas paths)
- [x] Shape renderer (geometry + fill + stroke -> Canvas2D)
- [x] Fill renderer (solid, gradient -> Canvas2D)
- [x] Line renderer (stroke, dash, arrows)
- [x] Effect renderer (drop shadow via Canvas2D)
- [x] Text renderer (wrapping, alignment, font size, auto-fit, justify/distributed, character spacing, text body rotation, font-metric line height, ascender baseline)
- [x] Field code parser (a:fld — slide numbers, dates rendered as text runs)
- [x] Picture renderer (drawImage + crop/transforms)
- [x] Group renderer (recursive with save/restore)
- [x] Media cache (lazy image extraction + LRU)
- [x] Table parser + renderer (merged cells, borders, text bodies)

### Phase 2: PPTX Integration

- [x] Presentation parser (presentation.xml -> slide list, dimensions)
- [x] Slide master parser
- [x] Slide layout parser
- [x] Slide parser (shape tree -> flat element list)
- [x] Background renderer (solid, gradient, pattern fills)
- [x] Slide renderer (orchestrate all elements)
- [x] SlideViewport (canvas management, DPI scaling)
- [x] Public API: SlideKit class

### Phase 3: Progressive Fidelity

- [x] Capability registry + render plan generation
- [x] Grey-box fallback with badges
- [x] Coverage report API
- [x] WASM module loader (3-tier cache: memory -> Cache API -> network)
- [x] 187 preset geometries (expanded from 40)
- [x] Auto-fit text (normAutofit with fontScale/lnSpcReduction)
- [x] Connector rendering (straight, bent, curved)
- [x] Table parser + renderer (merged cells, borders)
- [x] Style reference resolution (a:style -> theme formatting via lnRef/fillRef/effectRef/fontRef)
- [x] Dev harness page (load PPTX, render slides, visual comparison)
- [x] Placeholder resolution (master -> layout -> slide property inheritance cascade)
- [x] Hyperlinks (a:hlinkClick -> click handler / URL)
- [x] Notes view (p:notes parsing + getSlideNotes() API)
- [x] Progressive render pipeline (grey-box with hatch + loading indicator, deferred WASM loading, coverage report API)
- [x] Visual regression pipeline (Playwright + ImageMagick RMSE, 54-slide baseline with regression guard, `pnpm test:visual`)

## Next Up

### PRIORITY: IC CISO Deck Visual Fixes (do NOT move off until resolved)

User-flagged issues from visual diff review (2026-02-24). Each must be investigated,
fixed, and verified with RMSE improvement before moving to other work.

- [x] **Slide 11 — Bullet number spacing** — FIXED: Table cell margins (marL/marR/marT/marB) and vertical alignment (anchor) not parsed from `<a:tcPr>`. RMSE 0.1586→0.1420.
- [x] **Slide 13 — Unreadable render + arrow artifacts** — FIXED: Multi-path geometry rendering. Arrow presets now render each sub-path with correct fill mode (norm/darken/lighten/none) and stroke.
- [x] **Slide 9 — Line spacing (RMSE 0.1627)** — CLOSED: endParaRPr fix applied, remaining diff is Canvas2D vs PDF font rendering (antialiasing, kerning). Pixel-level audit confirmed font sizes and layout are correct.
- [x] **Slide 46 — Spacer paragraph sizing** — FIXED: endParaRPr empty paragraph sizing (RMSE 0.1490→0.1372). Also improved slides 41, 43, 50.
- [x] **Slide 17 — "Safe Harbor" text** — CLOSED: confirmed primarily unrendered 3D background image, text positioning is accurate. RMSE 0.1060.
- [x] **Slide 16 — Left column vertical offset** — FIXED: Table cell vertical alignment (anchor="ctr") not parsed from `<a:tcPr>`. RMSE 0.1014→0.0800.
- [x] **Page numbers not rendering** — FIXED: Placeholder content inheritance from master/layout `<a:fld>` elements.
- [x] **Arrow shape artifacts** — FIXED: `buildPresetPaths()` preserves per-path fill/stroke metadata. Shape renderer iterates sub-paths individually.

### Phase 3.5: Diagnostics & Observability

- [x] **Structured logging/warning system** — DiagnosticEmitter + RenderContext wiring + SlideKit callback (2026-02-25)
- [x] **Diagnostic emission expansion** — wired into effect-renderer, fill-renderer, picture-renderer, connector-renderer, slide-viewport (2026-02-25)
- [x] **Vertical text direction** — vert/vert270 via canvas rotation, eaVert/wordArtVert approximated (2026-02-25)
- [x] **RTL text rendering** — alignment mirroring, fragment reversal, bullet positioning (2026-02-25)
- [x] **Tab stops** — explicit tabStops + defaultTabSize + 1-inch fallback grid (2026-02-25)
- [x] **Table row auto-height** — measureTextBodyHeight + row expansion to fit content (2026-02-25)
- [x] **spAutoFit text** — shape height auto-grows to fit text content via measureTextBodyHeight (2026-02-25)
- [x] **Placeholder inherited content** — empty slide placeholders inherit text content from layout/master cascade (2026-02-25)
- [x] **Theme font placeholders** — resolve +mj-lt/+mn-lt/+mn-cs to actual font names via theme (2026-02-25)
- [x] **SmartArt fallback rendering** — parse pre-rendered DrawingML from diagram drawing parts (2026-02-25)

## Deferred (Not Blocking)

These are known gaps. They can be tackled opportunistically or when a real-world PPTX hits them hard.

### Connector Routing via Connection Sites

- Connectors render (straight, bent, curved) but endpoints resolve to shape bounding-box edges
- True routing needs a shape position registry that connectors query for connection site coordinates
- Impact: connectors may start/end a few pixels off from where the original places them
- Requires: shape registry built during slide parse, connection site geometry lookup per preset shape

### Text Property Gaps (from XML audit + code audit 2026-02-24)

Found by property-by-property audit of real-world PPTX XML vs parser/renderer.

**Done:**
- [x] `<a:buSzPts>` — absolute bullet size (2026-02-24)
- [x] `anchorCtr` — text body horizontal centering (2026-02-24)
- [x] `marR` — right paragraph margin (2026-02-24)
- [x] `cap` — capitalization (all-caps + small-caps) (2026-02-24)
- [x] Space-after on last paragraph omitted per spec (2026-02-24)
- [x] `a:endParaRPr` — empty paragraph font sizing (2026-02-24)
- [x] All 16 underline style variants (wavy, dashed, dotted, double, heavy) (2026-02-24)
- [x] Double strikethrough (2026-02-24)
- [x] Highlight background color rendering (2026-02-24)
- [x] LineHeight fallback improved to 1.2 for unknown fonts (2026-02-24)

**Remaining:**
- [x] `vert` — text direction (`<a:bodyPr vert="vert270">`) parsed + rendered via canvas rotation (2026-02-25)
- [x] `rtl` — now consumed by text renderer with alignment mirroring + bullet repositioning (2026-02-25)
- [x] `defTabSz` / `a:tabLst` (tab stops) — parsed + rendered with explicit stops and default grid (2026-02-25)
- [ ] `a:highlight` color — now rendered, but underline color from `<a:uFill>` not yet parsed
- [ ] `a:ln` on `a:rPr` (text outline) — not parsed
- [ ] `a:effectLst` on `a:rPr` (text shadow/glow/reflection) — not parsed
- [ ] `numCol` / `spcCol` on `a:bodyPr` — parsed into IR but not consumed (multi-column text bodies)
- [ ] Underline/strikethrough position — uses geometric heuristic (15%/30% of font size), not OS/2 font metrics

### Visual Regression Ceiling Analysis (2026-02-24)

Deep investigation of top-10 RMSE slides confirms:
- **Font sizes and layout are correct** — pixel-level audit of slide 35 (worst RMSE) shows glyph heights match within 1px
- **Remaining RMSE (0.15-0.19) is dominated by Canvas2D vs PDF font rendering** — antialiasing, kerning, hinting, sub-pixel positioning
- **This is fundamentally a rendering engine ceiling** — addressable via CanvasKit/Skia WASM (Phase 4) for higher-fidelity text
- **pdfbox-ts peer repo** (`/Users/will/dev/pdfbox-ts/`) has reusable: font metric extraction (OS/2 tables), glyph width data, matrix math, CMYK→RGB conversion, text layout word-wrap
- Current metrics bundle is correct (OS/2 sTypoAscender/Descender, USE_TYPO_METRICS verified)

### Broader Visual Test Corpus

- Current: 1 real-world PPTX (54 slides), per-slide RMSE baselines with regression guard
- Want: 5-10 PPTX files covering edge cases (charts, SmartArt, heavy animation, CJK text, RTL, complex tables)
- Want: synthetic fixture PPTX files targeting specific features in isolation

## Planned

### Phase 4: Charts + Export

- [ ] ChartML parser and renderer (bar, pie, line, scatter, combo)
- [ ] CanvasKit WASM integration (3D effects, reflections, advanced filters)
- [ ] Slide transitions (fade, push, wipe, etc.)
- [ ] RenderBackend abstraction + PDF export
- [ ] SVG export
- [ ] SmartArt (dgm:relIds -> diagram layout engine — very complex, may need dedicated WASM)

### Phase 5: DOCX

- [ ] WordprocessingML parser
- [ ] Page layout engine
- [ ] Reuses ~40% of core DrawingML

### Phase 6: XLSX

- [ ] SpreadsheetML parser
- [ ] Grid layout engine
- [ ] Reuses ~35% of core DrawingML

## Font Metrics Gaps

Fonts with no OFL metric-compatible replacement — need server-side extraction or user-supplied metrics:

- [ ] Verdana (no OFL clone — widely available on systems, low priority)
- [ ] Trebuchet MS (no OFL clone — widely available on systems, low priority)
- [ ] Tahoma (no OFL clone — widely available on systems, low priority)
- [ ] Aptos (new Office default — no OFL clone yet)
- [ ] Corbel, Candara, Constantia (C-series Office fonts — no OFL clones)
- [x] Adopt pdf.js lineHeight/lineGap pattern for vertical metrics accuracy
- [ ] Server-side font metrics extraction service (for users with licensed fonts)
- [ ] No kerning pairs in metrics bundle (~1-3% width error on long text runs)

## Code Debt

- [ ] Connector routing via connection sites (deferred - needs shape registry for endpoint lookup)
- [x] spAutoFit text (shape height auto-grows via measureTextBodyHeight — 2026-02-25)
- [x] Table row auto-height (rows expand to fit content text — 2026-02-25)
- [ ] Media LRU cache size limits (currently unbounded)
- [x] Text direction `vert` attribute parsed + rendered (2026-02-25)
