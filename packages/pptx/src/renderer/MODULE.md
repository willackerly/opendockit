# Module: PPTX Renderers (`@opendockit/pptx/renderer`)

**Purpose:** Orchestrate rendering a complete PPTX slide by coordinating core DrawingML renderers with PPTX-specific features (backgrounds, transitions, notes).

**Tier:** Phase 2 (depends on core renderers)

**Files:**

| File                     | Purpose                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| `slide-renderer.ts`      | Main orchestrator: iterate elements in z-order, delegate to core renderers |
| `background-renderer.ts` | Slide background (solid, gradient, image) with master/layout fallback      |
| `transition-renderer.ts` | CSS/Canvas slide transitions (Phase 3)                                     |
| `notes-renderer.ts`      | Speaker notes display (Phase 3)                                            |

**Dependencies:**

- `@opendockit/core/drawingml/renderer` — all element renderers
- `@opendockit/core/capability` — render plan generation
- `@opendockit/core/ir` — all IR types

**Key reference:** `docs/architecture/PPTX_SLIDEKIT.md` "Layer 6: Slide Viewport"

**Testing:** Render test slides, compare against reference images.
