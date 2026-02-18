# TODO

**Last synced:** 2026-02-18

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
- [x] Precomputed font metrics system (12 families, 43 faces, 262KB bundle)
- [x] Vendored TrueType/CFF parsers from pdfbox-ts for font metric extraction
- [x] Font metrics extraction script (`scripts/extract-font-metrics.mjs`)

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
- [x] Text renderer (wrapping, alignment, font size, auto-fit)
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

### Phase 3: Progressive Fidelity (partial)

- [x] Capability registry + render plan generation
- [x] Grey-box fallback with badges
- [x] Coverage report API
- [x] WASM module loader (3-tier cache: memory -> Cache API -> network)
- [x] 187 preset geometries (expanded from 40)
- [x] Auto-fit text (normAutofit with fontScale/lnSpcReduction)
- [x] Connector rendering (straight, bent, curved)
- [x] Table parser + renderer (merged cells, borders)

## In Progress

### Phase 3 Stragglers

- [x] Style reference resolution (a:style -> theme formatting via lnRef/fillRef/effectRef/fontRef)
- [x] Dev harness page (load PPTX, render slides, visual comparison)
- [x] Placeholder resolution (master -> layout -> slide property inheritance cascade)
- [ ] Connector routing via connection sites (shape-to-shape endpoint resolution)
- [x] Hyperlinks (a:hlinkClick -> click handler / URL)
- [x] Notes view (p:notes parsing + getSlideNotes() API)
- [x] Progressive render pipeline (grey-box with hatch + loading indicator, deferred WASM loading, coverage report API)

### Visual Validation

- [ ] Test fixture PPTX files covering major element types
- [ ] Side-by-side comparison with LibreOffice oracle

## Planned

### Phase 4: Charts + Export

- [ ] ChartML parser and renderer
- [ ] CanvasKit WASM integration
- [ ] Slide transitions
- [ ] RenderBackend abstraction + PDF export
- [ ] SVG export

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

## Code Debt

- [ ] Connector routing via connection sites (deferred - needs shape registry for endpoint lookup)
- [ ] spAutoFit text (shape resize to fit text - needs layout feedback loop)
