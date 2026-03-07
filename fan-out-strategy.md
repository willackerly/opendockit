# Fan-Out Execution Strategy

**Created:** 2026-03-07
**Purpose:** Maximum-parallelism execution plan for the PDF/Office merger

---

## Principle

Every work item runs in an **isolated git worktree**. Items within a wave have **zero file conflicts** so they merge cleanly. Waves execute sequentially only where there are hard data dependencies.

---

## Wave 0 — Immediate (5 parallel worktrees, zero cross-dependencies)

These touch completely disjoint file sets. Start all 5 simultaneously.

### W0-A: PDF Visual Regression Script
**Files:** `scripts/visual-compare-pdf.mjs` (NEW), `scripts/generate-visual-gallery.sh` (minor extend)
**Conflict zone:** None — scripts/ only, new file
**What:**
- Port RMSE baseline system from `visual-compare.mjs` to PDF
- Select 20-30 reference PDFs from `packages/pdf-signer/test-pdfs/` + robustness corpus
- Render each page via PDF.js (reference) and NativeRenderer (test)
- Compute per-page RMSE, output baselines JSON
- Extend gallery script for PDF 3-pane composites
**Output:** `pnpm test:visual:pdf` command, baseline RMSE numbers, gap analysis

### W0-B: NativeRenderer Rendering Fixes
**Files:** `packages/pdf-signer/src/render/evaluator.ts`, `canvas-graphics.ts`, tests
**Conflict zone:** None — pdf-signer render internals only
**What:**
- JPEG image async decode (pre-decode in evaluator, pass RGBA ImageData)
- Inline image support (BI/ID/EI operator trio)
- Any other quick-win operators revealed by W0-A's gap analysis
**Output:** Measurable RMSE improvement on PDF test suite

### W0-C: RenderBackend Interface + CanvasBackend
**Files:** NEW files only — `packages/core/src/drawingml/renderer/render-backend.ts`, `canvas-backend.ts`
**Conflict zone:** None — new files in existing directory
**What:**
- Define `RenderBackend` interface from Canvas2D audit (see below)
- Implement `CanvasBackend` as 1:1 wrapper around `CanvasRenderingContext2D`
- Handle the hard patterns: Path2D abstraction, gradient lifecycle, text measurement, image sources
- Contract tests: every method on CanvasBackend produces identical Canvas2D calls
**Key decisions from audit:**
```
Surface area: 45 unique Canvas2D methods/properties
Hard patterns: Path2D objects (6 renderers), CanvasGradient lifecycle (2),
              measureText TextMetrics (1), drawImage CanvasImageSource (2),
              shadow global state (1), letterSpacing/direction duck-typing (1)
```
**Output:** Importable interface + Canvas2D implementation with full test coverage

### W0-D: Elements Package Scaffold
**Files:** NEW `packages/elements/` directory, `pnpm-workspace.yaml` (1 line)
**Conflict zone:** pnpm-workspace.yaml only (trivial merge with W0-E)
**What:**
- Create `packages/elements/` with package.json, tsconfig, vitest config
- Copy types from `packages/pdf-signer/src/elements/types.ts` (the source of truth)
- Add `PageModel`, `PageElement`, all element types, source bags
- Add spatial query utilities (hit-test, bounds, overlap)
- Add dirty tracking primitives (WeakSet-based, pattern from EditTracker)
- Leave re-exports in pdf-signer for backward compat
**Output:** `@opendockit/elements` importable with full type coverage

### W0-E: Render Package Scaffold
**Files:** NEW `packages/render/` directory, `pnpm-workspace.yaml` (1 line)
**Conflict zone:** pnpm-workspace.yaml only (trivial merge with W0-D)
**What:**
- Create `packages/render/` with package.json, tsconfig, vitest config
- Move `FontMetricsDB` + metrics-bundle from `packages/core/src/font/`
- Move color utilities (rgb→string, theme color resolution helpers)
- Move matrix math utilities
- Leave re-exports in core for backward compat
**Output:** `@opendockit/render` importable, core still works via re-exports

---

