# Parity Roadmap

_Updated: 2026-02-25_

Goal: byte-for-byte parity with Apache PDFBox for incremental and full-save PDF signing.

---

## Parity Snapshot

- ✅ **Incremental signing** — Byte-for-byte match for ALL 9 fixtures including `google-docs-presentation-large`
- ✅ **Visual signatures** — PNG embedding, appearance streams, Adobe Acrobat verified
- ✅ **Multi-user signing** — Counter-signatures with full integrity preservation (incremental-only signing for counter-sign)
- ✅ **Adobe Acrobat validation** — `signatureValidate()` = 4 (VALID), blue "Certified" banner
- ✅ **TSA timestamps** — RFC 3161 support via `timestampURL`; tested with DigiCert
- ✅ **Browser compatibility** — No Node.js built-ins in public API; works in Vite/webpack
- ✅ **LTV (Long-Term Validation)** — DSS/VRI embedding, OCSP/CRL fetchers, standalone or integrated
- ✅ **Full-save signing** — Structurally verified (qpdf + pdfsig); all 9 fixtures pass (no Java full-save reference for byte comparison)

---

## Full-Save Implementation Phases

### Phase 1: Full-Save Trigger Alignment ✅
- `decideFullSaveMode()` detects xref stream + ObjStm PDFs
- `PDFBOX_TS_FORCE_FULL_SAVE=1` env var override
- Files: `src/signer/pdfbox-signer.ts`

### Phase 2: Object Reachability Analysis ✅
- BFS/DFS from trailer refs to find all reachable objects
- Eliminates orphans like Java does
- Files: `src/pdfbox/parser/object-graph.ts`

### Phase 3: CompressionPool Heuristics ✅
- Matches Java's `COSWriterCompressionPool` rules:
  - Streams, gen > 0, root catalog → top-level
  - Signature dicts → top-level
  - Everything else → packable
- Files: `src/pdfbox/writer/CompressionPool.ts`

### Phase 4: Object Stream Ordering ✅
- Sort packable objects by object number
- Array formatting matches Java (space before, newline only after complex elements)
- Stream dict key ordering matches Java (/Length first)
- Files: `src/pdfbox/writer/COSWriter.ts`

### Phase 5: XRef Stream Alignment ✅ VERIFIED
- Fixed missing xref stream self-entry (PDF spec 7.5.8 compliance)
- /W array `[1 3 1]` correct for entry sizes
- /Index ranges correctly built from sorted entries with gap compression
- Deflate level 6 (pako default) matches Java's `Deflater.DEFAULT_COMPRESSION`
- Note: Java PatchedSignature always uses incremental save — no Java full-save xref stream to compare against
- Files: `src/pdfbox/writer/XRefStreamWriter.ts`, `src/pdfbox/writer/FullSaveWriter.ts`

### Phase 6: Integration & Testing ✅
- All 9 fixtures pass byte-for-byte parity (SHA256 match)
- Java signer NPE resolved (xref gap filling + LoggingCOSWriter fix + SigRef object parity)

---

## Completed Work

### Visual Signatures & Multi-User Signing ✅
- [x] Visual signatures with PNG images (appearance stream + embedded image)
- [x] Resources dict written as indirect object (Adobe Reader requirement)
- [x] Multi-user signing (counter-signatures) — 5 tests
- [x] Visual signature tests — 5 tests
- [x] Java reference visual signature (`scripts/java/VisualSignature.java`)
- [x] Adobe Acrobat automation tooling (`scripts/adobe-auto.py`) — 17/17 diagnostic tests
- [x] SDK documentation (`docs/SDK_GUIDE.md`)
- [x] Adobe Acrobat cert trust verified (`signatureValidate()` = 4)

### TSA Timestamp Support ✅
- [x] RFC 3161 TSA client (`src/signer/tsa.ts`)
- [x] `buildTimeStampReq` / `parseTimeStampResp` / `fetchTimestampToken` API
- [x] Unsigned attributes in CMS SignerInfo (`id-aa-timeStampToken`)
- [x] `computeRsaSignature` extracted for pre-signing timestamp flow
- [x] Dynamic placeholder size (32KB with timestamp, 18KB without)
- [x] 14 unit tests + 2 live integration tests (DigiCert TSA)
- [x] Parity preserved: without `timestampURL`, output is byte-identical

