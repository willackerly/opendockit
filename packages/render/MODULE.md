# Module: Render (`@opendockit/render`)

**Purpose:** Shared rendering infrastructure for the OpenDocKit pipeline. Provides font metrics lookup, color utilities, 2D affine matrix math, and a `PDFBackend` that translates Canvas2D-style drawing calls into PDF content stream operators.

**Dependencies:** None (zero runtime dependencies — pure algorithms and data)

## Public API

### Font metrics (`font-metrics-db.ts`)

| Export | Description |
| --- | --- |
| `FontMetricsDB` | Runtime database of precomputed font metrics. `loadBundle(bundle)` / `loadFontMetrics(face)` populate it; `measureText(text, family, sizePx, bold, italic)` returns pixel width or `undefined` (fall back to Canvas); `getVerticalMetrics(family, sizePx, bold, italic)` returns ascender/descender/capHeight/lineHeight/lineGap in pixels; `hasMetrics(family)` checks availability. Face resolution cascade: exact style → partial → regular → any. |
| `FontFaceMetrics` | Per-face metrics: `family`, `style`, `unitsPerEm`, `ascender`, `descender`, `capHeight`, `lineHeight?`, `lineGap?`, `widths: Record<string, number>` (codepoint → advance units), `defaultWidth`. |
| `FontMetricsBundle` | `{version, fonts: Record<string, FontFaceMetrics[]>}` — the bundle format loaded from `metrics-bundle.ts`. |

`lineHeight` and `lineGap` are pre-normalized to em units in the bundle (divide by `unitsPerEm`), so they are multiplied directly by `fontSizePx` (not by `scale`).

### Metrics bundle data (`metrics-bundle.ts`)

| Export | Description |
| --- | --- |
| `metricsBundle` | Precomputed `FontMetricsBundle` for 42 font families / 130 faces (~750 KB). Ready to pass to `FontMetricsDB.loadBundle()`. |

**Known issue:** `metrics-bundle.ts` in this package is a copy of the same file in `@opendockit/core/src/font/data/metrics-bundle.ts`. These two copies should be deduplicated — `@opendockit/render` should be the single source of truth and `@opendockit/core` should import from it (or vice versa). See TODO.md.

### Color utilities (`color-utils.ts`)

All functions are pure and stateless.

| Export | Description |
| --- | --- |
| `RgbaColor` | `{r, g, b: 0-255, a: 0-1}` |
| `rgbaToString(color)` | CSS `rgba(r, g, b, a)` string |
| `rgbToString(color)` | CSS `rgb(r, g, b)` string (alpha ignored) |
| `rgbaToHex(color)` | 6-character uppercase hex (e.g. `'FF0000'`) |
| `parseHexColor(hex)` | Parse `#RRGGBB` or `RRGGBB` → `RgbaColor` |
| `compositeOver(fg, bg)` | Porter-Duff SRC_OVER alpha compositing |
| `withAlpha(color, factor)` | Scale color alpha by factor |
| `rgbToHsl(r, g, b)` | RGB (0-255) → `[hue 0-360, sat 0-1, lum 0-1]` |
| `hslToRgb(h, s, l)` | HSL → RGB (0-255) — matches Apache POI HSL2RGB |
| `scRgbToSrgb(val)` | scRGB linear → sRGB gamma-corrected component |
| `applyTint(color, fraction)` | Move towards white (`1.0` = original) |
| `applyShade(color, fraction)` | Move towards black (`1.0` = original) |
| `toGrayscale(color)` | Desaturate using ITU-R BT.601 luma coefficients |
| `invertColor(color)` | Complement each channel |
| `clampByte(v)` | Clamp to 0-255 integer |
| `lerpColor(a, b, t)` | Linear interpolation between two colors |

Color math follows Apache POI conventions for OOXML parity (tint/shade in linear RGB, hue/sat/lum in HSL).

### Matrix math (`matrix.ts`)

2D affine transforms represented as `Matrix2D {a, b, c, d, tx, ty}` matching the Canvas2D `setTransform(a, b, c, d, e, f)` / CSS `matrix(a, b, c, d, tx, ty)` convention. All operations are immutable.

