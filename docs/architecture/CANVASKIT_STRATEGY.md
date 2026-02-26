# CanvasKit / Skia WASM Strategy

**Status:** Planned (Phase 4+)
**Last updated:** 2026-02-26

## Summary

CanvasKit is Google's Skia graphics library compiled to WebAssembly. It gives us GPU-accelerated rendering with HarfBuzz text shaping, 3D transforms, and advanced image filters — capabilities that Canvas2D fundamentally cannot provide.

**The strategy: lazy-load CanvasKit as an optional effects engine, not a Canvas2D replacement.**

## Why CanvasKit?

### Current Canvas2D Ceiling

Our Canvas2D renderer hits a quality ceiling at RMSE 0.15–0.19 on text-heavy slides. The gap comes from:

- **Text rendering varies by browser/OS** — different antialiasing, hinting, subpixel positioning. Same PPTX renders differently in Chrome vs Safari vs Firefox.
- **No text shaping** — Canvas2D delegates to the browser. No control over ligatures, kerning, complex scripts (Arabic, Devanagari, Thai).
- **No 3D transforms** — OOXML supports `<a:scene3d>` and `<a:sp3d>` for perspective rotation on shapes. Canvas2D has no 4x4 matrix support.
- **Missing effects** — inner shadow (`<a:innerShdw>`), reflection (`<a:reflection>`), soft edge (`<a:softEdge>`), glow (`<a:glow>`) are all impossible in Canvas2D.

### What CanvasKit Adds

| OOXML Feature | Canvas2D | CanvasKit |
|---------------|----------|-----------|
| `<a:scene3d>` / `<a:sp3d>` (3D perspective) | Impossible | M44 4x4 matrix API |
| `<a:innerShdw>` (inner shadow) | Impossible | SaveLayer + blend mode |
| `<a:reflection>` (reflection) | Manual hack | SaveLayer + gradient shader |
| `<a:softEdge>` (edge feathering) | Impossible | `ImageFilter.MakeBlur` on edges |
| `<a:glow>` (outer glow) | Impossible | Blur filter + color overlay |
| Text shaping (Arabic, CJK, ligatures) | Browser-dependent | HarfBuzz built-in |
| Consistent cross-browser text | Varies | Identical everywhere (Skia rasterizer) |
| Custom GPU shaders | Impossible | SkSL runtime effects |
| Precise drop shadows (blur radius) | Basic (`shadowBlur`) | Full `ImageFilter.MakeDropShadow` |

## Bundle Size

| Build | WASM Size | Gzipped | Notes |
|-------|-----------|---------|-------|
| **Default** (text + paragraph) | 7 MB | **~1.5 MB** | What we'd use |
| **Full** (+ Lottie/particles) | 8 MB | ~2.0 MB | Overkill |
| **Stripped** (no text) | 3.5 MB | ~0.7 MB | Useless for us (need HarfBuzz) |

For context, our current library sizes (gzipped):

| Component | Gzipped |
|-----------|---------|
| Core + PPTX renderer (no fonts) | 160 KB |
| + font metrics bundle | 334 KB |
| + WOFF2 font bundles (42 families) | 4.2 MB |
| **+ CanvasKit (if added)** | **+1.5 MB** |

CanvasKit would increase the non-font bundle from 160 KB to ~1.7 MB. This is acceptable because it's **lazy-loaded on demand** — users who don't need advanced effects never download it.

## Integration Architecture

### Constraint: Canvas2D and CanvasKit Can't Share a Canvas

A `<canvas>` element can have either a `2d` context or a `webgl` context, not both. This means CanvasKit cannot simply "enhance" an existing Canvas2D canvas.

### Strategy: Offscreen Render + Composite

```
┌─────────────────────────────────────────────────┐
│ SlideKit Render Pipeline                        │
│                                                 │
│  Element needs only Canvas2D?                   │
│  ├─ YES → render directly to main canvas (fast) │
│  └─ NO → needs 3D / effects / precise text?     │
│       ├─ CanvasKit loaded?                      │
│       │   ├─ YES → render on offscreen surface  │
│       │   │        snapshot → ImageBitmap        │
│       │   │        drawImage onto main canvas    │
│       │   └─ NO → lazy-load WASM (1.5 MB)       │
│       │            then render as above          │
│       └─ Fallback: grey-box badge (progressive) │
└─────────────────────────────────────────────────┘
```