### Browser Compatibility ✅
- [x] Replaced `node:crypto` with `forge.md.sha256` in `pdfbox-signer.ts` and `tsa.ts`
- [x] Replaced `zlib.deflateSync` with `pako.deflate` in `COSWriterObjectStream.ts`
- [x] Zero new dependencies (both `node-forge` and `pako` already in deps)
- [x] Importable in Vite, webpack, Parcel — no Node polyfills needed

### Porting Areas

| Area | Status | Notes |
|------|--------|-------|
| Incremental save pipeline | ✅ Complete | COSWriter + xref + signature injection |
| Signature field + AcroForm wiring | ✅ Complete | Catalog/page rewrite, widget, DocMDP |
| Signing support utilities | ✅ Complete | SignatureOptions, external signing |
| Document sanitization | ✅ Complete | Null-key scrub, trailer tree walk |
| Visual signatures | ✅ Complete | PNG embedding, appearance streams |
| Multi-user signing | ✅ Complete | Counter-signatures, auto field naming |
| CMS signature generation | ✅ Complete | BER + DER encoding toggle |
| TSA timestamp support | ✅ Complete | RFC 3161 client, unsigned attributes in CMS |
| Browser compatibility | ✅ Complete | No Node.js built-ins in public API |
| Robustness corpus (1105 PDFs) | ✅ Complete | 9 sources, 7 pdf-lib-parse-failure known limitations |
| Xref-aware ObjectResolver | ✅ Complete | ObjStm extraction, /Prev chain walking |
| Native PDFPage drawing | ✅ Complete | ContentStreamBuilder-based, 34 unit tests + 1 visual |
| Native PDF create/save | ✅ Complete | NativeDocumentContext + NativePDFWriter, 47 tests |
| Native PDF load | ✅ Complete | COS parser-based load, fallback to pdf-lib for exotic PDFs |
| Native AcroForm reader | ✅ Complete | NativeFormReader: field reading, getText/setText, /NeedAppearances |
| Native TrueType font embedding | ✅ Complete | Type0/CIDFontType2, TTF parser, ToUnicode CMap, 48 tests |
| TrueType font subsetting | ✅ Complete | Extracts used glyphs, rebuilds font tables, 33 tests |
| CFF/OpenType font support | ✅ Complete | OTTO signature, CFF extraction, FontFile3 embedding, 40 tests |
| copyPages() | ✅ Complete | Deep-clone with object graph remapping, 26 tests |
| Trusted redaction | ✅ Complete | PDAnnotationRedact + content stream redactor, 56 tests |
| Form flattening on sign | ✅ Complete | flattenForms option in SignatureOptions |
| PDF/A compliance | ✅ Complete | PDF/A-1b and PDF/A-2b, XMP + ICC profile + OutputIntents, 31 tests |
| pdf-lib fully removed | ✅ Complete | legacy.ts deleted, peerDependency removed, all native |
| PDF content extraction | ✅ Complete | Text + image extraction, font decoding, stream decompression, 52 tests |
| E2E visual rendering tests | ✅ Complete | pdftoppm + pixelmatch snapshots (5 tests) |
| E2E Acrobat validation tests | ✅ Complete | adobe-auto.py integration (3 tests) |
| Full document save (`PDDocument.save`) | ✅ Complete | Structurally verified; xref self-entry fixed |
| LTV (Long-Term Validation) | ✅ Complete | DSS/VRI, OCSP/CRL, standalone + integrated |
| LTV local CA + OCSP testing | ✅ Complete | PKI hierarchy, 6 E2E tests, env-gated |
| ObjectResolver xref-awareness | ✅ Complete | Byte offset resolution for incremental PDFs |
| Form field appearance generation | ✅ Complete | FieldAppearanceGenerator: text fields, checkboxes, dropdowns |
| Native rendering Phase 1 | ✅ Complete | evaluatePage → OperatorList → NativeCanvasGraphics → Canvas 2D, 27 tests |
| Element Model Phase 1 | ✅ Complete | evaluatePageWithElements → PageElement[] (text/shape/path/image), 21 tests |

---

## Strangler Fig — pdf-lib Removal Roadmap