| Export | Description |
| --- | --- |
| `Matrix2D` | `{a, b, c, d, tx, ty}` |
| `Vec2` | `{x, y}` |
| `MatrixDecomposition` | `{tx, ty, rotation (rad), scaleX, scaleY}` |
| `identity()` | Identity matrix |
| `translation(tx, ty)` | Translation matrix |
| `scaling(sx, sy?)` | Scale matrix (uniform if `sy` omitted) |
| `rotation(angleRad)` | Rotation matrix |
| `rotationDeg(angleDeg)` | Rotation matrix from degrees |
| `multiply(a, b)` | Matrix product `a * b` (b applied first) |
| `transformPoint(m, p)` | Apply matrix to a point |
| `transformVector(m, v)` | Apply matrix to a vector (translation ignored) |
| `inverse(m)` | Matrix inverse; `undefined` if singular |
| `determinant(m)` | Scalar determinant |
| `decompose(m)` | Extract translation/rotation/scale (assumes no shear) |
| `fromCanvas2D(a,b,c,d,e,f)` | Construct from Canvas2D parameters |
| `toCanvas2D(m)` | Return `[a, b, c, d, e, f]` tuple |
| `compose(tx, ty, angleRad, sx, sy)` | Translate → rotate → scale shorthand |

### PDF backend (`pdf-backend.ts`)

| Export | Description |
| --- | --- |
| `PDFBackend` | Translates Canvas2D-style drawing calls into PDF content stream operators. Constructor takes `pageHeight` (points) and applies a Y-flip so all coordinates use top-left origin (matching Canvas2D). Operators accumulate internally; extract via `toString()` or `toBytes()`. |
| `PDFGradient` | Proxy returned by `createLinearGradient`/`createRadialGradient`. Records color stops. Gradient fills are approximated by the first stop color (full PDF shading patterns are a Wave 3 enhancement). |
| `parseCssColor(color)` | Parse CSS color string → `{r, g, b, a}` (0-1 range). Supports hex, `rgb()`, `rgba()`, and a common subset of named colors. Cached. |
| `TextMeasurer` | `(text, family, sizePx, bold, italic) => number | undefined` — optional callback for accurate text width in `measureText()`. |

`PDFBackend` implements the same surface as `CanvasRenderingContext2D` for the operations used by the renderers: `save`/`restore`, `translate`/`scale`/`rotate`/`transform`/`setTransform`, full path construction (`moveTo`, `lineTo`, `bezierCurveTo`, `arc`, `ellipse`, `rect`, `closePath`, `clip`), painting (`fill`, `stroke`, `fillRect`, `strokeRect`, `clearRect`), style properties (`fillStyle`, `strokeStyle`, `lineWidth`, `lineCap`, `lineJoin`, `lineDash`, etc.), text (`fillText`, `strokeText`, `measureText`), images (`drawImage`), and gradient factories.

**Known limitations (Wave 3):**
- `globalAlpha` / `globalCompositeOperation` stored but not emitted (requires PDF `ExtGState`)
- `drawImage` emits `/ImgPlaceholder Do` placeholder (XObject embedding deferred)
- Shadows stored but not rendered (requires path duplication with offset/blur)
- `setTransform` concatenates rather than replacing (lacks cumulative CTM tracking)
- `quadraticCurveTo` approximates via repeated cubic control point
- `arcTo` approximated as a line to the tangent point
- `createPattern` returns null

## Test Coverage

201 tests across 4 test files:

| File | Tests |
| --- | --- |
| `color-utils.test.ts` | All color conversion, compositing, and transform functions |
| `font-metrics-db.test.ts` | Metrics loading, text measurement, vertical metrics, style cascade |
| `matrix.test.ts` | All matrix operations, decomposition, Canvas2D round-trips |
| `pdf-backend.test.ts` | PDF operator emission for paths, fills, strokes, text, transforms |

## Known Issues

- `metrics-bundle.ts` is duplicated from `@opendockit/core`. Should be deduplicated so there is a single source of truth. See TODO.md.
