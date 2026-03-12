# Strategic Roadmap

**Status:** Active — Phase 5+ planning
**Last updated:** 2026-03-12
**Author:** Generated from deep strategic analysis

## Vision

OpenDocKit becomes the **universal client-side document engine**: open any Office or PDF file, render it with PowerPoint-grade fidelity, edit it natively in-canvas, and save to any format — all offline, all in the browser, with zero server dependencies.

The strategic path from "good PPTX renderer" to "universal document engine" follows three principles:

1. **The IR is the product.** `PageElement[]` is the cross-format bridge. Every format (PPTX, DOCX, XLSX, PDF) reads into it; every output (Canvas2D, PDF, OOXML) writes from it. Enriching this IR is the highest-leverage work.
2. **Progressive capability, not progressive compromise.** Each tier of functionality (parse → layout → render → edit → save) works independently. Apps consume only what they need. Tree shaking eliminates the rest.
3. **Offline-first means local-first.** No network dependency is acceptable for core functionality. But local-first also means: local AI, local collaboration (CRDTs), local font management, local document understanding.

---

## Phase 5: Performance & Bundle (Now)

### 5A. Tree Shaking + Bundle Split

**Goal:** Core from ~800KB → ~200KB gzipped. Full render from ~1MB → ~400KB gzipped.

| Action | Impact | Effort |
|--------|--------|--------|
| Add `"sideEffects": false` to all package.json | Enables bundler dead-code elimination | Trivial |
| Build with `preserveModules: true` (Rollup) | Preserves ESM module boundaries for tree shaking | Low |
| Split `metrics-bundle.ts` into per-family files | Only used font families are bundled | Medium |
| Lazy-load 187 geometry presets via `import()` | Presets loaded on first shape render, not at boot | Medium |
| Delta encoding + varint for glyph widths | Metrics from ~750KB raw to ~100KB raw, ~30KB Brotli | Medium |
| Separate entry points: `@opendockit/core/parser` vs `@opendockit/core/renderer` | Parse-only apps don't bundle renderers | Low |

**Compression floor analysis:**
- Metrics bundle: 750KB → delta+varint ~100KB → Brotli ~30KB
- Geometry presets: ~80KB → Brotli ~15KB
- Core (parser only): ~50KB gzipped
- Core + layout: ~200KB gzipped
- Full rendering: ~400KB gzipped

**Key insight from date-fns:** Switching to `preserveModules` reduced one library's downstream first-load JS by 80%. The same pattern applies here since the package already uses ESM with subpath exports.

### 5B. Spatial Index + Transaction Undo/Redo

**Goal:** Interactive editing at 60fps with proper undo/redo.

| Action | Impact | Effort |
|--------|--------|--------|
| Add **rbush** R-tree (6KB) for spatial indexing | O(log n) hit testing, replaces linear scan | Low |
| Transaction-based HistoryManager (tldraw pattern) | Proper undo/redo with grouped operations | Low-Medium |
| OBB (oriented bounding box) hit testing | Accurate selection of rotated elements | Low |
| Viewport culling | Only render visible elements on pan/zoom | Medium |

**Architecture (from tldraw analysis):**
- `HistoryManager` wraps `EditTracker` — each mutation is a transaction with forward/inverse deltas
- `SpatialIndex` wraps rbush — updated on element move/resize, queried on pointer events
- Multi-element selection: shift-click adds to selection set, drag creates selection rectangle queried against spatial index

### 5C. PDF/A-3 Attachment Embedding

**Goal:** Lossless PPTX↔PDF round-trip via embedded original.

**How it works:** When exporting PPTX → PDF, embed the original PPTX as a PDF/A-3 associated file. The receiver gets a visual PDF that any reader can display, plus the recoverable source PPTX. Uses existing pdf-signer COS primitives (COSDictionary, COSStream, COSWriter).

**Why this is revolutionary for the use case:** Most "conversion" tools produce one-way lossy output. PDF/A-3 embedding means the original is *inside* the PDF — no separate file to track. Any OpenDocKit-aware app can extract the PPTX and enable full editing. Non-aware apps see a normal PDF.