Goal: Replace pdf-lib (3.2 MB) with native implementations built on pdfbox-ts's COS parser/writer.

### Phase 1: Unified Document Facade ✅ (beta.4)
- [x] `PDFDocument`, `PDFPage`, `PDFFont`, `PDFImage`, `PDFForm` wrappers over pdf-lib
- [x] All 8 form field wrappers
- [x] Native color, rotation, page size, standard font name types
- [x] Option interfaces and enums
- [x] `src/document/legacy.ts` as single pdf-lib import seam (cut point for Phase 7)

### Phase 2: Native Content Stream Builder ✅
- [x] `src/document/content-stream/operators.ts` — 40+ pure operator functions
- [x] `formatNumber()` matching pdf-lib's `numberToString` exactly
- [x] `ContentStreamBuilder` — fluent builder with 5 compound methods matching pdf-lib's operations.ts
- [x] Wired into signer appearance stream (behavioral no-op)
- [x] 64 tests

### Phase 3: Native Standard Font Metrics ✅
- [x] `src/document/fonts/encoding.ts` — WinAnsi/Symbol/ZapfDingbats encoding tables
- [x] `src/document/fonts/StandardFontMetrics.ts` — measurement API matching pdf-lib
- [x] `src/document/fonts/TextLayout.ts` — multi-line text layout with word wrap
- [x] 14 font data files generated from `@pdf-lib/standard-fonts`
- [x] Cross-validated to 6 decimal places against pdf-lib for all 12 WinAnsi fonts
- [x] Wired into `PDFFont` — standard fonts use native metrics automatically
- [x] `scripts/extract-font-metrics.ts` extraction script
- [x] Bundle config: `sideEffects: false`, sub-path exports (`./content-stream`, `./fonts`)

### Phase 4: Native PDFPage Drawing ✅
Replaced pdf-lib delegation in drawing methods with `ContentStreamBuilder` + native font metrics:
- [x] Native content stream injection via `context.stream()` + `context.register()` + `node.addContentStream()`
- [x] Native Font/XObject/ExtGState resource registration on page dictionary
- [x] `PDFPage.drawText/drawRectangle/drawSquare/drawLine/drawImage/drawEllipse/drawCircle` all native
- [x] `PDFFont.encodeTextToHex()` — native hex encoding for standard fonts
- [x] `ContentStreamBuilder.drawEllipse()` — Bézier curve ellipse compound method
- [x] Per-page font/image key caching; graphics state mapping matches pdf-lib exactly
- [x] 34 unit tests + 1 visual rendering test (pixelmatch snapshot)
- [x] `drawSvgPath`/`drawPage` still delegate to pdf-lib (complex parsing, deferred to Phase 5+)

### Phase 5: Native PDF Create/Save ✅
Native `PDFDocument.create()` → save() pipeline bypasses pdf-lib entirely:
- [x] `NativeDocumentContext` — COS object registry (catalog, pages tree, info dict)
- [x] `NativePDFWriter` — serializes to PDF bytes via COSWriter + XRefWriter
- [x] Dual-mode `PDFDocument`, `PDFPage`, `PDFFont`, `PDFImage` (native create vs legacy load)
- [x] Native Type1 standard font embedding (14 fonts, no embedding needed)
- [x] Native JPEG embedding (DCTDecode, SOF marker parsing)
- [x] Native PNG embedding (IDAT decompression, alpha splitting/SMask, FlateDecode + Predictor 15)
- [x] Native graphics state creation (opacity/blend mode)
- [x] MediaBox supports float dimensions (A4: 595.28 x 841.89)
- [x] 47 new tests (native-document.test.ts)
- [x] All 410 tests pass, 9/9 parity intact

