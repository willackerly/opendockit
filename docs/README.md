# Documentation Tree

## Quick Start (read these first)

| Doc                  | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `../QUICKCONTEXT.md` | 30-second orientation, current state      |
| `../KNOWN_ISSUES.md` | Active blockers, gotchas, common errors   |
| `../TODO.md`         | Consolidated task tracking                |
| `../AGENTS.md`       | Agent norms, workstreams, doc maintenance |

## Architecture

| Doc                              | Purpose                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `architecture/OOXML_RENDERER.md` | Full multi-format architecture (core + pptx + docx + xlsx) |
| `architecture/PPTX_SLIDEKIT.md`  | Detailed PPTX renderer design (SlideKit)                   |
| `architecture/README.md`         | Architecture docs index                                    |

## Architecture Decision Records

| ADR                                | Decision                                   |
| ---------------------------------- | ------------------------------------------ |
| `adr/001-canvas2d-primary.md`      | Canvas2D as primary render target          |
| `adr/002-no-libreoffice-embed.md`  | LibreOffice as oracle, not embedded        |
| `adr/003-drawingml-shared-core.md` | DrawingML in shared core package           |
| `adr/004-ir-serializable.md`       | IR is serializable JSON, not a file format |

## Tools

| Doc                | Purpose                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `../tools/README.md` | Dev tools overview: viewer, element-debug, perf, CLI scripts       |

## Other

| Directory         | Purpose                                                |
| ----------------- | ------------------------------------------------------ |
| `specifications/` | OOXML spec notes, format-specific implementation notes |
| `testing/`        | Testing strategy, coverage tracking                    |
| `plans/`          | Implementation phase plans (see below)                 |
| `current-status/` | Status snapshots at milestones                         |
| `archive/`        | Completed/obsolete docs                                |

## Plans

| Plan                                     | Purpose                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| **`plans/STRATEGIC_ROADMAP.md`**         | Phase 5+ strategic roadmap — cross-format save, editing, performance, blindpipe  |
| `plans/FONT_DELIVERY_PLAN.md`            | Font system architecture — metrics-only core, companion package, CDN fallback    |
| `plans/FONT_DELIVERY_EXECUTION.md`       | Font delivery step-by-step execution guide (Phases 1-5)                          |
| `plans/CANVAS_TREE_PLAN.md`              | Canvas Tree Recorder — structural rendering comparison pipeline                  |
| `plans/DOCX_LAYOUT_PLAN.md`              | DOCX page layout engine — 8-phase plan                                           |
| `plans/pdf-office-merge-plan.md`         | PDF/Office unification vision and user stories                                   |
| `plans/fan-out-strategy.md`              | Parallel worktree execution plan for the PDF/Office merger                       |
