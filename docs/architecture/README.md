# Architecture Documentation

## Core Documents

| Doc                 | Description                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OOXML_RENDERER.md` | Comprehensive multi-format architecture. Covers the shared core, format-specific layers (PPTX/DOCX/XLSX), the OOXML sharing matrix, DrawingML integration points, text divergence analysis, and phased implementation plan. **Start here.** |
| `PPTX_SLIDEKIT.md`  | Detailed PPTX-specific renderer design. Covers the progressive rendering pipeline, capability registry, WASM module loading, fallback system, testing strategy, and public API surface.                                                     |

## Architecture Decision Records

See `../adr/` for individual decisions.

## Key Principles

1. **Shared DrawingML core** — shapes, fills, effects, pictures, charts are format-agnostic
2. **Format-specific document models** — no premature "universal document" abstraction
3. **TS envelope owns everything** — WASM modules are leaf-node accelerators
4. **Progressive fidelity** — render what you can, badge what you can't, load WASM on demand
5. **IR is data, not a file format** — serializable JSON, cacheable, transferable
6. **100% client-side** — no server dependencies
