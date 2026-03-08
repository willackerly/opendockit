# @opendockit/pdf

PDF document engine: parse, create, modify, render, and extract content from PDFs.

## What This Package Does

This package is the public PDF API for OpenDocKit. It is a thin re-export layer that surfaces general-purpose PDF functionality from `@opendockit/pdf-signer` while excluding signing-specific code (PKCS#7, CMS, TSA, LTV, verification). It provides document creation, page manipulation, form fields, annotations, rendering (via PDF.js or NativeRenderer), content extraction, redaction, PDF/A compliance, font handling, and encryption.

## Quick Start

```bash
pnpm --filter @opendockit/pdf test    # run ~24 tests (re-export smoke tests)
pnpm --filter @opendockit/pdf build   # compile to dist/
```

## Documentation

- **Module docs**: See `MODULE.md` in this directory for the full API reference with all entry points
- **Architecture**: See `../../docs/architecture/README.md`
- **Testing**: See `../../docs/testing/README.md`

## Entry Points

- `@opendockit/pdf` -- Main API: PDFDocument, PDFPage, PDFFont, PDFImage, forms, annotations, encryption
- `@opendockit/pdf/render` -- Page rendering via PDF.js or NativeRenderer (Canvas2D)
- `@opendockit/pdf/elements` -- Unified element model, spatial queries, interaction store
- `@opendockit/pdf/extraction` -- Text and image content extraction
- `@opendockit/pdf/annotations` -- Annotation classes (highlight, underline, freetext, ink, etc.)
- `@opendockit/pdf/redaction` -- Content stream redaction
- `@opendockit/pdf/pdfa` -- PDF/A compliance (XMP metadata, sRGB ICC profile)
- `@opendockit/pdf/content-stream` -- Low-level content stream building
- `@opendockit/pdf/fonts` -- Font metrics, encoding, layout, CFF/TrueType subsetting
