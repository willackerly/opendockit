# Repository Guidelines

## Read Before Coding

**Quick start (new agent):**

1. `QUICKCONTEXT.md` → 30-second orientation, current state of the world
2. `KNOWN_ISSUES.md` → active blockers, gotchas, common errors
3. `TODO.md` → consolidated task tracking

**Full context:** 4. `README.md` → repo purpose + quick start 5. `AGENTS.md` (this file) → norms 6. `docs/README.md` → documentation tree

## Agent Autonomy

**Maximum autonomy granted.** Act decisively. Ship code. Don't ask permission for routine work.

### Full Authority (no approval needed)

- Write, edit, refactor, delete code
- Run, write, fix tests
- Git: commit, push, branch, merge, rebase
- Add/remove/upgrade dependencies
- Create, update, reorganize, archive documentation
- Fix bugs, improve error handling, optimize performance
- Implement features that follow existing patterns

### Requires Discussion (enter plan mode)

Only **fundamental architectural decisions** that are hard to reverse:

- New major dependencies (e.g., framework changes)
- Data model/schema changes (database, API contracts)
- Security model changes (encryption, auth, key management)
- Creating new packages in the monorepo
- Protocol changes (API versioning, communication protocols)
- Breaking changes affecting existing users/data

### Never Without Explicit Request

- `git push --force` to shared branches
- `git reset --hard` on commits others have
- Deleting production data
- Modifying production secrets

**Rule of thumb:** If it follows existing patterns and is reversible → just do it. If it establishes new patterns or is hard to undo → plan mode.

---

## Cold Start Methodology (MANDATORY for New Agent Sessions)

**When starting a new session, always perform this sanity check before acting:**

### Step 1: Verify Document Freshness (5 min)

Don't trust docs blindly. Cross-reference against actual state:

```bash
# 1. Check current branch (docs may reference wrong branch)
git branch --show-current
git log --oneline -10

# 2. Compare QUICKCONTEXT.md claims against reality
cat QUICKCONTEXT.md

# 3. Check TODO.md "Last synced" date
head -10 TODO.md

# 4. Verify active workstreams match recent commits
git log --oneline -20 | head -10
```

### Step 2: Identify Discrepancies

Look for these common drift patterns:

- **Branch mismatch**: Docs say one branch, you're on another
- **Phase status lag**: Code shows Phase N complete but docs say Phase N-1
- **Stale dates**: "Last Updated" > 2 weeks old warrants scrutiny
- **Missing features**: Grep for features in code vs docs

### Step 3: Update Before Acting

If you find discrepancies:

1. **Minor drift**: Update the doc inline while working
2. **Major drift**: Update docs FIRST, then proceed with task
3. **Conflicting signals**: Ask user for clarification

### Step 4: Strategic Assessment

Before diving into code, ask:

- What's the **actual** current state? (git log, file structure)
- What's the **documented** next step? (TODO.md, workstreams)
- Do they align? If not, which is authoritative?
- Are there **blocked** items I should avoid?

### Why This Matters

Multiple agents work async on this codebase. Docs drift when agents complete work but don't update all references. Taking 5 minutes to verify state prevents hours of wasted effort on outdated priorities.

## Project Structure & Module Ownership

`packages/core` (`@opendockit/core`) is the shared OOXML infrastructure — OPC packaging, DrawingML parser/renderer, theme engine, color resolver, preset geometry engine, capability registry, WASM module loader. It must know nothing about any specific document format.

`packages/pptx` (`@opendockit/pptx`) is the PPTX renderer (SlideKit) — PresentationML parser, slide master/layout inheritance, slide renderer, SlideViewport, public API.

`packages/wasm-modules` will hold on-demand WASM accelerators (CanvasKit, HarfBuzz, etc.) — empty for now.

`tools/` contains development tooling: visual regression runner (LibreOffice oracle + pixelmatch), corpus test runner, coverage dashboard.

`test-data/` holds PPTX/DOCX/XLSX test fixtures. `docs/` mirrors the project hierarchy.

## Active Workstreams (2026-02-17)

