# Unified Element Model — THE PLAN

_Created: 2026-02-25_

## Vision

A shared, format-agnostic element model that represents positioned content on fixed-size pages. This model is the unification layer between **pdfbox-ts** (PDF) and **opendockit** (PPTX/OOXML), enabling:

- **Surgical redaction** — know exactly what content is under the rectangle
- **Interactive editing** — click, select, drag, resize elements on a canvas
- **Cross-format rendering** — same interaction layer for PDF and PPTX
- **Future collaboration** — CRDT-compatible by design (flat list, fractional indexing)

Both PDF pages and PPTX slides are fundamentally **fixed-size canvases with positioned elements** (text runs, shapes, images). The element model captures this shared reality.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    INTERACTION LAYER                      │
│  Canvas render + DOM overlay + selection/drag/resize      │
│  Shared across PDF and PPTX (and future formats)         │
│  Consumes: PageModel                                     │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────┐
│                     PAGE MODEL                           │
│  { id, width, height, elements: PageElement[] }          │
│  Pure JSON. CRDT-compatible. Format-agnostic.            │
│  Types: Text | Shape | Image | Path | Group              │
└──────┬───────────────────────────────────┬──────────────┘
       │                                   │
┌──────┴──────────┐              ┌─────────┴─────────┐
│  PDF Importer   │              │  PPTX Importer    │
│  evaluator.ts   │              │  SlideElementIR   │
│  → PageModel    │              │  → PageModel      │
│                 │              │                   │
│  PDF Exporter   │              │  PPTX Exporter    │
│  PageModel →    │              │  PageModel →      │
│  content stream │              │  DrawingML XML    │
└─────────────────┘              └───────────────────┘
```

### Design Principles

1. **Flat element list** per page with `parentId` for grouping (like Excalidraw/tldraw, not a deep tree)
2. **Fractional indexing** for z-order (collaboration-safe, Figma pattern)
3. **Pure JSON** — serializable, diffable, CRDT-compatible, testable
4. **ShapeUtil pattern** per element type — `render()`, `getBounds()`, `hitTest()`, `onResize()`
5. **Three-layer rendering** — canvas (visuals) + DOM overlay (interaction) + SVG (selection handles)
6. **Visual coordinates in points** (1/72 inch) — universal rendering unit
7. **Lossless round-trip via opaque `source`** — format-specific data rides along untouched (see below)

### Critical Design: Round-Trip Fidelity

The bridge between format-specific IR (SlideElementIR, PDF content stream) and PageModel
**must not be lossy.** If you go `SlideElementIR → PageModel → interaction → PageModel → SlideElementIR`,
any field that doesn't survive the round-trip becomes uneditable or silently dropped on write-back.

**Solution: the `source` bag.** Every element carries an opaque `source` field containing
everything the format exporter needs that the interaction layer doesn't understand.
The PageModel models **what's interactive** (position, size, text, color). Everything else
passes through untouched in `source`.

```
┌──────────────────────────────────────────────────────┐
│  PageModel (interactive fields)                       │
│  x, y, width, height, rotation, opacity, text, fill  │
│  ─── the interaction layer reads/writes ONLY these    │
├──────────────────────────────────────────────────────┤
│  source (opaque pass-through)                         │
│  EMU coordinates, 3D rotations, effect chains,        │
│  connector routing, text body anchoring, CTM,         │
│  operator indices, font programs, ...                 │
│  ─── the exporter reads these, interaction ignores    │
└──────────────────────────────────────────────────────┘
```

### EMU vs Points — Why Both

PDF uses points (72/inch, floats). PPTX uses EMUs (914400/inch, integers).
Converting EMU → points → EMU introduces floating-point drift:
`457201 EMU ÷ 12700 = 36.00007874...pt → round-trip = 457201? 457200?`

**Solution:** Visual coordinates use points (for rendering/interaction). Original
coordinates live in `source` (for lossless export). When the user moves an element,
the exporter computes the **delta in points**, converts that delta to EMUs, and applies
it to the **original EMU values**. No cumulative drift.

```
User drags element 10pt right:
  1. Interaction layer: element.x += 10
  2. PPTX exporter: delta = 10pt × 12700 = 127000 EMU
  3. source.offX += 127000 (integer math, no drift)
  4. Write source.offX back to <a:off x="...">
```

### Nested Groups (PPTX `<p:grpSp>`)

PPTX groups nest arbitrarily deep. The flat element list handles this via `parentId` chains:

```
Flat array:                          Logical tree:

