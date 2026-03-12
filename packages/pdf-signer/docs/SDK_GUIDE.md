# pdfbox-ts SDK Guide

Integration guide for the `pdf-signer-web` team and other consumers.

## Overview

`pdfbox-ts` is a TypeScript port of Apache PDFBox's signing primitives. It produces **byte-for-byte identical** signed PDFs to Java PDFBox, verified against 9 real-world fixtures with SHA256 parity.

**What it handles:**
- Single and multi-user (counter-signing) PDF signatures
- Visual signatures with embedded PNG images
- Incremental updates (preserves original PDF bytes)
- Full-save mode for complex documents (Google Slides exports)
- DocMDP / permissions management
- PKCS#7 detached CMS signatures
- RFC 3161 TSA timestamps for long-term validation (LTV)

**Browser compatible:** Works in Node.js and browsers (Vite, webpack, Parcel) — no Node.js polyfills needed.

## Installation

```bash
pnpm add pdfbox-ts
# or
npm install pdfbox-ts
```

## API Reference

### `signPDFWithPDFBox(pdfBytes, signer, options?)`

**One-call signing.** Takes raw PDF bytes, adds a visual signature appearance, and returns the signed PDF.

```typescript
import { signPDFWithPDFBox } from 'pdfbox-ts';

const result = await signPDFWithPDFBox(pdfBytes, signer, {
  reason: 'Document approval',
  location: 'San Francisco, CA',
  signatureAppearance: {
    text: 'Approved by Legal',
    position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
  },
});

// result.signedData — Uint8Array of the signed PDF
// result.signatureInfo — metadata (byteRange, signedAt, signedBy, etc.)
```

### `preparePdfWithAppearance(pdfBytes, signer, options?)`

**Step 1 of two-step signing.** Embeds the visual appearance and returns a `PreparedPdf` object. Use this when you need to inspect or transmit the prepared PDF before signing.

```typescript
import { preparePdfWithAppearance, signPreparedPdfWithPDFBox } from 'pdfbox-ts';

const prepared = await preparePdfWithAppearance(pdfBytes, signer, options);
// prepared.pdfBytes — PDF with appearance embedded (not yet signed)
// prepared.signerName — extracted from certificate CN
// prepared.hasExistingSignature — true if PDF was already signed
// prepared.hasExistingDocMdp — true if DocMDP permissions already exist
```

### `signPreparedPdfWithPDFBox(prepared, signer, options?)`

**Step 2 of two-step signing.** Takes the output of `preparePdfWithAppearance` and produces the signed PDF.

```typescript
const result = await signPreparedPdfWithPDFBox(prepared, signer, options);
// result.signedData — final signed PDF bytes
```

### `verifySignatures(pdfBytes)`

**Verify all digital signatures** in a PDF. Returns one result per signed signature field. Returns an empty array for unsigned PDFs or if parsing fails.

```typescript
import { verifySignatures } from 'pdfbox-ts';

const results = verifySignatures(signedPdfBytes);
for (const sig of results) {
  console.log(`${sig.fieldName}: signed by ${sig.signedBy}`);
  console.log(`  Algorithm: ${sig.algorithm}`);          // 'RSA' | 'ECDSA' | 'unknown'
  console.log(`  Integrity: ${sig.integrityValid}`);
  console.log(`  Signature: ${sig.signatureValid}`);
  console.log(`  Chain: ${sig.chainStatus}`);            // 'valid' | 'partial' | 'self-signed' | 'unknown'
  console.log(`  Signed at: ${sig.signedAt}`);
  console.log(`  Reason: ${sig.reason}`);
  if (sig.timestampInfo) {
    console.log(`  TSA: ${sig.timestampInfo.signerCn}`);
    console.log(`  TSA verified: ${sig.timestampInfo.verified}`);
    console.log(`  TSA time: ${sig.timestampInfo.signedAt}`);
  }
}
```

**Returns:** `SignatureVerificationResult[]`

