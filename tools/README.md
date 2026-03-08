# Tools

Development tools for OpenDocKit.

## Contents

| Directory | Status | Purpose |
|-----------|--------|---------|
| `viewer/` | **Active** | Interactive PPTX viewer with edit mode (Vite dev server + 19 Playwright E2E tests) |
| `visual-regression/` | Placeholder | Future: integrated visual regression UI (current functionality in `scripts/`) |
| `corpus-runner/` | Placeholder | Future: integrated corpus runner UI (current functionality in `scripts/`) |
| `coverage-dashboard/` | Placeholder | Future: test coverage dashboard |

## Viewer

The viewer is the primary development tool for visual testing.

```bash
cd tools/viewer
pnpm dev              # Start dev server
npx playwright test   # Run E2E tests
```

See `viewer/e2e/` for Playwright test files.

## Note on Placeholders

The placeholder directories (`visual-regression/`, `corpus-runner/`, `coverage-dashboard/`) reserve space for future integrated UIs. The underlying functionality already exists as CLI scripts — see `scripts/README.md`.