[0] Group A   (parentId: null)        Group A
[1] Shape 1   (parentId: A)            ├── Shape 1
[2] Group B   (parentId: A)            ├── Group B
[3] Shape 2   (parentId: B)            │   ├── Shape 2
[4] Shape 3   (parentId: B)            │   └── Shape 3
[5] Shape 4   (parentId: A)            └── Shape 4
```

**Import:** Multiply group transforms down into children → store **absolute positions**.
Keep `parentId` chain so the tree is reconstructable.

**Interaction:** Click Group A → select all descendants. Drag Group A → move all children.
The interaction layer walks `parentId` chains — no tree traversal needed.

**Export:** Walk `parentId` chains → factor out group transforms → rebuild nested XML.
Original group transforms live in `source.groupTransform` for lossless round-trip.

This is the same pattern databases use: flat rows with foreign keys beats nested documents
for querying, and you reconstruct the tree when you need it.

### What We're NOT Building

- Not a full document editor (no flowing text reflow, no page breaks)
- Not forking PDF.js (200K+ LOC, read-only architecture, Node.js Path2D issues)
- Not using ProseMirror/Slate/Lexical (flowing-text models, wrong for positioned content)
- Not building collaboration first (get local editing right, add CRDT later)

---

## The PageModel

```typescript
// ─── Core ───────────────────────────────────────────────

interface PageModel {
  id: string;
  width: number;                // points (1/72")
  height: number;
  elements: PageElement[];      // flat, z-ordered (back to front)
}

// ─── Element Base ───────────────────────────────────────

interface ElementBase {
  id: string;                   // unique within page
  type: string;                 // discriminant

  // Visual coordinates (points) — interaction layer reads/writes ONLY these
  x: number;                    // absolute position in points
  y: number;
  width: number;
  height: number;
  rotation: number;             // degrees
  opacity: number;              // 0-1

  index: string;                // fractional index for z-ordering
  parentId: string | null;      // group membership (parentId chains for nesting)
  locked: boolean;

  // Opaque format-specific source data — enables lossless round-trip.
  // Interaction layer NEVER reads this. Exporter uses it for write-back.
  source?: PdfSource | PptxSource | unknown;
}

// ─── Source Types (Opaque to Interaction Layer) ─────────

/** PDF: maps element back to content stream operators */
interface PdfSource {
  format: 'pdf';
  opRange: [number, number];    // operator indices in content stream
  ctm: number[];                // original transformation matrix [a,b,c,d,e,f]
  textMatrix?: number[];        // for text elements
  fontName?: string;            // PDF font resource name (/F1, /TT0, etc.)
}

/** PPTX: preserves original OOXML values for lossless write-back */
interface PptxSource {
  format: 'pptx';
  offX: number;                 // original EMU x offset (integer, lossless)
  offY: number;                 // original EMU y offset
  extCx: number;                // original EMU width
  extCy: number;                // original EMU height
  rot: number;                  // rotation in 60,000ths of a degree
  xmlPath?: string;             // XPath to source element for surgical XML update
  // Any OOXML fields the PageModel doesn't model (effects, 3D, connector
  // routing, text body anchoring, etc.) ride along here untouched.
  passthrough?: Record<string, unknown>;
}

// ─── Element Types (Discriminated Union) ────────────────

type PageElement =
  | TextElement
  | ShapeElement
  | ImageElement
  | PathElement
  | GroupElement;

interface TextElement extends ElementBase {
  type: 'text';
  paragraphs: Paragraph[];
  // Computed from font metrics during import
  // Individual runs have their own font/size/color
}

interface ShapeElement extends ElementBase {
  type: 'shape';
  shapeType: 'rectangle' | 'ellipse' | 'triangle' | 'diamond' | string;
  fill: Fill | null;
  stroke: Stroke | null;
  cornerRadius?: number;
}

interface ImageElement extends ElementBase {
  type: 'image';
  data: Uint8Array | string;    // raw bytes or reference
  mimeType: string;
  objectFit: 'fill' | 'contain' | 'cover' | 'none';
}

interface PathElement extends ElementBase {
  type: 'path';
  d: string;                    // SVG path data
  fill: Fill | null;
  stroke: Stroke | null;
}

interface GroupElement extends ElementBase {
  type: 'group';
  childIds: string[];           // references to other elements by id
  // Original group transform for round-trip fidelity (stored in source too,
  // but surfaced here for convenience during export tree reconstruction)
  groupTransform?: {
    scaleX: number; scaleY: number;
    offX: number; offY: number;
    rot: number;
  };
}