### Phase 6: Native PDF Load ✅
Replace `pdf-lib.PDFDocument.load()` with native COS parser:
- [x] `NativeDocumentContext.fromLoadedPdf()` — static factory from parsed objects + trailer
- [x] `NativeDocumentContext.getPageList()` — page tree traversal with inherited property support (MediaBox, CropBox, Resources)
- [x] `NativeDocumentContext.resolveRef()` — COSObjectReference resolution
- [x] `PDFDocument.load()` tries native first, falls back to pdf-lib for exotic PDFs
- [x] `PDFPage` resource resolution for loaded pages — handles indirect Resources refs, single Contents refs
- [x] Signer bridge dual-mode: works with both `_nativeCtx` (native) and pdf-lib (legacy) documents
- [x] Replaced `PDFName/PDFNull/PDFRef` imports from pdf-lib in signer with COS types
- [x] Parser robustness: indirect `/Length` handling, 100KB size guard, tokenizer infinite-loop fix
- [x] `NativePDFWriter` strips trailing newline after `%%EOF` (matches pdf-lib for IncrementalWriteContext)
- [x] All 407 tests pass, 9/9 parity intact

### Phase 7: Demote pdf-lib to Optional peerDependency ✅
- [x] AcroForm parsing (native form field reading via NativeFormReader)
- [x] Native PDFForm dual-mode (getFields, getTextField, hasXFA, deleteXFA)
- [x] Native PDFTextField getText/setText via COS /V entry
- [x] Native PDFField getName/isReadOnly/isRequired/isExported
- [x] Demoted pdf-lib from `dependencies` to optional `peerDependencies`
- [x] Legacy-only methods throw helpful error guiding users to install pdf-lib
- [x] 715 tests pass (up from 407), 9/9 parity intact
- [x] Apps using create/load/sign/draw never pull in pdf-lib (saves 3.2 MB)

### Phase 7b: Native TrueType Font Embedding ✅
- [x] `TrueTypeParser` — minimal TTF parser (8 tables: head, hhea, hmtx, maxp, cmap, OS/2, post, name)
- [x] `CMapBuilder` — ToUnicode CMap stream generator (bfchar blocks of 100)
- [x] `FontFlags` — PDF font descriptor flags (FixedPitch, Serif, Nonsymbolic, Italic)
- [x] `NativeDocumentContext.embedCustomFont()` — creates 5 COS objects (FontFile2, FontDescriptor, CIDFont, ToUnicode, Type0)
- [x] `PDFFont._createNativeCustom()` — parses TTF, embeds Type0/CIDFontType2, custom metrics
- [x] `PDFDocument.embedFont(Uint8Array)` routes to native path
- [x] 2-byte glyph ID encoding (4 hex chars per character) via cmap lookup
- [x] Text measurement from hmtx advance widths, scaled by unitsPerEm
- [x] Rejects CFF/OpenType (OTTO), WOFF/WOFF2 with clear errors
- [x] 48 tests (parser, CMap, flags, integration, edge cases)
- [x] 763 tests pass, 9/9 parity intact
- [x] Phase 1: full font embedding only (no subsetting), BMP Unicode only (cmap format 4)

### Phase 7c: Font Subsetting ✅
- [x] `TrueTypeSubsetter.ts` — extracts used glyphs from TTF, rebuilds font tables
- [x] Integrated into `NativeDocumentContext.embedCustomFont()` with `subset: true` option
- [x] 33 tests (subset parser, glyph extraction, integration)

### Phase 7d: CFF/OpenType Font Support ✅
- [x] `CFFParser.ts` — parses OTTO-signature OpenType fonts (sfnt wrapper tables + CFF data extraction)
- [x] Wired into `PDFFont._createNativeCustom()` — creates Type0/CIDFontType0C with FontFile3
- [x] 40 tests (parser, cmap, metrics, name table, edge cases, integration)

### Phase 7e: copyPages() ✅
- [x] `CopyPages.ts` — deep-clone pages between PDFDocument instances
- [x] Full object graph remapping (COSDictionary, COSArray, COSStream, COSObjectReference)
- [x] Circular reference handling, inherited property support (/MediaBox, /CropBox, /Resources)
- [x] 26 tests

### Phase 8: Complete pdf-lib Removal ✅
- [x] Deleted `src/document/legacy.ts` import seam
- [x] Removed pdf-lib from peerDependencies and devDependencies
- [x] Rewrote all wrapper classes (PDFDocument, PDFPage, PDFFont, PDFImage, PDFForm, PDFEmbeddedPage) to native-only
- [x] Created `src/types/pdf-lib.d.ts` stub declarations for dead-code signer paths
- [x] Enhanced xref parser with scanning fallback for robustness
- [x] All tests rewritten to use native PDFDocument (no pdf-lib imports)
- [x] 1099 tests pass, 9/9 parity intact

