# Changelog

## 1.0.0-beta.3 (2026-02-16)

- **Adobe Acrobat LTV validation confirmed** — Full LTV pipeline validated: 3-cert chain,
  OCSP, CRL, DSS/VRI all recognized by Adobe Acrobat ("Signature is LTV enabled", valid identity)
- Fix ObjectResolver for incremental PDFs — uses xref byte offset to resolve the correct
  version of objects, instead of regex-matching the first occurrence. Critical for LTV
  incremental saves that modify the catalog.
- Fix `extractCrlUrls()` ASN.1 parsing — CDP extension has nested DistributionPoint structure;
  replaced flat iteration with recursive search
- CMS chain cert embedding — `buildPdfBoxCmsSignature` includes chain certs in CMS
  `certificates` field when `chainCertsDer` is provided (parity preserved)
- Local CA + OCSP infrastructure — `scripts/ltv-ca-setup.sh` generates full PKI hierarchy
  (Root CA → Intermediate CA → Signing Cert + OCSP Cert); `scripts/ltv-ocsp-start.sh` runs
  OpenSSL OCSP responder + static file server for CRL/cert distribution
- 6 new LTV E2E tests — env-gated (`PDFBOX_TS_E2E_LTV=1`), covers cert extensions, OCSP fetch,
  CRL embedding, integrated enableLTV flow, qpdf+pdfsig validation
- 1278 tests passing, 15 env-gated (visual, Acrobat, LTV, live-TSA)

## 1.0.0-beta.2 (2026-02-16)

- Add LTV (Long-Term Validation) support with DSS dictionary embedding
  - `addLtvToPdf()` standalone API for adding DSS/VRI as second incremental save
  - OCSP client (RFC 6960 request builder, HTTP fetcher)
  - CRL fetcher (CDP extension parsing, HTTP download)
  - Certificate extraction from BER-encoded CMS (byte-scanning fallback)
  - VRI key computation (SHA-1 of signature Contents, uppercase hex)
  - Integrated into `signPDFWithPDFBox` via `enableLTV` option
- Fix xref stream self-entry in full-save mode (PDF spec 7.5.8 compliance)
- Guard `process.env` accesses for browser environments (4 locations)
- New exports: `addLtvToPdf`, `LtvError`, `computeVriKey`, `LtvOptions`, `LtvResult`
- New `SignatureOptions` fields: `enableLTV`, `ltvOptions`
- 11 new LTV unit tests, 184 total tests passing

## 1.0.0-beta.1 (2026-02-15)

- Fix all 46 known-limitation bugs for 100% robustness corpus coverage (204/204)
- Add xref-aware ObjectResolver for AcroForm inside Object Streams (16 files fixed)
- Add /Prev chain walking in trailer/xref parser for linearized PDFs (28 files fixed)
- Fix concatenated `obj<<` token handling and string/comment-aware dictionary parsing (2 files fixed)
- Add E2E visual rendering tests (pdftoppm + pixelmatch, 4 snapshot tests)
- Add E2E Adobe Acrobat validation tests (adobe-auto.py, 3 tests)
- Add env-var gated test tiers: PDFBOX_TS_E2E_VISUAL, PDFBOX_TS_E2E_ACROBAT
- Bump version from alpha.8 to beta.1

## 1.0.0-alpha.8 (2026-02-14)

- Fix PDF tokenizer delimiter handling (/ and % as delimiters in consumeName/consumeIdentifier)
- Add 204-file robustness corpus from 7 sources with 4-category test classification
- Fix compact dictionary syntax parsing (e.g. /Filter/FlateDecode)

## 1.0.0-alpha.7 (2026-02-13)

- Add RFC 3161 TSA timestamp support via `timestampURL` option
- Add browser compatibility — remove all Node.js built-ins from public API
- Replace node:crypto with node-forge, zlib with pako
- Add `fetchTimestampToken` and `TSAError` exports
- Dynamic CMS placeholder sizing (larger with timestamps)
- 14 new TSA unit tests + 2 live integration tests (DigiCert)

## 1.0.0-alpha.6 (2026-02-12)