## Wave 1 — After Wave 0 merges (10 parallel worktrees!)

### The Big Renderer Refactor

Once W0-C (RenderBackend + CanvasBackend) is merged, all 10 renderers can be updated **simultaneously** in separate worktrees. Each renderer is a self-contained file with no cross-renderer dependencies.

| Worktree | File | Lines | Complexity |
|----------|------|-------|------------|
| W1-A | `shape-renderer.ts` | ~200 | Low — save/restore, translate, rotate, scale, beginPath, rect |
| W1-B | `fill-renderer.ts` | ~250 | **High** — gradient lifecycle, Path2D fill |
| W1-C | `line-renderer.ts` | ~350 | Medium — stroke, lineDash, Path2D, arrow drawing |
| W1-D | `text-renderer.ts` | ~600 | **High** — measureText, font string, letterSpacing, clip |
| W1-E | `effect-renderer.ts` | ~100 | Low — shadow properties only |
| W1-F | `picture-renderer.ts` | ~200 | Medium — drawImage, clip with Path2D |
| W1-G | `group-renderer.ts` | ~150 | Low — save/restore, translate, scale |
| W1-H | `table-renderer.ts` | ~300 | Medium — rect, stroke, border lines |
| W1-I | `connector-renderer.ts` | ~200 | Medium — bezierCurveTo, path building |
| W1-J | `render-context.ts` + `slide-viewport.ts` + `background-renderer.ts` | ~200 | Medium — ctx→backend swap, gradient backgrounds |

**Each worktree does:**
1. Import `RenderBackend` and `CanvasBackend`
2. Replace `rctx.ctx` → `rctx.backend` (or `const backend = rctx.backend`)
3. Replace all `ctx.method()` → `backend.method()`
4. Handle special patterns (Path2D, gradients, measureText) per file
5. Run visual regression — RMSE must be identical to pre-refactor

**Conflict zone:** Each touches exactly ONE renderer file + `render-context.ts` type change (W1-J). Merge W1-J first, then all others merge cleanly.

**Safety net:** PPTX visual regression baselines. Any RMSE change = bug in the refactor.

---

## Wave 2 — After Wave 1 merges (3 parallel worktrees)

### W2-A: PDFBackend Implementation
**Files:** NEW `packages/render/src/pdf-backend.ts`
**What:**
- Implement `RenderBackend` wrapping `ContentStreamBuilder`
- Map each interface method to PDF operators:
  - `save/restore` → `q/Q`
  - `translate/scale/rotate` → `cm` matrix
  - `moveTo/lineTo/bezierCurveTo` → `m/l/c`
  - `fill/stroke` → `f/S/B`
  - `setFillColor` → `rg` (RGB) or `k` (CMYK)
  - `fillText` → `BT/Tf/Tm/Tj/ET`
  - `drawImage` → embed XObject + `Do`
  - Gradients → Type 2/3 shading functions
- Unit tests: verify each method produces correct PDF operators

### W2-B: PDF Package Split
**Files:** NEW `packages/pdf/`, MODIFY `packages/pdf-signer/`
**What:**
- Extract COS model, parser, writer, document API, renderer, fonts, extraction into `@opendockit/pdf`
- Slim `@opendockit/pdf-signer` to signing-only (imports from `@opendockit/pdf`)
- All 1,566 pdf-signer tests still pass (split across two packages)

### W2-C: PPTX→Elements Bridge
**Files:** NEW `packages/core/src/elements/` or `packages/pptx/src/elements/`
**What:**
- Converter: `SlideElementIR` → `PageElement` with `PptxSource`
- Maps each IR element kind to unified element type
- Enables the interaction layer to work on PPTX slides via the element model
- Tests: round-trip element conversion (IR→Element→verify positions)

---

## Wave 3 — After Wave 2 merges (3 parallel worktrees)

### W3-A: PDF Export Pipeline
**Files:** NEW `packages/pptx/src/export/pdf-exporter.ts`
**What:**
- `SlideKit.exportPDF()` using PDFBackend + pdfbox-ts document creation
- Per-element-type IR→PDF translation (shapes, text, images, tables, groups)
- Font embedding via TrueType subsetter
- Multi-slide → multi-page

