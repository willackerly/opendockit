# Agent Playbook — pdfbox-ts

Read this before each session. It keeps parity work predictable and reproducible.

## Cold Start

1. Read `docs/CURRENT_STATE.md` — what was just worked on, blockers, immediate next step
2. Read `docs/ROADMAP.md` — parity gaps, execution order, what's done vs remaining
3. If porting: `docs/PORTING_STATUS.md` — Java component checklist, TS symbol mapping

## Mission

Deliver byte-for-byte parity with Apache PDFBox (incremental and full-save). Keep the comparison harness deterministic. Any change should either improve parity or strengthen tests/docs.

## Autonomy

- Default to full autonomy. Unblock yourself with code/tests/docs.
- Only pause for: force push to main, modifying `fixtures/keys/` keypair, genuinely unclear high-level requirements.
- Escalate with data: share commands, logs, and doc references when asking for help.

## Bootstrap

```bash
pnpm install
pnpm test                                             # All 148 unit tests
pnpm compare -- --all --skip-java                      # All 9 parity fixtures
python3 scripts/adobe-auto.py diagnose                 # Adobe automation (17 tests)
```

## Working Loop

1. **Before coding**: Read `docs/CURRENT_STATE.md` and `docs/ROADMAP.md`
2. **While coding**: Keep changes scoped. If you touch signer internals, run parity after.
3. **After coding**: Run `pnpm test` and `pnpm compare -- --all --skip-java`
4. **Before ending**: Update `docs/CURRENT_STATE.md` with what you did and exact next step

## Testing & Parity

```bash
pnpm test                                    # Unit tests (must be 148/148)
pnpm compare -- --fixture wire-instructions  # Quick sanity
pnpm compare -- --all                        # Full sweep (all 9 fixtures)
pnpm compare -- --all --skip-java            # TS-only (no JRE needed)
pnpm parity:report                           # Failure histogram
```

### Determinism
- Use keypair in `fixtures/keys/` for all signing
- Lock timestamps: `PDFBOX_TS_SIGN_TIME=2024-01-01T00:00:00Z`
- Never commit signed PDFs; `tmp/` is gitignored

## Adobe Acrobat Automation

Use `scripts/adobe-auto.py` for all Acrobat interaction. NEVER automate Acrobat manually.

```bash
python3 scripts/adobe-auto.py validate <pdf>   # Open, validate sigs, screenshot
python3 scripts/adobe-auto.py diagnose         # Test all 17 APIs
python3 scripts/adobe-auto.py js "this.numPages"
python3 scripts/adobe-auto.py close            # ALWAYS close when done
```

### CRITICAL RULES — Violating these causes hangs

1. **JS bridge: Use SINGLE QUOTES** — `this.getField('Sig1')` NOT `"Sig1"`. Double quotes break AppleScript escaping.
2. **NEVER use `app.alert()` or any dialog-showing JS** — Creates modal dialog that blocks AppleScript bridge forever.
3. **All subprocess calls MUST have `timeout=`** — `subprocess.run(..., timeout=10)`. Never call osascript without a timeout.
4. **System Events process name** — Use `first process whose name contains "Acrobat"` (NOT `process "AdobeAcrobat"` with `window 1`).
5. **Close documents when done** — Acrobat accumulates open docs. Always close after testing.

### What Works Reliably (< 0.2s each)
- Quartz `CGWindowListCopyWindowInfo` — window discovery
- `screencapture -l <wid>` — pixel-perfect screenshots
- AppleScript `do script` — JS execution (with single quotes, no dialogs)
- `open -a` — opening PDF files

### What Does NOT Work
- `app.alert()`, `app.response()` — **BLOCKS FOREVER**
- System Events UI elements — only returns window chrome, not content
- `get name of every document` — unreliable, returns empty

## Handoff Checklist

Before ending a session:
- [ ] Update `docs/CURRENT_STATE.md` with accomplishments and next step
- [ ] Update `docs/ROADMAP.md` if items were completed
- [ ] Run `pnpm test` — confirm all tests pass
- [ ] Run `pnpm compare -- --all --skip-java` — confirm parity
- [ ] Close any open Acrobat documents (`adobe-auto.py close`)
- [ ] No untracked `TODO:` comments (`grep -rn "TODO:" --include="*.ts" src/`)

## Quick References

- **Signer**: `src/signer/pdfbox-signer.ts`
- **COS/Writer**: `src/pdfbox/writer/*`, `src/pdfbox/parser/*`
- **Harness**: `src/testing/parity-runner.ts`, `src/cli/compare-fixture.ts`
- **Java signer**: `scripts/java/PatchedSignature.java`
- **Java visual sig**: `scripts/java/VisualSignature.java`
- **Adobe automation**: `scripts/adobe-auto.py`
- **Fixture manifest**: `test-pdfs/manifest.json`
- **State docs**: `docs/CURRENT_STATE.md`, `docs/ROADMAP.md`, `docs/PORTING_STATUS.md`
