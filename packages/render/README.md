# @opendockit/render

Shared rendering infrastructure: font metrics, color utilities, matrix math, and PDFBackend.

## What This Package Does

This package provides the rendering primitives shared across the OpenDocKit pipeline. It includes a font metrics database (42 families, 130 faces), color conversion and compositing utilities matching Apache POI conventions, 2D affine matrix math, and a PDFBackend that translates Canvas2D-style drawing calls into PDF content stream operators.

## Quick Start

```bash
pnpm --filter @opendockit/render test    # run ~201 tests
pnpm --filter @opendockit/render build   # compile to dist/
```

## Documentation

- **Module docs**: See `MODULE.md` in this directory for the full public API reference
- **Architecture**: See `../../docs/architecture/RENDER_BACKEND.md`
- **Testing**: See `../../docs/testing/README.md`

## Key Modules

- `src/font-metrics-db.ts` -- FontMetricsDB: text measurement, vertical metrics, style cascade resolution
- `src/metrics-bundle.ts` -- Precomputed metrics bundle for 42 font families (~750KB)
- `src/color-utils.ts` -- Color conversion (hex, RGB, HSL, scRGB), compositing, tint/shade, grayscale
- `src/matrix.ts` -- 2D affine transforms: multiply, inverse, decompose, Canvas2D interop
- `src/pdf-backend.ts` -- PDFBackend: Canvas2D API surface that emits PDF content stream operators