- **Phase 0: Core Foundation (COMPLETE)** — OPC reader, XML parser, units, IR types, theme engine, color resolver, font resolver
- **Phase 1: DrawingML Pipeline (COMPLETE)** — All parsers, 187 preset geometries, Canvas2D renderers, media cache
- **Phase 2: PPTX Integration (COMPLETE)** — PresentationML parser, slide renderer, SlideKit API
- **Phase 3: Progressive Fidelity (IN PROGRESS)** — Capability registry, WASM loader, tables, connectors, auto-fit done; placeholder resolution + style refs remaining
- **Visual Validation (IN PROGRESS)** — Dev harness page for loading PPTX and rendering slides
- **Phase 4: Charts + Export (planned)** — ChartML, CanvasKit WASM, transitions, PDF/SVG export
- **DOCX support (future)** — WordprocessingML parser + page layout engine, reuses ~40% of core
- **XLSX support (future)** — SpreadsheetML parser + grid layout, reuses ~35% of core

---

## Sub-Agent Parallelization Guide

This project is designed for aggressive parallelization. The IR types are the central contract — parsers produce IR, renderers consume IR. They never call each other directly.

### Dependency DAG (What Blocks What)

```
SPINE (must exist first — do these sequentially or with 3 agents)
═══════════════════════════════════════════════════════════════
  [IR Types]          [XML Parser Wrapper]      [Unit Conversions]
  ir/common.ts        xml/fast-parser.ts        units/emu.ts
  ir/drawingml-ir.ts  xml/namespace-map.ts      units/dxa.ts
  ir/theme-ir.ts      xml/attribute-helpers.ts  units/half-points.ts
       │                    │                        │
       └────────────────────┴────────────────────────┘
                            │
FAN-OUT 1 (up to 6 agents) │
═══════════════════════════════════════════════════════════════
  [OPC Layer]     [Theme Parser]    [Color Resolver]
  opc/*           theme/theme-      theme/color-
                  parser.ts         resolver.ts
                                         │
  [Font Subst.]   [Shape Guide     [Preset Geometry
  font/subst-     Evaluator]        Definitions]
  table.ts        geometry/         geometry/preset-
                  shape-guide-      geometries.ts
                  eval.ts
                       │
FAN-OUT 2 (up to 13 agents — parsers + renderers in parallel)
═══════════════════════════════════════════════════════════════
  PARSERS (each independent):          RENDERERS (each independent):
  [fill parser]    [line parser]       [fill renderer]    [line renderer]
  [effect parser]  [transform parser]  [effect renderer]  [text renderer]
  [text-body]      [picture parser]    [picture renderer]
                       │                        │
COMPOSE (2-3 agents)   │                        │
═══════════════════════════════════════════════════════════════
  [shape-properties parser]  →  [shape renderer]
  [group parser]             →  [group renderer]
```

### How to Scope a Sub-Agent

Each module directory has a `MODULE.md` with:

- **Purpose** — what this module does (1 sentence)
- **Inputs** — what types/interfaces it receives
- **Outputs** — what types/interfaces it produces
- **Dependencies** — what other modules it imports from
- **Key reference** — which section of the architecture doc to read

**Tell your sub-agent:** "Read `packages/core/src/<module>/MODULE.md`, implement everything described there, write tests, commit."

### Rules for Parallel Agents

1. **Never modify IR types** without coordinating — they're the shared contract
2. **Each module owns its directory** — don't touch files outside your module
3. **Import IR types, don't redefine them** — always `import { FillIR } from '../ir/index.js'`
4. **Barrel exports** — each module has an `index.ts` that re-exports its public API
5. **Tests are self-contained** — create test fixtures inline, don't depend on other modules' test data
6. **Commit per module** — one commit per completed module, not one giant commit

### Max Parallelism by Stage

