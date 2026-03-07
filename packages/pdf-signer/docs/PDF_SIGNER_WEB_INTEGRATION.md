# pdf-signer-web Integration Guide

_For the pdf-signer-web team. This document describes new pdfbox-ts capabilities available for integration and the upgrade path from beta.4 to the current version._

---

## Current State

**pdf-signer-web** uses `pdfbox-ts@1.0.0-beta.4` vendored as a `.tgz` in `packages/pdf-core/vendors/`. The `@pdf-signer/pdf-core` package re-exports pdfbox-ts APIs as `signPDFAdvanced`, `PDFDocument`, etc.

**pdfbox-ts current version** has expanded significantly since beta.4. Key additions:

| Feature | beta.4 | Current | Impact |
|---------|--------|---------|--------|
| Signing | Yes | Yes (unchanged API) | None — drop-in compatible |
| Signature verification | No | Yes | New capability for users |
| Text extraction | No | Yes | New capability for users |
| Image extraction | No | Yes | New capability for users |
| PDF/A archival output | No | Yes | New save option |
| Font subsetting | No | Yes | Smaller PDFs with custom fonts |
| CFF/OpenType fonts | No | Yes | `.otf` font support |
| Trusted redaction | No | Yes | Sensitive content removal |
| Encrypted PDF detection | No | Yes | Better error messages |
| Robustness (corpus) | ~780/1104 | 1105/1105 | Fewer signing failures on real-world PDFs |

---

## Upgrade Path

### Step 1: Replace the vendored `.tgz`

Build a new tarball from the current pdfbox-ts:

```bash
cd /Users/will/dev/pdfbox-ts
pnpm build
pnpm pack  # produces pdfbox-ts-1.0.0-beta.5.tgz
cp pdfbox-ts-1.0.0-beta.5.tgz /Users/will/dev/pdf-signer-web/packages/pdf-core/vendors/
```

Update `packages/pdf-core/package.json`:
```json
"dependencies": {
  "pdfbox-ts": "file:vendors/pdfbox-ts-1.0.0-beta.5.tgz"
}
```

Run `pnpm install` in the monorepo root.

### Step 2: Verify existing functionality

The signing API (`signPDFWithPDFBox`) is **unchanged**. All existing code should work without modification:

```typescript
// This still works exactly the same
const result = await signPDFAdvanced(file.data, signer, {
  reason: 'Digital Signature',
  signatureAppearance: { ... },
});
```

Run the existing test suite to confirm.

### Step 3: Export new APIs from pdf-core

Add new re-exports to `packages/pdf-core/src/index.ts`:

```typescript
// Signature verification
export { verifySignatures } from 'pdfbox-ts';
export type { SignatureVerificationResult, ChainStatus, TimestampInfo } from 'pdfbox-ts';

// Content extraction (sub-path import for tree-shaking)
export { extractText, extractTextContent, extractImages } from 'pdfbox-ts/extraction';
export type { PageText, TextItem, ExtractedImage } from 'pdfbox-ts/extraction';

// PDF/A (already available via SaveOptions)
// Just document the new option: doc.save({ pdfaConformance: 'PDF/A-1b' })

// Redaction
export { applyRedactions } from 'pdfbox-ts';
export { PDAnnotationRedact } from 'pdfbox-ts';
```

---

## New Features: Integration Recommendations

### 1. Signature Verification (High Priority)

**What it does**: Verify all digital signatures in a PDF — integrity, cryptographic validity, certificate chain, and timestamps.

**Why it matters**: Users can verify third-party signed PDFs in the browser, not just create signatures.

**API**:
```typescript
import { verifySignatures } from 'pdfbox-ts';

const results = verifySignatures(pdfBytes);
for (const sig of results) {
  sig.fieldName;        // 'Signature1'
  sig.signedBy;         // 'John Smith' (cert CN)
  sig.signedAt;         // Date object
  sig.algorithm;        // 'RSA' | 'ECDSA'
  sig.integrityValid;   // true = content not tampered
  sig.signatureValid;   // true = crypto signature verifies
  sig.chainStatus;      // 'valid' | 'self-signed' | 'partial'
  sig.reason;           // 'Approved'
  sig.location;         // 'San Francisco, CA'
  sig.timestampInfo;    // { signerCn, signedAt, verified } or undefined
}
```

**Suggested UX**: Add a "Verify" button/tab in the web app. Show each signature with green/yellow/red status. Display signer name, date, and chain status.

