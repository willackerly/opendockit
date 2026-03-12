# TODO

**Last synced:** 2026-03-12

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

### IC CISO Deck Visual Fixes (complete 2026-02-24)

- [x] **Slide 11 — Bullet number spacing** — FIXED: Table cell margins (marL/marR/marT/marB) and vertical alignment (anchor) not parsed from `<a:tcPr>`. RMSE 0.1586→0.1420.
- [x] **Slide 13 — Unreadable render + arrow artifacts** — FIXED: Multi-path geometry rendering. Arrow presets now render each sub-path with correct fill mode (norm/darken/lighten/none) and stroke.
- [x] **Slide 9 — Line spacing (RMSE 0.1627)** — CLOSED: endParaRPr fix applied, remaining diff is Canvas2D vs PDF font rendering (antialiasing, kerning). Pixel-level audit confirmed font sizes and layout are correct.
- [x] **Slide 46 — Spacer paragraph sizing** — FIXED: endParaRPr empty paragraph sizing (RMSE 0.1490→0.1372). Also improved slides 41, 43, 50.
- [x] **Slide 17 — "Safe Harbor" text** — CLOSED: confirmed primarily unrendered 3D background image, text positioning is accurate. RMSE 0.1060.
- [x] **Slide 16 — Left column vertical offset** — FIXED: Table cell vertical alignment (anchor="ctr") not parsed from `<a:tcPr>`. RMSE 0.1014→0.0800.
- [x] **Page numbers not rendering** — FIXED: Placeholder content inheritance from master/layout `<a:fld>` elements.
- [x] **Arrow shape artifacts** — FIXED: `buildPresetPaths()` preserves per-path fill/stroke metadata. Shape renderer iterates sub-paths individually.

### Phase 3.5: Diagnostics & Observability (complete 2026-02-27)

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
- [x] **Chart cached image fallback** — follow relationship chain slide→chart→cached raster image (2026-02-26)
- [x] **Text outline rendering** — `a:ln` on `a:rPr` parsed as LineIR, rendered via strokeText (2026-02-26)
- [x] **Underline fill color** — `a:uFill` on `a:rPr` provides separate underline color from text fill (2026-02-26)
- [x] **Corpus visual regression pipeline** — 10-file self-referential baseline system with `pnpm test:visual:corpus` (2026-02-26)
- [x] **Element inspector** — click-to-highlight in viewer with z-order hit testing, group recursion, tooltip (2026-02-26)
- [x] **Viewer edit mode** — interactive editing in dev harness: click-to-select, move/resize/text/delete, nudge, save PPTX download (2026-02-27)
- [x] **Edit mode perf optimization** — deriveIR + renderSlideWithOverrides for instant single-slide re-render (no save/reload cycle) (2026-02-27)

### Phase Edit: Mutable Object Model (complete 2026-02-27)

- [x] **Phase 0** — Branded EMU types (compile-time unit safety, zero runtime cost) (2026-02-26)
- [x] **Phase 1A** — OPC Package Writer (JSZip-based, unchanged parts as raw bytes) (2026-02-26)
- [x] **Phase 1B** — Flat Edit Model + Dirty Tracking (EditablePresentation, EditTracker with WeakSet) (2026-02-26)
- [x] **Phase 1C** — XML Reconstitution Engine (surgical DOM patching via @xmldom/xmldom) (2026-02-26)
- [x] **Phase 1D** — XML Serializer utility (XmlElement → XML string round-trip) (2026-02-26)
- [x] **Phase 2E** — IR Re-derivation Engine (zero-alloc fast path for clean elements) (2026-02-27)
- [x] **Phase 2F** — EditableSlideKit API (load/edit/save public API) (2026-02-27)
- [x] **Phase 2G** — Round-Trip Test Suite (24 tests: no-op, move, resize, text, delete, reorder, slide delete, multi-edit, fixture, dirty state) (2026-02-27)
- [x] **Phase 3H** — Visual Regression for Edits (6 tests: move/text/delete/resize/no-edit/combined via mock canvas) (2026-02-27)
- [x] **Phase 3I** — pdfbox-ts Cross-Project Alignment (branded Points type, COSUpdateTracker + branded types pattern docs) (2026-02-27)

