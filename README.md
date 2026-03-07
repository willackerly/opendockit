# pdfbox-ts

TypeScript port of [Apache PDFBox](https://pdfbox.apache.org/) — create, modify, and **digitally sign** PDFs in JavaScript. No WASM. No native binaries. **~1 MB**.

## Out of Scope

The following are explicitly **not planned**:

- **npm publishing** — This is a proprietary library, not distributed via npm
- **Open sourcing** — No plans to release under an open-source license
- **Linearization** — Web-optimized PDF streaming (out of scope for current use cases)
- **Long-tail malformed PDFs** — 20 corpus files with genuinely broken xref tables, missing catalogs, or corrupt page trees from PDF.js/qpdf fuzz artifacts. These are not real-world documents.

## Why pdfbox-ts?

No JavaScript library can digitally sign PDFs. Until now, your only option was Apryse/PDFTron at **$9,000-$36,000/year** with a **60 MB** WASM bundle.

pdfbox-ts brings Apache PDFBox's battle-tested signing pipeline to TypeScript — with **byte-for-byte parity** verified against 9 real-world fixtures. Zero external PDF dependencies.

## Comparison

| | pdfbox-ts | Apryse/PDFTron | pdf-lib | jsPDF | PDF.js |
|---|---|---|---|---|---|
| **Price** | Proprietary | $9k-$36k/yr | Free (OSS) | Free (OSS) | Free (OSS) |
| **Bundle size** | ~1 MB | ~60 MB | ~1.1 MB | ~150 KB | ~1.5 MB |
| **Create PDFs** | Yes | Yes | Yes | Yes | No |
| **Modify PDFs** | Yes | Yes | Yes | No | No |
| **Digital signatures** | Yes | Yes | No | No | No |
| **Signature verification** | Yes | Yes | No | No | No |
| **LTV / timestamps** | Yes | Yes | No | No | No |
| **Encrypt / decrypt** | Yes (AES-128/256) | Yes | No | No | No |
| **Fill forms** | Yes | Yes | Yes | No | Display only |
| **Flatten forms** | Yes | Yes | No | No | No |
| **Annotations** | Yes (13 types) | Yes | No | No | Display only |
| **Text extraction** | Yes | Yes | No | No | Yes |
| **Image extraction** | Yes | Yes | No | No | No |
| **Custom fonts (TTF/OTF)** | Yes | Yes | Yes | Yes | N/A |
| **Font subsetting** | Yes | Yes | Yes | No | N/A |
| **Copy pages** | Yes | Yes | Yes | No | No |
| **Redaction** | Yes | Yes | No | No | No |
| **PDF/A archival** | Yes | Yes | No | No | No |
| **Render PDF** | Yes (PDF.js + Native) | Yes | No | No | Yes |
| **Browser + Node** | Yes | Yes | Yes | Yes | Yes |
| **Maintained** | Active | Active | Abandoned (2022) | Active | Active |

pdf-lib has been unmaintained since February 2022 (~2-3M weekly npm downloads still). The community fork [@cantoo/pdf-lib](https://github.com/nicolo-ribaudo/cantoo-pdf-lib) is the active successor, but neither supports digital signatures, verification, encryption, redaction, or text extraction.

## Features

**Signing & Verification**
- PKCS#7 detached CMS signatures (BER or DER encoding)
- Visual signatures with three appearance modes:
  - **Hybrid** (default): PNG signature image + branded info box with signer name, date, reason
  - **Image-only**: full-bleed PNG (backward compatible)
  - **Text-only**: branded info box without image
- Customizable brand text (default: "Dapple SafeSign") with logo watermark
- Multi-user counter-signing with automatic DocMDP management
- RFC 3161 TSA timestamps (DigiCert verified)
- LTV: DSS/VRI dictionaries, OCSP responder + CRL embedding
- Incremental saves (preserves original PDF bytes)
- Full-save mode for complex documents (Google Slides exports)
- Two-step API for remote signing / approval workflows
- Form flattening on sign (`flattenForms: true` prevents post-signature modification)
- Signature verification (RSA + ECDSA, certificate chain validation, timestamp token verification)

**Extraction**
- Text extraction with position, font, and size information
- Image extraction (JPEG pass-through, FlateDecode decompression, SMask alpha)
- Font decoding (ToUnicode CMap, `/Differences` + Adobe Glyph List, named encodings)
- Stream decompression (FlateDecode, LZW, ASCII85, ASCIIHex, RunLength, PNG/TIFF predictors)
- Text reconstruction with line and paragraph detection

**Document API**
- Create, load, modify, and save PDFs — no dependencies beyond `pako` and `node-forge`
- Draw text, rectangles, lines, circles, ellipses, images
- 14 standard PDF fonts + TrueType (.ttf) + CFF/OpenType (.otf) custom font embedding
- TrueType font subsetting (embed only used glyphs, reduces file size)
- JPEG and PNG image embedding (alpha channel / transparency)
- Create and fill form fields (text, checkbox, radio, dropdown, option list, button)
- Flatten forms (bake field appearances into page content)
- Copy pages between documents (`copyPages()`)
- 13 annotation types (highlight, underline, strikeout, sticky note, stamp, shapes, ink, links, redact)
- Trusted redaction (remove content under redaction annotations)
- Detect/delete XFA
- Page management (add, remove, insert, rotate, resize)
- PDF/A compliance (PDF/A-1b and PDF/A-2b archival output)
- Object stream compression

**Rendering & Element Model**
- PDF.js-based rendering (optional peer dependency via `pdfbox-ts/render`)
- NativeRenderer: direct COS-to-canvas pipeline, no save/re-parse round-trip
- Element extraction: text, shapes, paths, images with positions and fonts (`pdfbox-ts/elements`)
- Spatial queries: `queryElementsInRect`, `elementAtPoint`, `extractTextInRect`, bounding boxes
- Element-based redaction: surgical operator-index removal via `applyElementRedaction`
- Interactive canvas state machine (`InteractionStore`): hover, selection, marquee, draw-rect-to-redact
- Coordinate conversion utilities (viewport-to-page with Y-flip + scale)
- Browser and Node.js support (`canvas` package for Node)

**Quality**
- Byte-for-byte parity with Apache PDFBox (9 fixtures, SHA256 verified)
- 1,565 tests + 1,105-file robustness corpus from 9 sources (0 failures)
- Adobe Acrobat validated (`signatureValidate()` = 4, VALID)
- Zero Node.js built-ins — works in Vite, webpack, Parcel with no polyfills

## Quick Start

### Sign a PDF

```typescript
import { signPDFWithPDFBox } from 'pdfbox-ts';

const result = await signPDFWithPDFBox(pdfBytes, signer, {
  reason: 'Approved',
  location: 'San Francisco, CA',
  signatureAppearance: {
    imageData: signaturePngBytes,        // PNG from signature pad
    brandText: 'Dapple SafeSign',        // brand label (default)
    // appearanceMode: 'hybrid',         // default when imageData is set
    position: { page: 0, x: 50, y: 50, width: 280, height: 80 },
  },
});

// result.signedData — Uint8Array of the signed PDF
```

### Verify Signatures

```typescript
import { verifySignatures } from 'pdfbox-ts';

const results = verifySignatures(signedPdfBytes);
for (const sig of results) {
  console.log(`${sig.fieldName}: signed by ${sig.signedBy}`);
  console.log(`  Algorithm: ${sig.algorithm}`);     // 'RSA' | 'ECDSA'
  console.log(`  Integrity: ${sig.integrityValid}`); // content digest matches
  console.log(`  Signature: ${sig.signatureValid}`); // crypto signature verifies
  console.log(`  Chain: ${sig.chainStatus}`);        // 'valid' | 'self-signed' | 'partial'
  if (sig.timestampInfo) {
    console.log(`  TSA: ${sig.timestampInfo.signerCn} (verified: ${sig.timestampInfo.verified})`);
  }
}
```

### Create a PDF

```typescript
import { PDFDocument, StandardFonts, rgb } from 'pdfbox-ts';

const doc = await PDFDocument.create();
const page = doc.addPage([612, 792]);
const font = await doc.embedFont(StandardFonts.Helvetica);

page.drawText('Hello, world!', {
  x: 50,
  y: 700,
  size: 24,
  font,
  color: rgb(0, 0, 0),
});

const pdfBytes = await doc.save();
```

### Embed a Custom Font

```typescript
import { PDFDocument } from 'pdfbox-ts';
import { readFile } from 'fs/promises';

const doc = await PDFDocument.create();
const ttfBytes = await readFile('MyFont.ttf');
const font = await doc.embedFont(ttfBytes);

const page = doc.addPage();
page.drawText('Custom font text', { x: 50, y: 700, size: 18, font });

const pdfBytes = await doc.save();
```

### Load and Modify

```typescript
import { PDFDocument, rgb } from 'pdfbox-ts';

const doc = await PDFDocument.load(existingPdfBytes);
const pages = doc.getPages();
const font = await doc.embedFont('Helvetica');

pages[0].drawText('APPROVED', {
  x: 200,
  y: 400,
  size: 48,
  font,
  color: rgb(0, 0.5, 0),
});

const modifiedBytes = await doc.save();
```

### Visual Signature with PNG Image

```typescript
import { signPDFWithPDFBox } from 'pdfbox-ts';

const result = await signPDFWithPDFBox(pdfBytes, signer, {
  signatureAppearance: {
    imageData: pngBytes,
    position: { page: 0, x: 350, y: 50, width: 200, height: 80 },
  },
});
```

### Copy Pages Between Documents

```typescript
import { PDFDocument, copyPages } from 'pdfbox-ts';

const srcDoc = await PDFDocument.load(sourcePdfBytes);
const dstDoc = await PDFDocument.create();

const pages = copyPages(srcDoc, dstDoc, [0, 2]); // copy pages 1 and 3
for (const page of pages) {
  dstDoc.addPage(page);
}

const pdfBytes = await dstDoc.save();
```

### Sign and Lock Form Fields

```typescript
import { signPDFWithPDFBox } from 'pdfbox-ts';

const result = await signPDFWithPDFBox(pdfWithFormFields, signer, {
  flattenForms: true,  // Bake form values into page content before signing
  reason: 'Final approval — fields locked',
  signatureAppearance: {
    position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
  },
});
```

### Save as PDF/A (Archival)

```typescript
import { PDFDocument, StandardFonts } from 'pdfbox-ts';

const doc = await PDFDocument.create();
doc.setTitle('Archival Report');
doc.setAuthor('Legal Department');
const page = doc.addPage();
const font = await doc.embedFont(StandardFonts.Helvetica);
page.drawText('PDF/A-1b compliant document', { x: 50, y: 700, size: 14, font });

const pdfBytes = await doc.save({ pdfaConformance: 'PDF/A-1b' });
```

### Create Form Fields

```typescript
import { PDFDocument, StandardFonts, rgb } from 'pdfbox-ts';

const doc = await PDFDocument.create();
const page = doc.addPage();
const form = doc.getForm();

const nameField = form.createTextField('name');
nameField.addToPage(page, { x: 50, y: 700, width: 300, height: 24 });

const agreeField = form.createCheckBox('agree');
agreeField.addToPage(page, { x: 50, y: 660, width: 18, height: 18 });

const countryField = form.createDropdown('country');
countryField.setOptions(['USA', 'Canada', 'UK']);
countryField.addToPage(page, { x: 50, y: 620, width: 200, height: 24 });

const pdfBytes = await doc.save();
```

### Add Annotations

```typescript
import {
  PDFDocument, PDAnnotationHighlight, PDAnnotationRubberStamp,
  rgb, StampName, ANNOTATION_FLAG_PRINT,
} from 'pdfbox-ts';

const doc = await PDFDocument.load(pdfBytes);
const page = doc.getPage(0);

page.addAnnotation(new PDAnnotationHighlight({
  rect: [50, 480, 300, 500],
  quadPoints: [50, 500, 300, 500, 50, 480, 300, 480],
  color: rgb(1, 1, 0),
  flags: ANNOTATION_FLAG_PRINT,
}));

page.addAnnotation(new PDAnnotationRubberStamp({
  rect: [350, 700, 550, 750],
  stampName: StampName.APPROVED,
  flags: ANNOTATION_FLAG_PRINT,
}));

const annotatedBytes = await doc.save();
```

### Add LTV (Long-Term Validation)

```typescript
import { signPDFWithPDFBox, addLtvToPdf } from 'pdfbox-ts';

// Sign with a timestamp
const result = await signPDFWithPDFBox(pdfBytes, signer, {
  timestampURL: 'http://timestamp.digicert.com',
});

// Embed OCSP/CRL responses for long-term validation
const ltvResult = await addLtvToPdf(result.signedData, {
  fetchRevocationData: true, // auto-fetch OCSP/CRL from cert AIA/CDP URLs
});
// ltvResult.pdfBytes — Uint8Array with DSS/VRI embedded
```

### Encrypt / Decrypt

```typescript
import { PDFDocument } from 'pdfbox-ts';

const doc = await PDFDocument.load(pdfBytes);
const encrypted = await doc.save({
  encrypt: {
    ownerPassword: 'owner123',
    userPassword: 'user456',
    keyLength: 256,
    permissions: { print: true, copy: false },
  },
});

// Decrypt
const decrypted = await PDFDocument.load(encrypted, { password: 'user456' });
const plainBytes = await decrypted.save();
```

### Page Management

```typescript
import { PDFDocument, StandardFonts, degrees } from 'pdfbox-ts';

const doc = await PDFDocument.load(pdfBytes);

// Add a page
const page = doc.addPage([612, 792]);
const font = await doc.embedFont(StandardFonts.Helvetica);
page.drawText('New page', { x: 50, y: 700, size: 18, font });

// Rotate page 1
doc.getPage(0).setRotation(degrees(90));

// Remove last page
doc.removePage(doc.getPageCount() - 1);

const modified = await doc.save();
```

### Extract Text

```typescript
import { extractText, extractTextContent } from 'pdfbox-ts/extraction';

// Full text as a single string
const text = await extractTextContent(pdfBytes);
console.log(text);

// Structured: per-page items with position, font, and size
const pages = await extractText(pdfBytes);
for (const page of pages) {
  for (const item of page.items) {
    console.log(`"${item.text}" at (${item.x}, ${item.y}) ${item.fontName} ${item.fontSize}pt`);
  }
}
```

### Extract Images

```typescript
import { extractImages } from 'pdfbox-ts/extraction';

const images = await extractImages(pdfBytes);
for (const img of images) {
  console.log(`${img.name}: ${img.width}x${img.height} ${img.colorSpace} ${img.filter}`);
  // img.data is the raw image bytes (JPEG if DCTDecode, raw pixels otherwise)
}
```

## API

### Signing

| Function | Description |
|----------|-------------|
| `signPDFWithPDFBox(pdf, signer, options?)` | One-call signing with optional visual appearance |
| `preparePdfWithAppearance(pdf, signer, options?)` | Step 1: embed appearance (for two-step workflows) |
| `signPreparedPdfWithPDFBox(prepared, signer, options?)` | Step 2: apply cryptographic signature |
| `verifySignatures(pdf)` | Verify all signatures — integrity, RSA/ECDSA, chain, timestamps |
| `addLtvToPdf(pdf, options?)` | Add DSS/VRI for long-term validation |
| `fetchTimestampToken(digest, tsaUrl)` | RFC 3161 timestamp request |

### Document

| Method | Description |
|--------|-------------|
| `PDFDocument.create()` | Create a new PDF |
| `PDFDocument.load(bytes)` | Load an existing PDF |
| `doc.save()` | Serialize to Uint8Array |
| `doc.addPage([w, h])` | Add a page |
| `doc.embedFont(font)` | Embed a standard font name, TTF, or OTF bytes |
| `doc.save({ pdfaConformance })` | Save with PDF/A-1b, 2b, or 3b compliance |
| `doc.embedJpg(bytes)` / `doc.embedPng(bytes)` | Embed images |
| `page.drawText(text, options)` | Draw text |
| `page.drawImage(image, options)` | Draw an image |
| `page.drawRectangle(options)` | Draw a rectangle |
| `page.drawLine(options)` | Draw a line |
| `page.drawCircle(options)` / `page.drawEllipse(options)` | Draw circles/ellipses |
| `doc.getForm()` | Access form fields (create, fill, flatten) |
| `copyPages(src, dst, indices)` | Copy pages between documents |
| `page.addAnnotation(annotation)` | Add annotations (highlight, stamp, ink, redact, etc.) |
| `applyRedactions(stream, rects)` | Remove content under redaction rectangles |

### Extraction

| Function | Description |
|----------|-------------|
| `extractText(pdf, options?)` | Extract text with position, font, and size per page |
| `extractTextContent(pdf)` | Extract full text as a single string |
| `extractImages(pdf, options?)` | Extract all images with metadata |

See [SDK Guide](docs/SDK_GUIDE.md) for complete API reference.

## Browser Support

pdfbox-ts uses `pako` (zlib) and `node-forge` (crypto) — both pure JavaScript with zero Node.js dependencies. Works out of the box with any modern bundler:

```typescript
// Vite, webpack, Parcel — no polyfills needed
import { PDFDocument, signPDFWithPDFBox } from 'pdfbox-ts';
```

## Parity Fixtures

All 9 fixtures produce byte-for-byte identical output between TypeScript and Java PDFBox:

| Fixture | Source | Pages |
|---------|--------|-------|
| `wire-instructions` | Hand-authored | 3 |
| `test-document` | pdf-lib generated | 1 |
| `simple-test` | Minimal | 1 |
| `chrome-print-complex-images` | Chrome Print to PDF | 1 |
| `google-docs-multipage-images` | Google Docs export | 2 |
| `google-docs-presentation-large` | Google Slides export | 35 |
| `wire-instructions-signed` | Pre-signed PDF | 3 |
| `object-stream` | ObjStm/XRef stream | 1 |
| `broken-signature` | Edge case | 1 |

## Architecture

pdfbox-ts is a ground-up TypeScript port of Apache PDFBox's COS object model, incremental writer, and signing pipeline. It is **not** a wrapper around a WASM binary or a thin layer over pdf-lib.

```
src/
  index.ts                    # Public API exports (signing + document API)
  document/                   # Document API (create, load, draw, fonts, images)
    PDFDocument.ts            # Create/load/save PDFs
    PDFPage.ts                # Page drawing operations
    PDFFont.ts                # Standard + TrueType + CFF/OpenType font embedding
    PDFImage.ts               # JPEG + PNG image embedding
    PDFForm.ts                # Form fields (create, fill, flatten)
    CopyPages.ts              # Cross-document page copying
    annotations/              # 13 annotation types (incl. redaction)
    redaction/                # Content stream redactor
    pdfa/                     # PDF/A conformance (XMP, ICC, OutputIntents)
    content-stream/           # PDF content stream operator builder
    fonts/                    # Font metrics, TTF parser, CFF parser, subsetter
  pdfbox/
    cos/                      # COS object model (COSBase, COSDictionary, etc.)
    parser/                   # PDF parsing (xref, trailer, objects, document loader)
    writer/                   # PDF writing (COSWriter, XRefBuilder, FullSaveWriter)
  render/                     # Rendering (PDF.js wrapper + NativeRenderer)
  signer/                     # Signing API (pdfbox-signer.ts, tsa.ts, ltv.ts, verify.ts)
docs/
  SDK_GUIDE.md                # Full API reference
  ROADMAP.md                  # Development roadmap
```

## Development

```bash
pnpm install
pnpm build                                    # TypeScript -> dist/
pnpm test                                     # 1,380 tests (~2s)
pnpm compare -- --all                         # 9-fixture byte parity (~10s)
pnpm compare -- --all --skip-java             # TypeScript-only (no JRE)
pnpm test:corpus                              # 1,105 real-world PDFs (~10min)
```

## Demo / Test Harness

An interactive browser demo exercises all 19 feature workflows with a live PDF viewer, renderer toggle (PDF.js vs NativeRenderer), and per-page timing metrics.

```bash
cd test-harness
pnpm install && pnpm setup
pnpm dev                          # http://localhost:11173
npx playwright test               # 80+ E2E tests
npx playwright test --headed      # Watch tests run in browser
```

## License

Copyright (c) 2024-2026 Will Ackerly. All rights reserved.

This software is proprietary and confidential. See [LICENSE](LICENSE) for details.