**Implementation:**
1. Add `EmbeddedFileStream` builder to pdf-signer (COSStream with `/Type /EmbeddedFile`, `/Subtype /application#2Fvnd.openxmlformats-officedocument.presentationml.presentation`)
2. Add `/AF` (Associated Files) array to document catalog
3. Add `/AFRelationship /Source` to the file spec dictionary
4. Wire into `exportPresentationToPdf()` as opt-in flag

---

## Phase 5.5: Font Innovation

### 5.5A. Variable Font Consolidation

**Goal:** Companion package from 3.9MB WOFF2 → ~1.5MB.

Google Fonts provides variable font versions for most of the 42 bundled families. A single variable font file replaces 3-6 weight-specific static files. Browser support is 97%+.

**Action:** Update `generate-font-package.py` to prefer variable font downloads. Update font-resolver to request variable fonts with CSS `font-variation-settings` instead of discrete weight files.

### 5.5B. On-Demand Subsetting (hb-subset WASM)

Already planned as Font Delivery Phase 5. The `subset-font` npm package wraps harfbuzz's `hb-subset` in WASM. For PDF embedding, subset to only the glyphs used in the document — fonts drop from ~200KB to ~5-20KB per face.

### 5.5C. Metrics Compression

| Technique | Reduction | Effort |
|-----------|-----------|--------|
| Delta encoding (most glyphs have similar widths) | ~40% | Medium |
| Varint encoding for integer widths | ~20% | Low |
| Quantize to nearest 1/100 em (sufficient for layout) | ~50% | Low |
| Binary ArrayBuffer format (replace TS object literal) | ~30% | Medium |
| Lazy per-family loading (ship font-level metrics, load glyph tables on demand) | Huge for initial load | Medium |
| **Combined** | 750KB → ~100KB raw, ~30KB Brotli | Medium |

### 5.5D. Unified Cross-Format FontResolver

**Goal:** One font pipeline for both OOXML and PDF rendering.

Currently:
- OOXML uses `FontResolver` (theme resolution → substitution table → CDN)
- PDF uses `FontExtractor` + `FontRegistrar` (embedded font extraction → canvas registration)

**Unified approach:** Both flows resolve through `FontResolver`:
1. PDF `FontExtractor` registers extracted fonts as "user-supplied" in FontResolver
2. OOXML theme fonts resolve through the same substitution + CDN chain
3. Both share `FontCache` (memory + CacheStorage)
4. Cross-format rendering uses identical font binaries — eliminates the "same text looks different in PPTX vs PDF" problem

---

## Phase 6: In-Canvas Editing Engine

### 6A. OffscreenCanvas Worker Rendering

**Goal:** Zero jank during complex slide rendering.

Move rendering to a Web Worker via `transferControlToOffscreen()`. Main thread handles input events; worker renders. The existing `RenderBackend` abstraction makes this straightforward — the worker receives `PageElement[]` and a backend factory.

**Architecture:**
```
Main Thread                    Worker Thread
─────────────                  ─────────────
Input events  ──→  postMessage  ──→  RenderBackend.render()
DOM updates   ←──  transferable ←──  rendered frame
```

### 6B. Text Editing Engine

**Goal:** Full IME-aware text editing in canvas.

**Architecture (from Google Docs analysis):**
- Hidden `<textarea>` captures keyboard input (IME composition, clipboard)
- Canvas renders text using existing text layout engine (line breaking, paragraph props, font metrics)
- Cursor positioning via `measureText()` infrastructure (already exists)
- "Side DOM" for accessibility (screen readers read a hidden DOM mirror)

**Key insight:** Google Docs migrated FROM DOM TO Canvas for text editing, citing cross-platform consistency. We're starting from Canvas — we just need the input capture layer.

### 6C. CanvasKit / WebGPU Backend

**Goal:** GPU-accelerated effects that Canvas2D can't do.

A `CanvasKitBackend` slots into the existing `RenderBackend` abstraction alongside `CanvasBackend` and `PDFBackend`. Priority effects: 3D transforms, gaussian blur, reflections, advanced blend modes.

**Figma's lesson:** They migrated from WebGL to WebGPU and saw 2-5x draw-call throughput. CanvasKit (Skia WASM, ~1.5MB) provides the same capabilities with a simpler API.

---

## Phase 7: Cross-Format Save

