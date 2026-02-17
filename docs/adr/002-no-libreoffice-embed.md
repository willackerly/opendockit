# ADR-002: LibreOffice as Oracle, Not Embedded

**Status:** Accepted
**Date:** 2026-02-16

## Context

LibreOffice can be compiled to WASM (ZetaOffice, Collabora COOL WASM) for client-side document rendering. Should we use it as our rendering engine?

## Decision

Do NOT embed LibreOffice WASM. Use LibreOffice headless in CI as a visual regression oracle.

## Rationale

- LibreOffice WASM is ~50MB compressed, ~1GB+ memory at runtime
- It's a 25M LOC monolith — extracting individual capabilities is harder than building them
- The PPTX import path touches VCL, fontconfig, ICU, freetype, harfbuzz, and dozens of internal abstractions
- Startup latency is substantial, threading model is awkward (SharedArrayBuffer requirements)
- Build takes hours, couples us to LibreOffice release cadence

LibreOffice IS valuable as a **reference oracle**: render slides headless to generate ground-truth PNGs that our custom renderer converges toward in CI.

## Consequences

- We must build our own OOXML parser and rendering pipeline
- Visual regression CI compares our output against LibreOffice reference renders
- Higher engineering effort but full architectural control and minimal bundle size
