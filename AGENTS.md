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

`packages/elements` (`@opendockit/elements`) is the unified element model — PageModel/PageElement types, spatial utilities, dirty tracking. Shared contract between PPTX and PDF renderers.

`packages/render` (`@opendockit/render`) holds shared render utilities — font metrics, color resolution, matrix math. Imports from `@opendockit/core`; does not maintain its own copy of the metrics bundle.

`packages/pdf` (`@opendockit/pdf`) is the PDF rendering package — PDFBackend implementation, PDF export pipeline for basic shapes/fills, batch PPTX→PDF conversion script.

`packages/pdf-signer` (`@opendockit/pdf-signer`) holds PDF signing primitives ported from Apache PDFBox — COS objects, COSWriter, xref generation, signature dictionary patching.

`packages/wasm-modules` will hold on-demand WASM accelerators (CanvasKit, HarfBuzz, etc.) — empty for now.

`tools/` contains development tooling: visual regression runner (LibreOffice oracle + pixelmatch), corpus test runner, coverage dashboard.

`test-data/` holds PPTX/DOCX/XLSX test fixtures. `docs/` mirrors the project hierarchy.

## Active Workstreams (2026-03-08)

- **Phase 0: Core Foundation (COMPLETE)** — OPC reader, XML parser, units, IR types, theme engine, color resolver, font resolver
- **Phase 1: DrawingML Pipeline (COMPLETE)** — All parsers, 187 preset geometries, Canvas2D renderers, media cache
- **Phase 2: PPTX Integration (COMPLETE)** — PresentationML parser, slide renderer, SlideKit API
- **Phase 3: Progressive Fidelity (COMPLETE)** — Capability registry, WASM loader, tables, connectors, auto-fit, placeholder resolution, style refs, hyperlinks, notes, visual regression pipeline
- **Phase 3.5: Diagnostics & Polish (COMPLETE)** — DiagnosticEmitter, vert/RTL text, tab stops, table auto-height, spAutoFit, placeholder content inheritance, theme fonts, SmartArt fallback, chart cached image fallback, text outline, underline fill, element inspector
- **Phase Edit: Mutable Object Model (COMPLETE)** — EditablePresentation, dirty tracking, XML reconstitution, OPC writer, EditableSlideKit, round-trip tests, visual regression for edits
- **Phase 4: PDF/Office Unified Architecture (Waves 0-4 COMPLETE)** — RenderBackend abstraction (CanvasBackend + PDFBackend), @opendockit/elements (unified element model), @opendockit/render (shared render utilities), @opendockit/pdf (PDF export pipeline), cross-format text search, clipboard serialize/deserialize, batch PPTX→PDF conversion, unified viewer. **3,841 tests passing** (1,570 core + 146 elements + 201 render + 322 pptx + 1,578 pdf-signer + 24 pdf).
- **Phase 4 remaining (deferred)** — Full ChartML parser, CanvasKit WASM, slide transitions, SVG export
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

## Aggressive Sub-Agent Fanout Strategy

**Default to parallel.** Sub-agents are cheap, context is expensive. When in doubt, fan out.

### When to Fan Out

| Situation | Strategy |
|-----------|----------|
| **Research / exploration** | Fan out 2-4 agents to search different areas simultaneously |
| **Independent code changes** | One agent per module/file that doesn't share imports |
| **Read-heavy analysis** | Offload large file reads to sub-agents to protect main context |
| **Validation** | Run typecheck, tests, and lint in parallel sub-agents |
| **Investigation + fix** | One agent diagnoses, another starts on the most-likely fix |

### Fanout Patterns

**Pattern 1: Research Fanout** — When you need to understand something, don't search sequentially. Launch 2-4 Explore agents in parallel with different search angles.
```
Agent A: "Find all call sites of functionX"
Agent B: "Find the type definition and its history"
Agent C: "Search for related test files"
→ Synthesize results in main context
```

**Pattern 2: Implementation Fanout** — When changes are independent, use worktree isolation.
```
Agent A (worktree): "Implement parser for feature X"
Agent B (worktree): "Implement renderer for feature X"
Agent C (main): "Write tests for feature X using mock data"
→ Merge worktrees, run integration tests
```

**Pattern 3: Validation Fanout** — After making changes, validate everything in parallel.
```
Agent A (background): "Run full test suite"
Agent B (background): "Run typecheck"
Agent C (background): "Check for untracked TODOs"
→ Continue working, handle results as they arrive
```

**Pattern 4: Speculative Fanout** — When the fix isn't certain, try multiple approaches.
```
Agent A (worktree): "Fix by adjusting the parser"
Agent B (worktree): "Fix by adjusting the renderer"
→ Compare results, keep the better solution
```

### Rules

1. **Always fan out for 3+ independent searches** — sequential search wastes context on intermediate results
2. **Use background agents for validation** — don't block on test runs
3. **Protect main context** — if you need to read >3 files to answer a question, use a sub-agent
4. **Prefer worktree isolation for code changes** — prevents merge conflicts between parallel agents
5. **Synthesize, don't relay** — when sub-agents return, summarize findings concisely; don't paste raw output into main context