### 7A. Incremental PDF Save

**Goal:** Edit a PDF and save without re-rendering.

Use pdf-signer's `COSWriter` for surgical updates:
- Annotation add/modify/delete
- Form field fill
- Text corrections (via content stream patching)
- Incremental update appended to end of file (PDF spec §7.5.6)

**This is the "non-destructive" part.** The original PDF bytes are untouched; edits are appended as an incremental update. Any PDF reader can display the result. The update can be stripped to recover the original.

### 7B. PageElement → OOXML Synthesis

**Goal:** Generate PPTX from unified elements (enables PDF → PPTX conversion).

**Approach:** For each `PageElement`:
1. If it has a `PptxSource` bag — use the original XML (lossless round-trip)
2. If it has a `PdfSource` bag — synthesize minimal OOXML from visual properties
3. If it's new (created in editor) — generate OOXML from scratch

**The source bag pattern is already the architecture.** The `PageElement.source` field preserves format-specific data. The missing piece is the OOXML serializer for elements without a PptxSource.

### 7C. OOXML Feature Coverage Registry

**Goal:** Know exactly what you support, what you skip, and what breaks.

Machine-readable JSON mapping OOXML XPath patterns to implementation status:
```json
{
  "a:spPr/a:xfrm": { "status": "full", "parser": "transform-parser.ts", "tests": 24 },
  "a:spPr/a:effectLst/a:reflection": { "status": "stub", "parser": null, "tests": 0 },
  "a:rPr/a:effectLst": { "status": "not-implemented", "tests": 0 }
}
```

**Automated extraction:** Scan the codebase for XML element handlers, compare against OOXML schema, generate coverage report. The capability registry is a prototype of this — extend it with spec references and test counts.

---

## Phase 8: Collaboration & AI

### 8A. CRDT-Backed Collaborative Editing

**Goal:** Real-time multi-user document editing.

**Architecture (from BlockSuite/Yjs analysis):**
- Replace `EditTracker` (WeakSet-based dirty tracking) with a Yjs `Y.Doc`
- Each `EditableElement` mutation becomes a Yjs operation
- Sync via Yjs providers (WebSocket, WebRTC, IndexedDB)
- Conflict resolution is automatic (CRDT convergence guarantee)

**Key insight from BlockSuite:** The document must be **independent of the editor lifecycle**. `EditablePresentation` already separates state from rendering — the gap is replacing the change tracking layer with a CRDT.

**Peritext model** for rich text CRDTs: preserves formatting intent across concurrent edits (not just character positions).

### 8B. AI-Assisted Document Understanding

**Goal:** Use local vision-language models for document repair and accessibility.

Use cases:
- **Repair unimplemented features:** When SmartArt layout is stubbed, use VLM to infer intended layout from a reference rendering
- **Auto-generate alt text** for images and charts (accessibility compliance)
- **Structure inference** for untagged PDFs (identify headings, lists, tables from visual layout)

**Constraint:** Must run locally (WebGPU inference) to honor the offline-first tenet. The WASM + WebGPU stack now supports models up to ~7B parameters in-browser.

### 8C. Streaming / Incremental Parsing

**Goal:** Start rendering before the entire file is parsed.

The OPC reader already supports lazy extraction (parse ZIP central directory first, extract parts on demand). Extend to:
- Stream rendering: emit `PageElement[]` as each slide/page is parsed
- Progressive image loading: render placeholder boxes, swap in images as extracted
- Parallel extraction: parse multiple parts concurrently via `Promise.all()`

**Performance reference:** Calamine (Rust WASM) demonstrates 10-50x faster OOXML parsing via state-machine SAX + SIMD. A WASM XML parser could be a leaf-node accelerator (fits the existing architecture pattern).

---

## Priority Matrix