### W3-B: Export Visual Regression
**Files:** NEW `scripts/visual-compare-export.mjs`
**What:**
- Render PPTX via Canvas (reference)
- Export PPTX→PDF, render PDF via NativeRenderer (test)
- Compute RMSE between the two
- Establish baselines for export fidelity

### W3-C: Unified Edit Model
**Files:** NEW `packages/elements/src/editable-document.ts`, modifications to core and pdf edit models
**What:**
- `EditableDocument<TSource>` base class
- `deriveElement()` with zero-alloc fast path
- Wire PPTX and PDF edit models as subclasses
- Shared interaction store (selection, drag, resize)

---

## Wave 4 — After Wave 3 (2 parallel worktrees)

### W4-A: Unified Viewer
- Detect format, render with appropriate pipeline, same edit UI
- Wire up PDF edit mode in viewer

### W4-B: Cross-Format Features
- Element clipboard (copy from PPTX, paste in PDF)
- Batch conversion CLI
- Text search across formats

---

## Dependency DAG

```
Wave 0 (all parallel):
  W0-A ─────────────────────────────────────┐
  W0-B ─────────────────────────────────────┤
  W0-C ──┬──────────────────────────────────┤
  W0-D ──┤                                  │
  W0-E ──┘                                  │
         │                                  │
Wave 1 (all parallel, after W0-C merges):   │
  W1-A through W1-J (10 parallel) ──────────┤
                                            │
Wave 2 (all parallel, after W1 merges):     │
  W2-A (PDFBackend) ────────────┐           │
  W2-B (pdf split) ─────────────┤           │
  W2-C (PPTX→Elements) ─────────┤           │
                                │           │
Wave 3 (after W2):              │           │
  W3-A (PDF export) ←── W2-A ───┘           │
  W3-B (export regression) ←── W3-A, W0-A ─┘
  W3-C (unified edit) ←── W2-C

Wave 4 (after W3):
  W4-A (unified viewer) ←── W3-A, W3-C
  W4-B (cross-format) ←── W3-A, W3-C
```

## Parallelism Summary

| Wave | Parallel Worktrees | Estimated Duration | Cumulative |
|------|-------------------|-------------------|------------|
| 0 | 5 | 2-3 days | 2-3 days |
| 1 | 10 | 1-2 days | 4-5 days |
| 2 | 3 | 2-3 days | 7-8 days |
| 3 | 3 | 3-4 days | 10-12 days |
| 4 | 2 | 3-4 days | 13-16 days |
| **Total** | **23 worktrees** | | **~2-3 weeks** |

Sequential execution of the same work: ~8-10 weeks. **~4x speedup from parallelism.**

---

## Merge Protocol

1. Each worktree creates a feature branch: `merge/<wave>-<id>` (e.g., `merge/w0-c-render-backend`)
2. All tests must pass in the worktree before merge
3. Worktrees within a wave merge to main in any order (no conflicts by design)
4. After all worktrees in a wave merge, run full test suite on main before starting next wave
5. Visual regression baselines are the ultimate safety net for renderer changes

## Critical Path

The longest chain determines the minimum wall-clock time:

```
W0-C (RenderBackend) → W1-D (text-renderer refactor) → W2-A (PDFBackend) → W3-A (PDF export)
```

This is the critical path. Everything else can absorb delays without affecting timeline.

## Agent Assignment Strategy

For maximum throughput, assign agents by complexity:

- **Opus agents** (high complexity): W0-C (RenderBackend), W1-B (fill gradients), W1-D (text renderer), W2-A (PDFBackend), W3-A (PDF export)
- **Sonnet agents** (medium complexity): W0-A (regression script), W0-B (renderer fixes), W1-C, W1-F, W1-H, W1-I, W2-B, W2-C
- **Haiku agents** (low complexity): W0-D, W0-E (package scaffolding), W1-A, W1-E, W1-G, W1-J (simple refactors)
