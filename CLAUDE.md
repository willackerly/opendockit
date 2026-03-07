# CLAUDE.md

Project instructions for Claude Code. These override defaults — follow them exactly.

## Project: pdfbox-ts

TypeScript port of Apache PDFBox signing primitives. Goal: byte-for-byte parity with Java PDFBox for incremental and full-save PDF signing. This library powers `pdf-signer-web`.

## Autonomy Policy: MAXIMUM — NO CONFIRMATION NEEDED

**Work independently. Don't ask permission — take action. NEVER wait for approval on any command.**

All of the following are PRE-APPROVED — execute without asking:
- Run any bash command (python, node, qpdf, git, pnpm, etc.)
- Read/write/edit any file in the repo
- Install/remove dependencies
- Git operations (commit, push, branch, merge)
- Download JARs, run Java signer
- Make architectural decisions
- Create/delete files
- Run scripts that generate output files
- Execute multi-step debugging workflows end-to-end

**Only pause for**:
- Force push to main/master
- Modifying `fixtures/keys/` keypair
- Genuinely unclear HIGH-LEVEL requirements (never ask about HOW to do something)

**Default**: Act first. If something fails, fix it and continue. Chain commands. Run things in parallel. Be aggressive.

## Cold Start (New Agent?)

**Read FIRST before any work:**
1. `docs/CURRENT_STATE.md` — what was just worked on, blocking issues, immediate next step
2. `docs/ROADMAP.md` — parity gaps, execution order, what's done vs remaining

**Then if needed:**
3. `docs/PORTING_STATUS.md` — Java component checklist, TS symbol mapping
4. `docs/PDFBOX_CLASS_INVENTORY.md` / `PDFBOX_CLASS_RELEVANCE.md` — Java class reference

## State Updates (MANDATORY)

**Update docs as you work:**
- `docs/CURRENT_STATE.md` — Update after every significant change or session end
- `docs/ROADMAP.md` — Mark items complete, add new gaps discovered

**Before ending a session**, ensure CURRENT_STATE.md reflects:
- What you accomplished
- Current blocking issues
- Exact next step for the next agent

## Mission

Deliver byte-for-byte parity with Apache PDFBox (incremental and full-save). Keep the comparison harness deterministic. Any change should either improve parity or strengthen tests/docs.

## Project Imperative

Default to full PDFBox port mindset: aggressively mirror Java implementation. When in doubt, port completely — prefer over-porting to under-porting. Document any intentional deviation. Follow Java sources and parity artifacts as the north star.

## Project Structure

```
src/
  index.ts                    # Public API exports (signing + unified document API)
  version.ts                  # Runtime version tracking
  document/                   # Unified document API (native COS-based, pdf-lib fully removed)
    index.ts                  # Barrel export
    PDFDocument.ts            # Document wrapper (~50 methods, includes renderPage())
    PDFPage.ts                # Page wrapper (~60 methods, drawing ops)
    PDFFont.ts                # Font wrapper
    PDFImage.ts               # Image wrapper
    PDFEmbeddedPage.ts        # Embedded page wrapper
    PDFForm.ts                # Form wrapper
    fields/                   # Form field wrappers (8 field types)
    colors.ts                 # Native: rgb(), cmyk(), grayscale()
    rotations.ts              # Native: degrees(), radians()
    sizes.ts                  # Native: PageSizes constant
    StandardFonts.ts          # Native: 14 standard font names
    options.ts                # Native: all option interfaces + enums
    __tests__/                # Compatibility tests
  pdfbox/
    cos/                      # COS object model (COSBase, COSDictionary, etc.)
    io/                       # I/O utilities (RandomAccessBuffer, COSInputStream)
    parser/                   # PDF parsing (xref, trailer, objects, full-document-loader, object-graph)
    writer/                   # PDF writing (COSWriter, XRefBuilder, FullSaveWriter, CompressionPool)
    pdmodel/                  # PDF model classes (PDSignatureField)
    __tests__/                # Unit tests for pdfbox internals
  render/                     # PDF rendering (wraps PDF.js, optional peer dep)
    PDFRenderer.ts            # Renderer class (create, fromDocument, renderPage)
    canvas-factory.ts         # Node.js (canvas) / browser canvas abstraction
    types.ts                  # RenderOptions, RenderResult
    index.ts                  # Barrel export (pdfbox-ts/render sub-path)
  signer/                     # High-level signing API
  cli/                        # Parity harness entrypoints
  testing/                    # Deterministic fixture signer
  types/                      # TypeScript interfaces
  errors/                     # Custom error classes
test-pdfs/                    # Fixtures + manifest.json
fixtures/keys/                # Deterministic RSA keypair + PKCS#12
scripts/                      # Java signer, PDFBox download
docs/                         # Roadmap, porting status, state
tmp/                          # Harness outputs (gitignored)
vendor/                       # Cached PDFBox JARs (gitignored)
```

