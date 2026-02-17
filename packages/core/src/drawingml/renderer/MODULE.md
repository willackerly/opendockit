# Module: DrawingML Renderers (`@opendockit/core/drawingml/renderer`)

**Purpose:** Render DrawingML IR objects to Canvas2D. Format-agnostic — used by PPTX, DOCX, and XLSX viewport layers.

**Tier:** Fan-out 2 (depends on IR Types + Units. Does NOT depend on parsers — only on IR type definitions)

**Each renderer is independently implementable.**

**Files:**

| File | Input (IR) | Output | Independent? |
|------|-----------|--------|-------------|
| `render-context.ts` | — | `RenderContext` interface definition | Yes (define first) |
| `shape-renderer.ts` | `DrawingMLShapeIR` | Canvas2D calls | No — calls fill, line, effect, geometry renderers |
| `fill-renderer.ts` | `FillIR` | Canvas2D fillStyle / gradients | Yes |
| `line-renderer.ts` | `LineIR` | Canvas2D strokeStyle / dash | Yes |
| `effect-renderer.ts` | `EffectIR[]` | Canvas2D shadow/filter | Yes |
| `text-renderer.ts` | `TextBodyIR` | Canvas2D fillText | Yes |
| `picture-renderer.ts` | `PictureIR` | Canvas2D drawImage | Yes |
| `group-renderer.ts` | `GroupIR` | Recursive Canvas2D | No — calls shape-renderer |

**RenderContext interface** (define in `render-context.ts`):
```typescript
interface RenderContext {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  dpiScale: number;
  theme: ThemeIR;
  mediaCache: MediaCache;
  fontResolver: FontResolver;
  capabilityRegistry: CapabilityRegistry;
}
```

**Dependencies:**
- `../../ir/` — all IR types (consumed, never produced)
- `../../units/` — EMU-to-pixel conversions
- `../../theme/` — `ThemeIR` (via RenderContext, for color resolution at render time)
- `../../font/` — `FontResolver` (via RenderContext, for text rendering)
- `../geometry/` — `buildGeometryPath()` for shape rendering

**Parallelization:** Implement `render-context.ts` first (just the interface). Then `fill-renderer.ts`, `line-renderer.ts`, `effect-renderer.ts`, `text-renderer.ts`, `picture-renderer.ts` as 5 parallel agents. Then `shape-renderer.ts` and `group-renderer.ts`.

**Key reference:** `docs/architecture/OOXML_RENDERER.md` Part 3.6, `docs/architecture/PPTX_SLIDEKIT.md` "Layer 3: TypeScript Renderers"

**Testing:** Renderers are harder to unit test (Canvas2D output). Options:
1. Mock `CanvasRenderingContext2D` and assert method calls
2. Use `@napi-rs/canvas` in Node for actual pixel output
3. Structural tests: verify correct Canvas2D API sequences

Start with option 1 (mock assertions), add pixel tests in visual regression phase.