| Stage     | Max Agents | Wall Clock | Notes                                                 |
| --------- | ---------- | ---------- | ----------------------------------------------------- |
| Spine     | 3          | ~2-3 hrs   | IR types + XML + Units. MUST complete before fan-out. |
| Fan-out 1 | 6          | ~3-4 hrs   | OPC, theme, color, font, geometry eval, preset data   |
| Fan-out 2 | 8-13       | ~4-6 hrs   | All parsers + all renderers can run simultaneously    |
| Compose   | 2-3        | ~2-3 hrs   | shape-props parser, shape renderer, group handling    |
| Phase 2   | 4-5        | ~6-8 hrs   | PPTX-specific: slide parser, master/layout, viewport  |

### Cross-Phase Overlap

Phase 1 work can start before Phase 0 is 100% complete:

- Preset geometry definitions can start Day 1 (pure data, zero dependencies)
- Shape guide evaluator can start once Units exists
- All parsers can start once IR Types + XML Parser exist
- All renderers can start once IR Types + Units exist
- Theme-dependent rendering can use mock ThemeIR objects until Theme Engine ships

---

## Build, Test & Development Commands

```
pnpm install        # bootstrap workspace
pnpm dev            # run dev server
pnpm build          # build all packages
pnpm test           # run all tests
pnpm lint           # linting + typechecks
pnpm format         # auto-format
pnpm clean          # nuke node_modules
```

## Coding Style & File Summaries

TypeScript everywhere with strict configs. Follow Prettier defaults (2 spaces, semicolons, single quotes). No React in core/pptx packages — pure TS library with Canvas2D rendering. Name files after their primary export. For complex modules either add a two-line header comment or update the folder README's "File intent" table so others can skim responsibilities without reading implementations first.

## Testing Expectations

Unit/integration coverage runs through Vitest; co-locate specs beside code or inside `__tests__`. Visual regression tests use LibreOffice headless as an oracle (see `tools/visual-regression/`). Keep `docs/testing/COVERAGE.md` updated when coverage changes ≥2 pts and record new investigative scripts under `scripts/`.

### OOXML Spec Reference Policy

- OOXML implementation notes reside in `docs/specifications/` (per-section notes as we implement). Reference ECMA-376 section numbers in code comments.
- IR type changes must be reflected in `packages/core/src/ir/` and noted in the PR description.
- The spec compliance matrix (see `docs/architecture/PPTX_SLIDEKIT.md`) must be updated as features are implemented.

### Documentation Maintenance Policy

**Principle**: Code and docs must stay in sync. Outdated docs are worse than no docs—they mislead future agents and create compounding confusion.

**After every code change or task completion**, walk the doc tree and update affected files:

| Change Type                  | Docs to Update                                                        |
| ---------------------------- | --------------------------------------------------------------------- |
| **New feature/module**       | Package README, architecture docs if structural, workstreams if major |
| **API change**               | `docs/specifications/` first (contract-first!), then implementation   |
| **Bug fix**                  | Relevant README if it clarifies behavior; remove stale warnings       |
| **Config/env change**        | Getting started docs, package README, `.env.example`                  |
| **Test change**              | Coverage docs if coverage shifts ≥2pts                                |
| **Phase/milestone complete** | Plan docs, workstreams, status docs                                   |
| **New file/module**          | Parent folder's README "File intent" table or header comment          |

**Doc Update Checklist** (include in PR/commit):

1. **Local**: Did you update the nearest README (package, folder)?
2. **Specifications**: Did you update specs if interfaces changed?
3. **Plans**: Did you update plan docs if a task/phase completed?
4. **Workstreams**: Did you update workstreams if priorities shifted?
5. **Breadcrumbs**: Are new files linked from parent READMEs so they're discoverable?

**Why this matters**: Multiple agents work on this codebase asynchronously. Each agent relies on docs to understand context without reading the full history. Stale docs cause wasted effort, duplicate work, and architectural drift.

**Enforcement**: PRs that change code without corresponding doc updates should be flagged. When in doubt, over-document—it's cheaper to trim than to reconstruct context.

#### Doc Ownership by Workstream