**Bug fixed during implementation:** `EditablePresentation.getSlideOrder()` wasn't filtering out deleted slides, causing slide deletion to leave stale entries in `<p:sldIdLst>`. Caught by round-trip tests, fixed immediately.

### Viewer Edit Mode — E2E Tests & Bug Fixes (complete 2026-02-26)

- [x] **Hit-test regression** — FIXED: `editModeHitTest()` uses `deriveIR()` for current edit model positions (2026-02-26)
- [x] **Nudge doesn't update canvas** — FIXED: string/number type mismatch in `renderSlideWithOverrides()` (2026-02-26)
- [x] **Playwright E2E tests** — 18 tests: click-to-select, nudge (button+keyboard), apply, delete, text edit, escape, save PPTX, inspector scan, grouped elements (2026-02-26)

## Deferred (Not Blocking)

These are known gaps. They can be tackled opportunistically or when a real-world PPTX hits them hard.

### PDF Export Pipeline Gaps

TRACKED-TASK items from `pdf-slide-renderer.ts`, `pdf-backend.ts`, and `PDFPage.ts`:

- [ ] PDF gradient shading objects for gradient backgrounds (`pdf-slide-renderer.ts:192`)
- [ ] PDF image XObject embedding for picture backgrounds (`pdf-slide-renderer.ts:217`)
- [ ] PDF gradient shading for shape fills (`pdf-slide-renderer.ts:256`)
- [ ] PDF image XObject embedding for shape picture fills (`pdf-slide-renderer.ts:276`)
- [ ] PDF connector line rendering (`pdf-slide-renderer.ts:647`)
- [ ] PDF table rendering (`pdf-slide-renderer.ts:651`)
- [ ] setTransform CTM tracking for PDFBackend (`pdf-backend.ts:747`)
- [ ] Quadratic-to-cubic path conversion accuracy (`pdf-backend.ts:786`)
- [ ] arcTo implementation via tangent circle computation (`pdf-backend.ts:816`)
- [ ] PDF tiling patterns for createPattern (`pdf-backend.ts:1330`)
- [ ] Native scaleAnnotations in PDFPage (`PDFPage.ts:198`)

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
- [x] `vert` — text direction (`<a:bodyPr vert="vert270">`) parsed + rendered via canvas rotation (2026-02-25)
- [x] `rtl` — now consumed by text renderer with alignment mirroring + bullet repositioning (2026-02-25)
- [x] `defTabSz` / `a:tabLst` (tab stops) — parsed + rendered with explicit stops and default grid (2026-02-25)
- [x] `a:uFill` — underline fill color parsed and rendered (2026-02-25)
- [x] `a:ln` on `a:rPr` (text outline) — parsed and rendered via strokeText (2026-02-25)

**Remaining:**
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

### Broader Visual Test Corpus — DONE (2026-02-25)

- ~~Current: 1 real-world PPTX (54 slides)~~
- 10 corpus PPTX files (67 slides) with self-referential regression guard (`pnpm test:visual:corpus`)
- Plus 1 real-world PPTX (54 slides) with PDF-referenced RMSE baselines (`pnpm test:visual`)
- Still want: synthetic fixture PPTX files targeting specific features in isolation

## Strategic Roadmap (Phase 5+)

See **`docs/plans/STRATEGIC_ROADMAP.md`** for the comprehensive plan. Summary:

| Phase | Focus | Key Deliverables |
|-------|-------|-----------------|
| 5A | Tree shaking + bundle | `sideEffects: false`, per-family metrics split, lazy geometry, core ~800KB → ~200KB gzip |
| 5B | Editor core | rbush spatial index, transaction undo/redo, viewport culling |
| 5C | Lossless round-trip | PDF/A-3 attachment embedding (original PPTX inside exported PDF) |
| 5.5 | Font innovation | Variable fonts, hb-subset WASM, metrics compression, unified resolver |
| 6 | In-canvas editing | OffscreenCanvas worker, IME text editing, CanvasKit/WebGPU backend |
| 7 | Cross-format save | Incremental PDF save, PageElement → OOXML synthesis, feature registry |
| 8 | Collaboration + AI | CRDT editing (Yjs), local VLM document understanding |

## Planned

### Phase 4: Charts + Export