### 2. Text Extraction (Medium Priority)

**What it does**: Extract all text from a PDF with position, font, and size information.

**Why it matters**: Enables search-within-PDF, text copy, and document analysis features.

**API**:
```typescript
import { extractText, extractTextContent } from 'pdfbox-ts/extraction';

// Simple: get all text as a string
const fullText = await extractTextContent(pdfBytes);

// Structured: per-page text items with positions
const pages = await extractText(pdfBytes);
for (const page of pages) {
  page.pageIndex;  // 0-based
  page.text;       // reconstructed full text with line breaks
  for (const item of page.items) {
    item.text;      // 'Hello'
    item.x;         // 72.0
    item.y;         // 700.5
    item.fontSize;  // 12
    item.fontName;  // 'Helvetica'
    item.width;     // 30.5
  }
}
```

**Suggested UX**: Add text search/highlight overlay on PDF viewer. Show extracted text in a side panel.

### 3. Image Extraction (Low Priority)

**What it does**: Extract all embedded images from a PDF.

**API**:
```typescript
import { extractImages } from 'pdfbox-ts/extraction';

const images = await extractImages(pdfBytes);
for (const img of images) {
  img.pageIndex;       // 0
  img.name;            // 'Im1'
  img.width;           // 800
  img.height;          // 600
  img.colorSpace;      // 'DeviceRGB'
  img.filter;          // 'DCTDecode' (JPEG) or 'FlateDecode'
  img.data;            // Uint8Array — raw JPEG bytes or decoded pixels
}
```

### 4. PDF/A Archival Output (Low Priority)

**What it does**: Save PDFs conforming to PDF/A-1b or PDF/A-2b archival standards.

**API**:
```typescript
const pdfBytes = await doc.save({ pdfaConformance: 'PDF/A-1b' });
```

**Suggested UX**: Add a "Save as PDF/A" option for users in regulated industries (legal, healthcare, government).

### 5. Encrypted PDF Detection (Automatic)

The upgraded pdfbox-ts now **rejects encrypted PDFs with a clear error message** instead of silently producing corrupt output. This is automatic — no code changes needed.

**Before** (beta.4): Signing an encrypted PDF would produce a corrupt file.
**After**: Throws `Error: Cannot sign encrypted PDF. Decrypt the PDF first before signing.`

**Suggested UX**: Catch this error in SigningFlow and show a user-friendly message: "This PDF is password-protected. Please remove the password before signing."

### 6. Trusted Redaction (Future)

**What it does**: Permanently remove content under redaction annotations.

**API**:
```typescript
import { PDAnnotationRedact, applyRedactions } from 'pdfbox-ts';

// Add redaction annotations
page.addAnnotation(new PDAnnotationRedact({
  rect: [100, 500, 400, 520],  // area to redact
}));

// Apply — permanently removes text/images under redaction rects
const redactedBytes = await doc.save();
```

**Suggested UX**: Redaction tool in the PDF viewer — draw rectangles over sensitive content, then "Apply Redactions" to permanently remove.

---

## Upcoming: Encryption/Decryption

pdfbox-ts will add password-based PDF encryption and decryption. When ready:

```typescript
// Decrypt
const doc = await PDFDocument.load(encryptedBytes, { password: 'secret' });

// Encrypt
const pdfBytes = await doc.save({
  userPassword: 'view-only',
  ownerPassword: 'full-access',
  permissions: { print: true, copy: false, modify: false },
});
```

**Impact on pdf-signer-web**: Users will be able to:
1. Open and sign password-protected PDFs (by entering the password)
2. Add password protection to signed PDFs
3. Control permissions (print, copy, modify)

---

## Breaking Changes: None

The upgrade from beta.4 to current is **fully backward-compatible**. No existing APIs were changed or removed. All new features are additive.

The only behavioral difference: encrypted PDFs now throw instead of producing corrupt output. This is strictly an improvement.

---

## Robustness Improvement

The parser has been significantly hardened since beta.4:

| Fix | Impact |
|-----|--------|
| XRef stream PNG predictor | ~250 more PDFs parse correctly |
| Hybrid-xref (table + stream) | ~40 more PDFs parse correctly |
| CR-only line endings | ~20 more PDFs parse correctly |
| Object stream resolution | Previously fixed in beta.4 |

**Corpus results**: 1105/1105 real-world PDFs sign successfully (up from ~780 in beta.4). This means significantly fewer "failed to sign" errors for end users.
