# TODO

**Last synced:** 2026-02-23

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

- [ ] **Slide 11 — Bullet number spacing** — Items 1, 2, 3, 4 are badly misspaced vertically. Likely a line spacing or space-before/after inheritance issue on numbered list items.
- [ ] **Slide 13 — Unreadable render + arrow artifacts** — Severely broken output. Arrow shapes have rendering artifacts. Need to investigate shape geometry/path rendering for arrow presets.
- [ ] **Slide 9 — Line spacing** — Vertical spacing between text lines still off even after circular crop fix. Investigate line height calculation for this specific layout.
- [ ] **Slide 46 — Bullets overflow** — Bullet text leaving the slide boundary. Likely a text body inset/margin issue or incorrect text box positioning.
- [ ] **Slide 17 — "Safe Harbor" text spacing** — Text box vertical spacing way off. Investigate body properties, insets, or space-before/after values.
- [ ] **Slide 16 — Left column vertical offset** — Left text column vertical positioning significantly wrong. May be a vertical alignment (anchor) or inset issue.
- [ ] **Page numbers not rendering** — Slide number placeholders (e.g., slide 2 shows "2" in reference but blank in rendered). Likely a placeholder content inheritance gap — sldNum placeholder on master/layout has content but slide doesn't override it, so it renders empty.
- [ ] **Arrow shape artifacts** — Arrow/chevron preset geometries rendering with visual artifacts across multiple slides. Investigate path builder output for arrow-related presets.

### Phase 3.5: Diagnostics & Observability

- [ ] **Structured logging/warning system** — library-wide diagnostic events that apps subscribe to
  - Warning categories: missing font, unsupported element type, partial rendering, fallback used
  - Each warning includes: category, severity (info/warning/error), human-readable message, element context (slide number, shape name/id, XML element type)
  - App-facing callback: `onDiagnostic?: (event: DiagnosticEvent) => void` on SlideKit options
  - Per-presentation summary: "This PPTX uses 3 features we can't fully render: [charts, 3D effects, embedded video]"
  - Existing capability registry already categorizes unsupported elements — wire it into the diagnostic system
  - Font warnings: "Font 'Verdana' not in metrics bundle — using Canvas2D measurement (may affect line breaks)"

## Deferred (Not Blocking)

These are known gaps. They can be tackled opportunistically or when a real-world PPTX hits them hard.

### Connector Routing via Connection Sites

- Connectors render (straight, bent, curved) but endpoints resolve to shape bounding-box edges
- True routing needs a shape position registry that connectors query for connection site coordinates
- Impact: connectors may start/end a few pixels off from where the original places them
- Requires: shape registry built during slide parse, connection site geometry lookup per preset shape

### spAutoFit Text

- `spAutoFit` (shape-auto-fit) is parsed but renders at normal size
- True implementation requires a layout feedback loop (render text -> measure overflow -> resize shape -> re-render)
- `normAutofit` (shrink text to fit) works correctly with fontScale/lnSpcReduction
- Impact: shapes with spAutoFit may clip text or have excess whitespace
- Rare in real-world PPTX files

### Table Row Auto-Height

- OOXML table row heights are minimums — rows should expand to fit content
- Currently rows render at the declared height; text taller than the row overflows visually
- Fix requires: measure cell text content height, expand row to max across cells
- Impact: small-row tables show text overlapping rather than cleanly expanding

### Placeholder Inherited Content

- Slide elements referencing placeholders correctly inherit text defaults, visual properties, and body properties from layout -> master cascade
- Remaining gap: inherited text _content_ — empty slide placeholders don't show layout/master placeholder text
- Impact: slides with intentionally-empty placeholders (expecting to show layout title/subtitle) render blank
- Common in template-heavy presentations

### Text Property Gaps (from XML audit 2026-02-23)

These were found by a property-by-property audit of real-world PPTX XML vs what the parser/renderer handles.

- [x] `<a:buSzPts>` — absolute bullet size (DONE 2026-02-24, sizePoints takes priority over sizePercent)
- [ ] `anchorCtr` — text body anchor-center parsed into IR (`TextBodyPropertiesIR.anchorCenter`) but not consumed by text renderer (MODERATE: horizontally centered text in vertically-anchored shapes may be slightly off)
- [ ] `vert` — text direction attribute (`<a:bodyPr vert="vert270">`) not parsed (MODERATE: vertical/rotated text in East Asian layouts renders horizontal)
- [ ] `marR` — right paragraph margin not parsed (MODERATE: only matters when text approaches right edge of shape)
- [ ] `cap` — capitalization attribute (`<a:rPr cap="all">`) not parsed (LOW: affects few real-world presentations)
- [ ] Space-after not conditionally omitted for last paragraph (LOW: OOXML spec says space-after on the last paragraph in a text body should be ignored; currently always applied; only affects middle/bottom vertical alignment)

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
- [ ] spAutoFit text (shape resize to fit text - needs layout feedback loop)
- [ ] Table row auto-height (rows should expand to fit content text)
- [ ] Media LRU cache size limits (currently unbounded)
- [ ] Absolute bullet size (`<a:buSzPts>`) not parsed — latent bug, see Deferred section
- [ ] Text body `anchorCtr` not consumed by renderer
- [ ] Text direction `vert` attribute not parsed
- [ ] Right paragraph margin `marR` not parsed
- [ ] Capitalization `cap` attribute not parsed
- [ ] Space-after on last paragraph should be omitted per OOXML spec
