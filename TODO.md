# TODO

**Last synced:** 2026-02-16

## Phase 0: Core Foundation (Current)

### OPC Layer

- [ ] OPC Package Reader — JSZip wrapper with lazy extraction, progress callbacks
- [ ] Content types parser (`[Content_Types].xml`)
- [ ] Relationship resolver (`_rels/*.rels`)
- [ ] Part URI resolution and normalization

### XML Parsing

- [ ] XML parser wrapper over fast-xml-parser with namespace support
- [ ] OOXML namespace map (all xmlns URIs)
- [ ] Common attribute parsing helpers

### Unit Conversions

- [ ] EMU ↔ px/pt/in/cm conversions
- [ ] DXA (twentieths of a point) conversions
- [ ] Half-point conversions (font sizes)
- [ ] Exhaustive test suite for all conversions

### IR Types

- [ ] ShapePropertiesIR, FillIR, LineIR, EffectIR, TransformIR
- [ ] TextBodyIR, ParagraphIR, RunIR
- [ ] ThemeIR, ColorScheme, FontScheme, FormatScheme
- [ ] Common types: BoundingBox, ResolvedColor, GeometryIR
- [ ] UnsupportedIR with raw XML capture

### Theme Engine

- [ ] Theme parser (theme1.xml → ThemeIR)
- [ ] Color resolver — all 5 color types (srgbClr, schemeClr, sysClr, hslClr, prstClr)
- [ ] Color transforms (lumMod, lumOff, tint, shade, alpha, satMod)
- [ ] Font resolver (scheme fonts → concrete font names)
- [ ] Format resolver (fill/line/effect style resolution)

### Font System

- [ ] Font substitution table (Calibri→Arial, Cambria→Georgia, etc.)
- [ ] FontFace API integration for availability checking
- [ ] Font metrics estimation (width/height)

## Phase 1: DrawingML Pipeline (Upcoming)

### Parsers

- [ ] Shape properties parser (a:spPr)
- [ ] Fill parser (solid, gradient, pattern, picture)
- [ ] Line parser (a:ln)
- [ ] Effect parser (a:effectLst)
- [ ] Transform parser (a:xfrm)
- [ ] Text body parser (a:txBody → paragraphs → runs)
- [ ] Picture parser (pic:pic + a:blipFill)
- [ ] Group parser (a:grpSp — recursive)

### Geometry Engine

- [ ] Shape guide formula evaluator (all operators)
- [ ] Top-40 preset geometry definitions
- [ ] Path builder (guide results → canvas paths)
- [ ] Custom geometry parser (a:custGeom)

### Renderers

- [ ] Shape renderer (geometry + fill + stroke → Canvas2D)
- [ ] Fill renderer (solid, gradient → Canvas2D)
- [ ] Line renderer (stroke, dash, arrows)
- [ ] Effect renderer (drop shadow via Canvas2D)
- [ ] Text renderer (wrapping, alignment, font size)
- [ ] Picture renderer (drawImage + crop/transforms)
- [ ] Group renderer (recursive with save/restore)
- [ ] Media cache (lazy image extraction + LRU)

## Phase 2: PPTX Integration (Planned)

- [ ] Presentation parser (presentation.xml → slide list, dimensions)
- [ ] Slide master parser
- [ ] Slide layout parser
- [ ] Slide parser (shape tree → flat element list)
- [ ] Placeholder resolution (master → layout → slide cascade)
- [ ] Style reference resolution (a:style → theme formatting)
- [ ] Background renderer
- [ ] Slide renderer (orchestrate all elements)
- [ ] Capability registry + render plan generation
- [ ] Grey-box fallback with badges
- [ ] Coverage report API
- [ ] SlideViewport (canvas management, DPI scaling)
- [ ] Slide navigator (prev/next, thumbnails)
- [ ] Public API: SlideKit class

## Phase 3: Progressive Fidelity (Planned)

- [ ] WASM module loader with Cache API + progress
- [ ] Progressive render pipeline (immediate → grey box → spinner → re-render)
- [ ] Table renderer
- [ ] Remaining 160+ preset geometries
- [x] Auto-fit text (normAutofit with fontScale/lnSpcReduction; spAutoFit renders at normal size)
- [x] Connector rendering (straight, bent, curved geometries with line styling and arrowheads)
- [ ] Connector routing via connection sites (shape-to-shape endpoint resolution)
- [ ] Hyperlinks, notes view

## Phase 4: Charts + Export (Planned)

- [ ] ChartML parser and renderer
- [ ] CanvasKit WASM integration
- [ ] Slide transitions
- [ ] RenderBackend abstraction + PDF export
- [ ] SVG export

## Code Debt

(None yet — greenfield)
