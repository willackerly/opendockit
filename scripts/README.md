# Scripts Registry

Central registry for all project scripts in the `scripts/` directory. These scripts handle visual regression testing, font pipeline management, test fixture generation, and batch conversion.

## Quick Reference

| Script | Purpose | Usage | Prerequisites |
|--------|---------|-------|---------------|
| `visual-compare.mjs` | Primary PPTX visual regression | `pnpm test:visual` | Playwright, ImageMagick 7 |
| `visual-compare-corpus.mjs` | Corpus self-referential regression | `pnpm test:visual:corpus` | Playwright, ImageMagick 7, `pnpm build` |
| `visual-compare-export.mjs` | PDF export quality gate | `pnpm test:visual:export` | Playwright, ImageMagick 7, `pnpm build` |
| `visual-compare-pdf.mjs` | PDF NativeRenderer regression | `pnpm test:visual:pdf` | ImageMagick 7, pdfjs-dist, canvas |
| `compare-pptx-pdf.mjs` | One-off PPTX vs PDF comparison | `node scripts/compare-pptx-pdf.mjs <pptx> <pdf> [outdir]` | Playwright, pdftoppm (poppler-utils) |
| `generate-visual-gallery.sh` | 3-pane diff composites | `bash scripts/generate-visual-gallery.sh` | ImageMagick 7, prior `visual-compare.mjs` run |
| `render-corpus.mjs` | Batch render all corpus PPTX | `node scripts/render-corpus.mjs [corpus-dir] [output-dir]` | Playwright |
| `batch-convert.mjs` | PPTX to PDF batch conversion | `node scripts/batch-convert.mjs <input> <output>` | Playwright |
| `extract-font-metrics.mjs` | Generate metrics-bundle.ts | `pnpm fonts:metrics` (via `regenerate-metrics.sh`) | fonts/ directory with TTF/OTF files |
| `regenerate-metrics.sh` | Wrapper for extract-font-metrics | `pnpm fonts:metrics` | fonts/ directory |
| `bundle-woff2-fonts.py` | Generate WOFF2 TypeScript bundles | `pnpm fonts:woff2` | python3, fontTools |
| `download-google-fonts.sh` | Download Google Fonts TTFs | `pnpm fonts:download` | python3, fontTools, internet |
| `generate-font-stress-test.py` | Create font stress-test PPTX | `python3 scripts/generate-font-stress-test.py` | python3, python-pptx |
| `generate-test-pptx.mjs` | Create basic-shapes test fixture | `node scripts/generate-test-pptx.mjs` | JSZip (from core package) |

## Visual Regression Scripts

### `visual-compare.mjs` -- Primary Visual Regression

Renders all slides from a PPTX file via Playwright headless Chrome (2x DPI, 1920x1080), compares against PDF reference PNGs using ImageMagick RMSE. This is the primary tool for measuring rendering fidelity against a known-good PDF render.

```bash
pnpm test:visual                                      # defaults
node scripts/visual-compare.mjs [pptx-path] [comparison-dir]
```

- **Defaults:** PPTX from `../pptx-pdf-comparisons/`, output to `../pptx-pdf-comparisons/comparison-output/`
- **Output:** `rendered/`, `reference/`, `diffs/`, `rmse-report.json`
- **Baselines:** Built-in `BASELINE_RMSE` map; use `--update-baselines` to update
- **Requires:** Playwright chromium, ImageMagick 7

### `visual-compare-corpus.mjs` -- Corpus Self-Referential Regression

Self-referential regression for the full corpus. The first run renders and saves baselines. Subsequent runs re-render and compare against saved baselines to detect rendering regressions (but not fidelity bugs, which are baked into the baseline).

```bash
pnpm test:visual:corpus
node scripts/visual-compare-corpus.mjs [options]
  --update-baselines   Re-render and overwrite saved baselines + RMSE values
  --corpus-dir <dir>   Corpus directory (default: test-data/corpus)
  --file <name>        Run only a single PPTX file
```

- **Requires:** Playwright chromium, ImageMagick 7, built core package (`pnpm build`)