| Workstream                       | Owned Docs                                                                     | Responsibility     |
| -------------------------------- | ------------------------------------------------------------------------------ | ------------------ |
| **Core (OPC, DrawingML, theme)** | `packages/core/`, `docs/architecture/OOXML_RENDERER.md`                        | Active development |
| **PPTX (SlideKit)**              | `packages/pptx/`, `docs/architecture/PPTX_SLIDEKIT.md`                         | Active development |
| **WASM Modules**                 | `packages/wasm-modules/`                                                       | Future             |
| **Testing Infrastructure**       | `tools/`, `docs/testing/`                                                      | Active development |
| **Cross-cutting**                | `AGENTS.md`, `QUICKCONTEXT.md`, `KNOWN_ISSUES.md`, `TODO.md`, `docs/README.md` | All agents share   |

#### Archive Policy

**When to archive:**

- Feature/phase 100% complete and no longer changing
- Status snapshot > 3 months old AND newer snapshot exists
- Planning doc for approach not implemented

**Never archive:** `AGENTS.md`, `QUICKCONTEXT.md`, `TODO.md`, `KNOWN_ISSUES.md`, `CLAUDE.md`, `docs/architecture/` (latest versions), `docs/specifications/`

**How to archive:**

1. Move to `docs/archive/YYYY-MM-DD-description/`
2. Add header: `ARCHIVED: [DATE] | REASON: [reason] | CURRENT: [link to replacement]`
3. Update archive index
4. Remove link from parent README

#### Navigation: Where to Document What

| I Need to Document      | Go Here                                      |
| ----------------------- | -------------------------------------------- |
| **Feature being built** | `docs/plans/[NAME]_PLAN.md`                  |
| **System design**       | `docs/architecture/[TOPIC].md`               |
| **API or data format**  | `docs/specifications/`                       |
| **Testing approach**    | `docs/testing/`                              |
| **Current state**       | `docs/current-status/STATUS_YYYY-MM-DD.md`   |
| **Blockers**            | `KNOWN_ISSUES.md`                            |
| **Tasks**               | `TODO.md` (track with TRACKED-TASK: in code) |
| **File purpose**        | Nearest README "File intent" table           |
| **Historical context**  | `docs/archive/`                              |

### Quality Gates

Run lint, typecheck, and tests before every push. Document every run in your PR summary. No skipping core contract tests—if they flake, fix or revert. Any temporary skip must link to a tracking issue and include a removal date.

## Commit & PR Guidelines

Use conventional prefixes (`feat:`, `fix:`, `ui:`, `docs:`, `build:`). PRs must describe the user-facing impact, list touched packages/folders, link to docs or issues, and include screenshots/logs for UI or CLI changes. Call out new tests (or explain gaps) and note any follow-up work. Never commit secrets—store reproducible fixtures under `test-data/` with clear filenames.

**Documentation in every PR**: List which docs were updated (or confirm none needed). Use the Doc Update Checklist above.

## TODO Tracking (MANDATORY PRE-COMMIT)

**This is a hard requirement for all agents.**

### Two-Tag System

| Tag             | Meaning         | Commit Allowed?       |
| --------------- | --------------- | --------------------- |
| `TODO:`         | Untracked work  | No - must track first |
| `TRACKED-TASK:` | In TODO.md/docs | Yes                   |

### Before Every Commit

```bash
# 1. Find untracked TODOs (should be 0)
grep -rn "TODO:" --include="*.ts" --include="*.tsx" packages/

# 2. If untracked TODOs found:
#    - Add to TODO.md
#    - Convert TODO: → TRACKED-TASK: in code
#    - Re-run check

# 3. Only commit when untracked TODOs = 0
```

### When Adding Code Comments

**Wrong (blocks commit):**

```typescript
// TODO: Handle edge case for encrypted PDFs
```

**Right (after tracking in TODO.md):**

```typescript
// TRACKED-TASK: Handle edge case for encrypted PDFs - see TODO.md "Code Debt"
```

### Periodic Scrub

Weekly or per-sprint, audit `TRACKED-TASK:` comments:

1. Verify each is still documented in TODO.md
2. Remove completed items from both code and docs
3. Update stale references