## Commands

```bash
pnpm install                              # bootstrap
pnpm build                                # TypeScript -> dist/
pnpm typecheck                            # type checking only

# Parity harness
pnpm compare -- --fixture <id>            # TS vs Java for one fixture
pnpm compare -- --all                     # all fixtures
pnpm compare -- --fixture <id> --skip-java  # TS-only (no JRE)
pnpm parity:report                        # failure histogram

# With Java (set JAVA if not on PATH)
JAVA=/opt/homebrew/opt/openjdk@21/bin/java pnpm compare -- --fixture wire-instructions

# Force full-save mode
PDFBOX_TS_FORCE_FULL_SAVE=1 pnpm compare -- --fixture google-docs-presentation-large
```

## Allowed Commands (All Pre-Approved)

Everything is allowed. Run whatever you need.

## Testing Tiers

Tests are organized in tiers by speed and scope. **Always run the right tier for the situation.**

### Quick Reference

| Command | What it runs | Time | When to use |
|---------|-------------|------|-------------|
| `pnpm test` | Unit + integration tests | ~2s | Every commit, every change |
| `pnpm compare -- --all` | 9-fixture byte parity | ~10s | After any signer/writer change |
| `pnpm test:corpus` | 1000+ real-world PDFs | ~10min | Before release, after parser changes |
| `pnpm test:all` | Everything (test + corpus) | ~10min | Before release |
| `pnpm test:visual` | Pixel-diff rendering | ~5s | After appearance stream changes |
| `pnpm test:acrobat` | Adobe Acrobat validation | ~30s | After signature structure changes |
| `pnpm test:ltv` | LTV with local OCSP | ~5s | After LTV/DSS changes |

### Tier 1: Fast Tests (`pnpm test`) — EVERY COMMIT

**~2 seconds.** Runs all unit tests, integration tests, and the document facade compat tests.
Does NOT run the 1000+ PDF robustness corpus (env-gated).

```bash
pnpm test                    # 72 test files, ~1565 tests, ~4s
pnpm test -- <pattern>       # specific test file
```

What's included:
- COS object model tests (COSWriter, XRef, etc.)
- Parser tests (xref, trailer, objects)
- Signer tests (guards, multi-signature, visual-signature)
- TSA unit tests
- LTV unit tests (mock, no network)
- Document facade compat tests

### Tier 2: Parity Tests (`pnpm compare -- --all`) — AFTER SIGNER/WRITER CHANGES

**~10 seconds.** Signs 9 fixtures and verifies byte-for-byte parity with Java PDFBox.
This is the source of truth for signing correctness.

```bash
pnpm compare -- --fixture wire-instructions  # quick sanity (1 fixture)
pnpm compare -- --all                        # all 9 fixtures
pnpm compare -- --all --skip-java            # TS-only (no JRE needed)
```

### Tier 3: Robustness Corpus (`pnpm test:corpus`) — BEFORE EVERY RELEASE

**~10 minutes.** Signs 1000+ real-world PDFs from 9 sources. This catches edge cases
that unit tests miss: exotic xref layouts, linearized PDFs, ObjStm-packed AcroForms,
unusual page trees, and more.

```bash
pnpm test:corpus             # corpus only (~10 min)
pnpm test:all                # everything: unit + corpus
```

**Requires**: `../known-good-unsigned/` folder (not in repo — contains third-party PDFs).

Sources: Apache PDFBox test suite, Mozilla PDF.js (768 PDFs), qpdf, SafeDocs (DARPA),
pyHanko, OpenPreserve Cabinet of Horrors, PDF 2.0 spec, IRS forms, GovDocs1.