---

### Enhanced Signature Verification ✅
- [x] ECDSA signature verification via `@noble/curves` (P-256, P-384, P-521)
- [x] Algorithm detection (`algorithm: 'RSA' | 'ECDSA' | 'unknown'`)
- [x] Certificate chain verification (`chainStatus: 'valid' | 'partial' | 'self-signed' | 'unknown'`)
- [x] Timestamp token verification (TSA signature + messageImprint, `TimestampInfo` interface)
- [x] DER-to-compact ECDSA signature conversion for `@noble/curves` v2
- [x] EC public key extraction from X.509 certificates (raw DER parsing)
- [x] `ChainStatus` and `TimestampInfo` types exported from `pdfbox-ts`

---

## Remaining Work

### ~~Priority 1: PDF Encryption & Decryption~~ DONE

- [x] **AES-128 and AES-256 encryption/decryption** — `src/pdfbox/crypto/` module
  - AES-128 (V=4, R=4, CFM=AESV2) and AES-256 (V=5, R=6, CFM=AESV3)
  - `PDFDocument.load(bytes, { password })` decrypts on load
  - `doc.save({ encrypt: { ownerPassword, keyLength, permissions } })` encrypts on save
  - Per-object key derivation, RC4 used only for password validation (R=4), never for content
  - RC4 and legacy ciphers throw descriptive errors
  - Permission flags (print, copy, modify, annotate, fillForms, extract, assemble, printHighQuality)
  - Empty user password = no password needed to open
  - Browser-compatible via node-forge (no Node.js crypto)
  - 40 tests, test harness encrypt/decrypt UI

### Priority 2: Known Limitation Burndown — ✅ COMPLETE

All 12 fixable corpus failures resolved via brute-force xref scanner + catalog/pages fallback resolution:

- [x] ~~**broken-xref (5 files)**~~ ✅ — Brute-force scanner fallback in `parseXrefEntries()`, safe-inflate for pako failures, ObjStm child extraction
- [x] ~~**malformed-catalog (5 files)**~~ ✅ — cosParser `\r` comment fix, header offset validation, supplementary object recovery, fallback catalog/pages resolution
- [x] ~~**page-tree-issue (2 files)**~~ ✅ — Xref offset validation (skip entries where header not found within 20 bytes), supplementary recovery for missing objects

Remaining (7 files, out of scope — PDF.js fuzz artifacts with exotic structures that crash COS parser):
- `bug1020226.pdf`, `bug1250079.pdf`, `bug1980958.pdf`, `issue15590.pdf`, `issue19800.pdf`, `issue6069.pdf`, `issue9105_other.pdf`

### ~~Priority 3: Form Field Appearance Generation~~ DONE

- [x] **Generate appearance streams for filled fields** — FieldAppearanceGenerator handles text fields, checkboxes, dropdowns
  - Text field: measure text, generate Tf/Td/Tj operators, handle multiline
  - Checkbox/radio: checkmark/circle appearances
  - Dropdown: text appearance with selected value
  - Wired into PDFTextField.setText() and PDFForm.flatten()
  - 27+ tests

### Native PDF Rendering (Strangler Fig for PDF.js)

Goal: Build a native rendering pipeline, eventually replacing PDF.js. See `docs/RENDERING_PLAN.md` for full architecture.

- [x] **Phase 0: Black-box wrapper** ✅ — `PDFRenderer` wraps PDF.js; `PDFDocument.renderPage()`; Node.js + browser; 15 tests
- [x] **Phase 1: Native Evaluator** ✅ — `evaluatePage()` produces OperatorList from COS objects; `NativeCanvasGraphics` renders to Canvas 2D; `NativeRenderer` wires pipeline; font resolution via FontDecoder; image decoding (Gray/RGB/CMYK/JPEG); Form XObject recursion; 27 tests
- [ ] **Phase 2: Native Color Spaces** — DeviceGray, DeviceRGB, DeviceCMYK, CalGray, CalRGB
- [ ] **Phase 3: Native Image Pipeline** — JPEG pass-through, PNG decode, inline images, SMask
- [ ] **Phase 4: Native Canvas Renderer** — Replace PDF.js CanvasGraphics with our own
- [ ] **Phase 5: Advanced Rendering** — Transparency groups, blend modes, soft masks, patterns, Type3 fonts
- [ ] **Phase 6: Delete PDF.js** — All rendering native, ~150KB gzipped

