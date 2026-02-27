# Unified Element Model — opendockit Brief

_Created: 2026-02-25_

## Context

pdfbox-ts is building a **Unified Element Model** — a format-agnostic representation of positioned content on fixed-size pages. The full plan lives in `pdfbox-ts/docs/ELEMENT_MODEL_PLAN.md`.

The same model is designed to work for both **PDF pages** and **PPTX slides**, since both are fundamentally fixed-size canvases with positioned elements (text, shapes, images).

This document tracks what opendockit needs to do to participate.

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

## What opendockit Needs to Build

### 1. Import shared PageModel types

When pdfbox-ts extracts `src/elements/` to `@dockit/elements`, import the types:

```typescript
import type { PageModel, PageElement, TextElement, ShapeElement } from '@dockit/elements';
```

Until then, can copy the interfaces (they're ~150 LOC of pure TypeScript types).

### 2. SlideElementIR → PageModel bridge (~200 LOC)

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

### 3. Wire interaction layer into SlideViewport

Import shared interaction components (DOM overlay, hit tester, selection manager) and wire into the existing `SlideViewport`:

- `SlideViewport` already manages canvas lifecycle, DPI scaling, resize
- Add DOM overlay layer on top of canvas
- Add `SlideKit.getSlideElements()` API
- Add interaction events: `onElementSelect`, `onElementHover`, `onElementMove`

### 4. PPTX write-back (future)

When editing is needed:
- `PageModel` changes → update `SlideElementIR`
- `SlideElementIR` changes → mutate OOXML DrawingML XML
- Rebuild ZIP and save

This is the most complex piece and should be deferred until the read-only interaction layer is solid.

---

## Timeline

| Phase | pdfbox-ts | opendockit |
|-------|-----------|------------|
| **Now** | Element model types + evaluator instrumentation | Nothing (keep shipping PPTX features) |
| **After Phase 1** | Redaction v2, interaction layer | Import types, build IR→PageModel bridge |
| **After Phase 3** | Extract shared package | Import interaction layer, wire into SlideViewport |
| **Stretch** | Text editing, PDF write-back | Text editing, PPTX write-back |

opendockit should continue its current roadmap (Phase 3.5 diagnostics, charts, etc.) — the element model work is additive and doesn't block anything.

---

## Key Decisions Made

1. **Write from scratch** (not fork/adapt existing OSS) — the interaction layer is ~500 LOC, not worth coupling to tldraw/Excalidraw/Fabric
2. **Flat element list** (not deep tree) — nested groups flatten via `parentId` chains, tree reconstructable for export
3. **DOM overlay for interaction** (not canvas hit-testing) — browser gives selection, drag, accessibility for free
4. **Points for visual, originals for export** — interaction works in points; `source` bag preserves original EMUs/CTMs for lossless round-trip. Deltas applied to originals on export.
5. **Inline first, extract later** — build in pdfbox-ts `src/elements/`, extract to shared package when opendockit is ready
6. **`source` bag is opaque** — the interaction layer NEVER reads `source`. Anything OOXML-specific (effects, 3D, connector routing, text body anchoring) rides in `source.passthrough` untouched.
