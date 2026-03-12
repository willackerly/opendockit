# Implementation Plans

## Phased Rollout

| Phase | Name                 | Weeks | Status      |
| ----- | -------------------- | ----- | ----------- |
| 0     | Core Foundation      | 1-3   | **Done**    |
| 1     | DrawingML Pipeline   | 4-8   | **Done**    |
| 2     | PPTX Integration     | 9-13  | **Done**    |
| 3     | Progressive Fidelity | 14-17 | **Done**    |
| 4     | Charts + Export      | 18-24 | **Done**    |
| 5     | Performance & Bundle | —     | **Planning** |
| 5.5   | Font Innovation      | —     | **Planning** |
| 6     | In-Canvas Editing    | —     | **Planning** |
| 7     | Cross-Format Save    | —     | **Planning** |
| 8     | Collaboration & AI   | —     | **Planning** |

> **Phase 5+ strategic planning** is in [`STRATEGIC_ROADMAP.md`](STRATEGIC_ROADMAP.md) — covers tree shaking, spatial indexing, PDF/A-3 lossless round-trip, variable fonts, OffscreenCanvas, in-canvas text editing, CRDT collaboration, and more.

## Detailed Plans

| Plan                          | Description                                                       |
| ----------------------------- | ----------------------------------------------------------------- |
| **`STRATEGIC_ROADMAP.md`**    | **Phase 5+ strategic roadmap** — cross-format save, in-canvas editing, performance, collaboration |
| `FONT_DELIVERY_PLAN.md`       | Font system architecture — metrics-only core, companion package, CDN fallback |
| `FONT_DELIVERY_EXECUTION.md`  | Font delivery step-by-step execution guide (Phases 1-5) |
| `CANVAS_TREE_PLAN.md`         | Canvas Tree Recorder — structural rendering comparison pipeline |
| `DOCX_LAYOUT_PLAN.md`         | DOCX page layout engine — 8-phase plan from line breaking to advanced |
| `pdf-office-merge-plan.md`    | PDF/Office unification strategy — architecture, bridges, user stories, roadmap |
| `fan-out-strategy.md`         | Parallel worktree execution plan for the PDF/Office merger (Waves 0–4) |
| (inline in architecture docs) | Phase details are in `docs/architecture/OOXML_RENDERER.md` Part 7 |

## PDF/Office Merger (2026-03-07 to 2026-03-08)

Major initiative merging pdfbox-ts signing infrastructure into the OpenDocKit monorepo and establishing the cross-format rendering pipeline. Nearly tripled test count (1,158 → 3,841 tests, 6 packages).

| Wave | Status | Work |
| ---- | ------ | ---- |
| Wave 0 (5 worktrees) | **Done** | RenderBackend+CanvasBackend (68 tests), `@opendockit/elements` (146 tests), `@opendockit/render` (201 tests), NativeRenderer JPEG+inline images (12 tests), PDF visual regression baselines (9 PDFs/18 pages) |
| Wave 1 (10 worktrees) | **Done** | All 10 DrawingML renderers migrated `rctx.ctx` → `rctx.backend`. 25 files, zero RMSE regression. |
| Wave 2 (3 worktrees) | **Done** | PDFBackend implementation (39 tests), `@opendockit/pdf` package scaffold (24 tests), PPTX→Elements bridge (28 tests) |
| Wave 3 | **Done** | PDF export: text, images, gradients, tables, connectors |
| Wave 4 | **Done** | DOM interaction layer, drag/resize, unified edit UX |

See `fan-out-strategy.md` for the full worktree conflict-zone analysis and execution details.
See `pdf-office-merge-plan.md` for vision, user stories, target architecture, and risk analysis.

## Decision Log

Architecture Decision Records live in `docs/adr/`.
