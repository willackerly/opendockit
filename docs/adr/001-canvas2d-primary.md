# ADR-001: Canvas2D as Primary Render Target

**Status:** Accepted
**Date:** 2026-02-16

## Context

We need a rendering target for OOXML documents in the browser. Options include Canvas2D, SVG, DOM/CSS, and WebGL (via CanvasKit/Skia WASM).

## Decision

Canvas2D is the primary render target for Phase 1-3. CanvasKit (Skia WASM) is loaded on demand for advanced effects only. SVG and PDF backends are added later via RenderBackend abstraction.

## Rationale

- Canvas2D is available everywhere, no WASM required
- Adequate for 80%+ of PPTX elements (shapes, text, images, gradients, shadows)
- Consistent cross-browser rendering (unlike DOM/CSS)
- Good performance for static slide rendering
- SVG has performance issues with many elements per slide
- CanvasKit is 1.5MB — too heavy as a baseline requirement

## Consequences

- Advanced effects (3D, reflection, glow, soft edges) require CanvasKit WASM
- Text rendering quality is limited by Canvas2D text APIs (no subpixel positioning)
- Future PDF export requires a separate render backend (not a Canvas2D-to-PDF conversion)
