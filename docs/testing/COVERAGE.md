# Test Coverage

**Last updated:** 2026-02-17

## Summary

| Package          | Test Files | Tests     | Status   |
| ---------------- | ---------- | --------- | -------- |
| @opendockit/core | 44         | 1,112     | Pass     |
| @opendockit/pptx | 7          | 46        | Pass     |
| **Total**        | **51**     | **1,158** | **Pass** |

Typecheck clean. Prettier clean. Zero untracked TODOs.

## Module Breakdown (core)

| Module              | Tests | Coverage Notes                                                             |
| ------------------- | ----- | -------------------------------------------------------------------------- |
| IR types            | 43    | All discriminated unions validated                                         |
| XML parser          | 72    | Wrapper + attribute helpers                                                |
| Unit conversions    | 184   | EMU, DXA, half-points (exhaustive)                                         |
| OPC layer           | 69    | Package reader, content types, rels, part URIs                             |
| Theme engine        | 94    | Color resolver (50), theme parser (30), font resolver (14)                 |
| Font system         | 80    | Metrics (23), substitution (50), loader (7)                                |
| Media cache         | 44    | Cache (16), image loader (18), transforms (10)                             |
| DrawingML parsers   | 167   | Fill, line, effect, transform, text, picture, group, table, paragraph, run |
| DrawingML renderers | 149   | Shape, fill, line, effect, text, picture, group, table, connector          |
| Geometry engine     | 124   | Shape guide eval (77), presets (32), path builder (15)                     |
| Capability registry | 34    | Registration, routing, coverage reports, grey-box                          |
| WASM module loader  | 16    | 3-tier cache, dedup, progress, error handling                              |

## Module Breakdown (pptx)

| Module              | Tests | Coverage Notes                      |
| ------------------- | ----- | ----------------------------------- |
| Presentation parser | 6     | Full pipeline with OPC              |
| Slide master parser | 4     | Shape tree + background + color map |
| Slide parser        | 5     | Shape tree + background             |
| Background parser   | 6     | Inline fills + theme refs           |
| Background renderer | 9     | Solid, gradient, pattern            |
| Slide renderer      | 6     | Full element dispatch               |
| SlideKit viewport   | 10    | Load, render, navigation            |

## Spec Coverage Matrix

See `../specifications/README.md` for OOXML spec section -> implementation mapping.

## Element Coverage (Corpus)

Capability registry is implemented. Once visual test harness is wired up, will track:

- Total elements across corpus
- Rendered (full fidelity)
- Partial (missing effects)
- WASM-pending
- Unsupported
