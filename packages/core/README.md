# @opendockit/core

Shared OOXML infrastructure: OPC package reading, DrawingML parsing and rendering, IR types, themes, geometry, fonts, media, units, editing, and diagnostics.

## What This Package Does

This is the foundation package for all of OpenDocKit. It defines the Intermediate Representation (IR) types that serve as the contract between parsers and renderers, provides the OPC (Open Packaging Conventions) ZIP reader, DrawingML shape/text parsing and Canvas2D rendering, font metrics and WOFF2 bundles, theme resolution, preset geometry, unit conversions, and the editing model for mutable documents.

## Quick Start

```bash
pnpm --filter @opendockit/core test    # run ~1,687 tests
pnpm --filter @opendockit/core build   # compile to dist/
```

## Documentation

- **Module docs**: See `MODULE.md` files throughout `src/` for detailed module documentation
- **Architecture**: See `../../docs/architecture/README.md`
- **Testing**: See `../../docs/testing/README.md`

## Key Modules

- `src/ir/` -- Intermediate Representation types (the central contract between parsers and renderers)
- `src/opc/` -- OPC package reader (ZIP container, content types, relationships)
- `src/drawingml/` -- DrawingML parser and Canvas2D renderer (shapes, text, fills, effects)
- `src/theme/` -- OOXML theme resolution (color schemes, font schemes, format schemes)
- `src/font/` -- Font metrics database, WOFF2 bundles (42 families / 130 faces), font loading pipeline
- `src/edit/` -- Editing model (EditablePresentation, EditTracker, DOM patching, save pipeline)
- `src/units/` -- EMU/point/pixel unit conversions
- `src/media/` -- Media extraction and image handling
- `src/chart/` -- Chart IR types (stub)
- `src/capability/` -- Runtime capability detection
- `src/xml/` -- XML parsing utilities
- `src/wasm/` -- WASM module loading infrastructure
- `src/diagnostics/` -- Diagnostic and debug utilities
