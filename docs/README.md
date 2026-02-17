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

## Other

| Directory         | Purpose                                                |
| ----------------- | ------------------------------------------------------ |
| `specifications/` | OOXML spec notes, format-specific implementation notes |
| `testing/`        | Testing strategy, coverage tracking                    |
| `plans/`          | Implementation phase plans                             |
| `current-status/` | Status snapshots at milestones                         |
| `archive/`        | Completed/obsolete docs                                |