| Phase | Initiative | Impact | Effort | Dependencies |
|-------|-----------|--------|--------|-------------|
| **5A** | Tree shaking + bundle split | HIGH | LOW-MED | None |
| **5B** | Spatial index + undo/redo | HIGH | LOW | None |
| **5C** | PDF/A-3 embedded originals | HIGH | LOW | pdf-signer |
| **5.5A** | Variable font consolidation | MED-HIGH | MED | Font pipeline |
| **5.5B** | hb-subset WASM subsetting | MED-HIGH | MED | Already planned |
| **5.5C** | Metrics compression | MED-HIGH | MED | Metrics pipeline |
| **5.5D** | Unified FontResolver | MED-HIGH | MED | 5.5A, 5.5B |
| **6A** | OffscreenCanvas worker | HIGH | MED | None |
| **6B** | Text editing engine | HIGH | HIGH | 5B |
| **6C** | CanvasKit/WebGPU backend | MED | HIGH | None |
| **7A** | Incremental PDF save | HIGH | MED | pdf-signer |
| **7B** | PageElement → OOXML synthesis | MED | HIGH | Elements model |
| **7C** | Feature coverage registry | MED | LOW-MED | Capability registry |
| **8A** | CRDT collaboration | VERY HIGH | VERY HIGH | 6B |
| **8B** | AI document understanding | MED-HIGH | VERY HIGH | WebGPU |
| **8C** | Streaming parsing | MED | MED | OPC reader |

---

## Architectural Debt (from deep review, 2026-03-12)

Issues discovered during architectural review, ranked by impact. These can be tackled opportunistically alongside the strategic phases.

### High Priority (Small Effort, Big Cleanup)

**1. Color math duplicated between core and render.** `rgbToHsl`, `hslToRgb`, `hue2rgb`, `scRgbToSrgb`, `parseHexColor` are implemented identically in both `render/src/color-utils.ts` and `core/src/theme/color-resolver.ts`. Since render depends on core, these should live in core and render should re-export.

**2. `colorToRgba()` reimplemented 6 times.** The CSS `rgba()` string formatter is a private function in text-renderer, fill-renderer, line-renderer, table-renderer, effect-renderer, and background-renderer. `render/src/color-utils.ts` already exports `rgbaToString()` which does exactly this — none of the renderers use it.

**3. Matrix math duplicated 5 times within pdf-signer.** `identityMatrix()`, `multiplyMatrices()`, `transformPoint()` for 6-element arrays exist independently in evaluator.ts, canvas-graphics.ts, canvas-tree-recorder.ts, TextExtractor.ts, and ContentStreamRedactor.ts. Extract to `pdf-signer/src/utils/matrix.ts`.

### Medium Priority (Performance + Consistency)

**4. No text measurement caching.** `measureFragment()` in text-renderer.ts calls `backend.measureText()` per word fragment with no cache. A `Map<string, number>` keyed on `fontString:text` would eliminate redundant Canvas2D calls — especially impactful during auto-fit iterations.

**5. Tab stop array re-sorted per run.** In `wrapParagraph()`, `.slice().sort().map()` on tab stops happens inside the per-run loop. Should be hoisted above it.

**6. `@opendockit/render` is nearly orphaned.** Only 2 external import sites in production code (both in pptx/export). FontMetricsDB and metricsBundle are 1-line re-exports from core. The only original code used externally is PDFBackend. Consider collapsing into core or pptx.

**7. Color type inconsistency.** Core/render use 0-255 RGB, but elements `Color` and pdf-backend `ParsedColor` use 0-1. This is a silent-bug trap at package boundaries. Document the convention or normalize.

**8. DocKit vs SlideKit API patterns diverge.** SlideKit: `new Kit() → await kit.load()`. DocKit: `await DocKit.fromOpcData()`. Users working with both formats face unnecessary friction. Align on one pattern.

### Low Priority (Nice to Have)

**9. Shared line-breaking engine.** PPTX `wrapParagraph()` (200+ lines) and DOCX `wrapFragments()` (70 lines) both implement greedy word-boundary wrapping. DOCX code explicitly states it mirrors PPTX. A shared engine in core would serve both.

**10. `@xmldom/xmldom` as optional dep.** Only imported in one file (`dom-utils.ts` for edit serialization). If editing is opt-in, this ~200KB dep could be a peer/optional dependency.

**11. Unused exports in elements package.** `searchText`, `serializeToClipboard`, `WeakDirtyTracker`, `EditableDocument` are exported but have zero external consumers. Either wire them up or remove from public API.

**12. `pako` replaceable with native streams.** `DecompressionStream`/`CompressionStream` (browsers + Node 18+) could replace pako for the browser path, keeping pako as Node fallback.

