# pdfbox-ts Test Harness

**Canonical test page for pdfbox-ts.** This is the primary interactive UI for exercising all library features, and the target for Playwright E2E tests.

## Quick Start

```bash
cd test-harness
pnpm install && pnpm setup    # first time only
pnpm dev                      # http://localhost:11173
```

## Purpose

This harness is the **single source of truth** for verifying pdfbox-ts features in a browser environment. Every feature exposed by the library should be exercisable here. Playwright tests run against this page.

**Use this harness for:**
- Smoke testing new features before release
- Running Playwright E2E test suites
- Manual QA of signing, rendering, forms, redaction, encryption
- Visual verification of signature appearances in the PDF viewer
- Regression testing after signer/writer changes

## Features Exercised

### Document Management
- Load PDF (file picker or demo PDF)
- Page navigation, add/remove/insert pages
- Copy pages between documents
- PDF/A export (1b, 2b)

### Signatures
- **Sign Document** — Three appearance modes:
  - **Hybrid** (default): PNG squiggle left + branded info box right ("Dapple SafeSign")
  - **Image Only**: Full-bleed generated signature image
  - **Text Only**: Branded info box with signer name, date, reason
- **Brand Text** — Configurable brand label (default: "Dapple SafeSign")
- **Counter-signing** — Sign as User 1, then counter-sign as User 2
- **Two-Step Signing** — Prepare-then-sign workflow (remote signing simulation)
- **Verify Signatures** — RSA/ECDSA integrity, certificate chain, timestamps

### Signing Options
- DER encoding (vs BER default)
- Force full-save mode
- Flatten forms on sign

### Forms
- Auto-detect and fill existing form fields
- Create custom fields (text, checkbox, dropdown, radio)
- Flatten forms (bake into content)

### Content
- Annotations (highlight, underline, strikeout, text note, stamp, etc.)
- Redaction (draw redaction rectangles, preview affected content, apply)
- Drawing operations (text, rectangles, lines, images)

### Extract
- Text extraction (with position info)
- Image extraction (JPEG passthrough, PNG conversion)

### Security
- AES-128 / AES-256 encryption
- Password-based decryption
- Permission flags (print, copy, modify)

### Rendering
- PDF.js renderer (default)
- Native renderer toggle (COS-based, no re-parse)
- Page-by-page rendering with zoom

## Playwright E2E Tests

```bash
cd test-harness
npx playwright test              # run all E2E tests
npx playwright test --headed     # watch tests run in browser
npx playwright test -g "sign"    # run tests matching pattern
```

Tests are in `test-harness/tests/`. They run against `http://localhost:11173`.

## Architecture

```
test-harness/
  index.html          # Main HTML page (split-pane: viewer + sidebar)
  src/
    app.ts            # All feature handlers (sign, verify, forms, etc.)
    pdf-renderer.ts   # PDF.js + NativeRenderer rendering
    redaction-overlay.ts  # Canvas-based redaction drawing UI
  public/
    demo.pdf          # Default demo PDF
    no-fields.pdf     # PDF without form fields
    keys/             # User 1 + User 2 signing certificates
  vite.config.ts      # Vite dev server (port 11173)
  tests/              # Playwright E2E test files
  dist/               # Built static site
```

## Port

**Always port 11173.** This is hardcoded in `vite.config.ts` and referenced by Playwright configs. Do not change it.
