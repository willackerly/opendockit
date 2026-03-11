# Canvas Object Tree — Structural Rendering Comparison Plan

**Created:** 2026-03-11
**Status:** Planned
**Goal:** Capture every Canvas2D operation from PDF rendering as a structured tree, enabling direct comparison with PPTX TracingBackend output to identify typeface, positioning, and color differences.

## Motivation

Pixel RMSE (currently 0.069 avg) tells you *something is wrong* but not *what*. The PPTX pipeline already captures structured rendering via TracingBackend (759 lines, 42 tests). The PDF pipeline renders to Canvas2D but doesn't record operations structurally. Bridging this gap gives us:

- **Per-character font comparison** — exact typeface, size, weight vs. ground truth
- **Position delta analysis** — character-level X/Y offset from expected position
- **Color accuracy** — fill/stroke color comparison per element
- **Cross-format comparison** — PPTX trace vs PDF trace of the same content
- **Actionable diagnostics** — "character 'A' at (100, 200) used Helvetica 12pt instead of Arial 11pt"

## What Already Exists (Leverage This)

### PPTX Side (complete)
| Component | File | Lines | Status |
|-----------|------|-------|--------|
| TracingBackend | `packages/core/src/drawingml/renderer/tracing-backend.ts` | 759 | Production, 42 tests |
| Trace types | `packages/core/src/drawingml/renderer/trace-types.ts` | 186 | Stable |
| trace-to-elements | `packages/elements/src/debug/trace-to-elements.ts` | 463 | Production, 21 tests |
| element-matcher | `packages/elements/src/debug/element-matcher.ts` | 284 | Production |
| property-diff | `packages/elements/src/debug/property-diff.ts` | 345 | Production |
| RenderBackend interface | `packages/core/src/drawingml/renderer/render-backend.ts` | 348 | Stable |

### PDF Side (partial)
| Component | File | Lines | Status |
|-----------|------|-------|--------|
| Evaluator (dual output) | `packages/pdf-signer/src/render/evaluator.ts` | 2,853 | Emits OperatorList + PageElement[] |
| Canvas graphics | `packages/pdf-signer/src/render/canvas-graphics.ts` | 1,043 | Renders ops, no recording |
| OperatorList | `packages/pdf-signer/src/render/operator-list.ts` | 44 | fnArray + argsArray |
| OPS codes | `packages/pdf-signer/src/render/ops.ts` | 141 | 95 operation codes |
| NativeRenderer | `packages/pdf-signer/src/render/NativeRenderer.ts` | 450+ | Orchestrator |
| Ground truth extractor | `packages/pdf-signer/src/render/__tests__/ground-truth-extractor.ts` | 249 | pdftotext XML |
| Element matcher (PDF) | `packages/pdf-signer/src/render/__tests__/element-matcher.ts` | 660 | 42 tests, 8% accuracy |
| Element diff harness | `packages/pdf-signer/src/render/__tests__/element-diff-harness.test.ts` | 134 | Integration test |

### Shared Element Model
| Component | File | Status |
|-----------|------|--------|
| PageElement types | `packages/pdf-signer/src/elements/types.ts` | TextElement, ShapeElement, ImageElement, PathElement, GroupElement |
| Exports | `packages/elements/src/index.ts` | matchElements, diffElements, traceToElements all exported |

## Architecture

### Key Insight

The PPTX TracingBackend emits `TraceEvent[]` (TextTraceEvent, ShapeTraceEvent, ImageTraceEvent). The PDF canvas-graphics.ts dispatches the same kinds of operations. **Make PDF emit the same TraceEvent format** so all downstream infrastructure (trace-to-elements, element-matcher, property-diff) works unchanged.

### Design: CanvasTreeRecorder

A thin recording layer that wraps `NativeCanvasGraphics` and captures every visual operation as a `TraceEvent`, mirroring the TracingBackend format.

