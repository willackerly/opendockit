# Test Coverage

**Last updated:** 2026-03-08

## Summary

| Package                  | Test Files       | Tests              | Status     |
| ------------------------ | ---------------- | ------------------ | ---------- |
| @opendockit/core         | 63               | 1,570              | Pass       |
| @opendockit/elements     | 5                | 146                | Pass       |
| @opendockit/render       | 4                | 201                | Pass       |
| @opendockit/pptx         | 18               | 322                | Pass       |
| @opendockit/pdf-signer   | 73 (+8 skipped)  | 1,578 (+46 skipped)| Pass       |
| @opendockit/pdf          | 1                | 24                 | Pass       |
| **Total**                | **164**          | **3,841**          | **Pass**   |

Typecheck clean. Prettier clean. Zero untracked TODOs.

---

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
| RenderBackend       | 68    | CanvasBackend contract tests — every method produces identical Canvas2D calls |
| Edit model          | ~426  | Editing pipeline: EditablePresentation, round-trips, editable-builder, save-pipeline |

---

## Module Breakdown (elements)

| Module              | Tests | Coverage Notes                                      |
| ------------------- | ----- | --------------------------------------------------- |
| Types / spatial queries | 61 | PageModel, PageElement, hit-test, bounds, overlap  |
| Dirty tracking      | 24    | WeakSet-based EditTracker, DirtyFlags               |
| Editable document   | 13    | EditableDocument construction and mutation          |
| Text search         | 26    | Full-text search across PageElement trees           |
| Clipboard           | 22    | Copy/paste element serialization                    |

---

## Module Breakdown (render)

| Module              | Tests | Coverage Notes                                           |
| ------------------- | ----- | -------------------------------------------------------- |
| Font metrics        | 15    | Width estimation, line height calculation, classification |
| Color utilities     | 24    | rgb→string, theme color resolution helpers               |
| Matrix transforms   | 20    | 2D affine math, decompose, compose                       |
| Canvas backend      | 68    | CanvasBackend 1:1 passthrough contract tests             |
| PDF backend         | 39    | PDFBackend → PDF operator mapping tests                  |
| Export visual regression | 35 | Canvas vs PDF export RMSE baselines (9 PDFs / 18 pages) |

---

## Module Breakdown (pptx)

| Module                  | Tests | Coverage Notes                                                   |
| ----------------------- | ----- | ---------------------------------------------------------------- |
| Presentation parser     | 6     | Full pipeline with OPC                                           |
| Slide master parser     | 4     | Shape tree + background + color map                              |
| Slide layout parser     | 6     | Layout inheritance                                               |
| Slide parser            | 19    | Shape tree + background                                          |
| Background parser       | 6     | Inline fills + theme refs                                        |
| Background renderer     | 9     | Solid, gradient, pattern                                         |
| Slide renderer          | 30    | Full element dispatch                                            |
| Font inheritance        | 18    | master→layout→shape lstStyle cascade, mergeListStyles, buildTextDefaults |
| Font regression         | 99    | Per-slide font family census against hardcoded baselines (3 PPTX fixtures, 77 slides) |
| Font discovery          | 18    | XML typeface attribute extraction (unit) + PPTX integration census |
| Slide viewport          | 15    | Load, render, navigation                                         |
| Edit round-trip         | 24    | Save pipeline, dirty parts, OPC rewrite                          |
| Edit render             | 6     | deriveIR fast/slow paths                                         |
| Editable slide kit      | 3     | EditableSlideKit construction                                    |
| SmartArt fallback       | 7     | Grey-box rendering                                               |
| Chart fallback          | 11    | Grey-box rendering                                               |
| PPTX-to-elements bridge | 28    | SlideElementIR → PageElement with PptxSource                     |
| PDF exporter            | 13    | PPTX → PDFBackend → ContentStreamBuilder integration             |

---

## Module Breakdown (pdf-signer)

pdf-signer is a vendored TypeScript port of Apache PDFBox signing primitives. Tests cover:

- COS object model (COSNull, COSBoolean, COSInteger, COSFloat, COSName, COSString, COSArray, COSDictionary, COSStream)
- COSWriter — binary PDF serialization, cross-reference table generation
- Xref builder — byte-range calculation, incremental save
- Signer — PKCS#7 signature dictionary, ByteRange patching, RSA/SHA-256
- Multi-user signing — counter-signatures, MDP, certification
- NativeRenderer — PDF→Canvas2D: text, images, shapes, annotations

73 active test files; 8 skipped (fixtures requiring JRE or network). 46 tests skipped within active files.

---

## Module Breakdown (pdf)

| Module              | Tests | Coverage Notes                              |
| ------------------- | ----- | ------------------------------------------- |
| NativeRenderer exports | 24 | JPEG images, inline images, operator tests  |

---

## Font Testing Map

The font pipeline is the #1 fragility risk. Tests are distributed across multiple packages:

| Test File | Package | What It Tests | Tests |
| --------- | ------- | ------------- | ----- |
| `pptx/viewport/__tests__/font-regression.test.ts` | pptx | Per-slide font family census against hardcoded baselines (3 PPTX fixtures, 77 slides) | 99 |
| `pptx/viewport/__tests__/font-discovery.test.ts` | pptx | XML typeface attribute extraction (unit) + PPTX integration census | 18 |
| `pptx/renderer/__tests__/font-inheritance.test.ts` | pptx | master→layout→shape lstStyle cascade, mergeListStyles, buildTextDefaults | 18 |
| `core/font/__tests__/font-metrics.test.ts` | core | Width estimation, line height calculation, category classification | ~15 |
| `core/font/__tests__/font-metrics-db.test.ts` | core | Codepoint→advance-width lookup, bundle loading, variant matching | ~15 |
| `core/font/__tests__/font-substitution.test.ts` | core | Substitution table lookup, web-safe passthrough, fallback chain | ~20 |

---

## Spec Coverage Matrix

See `../specifications/README.md` for OOXML spec section → implementation mapping.

## Element Coverage (Corpus)

Capability registry is implemented. Once visual test harness is wired up, will track:

- Total elements across corpus
- Rendered (full fidelity)
- Partial (missing effects)
- WASM-pending
- Unsupported