### Unified Element Model — THE PLAN

See `docs/ELEMENT_MODEL_PLAN.md` for full architecture. Shared element model enabling surgical redaction, interactive editing, and cross-format unification with opendockit (PPTX).

- [x] **Phase 1: Evaluator → PageElements** ✅ — `evaluatePageWithElements()` emits `PageElement[]` alongside OperatorList. Text runs with font/size/color/measured widths, shape extraction (rect/line/curve with fill/stroke), path segments with bounds, image dimensions + transform. New `src/elements/` types package. 21 tests, 1398 total.
- [x] **Phase 2: Redaction v2** ✅ — Spatial queries (11 functions), redaction preview (`getRedactionPreview` + `formatRedactionLog`), element-based redaction (`applyElementRedaction` surgical op-index removal + `redactContentByRect` one-liner). 79 new tests (spatial 42, redaction-preview 12, redact 13, integration 12). 1477 total.
- [x] **Phase 3: Interactive Canvas** ✅ — Headless state machine (`InteractionStore`): FSM (idle/selecting/marquee/drawing-rect), hover detection, click/shift-click/marquee selection, draw-rect-to-redact mode, coordinate conversion (viewport↔page), `useSyncExternalStore`-compatible subscribe/getSnapshot. Zero DOM deps. 56 new tests (coordinate-utils 13, interaction-store 43). 1533 total.
- [ ] **Phase 4: Text Editing** — `contenteditable` overlay for text elements. Write back to content stream.
- [ ] **Shared package extraction** — Extract `src/elements/` to `@dockit/elements` when opendockit is ready to consume.

### Other

- [ ] **Adobe Acrobat LTV validation** — Add LTV root CA to Acrobat trust store, verify DSS/OCSP/CRL appears in signature panel
- [ ] **Full-save byte parity** — Requires modifying Java signer to support full-save mode for comparison
- [ ] Capture Java outputs in CI once a JRE is available
- [ ] Configure `tsup` or `rollup` if dual ESM/CJS needed (plain `tsc` is fine for now)

### Completed Backlog

- [x] ~~**Trusted Redaction**~~ ✅ — PDAnnotationRedact + content stream redactor
- [x] ~~**Form Flattening on Sign**~~ ✅ — `flattenForms: true` option in SignatureOptions
- [x] ~~**PDF/A Compliance**~~ ✅ — PDF/A-1b and PDF/A-2b
- [x] ~~**PDF Content Extraction**~~ ✅ — Text + images with font decoding, stream decompression
- [x] ~~**XRef Parser Hardening**~~ ✅ — PNG predictor, hybrid-xref, CR line endings (1105/1105 corpus)

### Integration into pdf-signer-web

- [ ] Add integration branch in `pdf-signer-web` consuming the published package
- [ ] Delete `packages/pdf-core/src/pdfbox/**` from the app repo once dependency swap is stable
- [ ] Document upgrade instructions in `pdf-signer-web/docs/`
- See `docs/PDF_SIGNER_WEB_INTEGRATION.md` for detailed upgrade guide

---

## Guard Rails

- **Linearization**: Out of scope. PDF streaming/web-optimized output not planned.
- **BruteForceParser**: Not ported; needed for damaged PDF recovery.
- **Long-tail fuzz PDFs**: 8 PDF.js fuzz artifacts are out of scope (see "Known Limitation Burndown" above).

---

## Porting Strategy

Default to aggressive, full-scope mirroring of Java implementation. When unsure, mirror Java without shortcuts — prefer over-porting to under-porting. Document any intentional deviation.

## Success Criteria

1. ✅ All 9 fixtures match SHA256/ByteRange/startxref
2. ✅ All incremental tests pass
3. ✅ Adobe Acrobat validates signatures (signatureValidate = 4)
4. [ ] CI parity gate enabled and green
5. [ ] `structure-ts.txt` matches `structure-java.txt` for full-save fixtures
