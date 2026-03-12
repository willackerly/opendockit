# @opendockit/pptx

Progressive-fidelity PPTX renderer and editor (SlideKit).

## What This Package Does

This package provides the complete PPTX rendering pipeline: parsing PPTX files into the IR model, laying out slides with master/layout inheritance, rendering to Canvas2D via the RenderBackend abstraction, and exporting to PDF. The main entry point is the `SlideKit` class, which handles loading, rendering, and editing PPTX presentations.

## Quick Start

```bash
pnpm --filter @opendockit/pptx test    # run ~373 tests
pnpm --filter @opendockit/pptx build   # compile to dist/
```

## Documentation

- **Module docs**: See `MODULE.md` files throughout `src/` for detailed module documentation
- **Architecture**: See `../../docs/architecture/PPTX_SLIDEKIT.md`
- **Testing**: See `../../docs/testing/README.md`

## Key Modules

- `src/viewport/` -- SlideKit API, slide viewport rendering, RenderBackend integration
- `src/parser/` -- PPTX XML parsing (slides, masters, layouts, notes)
- `src/model/` -- Presentation model types (SlideIR, SlideMasterIR, SlideLayoutIR)
- `src/renderer/` -- Shape, text, table, chart, and image renderers (Canvas2D via RenderBackend)
- `src/layout/` -- Slide layout resolution and master/layout inheritance
- `src/edit/` -- EditableSlideKit, editable builder, save pipeline (DOM patching + OPC repackaging)
- `src/export/` -- PDF export via SlideKit.exportPDF()
- `src/elements/` -- PPTX-to-elements bridge for unified element model
