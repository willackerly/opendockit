# Strangler Fig: Native PDF Rendering

## The Two Paths

### Path A: Merge toward PDF.js
Keep PDF.js as the rendering engine. pdfbox-ts becomes a signing/editing layer on top.

**How it works:**
1. Build an adapter: COSDictionary → PDF.js Dict, ObjectResolver → PDF.js XRef
2. Feed our in-memory COS objects to PDF.js's PartialEvaluator
3. PartialEvaluator produces OperatorList → CanvasGraphics renders

**Pros:**
- PDF.js has 14 years of battle-tested rendering edge cases
- Color spaces, transparency groups, Type3 fonts — all handled
- Large community maintaining it (Mozilla)

**Cons:**
- PDF.js is architecturally read-only — deeply coupled to its own XRef, Lexer, Dict, Ref types
- The adapter surface is HUGE: every Dict.get() auto-deferences Refs via XRef; we'd need to shim the entire object resolution protocol
- PartialEvaluator has 5438 lines of tight coupling to PDF.js internals (CMapFactory, Font, Image classes)
- Permanent runtime dep: ~850KB min, can never shed it
- Two object models in memory (ours + PDF.js's wrapped versions)
- When we modify a COSDictionary (redaction, annotation), we need to invalidate/rebuild the PDF.js adapter — complex cache coherence
- We're locked to PDF.js release cycle; breaking changes propagate

**Verdict:** This is a wrapper, not a merger. We'd have two parsers, two object models, and a complex adapter layer. The coupling surface is so large that it's harder than just porting the renderer.

### Path B: Merge toward pdfbox-ts (Strangler Fig) ← RECOMMENDED
Gradually build our own rendering pipeline, reusing our existing infrastructure. Initially delegate to PDF.js's CanvasGraphics, then replace it too.

**How it works:**
1. Build a native Evaluator: CSOperation[] → OperatorList (fnArray/argsArray)
2. Initially hand the OperatorList to PDF.js's CanvasGraphics for rendering
3. Gradually replace CanvasGraphics with our own canvas dispatcher
4. Eventually delete PDF.js entirely

**Pros:**
- Single parse, single object model — edit a COSDictionary and re-render instantly
- Bundle shrinks over time (PDF.js parts deleted as we replace them)
- Full control — no dependency on Mozilla's release cycle
- The hard parsing/fonts/images infrastructure already exists in pdfbox-ts
- OperatorList is a clean, simple contract (two parallel arrays) — easy to produce
- End state: unified edit+render library, ~1MB total, zero external deps

**Cons:**
- More upfront work than Path A
- Edge cases in rendering (transparency groups, exotic color spaces) take time
- We lose PDF.js's 14 years of bug fixes — but we gain full control

**Verdict:** This is the same playbook that killed pdf-lib. Phased, incremental, value at every step.

---

## Architecture: The OperatorList Contract

PDF.js's rendering has a clean split:

```
[Evaluator]  →  OperatorList  →  [CanvasGraphics]
 (complex)     fnArray[]          (simple dispatch)
               argsArray[]        this[fnId](i, ...args)
```

OperatorList is just two parallel arrays:
- `fnArray[i]` = integer OPS constant (e.g., 10=save, 12=transform, 44=showText)
- `argsArray[i]` = argument array for that op

CanvasGraphics dispatches via `this[fnId](i, ...args)` — pure integer method lookup.

**Our strategy**: Build a native Evaluator that produces this same format. Phase 1 reuses PDF.js's CanvasGraphics to render it. Later phases replace CanvasGraphics too.

---

## What pdfbox-ts Already Has (reusable for rendering)

| Component | Status | Reuse |
|-----------|--------|-------|
| Content stream tokenizer | ✅ Complete | Direct — `tokenizeContentStream()` |
| Content stream parser | ✅ Complete | Direct — `parseOperations()` → `CSOperation[]` |
| Graphics state stack | ✅ Complete | Extend — save/restore, CTM, text state all tracked |
| Text state machine | ✅ Complete | Direct — Tf, Tc, Tw, Tz, TL, Ts, Tr, Tm, Td, TD, T* |
| Font resolution | ✅ Complete | Direct — `lookupFont()` + `buildFontDecoder()` |
| Font metrics | ✅ Complete | Direct — StandardFontMetrics (14 fonts, glyph widths) |
| TrueType parser | ✅ Complete | Extend — has tables, needs glyph width extraction for embedded fonts |
| CMap parser | ✅ Complete | Direct — ToUnicode mapping |
| Matrix math | ✅ Complete | Direct — `multiplyMatrices()`, `transformPoint()` |
| Stream decompression | ✅ Complete | Direct — FlateDecode, DCT, JPX, ASCII85, ASCIIHex |
| Image parsing | ✅ Complete | Direct — PNG/JPEG header + raw data |
| Page tree traversal | ✅ Complete | Direct — inherited resources, MediaBox |
| Object resolution | ✅ Complete | Direct — ObjectResolver with xref offset |
| Color types | ✅ Partial | Extend — RGB/CMYK/Gray exist; need color space conversion |

**Gap analysis**: The main missing piece is the Evaluator itself (translate CSOperations → OperatorList) and ultimately the canvas dispatch. Font glyph rendering and color space conversion are secondary gaps.

---

## Phased Plan

### Phase 0: Black-box wrapper ✅ DONE
- `PDFRenderer` wraps PDF.js as opaque renderer
- `PDFDocument.renderPage()` does save→re-parse→render
- 15 tests pass, API works

### Phase 1: Native Evaluator → PDF.js CanvasGraphics
**Goal**: Eliminate the save→re-parse round-trip. Produce OperatorList from our COS objects.

**What we build:**
- `src/render/evaluator.ts` — Takes a page's COSDictionary + ObjectResolver, walks the content stream, produces OperatorList
- `src/render/ops.ts` — OPS constants (mirroring PDF.js's integer enum)
- `src/render/operator-list.ts` — Simple fnArray/argsArray container
- `src/render/font-resolver.ts` — Resolves /Font references to font objects that CanvasGraphics understands

**Operator mapping** (our CSOperation.operator → OPS integer):
```
'q' → OPS.save(10)      'Q' → OPS.restore(11)
'cm' → OPS.transform(12) 'm' → OPS.moveTo(13)
'l' → OPS.lineTo(14)     'c' → OPS.curveTo(15)
'h' → OPS.closePath(18)  're' → OPS.rectangle(19)
'S' → OPS.stroke(20)     'f'/'F' → OPS.fill(22)
'BT' → OPS.beginText(31) 'ET' → OPS.endText(32)
'Tf' → OPS.setFont(37)   'Tj' → OPS.showText(44)
'rg' → OPS.setFillRGBColor(59)  'Do' → OPS.paintXObject(66)
... (~50 operators total)
```

**The tricky parts:**
- Font handling: CanvasGraphics expects font objects with `.loadedName`, `.disableFontFace`, width tables. We need to adapt our FontDecoder output.
- Image handling: CanvasGraphics expects image objects registered in `objs` pool by ID. We need to decode images and register them.
- Color spaces: Our evaluator converts non-RGB to RGB hex before emitting setFillRGBColor (same simplification PDF.js's evaluator does).

**Result**: `PDFRenderer` renders from in-memory COS objects. No save(). No re-parse. Edit → render instantly.

**Tests**: Render comparison (native evaluator vs current PDF.js-parsed) — pixel diff should be < 1%.

### Phase 2: Native Color Space Engine
**Goal**: Handle color spaces without PDF.js.

- `src/render/colorspace.ts` — DeviceGray, DeviceRGB, DeviceCMYK, CalGray, CalRGB, ICCBased (sRGB fast path)
- Convert to RGB hex at evaluation time (same as PDF.js's evaluator does)
- Most PDFs use DeviceRGB/Gray/CMYK — covers 95% of real-world files

### Phase 3: Native Image Pipeline
**Goal**: Decode images without PDF.js.

- JPEG: pass through to canvas (it natively decodes JPEG)
- PNG: decode via our existing parser → ImageData → canvas.drawImage
- Inline images: decode from content stream
- SMask (alpha): composite with main image

### Phase 4: Native Canvas Renderer
**Goal**: Replace PDF.js's CanvasGraphics with our own.

- `src/render/canvas-graphics.ts` — ~40 operator methods mapping to Canvas 2D API
- Core operators (save/restore/transform/path/fill/stroke/text/image): ~800 lines
- Graphics state class: CTM, colors, line style, text state, font
- This is mostly mechanical — each OPS constant maps to 1-5 Canvas 2D API calls

**What's simple** (direct canvas mapping):
- save/restore → ctx.save()/restore()
- transform → ctx.transform(a,b,c,d,e,f)
- moveTo/lineTo/curveTo → ctx.moveTo()/lineTo()/bezierCurveTo()
- fill/stroke → ctx.fill()/stroke()
- rectangle → ctx.rect()
- setFillRGBColor → ctx.fillStyle = color
- clip → ctx.clip()

**What's moderate** (needs state management):
- showText — font metrics, glyph positioning, text matrix
- paintImageXObject — image decode + drawImage with transform
- setFont — font loading, CSS font-face or node-canvas font registration

**What's hard** (defer to Phase 5):
- Transparency groups / blend modes
- Soft masks (SMask)
- Tiling patterns / shadings
- Type3 fonts

### Phase 5: Advanced Rendering
**Goal**: Handle the long tail of PDF rendering edge cases.

- Transparency groups (beginGroup/endGroup)
- Blend modes (multiply, screen, overlay, etc.)
- Soft masks
- Tiling patterns
- Shading patterns (gradients)
- Type3 fonts (inline glyph descriptions)
- JBIG2 / CCITTFax image decoders

This phase can be incremental — each sub-feature is independent.

### Phase 6: Delete PDF.js
**Goal**: Remove pdfjs-dist dependency entirely.

- All rendering is native
- Bundle: ~1.2MB unminified → ~500KB minified → ~150KB gzipped
- Zero external rendering deps

---

## Execution Priority

| Phase | Effort | Value | Priority |
|-------|--------|-------|----------|
| Phase 1 (Native Evaluator) | 2-3 sessions | HIGH — eliminates round-trip, enables edit→render | **NOW** |
| Phase 2 (Color Spaces) | 1 session | Medium — covers 95% of PDFs | Next |
| Phase 3 (Image Pipeline) | 1 session | Medium — images render natively | Next |
| Phase 4 (Canvas Renderer) | 2-3 sessions | HIGH — eliminates PDF.js dep for 90% of PDFs | After 2-3 |
| Phase 5 (Advanced) | Ongoing | Low per-feature — long tail | As needed |
| Phase 6 (Delete PDF.js) | 1 session | HIGH — bundle size win | After 4-5 |

**Phase 1 is the critical path.** It's where we go from "two libraries glued together" to "one library that renders." Everything after that is incremental improvement.

---

## Key Insight: OperatorList is the Strangler Fig Seam

Just like pdf-lib's `PDFDocument` was the seam in the original Strangler Fig, **OperatorList is the seam here**:

- Phase 0: PDF.js produces OperatorList, PDF.js consumes it ← current
- Phase 1: **pdfbox-ts** produces OperatorList, PDF.js consumes it ← next
- Phase 4: pdfbox-ts produces OperatorList, **pdfbox-ts** consumes it ← endgame
- Phase 6: OperatorList becomes an internal detail, PDF.js deleted

Same pattern. Same playbook. Proven approach.