// ─── Rich Text ──────────────────────────────────────────

interface Paragraph {
  runs: TextRun[];
  align?: 'left' | 'center' | 'right' | 'justify';
  spacing?: { before: number; after: number; line: number };
  indent?: { left: number; right: number; firstLine: number };
}

interface TextRun {
  text: string;
  fontFamily: string;
  fontSize: number;             // points
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color: Color;
  // Computed position within the text element
  x: number;                    // offset from element origin
  y: number;
  width: number;                // measured advance width
  height: number;               // font ascent + descent
}

// ─── Style Types ────────────────────────────────────────

interface Fill {
  type: 'solid' | 'linear-gradient' | 'radial-gradient' | 'pattern';
  color?: Color;
  stops?: Array<{ offset: number; color: Color }>;
  angle?: number;
}

interface Stroke {
  color: Color;
  width: number;
  dashArray?: number[];
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
}

type Color = { r: number; g: number; b: number; a?: number };
```

### Format Mapping

| PageModel          | PDF Source                        | PPTX Source                    |
|--------------------|-----------------------------------|--------------------------------|
| `TextElement`      | BT/ET blocks with Tj/TJ ops      | `<p:sp>` with `<p:txBody>`    |
| `TextRun`          | Individual Tj/TJ with font state  | `<a:r>` runs                  |
| `ShapeElement`     | `re` (rect), path → fill/stroke   | `<p:sp>` with `<a:prstGeom>`  |
| `ImageElement`     | `Do` with image XObject           | `<p:pic>`                     |
| `PathElement`      | `m/l/c/v/y/h` path construction   | `<a:custGeom>`                |
| `GroupElement`     | `q/Q` state groups                | `<p:grpSp>` (nested → flat via parentId) |
| `TextRun.width`    | `FontDecoder.getCharWidth()` sum  | `Canvas.measureText()` or precomputed metrics |
| `element.x/y`      | CTM × text matrix (points)        | `<a:xfrm><a:off>` (EMU → pt, originals in `source`) |
| `element.width/height` | computed from content + CTM   | `<a:xfrm><a:ext>` (EMU → pt, originals in `source`) |
| `source` (PDF)     | `PdfSource { opRange, ctm }`     | —                              |
| `source` (PPTX)    | —                                 | `PptxSource { offX/Y, extCx/Cy, rot, passthrough }` |

### Import/Export Round-Trip

```
              IMPORT                                EXPORT
  ┌─────────────────────┐               ┌─────────────────────┐
  │  Format IR           │               │  Format IR           │
  │  (SlideElementIR     │               │  (SlideElementIR     │
  │   or PDF ops)        │               │   or PDF ops)        │
  └──────────┬──────────┘               └──────────▲──────────┘
             │                                      │
   ┌─────────▼─────────┐               ┌───────────┴─────────┐
   │ Convert to points  │               │ Apply delta to       │
   │ Store originals    │               │ original source      │
   │ in source bag      │               │ values (no drift)    │
   └─────────┬─────────┘               └───────────▲─────────┘
             │                                      │
   ┌─────────▼──────────────────────────────────────┴──────┐
   │                     PageModel                          │
   │  Visual fields (points) ← interaction layer            │
   │  source bag (opaque)   ← exporter only                 │
   └────────────────────────────────────────────────────────┘