```typescript
type ChainStatus = 'valid' | 'partial' | 'self-signed' | 'unknown';

interface TimestampInfo {
  signerCn: string;        // TSA certificate CN (e.g. "DigiCert Timestamp 2023")
  signedAt: Date;          // genTime from TSTInfo
  hashAlgorithm: string;   // e.g. "SHA-256"
  verified: boolean;        // TSA signature + messageImprint both valid
  serialNumber: string;     // TSTInfo serial (hex)
}

interface SignatureVerificationResult {
  fieldName: string;            // AcroForm field name (e.g. "Signature1")
  signedBy: string;             // Certificate subject CN
  signedAt: Date | null;        // From CMS SigningTime attribute
  reason: string | null;        // From /Reason
  location: string | null;      // From /Location
  byteRange: [number, number, number, number];
  integrityValid: boolean;      // SHA-256 content digest matches CMS MessageDigest
  signatureValid: boolean;      // RSA or ECDSA signature over auth attrs verifies
  algorithm: 'RSA' | 'ECDSA' | 'unknown';  // Detected signature algorithm
  chainStatus: ChainStatus;     // Certificate chain validation result
  hasTimestamp: boolean;         // TSA timestamp token present in unsigned attrs
  timestampInfo: TimestampInfo | null;  // Parsed + verified timestamp (null if none)
  certificateDer: Uint8Array;   // Signer cert (DER) for downstream trust validation
  error?: string;               // Human-readable error if validation failed
}
```

**Verification checks:**
- **integrityValid**: SHA-256 of ByteRange content matches CMS MessageDigest attribute
- **signatureValid**: RSA or ECDSA signature over authenticated attributes verifies (supports P-256, P-384, P-521 curves)
- **chainStatus**: Walks the certificate chain from signer to root. `'valid'` = full chain verified, `'self-signed'` = single self-signed cert, `'partial'` = chain incomplete, `'unknown'` = couldn't determine
- **timestampInfo**: If a TSA timestamp is present in unsigned attributes, parses the RFC 3161 TSTInfo, verifies the TSA's signature over the token, and checks that the messageImprint hash matches the signature

**Does not** check certificate revocation status (OCSP/CRL). Use `certificateDer` for downstream trust decisions.

## Types

### `SignatureOptions`

```typescript
interface SignatureOptions {
  reason?: string;              // Why the document was signed
  location?: string;            // Where the signing took place
  contactInfo?: string;         // Signer contact info
  signatureAppearance?: SignatureAppearance;
  timestampURL?: string;        // RFC 3161 TSA URL (enables LTV timestamps)
  forceFullSave?: boolean;      // Force full document rewrite (not recommended — may lose page content on complex PDFs)
  flattenForms?: boolean;       // Flatten all form fields before signing (default: false)
  enableLTV?: boolean;          // Embed certs in DSS for long-term validation
}
```

### `SignatureAppearance`

```typescript
type AppearanceMode = 'hybrid' | 'image-only' | 'text-only';

interface SignatureAppearance {
  imageData?: Uint8Array;       // PNG image bytes (signature squiggle)
  text?: string;                // Text label (legacy, used in text-only mode)
  fieldName?: string;           // AcroForm field name (auto-generated if omitted)
  brandText?: string;           // Brand label in info box (default: "Dapple SafeSign")
  appearanceMode?: AppearanceMode; // Layout mode (see below)
  position: {
    page: number;               // 0-indexed page number
    x: number;                  // X coordinate (points from left)
    y: number;                  // Y coordinate (points from bottom)
    width: number;              // Width in points
    height: number;             // Height in points
  };
}
```

**Appearance Modes:**

| Mode | When | Layout |
|------|------|--------|
| `'hybrid'` | Default when `imageData` is set | Signature image left + branded info box right |
| `'text-only'` | Default when no `imageData` | Full-width branded info box |
| `'image-only'` | Explicit `appearanceMode: 'image-only'` | Full-bleed PNG (backward compat) |

The info box shows "Digitally signed / by [Name]" in bold, date, reason, and location. A subtle Dapple logo watermark (15% opacity) appears behind the text. The text area has a white background for readability on colored pages.

### `SignedPDFResult`

```typescript
interface SignedPDFResult {
  signedData: Uint8Array;       // The signed PDF bytes
  signatureInfo: {
    signedAt: Date;
    signedBy: string;
    byteRange: [number, number, number, number];
    signatureSize: number;
    xrefStart?: number;
    objects?: SignatureObjectNumbers;
  };
}
```

### `BrowserKeypairSigner`

Your application must implement this interface to provide the signing credentials:

```typescript
interface BrowserKeypairSigner {
  getCertificate(): Promise<CertificateChain>;
  sign(data: Uint8Array): Promise<Uint8Array>;
  getEmail(): string;
  getAlgorithm(): { hash: string; signature: string; keySize: number };
}

interface CertificateChain {
  cert: Uint8Array;             // DER-encoded X.509 certificate
  chain: Uint8Array[];          // Intermediate certificates (can be empty)
}
```