### Tier 4: E2E / Live Tests — SITUATIONAL

These require external infrastructure and are run manually when relevant:

```bash
# Visual rendering (pdftoppm + pixelmatch snapshots)
pnpm test:visual                             # needs pdftoppm installed
pnpm test:update-snapshots                   # regenerate reference PNGs

# Adobe Acrobat validation (macOS only)
pnpm test:acrobat                            # needs Acrobat + trust configured

# LTV with local OCSP (needs CA infrastructure running)
bash scripts/ltv-ca-setup.sh                 # one-time PKI setup
bash scripts/ltv-ocsp-start.sh               # start OCSP + CRL servers
pnpm test:ltv                                # run LTV E2E tests
bash scripts/ltv-ocsp-stop.sh                # stop servers

# Live TSA timestamp
TSA_URL=http://timestamp.digicert.com pnpm test -- tsa-live
```

### Pre-Release Checklist

**Before bumping version or publishing, run ALL of these:**

```bash
# ┌─────────────────────────────────────────────────────────────┐
# │                  PRE-RELEASE CHECKLIST                      │
# │                                                             │
# │  ALL of these must pass before any version bump / publish.  │
# │  Do not skip any. Copy-paste and run sequentially.          │
# └─────────────────────────────────────────────────────────────┘

pnpm typecheck                               # 1. Types compile
pnpm test                                    # 2. Fast tests pass (~2s)
pnpm compare -- --all                        # 3. 9-fixture parity (~10s)
pnpm test:corpus                             # 4. 1000+ PDF corpus (~10min)
pnpm test:visual                             # 5. Rendering snapshots
pnpm test:acrobat                            # 6. Adobe Acrobat validation
```

### Determinism
- Use the keypair in `fixtures/keys/` for all signing
- Lock timestamps with `PDFBOX_TS_SIGN_TIME` and `PDFBOX_TS_CMS_SIGN_TIME`
- Never commit signed PDFs; `tmp/` is gitignored

### Harness Output
Every `pnpm compare` run produces in `tmp/<fixture>/`:
- `ts.pdf`, `java.pdf` — Signed outputs
- `ts.json`, `java.json` — Metadata (SHA256, ByteRange, Contents, startxref)
- `structure-ts.txt`, `structure-java.txt` — XRef/ObjStm dumps

## Coding Style

TypeScript strict mode. Follow existing patterns. When porting from Java, mirror the PDFBox implementation closely — prefer over-porting to under-porting. Document any intentional deviation from Java behavior.

## Active Workstreams

- **Incremental signing** — ✅ Byte-for-byte parity achieved (all 9 fixtures)
- **Visual signatures (PNG)** — ✅ Adobe Acrobat verified (blue "Certified" banner)
- **Multi-user signing** — ✅ Implemented and tested (5 tests)
- **CMS encoding** — ✅ BER (parity default) + DER toggle via `PDFBOX_TS_CMS_DER`
- **Adobe Acrobat cert trust** — ✅ `signatureValidate()` = 4 (VALID)
- **TSA timestamps** — ✅ RFC 3161 support via `timestampURL` option (DigiCert verified)
- **Browser compatibility** — ✅ No Node.js built-ins in public API (forge + pako)
- **Strangler Fig** — ✅ Phases 1-7 complete (pdf-lib demoted to optional peerDependency, native AcroForm reading)
- **Full-save fallback** — ✅ Structurally verified (qpdf + pdfsig); all 9 fixtures pass
- **SDK docs** — ✅ `docs/SDK_GUIDE.md` complete

## Environment Variables

```bash
# Runtime
JAVA=/opt/homebrew/opt/openjdk@21/bin/java   # Java runtime (if not on PATH)
PDFBOX_TS_SIGN_TIME=2024-01-01T00:00:00Z     # Deterministic signing timestamp
PDFBOX_TS_CMS_SIGN_TIME=2024-01-01T00:00:00Z # Deterministic CMS timestamp
PDFBOX_TS_FORCE_FULL_SAVE=1                  # Force full-save mode for testing
PDFBOX_TS_CMS_DER=1                          # Use DER encoding instead of BER for CMS
PDFBOX_TS_TRACE=1                            # Debug tracing

# Test gates (set =1 to enable)
PDFBOX_TS_CORPUS=1                           # Enable 1000+ PDF robustness corpus
PDFBOX_TS_E2E_VISUAL=1                       # Enable visual rendering snapshot tests
PDFBOX_TS_E2E_ACROBAT=1                      # Enable Adobe Acrobat validation tests
PDFBOX_TS_E2E_LTV=1                          # Enable LTV E2E tests (needs local OCSP)
TSA_URL=http://timestamp.digicert.com        # Enable live TSA timestamp test
```