**Complete (Waves 0-4 — 2026-03-07/08):**
- [x] RenderBackend abstraction (CanvasBackend — 2026-03-07)
- [x] PDF export pipeline basic shapes/fills (2026-03-07)
- [x] Unified element model: @opendockit/elements (2026-03-07)
- [x] Unified render utilities: @opendockit/render (2026-03-07)
- [x] PDF rendering package: @opendockit/pdf (2026-03-07)
- [x] Cross-format text search (2026-03-08)
- [x] Clipboard serialize/deserialize (2026-03-08)
- [x] Batch PPTX→PDF conversion script (2026-03-08)
- [x] Unified viewer (PPTX + PDF format detection) (2026-03-08)
- [x] PDF font embedding for PPTX→PDF export (standard font fallback: Helvetica/Times-Roman/Courier) with text rendering in content streams (2026-03-08)
- [x] PDF custom TrueType font embedding — 42 bundled font families embedded as Type0/CIDFontType2 with Identity-H encoding, font subsetting (only used glyphs), per-glyph advance widths for accurate text measurement (2026-03-08)
- [x] FontMetricsDB deduplication — render package re-exports from core (no diverged copy) (2026-03-08)
- [x] TTF font bundle pipeline — `pnpm fonts:ttf` generates raw TTF modules for PDF embedding (2026-03-08)

**Still deferred:**
- [ ] CanvasKit WASM integration (3D effects, reflections, advanced filters)
- [ ] Slide transitions (fade, push, wipe, etc.)
- [ ] SVG export

### Permanently Deferred

- ~~Full ChartML parser and renderer~~ — cached image fallback renders chart previews. Not worth the complexity. (2026-03-08)

### Phase 5: DOCX

- [x] WordprocessingML parser (document/paragraph/run/styles/numbering/section) — 129 tests
- [x] Page layout engine scaffold — greedy word-boundary line breaking, section geometry, page breaks (2026-03-11)
- [ ] Full page layout engine — floats, tables, columns, headers/footers, footnotes
- [ ] Reuses ~40% of core DrawingML

### Phase 6: XLSX

- [ ] SpreadsheetML parser
- [ ] Grid layout engine
- [ ] Reuses ~35% of core DrawingML

## Font Metrics Gaps

Fonts with no OFL metric-compatible replacement — need server-side extraction or user-supplied metrics:

- [x] Verdana → `'DejaVu Sans', Arial, sans-serif` substitution (2026-03-08)
- [x] Trebuchet MS → `Ubuntu, sans-serif` substitution (2026-03-08)
- [ ] Tahoma (no OFL clone — widely available on systems, low priority)
- [x] Aptos → `'Noto Sans', sans-serif` substitution (Office 2024 default) (2026-03-08)
- [x] Corbel → `'Source Sans Pro', sans-serif`, Candara → `Raleway`, Constantia → `'TeX Gyre Pagella'` (2026-03-08)
- [x] Adopt pdf.js lineHeight/lineGap pattern for vertical metrics accuracy
- [ ] Server-side font metrics extraction service (for users with licensed fonts)
- [ ] No kerning pairs in metrics bundle (~1-3% width error on long text runs)

### NativeRenderer (PDF Reading) — Active Focus

**Current state:** Pixel RMSE **0.042** against pdftoppm on USG Briefing (30 pages). Down from 0.14 — **70% reduction**. Structural: **97% text accuracy, 4.4pt avg position delta** via Canvas Tree Recorder trace pipeline. Remaining RMSE dominated by cross-engine inherent differences (JPEG decoder, text anti-aliasing FreeType vs Cairo).

**Done (2026-03-08):**
- [x] Fix curveTo2 (v operator) — correct bezierCurveTo with current point tracking
- [x] Shading pattern support — linear (Type 2) and radial (Type 3) gradients
- [x] JPEG image rendering — sync decode via node-canvas
- [x] Inline image support (BI/ID/EI operators)
- [x] CropBox page clipping (fallback to MediaBox)
- [x] Indexed color space decoding (palette-based images)
- [x] Shading function decoding (Type 2 exponential, Type 3 stitching)

