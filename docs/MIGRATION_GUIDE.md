# Migration Guide: pdfbox-ts to @opendockit/pdf-signer

Migrating from the standalone `pdfbox-ts` package to `@opendockit/pdf-signer` within the OpenDocKit monorepo.

## Overview

`@opendockit/pdf-signer` is the successor to the standalone `pdfbox-ts` package. It contains the same signing, document, and verification APIs with full backward compatibility, plus significant new capabilities:

- **Native PDF rendering** — render pages to PNG without PDF.js
- **Element extraction** — extract positioned text/shape/image elements from pages
- **Pure-TS font patcher** — embedded TrueType/CFF font rendering with CMap rebuild
- **Canvas tree recorder** — structural trace capture for visual diffing
- **Content stream evaluator** — 85+ PDF operators, ExtGState, patterns, shading
- **Sub-path exports** — tree-shakeable imports for render, elements, fonts, etc.

The signing API is **identical**. No behavioral changes. Byte-for-byte parity is preserved.

## Installation

### Remove pdfbox-ts

```bash
pnpm remove pdfbox-ts
# or
npm uninstall pdfbox-ts
```

### Install @opendockit/pdf-signer

**From the monorepo (workspace dependency):**

```bash
pnpm add @opendockit/pdf-signer --workspace
```

**From a tarball (external consumers):**

```bash
pnpm add ./opendockit-pdf-signer-1.0.0-beta.9.tgz
```

### package.json diff

```diff
 {
   "dependencies": {
-    "pdfbox-ts": "^1.0.0-beta.11"
+    "@opendockit/pdf-signer": "^1.0.0-beta.9"
   }
 }
```

**Optional peer dependencies** (unchanged):

```json
{
  "pdfjs-dist": ">=4.0.0",
  "canvas": ">=2.0.0"
}
```

- `pdfjs-dist` — only needed for `PDFRenderer` (PDF.js-based rendering path)
- `canvas` — only needed for Node.js rendering (both PDF.js and native paths)

## Import Changes

### Signing API

```typescript
// BEFORE
import {
  signPDFWithPDFBox,
  preparePdfWithAppearance,
  signPreparedPdfWithPDFBox,
} from 'pdfbox-ts';

// AFTER
import {
  signPDFWithPDFBox,
  preparePdfWithAppearance,
  signPreparedPdfWithPDFBox,
} from '@opendockit/pdf-signer';
```

### Document API

```typescript
// BEFORE
import {
  PDFDocument,
  PDFPage,
  PDFFont,
  PDFImage,
  rgb,
  cmyk,
  grayscale,
  degrees,
  PageSizes,
  StandardFonts,
  copyPages,
} from 'pdfbox-ts';

// AFTER
import {
  PDFDocument,
  PDFPage,
  PDFFont,
  PDFImage,
  rgb,
  cmyk,
  grayscale,
  degrees,
  PageSizes,
  StandardFonts,
  copyPages,
} from '@opendockit/pdf-signer';
```

### Verification

```typescript
// BEFORE
import { verifySignatures } from 'pdfbox-ts';

// AFTER
import { verifySignatures } from '@opendockit/pdf-signer';
```

### Timestamps & LTV

```typescript
// BEFORE
import { fetchTimestampToken, TSAError, addLtvToPdf } from 'pdfbox-ts';

// AFTER
import { fetchTimestampToken, TSAError, addLtvToPdf } from '@opendockit/pdf-signer';
```

### Encryption

```typescript
// BEFORE
import { PDFEncryptor, PDFDecryptor, computePermissions } from 'pdfbox-ts';

// AFTER
import { PDFEncryptor, PDFDecryptor, computePermissions } from '@opendockit/pdf-signer';
```

### Types

```typescript
// BEFORE
import type {
  SignatureOptions,
  SignatureAppearance,
  SignedPDFResult,
  PreparedPdf,
  BrowserKeypairSigner,
  SignatureVerificationResult,
} from 'pdfbox-ts';

// AFTER
import type {
  SignatureOptions,
  SignatureAppearance,
  SignedPDFResult,
  PreparedPdf,
  BrowserKeypairSigner,
  SignatureVerificationResult,
} from '@opendockit/pdf-signer';
```