## Documentation Maintenance

| When | Update |
|------|--------|
| Start of session | Read `docs/CURRENT_STATE.md` first |
| After significant progress | Update `docs/CURRENT_STATE.md` |
| Task completed | Mark done in `docs/ROADMAP.md` |
| New blocker found | Add to `docs/CURRENT_STATE.md` |
| End of session | Update `docs/CURRENT_STATE.md` with exact next step |
| Porting change | Update `docs/PORTING_STATUS.md` |

## Adobe Acrobat Automation (`scripts/adobe-auto.py`)

Python automation helper for testing PDFs in Adobe Acrobat. All operations have a 10s timeout — nothing can hang.

### Commands
```bash
python3 scripts/adobe-auto.py diagnose                     # Test all 17 APIs (should be 17/17)
python3 scripts/adobe-auto.py validate <pdf> [screenshot]  # Open, wait for sig validation, screenshot, report
python3 scripts/adobe-auto.py open <pdf> [--screenshot X]  # Open PDF in Acrobat
python3 scripts/adobe-auto.py js "this.numPages"           # Run JavaScript in Acrobat
python3 scripts/adobe-auto.py screenshot [path]            # Capture frontmost window
python3 scripts/adobe-auto.py siginfo                      # Get signature field details
python3 scripts/adobe-auto.py close                        # Close frontmost document
python3 scripts/adobe-auto.py windows                      # List all Acrobat windows
```

### Critical Rules (MUST FOLLOW)
1. **JS bridge: Use SINGLE QUOTES** — `this.getField('Sig1')` NOT `this.getField("Sig1")`. Double quotes break AppleScript escaping.
2. **NEVER use `app.alert()` or dialog-showing JS** — These create modal dialogs that block the AppleScript bridge synchronously, causing infinite hangs.
3. **All subprocess calls MUST use `timeout=`** — Use `subprocess.run(..., timeout=10)`. Never call osascript without a timeout.
4. **System Events process name** — Use `first process whose name contains "Acrobat"` (NOT `process "AdobeAcrobat"` with `window 1`).
5. **Close documents when done** — Acrobat accumulates open docs. Always `adobe-auto.py close` after testing.

### Reliable APIs (< 0.2s each)
- **Quartz CGWindowListCopyWindowInfo** — Window IDs, names, bounds, onscreen status
- **`screencapture -l <wid>`** — Pixel-perfect window screenshots
- **AppleScript `do script`** — Run JS expressions (single or multi-statement)
- **`open -a`** — Open PDF files (non-blocking)

### Limited / Do NOT Use
- **System Events UI elements** — Only returns window chrome buttons, NOT content/toolbars/banners
- **`app.alert()`, `app.response()`** — BLOCKS FOREVER. Will hang automation.
- **`get name of every document`** — Unreliable, returns empty even with docs open

## Quick References

- **COS/Writer internals**: `src/pdfbox/writer/*`, `src/pdfbox/parser/*`
- **Signer entrypoint**: `src/signer/pdfbox-signer.ts`
- **Harness**: `src/testing/parity-runner.ts`, `src/cli/compare-fixture.ts`
- **Java patch**: `scripts/java/PatchedSignature.java`
- **Fixture manifest**: `test-pdfs/manifest.json`
- **Current state**: `docs/CURRENT_STATE.md`

## Local Repos

- Active working tree: `/Users/will/dev/pdfbox-ts`
- Upstream consumer: `/Users/will/dev/pdf-signer-web` (depends on this library)

## TODO Tracking (Pre-Commit)

| Tag | Meaning | Commit Allowed? |
|-----|---------|-----------------|
| `TODO:` | Untracked work | NO — must track first |
| `TRACKED-TASK:` | In docs | YES |

```bash
# Before every commit — find untracked TODOs (must be 0)
grep -rn "TODO:" --include="*.ts" src/
```
