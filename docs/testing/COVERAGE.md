# Test Coverage

**Last updated:** 2026-03-12

## Summary

| Package                  | Test Files       | Tests              | Status     |
| ------------------------ | ---------------- | ------------------ | ---------- |
| @opendockit/core         | 67               | 1,687              | Pass       |
| @opendockit/elements     | 6                | 331                | Pass       |
| @opendockit/render       | 5                | 208                | Pass       |
| @opendockit/pptx         | 22               | 370                | Pass       |
| @opendockit/pdf-signer   | 74 (+8 skipped)  | 1,777 (+46 skipped)| Pass       |
| @opendockit/docx         | 9                | 129                | Pass       |
| @opendockit/pdf          | 1                | 24                 | Pass       |
| @opendockit/fonts        | 1                | 8                  | Pass       |
| **Total**                | **185**          | **4,534**          | **Pass**   |

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
| Font system         | 97    | Metrics (23), substitution (50), loader (7), TTF loader (10), consistency (7) |
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
| PDF font embedding      | 45    | Font collection, custom font embedding, standard fallback, CID encoding |
| PDF font subsetting     | 13    | Codepoint tracking, subsetting integration, size reduction, encoding    |
| PDF image export        | 38    | JPEG/PNG embedding, dimensions, resource wiring                  |

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

### PDF Rendering Comparison Harness

- **RMSE comparison:** 30-page pixel comparison (NativeRenderer vs pdftoppm ground truth), average RMSE **0.042** — a 70% reduction from the 0.14 starting point.
- **Trace pipeline:** Canvas Tree Recorder captures text/shape/image events during rendering; compared against `pdftotext -bbox-layout` ground truth. Results: **97% text accuracy, 4.4pt average position delta**.
- Harness: `packages/pdf-signer/src/render/__tests__/pdf-compare-harness.test.ts`
- Trace harness: `packages/pdf-signer/src/render/__tests__/trace-pipeline-harness.test.ts`

---

## Module Breakdown (fonts)

| Module              | Tests | Coverage Notes                              |
| ------------------- | ----- | ------------------------------------------- |
| Companion package   | 8     | registerOfflineFonts(), manifest, WOFF2/TTF |

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
| `pptx/export/__tests__/pdf-font-embedding.test.ts` | pptx | Font collection, custom font embedding, CID encoding, standard fallback | 45 |
| `pptx/export/__tests__/pdf-font-subsetting.test.ts` | pptx | Codepoint tracking, font subsetting integration, size reduction | 13 |
| `core/font/__tests__/font-metrics.test.ts` | core | Width estimation, line height calculation, category classification | ~15 |
| `core/font/__tests__/font-metrics-db.test.ts` | core | Codepoint→advance-width lookup, bundle loading, variant matching | ~15 |
| `core/font/__tests__/font-substitution.test.ts` | core | Substitution table lookup, web-safe passthrough, fallback chain | ~20 |
| `core/font/__tests__/ttf-loader.test.ts` | core | TTF loading, caching, variant fallback, TrueType magic byte validation | 10 |
| `core/font/__tests__/font-consistency.test.ts` | core | Substitution→metrics→TTF→WOFF2 pipeline consistency | 7 |
| `core/font/__tests__/font-pipeline-contracts.test.ts` | core | Three-way substitution→metrics→WOFF2 consistency | 28 |
| `render/src/__tests__/metrics-sync.test.ts` | render | Render bundle re-exports from core, structural equality | 5 |

---

## E2E Tests (Playwright)

| Test File | Tests | What It Covers |
|-----------|-------|----------------|
| `tools/viewer/e2e/edit-mode.spec.ts` | 19 | Viewer edit mode: selection, editing, drag, undo, save |

**Run:** `cd tools/viewer && npx playwright test`

Note: E2E tests run separately from unit tests and are not included in the `pnpm test` count.

---

## Synthetic Test Fixtures

Generated PPTX files targeting specific feature categories for visual regression testing.
Scripts live in `scripts/`, output goes to `test-data/`.

| Fixture                         | Script                              | Slides | Focus                                                  |
| ------------------------------- | ----------------------------------- | ------ | ------------------------------------------------------ |
| `font-stress-test.pptx`        | `generate-font-stress-test.py`      | 20     | All 42 bundled families, bold/italic, sizes, mixed runs |
| `gradient-stress-test.pptx`    | `generate-gradient-stress-test.py`  | 5      | Linear/radial gradients, multi-stop, shape types, line  |
| `table-stress-test.pptx`       | `generate-table-stress-test.py`     | 5      | Borders, merged cells, alignment grid, banded rows      |
| `effect-stress-test.pptx`      | `generate-effect-stress-test.py`    | 5      | Drop shadow, glow, reflection, soft edge, combinations  |
| `text-stress-test.pptx`        | `generate-text-stress-test.py`      | 6      | Alignment, bullets, autofit, rotation, spacing          |
| `connector-stress-test.pptx`   | `generate-connector-stress-test.py` | 4      | Arrow styles, bent/curved, dash patterns                |

Regenerate all: `for f in scripts/generate-*-stress-test.py; do python3 "$f"; done`

## Spec Coverage Matrix

See `../specifications/README.md` for OOXML spec section → implementation mapping.

## Element Coverage (Corpus)

Capability registry is implemented. Once visual test harness is wired up, will track:

- Total elements across corpus
- Rendered (full fidelity)
- Partial (missing effects)
- WASM-pending
- Unsupported
