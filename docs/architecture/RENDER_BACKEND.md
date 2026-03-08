# RenderBackend

**Created:** 2026-03-08

## Purpose

`RenderBackend` is an interface that mirrors the Canvas2D API. It decouples DrawingML renderers from the specific rendering target, enabling the same renderer code to produce either Canvas2D output (for on-screen display) or PDF content stream output (for PDF export).

---

## Interface

**File:** `packages/core/src/drawingml/renderer/render-backend.ts`

72 methods covering:

- **State management:** `save()`, `restore()`
- **Transforms:** `translate(x, y)`, `scale(x, y)`, `rotate(angle)`, `setTransform(...)`, `transform(...)`
- **Path operations:** `beginPath()`, `moveTo(x, y)`, `lineTo(x, y)`, `bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y)`, `quadraticCurveTo(cpx, cpy, x, y)`, `arc(x, y, r, start, end, ccw?)`, `arcTo(x1, y1, x2, y2, r)`, `rect(x, y, w, h)`, `closePath()`
- **Fill and stroke:** `fill(rule?)`, `stroke()`, `clip(rule?)`
- **Path2D overloads:** `fill(path, rule?)`, `stroke(path)`, `clip(path, rule?)`
- **Style properties:** `fillStyle`, `strokeStyle`, `lineWidth`, `lineCap`, `lineJoin`, `miterLimit`, `lineDash`, `lineDashOffset`, `globalAlpha`, `globalCompositeOperation`
- **Shadow:** `shadowOffsetX`, `shadowOffsetY`, `shadowBlur`, `shadowColor`
- **Text:** `fillText(text, x, y)`, `strokeText(text, x, y)`, `measureText(text) → TextMetrics`, `font`, `textAlign`, `textBaseline`, `direction`, `letterSpacing`
- **Images:** `drawImage(image, dx, dy)` (and crop/scale overloads)
- **Gradients:** `createLinearGradient(x0, y0, x1, y1)`, `createRadialGradient(x0, y0, r0, x1, y1, r1)` — return a `BackendGradient` that both implementations support
- **Patterns:** `createPattern(image, repetition)`
- **Pixel:** `clearRect(x, y, w, h)`

---

## CanvasBackend

**File:** `packages/core/src/drawingml/renderer/canvas-backend.ts`

1:1 passthrough to `CanvasRenderingContext2D`. Every method delegates to the underlying `ctx` with no transformation.

```typescript
class CanvasBackend implements RenderBackend {
  constructor(private ctx: CanvasRenderingContext2D) {}

  save() { this.ctx.save(); }
  restore() { this.ctx.restore(); }
  translate(x: number, y: number) { this.ctx.translate(x, y); }
  // ...all 72 methods delegate directly
}
```

SlideKit wraps the raw canvas context at render time:

```typescript
const backend = new CanvasBackend(canvas.getContext('2d')!);
renderSlide(slide, { backend, ... });
```

**Tests:** 68 contract tests verify that every `CanvasBackend` method produces identical Canvas2D calls (via call-count + argument capture mocks).

---

## PDFBackend

**File:** `packages/render/src/pdf-backend.ts`

Translates Canvas2D calls to PDF content stream operators. Wraps a `ContentStreamBuilder` from `@opendockit/pdf-signer`.

### Y-Flip

PDF coordinate origin is bottom-left; Canvas2D is top-left. PDFBackend applies a Y-flip at construction:

```
cm 1 0 0 -1 0 pageHeight
```

All subsequent `translate/scale/rotate` calls are pre-composed with this initial flip.

### Operator Mapping

| Canvas2D call | PDF operators |
| ------------- | ------------- |
| `save()` | `q` |
| `restore()` | `Q` |
| `translate(x, y)` | `1 0 0 1 x y cm` |
| `scale(x, y)` | `x 0 0 y 0 0 cm` |
| `rotate(a)` | `cos(a) sin(a) -sin(a) cos(a) 0 0 cm` |
| `beginPath()` | (resets internal path buffer) |
| `moveTo(x, y)` | `x y m` |
| `lineTo(x, y)` | `x y l` |
| `bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y)` | `cp1x cp1y cp2x cp2y x y c` |
| `rect(x, y, w, h)` | `x y w h re` |
| `closePath()` | `h` |
| `fill()` | `f` (nonzero) or `f*` (evenodd) |
| `stroke()` | `S` |
| `fill() + stroke()` | `B` |
| `clip()` | `W n` |
| `fillStyle = 'rgb(r,g,b)'` | `r g b rg` |
| `strokeStyle = 'rgb(r,g,b)'` | `r g b RG` |
| `lineWidth = w` | `w w` |
| `lineCap = 'butt'/'round'/'square'` | `0/1/2 J` |
| `lineJoin = 'miter'/'round'/'bevel'` | `0/1/2 j` |
| `setLineDash([on, off])` | `[on off] 0 d` |
| `fillText(text, x, y)` | `BT Tf ... Tm ... Tj ET` |
| `drawImage(img, dx, dy, dw, dh)` | XObject + `Do` |

### Gradient Approximation

Full Type 2/3 shading functions are not yet implemented. Gradients are approximated with the first stop's solid color. This is a known gap tracked in TODO.md.

### Image Handling

`drawImage` embeds the image as a PDF XObject (inline byte stream). JPEG images are embedded as-is (no re-encoding). PNG/raw images are embedded as deflate-compressed RGB streams.

### Known Gaps

| Feature | Status |
| ------- | ------ |
| `setTransform` with cumulative CTM | Not implemented — resets instead of composing |
| `arcTo` | Falls back to approximate line segments |
| Patterns (`createPattern`) | No-op |
| `globalAlpha` / ExtGState opacity | No-op |
| Shadow properties | No-op |
| Gradient shading (Type 2/3) | Approximated with first-stop solid color |
| `measureText` | Returns zero-width metrics (text layout handled upstream) |

---

## Migration Pattern

All 10 DrawingML renderers were migrated in Wave 1 (2026-03-07). The pattern is uniform:

**Before:**
```typescript
function renderShape(shape: ShapeIR, rctx: RenderContext) {
  const { ctx } = rctx;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.fill();
  ctx.restore();
}
```

**After:**
```typescript
function renderShape(shape: ShapeIR, rctx: RenderContext) {
  const { backend } = rctx;
  backend.save();
  backend.translate(x, y);
  backend.beginPath();
  backend.rect(0, 0, w, h);
  backend.fill();
  backend.restore();
}
```

`RenderContext` still holds `ctx: CanvasRenderingContext2D` for legacy access, but all renderer code uses `backend` exclusively.