### `PreparedPdf`

Returned by `preparePdfWithAppearance`. Pass to `signPreparedPdfWithPDFBox`.

```typescript
interface PreparedPdf {
  pdfBytes: Uint8Array;
  signerName: string;
  catalogObjectNumber: number;
  catalogGenerationNumber: number;
  pageObjectNumber: number;
  pageGenerationNumber: number;
  fieldName?: string;
  hasExistingDocMdp: boolean;
  hasExistingSignature: boolean;
  deterministicId: Uint8Array;
  imageData?: Uint8Array;       // Raw PNG bytes for Phase 2 embedding
  appearanceText?: string;      // e.g. "Digitally Signed"
  appearanceSignerText?: string; // e.g. "By: John Doe"
  signatureRect?: [number, number, number, number]; // [x, y, w, h]
}
```

## Features

### Visual Signatures with PNG Images

Embed a PNG image (e.g., a handwritten signature from a signature pad) alongside a branded digital signature info box:

```typescript
const pngBytes = fs.readFileSync('signature-squiggle.png');

const result = await signPDFWithPDFBox(pdfBytes, signer, {
  reason: 'Approved',
  location: 'San Francisco',
  signatureAppearance: {
    imageData: new Uint8Array(pngBytes),
    brandText: 'Dapple SafeSign',        // default; customize or omit
    // appearanceMode: 'hybrid',          // default when imageData is set
    position: { page: 0, x: 300, y: 50, width: 280, height: 80 },
  },
});
```

**How it works (hybrid mode — default):**
- The signature image is drawn on the left ~48% of the widget rectangle
- A white background rectangle ensures readability on colored pages
- The Dapple logo watermark (15% opacity) is drawn behind the text area
- Bold text: "Digitally signed / by [signer name]" from the certificate CN
- Detail lines: Date (UTC), Reason, Location
- Small "Dapple SafeSign" brand at bottom-right

**Other modes:**
- `appearanceMode: 'image-only'` — full-bleed PNG, no text (backward compatible)
- No `imageData` — text-only branded info box fills the full width

**When no `imageData` is provided**, the appearance uses the default text-based rendering (border rectangle + "Digitally Signed" + signer name), preserving byte-for-byte parity with Java PDFBox.

### Multi-User Signing (Counter-Signatures)

Sign a PDF multiple times by calling `signPDFWithPDFBox` sequentially. Each call produces a new incremental update:

```typescript
// First signer
const firstSigned = await signPDFWithPDFBox(originalPdf, signer1, {
  signatureAppearance: {
    text: 'Approved by Alice',
    fieldName: 'Signature1',
    position: { page: 0, x: 50, y: 100, width: 200, height: 50 },
  },
});

// Second signer (counter-sign the already-signed PDF)
const secondSigned = await signPDFWithPDFBox(firstSigned.signedData, signer2, {
  signatureAppearance: {
    text: 'Verified by Bob',
    fieldName: 'Signature2',
    position: { page: 0, x: 300, y: 100, width: 200, height: 50 },
  },
});

// secondSigned.signedData contains both signatures
```

**Behavior:**
- Each signature gets its own AcroForm field (`Signature1`, `Signature2`, etc.)
- Field names auto-increment if not specified (`Signature1`, `Signature2`, ...)
- The first signature adds DocMDP permissions; subsequent signatures skip DocMDP (no duplicates)
- Each signature's ByteRange covers the full document up to that point
- All signatures remain valid — incremental updates don't invalidate prior signatures

### RFC 3161 Timestamps (LTV)

Add a trusted timestamp to your signature for long-term validation. Without timestamps, signature validity depends on the signing certificate's expiry date. Adobe Acrobat shows "Signature is LTV enabled" when a timestamp is present.

```typescript
const result = await signPDFWithPDFBox(pdfBytes, signer, {
  reason: 'Document approval',
  timestampURL: 'http://timestamp.digicert.com',
  signatureAppearance: {
    text: 'Approved',
    position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
  },
});
```

**How it works:**
1. The RSA signature is computed first via `computeRsaSignature`
2. The signature bytes are hashed (SHA-256) and sent to the TSA
3. The TSA returns a signed timestamp token (RFC 3161 `TimeStampResp`)
4. The token is embedded as an unsigned attribute (`id-aa-timeStampToken`) in the CMS SignerInfo
5. The `/Contents` placeholder is automatically enlarged to fit the timestamp (32KB vs 18KB default)