### `visual-compare-export.mjs` -- PDF Export Quality Gate

Measures export fidelity: how well `SlideKit.exportPDF()` reproduces the original Canvas rendering. Renders PPTX slides via Canvas (ground truth), exports to PDF, renders the exported PDF via PDF.js, then computes RMSE between the two.

```bash
pnpm test:visual:export
node scripts/visual-compare-export.mjs [pptx-file] [options]
  --output-dir <dir>      Output directory (default: ../pptx-pdf-comparisons/export-comparison)
  --update-baselines      Re-capture baselines and overwrite RMSE values
  --file <name>           Shorthand: resolve against test-data/ dir
  --scale <n>             Render scale factor (default: 2 for 2x DPI)
  --skip-export           Only render Canvas reference (skip PDF export step)
```

- **Output:** `canvas-reference/`, `pdf-export/`, `diffs/`, `export-rmse-report.json`
- **Requires:** Playwright chromium, ImageMagick 7, built core package

### `visual-compare-pdf.mjs` -- PDF NativeRenderer Regression

Compares NativeRenderer (our custom Canvas2D PDF renderer) against PDF.js (the ground truth). Tests how well the NativeRenderer reproduces PDF pages.

```bash
pnpm test:visual:pdf
node scripts/visual-compare-pdf.mjs [options]
  --update-baselines   Update RMSE baselines
  --file <name>.pdf    Single file
```

- **Output:** `../pptx-pdf-comparisons/pdf-comparison-output/` with `reference/`, `rendered/`, `diffs/`, `rmse-report.json`
- **Requires:** ImageMagick 7, pdfjs-dist, canvas (node-canvas)

### `compare-pptx-pdf.mjs` -- One-Off PPTX vs PDF Setup

Rasterizes PDF pages to PNGs using `pdftoppm` and renders PPTX slides via Playwright, saving both side-by-side. Use this for initial setup of reference images for a new PPTX file.

```bash
node scripts/compare-pptx-pdf.mjs <pptx-file> <pdf-file> [output-dir]
```

- **Requires:** pdftoppm (from poppler-utils), Playwright chromium

### `generate-visual-gallery.sh` -- 3-Pane Diff Composites

Creates side-by-side composites: Reference (PDF) | Rendered (OpenDocKit) | Abs Diff (4x amplified). Handles both PPTX and PDF comparison output. Run after `visual-compare.mjs` or `visual-compare-pdf.mjs`.

```bash
bash scripts/generate-visual-gallery.sh
```

- **Output:** `visual-diffs/` (PPTX composites), `visual-diffs-pdf/` (PDF composites) in project root
- **Naming:** `01-slide54-rmse0.1857.png` (rank-slideNum-rmse)
- **Diff legend:** Black = pixel-perfect, dim = subtle diff, bright = large mismatch
- **Requires:** ImageMagick 7, prior run of `visual-compare.mjs` or `visual-compare-pdf.mjs`

### `render-corpus.mjs` -- Batch Corpus Render

Renders all PPTX files in the corpus directory to PNGs via Playwright headless Chrome.

```bash
node scripts/render-corpus.mjs [corpus-dir] [output-dir]
```

- **Defaults:** corpus from `test-data/corpus/`, output to `../pptx-pdf-comparisons/corpus-rendered/`

## Conversion Scripts

### `batch-convert.mjs` -- PPTX to PDF Batch Conversion

Batch PPTX to PDF conversion via `SlideKit.exportPDF()` in headless Chromium. Supports single-file and directory modes with configurable concurrency.

```bash
node scripts/batch-convert.mjs input.pptx output.pdf
node scripts/batch-convert.mjs --input-dir ./presentations --output-dir ./pdfs
  --concurrency <n>    Parallel conversions (default: 1)
  --verbose            Per-slide progress
```

- **Requires:** Playwright chromium

## Font Pipeline Scripts

### `download-google-fonts.sh` -- Download Fonts

Downloads Google Fonts TTFs (variable fonts) and instances them to static weight/width variants using fontTools. All fonts are OFL-1.1 or Apache-2.0 licensed.