### Errors

```typescript
// BEFORE
import { UnsupportedPdfFeatureError } from 'pdfbox-ts/errors/UnsupportedPdfFeatureError';

// AFTER
import { UnsupportedPdfFeatureError } from '@opendockit/pdf-signer/errors/UnsupportedPdfFeatureError';
```

### Quick find-and-replace

For most codebases, a global string replacement is sufficient:

```bash
# Replace all imports
find src/ -name '*.ts' -o -name '*.tsx' | xargs sed -i '' "s/from 'pdfbox-ts'/from '@opendockit\/pdf-signer'/g"
find src/ -name '*.ts' -o -name '*.tsx' | xargs sed -i '' 's/from "pdfbox-ts"/from "@opendockit\/pdf-signer"/g'
```

## API Compatibility

**What stayed the same:**

- Every function, class, type, and constant from the root export
- All signing behavior, byte-for-byte parity with Java PDFBox
- All environment variables (`PDFBOX_TS_SIGN_TIME`, `PDFBOX_TS_CMS_SIGN_TIME`, etc.)
- `BrowserKeypairSigner` interface contract
- `PDFDocument` API (load, create, save, addPage, embedFont, embedImage, etc.)

**What's new — sub-path exports:**

`@opendockit/pdf-signer` exposes domain-specific sub-path imports for tree shaking:

| Sub-path | What's in it |
|----------|-------------|
| `@opendockit/pdf-signer` | Everything (signing, document, verification, types) |
| `@opendockit/pdf-signer/render` | `PDFRenderer`, `NativeRenderer`, `renderPage`, `renderPageNative`, `getPageElements` |
| `@opendockit/pdf-signer/elements` | `PageModel`, `PageElement`, element types |
| `@opendockit/pdf-signer/extraction` | Content extraction utilities |
| `@opendockit/pdf-signer/verify` | `verifySignatures` (standalone) |
| `@opendockit/pdf-signer/ltv` | `addLtvToPdf` (standalone) |
| `@opendockit/pdf-signer/redaction` | `applyRedactions`, content stream tokenizer |
| `@opendockit/pdf-signer/annotations` | All annotation classes |
| `@opendockit/pdf-signer/pdfa` | PDF/A conformance utilities |
| `@opendockit/pdf-signer/content-stream` | `ContentStreamBuilder` |
| `@opendockit/pdf-signer/fonts` | Font parsing, subsetting, metrics |

Sub-path imports are optional. The root import re-exports everything.

## New Capabilities

### Native PDF Rendering

Render PDF pages to PNG without PDF.js. Operates directly on COS objects — no save-then-reparse round-trip.

```typescript
import { NativeRenderer, renderPageNative } from '@opendockit/pdf-signer/render';
import { PDFDocument } from '@opendockit/pdf-signer';

// Quick one-liner
const doc = await PDFDocument.load(pdfBytes);
const result = await renderPageNative(doc, 0, { scale: 2.0 });
// result.png — Uint8Array (PNG)
// result.width, result.height — pixel dimensions

// Or use the class for multiple pages
const renderer = new NativeRenderer(doc);
for (let i = 0; i < doc.getPageCount(); i++) {
  const { png } = await renderer.renderPage(i, { scale: 1.5 });
  fs.writeFileSync(`page-${i}.png`, png);
}
```

### PDF.js-Based Rendering (existing)

Still available when you need PDF.js fidelity:

```typescript
import { PDFRenderer, renderPage } from '@opendockit/pdf-signer/render';

// From raw bytes (wraps PDF.js)
const result = await renderPage(pdfBytes, 0, { scale: 2.0 });

// From a PDFDocument (saves to bytes internally, then uses PDF.js)
const renderer = await PDFRenderer.fromDocument(doc);
const result = await renderer.renderPage(0, { scale: 1.5 });
```

### Element Extraction