This fits our existing **progressive fidelity** architecture:
1. Canvas2D handles 90%+ of slides with zero extra cost
2. CanvasKit WASM loads only when a slide has effects Canvas2D can't do
3. The WASM module loader we already built (3-tier cache: memory → Cache API → network) handles the loading
4. The capability registry already categorizes unsupported features — it just needs to route to CanvasKit instead of grey-boxing

### Code Structure

```
packages/
├── core/src/
│   ├── drawingml/renderer/
│   │   ├── shape-renderer.ts       # Canvas2D (existing)
│   │   ├── text-renderer.ts        # Canvas2D (existing)
│   │   ├── effect-renderer.ts      # Canvas2D basic effects (existing)
│   │   ├── ck-effect-renderer.ts   # CanvasKit advanced effects (new)
│   │   └── ck-text-renderer.ts     # CanvasKit text (new, optional)
│   └── wasm/
│       └── canvaskit-loader.ts     # Lazy loader + surface factory (new)
└── wasm-modules/
    └── canvaskit/                  # CanvasKit WASM binary + types (new)
```

### API Surface

```typescript
// Existing: render with Canvas2D
await slideKit.renderSlide(0, canvas);

// New: render with CanvasKit for maximum fidelity
await slideKit.renderSlide(0, canvas, {
  canvasKit: true,  // use CanvasKit for everything
});

// New: hybrid (default when CanvasKit available)
await slideKit.renderSlide(0, canvas, {
  canvasKit: 'effects-only',  // Canvas2D for shapes/text, CanvasKit for effects
});
```

### Resource Management

CanvasKit objects live in WASM heap and must be explicitly freed (no GC). The renderer must:

1. Create CanvasKit surfaces per-element (or per-slide for full CanvasKit mode)
2. `.delete()` all Paint, Path, Surface objects after rendering
3. Use a resource pool to avoid repeated allocation
4. Cap WASM heap size to prevent memory leaks

## Implementation Plan

### Phase 4a: Effects Engine (CanvasKit as accelerator)

1. Add `canvaskit-wasm` to `packages/wasm-modules/canvaskit/`
2. Build `canvaskit-loader.ts` using existing WASM module loader pattern
3. Implement `ck-effect-renderer.ts` for the 5 effects Canvas2D can't do:
   - Inner shadow, reflection, soft edge, glow, 3D perspective
4. Wire into capability registry: elements with these effects route through CanvasKit
5. Offscreen render → ImageBitmap → composite onto Canvas2D

### Phase 4b: Text Engine (CanvasKit for precise text)

1. Implement `ck-text-renderer.ts` using CanvasKit's Paragraph API
2. Load fonts into CanvasKit's FontMgr from our existing WOFF2 bundles
3. Compare RMSE against Canvas2D text — expect significant improvement on text-heavy slides
4. Make configurable: users choose text engine based on quality vs. bundle size tradeoff

### Phase 4c: Full CanvasKit Renderer (alternative backend)

1. Implement `RenderBackend` interface that both Canvas2D and CanvasKit satisfy
2. CanvasKit renders entire slides natively (no offscreen compositing)
3. User chooses backend at SlideKit construction time
4. This is the path to consistent cross-browser rendering

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Lazy-load, not bundle | 1.5 MB WASM is too large for default bundle; most slides don't need it |
| Effects-first, text later | Effects are binary (Canvas2D can't do them at all); text is a quality improvement (Canvas2D is good enough for most cases) |
| Offscreen composite | Avoids rewriting the entire rendering pipeline; incremental adoption |
| Keep Canvas2D as default | Zero-cost baseline; CanvasKit is a progressive enhancement |
| Default build (with text) | Need HarfBuzz for text shaping; stripped build saves 0.8 MB but loses the most valuable feature |

## Cross-Project Relevance

**pdfbox-ts** (PDF toolkit, same author) could also benefit from CanvasKit:
- PDF rendering currently uses PDF.js or a native Canvas2D evaluator
- CanvasKit would provide higher-fidelity PDF rendering with identical Skia backend
- Shared WASM binary — load once, use for both PPTX rendering and PDF rendering
- If the projects share a CanvasKit loader, the 1.5 MB cost is amortized across both

See "Unified Document Toolkit" discussion for potential monorepo strategy.
