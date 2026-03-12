# @opendockit/elements

Format-agnostic unified element model for document interaction.

## What This Package Does

This package defines the shared element model used by both PPTX and PDF documents. It provides the types, spatial queries, dirty tracking, text search, clipboard serialization, and editing primitives that the interaction layer uses without knowing which document format is underneath. Zero runtime dependencies -- pure types and algorithms.

## Quick Start

```bash
pnpm --filter @opendockit/elements test    # run ~331 tests
pnpm --filter @opendockit/elements build   # compile to dist/
```

## Documentation

- **Module docs**: See `MODULE.md` in this directory for the full public API reference
- **Architecture**: See `../../docs/architecture/README.md`
- **Testing**: See `../../docs/testing/README.md`

## Key Modules

- `src/types.ts` -- Core types: PageModel, PageElement (discriminated union), ElementBounds, Fill, Stroke, Color
- `src/spatial.ts` -- Spatial queries: hitTest, getBounds, getOverlapping, boundingBox, rectIntersection
- `src/dirty-tracking.ts` -- WeakDirtyTracker (GC-safe) and DirtyTracker (enumerable) for change tracking
- `src/editable-document.ts` -- EditableDocument base class with move/resize/delete/select operations
- `src/text-search.ts` -- Full-text search across pages with bounding box results
- `src/clipboard.ts` -- Format-neutral clipboard serialization (strip source bags on copy, fresh IDs on paste)
- `src/debug/` -- Structural comparison utilities: trace-to-elements, element-matcher, property-diff (cross-format quality measurement)
