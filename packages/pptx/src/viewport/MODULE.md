# Module: PPTX Viewport (`@opendockit/pptx/viewport`)

**Purpose:** Canvas management, DPI scaling, slide navigation, thumbnail generation. Contains the public `SlideKit` API.

**Tier:** Phase 2 (depends on parsers + renderers)

**Files:**

| File                 | Purpose                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| `slide-viewport.ts`  | `SlideKit` class — the public API. Load, render, navigate, getCoverage, dispose. |
| `slide-navigator.ts` | Prev/next, go-to-slide, keyboard navigation                                      |
| `thumbnail-strip.ts` | Slide thumbnail panel (render at reduced scale)                                  |
| `presenter-view.ts`  | Notes + current + next slide (Phase 3)                                           |

**Public API (SlideKit):**

```typescript
const kit = new SlideKit({ container, wasmBasePath?, fontSubstitutions?, onProgress? });
const presentation = await kit.load(pptxArrayBuffer);
await kit.renderSlide(0);
kit.nextSlide();
kit.goToSlide(5);
const report = kit.getSlideCoverage(3);
kit.dispose();
```

**Dependencies:**

- `../parser/` — PPTX parsing pipeline
- `../renderer/` — slide rendering pipeline
- `@opendockit/core/capability` — coverage reports

**Key reference:** `docs/architecture/PPTX_SLIDEKIT.md` "Layer 6", `docs/architecture/OOXML_RENDERER.md` Part 10

**Testing:** Integration tests: load PPTX → render → verify canvas has content. Navigation tests. Dispose cleanup tests.
