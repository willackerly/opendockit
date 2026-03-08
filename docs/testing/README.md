# Testing

## Strategy

| Layer             | Tool                                    | Purpose                                                                     |
| ----------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| Unit              | Vitest                                  | Every unit conversion, color resolution, formula evaluator, parser function |
| Integration       | Vitest + canvas mock                    | Parse real PPTX → IR → validate structure                                   |
| Visual Regression | Playwright Chromium + ImageMagick RMSE  | CI renders with SlideKit, computes RMSE against PDF reference images        |
| Corpus            | Custom runner                           | Real-world PPTXs, track coverage % and RMSE scores                          |
| Spec Compliance   | Living matrix                           | OOXML spec sections → implementation status                                 |

## Running Tests

```bash
pnpm test                         # all packages
pnpm --filter @opendockit/core test      # core only
pnpm --filter @opendockit/elements test  # elements only
pnpm --filter @opendockit/render test    # render only
pnpm --filter @opendockit/pptx test      # pptx only
pnpm --filter @opendockit/pdf-signer test # pdf-signer only
pnpm --filter @opendockit/pdf test        # pdf only
```

## Coverage

See `COVERAGE.md` for current per-package and per-module coverage data, including the Font Testing Map.

## Visual Regression

Visual regression uses Playwright Chromium for rendering and ImageMagick for RMSE computation against PDF reference images.

### Scripts

| Script | Command | Purpose |
| ------ | ------- | ------- |
| `scripts/visual-compare.mjs` | `pnpm test:visual` | Primary PPTX visual regression: 54 slides, PDF reference PNGs, RMSE baselines |
| `scripts/visual-compare-corpus.mjs` | `pnpm test:visual:corpus` | Corpus self-referential regression: 10 files, 67 slides (first run = baseline) |
| `scripts/visual-compare-export.mjs` | `pnpm test:visual:pdf` | Export visual regression: Canvas vs PDF export RMSE (9 PDFs / 18 pages) |
| `scripts/render-corpus.mjs` | (called by corpus compare) | Renders all corpus PPTX files to PNG |
| `scripts/generate-visual-gallery.sh` | (manual) | 3-pane diff composites: Reference \| Rendered \| 4x-amplified diff |
| `scripts/generate-font-stress-test.py` | (manual) | Generates `test-data/font-stress-test.pptx` exercising all 42 bundled families |

### Pipeline

1. `scripts/visual-compare.mjs` renders all slides via Playwright headless Chrome (2x DPI, 1920x1080)
2. Compares against PDF reference PNGs using ImageMagick RMSE
3. Outputs: `../pptx-pdf-comparisons/comparison-output/` — `rendered/`, `reference/`, `diffs/`, `rmse-report.json`
4. Baselines stored in `BASELINE_RMSE` map in the script; `--update-baselines` to update

### 3-Pane Gallery

```bash
node scripts/visual-compare.mjs   # render + compute RMSE first
bash scripts/generate-visual-gallery.sh  # generate composites
```

Output: `visual-diffs/` — one PNG per slide, sorted by RMSE (worst first). Naming: `01-slide54-rmse0.1857.png`. Diff legend: black = pixel-perfect, dim = subtle, bright = large mismatch.

### Output Directories

| Tool | Output |
| ---- | ------ |
| `visual-compare.mjs` | `../pptx-pdf-comparisons/comparison-output/{rendered,reference,diffs}/` |
| `generate-visual-gallery.sh` | `./visual-diffs/` |
| `render-corpus.mjs` | `../pptx-pdf-comparisons/corpus-rendered/` |
| `visual-compare-corpus.mjs` | `../pptx-pdf-comparisons/corpus-output/` |

### Font Testing

See the Font Testing Map in `COVERAGE.md` — font tests are distributed across `core` and `pptx` packages.

## E2E Tests

### Viewer Edit Mode (Playwright)

19 Playwright tests covering the interactive viewer's edit mode functionality.

**Location:** `tools/viewer/e2e/edit-mode.spec.ts`

**Run:**
```bash
cd tools/viewer && npx playwright test
```

**What's tested:** Element selection, text editing, drag-to-move, property changes, undo/redo, save/reload round-trip.

**Prerequisites:** Playwright browsers installed (`npx playwright install chromium`)

## PDF Export Quality Gate

Visual regression for PPTX→PDF export pipeline.

**Script:** `scripts/visual-compare-export.mjs`
**Run:** `pnpm test:visual:export`
**What it does:** Exports PPTX fixtures to PDF via NativeRenderer, rasterizes pages, compares against reference PNGs using ImageMagick RMSE.

## Visual Diff Gallery

3-pane composite images for eyeballing rendering differences.

**Script:** `scripts/generate-visual-gallery.sh`
**Run:** `bash scripts/generate-visual-gallery.sh`
**Output:** `visual-diffs/` in project root — one PNG per slide, sorted by RMSE (worst first)
**Format:** Reference (PDF) | Rendered (OpenDocKit) | Abs Diff (4x amplified)
**Prerequisite:** Run `scripts/visual-compare.mjs` first to generate rendered/reference PNGs

## Font Pipeline

### When to Run What

| Scenario | Command | What It Does |
|----------|---------|-------------- |
| New clone / missing `fonts/` dir | `pnpm fonts:rebuild` | Download TTFs + generate metrics + generate WOFF2 |
| Adding a new Google Font | `pnpm fonts:rebuild` | Full pipeline: download + metrics + WOFF2 |
| Changed metrics extraction logic | `pnpm fonts:metrics` | Regenerate `metrics-bundle.ts` from `fonts/` |
| Changed WOFF2 generation logic | `pnpm fonts:woff2` | Regenerate WOFF2 TS modules from `fonts/` |
| Routine development | Nothing | Fonts are checked into the repo |

**Scripts:** See `scripts/README.md` for detailed script documentation.

## Test Data

Test PPTX files live in `test-data/` at the repo root. Name files descriptively:

- `basic-shapes.pptx` — rectangles, ovals, lines
- `gradients.pptx` — linear, radial, pattern fills
- `text-formatting.pptx` — fonts, sizes, alignment, bullets
- `corporate-deck.pptx` — realistic multi-slide presentation
- `font-stress-test.pptx` — all 42 bundled font families with bold/italic variants
