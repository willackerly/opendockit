# Tools

Development tools for OpenDocKit.

## Overview

| Tool | Port | Purpose | Entry Point |
|------|------|---------|-------------|
| **viewer** | 5174 | Interactive PPTX/PDF viewer with inspector, edit mode, thumbnails, perf overlay | `pnpm dev:viewer` |
| **element-debug** | 5176 | Element-level debug viewer with SBS comparison, RMSE analysis, click-to-inspect | `cd tools/element-debug && pnpm dev` |
| **test-harness** | 5175 | ~~Deprecated~~ — redirects to viewer | — |
| **perf** | — | Performance benchmarks (Vitest bench) | `pnpm perf` |

## Quick Start

```bash
# Viewer (primary dev tool)
pnpm dev:viewer

# Element debug viewer
cd tools/element-debug && pnpm dev

# Performance benchmarks
pnpm perf
```

## Viewer (`tools/viewer/`)

The main development tool. Supports both PPTX and PDF files.

**Features:**
- Drag-and-drop or file picker loading
- All slides rendered vertically with skeleton loading
- **Element inspector** — click any element to see kind, name, position, layer
- **Edit mode** — click-to-select, move/resize/text/delete, save modified PPTX
- **Thumbnail sidebar** — left panel with click-to-navigate slide thumbnails
- **Perf overlay** — floating badge showing total/avg/max render time
- **Save PNG** — per-slide PNG export
- **Format detection** — auto-detects PPTX vs PDF by extension or magic bytes

**E2E Tests:** 19 Playwright tests in `viewer/e2e/`. Run with `npx playwright test` from the viewer directory.

## Element Debug (`tools/element-debug/`)

Advanced side-by-side comparison tool for visual regression analysis.

**Features:**
- Load PPTX and PDF reference simultaneously
- Per-element property diff (position, size, color, font)
- RMSE-based quality assessment per slide
- CI bridge for automated visual regression (`window.__ciReady`, `__ciAssess`)
- Used by `scripts/generate-sbs-viewer.mjs` for automated SBS report generation

## CLI Scripts

For batch operations and CI, see the scripts in `scripts/`:

| Script | Usage |
|--------|-------|
| `pnpm sbs -- --pptx <path> --ref-dir <dir>` | Generate interactive SBS HTML viewer |
| `pnpm test:visual` | 54-slide PDF-referenced visual regression |
| `pnpm test:visual:corpus` | 10-file self-referential regression guard |
| `pnpm test:visual:pdf` | PDF rendering visual regression |
| `pnpm perf` | Run performance benchmarks |

## Shared Infrastructure

`tools/shared/vite-aliases.ts` — Shared Vite alias definitions for workspace packages. All tools import from here to avoid duplicating 30+ alias lines per config.

```ts
import { buildAliases } from '../shared/vite-aliases.js';
export default defineConfig({
  resolve: { alias: buildAliases(__dirname, { pdfSigner: true }) },
});
```