**Free public TSA servers:**
- `http://timestamp.digicert.com`
- `http://ts.ssl.com`
- `http://timestamp.sectigo.com`

**Manual timestamp fetching** (for advanced workflows):

```typescript
import { fetchTimestampToken, TSAError } from 'pdfbox-ts';

try {
  const token = await fetchTimestampToken(
    'http://timestamp.digicert.com',
    signatureBytes,
    10_000  // timeout in ms (default: 30s)
  );
} catch (err) {
  if (err instanceof TSAError) {
    console.log(err.url);        // TSA URL
    console.log(err.httpStatus);  // HTTP status (if network error)
    console.log(err.tsaStatus);   // RFC 3161 status code (if TSA rejected)
  }
}
```

### Two-Step API for Advanced Workflows

When you need to separate preparation from signing (e.g., remote signing, approval workflows):

```typescript
// Step 1: Prepare (can happen on one server/client)
const prepared = await preparePdfWithAppearance(pdfBytes, signer, {
  signatureAppearance: {
    imageData: pngBytes,
    position: { page: 0, x: 50, y: 50, width: 200, height: 100 },
  },
});

// Inspect the prepared state
console.log(prepared.hasExistingSignature); // true if already signed
console.log(prepared.imageData);            // raw PNG bytes (if image provided)

// Step 2: Sign (can happen later or on a different machine)
const result = await signPreparedPdfWithPDFBox(prepared, signer);
```

## Environment Variables

For deterministic/reproducible output (used in testing):

| Variable | Purpose | Example |
|----------|---------|---------|
| `PDFBOX_TS_SIGN_TIME` | Lock the PDF signature timestamp | `2024-01-01T00:00:00Z` |
| `PDFBOX_TS_CMS_SIGN_TIME` | Lock the CMS signing time | `2024-01-01T00:00:00Z` |
| `PDFBOX_TS_FORCE_FULL_SAVE` | Force full-save mode (rewrite entire PDF) | `1` |
| `PDFBOX_TS_CMS_DER` | Use DER encoding instead of BER for CMS signatures | `1` |
| `PDFBOX_TS_TRACE` | Enable debug tracing | `1` |

## Parity with Java PDFBox

All 9 test fixtures produce **byte-for-byte identical** output between TypeScript and Java PDFBox:

| Fixture | Source | Pages | Objects | Status |
|---------|--------|-------|---------|--------|
| wire-instructions | Hand-authored | 3 | 6 | SHA256 match |
| test-document | pdf-lib generated | 1 | 8 | SHA256 match |
| simple-test | Minimal | 1 | 6 | SHA256 match |
| chrome-print-complex-images | Chrome Print | 1 | 552 | SHA256 match |
| google-docs-multipage-images | Google Docs | 2 | 58 | SHA256 match |
| google-docs-presentation-large | Google Slides | 35 | 229 | SHA256 match |
| wire-instructions-signed | Pre-signed | 3 | 8 | SHA256 match |
| object-stream | ObjStm/XRef stream | 1 | 12 | SHA256 match |
| broken-signature | Edge case | 1 | - | SHA256 match |

**Visual signatures and counter-signing are TS-only features** — they don't affect parity because:
- When `imageData` is not provided, the code path is identical to before
- The parity harness doesn't provide `imageData`, so all SHA256 matches remain unchanged

## Sample PDFs

The `samples/` directory contains pre-signed PDFs for manual inspection in Adobe Reader:

| File | What to look for |
|------|-----------------|
| `01-single-text-signature.pdf` | One text signature at bottom-left |
| `02-visual-signature-with-png.pdf` | One signature with embedded PNG badge |
| `03-two-signatures-counter-signed.pdf` | Two text signatures side by side |
| `04-two-signatures-second-has-png.pdf` | First text sig + second PNG sig |
| `05-real-world-wire-instructions-signed.pdf` | Real fixture PDF, signed |
| `06-pre-signed-then-counter-signed.pdf` | Pre-signed PDF with added counter-sig |
| `07-two-step-prepare-then-sign.pdf` | Two-step API with PNG image |
| `08-visual-png-incremental-mode.pdf` | Visual PNG in incremental mode |

Generate fresh samples: `npx tsx scripts/generate-samples.ts`

### Form Flattening on Sign

Lock form fields permanently by flattening them as part of the signing step:

```typescript
const result = await signPDFWithPDFBox(pdfBytes, signer, {
  flattenForms: true,
  reason: 'Final approval — form fields locked',
  signatureAppearance: {
    position: { page: 0, x: 50, y: 50, width: 200, height: 50 },
  },
});
// All form fields are now baked into page content — non-editable
```

When `flattenForms: true` is set, the library calls `PDFForm.flatten()` before applying the signature. This converts all widget appearance streams into static page content, removes the `/AcroForm` fields array, and makes the form data permanently visible but non-interactive.

### Copy Pages Between Documents

Deep-clone pages from one PDF into another, preserving all content (fonts, images, annotations):

```typescript
import { PDFDocument, copyPages } from 'pdfbox-ts';

const srcDoc = await PDFDocument.load(sourcePdfBytes);
const dstDoc = await PDFDocument.create();

// Copy pages 0 and 2 (0-indexed)
const copiedPages = copyPages(srcDoc, dstDoc, [0, 2]);

// Add them to the destination document
for (const page of copiedPages) {
  dstDoc.addPage(page);
}

const pdfBytes = await dstDoc.save();
```

**How it works:**
- Deep-clones the page's entire COS object graph (dictionaries, arrays, streams, indirect references)
- Allocates new object numbers in the destination context
- Remaps all cross-references using an `oldRef → newRef` mapping
- Handles circular references via a visited-set
- Preserves inherited page-tree properties (`/MediaBox`, `/CropBox`, `/Resources`, `/Rotate`)
- Returns `PDFPage[]` — pages registered but NOT yet in the page tree (call `addPage()` yourself)

### Custom Font Embedding (TrueType & OpenType)

Embed TrueType (.ttf) and CFF/OpenType (.otf) fonts. TrueType fonts support automatic subsetting.

```typescript
import { PDFDocument } from 'pdfbox-ts';
import { readFile } from 'fs/promises';

const doc = await PDFDocument.create();

// TrueType font — subsetting reduces file size automatically
const ttfBytes = await readFile('Roboto-Regular.ttf');
const roboto = await doc.embedFont(ttfBytes);

// OpenType/CFF font — full embedding (CFF data as FontFile3)
const otfBytes = await readFile('SourceSansPro-Regular.otf');
const sourceSans = await doc.embedFont(otfBytes);

const page = doc.addPage();
page.drawText('Hello TrueType!', { x: 50, y: 700, size: 24, font: roboto });
page.drawText('Hello OpenType!', { x: 50, y: 660, size: 24, font: sourceSans });

const pdfBytes = await doc.save();
```

**Font subsetting** (TrueType only): The subsetter extracts only the glyphs used in the document, rebuilds the `glyf`, `loca`, `cmap`, `hmtx`, and other tables, and produces a minimal TrueType file. This significantly reduces file size for large fonts (e.g., Noto CJK from 15MB to a few KB).

**OpenType/CFF**: The parser detects the `OTTO` signature, extracts the raw CFF table, and embeds it as `/FontFile3` with `/Subtype /CIDFontType0C`. The sfnt wrapper tables (`head`, `hhea`, `hmtx`, `cmap`, `OS/2`, `post`, `name`) provide metrics.

### Trusted Redaction

Remove content from a PDF by marking areas with redaction annotations and then applying them.

**Step 1: Add redaction annotations** (marks areas for redaction — content is still visible):

```typescript
import { PDFDocument, PDAnnotationRedact, rgb, ANNOTATION_FLAG_PRINT } from 'pdfbox-ts';

const doc = await PDFDocument.load(pdfBytes);
const page = doc.getPage(0);

// Mark a region for redaction
const redact = new PDAnnotationRedact({
  rect: [100, 200, 400, 250],        // [x1, y1, x2, y2]
  interiorColor: rgb(0, 0, 0),        // Black fill after redaction
  overlayText: '[REDACTED]',          // Optional label
  flags: ANNOTATION_FLAG_PRINT,
});
page.addAnnotation(redact);

const markedPdf = await doc.save();
```

**Step 2: Apply redactions** (actually removes content from content streams):

```typescript
import { applyRedactions } from 'pdfbox-ts';

// Get the page's content stream bytes
const contentStream = /* page content stream bytes */;

// Apply redaction — removes text, paths, and images within the rectangles
const redacted = applyRedactions(
  contentStream,
  [{ x: 100, y: 200, width: 300, height: 50 }],
  { r: 0, g: 0, b: 0 },  // Interior fill color (optional, default: black)
);
```