---

## Proactive Context Management (MANDATORY)

**Context is your most precious resource.** Running out mid-task loses all accumulated understanding. Manage it actively, not reactively.

### The 70% Checkpoint Ritual

When you sense the conversation is getting long (many tool calls, large file reads, extensive back-and-forth), proactively perform a **checkpoint**:

#### Step 1: Commit Current Work
```bash
# Stage and commit whatever is working, even if incomplete
git add -A && git commit -m "wip: [description of current state]"
```

#### Step 2: Write Handoff Notes
Update these files so the next session (or post-compaction self) can resume instantly:

| File | What to Update |
|------|---------------|
| `QUICKCONTEXT.md` | Current state, what just changed |
| `TODO.md` | What's done, what's next, what's blocked |
| `KNOWN_ISSUES.md` | Any new gotchas discovered this session |
| Memory files | Stable patterns/insights worth preserving across sessions |

#### Step 3: Compact with Focus
Run `/compact` with a detailed focus hint:
```
/compact Preserve: current task context, files being edited, test results,
architectural decisions made this session. Discard: exploratory searches,
intermediate debugging output, file contents that can be re-read.
```

Or if switching tasks entirely, use `/clear` for a fresh start.

### Context Budget Awareness

**Habits that burn context fast:**
- Reading entire large files (use line ranges or sub-agents instead)
- Sequential searching (fan out to sub-agents)
- Keeping verbose test output in main context (use background agents)
- Re-reading files you already read (take notes or use memory files)

**Habits that preserve context:**
- Fan out research to sub-agents (their context is separate)
- Run validation in background (results arrive as notifications)
- Commit frequently (so you can `/clear` without losing work)
- Write status to files, not just conversation (files survive compaction)
- Use `/compact` proactively with a focus hint, don't wait for auto-compaction

### Why This Matters

Auto-compaction happens at the last moment and makes lossy choices about what to keep. By checkpointing at ~70%, you:
1. **Control what survives** — your handoff notes are in files, not just conversation
2. **Enable clean resumption** — post-compaction, re-read QUICKCONTEXT.md and you're back
3. **Prevent lost work** — committed code + documented state = nothing lost
4. **Improve focus** — compacting forces you to crystallize what actually matters

---

## Vite + Workspace Packages: Gotchas

The viewer (`tools/viewer/`) uses Vite with source-aliased workspace packages. This means Vite serves `.ts` source files from `packages/core/src/` and `packages/pptx/src/` directly (via `@fs/` URLs), NOT the compiled `dist/` output. This creates several non-obvious failure modes:

### Dynamic Imports Are Fragile

**Never use `@vite-ignore` with relative paths in workspace packages.** Vite's `@fs/` route does NOT do `.js → .ts` extension mapping, alias resolution, or module transformation for ignored imports. The browser gets a raw URL that points to a `.js` file that doesn't exist (only `.ts` source exists).

**Instead, use `import.meta.url` + `new URL()` for dynamic imports:**
```typescript
// WRONG — silently fails in Vite dev mode
const mod = await import(/* @vite-ignore */ './data/fonts/module.js');

// RIGHT — works in both Vite dev and production
function resolveModuleUrl(relativePath: string): string {
  const url = new URL(relativePath, import.meta.url);
  // Vite dev serves .ts source, production uses compiled .js
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    return url.href.replace(/\.js$/, '.ts');
  }
  return url.href;
}
const mod = await import(/* @vite-ignore */ resolveModuleUrl('./data/fonts/module.js'));
```

**Vite template literal dynamic imports (`` import(`./dir/${name}.js`) ``) also fail** for workspace packages because Vite's glob analysis doesn't work for files served via `@fs/`. You'll get "Unknown variable dynamic import" errors.

### The `@fs/` Boundary

When Vite serves a workspace package file via its `@fs/` prefix, that file exists in a different resolution context than the viewer's own source files. Things that work for the viewer's own code may NOT work for workspace package code:

- Static `import` statements: **Work** (Vite processes them normally via aliases)
- `import()` without `@vite-ignore`: **Fails** with "Unknown variable dynamic import" for computed paths
- `import()` with `@vite-ignore`: **Fails** if the URL points to `.js` when only `.ts` exists
- `import.meta.glob`: **Fails** — only works in Vite's project root, not external packages
- `import.meta.url`: **Works** — gives the correct `http://` URL for the file's location

### Testing Font/Asset Loading

Always E2E test dynamic module loading with Playwright. The unit test environment (Vitest/Node.js) uses different module resolution than Vite's browser dev server, so font loading bugs that are invisible in unit tests will be visible in the browser. See `tools/viewer/e2e/font-loading.spec.ts`.

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
| **Elements (unified model)**     | `packages/elements/`                                                           | Active development |
| **Render (shared utilities)**    | `packages/render/`                                                             | Active development |
| **PDF (export pipeline)**        | `packages/pdf/`                                                                | Active development |
| **PDF Signer**                   | `packages/pdf-signer/`                                                         | Active development |
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
