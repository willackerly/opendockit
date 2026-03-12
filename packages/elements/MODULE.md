# Module: Elements (`@opendockit/elements`)

**Purpose:** Format-agnostic unified element model shared between `@opendockit/pdf` (PDF) and `@opendockit/pptx` (PPTX). Provides the common types, spatial queries, dirty tracking, and editing primitives that the interaction layer uses without knowing which document format is underneath.

**Dependencies:** None (zero runtime dependencies — pure types and algorithms)

## Public API

### Types (`types.ts`)

| Type | Description |
| --- | --- |
| `PageModel` | A single page: `id`, `width`/`height` (points), flat z-ordered `elements[]` |
| `PageElement` | Discriminated union: `TextElement | ShapeElement | ImageElement | PathElement | GroupElement` |
| `ElementBase` | Common fields: `id`, `type`, `x/y/width/height` (points), `rotation` (degrees), `opacity`, `index` (fractional), `parentId`, `locked`, optional `source` |
| `ElementBounds` | `{x, y, width, height}` — axis-aligned bounding box in points |
| `TextElement` | `paragraphs: Paragraph[]` — structured rich text |
| `ShapeElement` | `shapeType`, `fill: Fill | null`, `stroke: Stroke | null`, `cornerRadius?` |
| `ImageElement` | `imageRef`, `mimeType`, `objectFit` |
| `PathElement` | `d` (SVG path data), `fill`, `stroke` |
| `GroupElement` | `childIds: string[]` |
| `PdfSource` | Opaque write-back bag for PDF: `opRange`, `ctm`, `textMatrix?`, `fontName?` |
| `PptxSource` | Opaque write-back bag for PPTX: `offX/Y`, `extCx/Cy` (EMU), `rot`, `xmlPath?`, `passthrough?` |
| `Paragraph` | `runs: TextRun[]`, `align?` |
| `TextRun` | `text`, `fontFamily`, `fontSize`, `bold/italic/underline/strikethrough`, `color`, and computed `x/y/width/height` offsets within the element |
| `Fill` | solid, linear/radial gradient, or pattern with `color` and `stops` |
| `Stroke` | `color`, `width`, `dashArray?`, `lineCap?`, `lineJoin?` |
| `Color` | `{r, g, b, a?}` (0-255 channels) |

The interaction layer reads and writes only the visual fields (`x/y/width/height/rotation/opacity`). The `source` bag is opaque to the interaction layer and used by format-specific exporters for lossless write-back.

### Spatial queries (`spatial.ts`)

All coordinates are in points (1/72 inch). No Y-axis convention is enforced — callers are responsible for coordinate transforms.

| Export | Description |
| --- | --- |
| `hitTest(elements, x, y)` | Find topmost element at a point (back-to-front search) |
| `getBounds(element)` | Get AABB for a single element |
| `getOverlapping(elements, bounds)` | Find all elements whose AABB overlaps `bounds` |
| `isPointInBounds(x, y, bounds)` | Inclusive point-in-rect test |
| `elementAtPoint(elements, x, y)` | Alias for `hitTest` |
| `queryElementsInRect(elements, rect)` | AABB overlap filter |
| `queryTextInRect(elements, rect)` | Overlap filter restricted to `TextElement` |
| `boundingBox(elements)` | Combined AABB of a set of elements; null for empty input |
| `extractTextInRect(elements, rect)` | Extract plain text from overlapping text elements |
| `elementToRect(el)` | Convert element position to `Rect` |
| `rectsOverlap(a, b)` | Exclusive-edge AABB overlap test |
| `pointInRect(px, py, rect)` | Alias for `isPointInBounds` |
| `rectIntersection(a, b)` | Intersection rect; null if no overlap |
| `rectArea(r)` | Area of a rect |
| `overlapFraction(element, rect)` | Fraction (0-1) of element's area covered by rect |
| `Rect` | Type alias for `ElementBounds` |

### Dirty tracking (`dirty-tracking.ts`)

| Export | Description |
| --- | --- |
| `WeakDirtyTracker` | WeakSet-backed tracker for identity checks only — no enumeration. `markDirty(obj)`, `isDirty(obj)`, `clearAll()`. GC-safe for long-running sessions. |
| `DirtyTracker<T>` | WeakSet + strong Set. Adds `getDirtyItems(): T[]` and `size`. Call `clearAll()` after save to release held references. |