```
PDF Content Stream
     │
     ▼
  evaluator.ts ──→ OperatorList (fnArray + argsArray)
     │
     ▼
  NativeCanvasGraphics.execute(opList)
     │
     ├──→ Canvas2D (actual rendering, unchanged)
     │
     └──→ CanvasTreeRecorder (new, opt-in)
           │
           ▼
       TraceEvent[] (same format as PPTX TracingBackend)
           │
           ▼
       traceToElements() ──→ PageElement[] (unified model)
           │
           ▼
       matchElements() / diffElements() ──→ DiffReport
```

### What CanvasTreeRecorder Captures

For each visual operation in canvas-graphics.ts:

**Text operations** (`showText`, `renderGlyph`):
```typescript
TextTraceEvent {
  type: 'text'
  text: string                    // glyph content
  x, y: number                   // world-space position (points)
  width: number                  // advance width
  fontSizePt: number             // effective font size
  fontString: string             // CSS font string (includes family, weight, style)
  fillStyle: string              // CSS color
  ctm: [a, b, c, d, tx, ty]     // current transform matrix
  charAdvances?: number[]        // per-character widths
  // Context attribution:
  shapeId?: string               // (from marked content or element index)
  paragraphIndex?: number
  runIndex?: number
}
```

**Shape operations** (`fillPath`, `strokePath`, `fillStrokePath`):
```typescript
ShapeTraceEvent {
  type: 'shape'
  operation: 'fill' | 'stroke' | 'fillRect' | 'strokeRect' | 'fillStroke'
  x, y, width, height: number   // bounding box in points
  fill?: string                 // CSS fill color
  stroke?: string               // CSS stroke color
  lineWidth?: number
  ctm: [a, b, c, d, tx, ty]
}
```

**Image operations** (`paintImage`):
```typescript
ImageTraceEvent {
  type: 'image'
  x, y, width, height: number   // bounds in points
  ctm: [a, b, c, d, tx, ty]
  imageRef?: string              // XObject name
}
```

### Implementation Approach

**Option A (recommended): Instrument NativeCanvasGraphics directly**

Add an optional `recorder: CanvasTreeRecorder` field to NativeCanvasGraphics. When present, each rendering method emits a trace event alongside its canvas call. This is identical to how TracingBackend wraps CanvasBackend — but adapted for the PDF ops-dispatch architecture.

Key instrumentation points in canvas-graphics.ts:
- `renderGlyph()` → emit TextTraceEvent (with font, size, position, color)
- `fillPath()` / `strokePath()` / `fillStrokePath()` → emit ShapeTraceEvent (with bounds, colors)
- `paintImage()` → emit ImageTraceEvent (with bounds, image ref)
- `save()` / `restore()` → maintain CTM stack for coordinate tracking
- `transform()` → update shadow CTM (same pattern as TracingBackend)

**Option B: Intercept at OperatorList level**

Build a tree from the OperatorList fnArray/argsArray before dispatch. Simpler but loses computed values (effective font size after matrix, actual fill color after pattern resolution).

**Option A is better** because it captures what was *actually rendered*, not what was *requested*.

## Execution Plan

### Phase 1: CanvasTreeRecorder (core recording)