**Done (2026-03-10):**
- [x] ICCBased COSStream fix — getDictionary().getInt('N') for ICC profile component count
- [x] ICCBased N=2 handler — 2-component ICC profiles decoded to grayscale
- [x] Sub-byte bpc fix — bit-level extraction for bpc=2 and bpc=4 in decodeGrayImage/extractSMask
- [x] Node.js ImageData fix — `ctx.createImageData()` instead of browser-only `new ImageData()`
- [x] Per-character text rendering — each glyph positioned by PDF-specified widths (was single fillText batch)
- [x] Browser JPEG ImageBitmap — store bitmap directly, skip lossy RGBA round-trip
- [x] PDF comparison harness — vitest-based RMSE comparison against pdftoppm with HTML report
- [x] Form XObject state isolation — `this.save()`/`this.restore()` in paintFormBegin/End
- [x] fillStroke path fix — `fillStrokePath()` defers `consumeClip()` until after both fill and stroke
- [x] Image mask fill color — `decodeImageMask()` uses current fill color per PDF spec (not hardcoded black)
- [x] Horizontal text scaling (Tz) — `renderGlyph()` applies `ctx.scale(hScale, 1)`
- [x] JPEG SMask application — `paintImage()` applies soft mask alpha to JPEG/bitmap images
- [x] ICC stream color space — `resolveColorSpace()` handles direct COSStream refs to ICC profiles (**#1 bug** — backgrounds decoded as gray instead of RGB)
- [x] Type 0 sampled function decode — proper sample table interpolation (was black-to-white stub)
- [x] Stitching function recursion — Type 3 now recurses into Type 0/3 sub-functions (was grey fallback)
- [x] Tiling pattern implementation — PatternType 1 colored tiling via offscreen canvas + `ctx.createPattern()`
- [x] Font extraction infrastructure — FontExtractor + FontRegistrar with fonttools patching (disabled pending metric tuning)

**Element-Level Structural Diffing (complete 2026-03-11)**

Shift from pixel RMSE to structured comparison. The evaluator emits TextElement/ShapeElement/ImageElement — compare against Poppler ground truth for actionable per-element scoring.

- [x] Build `pdftotext -bbox-layout` ground truth extractor (text positions, font sizes, content) — `ground-truth-extractor.ts` (10 tests)
- [x] Build element-level diff engine (match our elements to ground truth by position/content) — `element-matcher.ts` (42 tests)
- [x] Per-element scoring: text position accuracy, content correctness, font size match
- [x] HTML diff report with element-level annotations
- [x] Integration test harness — `element-diff-harness.test.ts` (3 tests)
- [x] Coordinate tuning — 97% text accuracy, 4.4pt avg position delta (via Canvas Tree Recorder trace pipeline)
- [ ] Integrate as `pnpm test:visual:pdf:elements` alongside pixel RMSE

**Canvas Tree Recorder (Phase 1+2 complete — see `docs/plans/CANVAS_TREE_PLAN.md`)**

Instrument canvas-graphics.ts to emit TraceEvent[] (same format as PPTX TracingBackend). Enables structural comparison of every canvas operation — per-character font, size, position, color.

- [x] Phase 1: CanvasTreeRecorder class + canvas-graphics.ts instrumentation + NativeRenderer wiring (2026-03-11)
- [x] Phase 2: Trace pipeline — traceToFlatRuns → groupGlyphsIntoWords → matchTextElements → ground truth comparison (2026-03-11)
  - 97% text accuracy, 4.4pt avg position delta (up from 8.2% / 29.7pt)
  - Key discoveries: page-level `cm` scaling, space-character word delimiters, font ascent from FontDescriptor
- [ ] Phase 3: Cross-format comparison (PPTX TracingBackend vs PDF CanvasTreeRecorder)
- [ ] Phase 4: Diagnostic HTML report with font/position/color mismatch visualization

**Rendering accuracy improvements (2026-03-11):**
- [x] Font size clamping [16, 100]px with fontSizeScale compensation (pdf.js pattern)
- [x] Per-character remeasure system — ctx.measureText() correction when >5% width difference
- [x] Actual glyph widths from PDF font metrics (was 0.6×fontSize fallback)
- [x] Font ascent from FontDescriptor /Ascent (handles Type0/composite fonts)

**Done (2026-03-12):**
- [x] Pure-TS font patcher — cmap rebuild, OS/2 synthesis, CFF→OTF wrapping; replaces python3/fonttools (2026-03-12)
- [x] FontDescriptor-based deterministic font weight/style — reads `/FontWeight`, `/Flags`, `/ItalicAngle` (2026-03-12)
- [x] CSS font weight from family name suffixes — "Barlow Light" → weight 300 (2026-03-12)
- [x] Font fallback alerting — loud console.warn for every substitution/fallback (2026-03-12)
- [x] ExtGState SMask transparency groups — offscreen compositing, Luminosity + Alpha subtypes (2026-03-12)
- [x] Image interpolation control — respects PDF `/Interpolate` flag, sets `imageSmoothingEnabled` (2026-03-12)
- [x] Inline JPEG rendering — inline images with DCTDecode were silently dropped (2026-03-12)
- [x] Cross-format element coordinate normalization — Y-flip, color scaling, font family normalization (2026-03-12)

**Remaining pixel-level issues (lower priority):**
- [x] Negative fontSize — `renderGlyph()` skips Y-flip for negative fontSize (2026-03-11)
- [x] CS/cs color space tracking — evaluator tracks fill/stroke color space from CS/cs operators (2026-03-11)
- [ ] Separation/DeviceN tint transform evaluation (Hard)
- [ ] Font registration metric alignment (infra built, disabled — causes regressions on some pages)

**Tools consolidation:**
- [ ] Unify diagnostic/comparison scripts (check-fonts, diagnose-fonts, diagnose-slide, measure-line-heights)
- [ ] Streamline SBS viewer and comparison infrastructure

### Font Delivery Redesign (offline-first) — see `docs/plans/FONT_DELIVERY_EXECUTION.md`

Core npm drops from 18MB → ~800KB. Fonts become optional companion package + CDN.

- [x] Phase 1: Create `@opendockit/fonts` companion package (scaffold, generate-font-package.py, registerOfflineFonts API, 8 tests) (2026-03-11)
- [x] Phase 2: Add `FontResolver` to core (unified resolution pipeline, CDN fetcher, font cache, FontConfig types, SUBSTITUTION_REGISTRY — 37 tests) (2026-03-11)
- [x] Phase 2b: Wire FontResolver into SlideKit as opt-in `fontConfig` option, re-export `FontConfig` type (2026-03-11)
- [x] Phase 3: Remove base64 WOFF2/TTF from core (17MB deleted, bundled-font-loader/ttf-loader delegate to companion via dynamic import) (2026-03-11)
- [x] Phase 3b: Generate actual font files (`scripts/generate-font-package.py` → populate companion with real WOFF2/TTF) (2026-03-11)
- [ ] Phase 4: CDN fallback polish (timeouts, retry, progress events, remove hardcoded Google Fonts allowlist)
- [ ] Phase 5: harfbuzzjs PDF subsetting (lazy WASM, subset to used glyphs only)

### pdfbox-ts Integration Items (FYI from prior team)

- [x] pdf-signer-web integration — migrated from pdfbox-ts to @opendockit/pdf-signer (2026-03-11)
- [ ] Publish @opendockit/pdf-signer 1.0 to npm
- [ ] CI parity gate — automated Java vs TS comparison in CI

## Code Debt

- [ ] Connector routing via connection sites (deferred - needs shape registry for endpoint lookup)
- [x] spAutoFit text (shape height auto-grows via measureTextBodyHeight — 2026-02-25)
- [x] Table row auto-height (rows expand to fit content text — 2026-02-25)
- [ ] Media LRU cache size limits (currently unbounded)
- [x] Text direction `vert` attribute parsed + rendered (2026-02-25)
- [x] WOFF2->TTF decoding for custom font embedding in PDF export — FIXED: TTF bundles generated alongside WOFF2 bundles, loaded via ttf-loader.ts for PDF embedding (2026-03-08)
- [ ] Full PNG decode for PDF image export (IDAT extraction + alpha SMask) — currently embeds raw PNG with FlateDecode; proper decode would extract RGB pixels and create separate SMask for transparency

## OffscreenCanvas Worker

- [x] Worker protocol types (`render-protocol.ts`) — typed MainToWorkerMessage / WorkerToMainMessage unions
- [x] Worker entry point scaffold (`render-worker.ts`) — receives OffscreenCanvas, basic scale+background render loop
- [x] WorkerOrchestrator (`worker-orchestrator.ts`) — main-thread controller: init, requestRender, resize, dispose
- [x] Full element rendering in worker — renderSlide() pipeline wired into worker with CanvasBackend, MediaCache, theme/colorMap support
- [ ] SlideViewport integration — wire `useWorker` option in SlideKit to use WorkerOrchestrator instead of main-thread render
