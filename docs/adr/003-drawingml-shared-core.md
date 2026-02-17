# ADR-003: DrawingML in Shared Core Package

**Status:** Accepted
**Date:** 2026-02-16

## Context

DrawingML (shapes, fills, effects, pictures, charts) appears identically across PPTX, DOCX, and XLSX. Should we build format-specific DrawingML parsers or share them?

## Decision

All DrawingML parsing and rendering lives in `@opendockit/core`. Format-specific packages (`pptx`, `docx`, `xlsx`) handle their own document models, layout engines, and placement/anchoring, but delegate to core for DrawingML content.

## Rationale

From the ECMA-376 spec: DrawingML shape properties (a:spPr) are identical across all three formats. Only the wrapper elements differ (p:sp, wps:wsp, xdr:sp). This gives ~40% code reuse when adding DOCX/XLSX support.

The sharing matrix:
- **100% shared:** OPC, DrawingML shapes/fills/effects, themes, colors, preset geometries, fonts, charts
- **Divergent:** Document model, layout engine, text model, placement/anchoring

## Consequences

- `@opendockit/core` must know nothing about PPTX/DOCX/XLSX — no format-specific imports
- Format-specific text rendering (WordprocessingML w:p/w:r vs DrawingML a:p/a:r) stays in format packages
- Adding DOCX support later reuses all DrawingML infrastructure automatically
