# Unified Element Model — opendockit Brief

_Created: 2026-02-25 | Updated: 2026-03-08_

## Status

**As of 2026-03-08, the `@opendockit/elements` package exists and is fully implemented.** The "What opendockit Needs to Build" items below are complete. See `packages/pdf-signer/src/elements/types.ts` for the canonical type definitions (re-exported from `@opendockit/elements`).

The PPTX→Elements bridge (`packages/pptx/src/elements/`) is complete. The `@opendockit/render` package provides `FontMetricsDB`, color utilities, and matrix math. The `PDFBackend` (`packages/render/src/pdf-backend.ts`) is complete for Wave 2 scope.

See `docs/plans/fan-out-strategy.md` for current status of Waves 3–4 (text, images, gradients in PDF export).

---

## Context

pdfbox-ts built a **Unified Element Model** — a format-agnostic representation of positioned content on fixed-size pages. The types now live in `packages/pdf-signer/src/elements/types.ts` and are published as `@opendockit/elements`.

The model works for both **PDF pages** and **PPTX slides**, since both are fundamentally fixed-size canvases with positioned elements (text, shapes, images).

---

## What opendockit Already Has

OpenDocKit's `SlideElementIR` is already ~80% of a universal element model:

- **Typed element tree**: `DrawingMLShapeIR`, `TextBoxIR`, `ImageIR`, `TableIR`, `GroupIR`, `ConnectorIR`
- **Positions and dimensions**: `xfrm: { off: {x, y}, ext: {cx, cy} }` in EMUs
- **Rich text**: `TextBodyIR → ParagraphIR → RunIR` with character properties
- **Fills and strokes**: Solid, gradient, pattern, picture fills
- **Theme resolution at parse time**: Renderers see final values

The parser, Canvas2D renderer, and font system do NOT need to change.

---

## What opendockit Built (Completed 2026-03-08)

### 1. Import shared PageModel types — DONE

Types live in `@opendockit/elements` (published from `packages/pdf-signer/src/elements/types.ts`):

```typescript
import type { PageModel, PageElement, TextElement, ShapeElement } from '@opendockit/elements';
```

### 2. SlideElementIR → PageModel bridge — DONE (~200 LOC in `packages/pptx/src/elements/`)

Map existing IR to the shared model:

| SlideElementIR | PageElement | Notes |
|---|---|---|
| `DrawingMLShapeIR` | `ShapeElement` | `prstGeom` → `shapeType` |
| `TextBoxIR` | `TextElement` | paragraphs/runs already match |
| `ImageIR` | `ImageElement` | |
| `GroupIR` | `GroupElement` | flatten children |
| `ConnectorIR` | `PathElement` | convert endpoints to SVG path |
| `TableIR` | `GroupElement` with child `ShapeElement`s | or dedicated `TableElement` |

**Unit conversion:** EMU → points = divide by 12700 (for visual coordinates only).

**Critical: Round-trip fidelity.** The bridge MUST preserve original EMU values for
lossless write-back. Every PageElement has an opaque `source` field:

```typescript
interface PptxSource {
  format: 'pptx';
  offX: number;    // original EMU x (integer, lossless)
  offY: number;    // original EMU y
  extCx: number;   // original EMU width
  extCy: number;   // original EMU height
  rot: number;     // 60,000ths of a degree
  passthrough?: Record<string, unknown>;  // effect chains, 3D, etc.
}
```

The interaction layer works in points. The exporter applies deltas back to
original EMU values: `source.offX += deltaPoints * 12700`. No cumulative drift.

**Nested groups:** PPTX `<p:grpSp>` flattens to parentId chains in the flat list.
Import multiplies group transforms into children (absolute positions). The original
group transform is stored in `source.groupTransform` + `GroupElement.groupTransform`
for reconstructing nested XML on export.

### 3. Wire interaction layer into SlideViewport — FUTURE (Wave 3+)

Import shared interaction components (DOM overlay, hit tester, selection manager) and wire into the existing `SlideViewport`:

- `SlideViewport` already manages canvas lifecycle, DPI scaling, resize
- Add DOM overlay layer on top of canvas
- Add `SlideKit.getSlideElements()` API
- Add interaction events: `onElementSelect`, `onElementHover`, `onElementMove`

### 4. PPTX write-back — PARTIAL (edit pipeline complete, PageModel delta write-back future)

PPTX edit pipeline is complete (Wave 0, 2026-02-27):
- `EditablePresentation` + `EditableSlideKit` + save pipeline
- `getDirtyParts()` → `patchPartXml()` → `OpcPackageWriter.build()`

PageModel-level interaction (drag handles, resize) is deferred until Wave 3 interaction layer.

---

## Timeline (Updated 2026-03-08)

| Phase | Status | Notes |
|-------|--------|-------|
| Element model types | **Done** | `@opendockit/elements` published |
| PPTX edit pipeline | **Done** | `EditablePresentation`, save pipeline, round-trip tests |
| IR→PageModel bridge | **Done** | `packages/pptx/src/elements/` |
| RenderBackend + CanvasBackend | **Done** | All 10 renderers migrated |
| PDFBackend (shapes, paths) | **Done** | Wave 2 scope |
| PDF export text | In Progress | Wave 3 |
| PDF export images, gradients | Planned | Wave 3 |
| DOM overlay interaction layer | Planned | Wave 4 |
| Text editing, write-back | Stretch | Wave 4+ |

---

## Key Decisions Made

1. **Write from scratch** (not fork/adapt existing OSS) — the interaction layer is ~500 LOC, not worth coupling to tldraw/Excalidraw/Fabric
2. **Flat element list** (not deep tree) — nested groups flatten via `parentId` chains, tree reconstructable for export
3. **DOM overlay for interaction** (not canvas hit-testing) — browser gives selection, drag, accessibility for free
4. **Points for visual, originals for export** — interaction works in points; `source` bag preserves original EMUs/CTMs for lossless round-trip. Deltas applied to originals on export.
5. **Inline first, extract later** — build in pdfbox-ts `src/elements/`, extract to shared package when opendockit is ready
6. **`source` bag is opaque** — the interaction layer NEVER reads `source`. Anything OOXML-specific (effects, 3D, connector routing, text body anchoring) rides in `source.passthrough` untouched.