1. Create `packages/pdf-signer/src/render/canvas-tree-recorder.ts`
   - Class with `events: TraceEvent[]` accumulator
   - Shadow CTM stack (copy pattern from TracingBackend's matrix tracking)
   - Methods: `recordText()`, `recordShape()`, `recordImage()`, `pushState()`, `popState()`
   - World-space coordinate conversion using shadow CTM

2. Instrument `canvas-graphics.ts`
   - Add `recorder?: CanvasTreeRecorder` field
   - In `renderGlyph()`: extract font family, size, position, color → `recorder.recordText()`
   - In `fillPath()` / `strokePath()`: extract bounds, fill/stroke → `recorder.recordShape()`
   - In `paintImage()`: extract bounds → `recorder.recordImage()`
   - In `save()` / `restore()` / `transform()`: mirror to recorder's CTM stack

3. Wire into `NativeRenderer`
   - Add `renderPageWithTrace(pageIndex, options)` → `{ canvas, trace: RenderTrace }`
   - Or add `trace: true` option to existing `renderPage()`

4. Tests: 20-30 tests
   - Basic text recording (position, font, color)
   - Path recording (rectangles, curves)
   - Image recording
   - CTM tracking through save/restore
   - Font size extraction from text matrix
   - Color format normalization

### Phase 2: Comparison Pipeline (wire to existing infra)

1. Convert PDF trace → PageElement[] via existing `traceToElements()`
   - May need minor adapter if PDF trace events differ slightly from PPTX format

2. Compare against ground truth:
   - **PDF-vs-ground-truth**: PDF trace elements vs pdftotext elements (existing flow, but with better data)
   - **PDF-vs-PPTX**: When same content exists in both formats, compare traces directly

3. Generate comparison report
   - Reuse `generateDiffReport()` from `packages/elements/src/debug/property-diff.ts`
   - Add font-focused columns: expected font vs actual font, size delta, position delta

4. Integration test
   - `canvas-tree-harness.test.ts` — render PDF, capture trace, compare to ground truth
   - Target: >90% text accuracy (up from 8.2% with basic element extraction)

### Phase 3: Cross-Format Comparison

1. Render same content as PPTX and PDF
2. Capture TracingBackend output (PPTX) and CanvasTreeRecorder output (PDF)
3. Run `matchElements()` between the two sets
4. Generate cross-format diff report highlighting:
   - Font family mismatches
   - Font size deltas
   - Position offsets
   - Color differences
   - Missing/extra elements

### Phase 4: Diagnostic Tools

1. HTML report with side-by-side canvas tree visualization
2. Click-to-inspect: select a text run, see its trace event details
3. Filter by severity: show only critical mismatches
4. Integration with existing element-diff-report.html

## Why This Will Dramatically Improve Accuracy

The current 8.2% text accuracy from element-diff-harness comes from:
1. **Coordinate system mismatch** — PDF bottom-left vs pdftotext top-left, with imprecise Y-flip
2. **Basic element emission** — evaluator emits one TextElement per text operation, no run grouping
3. **No font capture** — element matcher can't compare fonts because elements don't carry CSS font strings

CanvasTreeRecorder fixes all three:
1. **World-space coordinates** — CTM-tracked, same as TracingBackend (proven accurate for PPTX)
2. **Per-glyph recording** — every renderGlyph() call captured with exact position
3. **Full font info** — CSS font string, effective size, fill color all captured at render time

## Reference: pdf.js Architecture

pdf.js uses a similar pattern — `CanvasGraphics` dispatches operations from an `OperatorList`. Their text rendering in `src/display/canvas.js` tracks:
- Font substitution decisions
- Text positioning via TJ/Tj operators
- Glyph width adjustments

We should reference their approach for:
- How they handle font fallback/substitution naming
- How they compute effective text positions from the text matrix
- How they handle Type3 fonts and composite fonts

## Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| Text accuracy (vs ground truth) | 8.2% | >90% |
| Position delta (avg) | 29.7pt | <3pt |
| Font family match rate | not measured | >80% |
| Cross-format comparison | not available | functional |

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/pdf-signer/src/render/canvas-tree-recorder.ts` | **Create** | Core recording class |
| `packages/pdf-signer/src/render/canvas-graphics.ts` | Modify | Add recorder instrumentation |
| `packages/pdf-signer/src/render/NativeRenderer.ts` | Modify | Add trace capture option |
| `packages/pdf-signer/src/render/__tests__/canvas-tree-recorder.test.ts` | **Create** | Unit tests |
| `packages/pdf-signer/src/render/__tests__/canvas-tree-harness.test.ts` | **Create** | Integration test |
| `packages/pdf-signer/src/render/index.ts` | Modify | Export CanvasTreeRecorder |

## Dependencies

- Existing: TracingBackend, trace-to-elements, element-matcher, property-diff (all in packages/elements and packages/core)
- Reference: pdf.js source at `/Users/will/dev/pdf.js/` (cloned from https://github.com/mozilla/pdf.js)
  - `src/display/canvas.js` — Canvas2D rendering engine (their equivalent of our canvas-graphics.ts)
  - `src/core/evaluator.js` — content stream evaluator (their equivalent of our evaluator.ts)
  - `src/core/fonts.js` — font handling and substitution
