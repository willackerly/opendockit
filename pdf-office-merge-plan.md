# OpenDocKit + pdfbox-ts Unified Platform Strategy

**Created:** 2026-03-07
**Status:** Draft — ready for review
**Scope:** Architecture, phasing, and user stories for merging pdfbox-ts into OpenDocKit as a unified document rendering/editing platform

---

## Table of Contents

1. [Vision](#1-vision)
2. [User Stories](#2-user-stories)
3. [Current State Assessment](#3-current-state-assessment)
4. [Target Architecture](#4-target-architecture)
5. [Five Technical Bridges](#5-five-technical-bridges)
6. [Testing Strategy](#6-testing-strategy)
7. [Performance Considerations](#7-performance-considerations)
8. [Visual Fidelity](#8-visual-fidelity)
9. [Phased Roadmap](#9-phased-roadmap)
10. [Risks & Mitigations](#10-risks--mitigations)
11. [Success Metrics](#11-success-metrics)
12. [Key Files Reference](#12-key-files-reference)

---

## 1. Vision

A single JavaScript/TypeScript library that can **open, render, edit, convert, and sign** any office document (PPTX, DOCX, XLSX) or PDF — entirely in the browser, with zero server dependencies.

The core insight: both OpenDocKit and pdfbox-ts already solve the same fundamental problems (parsing → intermediate representation → Canvas2D rendering → editing → saving) from different format directions. Unification eliminates redundant infrastructure and enables cross-format features that neither project can deliver alone.

**Design principles:**
- **Non-destructive editing** — original file bytes preserved; only dirty parts rewritten
- **Format-agnostic interaction** — selection, drag, resize work identically for PPTX and PDF
- **Progressive fidelity** — render what you can, grey-box what you can't, report coverage
- **Web-native performance** — zero-alloc fast paths, lazy loading, tree-shakeable imports
- **Inspectable architecture** — IR is serializable JSON, every rendering decision is traceable

---

## 2. User Stories

### 2.1 View — "Open any document in my browser"

| Story | Details |
|-------|---------|
| Open a PPTX and navigate slides | Existing capability via SlideKit |
| Open a PDF and navigate pages | Existing via PDFRenderer (PDF.js) or NativeRenderer (COS→Canvas) |
| Zoom, pan, and scroll through pages/slides | Viewport management, DPI scaling |
| View on mobile and desktop | Responsive canvas sizing, touch events |
| Load from File input, URL, or ArrayBuffer | Both readers accept Uint8Array/ArrayBuffer |

### 2.2 Edit — "Change content without leaving the browser"

| Story | Details |
|-------|---------|
| Select any element (shape, text, image) by clicking | Unified hit-testing across formats |
| Move and resize elements with drag handles | Shared interaction store, format-specific save |
| Edit text inline | Rich text editing with font/size/color |
| Delete elements | Soft-delete with undo potential |
| Undo/redo edits | Edit history stack (future) |
| Fill PDF form fields | Existing pdfbox-ts capability |
| Add annotations to PDFs | 13 annotation types already implemented |
| Save modified document (preserving format) | PPTX→PPTX, PDF→PDF with incremental update |

### 2.3 Convert — "Transform between formats"

| Story | Details |
|-------|---------|
| Export PPTX slides as PDF | IR → PDFBackend → ContentStreamBuilder → save |
| Export PPTX slides as images (PNG) | Existing via Canvas2D → toDataURL |
| Export PDF pages as images (PNG) | Existing via NativeRenderer → canvasToPng |
| Batch convert PPTX folder to PDFs | Programmatic API for CI/CD pipelines |
| Convert with font embedding | TrueType subsetter embeds used glyphs |

### 2.4 Sign — "Digitally sign documents"

| Story | Details |
|-------|---------|
| Sign PDF with PKCS#7 certificate | Existing — byte-for-byte parity with Apache PDFBox |
| Counter-sign (multi-user) | Existing — incremental update preserves prior signatures |
| Add visual signature (PNG stamp) | Existing — appearance stream generation |
| Verify existing signatures | Existing — certificate chain validation |
| Long-term validation (LTV) | Existing — RFC 3161 timestamps, OCSP/CRL embedding |
| Sign after converting PPTX→PDF | New — compose convert + sign in one pipeline |

### 2.5 Extract — "Pull content from documents"

| Story | Details |
|-------|---------|
| Extract all text from PDF | Existing via font decoder + content stream evaluation |
| Extract all text from PPTX | Existing via text body IR |
| Extract images from either format | Existing — media cache for PPTX, XObject decode for PDF |
| Get element positions and metadata | Unified element model with spatial queries |

### 2.6 Inspect — "Debug rendering quality"

| Story | Details |
|-------|---------|
| Click any element, see source metadata | Element inspector with kind/name/position/layer |
| Compare rendered output to reference | 3-pane gallery: reference, rendered, amplified diff |
| Track rendering quality over time | RMSE baselines with regression guards |
| Identify unsupported features | Capability registry with coverage reporting |
| Visual diff between Canvas and PDF export | Cross-format regression testing |

### 2.7 Embed — "Use in my app"

| Story | Details |
|-------|---------|
| `npm install @opendockit/pptx` and render slides | Existing — tree-shakeable ESM |
| `npm install @opendockit/pdf` and render pages | New — wraps existing NativeRenderer |
| Render to off-screen canvas (thumbnails, SSR) | Existing — OffscreenCanvas support |
| Custom font loading (branded fonts) | Existing — user-supplied font tier |
| Event callbacks (click, hover, diagnostic) | Existing — hyperlink + diagnostic emitter APIs |

---

## 3. Current State Assessment

### 3.1 What Exists Today

```
packages/
├── core/          @opendockit/core          1,502 tests
│   ├── IR types (TransformIR, FillIR, TextBodyIR, GeometryIR, ...)
│   ├── OOXML parsers (OPC, DrawingML, themes, colors)
│   ├── Canvas2D renderers (shape, fill, line, text, picture, group, table, connector)
│   ├── Font system (42-family metrics DB, WOFF2 bundles, 5-tier loading)
│   ├── Edit model (EditTracker, EditablePresentation, deriveIR, XML reconstitution)
│   ├── Geometry engine (187 presets, path builder, shape guides)
│   └── Media cache, unit conversions, diagnostics
│
├── pptx/          @opendockit/pptx            281 tests
│   ├── Presentation/slide/master/layout parsers
│   ├── SlideKit public API
│   ├── SlideViewport (canvas management, DPI scaling)
│   └── Edit module (EditableSlideKit, save pipeline)
│
└── pdf-signer/    @opendockit/pdf-signer    1,566 tests
    ├── COS object model (COSDictionary, COSArray, COSStream, ...)
    ├── PDF parser (xref, trailer, object streams, full-document-loader)
    ├── PDF writer (COSWriter, XRefBuilder, incremental + full-save)
    ├── Document API (PDFDocument, PDFPage, PDFFont, PDFImage, PDFForm)
    ├── Content stream builder (all PDF operators, fluent API)
    ├── Native renderer (evaluator → OperatorList → NativeCanvasGraphics)
    ├── PDF.js renderer wrapper (high-fidelity reference rendering)
    ├── Element model (PageElement, TextElement, ShapeElement, ImageElement, PathElement)
    ├── Interaction store (selection, marquee, redaction FSM)
    ├── Font system (Standard 14, TrueType parser + subsetter, CFF parser)
    ├── Signer (PKCS#7, CMS, multi-user, visual signatures, LTV)
    ├── Encryption (AES-128/256, metadata, permissions)
    ├── Annotations (13 types), redaction, PDF/A compliance
    ├── Text/image extraction
    └── 1,105-file robustness corpus
```

**Total: 3,349 tests, 0 failures.**

### 3.2 Architectural Parallels

| Concern | OpenDocKit | pdfbox-ts |
|---------|-----------|-----------|
| **Source format** | OOXML XML in ZIP | PDF COS objects with xref |
| **Object model** | XML DOM → flat edit model | COS tree (mutable dictionaries) |
| **Intermediate representation** | SlideElementIR (discriminated union) | OperatorList + PageElement |
| **Rendering** | IR → Canvas2D sub-renderers | OperatorList → NativeCanvasGraphics |
| **Dirty tracking** | EditTracker (WeakSet) | COSUpdateTracker (WeakSet) |
| **Save strategy** | Surgical XML patching, raw bytes for unchanged | Incremental COS update, raw bytes for unchanged |
| **Font metrics** | 42-family bundle (750KB), FontMetricsDB class | Standard 14 metrics + TrueType parser |
| **Canvas2D usage** | RenderContext threads ctx through all renderers | NativeCanvasGraphics executes OperatorList |
| **Visual testing** | RMSE baselines, 3-pane gallery, threshold guards | Pixelmatch snapshots |
| **DPI handling** | dpiScale in RenderContext | scale factor in NativeRenderer |

### 3.3 Already Shared

The element model in `packages/pdf-signer/src/elements/types.ts` was **designed for this merger from the start**:

```typescript
// Already exists — source bags for both formats
export interface PdfSource {
  format: 'pdf';
  opRange: [number, number];
  ctm: number[];
  textMatrix?: number[];
  fontName?: string;
}

export interface PptxSource {
  format: 'pptx';
  offX: number;    // original EMU values
  offY: number;
  extCx: number;
  extCy: number;
  rot: number;
  xmlPath?: string;
  passthrough?: Record<string, unknown>;
}
```

The TrueType parser in OpenDocKit core (`packages/core/src/font/vendor/truetype-parser.ts`) was **vendored from pdfbox-ts**.

---

## 4. Target Architecture

### 4.1 Package Evolution

```
Current (3 packages)                    Target (6 packages)
─────────────────────                   ────────────────────
@opendockit/core (1,502 tests)     →    @opendockit/core        OOXML parsing, IR types, theme engine
                                        @opendockit/render       Shared rendering, fonts, media cache
                                        @opendockit/elements     Unified element model, edit primitives

@opendockit/pptx (281 tests)       →    @opendockit/pptx        PPTX renderer + SlideKit (unchanged)

@opendockit/pdf-signer (1,566)     →    @opendockit/pdf         PDF document API, rendering, COS model
                                        @opendockit/pdf-signer   Signing only (imports @opendockit/pdf)
```

### 4.2 Dependency Graph

```
@opendockit/elements  (zero deps — pure types + algorithms)
       ↑
@opendockit/render    (depends on: elements)
       ↑
  ┌────┴────┐
  │         │
core      pdf         (both depend on: render, elements)
  │         │
  ↓         ↓
pptx    pdf-signer    (format-specific applications)
```

### 4.3 What Goes Where

| Package | Owns | Does NOT Own |
|---------|------|-------------|
| **elements** | PageModel, PageElement, PdfSource, PptxSource, InteractionStore, EditableDocument base, spatial queries, dirty tracking primitives | Format-specific parsing, rendering |
| **render** | RenderBackend interface, CanvasBackend, PDFBackend, FontMetricsDB, font loading, media cache, color utilities, matrix math | Format-specific IR types, document APIs |
| **core** | OOXML parsers, DrawingML IR types, theme engine, geometry engine (187 presets), Canvas2D renderer implementations, PPTX edit model (XML reconstitution) | PDF anything, generic rendering |
| **pdf** | COS object model, PDF parser, PDF writer, PDFDocument/PDFPage API, NativeRenderer, content stream evaluator, font decoder, text/image extraction, annotations, forms, encryption | Signing, OOXML anything |
| **pptx** | SlideKit, slide/master/layout parsers, SlideViewport, EditableSlideKit | Core rendering, PDF anything |
| **pdf-signer** | Signing API, CMS/PKCS#7, TSA, LTV, signature verification | Document API, rendering (imports from @opendockit/pdf) |

### 4.4 Migration Strategy

**Incremental extraction, not big-bang rewrite:**

1. Create new packages with barrel exports that re-export from current locations
2. Move code file-by-file, updating imports
3. Old import paths work via re-exports during transition
4. Remove re-exports once all consumers migrated
5. Each step: all 3,349 tests must pass

---

## 5. Five Technical Bridges

### Bridge 1: Unified Element Model (`@opendockit/elements`)

**What**: A format-agnostic element model where both PPTX and PDF produce the same element types for the interaction layer.

**Already exists**: `packages/pdf-signer/src/elements/types.ts` defines `PageModel`, `PageElement` (TextElement, ShapeElement, ImageElement, PathElement, GroupElement) with `PdfSource` and `PptxSource` source bags.

**Key design principle**: The interaction layer (selection, drag, resize, z-order) reads/writes ONLY visual coordinates (x, y, width, height, rotation, opacity). Format-specific data rides along in the opaque `source` bag for lossless round-trip.

**What's needed**:
- Extract to standalone package
- Add `EditableDocument<TSource>` base class with dirty tracking (WeakSet pattern from both projects)
- Add `deriveElement()` with zero-alloc fast path (pattern from OpenDocKit's `deriveIR()`)
- PPTX importer: convert `SlideElementIR` → `PageElement` with `PptxSource`
- PDF importer: already done (evaluator produces `PageElement` with `PdfSource`)

**Coordinate system**: Elements use **points** (1/72") as the canonical unit. PPTX sources carry EMU originals in `PptxSource` for lossless round-trip. PDF sources carry CTM matrices in `PdfSource`.

### Bridge 2: RenderBackend Abstraction (`@opendockit/render`)

**What**: An interface that abstracts over Canvas2D, PDF content streams, and (future) SVG DOM — so renderers can target any output format.

**Interface sketch**:

```typescript
interface RenderBackend {
  // State management
  save(): void;
  restore(): void;

  // Transforms
  translate(x: number, y: number): void;
  scale(sx: number, sy: number): void;
  rotate(radians: number): void;
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void;

  // Path operations
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  closePath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(fillRule?: 'nonzero' | 'evenodd'): void;

  // Painting
  fill(fillRule?: 'nonzero' | 'evenodd'): void;
  stroke(): void;

  // Style
  setFillColor(r: number, g: number, b: number, a?: number): void;
  setStrokeColor(r: number, g: number, b: number, a?: number): void;
  setLineWidth(width: number): void;
  setLineCap(cap: 'butt' | 'round' | 'square'): void;
  setLineJoin(join: 'miter' | 'round' | 'bevel'): void;
  setLineDash(segments: number[], offset?: number): void;
  setGlobalAlpha(alpha: number): void;

  // Text
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  setFont(family: string, sizePx: number, weight?: string, style?: string): void;
  measureText(text: string): { width: number };

  // Images
  drawImage(image: ImageSource, dx: number, dy: number, dw: number, dh: number): void;

  // Gradients (extended — not all backends support all types)
  createLinearGradient?(x0: number, y0: number, x1: number, y1: number): GradientHandle;
  createRadialGradient?(cx: number, cy: number, r: number): GradientHandle;
  setFillGradient?(gradient: GradientHandle): void;
}
```

**Implementations**:

| Backend | Wraps | Use Case |
|---------|-------|----------|
| `CanvasBackend` | `CanvasRenderingContext2D` | Screen rendering (existing behavior) |
| `PDFBackend` | `ContentStreamBuilder` + `PDFPage` | PPTX→PDF export |
| `SVGBackend` | SVG DOM builder | Future SVG export |

**Migration**: Current renderers receive `RenderContext.ctx` (a Canvas2D context). Refactor to receive `RenderContext.backend` (a `RenderBackend`). `CanvasBackend` wraps the Canvas2D context with zero behavior change — visual regression baselines prove it.

### Bridge 3: Shared Font Infrastructure (`@opendockit/render`)

**What**: A single font system that serves both Canvas2D rendering (needs browser fonts loaded) and PDF export (needs font embedding + subsetting).

**Current state**:
- OpenDocKit: 42-family metrics bundle (750KB), WOFF2 bundles (~5MB), FontFace API loading, 5-tier cascade
- pdfbox-ts: Standard 14 font metrics, TrueType parser + subsetter, CFF parser, font embedding into PDF

**Unified approach**:

```
                    ┌─────────────────────┐
                    │   FontMetricsDB     │  ← 42 families + Standard 14
                    │   (shared, ~800KB)  │
                    └────────┬────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼──────┐ ┌────▼─────┐ ┌──────▼───────┐
     │ Canvas Fonts  │ │ PDF Font │ │ Font Metrics │
     │ (WOFF2 load,  │ │ Embedding│ │ Extraction   │
     │  FontFace API)│ │ (subset, │ │ (TrueType    │
     │  ~5MB bundles │ │  embed)  │ │  parser)     │
     └───────────────┘ └──────────┘ └──────────────┘
     @opendockit/render  @opendockit/pdf   scripts/
```

**Key**: FontMetricsDB is the shared lookup. Canvas rendering uses it for text measurement fallback; PDF export uses it for glyph advance widths. The TrueType subsetter (currently in pdfbox-ts) is used only by PDF export to embed minimal font subsets.

### Bridge 4: Unified Edit Model (`@opendockit/elements`)

**What**: A common edit model where both PPTX and PDF elements can be mutated through the same API, with format-specific save pipelines.

**Pattern** (generalized from both projects):

```typescript
interface EditableDocument<TSource extends PdfSource | PptxSource> {
  // Query
  getElement(id: string): EditableElement<TSource> | undefined;
  getElements(): EditableElement<TSource>[];
  getDirtyElements(): EditableElement<TSource>[];

  // Mutations (auto-marks dirty)
  moveElement(id: string, dx: number, dy: number): void;
  resizeElement(id: string, width: number, height: number): void;
  setText(id: string, paragraphs: Paragraph[]): void;
  deleteElement(id: string): void;

  // Derivation
  deriveElement(id: string): PageElement;  // zero-alloc fast path for clean elements
}
```

**Save pipelines** (format-specific, behind common interface):

| Format | Strategy | Implementation |
|--------|----------|---------------|
| PPTX | Parse dirty part XML → DOM patch → serialize | `@xmldom/xmldom` surgical patching |
| PDF | Mark COS objects dirty → incremental write → append xref | COSWriter + XRefBuilder |

Both preserve unchanged parts as raw bytes. Both use WeakSet-based dirty tracking.

### Bridge 5: Visual Regression Framework (shared scripts)

**What**: Port OpenDocKit's RMSE baseline system to PDF rendering, creating a unified quality measurement framework.

**Current gap**: pdfbox-ts uses `pixelmatch` binary diffs (pass/fail, no gradation). OpenDocKit uses RMSE with per-slide thresholds and regression guards (allows minor drift, catches real regressions).

**Unified approach**:

```
scripts/
├── visual-compare.mjs              # PPTX visual regression (existing)
├── visual-compare-pdf.mjs          # PDF visual regression (NEW)
├── visual-compare-export.mjs       # PPTX→PDF export regression (NEW)
├── visual-compare-corpus.mjs       # PPTX corpus regression (existing)
├── generate-visual-gallery.sh      # 3-pane composites (existing, extend for PDF)
```

**PDF visual regression workflow**:
1. Render N reference PDFs via PDF.js (high-fidelity baseline)
2. Render same PDFs via NativeRenderer
3. Compute per-page RMSE, establish baselines
4. On each commit: re-render, compare, fail on regression beyond threshold

**Cross-format regression** (PPTX→PDF export):
1. Render PPTX slide via Canvas2D (reference)
2. Export same PPTX to PDF via PDFBackend
3. Render exported PDF via NativeRenderer
4. Compare RMSE — measures export fidelity loss

---

## 6. Testing Strategy

### 6.1 Test Pyramid

```
                    ┌──────────┐
                    │  Visual  │  ~60s: RMSE baselines (PPTX + PDF + export)
                   ┌┴──────────┴┐
                   │ Integration │  ~30s: round-trip, cross-format, save/load
                  ┌┴────────────┴┐
                  │    Unit       │  ~5s: 4,000+ tests across all packages
                  └──────────────┘
```

### 6.2 Unit Tests (every commit, ~5s)

| Package | Test Focus | Count |
|---------|-----------|-------|
| **elements** | Element types, spatial queries, dirty tracking, deriveElement fast path | ~200 new |
| **render** | RenderBackend contract, font metrics, color conversion, matrix math | ~150 new |
| **core** | OOXML parsing, IR types, geometry engine, Canvas2D renderers | 1,502 existing |
| **pptx** | Slide parsing, SlideKit API, edit round-trip | 281 existing |
| **pdf** | COS model, PDF parsing, NativeRenderer, document API | ~1,200 (from pdf-signer) |
| **pdf-signer** | Signing, CMS, TSA, LTV, verification | ~350 (from pdf-signer) |

### 6.3 Visual Regression (per-commit, ~60s)

| Test Suite | Reference | Rendered By | Slides/Pages | Threshold |
|-----------|-----------|-------------|-------------|-----------|
| PPTX Canvas | PDF export (Google Slides) | CanvasBackend | 54 | 0.008 |
| PPTX Corpus | Self-referential (first run) | CanvasBackend | 67 | 0.003 |
| PDF Native | PDF.js rendering | NativeRenderer | TBD | TBD |
| PPTX→PDF Export | PPTX Canvas render | PDFBackend → NativeRenderer | TBD | TBD |

### 6.4 Integration Tests (pre-release)

- **PPTX round-trip**: load → edit → save → reload → verify text/positions
- **PDF round-trip**: load → edit → save → verify signatures + content
- **Cross-format**: PPTX → PDF export → load exported PDF → extract text → compare
- **PDF corpus**: 1,105 real-world PDFs (sign without crash)
- **Font embedding**: export with 42 bundled families → verify PDF text extraction matches source

### 6.5 Regression Guards

Every phase adds regression guards that **block merges** if quality drops:

```bash
pnpm test                    # All unit tests (~5s)
pnpm test:visual             # PPTX RMSE baselines (~30s)
pnpm test:visual:pdf         # PDF RMSE baselines (~30s)  [Phase 1+]
pnpm test:visual:export      # Export RMSE baselines (~30s) [Phase 3+]
```

---

## 7. Performance Considerations

### 7.1 Bundle Size

| Package | Estimated Size | Tree-Shakeable? |
|---------|---------------|----------------|
| **elements** | ~15KB | Yes — pure types + algorithms |
| **render** | ~800KB (metrics) + ~5MB (WOFF2, lazy) | Yes — WOFF2 loaded per-family |
| **core** | ~200KB (parsers, renderers) | Partial — geometry data is large |
| **pptx** | ~50KB | Yes |
| **pdf** | ~150KB | Yes |
| **pdf-signer** | ~100KB + crypto deps | Yes — signing tree-shakes cleanly |

**Key**: WOFF2 bundles (~5MB) are dynamically imported per-family. A PPTX with 3 fonts loads ~300KB of font data, not 5MB. PDF export doesn't use WOFF2 at all — it embeds TrueType subsets.

### 7.2 Rendering Performance

| Optimization | Current | Target |
|-------------|---------|--------|
| **deriveIR fast path** | PPTX only | Both PPTX + PDF (cache evaluated pages) |
| **Rendered page cache** | None | ImageBitmap cache, invalidated on edit |
| **Font loading** | Async, blocks render | Pre-load from manifest, render with fallback |
| **OperatorList reuse** | Evaluated per render | Cache per page, re-evaluate only on edit |
| **Worker rendering** | None | Content stream evaluation in Web Worker |

### 7.3 Memory

- **Media cache**: shared across formats, LRU with configurable byte limit
- **IR cache**: one per slide/page, freed on navigation (only current ± 1 cached)
- **Font cache**: loaded fonts persist for session (42 families max ≈ 5MB)
- **COS objects**: PDF parser loads on-demand from xref offsets

---

## 8. Visual Fidelity

### 8.1 PPTX Rendering Quality (Current)

Per-slide RMSE against Google Slides PDF reference:

| Quality Tier | Slide Count | RMSE Range | Notes |
|-------------|-------------|------------|-------|
| Excellent | 15 | 0.03 - 0.05 | Pixel-near-perfect |
| Good | 25 | 0.05 - 0.13 | Minor font kerning/antialiasing diffs |
| Acceptable | 10 | 0.13 - 0.16 | Some layout differences visible |
| Needs work | 4 | 0.16 - 0.19 | Dominated by Canvas2D vs PDF text rendering |

**Ceiling**: Top RMSE is dominated by Canvas2D vs PDF font rendering differences (antialiasing, hinting, sub-pixel positioning). Addressable via CanvasKit/Skia WASM in future.

### 8.2 PDF Native Rendering Quality (Current Gaps)

The NativeRenderer evaluator handles ~60 PDF operators. Known gaps:

| Gap | Impact | Difficulty | Phase |
|-----|--------|-----------|-------|
| JPEG images (async decode) | Images missing | Medium | 1 |
| Inline images (BI/ID/EI) | Small images missing | Medium | 1 |
| Shading patterns (sh) | Complex gradients wrong | Hard | 2+ |
| Type 3 fonts (d0/d1) | Custom glyphs missing | Hard | 2+ |
| Pattern colors | Tiling patterns wrong | Hard | 2+ |
| ICC color profiles | Colors slightly off | Medium | 2+ |
| Blend modes | Transparency wrong | Medium | 2+ |

**Phase 1 priority**: Quantify these gaps with RMSE baselines, then fix the easy wins (JPEG, inline images) for immediate improvement.

### 8.3 PPTX→PDF Export Fidelity (Target)

| Feature | Fidelity Target | Approach |
|---------|----------------|----------|
| Shapes (geometry) | Exact | IR paths → ContentStreamBuilder path ops |
| Solid fills | Exact | RGB color → `rg` operator |
| Gradients | Approximate | PDF Type 2/3 shading functions |
| Text (position, size, color) | Near-exact | Font metrics for positioning, embedded fonts |
| Text (kerning, wrapping) | Good | Same FontMetricsDB, same line-breaking logic |
| Images (PNG, JPEG) | Exact | Embed as XObject |
| Effects (shadows) | Approximate | PDF has limited effect support |
| Tables | Good | Cell-by-cell rendering via content stream |
| Groups | Exact | PDF Form XObject with transform matrix |

---

## 9. Phased Roadmap

Each phase is independently shippable and adds user-facing value.

### Phase 0: Foundation — Shared Infrastructure Extraction

**Delivers**: Clean package boundaries, no user-facing changes, all tests pass.

**Scope**: Medium (1-2 weeks)

**Actions**:
1. Create `packages/elements/` — extract element model from `packages/pdf-signer/src/elements/`
2. Create `packages/render/` — extract FontMetricsDB, media cache, color/matrix utilities from `packages/core/`
3. Update `pnpm-workspace.yaml`, wire package dependencies
4. Update all import paths (use barrel re-exports for backward compat during transition)
5. Split `@opendockit/pdf-signer` → `@opendockit/pdf` + `@opendockit/pdf-signer`

**Testing**: All 3,349 existing tests pass. Add package boundary tests (verify exports).

**Key files**:
- NEW: `packages/elements/package.json`, `packages/elements/src/index.ts`
- NEW: `packages/render/package.json`, `packages/render/src/index.ts`
- NEW: `packages/pdf/package.json`, `packages/pdf/src/index.ts`
- MODIFY: `packages/core/package.json` (remove extracted code, add dep on render/elements)
- MODIFY: `packages/pdf-signer/package.json` (slim to signing only, dep on @opendockit/pdf)

**Dependencies**: None (first phase).

---

### Phase 1: PDF Visual Regression — Quality Measurement

**Delivers**: Measurable quality scores for PDF native rendering, prioritized fix list, immediate rendering improvements.

**Scope**: Medium (1-2 weeks)

**Actions**:
1. Create `scripts/visual-compare-pdf.mjs` — port RMSE baseline system for PDF
2. Select 20-30 reference PDFs (mix of simple, complex, text-heavy, image-heavy)
3. Render via PDF.js (reference) and NativeRenderer (test)
4. Establish per-page RMSE baselines
5. Generate 3-pane gallery for PDF (reuse existing `generate-visual-gallery.sh`)
6. Fix top-priority rendering gaps:
   - JPEG image decoding (pre-decode in evaluator, pass RGBA data)
   - Inline image support (BI/ID/EI operators)
   - Any other quick wins revealed by RMSE data

**Testing**: New `pnpm test:visual:pdf` command. Regression guard on native renderer quality.

**Key files**:
- NEW: `scripts/visual-compare-pdf.mjs`
- MODIFY: `packages/pdf-signer/src/render/evaluator.ts` (JPEG, inline images)
- MODIFY: `packages/pdf-signer/src/render/canvas-graphics.ts` (image rendering)
- MODIFY: `scripts/generate-visual-gallery.sh` (extend for PDF)

**Dependencies**: Phase 0 (packages split, but could do without if needed).

---

### Phase 2: RenderBackend Abstraction — The Architectural Pivot

**Delivers**: Pluggable rendering backends. Zero behavior change for users — CanvasBackend wraps existing code identically.

**Scope**: Large (2-3 weeks)

**Actions**:
1. Define `RenderBackend` interface in `@opendockit/render`
2. Implement `CanvasBackend` — wraps `CanvasRenderingContext2D`, delegates all calls
3. Refactor `RenderContext` to carry `backend: RenderBackend` instead of `ctx: CanvasRenderingContext2D`
4. Update all 10 renderers (shape, fill, line, effect, text, picture, group, table, connector, slide) to use `backend.*` instead of `ctx.*`
5. Visual regression: existing PPTX baselines must be **identical** (proves zero behavior change)

**Testing**: All existing visual baselines pass unchanged. Add RenderBackend contract tests.

**Key files**:
- NEW: `packages/render/src/render-backend.ts` (interface)
- NEW: `packages/render/src/canvas-backend.ts` (implementation)
- MODIFY: `packages/core/src/drawingml/renderer/render-context.ts`
- MODIFY: All renderer files in `packages/core/src/drawingml/renderer/`

**Dependencies**: Phase 0 (render package exists).

**Risk mitigation**: This is the riskiest phase — touching all renderers. The visual regression baselines are the safety net. If any baseline regresses, the refactor has a bug.

---

### Phase 3: PDF Export — First Cross-Format Feature

**Delivers**: `SlideKit.exportPDF()` — convert any PPTX to PDF with embedded fonts.

**Scope**: Large (3-4 weeks)

**Actions**:
1. Implement `PDFBackend` in `@opendockit/render` — wraps `ContentStreamBuilder`
2. Implement IR→PDF translation for each element type:
   - Shapes: geometry paths → PDF path operators
   - Fills: solid → `rg`, gradient → PDF shading function
   - Lines: stroke → `RG`, `w`, `J`, `j`, `d`
   - Text: font embedding + text positioning via `BT`/`ET`/`Tf`/`Tj`/`Tm`
   - Images: embed PNG/JPEG as XObject, `Do` operator
   - Groups: PDF Form XObject with transform matrix
   - Tables: cell-by-cell rendering
3. Font embedding: use pdfbox-ts TrueType subsetter for used glyphs
4. Page setup: slide dimensions → PDF page size
5. Multi-slide: one PDF page per slide

**Testing**:
- New `pnpm test:visual:export` — PPTX→PDF→render compared to PPTX→Canvas
- Unit tests for each IR→PDF translation
- Text extraction: verify exported PDF text matches PPTX source text

**Key files**:
- NEW: `packages/render/src/pdf-backend.ts`
- NEW: `packages/pptx/src/export/pdf-exporter.ts`
- MODIFY: `packages/pptx/src/viewport/slide-kit.ts` (add `exportPDF()` method)

**Dependencies**: Phase 2 (RenderBackend interface).

---

### Phase 4: Unified Edit Model — Interactive Editing for Both Formats

**Delivers**: Same selection/drag/resize interaction for PPTX and PDF elements.

**Scope**: Large (2-3 weeks)

**Actions**:
1. Implement `EditableDocument<TSource>` in `@opendockit/elements`
2. Generalize `deriveElement()` with zero-alloc fast path
3. Wire PPTX: `EditablePresentation` extends `EditableDocument<PptxSource>`
4. Wire PDF: `EditablePdfDocument` extends `EditableDocument<PdfSource>`
5. Shared interaction store: selection, drag handles, resize, z-order
6. PDF-specific mutations: form field values, annotation edits, text content patches
7. Save pipelines: PPTX → XML patching, PDF → incremental COS update

**Testing**:
- Shared edit model unit tests (format-parameterized)
- PPTX round-trip: existing 24 tests
- PDF round-trip: load → edit → save → verify

**Key files**:
- NEW: `packages/elements/src/editable-document.ts`
- NEW: `packages/pdf/src/edit/editable-pdf-document.ts`
- MODIFY: `packages/core/src/edit/editable-presentation.ts` (extends shared base)
- MODIFY: `tools/viewer/` (unified edit mode)

**Dependencies**: Phase 0 (elements package), Phase 2 (for re-rendering after edits).

---

### Phase 5: Cross-Format Features — Power User Stories

**Delivers**: Unified viewer, batch conversion, element copy between formats.

**Scope**: Large (4+ weeks, ongoing)

**Actions**:
1. Unified viewer: detect format (PPTX vs PDF), render with appropriate pipeline, same UI
2. Batch conversion CLI: `npx opendockit convert *.pptx --format pdf`
3. SVG export backend
4. Element clipboard: copy element from PPTX, paste into PDF (or vice versa)
5. Text search across formats
6. Accessibility (screen reader support, keyboard navigation)
7. npm publish with comprehensive API docs

**Dependencies**: All prior phases.

---

## 10. Risks & Mitigations

### High Risk

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **RenderBackend refactor breaks rendering** | All PPTX rendering regresses | Visual regression baselines are the safety net — any Canvas2D change is caught |
| **Text measurement divergence** | PDF export text wraps differently than Canvas | Use shared FontMetricsDB for both; validate with visual comparison |
| **Bundle size bloat** | Library too large for web apps | Tree-shaking, dynamic imports for fonts/WOFF2, format-specific code in separate packages |

### Medium Risk

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **PDF gradient fidelity** | Complex gradients look wrong in export | Start with solid fills, add gradients progressively, visual regression catches gaps |
| **Font embedding edge cases** | CFF/OpenType fonts not subsettable | Fall back to Standard 14 or skip embedding, log diagnostic warning |
| **Coordinate system confusion** | PDF is bottom-left, OOXML is top-left | Element model uses points with consistent top-left origin; backends handle flipping |
| **COS object model complexity** | PDF editing harder than OOXML editing | Start with simple mutations (form fields, annotations), expand progressively |

### Low Risk

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Dependency conflicts** | npm install fails | Already verified: zero overlap between crypto (pdf-signer) and OOXML (core) |
| **Test suite interference** | Tests from one package affect another | pnpm workspace isolation, each package has own vitest config |
| **Git history confusion** | Hard to track changes across merged repos | Squash merge preserves clean main branch; original pdfbox-ts repo available for archaeology |

---

## 11. Success Metrics

### Quality

| Metric | Current | Phase 1 | Phase 3 | Phase 5 |
|--------|---------|---------|---------|---------|
| Total tests | 3,349 | 3,600+ | 4,000+ | 4,500+ |
| PPTX visual baselines | 54 slides | 54 slides | 54 slides | 54 slides |
| PDF visual baselines | 0 | 20-30 pages | 20-30 pages | 50+ pages |
| Export visual baselines | 0 | 0 | 54 slides | 54 slides |
| PDF corpus (no-crash) | 1,105 files | 1,105 files | 1,105 files | 1,105 files |

### Performance

| Metric | Target |
|--------|--------|
| PPTX slide render time | < 50ms (Canvas2D, 1920x1080) |
| PDF page render time (native) | < 100ms (1-page simple PDF) |
| PPTX→PDF export (10 slides) | < 2s |
| Font loading (3 families) | < 500ms |
| Memory (50-slide PPTX) | < 100MB |

### Bundle Size

| Import | Max Size |
|--------|----------|
| `@opendockit/elements` | 15KB |
| `@opendockit/render` (no fonts) | 50KB |
| `@opendockit/render` (with metrics) | 800KB |
| `@opendockit/pptx` (total) | 1.5MB |
| `@opendockit/pdf` (total) | 500KB |
| `@opendockit/pdf-signer` | 200KB + crypto |

---

## 12. Key Files Reference

### Already Cross-Format (touch carefully)

| File | What | Status |
|------|------|--------|
| `packages/pdf-signer/src/elements/types.ts` | Unified element model with PdfSource + PptxSource | Ready to extract |
| `packages/core/src/ir/drawingml-ir.ts` | Format-agnostic IR types (TransformIR, FillIR, TextBodyIR) | Keep in core |
| `packages/core/src/font/font-metrics-db.ts` | Shared font metrics database | Move to render |
| `packages/core/src/font/data/metrics-bundle.ts` | 42-family metrics data (~750KB) | Move to render |

### Key Refactor Targets

| File | What Changes | Phase |
|------|-------------|-------|
| `packages/core/src/drawingml/renderer/render-context.ts` | `ctx` → `backend` | 2 |
| `packages/core/src/drawingml/renderer/shape-renderer.ts` | Use RenderBackend | 2 |
| `packages/core/src/drawingml/renderer/fill-renderer.ts` | Use RenderBackend | 2 |
| `packages/core/src/drawingml/renderer/line-renderer.ts` | Use RenderBackend | 2 |
| `packages/core/src/drawingml/renderer/text-renderer.ts` | Use RenderBackend | 2 |
| `packages/core/src/drawingml/renderer/effect-renderer.ts` | Use RenderBackend | 2 |
| `packages/core/src/drawingml/renderer/picture-renderer.ts` | Use RenderBackend | 2 |
| `packages/core/src/drawingml/renderer/group-renderer.ts` | Use RenderBackend | 2 |
| `packages/core/src/drawingml/renderer/table-renderer.ts` | Use RenderBackend | 2 |
| `packages/core/src/drawingml/renderer/connector-renderer.ts` | Use RenderBackend | 2 |

### New Files to Create

| File | What | Phase |
|------|------|-------|
| `packages/elements/src/index.ts` | Unified element model exports | 0 |
| `packages/render/src/render-backend.ts` | RenderBackend interface | 2 |
| `packages/render/src/canvas-backend.ts` | Canvas2D implementation | 2 |
| `packages/render/src/pdf-backend.ts` | PDF ContentStream implementation | 3 |
| `packages/pptx/src/export/pdf-exporter.ts` | PPTX→PDF export API | 3 |
| `packages/elements/src/editable-document.ts` | Shared edit model base | 4 |
| `scripts/visual-compare-pdf.mjs` | PDF visual regression | 1 |
| `scripts/visual-compare-export.mjs` | Export visual regression | 3 |

---

## Appendix: Decision Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Keep IR types in `@opendockit/core` | They're the canonical OOXML contract, deeply integrated with parsers | Move to elements (too much coupling), move to render (wrong abstraction level) |
| Element model uses points (not EMU) | PDF uses points natively; EMU carried in PptxSource for lossless round-trip | Use EMU everywhere (forces PDF to convert), use pixels (DPI-dependent) |
| CanvasBackend wraps ctx 1:1 | Zero behavior change, visual regression proves it | Abstract at higher level (Path2D, shapes) — too much work, risk of subtle changes |
| Split pdf-signer from pdf | Signing is security-critical, separate review/release cycle | Keep together (simpler, but couples document API to crypto deps) |
| Squash merge for git subtree | Clean main branch history | Full history (too noisy, unrelated commit messages) |
