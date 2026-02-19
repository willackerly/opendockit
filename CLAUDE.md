# CLAUDE.md

Project instructions for Claude Code. These override defaults—follow them exactly.

## Project: OpenDocKit

Progressive-fidelity, 100% client-side OOXML document renderer. Monorepo with shared DrawingML core and format-specific packages (PPTX first, then DOCX/XLSX).

## Cold Start (New Agent?)

**Read in order:**

1. `QUICKCONTEXT.md` → 30-second orientation, current state
2. `KNOWN_ISSUES.md` → blockers, gotchas, common errors
3. `TODO.md` → what needs doing

**Then deep dive:** 4. `AGENTS.md` → norms, workstreams, doc maintenance policy 5. `docs/README.md` → full documentation tree

## Commands

```bash
pnpm install                # bootstrap workspace
pnpm dev                    # run dev server
pnpm build                  # build all packages
pnpm test                   # run all tests
pnpm lint                   # prettier + typecheck
pnpm format                 # prettier --write
pnpm typecheck              # type checking
pnpm clean                  # nuke node_modules

# Font pipeline (requires fonts/ dir — run fonts:download first on new clone)
pnpm fonts:download         # download Google Fonts TTFs to fonts/ (needs internet + python3 fontTools)
pnpm fonts:metrics          # regenerate metrics-bundle.ts from fonts/
pnpm fonts:woff2            # regenerate WOFF2 TS bundles from fonts/ (needs python3 fontTools)
pnpm fonts:bundle           # regenerate both metrics + WOFF2
pnpm fonts:rebuild          # full pipeline: download + metrics + WOFF2
```

## Structure

- `packages/core/` - `@opendockit/core` — shared OOXML infrastructure (OPC, DrawingML, themes, geometry)
- `packages/pptx/` - `@opendockit/pptx` — PPTX renderer (SlideKit)
- `packages/wasm-modules/` - On-demand WASM accelerators (future)
- `tools/` - Visual regression, corpus runner, coverage dashboard
- `test-data/` - PPTX/DOCX/XLSX test fixtures
- `docs/` - Architecture, specs, testing, plans, status
- `scripts/` - Build and utility scripts

## Coding Style

TypeScript strict mode. Prettier defaults (2 spaces, semicolons, single quotes). Name files after primary export. Keep changes minimal—don't over-engineer. No React in core/pptx packages (pure TS library). Canvas2D for rendering.

## Testing

Co-locate unit tests beside code or in `__tests__/`. Tag E2E tests (`@critical`, `@visual`). Update coverage docs when coverage shifts ≥2pts.

---

## Allowed Commands

The following command patterns are pre-approved for autonomous execution:

### Package Management & Build

- `pnpm install`, `pnpm add`, `pnpm remove`, `pnpm rebuild`
- `pnpm build`, `pnpm dev`, `pnpm clean`
- `pnpm --filter <pkg> build`, `pnpm --filter <pkg> dev`
- `npm run build`, `npm rebuild`

### Testing

- `pnpm test`, `pnpm test:watch`, `pnpm test:unit`
- `pnpm test:e2e`, `pnpm test:e2e:critical`
- `pnpm test:contracts`
- `npx vitest`, `npx playwright test`

### Type Checking & Linting

- `pnpm lint`, `pnpm format`, `pnpm typecheck`
- `pnpm tsc`

### Git Operations

- `git status`, `git diff`, `git log`, `git show`
- `git add`, `git commit`, `git push`, `git pull`
- `git checkout`, `git branch`, `git fetch`
- `git stash`, `git reset`, `git restore`
- `git cherry-pick`, `git merge`, `git rebase`
- `git rm`, `git mv`, `git ls-tree`, `git show-ref`
- `git worktree`, `git remote`

### File & System Utilities

- `ls`, `tree`, `find`, `cat`, `head`, `tail`
- `echo`, `tee`, `stat`, `chmod`, `dd`
- `strings`, `awk`, `xargs`, `test`
- `timeout`, `lsof`, `pkill`, `killall`, `jobs`
- `curl`, `node`, `python3`

### Scripts

- `./scripts/*.sh`
- `node <script>.mjs`, `node <script>.js`
- `bash <script>.sh`

## Web Fetch Domains

Pre-approved for fetching:

- `github.com`, `raw.githubusercontent.com`
- `npmjs.com`, `pnpm.io`
- `vitejs.dev`, `vitest.dev`, `playwright.dev`
- `react.dev`, `typescriptlang.org`, `nodejs.org`
- `developer.mozilla.org`
- `officeopenxml.com` — OOXML spec reference
- `ecma-international.org` — ECMA-376 standard

## Agent Autonomy

**This project grants MAXIMUM autonomy.** Act decisively. Ship code. Don't ask permission for routine work.

### DO WITHOUT ASKING

1. **All coding tasks** - Write, edit, refactor, delete code freely
2. **All testing** - Run, write, fix, skip tests as needed
3. **All builds** - Build, rebuild, clean as needed
4. **All git operations** - Add, commit, push, branch, merge, rebase
5. **All dependency changes** - Add, remove, upgrade packages
6. **All documentation** - Create, update, reorganize, archive docs
7. **All file operations** - Create, move, rename, delete files
8. **Bug fixes** - Fix bugs immediately without discussion
9. **Refactoring** - Improve code quality, reduce duplication
10. **Test fixes** - Update broken tests, add missing coverage
11. **Config changes** - Update configs, env vars, build settings
12. **Minor features** - Small enhancements that follow existing patterns
13. **Error handling** - Add/improve error handling and logging
14. **Performance fixes** - Optimize slow code paths

### ASK ONLY FOR

**Fundamental architectural decisions** that would be hard to reverse:

1. **New major dependencies** - Adding a framework (e.g., switching from React to Vue)
2. **Data model changes** - Modifying database schema, API contracts
3. **Security model changes** - Altering encryption, auth, or key management approach
4. **New services/packages** - Creating entirely new packages in the monorepo
5. **Protocol changes** - Modifying API versioning or communication protocols
6. **Breaking changes** - Changes that break existing users or data

**When in doubt:** If a change follows existing patterns and is reversible, just do it. If it establishes a new pattern or is hard to undo, enter plan mode.

### Force Operations (require explicit user request)

- `git push --force` to shared branches
- `git reset --hard` on commits others might have
- Deleting production data or databases
- Modifying secrets/credentials in production

## Environment Variables

```bash
# No environment variables required — 100% client-side, no server dependencies.
# Test-only:
# LIBREOFFICE_PATH=/usr/bin/libreoffice  # for visual regression oracle
```

---

## TODO Tracking Methodology (MANDATORY)

**This is a hard requirement. Follow exactly.**

### The Two-Tag System

| Tag             | Meaning                 | Action Required                      |
| --------------- | ----------------------- | ------------------------------------ |
| `TODO:`         | Untracked work item     | Must be tracked before commit        |
| `TRACKED-TASK:` | Already in TODO.md/docs | Periodically verify still documented |

### Workflow

**When you add a TODO in code:**

```typescript
// TODO: Handle edge case for encrypted PDFs
```

**Before committing, you MUST either:**

1. Fix it immediately (remove the TODO), OR
2. Track it in `TODO.md` and convert to:

```typescript
// TRACKED-TASK: Handle edge case for encrypted PDFs - see TODO.md "Code Debt"
```

### Pre-Commit Checklist

**Run before every commit:**

```bash
# Find untracked TODOs (should be 0 before commit)
grep -rn "TODO:" --include="*.ts" --include="*.tsx" packages/

# Find tracked tasks (audit these periodically)
grep -rn "TRACKED-TASK:" --include="*.ts" --include="*.tsx" packages/
```

**If untracked TODOs exist, you must:**

1. Add each to `TODO.md` under appropriate section
2. Convert `TODO:` → `TRACKED-TASK:` in source
3. Re-run check to confirm zero untracked TODOs

### Periodic Scrub (Weekly or Per-Sprint)

For `TRACKED-TASK:` items:

1. Verify each is still in `TODO.md` or relevant doc
2. If completed, remove from both code and docs
3. If stale (no longer relevant), remove from both
4. If doc reference is wrong, update the comment

### Why This Matters

- **TODOs get lost.** Scattered comments with no tracking = technical debt amnesia.
- **Agents work async.** Next agent needs to know what's pending without reading all code.
- **State consistency.** Code comments, TODO.md, and docs must agree.

### Quick Reference

```bash
# Find untracked TODOs (should be 0 before commit)
grep -rn "TODO:" --include="*.ts" --include="*.tsx" packages/

# Find tracked tasks (audit these periodically)
grep -rn "TRACKED-TASK:" --include="*.ts" --include="*.tsx" packages/
```