Extract positioned text, shapes, and images as a flat element array:

```typescript
import { getPageElements } from '@opendockit/pdf-signer/render';
import { PDFDocument } from '@opendockit/pdf-signer';
import type { PageElement } from '@opendockit/pdf-signer/elements';

const doc = await PDFDocument.load(pdfBytes);
const elements: PageElement[] = await getPageElements(doc, 0);

for (const el of elements) {
  console.log(`${el.type} at (${el.x}, ${el.y}) ${el.width}x${el.height}`);
  if (el.type === 'text') {
    console.log(`  text: ${el.paragraphs.map(p => p.runs.map(r => r.text).join('')).join('\n')}`);
  }
}
```

### Canvas Tree Recorder

Capture a structural trace of rendering operations for diffing and debugging:

```typescript
import { NativeRenderer } from '@opendockit/pdf-signer/render';
import type { RenderTrace } from '@opendockit/pdf-signer/render';

const renderer = new NativeRenderer(doc);
const { trace, png } = await renderer.renderPageWithTrace(0, { scale: 1.5 });

// trace.events — TraceEvent[] (text, shape, image with coordinates + CTM)
console.log(`${trace.events.length} render operations captured`);
```

## Testing

### Run the test suite

```bash
cd packages/pdf-signer

# Tier 1: Unit + integration (~2s, 1,755 tests)
pnpm test

# Tier 2: 9-fixture byte parity (~10s)
pnpm compare -- --all

# Tier 3: 1,000+ real-world PDF corpus (~10min)
pnpm test:corpus

# Tier 4: Visual / Adobe Acrobat / LTV (situational)
pnpm test:visual
pnpm test:acrobat
pnpm test:ltv
```

### Test tiers

| Tier | Command | Tests | Time | When |
|------|---------|-------|------|------|
| 1 | `pnpm test` | ~1,755 unit/integration | ~2s | Every commit |
| 2 | `pnpm compare -- --all` | 9 byte-parity fixtures | ~10s | After signer/writer changes |
| 3 | `pnpm test:corpus` | 1,000+ real PDFs | ~10min | Before release |
| 4 | `pnpm test:visual` | Pixel-diff snapshots | ~5s | After appearance changes |

## Troubleshooting

### "Cannot find module 'pdfbox-ts'"

You have leftover imports. Run the find-and-replace from the [Import Changes](#quick-find-and-replace) section.

### Sub-path import not resolving

Make sure your `tsconfig.json` has `moduleResolution` set to `"bundler"` or `"node16"` (not `"node"`). The `"node"` strategy does not support `exports` map in package.json.

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler"
  }
}
```

### Canvas not found (Node.js rendering)

Native and PDF.js rendering both need the `canvas` npm package in Node.js:

```bash
pnpm add canvas
```

This is an optional peer dependency — it is not required for signing, document creation, or verification.

### PDF.js not found

Only needed for `PDFRenderer` / `renderPage`. Not needed for `NativeRenderer`:

```bash
pnpm add pdfjs-dist
```

### Types not matching after upgrade

The type surface is identical, but if you were importing from internal paths (e.g., `pdfbox-ts/src/pdfbox/cos/...`), those paths have changed. Use the public sub-path exports instead:

```typescript
// DON'T — internal paths are not stable
import { COSDictionary } from 'pdfbox-ts/src/pdfbox/cos/COSDictionary';

// DO — use public exports
import { PDFDocument } from '@opendockit/pdf-signer';
```

### Environment variables still work

All `PDFBOX_TS_*` environment variables are unchanged:

| Variable | Purpose |
|----------|---------|
| `PDFBOX_TS_SIGN_TIME` | Deterministic signing timestamp |
| `PDFBOX_TS_CMS_SIGN_TIME` | Deterministic CMS timestamp |
| `PDFBOX_TS_FORCE_FULL_SAVE` | Force full document rewrite |
| `PDFBOX_TS_CMS_DER` | DER encoding for CMS signatures |
| `PDFBOX_TS_TRACE` | Debug tracing |