```bash
pnpm fonts:download
```

- **Output:** `fonts/` directory with static TTF/OTF files
- **Requires:** python3 with fontTools (`pip install fonttools`), internet access

### `extract-font-metrics.mjs` -- Extract Font Metrics

Reads TTF/OTF files, extracts per-codepoint advance widths and vertical metrics (ascender, descender, capHeight, lineHeight, lineGap), and writes `metrics-bundle.ts` with a precomputed metrics bundle.

```bash
pnpm fonts:metrics     # runs regenerate-metrics.sh wrapper
```

- **Output:** `packages/core/src/font/data/metrics-bundle.ts`
- **Requires:** `fonts/` directory populated with TTF/OTF files

### `regenerate-metrics.sh` -- Metrics Wrapper Script

Shell wrapper that invokes `extract-font-metrics.mjs` with all 42 font family mappings. This is the script called by `pnpm fonts:metrics`.

### `bundle-woff2-fonts.py` -- Generate WOFF2 Bundles

Subsets TTF fonts to Latin + symbols codepoints, converts to WOFF2, base64-encodes, and writes TypeScript modules. Also generates a `manifest.ts` mapping family names to module paths.

```bash
pnpm fonts:woff2
```

- **Output:** `packages/core/src/font/data/woff2/` (TypeScript modules, ~5MB total)
- **Requires:** python3 with fontTools

### `generate-font-stress-test.py` -- Font Stress Test PPTX

Creates a PPTX file that exercises all 42 bundled font families with bold/italic variants, different sizes, and mixed-font paragraphs.

```bash
python3 scripts/generate-font-stress-test.py
```

- **Output:** `test-data/font-stress-test.pptx`
- **Requires:** python3, python-pptx

### Font Pipeline Decision Tree

```
When do I run font pipeline scripts?
|-- New clone / missing fonts/ dir
|   +-- pnpm fonts:rebuild          (download + metrics + woff2)
|-- Adding a new Google Font
|   +-- pnpm fonts:rebuild          (download + metrics + woff2)
|-- Changed font metrics extraction logic
|   +-- pnpm fonts:metrics          (regenerate metrics-bundle.ts)
|-- Changed WOFF2 generation logic
|   +-- pnpm fonts:woff2            (regenerate WOFF2 modules)
|-- Changed font stress test
|   +-- python3 scripts/generate-font-stress-test.py
+-- Routine development
    +-- Nothing -- fonts are checked into the repo
```

## Test Fixture Scripts

### `generate-test-pptx.mjs` -- Basic Shapes Fixture

Creates a minimal but visually interesting PPTX test fixture using JSZip (raw XML generation). Useful for creating deterministic test fixtures without PowerPoint.

```bash
node scripts/generate-test-pptx.mjs
```

- **Output:** `test-data/basic-shapes.pptx`

## Script Tests

Unit tests for scripts live in `scripts/__tests__/`:

| Test File | Covers |
|-----------|--------|
| `visual-compare-export.test.mjs` | Export visual regression script logic |

Run with: `pnpm test:scripts`

## Output Directories

| Tool | Output Location |
|------|----------------|
| `visual-compare.mjs` | `../pptx-pdf-comparisons/comparison-output/{rendered,reference,diffs}/` |
| `visual-compare-corpus.mjs` | `../pptx-pdf-comparisons/corpus-output/` |
| `visual-compare-export.mjs` | `../pptx-pdf-comparisons/export-comparison/` |
| `visual-compare-pdf.mjs` | `../pptx-pdf-comparisons/pdf-comparison-output/` |
| `generate-visual-gallery.sh` | `./visual-diffs/` and `./visual-diffs-pdf/` (project root) |
| `render-corpus.mjs` | `../pptx-pdf-comparisons/corpus-rendered/` |

## Cross-References

- **Testing methodology:** See `docs/testing/README.md`
- **Root pnpm scripts:** See `package.json` at project root for all `pnpm test:visual:*` and `pnpm fonts:*` commands
- **Visual regression workflow:** See `CLAUDE.md` section "Visual Regression & Diagnostic Tooling"