```

**Rule:** The interaction layer writes deltas to visual fields. The exporter
applies those deltas to the original `source` values using the source format's
native unit system. This prevents cumulative floating-point drift.

---

## Execution Plan — pdfbox-ts Side

### Phase 1: Evaluator Emits PageElements

**The keystone.** Instrument `evaluator.ts` to produce a `PageElement[]` alongside the existing `OperatorList`. The OperatorList stays unchanged (render pipeline unaffected). Element extraction is opt-in.

**What changes:**

1. **New types** — `src/elements/types.ts` (~150 LOC)
   - All PageModel interfaces defined above
   - `PageElementCollector` interface for optional element capture

2. **Evaluator instrumentation** — `src/render/evaluator.ts` (~150 LOC additions)
   - Track text position via text matrix + CTM (already available, just not captured)
   - Compute text run width using `FontDecoder.getCharWidth()` (already called, result discarded)
   - Track path bounds during construction (copy pattern from `ContentStreamRedactor.ts` lines 746-867)
   - Track current fill/stroke colors from state
   - Emit `TextElement` at each `Tj/TJ` with: text, position, width, height, font, color
   - Emit `ShapeElement`/`PathElement` at paint operators with: bounds, fill, stroke
   - Emit `ImageElement` at `Do` with: bounds from CTM, image reference
   - Group via `q/Q` → `GroupElement`

3. **New API** — `src/render/NativeRenderer.ts` additions (~30 LOC)
   - `NativeRenderer.getPageElements(pageIndex): PageElement[]`
   - `evaluatePageWithElements(pageDict, resolve): { opList, elements }`

4. **Tests** — element extraction tests on real PDFs (~100 LOC)
   - Verify text elements have correct positions and content
   - Verify path elements have correct bounds
   - Verify image elements have correct dimensions
   - Test on demo PDF, form PDF, drawing PDF

**Key architectural constraint:** OperatorList format mirrors PDF.js. We do NOT modify it. Elements are a parallel output, not a modification of the render pipeline.

**Reference implementation:** `ContentStreamRedactor.ts` already does semantic tracking (text positions, path bounds, CTM transforms). We're lifting that pattern into the evaluator where the data is richer (font metrics available).

### Phase 2: Redaction v2 — Element-Model-Based

Replace the current `ContentStreamRedactor.ts` point-in-rect approach with element model queries.

1. **Query API** — `src/elements/spatial.ts` (~100 LOC)
   - `queryElementsInRect(elements, rect): PageElement[]`
   - `queryTextInRect(elements, rect): TextElement[]`
   - Uses proper bounding box overlap (not point-in-rect)
   - Each returned element includes `sourceOpRange` for precise removal

2. **Surgical content removal** — update `applyRedactions()` (~100 LOC refactor)
   - Input: `sourceOpRange[]` from element query (not guessed from position)
   - Remove specific operations by index
   - Append fill rectangles
   - Guaranteed complete: if the element was rendered, it's in the model

3. **Redaction preview API** — `src/elements/redaction-preview.ts` (~50 LOC)
   - `getRedactionPreview(elements, rect): RedactionPreview`
   - Returns: affected elements, their text content, bounding boxes
   - UI can highlight affected elements (invert colors) before confirm

4. **Console output** — when applying redactions, log:
   ```
   Redacting 3 elements:
     Text: "Account Number: 1234-5678" at (72, 540) 12pt Helvetica
     Text: "SSN: 123-45-6789" at (72, 520) 12pt Helvetica
     Path: rectangle at (70, 515, 310, 560) filled #ffffff
   ```

### Phase 3: Interactive Canvas Layer

Three-layer rendering for element interaction.

1. **Canvas layer** (bottom) — existing `NativeCanvasGraphics` renders the page
2. **DOM overlay** (middle) — positioned HTML elements matching `PageElement` bounds
   - Transparent by default
   - Highlight on hover/select (CSS transitions)
   - For redaction: draw-rect-to-select interaction
   - For editing: click-to-select, drag-to-move
3. **SVG handles** (top) — resize/rotate handles on selected elements

Implementation:
- `src/elements/ElementOverlay.ts` — creates/manages DOM elements from PageModel
- `src/elements/HitTester.ts` — point-in-element, rect-intersection queries
- `src/elements/SelectionManager.ts` — tracks selected elements, handles keyboard shortcuts

### Phase 4: Text Editing (Stretch)

With the DOM overlay, text elements can become `contenteditable`:
- Click text element → show editable overlay
- Edit text → update TextRun content
- Write back to content stream via PDF Exporter

This is the "editable PDF" endpoint. Deferred until Phases 1-3 are solid.

---

## Execution Plan — opendockit Side (Inventory)

OpenDocKit already has `SlideElementIR` — a rich typed element tree with positions, text bodies, fills, strokes, transforms. The work is mapping it to the shared `PageModel`.

### What opendockit needs:

1. **PageModel types** — import from shared package (or copy, they're just interfaces)

2. **SlideElementIR → PageModel bridge** (~200 LOC)
   - `DrawingMLShapeIR` → `ShapeElement` (with `prstGeom` → `shapeType` mapping)
   - `TextBoxIR` → `TextElement` (paragraphs/runs already structured)
   - `ImageIR` → `ImageElement`
   - `GroupIR` → `GroupElement`
   - `ConnectorIR` → `PathElement`
   - EMU → points conversion (÷ 12700)

3. **Interaction layer** — import shared `ElementOverlay`, `HitTester`, `SelectionManager`
   - Wire into `SlideViewport` (already manages canvas lifecycle)
   - SlideKit API additions: `getSlideElements()`, `onElementSelect()`, `onElementMove()`

4. **PPTX write-back** (future) — `PageModel` → DrawingML XML mutations
   - Update `<a:xfrm>` for moved/resized elements
   - Update `<a:r>` for edited text
   - Rebuild ZIP and save

### What opendockit does NOT need to change:

- Parser pipeline (already produces rich IR)
- Canvas2D renderer (keep as-is, just add DOM overlay on top)
- Font system (already has metrics from Canvas.measureText)
- Progressive fidelity system (capability registry stays)

---

## Shared Package Strategy

### Phase 1 (Now): Inline in pdfbox-ts

Put everything in `src/elements/` within pdfbox-ts. Ship it. Iterate fast.

```
src/elements/
  types.ts              # PageModel interfaces
  spatial.ts            # Rect overlap, element queries
  fractional-index.ts   # Z-order indexing (~50 LOC)
  hit-tester.ts         # Point/rect intersection
  element-overlay.ts    # DOM overlay manager
  selection-manager.ts  # Multi-select, keyboard shortcuts
  redaction-preview.ts  # Highlight affected elements
  index.ts              # Barrel export
