# Module: PPTX Parsers (`@opendockit/pptx/parser`)

**Purpose:** Parse PresentationML-specific structure (slides, masters, layouts, placeholders) and produce flat element lists by delegating to core DrawingML parsers.

**Tier:** Phase 2 (depends on all Phase 0-1 core modules)

**Files:**

| File | Input | Output | Independent? |
|------|-------|--------|-------------|
| `presentation.ts` | `presentation.xml` | Slide list, dimensions, default text styles | Yes |
| `slide-master.ts` | `slideMasterN.xml` | `MasterIR` (shapes, backgrounds, text styles) | Yes |
| `slide-layout.ts` | `slideLayoutN.xml` | `LayoutIR` (placeholder positions) | Needs master for defaults |
| `slide.ts` | `slideN.xml` | `SlideIR` (flat element list) | Needs master + layout + theme |
| `shape-tree.ts` | `p:spTree` | `SlideElementIR[]` | Called by slide parser |
| `placeholder.ts` | `p:ph` | Resolved placeholder properties | Needs layout + master |
| `inheritance.ts` | Master + Layout + Slide | Merged properties | Composition of above |

**Dependencies:**
- `@opendockit/core/opc` — package reading
- `@opendockit/core/xml` — XML parsing
- `@opendockit/core/drawingml` — shape property/text body parsers (delegated to)
- `@opendockit/core/theme` — theme resolution
- `@opendockit/core/ir` — all IR types

**Key reference:** `docs/architecture/OOXML_RENDERER.md` Part 4.1, `docs/architecture/PPTX_SLIDEKIT.md` "Layer 1"

**Parallelization:** `presentation.ts`, `slide-master.ts` can run in parallel. `slide.ts` is the composition point.

**Testing:** Parse real PPTX files end-to-end. Verify placeholder inheritance resolves correctly.