**What `applyRedactions` removes:**
- Text-showing operations (`Tj`, `TJ`, `'`, `"`) where text position overlaps a redaction rectangle
- Path operations (`m`, `l`, `c`, `re`, `f`, `S`, etc.) where the path bounding box overlaps
- Image invocations (`Do`) and inline images (`BI`/`ID`/`EI`) at overlapping positions
- Appends filled rectangles in the interior color at each redaction position

The redactor tracks the full graphics state (CTM via `cm`, text matrix via `Tm`/`Td`/`TD`/`T*`, font size, text leading) and handles `q`/`Q` save/restore.

### PDF/A Compliance

Save PDFs in archival-compliant format (ISO 19005). Supported levels: PDF/A-1b, PDF/A-2b, PDF/A-3b.

```typescript
import { PDFDocument, StandardFonts } from 'pdfbox-ts';

const doc = await PDFDocument.create();
doc.setTitle('Archival Report');
doc.setAuthor('Legal Department');

const page = doc.addPage();
const font = await doc.embedFont(StandardFonts.Helvetica);
page.drawText('This document is PDF/A-1b compliant.', {
  x: 50, y: 700, size: 14, font,
});

// Save with PDF/A conformance
const pdfBytes = await doc.save({ pdfaConformance: 'PDF/A-1b' });
```

**What the `pdfaConformance` option does at save time:**
- Sets the PDF version header (`%PDF-1.4` for PDF/A-1b, `%PDF-1.7` for PDF/A-2b/3b)
- Adds a `/Metadata` stream on the catalog with XMP including `pdfaid:part` and `pdfaid:conformance`
- Adds `/OutputIntents` array with an sRGB ICC color profile (480 bytes, generated at runtime)
- Synchronizes the `/Info` dictionary with the XMP metadata

**Conformance levels:**

| Level | Base PDF | Transparency | JPEG2000 | Use case |
|-------|---------|-------------|----------|----------|
| PDF/A-1b | 1.4 | No | No | Maximum compatibility |
| PDF/A-2b | 1.7 | Yes | Yes | Modern archival |
| PDF/A-3b | 1.7 | Yes | Yes | Archival with embedded files |

### LTV (Long-Term Validation)

Embed certificate revocation data (OCSP responses, CRLs) in a DSS dictionary for signature validity beyond certificate expiry.

```typescript
import { signPDFWithPDFBox, addLtvToPdf } from 'pdfbox-ts';

// Sign with a TSA timestamp
const signed = await signPDFWithPDFBox(pdfBytes, signer, {
  timestampURL: 'http://timestamp.digicert.com',
});

// Add LTV data (OCSP + CRL responses)
const ltvResult = await addLtvToPdf(signed.signedData, {
  fetchRevocationData: true,  // Auto-fetch from cert AIA/CDP URLs
});

// ltvResult.pdfBytes — PDF with DSS/VRI dictionaries embedded
```

**Manual LTV data:**

```typescript
const ltvResult = await addLtvToPdf(signed.signedData, {
  ocsps: [ocspResponseBytes],     // Pre-fetched OCSP responses
  crls: [crlBytes],               // Pre-fetched CRLs
  certs: [intermediateCertDer],   // Additional certificates
});
```

## Error Handling

The library throws `UnsupportedPdfFeatureError` for PDFs it cannot sign:
- Encrypted PDFs
- Missing catalog or page objects
- Corrupted xref tables

```typescript
import { UnsupportedPdfFeatureError } from 'pdfbox-ts/errors/UnsupportedPdfFeatureError';

try {
  const result = await signPDFWithPDFBox(pdfBytes, signer);
} catch (err) {
  if (err instanceof UnsupportedPdfFeatureError) {
    console.log(err.feature);        // e.g., 'encrypted-pdf'
    console.log(err.recommendation); // suggested action
  }
}
```

## Integration with pdf-signer-web

```typescript
// In your React/web app:
import { signPDFWithPDFBox } from 'pdfbox-ts';

async function signDocument(file: File, signer: BrowserKeypairSigner) {
  const pdfBytes = new Uint8Array(await file.arrayBuffer());

  const result = await signPDFWithPDFBox(pdfBytes, signer, {
    reason: 'Document approval',
    location: 'Web Application',
    signatureAppearance: {
      imageData: userSignatureImage,  // optional PNG
      position: { page: 0, x: 50, y: 50, width: 200, height: 80 },
    },
  });

  // Download or upload the signed PDF
  const blob = new Blob([result.signedData], { type: 'application/pdf' });
  return blob;
}
```