Pattern mirrors `EditTracker` in `@opendockit/core/edit` and `COSUpdateTracker` in `@opendockit/pdf-signer`.

### Editable document (`editable-document.ts`)

| Export | Description |
| --- | --- |
| `EditableDocument<TSource>` | Abstract base class for mutable documents. Format-specific subclasses implement `save()` and `loadElements()`. Provides `moveElement`, `resizeElement`, `deleteElement`, `getElement`, `getElements`, `getDirtyElements`, `deriveElement`, `select/deselect/clearSelection`. |
| `EditableElement<TSource>` | Wraps a `PageElement` with `id`, `source`, `dirty`, and `_originalElement` snapshot for zero-alloc fast path in `deriveElement()`. |
| `InteractionState` | Transient UI state: `selectedIds`, `dragTarget`, `dragOffset`, `resizeTarget`. Not tracked as dirty. |
| `DocumentSource` | `PdfSource | PptxSource` — type constraint for `TSource`. |

`deriveElement(id)` returns the original `PageElement` object reference (zero allocation) for unmodified elements; only dirty elements get a new shallow copy.

### Text search (`text-search.ts`)

| Export | Description |
| --- | --- |
| `searchText(pages, query, options?)` | Search all pages for text. Returns `SearchResult[]` ordered by page then element. |
| `SearchResult` | `pageIndex`, `elementId`, `text` (flat paragraph string), `matchStart/matchEnd`, `bounds: ElementBounds` (absolute page coordinates). |
| `SearchOptions` | `caseSensitive?` (default false), `wholeWord?`, `regex?` |

Match positions are mapped back from flat paragraph strings to per-run bounding boxes via proportional width scaling.

### Clipboard utilities (`clipboard.ts`)

| Export | Description |
| --- | --- |
| `serializeToClipboard(elements, sourceFormat, sourcePage)` | Deep-clone elements, strip `source` bags, produce `ClipboardData`. |
| `deserializeFromClipboard(data, targetFormat)` | Reassign fresh IDs (remap `parentId`/`childIds`). Returns elements ready to insert. |
| `ClipboardData` | `{elements: PageElement[], sourceFormat: 'pptx'|'pdf', sourcePage: number}` |

Source bags are stripped on copy so clipboard data is truly format-neutral. New 8-hex-char IDs are assigned on paste.

## Debug & Comparison Utilities (`src/debug/`)

Structural comparison infrastructure for cross-format quality measurement.

| Export | File | What It Does |
|--------|------|-------------|
| `traceToElements(trace)` | `trace-to-elements.ts` | Convert RenderTrace → PageElement[]. Groups by shapeId/paragraph/run. |
| `matchElements(a, b)` | `element-matcher.ts` | Multi-pass matching: text-exact → text-fuzzy (LCS > 0.7) → spatial (IoU > 0.3) |
| `generateDiffReport(a, b)` | `property-diff.ts` | Per-property diff with severity scoring + aggregate summary |
| `extractText(element)` | `property-diff.ts` | Extract concatenated text from a PageElement |
| `parseCssColor(str)` | `trace-to-elements.ts` | Parse CSS color string → {r,g,b,a} |
| `parseCssFont(str)` | `trace-to-elements.ts` | Parse CSS font shorthand → {family, size, weight, style} |

Types: `MatchedPair`, `MatchResult`, `PropertyDelta`, `ElementDiff`, `DiffReport`

## Test Coverage

331 tests across 5 test files (plus `test-helpers.ts` and debug/ tests):

| File | Tests |
| --- | --- |
| `clipboard.test.ts` | Serialize/deserialize round-trips, ID remapping, source stripping |
| `dirty-tracking.test.ts` | `WeakDirtyTracker` and `DirtyTracker` lifecycle |
| `editable-document.test.ts` | Move/resize/delete mutations, `deriveElement` fast path, selection |
| `spatial.test.ts` | All geometry and query functions |
| `text-search.test.ts` | Case sensitivity, whole-word, regex, bounding box computation |

## Known Issues

None currently tracked.