- **Merged `canonical-parity` to `main`** — 8 commits of visual signatures, multi-user signing, and parity work now on main branch.
- **Removed legacy pdf-lib signer** — `signPDFAdvanced` removed from public API. Use `signPDFWithPDFBox` instead.
- **Cleaned up 17 dead files** — removed compiled .class files, superseded scripts, one-off porting tools, legacy signer implementations, and duplicate JARs.
- **Audited public exports** — `src/index.ts` now exports exactly 3 functions, 1 version helper, and 6 types. Added `CertificateChain` and `SignatureObjectNumbers` type exports.
- **Added GitHub Actions CI** — typecheck + unit tests + parity gate on Node 18/20/22.
- **Zero untracked TODOs** in source code.

## 1.0.0-alpha.5 (2026-02-12)

- Added `PDFBOX_TS_CMS_DER` env var to switch CMS encoding from BER (indefinite-length, matching Java PDFBox) to DER (definite-length). Default remains BER for parity.
- Adobe Acrobat cert trust verified: `signatureValidate()` returns 4 (VALID), blue "Certified by pdfbox-ts Fixture" banner.
- Documentation overhaul: all docs updated to reflect current state.

## 1.0.0-alpha.4 (2026-02-12)

- **Visual signatures** with embedded PNG images. Appearance streams use `/Resources` as indirect objects (required by Adobe Reader).
- **Multi-user signing** (counter-signatures). Each call to `signPDFWithPDFBox` appends an incremental update with its own signature field. DocMDP permissions managed automatically (first signer only).
- **All 9 fixtures pass byte-for-byte parity** including `google-docs-presentation-large` (35-page Google Slides deck). Previously diverged due to full-save mode differences.
- **Adobe Acrobat automation** (`scripts/adobe-auto.py`): 17/17 diagnostic tests, commands for validate/screenshot/siginfo/JS execution. 10-second timeout safety on all operations.
- **SDK documentation** (`docs/SDK_GUIDE.md`): full API reference with examples for single signing, visual signatures, multi-user signing, two-step workflows, and type definitions.
- **Java reference visual signature** (`scripts/java/VisualSignature.java`) for structural comparison.
- 148 unit tests (up from 138), 25 test files.
- 8 pre-signed sample PDFs in `samples/` for manual Adobe Reader inspection.

## 1.0.0-alpha.3 (2025-11-16)

- Incremental outputs now embed the same deterministic `/ID`, `/M`, and CMS timestamps that the Java helper uses. Combined with reusing the raw certificate DER, PKCS#7 blobs now match for the Chrome "complex images" fixture (and all other incremental cases).
- Object-stream PDFs now remain incremental: we always emit a text `xref` block for incremental saves, just like PDFBox, instead of switching to `/Type /XRef` when the original used one. The `object-stream` fixture now matches byte-for-byte.
- Added `fixtures/unsigned-pdfs/` (so other repos can grab the unsigned inputs) and `pnpm parity:report` which runs the whole manifest and prints a mismatch histogram.

## 1.0.0-alpha.2 (2025-11-15)

- Added `src/version.ts` plus exports so downstream apps can log/assert the runtime version.
- `pnpm compare` gained richer breadcrumbs (`ts.json`, `structure-*.txt` per fixture) and the TypeScript signer learned to wire DocMDP references + zeroed widgets so incremental outputs stay structurally aligned with PDFBox.
- Full-save fallback now routes through `saveFullDocument()` with parsed COS objects, so PDFs that require a full rewrite can be signed entirely inside TypeScript.
- `pnpm compare` emits `structure-java.txt` / `structure-ts.txt` for every fixture, listing xref entries and `/ObjStm` memberships.

## 1.0.0-alpha.1 (2025-11-14)

- Incremental COSWriter pipeline now mirrors PDFBox end-to-end: object queueing, `/ObjStm` packing, and `/Type /XRef` streams are all ported.
- All fixtures except the Google Slides deck match the Java reference byte-for-byte (SHA256, `/ByteRange`, `/Contents`, `startxref`).
- Added `PDFBOX_TS_MODE_PATH` + `forceFullSave` plumbing so we know when PDFBox rewrites an entire document.
