# BDD Feature Specifications

This directory contains Gherkin feature files that document OpenDocKit's
behavior using BDD (Behavior-Driven Development) conventions. Features are
organized by epic and wired to Playwright E2E tests via `playwright-bdd`.

## Directory Structure

```
playwright.bdd.config.ts             # BDD-specific Playwright config (project root)
features/
  step-definitions/
    viewer-steps.ts                # Given steps: file loading, mode toggles, status
    interaction-steps.ts           # When steps: clicking, keys, nudge, edit panel
    assertion-steps.ts             # Then steps: canvas, panel, download assertions

  file-loading/
    load-pptx.feature              # Load PPTX files, font registration
    load-pdf.feature               # Load PDF files (future)

  rendering/
    shapes/
      solid-fill.feature           # Solid fill rendering
      gradient-fill.feature        # Gradient fill rendering
      preset-geometry.feature      # Preset geometry shapes (187 types)
    text/
      basic-text.feature           # Text rendering with fonts
      text-alignment.feature       # Paragraph alignment modes
    images/
      picture-render.feature       # Embedded image rendering
    tables/
      table-render.feature         # Table cell layout and borders

  editing/
    select-element.feature         # Click-to-select in edit mode
    move-element.feature           # Nudge and move elements
    resize-element.feature         # Resize via edit panel
    edit-text.feature              # Text content editing
    delete-element.feature         # Delete elements
    save-pptx.feature              # Save edited PPTX

  export/
    pdf-export.feature             # PDF export (future)
```

## Tags

Features and scenarios use tags for filtering and categorization:

| Tag          | Meaning                                          |
|-------------|--------------------------------------------------|
| `@epic:*`   | Epic grouping (file-loading, rendering, editing, export) |
| `@story:*`  | Story within an epic (solid-fill, move-element, etc.)    |
| `@e2e`      | Requires browser-based E2E execution                     |
| `@playwright`| Runs via Playwright test runner                          |
| `@future`   | Not yet implemented -- scenarios are aspirational         |

## Running BDD Tests

```bash
# Generate Playwright test files from features, then run
npx bddgen --config playwright.bdd.config.ts && npx playwright test --config playwright.bdd.config.ts

# Run only specific tags
npx bddgen --config playwright.bdd.config.ts --tags "@epic:editing" && npx playwright test --config playwright.bdd.config.ts

# Coverage matrix (no browser needed)
pnpm test:bdd:matrix
```

## Adding New Features

1. Create a `.feature` file in the appropriate subdirectory.
2. Tag it with `@epic:*` and `@story:*`.
3. Write scenarios using existing Given/When/Then steps from `step-definitions/`.
4. If you need new step definitions, add them to the appropriate step file.
5. Run `pnpm test:bdd:matrix` to verify the coverage matrix updates.

## Epic/Story Map

| Epic          | Stories                                                    |
|---------------|-----------------------------------------------------------|
| file-loading  | load-pptx, load-pdf                                      |
| rendering     | solid-fill, gradient-fill, preset-geometry, basic-text, text-alignment, picture-render, table-render |
| editing       | select-element, move-element, resize-element, edit-text, delete-element, save-pptx |
| export        | pdf-export                                                |
