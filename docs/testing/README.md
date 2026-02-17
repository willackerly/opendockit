# Testing

## Strategy

| Layer             | Tool                              | Purpose                                                                     |
| ----------------- | --------------------------------- | --------------------------------------------------------------------------- |
| Unit              | Vitest                            | Every unit conversion, color resolution, formula evaluator, parser function |
| Integration       | Vitest + canvas mock              | Parse real PPTX → IR → validate structure                                   |
| Visual Regression | LibreOffice headless + pixelmatch | CI renders with both SlideKit and LibreOffice, computes diff                |
| Corpus            | Custom runner                     | 1000+ real-world PPTXs, track coverage % and diff scores                    |
| Spec Compliance   | Living matrix                     | OOXML spec sections → implementation status                                 |

## Running Tests

```bash
pnpm test              # all tests
pnpm --filter core test   # core package only
pnpm --filter pptx test   # pptx package only
```

## Coverage

See `COVERAGE.md` for current coverage data.

## Visual Regression

The `tools/visual-regression/` directory contains the LibreOffice oracle pipeline:

1. Render each test PPTX with LibreOffice headless → reference PNGs
2. Render with SlideKit → actual PNGs
3. pixelmatch comparison → diff PNGs + similarity scores

## Test Data

Test PPTX files live in `test-data/` at the repo root. Name files descriptively:

- `basic-shapes.pptx` — rectangles, ovals, lines
- `gradients.pptx` — linear, radial, pattern fills
- `text-formatting.pptx` — fonts, sizes, alignment, bullets
- `corporate-deck.pptx` — realistic multi-slide presentation
