# Developer Experience Issues

This file tracks usability, discoverability, and developer experience issues found during development. The goal is to make the codebase easy to navigate and understand for all contributors (human and AI).

## Criticality Levels

| Level | Meaning | Example |
|-------|---------|---------|
| **P0** | Blocks work entirely | Missing build step, broken dependency, can't run tests |
| **P1** | Significant friction | Had to read 5+ files to find a tool, no docs for key workflow |
| **P2** | Minor friction | Undocumented command, inconsistent naming, missing cross-reference |
| **P3** | Cosmetic | Placeholder file, outdated comment, minor formatting |

## Issues

| Issue | Discovery Context | Criticality | Status | Resolution |
|-------|-------------------|-------------|--------|------------|
| No scripts registry | Had to `ls scripts/` and read each file to understand available tooling | P1 | Resolved | Created `scripts/README.md` |
| Package entry points unclear | No README.md in 5/6 packages; must find MODULE.md deep in `src/` tree | P1 | Resolved | Created per-package README.md files |
| Font pipeline guidance missing | `pnpm fonts:*` commands exist but no docs on when/why to run each | P1 | Resolved | Added decision tree to `docs/testing/README.md` |
| E2E tests undiscoverable | 19 Playwright tests in `tools/viewer/e2e/` not referenced in any testing doc | P2 | Resolved | Added E2E section to testing docs |
| Empty placeholder dirs in tools/ | `tools/visual-regression/`, `tools/corpus-runner/`, `tools/coverage-dashboard/` exist but are empty with no explanation | P2 | Resolved | Created `tools/README.md` |
| `pnpm test:visual:export` undocumented | Script exists in root package.json but appears in zero docs | P2 | Resolved | Added to testing docs |
| `generate-visual-gallery.sh` undocumented in repo | Only documented in agent memory notes, not in any committed file | P2 | Resolved | Added to `scripts/README.md` and testing docs |
| `docs/specs/README.md` is placeholder | Contains only template text, no actual spec references | P3 | Resolved | Populated with OOXML spec references |

## Process

- **Log issues** as you encounter them during development
- **Review periodically** (weekly or per-sprint) to prioritize and fix
- **Resolve** by updating status and noting what was done
- **Remove** entries that are no longer relevant
