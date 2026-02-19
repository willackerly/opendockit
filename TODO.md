# TODO

**Last synced:** 2026-02-19

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
- [x] Precomputed font metrics system (24 families, 68 faces, 409KB bundle)
- [x] Vendored TrueType/CFF parsers from pdfbox-ts for font metric extraction
- [x] Font metrics extraction script (`scripts/extract-font-metrics.mjs`)
- [x] Font metrics for Google Fonts: Lato, Lato Light, Arimo, Comfortaa, Open Sans, Noto Sans Symbols

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
- [x] Text renderer (wrapping, alignment, font size, auto-fit, justify/distributed, character spacing, text body rotation)
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
- [x] Visual regression pipeline (Playwright + ImageMagick RMSE, 54-slide baseline at median 0.128)

## Next Up

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

### Placeholder Inherited Content

- Slide elements referencing placeholders correctly inherit text defaults, visual properties, and body properties from layout -> master cascade
- Remaining gap: inherited text *content* — empty slide placeholders don't show layout/master placeholder text
- Impact: slides with intentionally-empty placeholders (expecting to show layout title/subtitle) render blank
- Common in template-heavy presentations

### Broader Visual Test Corpus

- Current: 1 real-world PPTX (54 slides), median RMSE 0.128
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
- [ ] Media LRU cache size limits (currently unbounded)