---

## Cross-Project: blindpipe Synergy

The [blindpipe](https://github.com/willackerly/blindpipe) project — a zero-knowledge collaborative office suite — has significant synergy potential with OpenDocKit. blindpipe currently uses ONLYOFFICE sdkjs for editing, which imposes a ~556MB dependency stack (sdkjs ~300MB + x2t WASM ~60MB + fonts ~200MB) and an opaque binary document format (DOCY) that prevents structural diffs, smart merge, and incremental save.

### Binary Format Bottlenecks in blindpipe

1. **DOCY (ONLYOFFICE internal binary)** — fully opaque, blindpipe cannot inspect/diff/transform content
2. **x2t WASM (~60MB)** — converts DOCX↔DOCY, blocks critical path with 30-second cold start
3. **Opaque OT changes** — base64-encoded binary, prevents semantic merge in `conflict-resolver`
4. **Triple encoding overhead** — DOCY → base64 → JSON → AES-256-GCM before wire

### Migration Path (Phased, Low-to-High Risk)

| Phase | Action | Risk | Value |
|-------|--------|------|-------|
| **1** | **Read-only preview** — use `@opendockit/docx` parser + Canvas2D renderers for lightweight document preview (~2MB vs ~556MB). Access-denied thumbnail without decryption key. | LOW | Immediate |
| **2** | **Font stack share** — replace ONLYOFFICE's 200MB font directory with `@opendockit/fonts` (3.9MB WOFF2) + `FontResolver` for progressive loading | LOW | Immediate |
| **3** | **DOCX import without x2t** — replace `convertDocxToDocy` with OpenDocKit's `parseDocument()` → `DocumentIR` (JSON). Eliminates x2t WASM. | MEDIUM | High |
| **4** | **Structured OT** — replace opaque base64 changes with typed operations on `DocumentIR`. Enables meaningful three-way merge and conflict visualization. | MEDIUM-HIGH | Very High |
| **5** | **OpenDocKit-based editor** — replace sdkjs with editor built on OpenDocKit's rendering + edit pipeline. Eliminates AGPL dependency + opaque binary. Missing: caret/selection, keyboard input, rich text toolbar. | HIGH | Transformative |

### What OpenDocKit Already Provides

- Full DOCX parser → `DocumentIR` (JSON, ~50KB)
- Canvas2D rendering with font metrics, text layout, shapes
- `PageModel`/`PageElement` with spatial queries, hit testing, dirty tracking
- Edit operations (move, resize, setText, delete) with surgical XML save
- 8-tier font resolution, 42-family companion package, CDN fallback
- PDF export with custom font embedding and signing primitives

### What Needs Building (for full blindpipe integration)

- Caret/selection model for text editing (→ Phase 6B: Text Editing Engine)
- Keyboard input handling with IME support (→ Phase 6B)
- CRDT-compatible change operations on `DocumentIR` (→ Phase 8A)
- Rich text editing toolbar (new)
- Table cell editing (new)

**The key insight:** blindpipe's collaboration needs (structured diff, smart merge, typed OT) align perfectly with OpenDocKit's strategic direction (CRDT collaboration, JSON document IR, local-first architecture). Building the editor core for OpenDocKit (Phase 6) simultaneously enables blindpipe migration.

---

## Research References

- **Figma rendering:** WebGPU migration, C++ → WASM architecture, compute shader offload
- **Google Docs:** Canvas-based rendering, hidden DOM for accessibility, IME handling
- **tldraw:** R-tree spatial index (rbush), transaction-based HistoryManager, ShapeUtil extension
- **BlockSuite/AFFiNE:** CRDT-native document editing, Yjs integration, document-independent-of-editor
- **Peritext:** CRDT model for rich text that preserves formatting intent
- **subset-font:** harfbuzz hb-subset WASM for font subsetting
- **rustybuzz-wasm:** 287K glyphs/sec (1.5x faster than harfbuzzjs, 4x faster than opentype.js)
- **Calamine:** Rust WASM OOXML parser, 10-50x faster via SAX + SIMD
- **pdf-lib:** COS-level PDF manipulation without re-rendering
- **date-fns:** `preserveModules` tree shaking pattern (80% first-load reduction)