```

### Phase 2 (When opendockit needs it): Extract to shared package

When opendockit is ready to consume the interaction layer, extract `src/elements/` to:
- `@dockit/elements` or `@opendockit/elements` — standalone package
- Both pdfbox-ts and opendockit depend on it
- Pure TypeScript, zero runtime dependencies, ~500 LOC

### Build vs Borrow Decision

| Component | Decision | Rationale |
|-----------|----------|-----------|
| PageModel types | **Write from scratch** | ~150 LOC of interfaces. No dependency needed. |
| Fractional indexing | **Write from scratch** | ~50 LOC. Tiny algorithm, not worth a dependency. |
| Hit testing | **Write from scratch** | ~100 LOC. Point-in-rect, rect overlap, basic geometry. |
| DOM overlay | **Write from scratch** | ~200 LOC. Positioned divs, CSS transforms. Trivial. |
| Selection manager | **Write from scratch, informed by tldraw** | tldraw's patterns are excellent but too coupled to their React store. Copy the interaction model, not the code. |
| Canvas renderer | **Keep existing** | NativeCanvasGraphics (pdfbox-ts) and Canvas2D renderers (opendockit) stay. |
| CRDT (future) | **Use Yjs or Loro** | Don't build our own CRDT. Loro has native movable-tree with fractional indexing. |

**Total new code:** ~500-700 LOC for the element model + interaction layer. This is intentionally small. The hard work is in the format-specific importers (evaluator instrumentation, IR mapping), which already exist in near-complete form.

---

## Research References

### Patterns We're Following

- **Excalidraw**: Flat element array, fractional z-indexing, dual-canvas (static + interactive), geometric hit testing
- **tldraw**: `TLBaseShape<Type, Props>` pattern, `ShapeUtil` per type, reactive store, DOM-based rendering with CSS transforms
- **PDF.js text layer**: Invisible positioned `<span>` elements over canvas for selection/search — same pattern as our DOM overlay
- **pdfme**: Template-based `{ type, position, width, height, props }` model for PDF elements — closest prior art

### Patterns We're NOT Following

- **ProseMirror/Slate/Lexical**: Flowing-text document models with schema/node trees. Wrong abstraction for fixed-canvas positioned content.
- **Fabric.js/Konva.js**: Canvas-only interaction (no DOM overlay). Works but worse UX for text editing and accessibility.
- **OnlyOffice**: Full OOXML editor (sdkjs). Too large/complex to reference; AGPL license.

---

## Success Criteria

### Phase 1 (Element Extraction)
- [ ] `NativeRenderer.getPageElements(0)` returns correct elements for demo PDF
- [ ] Text elements have correct content, position, width, height, font info
- [ ] Path/shape elements have correct bounds
- [ ] Image elements have correct dimensions
- [ ] Element count matches visible content on page

### Phase 2 (Redaction v2)
- [ ] `queryElementsInRect(elements, rect)` returns all overlapping elements
- [ ] Redacted text is logged to console before removal
- [ ] No text leaks outside redaction rectangle
- [ ] All existing redaction tests still pass

### Phase 3 (Interactive Canvas)
- [ ] Elements highlight on hover in test harness
- [ ] Click-to-select works
- [ ] Rect-drag-to-select works
- [ ] Redaction preview shows inverted text before confirm

### Cross-Format (opendockit integration)
- [ ] Same `PageElement[]` type used by both PDF and PPTX importers
- [ ] Same interaction layer works on both PDF and PPTX content
- [ ] Demo: open PDF and PPTX side by side, same UX for both
