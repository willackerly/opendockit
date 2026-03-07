# Current Implementation State

_Updated: 2026-02-27_

## Repository Status: CLEAN

```
Version: 1.0.0-beta.8
All 1565 fast tests pass (72 test files: 72 pass, 8 env-gated/skipped, ~4s)
All 9 fixtures pass byte-for-byte parity (SHA256 match)
Corpus: 1105/1105 pass (0 failures, 7 known-limitation, ~40min)
Counter-signature integrity FIXED — all signatures remain valid after counter-signing
Strangler Fig COMPLETE — pdf-lib fully removed (legacy.ts deleted, peerDependency removed)
Native PDF create/load/sign/draw — zero external PDF dependencies
PDF rendering — PDFRenderer wraps PDF.js (optional peer dep), 15 tests
Native rendering — NativeRenderer evaluates COS objects directly (no save→re-parse), 27 tests
PDF Encryption/Decryption — AES-128 and AES-256 (encrypt on save, decrypt on load with password)
Font subsetting — TrueType subsetter reduces font file size
CFF/OpenType font support — OTTO signature detection, CFF table extraction for FontFile3
copyPages() — deep-clone pages between documents with full object graph remapping
Trusted redaction — PDAnnotationRedact + content stream redactor (text/path/image removal)
Form flattening on sign — flattenForms option in SignatureOptions
PDF/A compliance — PDF/A-1b and PDF/A-2b with XMP metadata + sRGB ICC profile
PDF content extraction — text + images with position info, font decoding, stream decompression
PDF annotations — 12+ annotation types including Redact
Native form field creation + flattening
Form field appearance generation — text fields, checkboxes, dropdowns with visual appearance streams
removePage/insertPage — correctly update COS /Kids + /Count (save-safe)
removeField — removes from /Fields + page /Annots
setLanguage — sets /Lang on catalog dictionary
Signature verification API: RSA + ECDSA, certificate chain validation, timestamp token verification
GitHub Actions CI: typecheck + test + parity gate
LTV (Long-Term Validation) support with DSS dictionary + local CA/OCSP E2E testing
Zero Node.js built-ins in public API (browser-compatible)
```

Branch: `main`

---

## What's Working

1. **Incremental signing** — Byte-for-byte parity with Java PDFBox for all 9 fixtures
2. **Visual signatures** — Three appearance modes (hybrid/image-only/text-only), Dapple SafeSign branding with logo watermark, Adobe Acrobat verified (validate=4)
3. **Multi-user signing** — Counter-signatures with full integrity preservation (all signatures remain valid)
4. **CMS signature generation** — BER indefinite-length encoding matching Java PDFBox
5. **BER/DER toggle** — `PDFBOX_TS_CMS_DER=1` switches to DER encoding (default: BER for parity)
6. **Adobe Acrobat cert trust** — `signatureValidate()` returns 4 (VALID), blue "Certified" banner
7. **Adobe Acrobat automation** — `scripts/adobe-auto.py` with 17/17 diagnostic tests
8. **TSA timestamp support** — RFC 3161 timestamps via `timestampURL` option; tested with DigiCert
9. **Browser compatibility** — No `node:crypto` or `zlib` in public API; uses `node-forge` + `pako` (both already in deps)
10. **SDK documentation** — `docs/SDK_GUIDE.md` with full API reference and examples
11. **Robustness** — 1105-file corpus from 9 sources (PDFBox, PDF.js, qpdf, SafeDocs, pyHanko, OpenPreserve, PDF 2.0, IRS, GovDocs); xref stream PNG predictor, hybrid-xref, CR line endings, brute-force xref scanner fallback, safe-inflate, catalog/pages fallback resolution all handled
12. **E2E visual tests** — pdftoppm + pixelmatch snapshot tests (5 tests, env-gated)
13. **E2E Acrobat tests** — Adobe Acrobat signature validation via automation (3 tests, env-gated)
14. **LTV (Long-Term Validation)** — DSS dictionary with /Certs, /OCSPs, /CRLs, /VRI; OCSP/CRL fetchers; standalone or integrated via `enableLTV` option
15. **Full-save xref streams** — Self-entry per PDF spec 7.5.8; /W array, /Index ranges, deflate compression verified correct
16. **Native content stream builder** — Standalone PDF operator generator, no pdf-lib dependency; wired into signer appearance stream
17. **Native standard font metrics** — All 14 PDF standard fonts; width/height/kerning measurement cross-validated against pdf-lib to 6 decimal places; wired into PDFFont for automatic native measurement on standard fonts
18. **Text encoding + layout** — WinAnsi/Symbol/ZapfDingbats encoding tables; multi-line text layout with word wrap and alignment
19. **Native TrueType font embedding** — `embedFont(ttfBytes)` creates Type0/CIDFontType2 composite font with FontFile2, FontDescriptor, ToUnicode CMap — no pdf-lib needed; 48 tests
20. **PDF annotations** — 12 annotation types (Highlight, Underline, Strikeout, Squiggly, Text, FreeText, Stamp, Line, Square, Circle, Ink, Link) with appearance stream generation; 60 tests
21. **Native form field creation** — createTextField/createCheckBox/createDropdown/createOptionList/createRadioGroup/createButton with merged field+widget dicts, /AcroForm auto-creation, default resources; 56 tests
22. **Native form flattening** — flatten() bakes widget appearances into page content streams, preserves non-widget annotations, handles checkbox/radio state dicts; 31 tests
23. **Signature verification** — `verifySignatures()` checks integrity (SHA-256 content digest vs CMS MessageDigest) and authenticity (RSA + ECDSA via `@noble/curves`); certificate chain validation; timestamp token verification; multi-sig support; 29 tests
24. **Font subsetting** — TrueType subsetter (`subsetTrueTypeFont()`) extracts only used glyphs; reduces font file size significantly; 33 tests
25. **CFF/OpenType font support** — `parseCFFFont()` parses OTTO-signature OpenType fonts; extracts CFF data for FontFile3 embedding; sfnt table parsing (head, hhea, hmtx, cmap, OS/2, post, name); 40 tests
26. **copyPages()** — Deep-clone pages between PDFDocument instances; full object graph remapping (dicts, arrays, streams, refs); circular reference handling; inherited property support; 26 tests
27. **Trusted redaction** — `PDAnnotationRedact` annotation + `applyRedactions()` content stream redactor; spatial overlap detection; graphics state tracking (CTM, text matrix); text/path/image removal; 56 tests
28. **Form flattening on sign** — `flattenForms: true` option in `SignatureOptions`; flattens all form fields before signing; prevents post-signature modification
29. **pdf-lib fully removed** — `legacy.ts` deleted, pdf-lib removed from peerDependencies; all code paths are native COS-based; xref parser scanning fallback for robustness
30. **PDF/A compliance** — `pdfaConformance: 'PDF/A-1b' | 'PDF/A-2b'` option in `SaveOptions`; XMP metadata stream with pdfaid namespace; sRGB ICC profile; /OutputIntents on catalog; PDF version header adjustment (1.4 for PDF/A-1b, 1.7 for PDF/A-2b); 31 tests
31. **PDF content extraction** — `extractText()` and `extractImages()` for reading content from existing PDFs; full content stream state machine with all text operators (BT/ET, Tf, Tm, Td, TD, T*, Tj, TJ, ', ", Tc, Tw, Tz, Ts); font decoding (ToUnicode CMap, /Differences + Adobe Glyph List, named encodings); stream decompression (FlateDecode, LZW, ASCII85, ASCIIHex, RunLength, PNG/TIFF predictors); image extraction with JPEG pass-through and SMask alpha; text reconstruction with line/paragraph detection; 52 tests
32. **PDF Encryption/Decryption (AES only)** — AES-128 (V=4, R=4, CFM=AESV2) and AES-256 (V=5, R=6, CFM=AESV3); `PDFDocument.load(bytes, { password })` decrypts on load; `doc.save({ encrypt: { ownerPassword, keyLength } })` encrypts on save; per-object key derivation (MD5+sAlT for AES-128, direct key for AES-256); RC4/legacy ciphers throw descriptive error; permission flags (print, copy, modify, annotate); empty user password = no password needed to open; test harness encrypt/decrypt UI; 40 tests
33. **PDF rendering** — `PDFRenderer` class wraps PDF.js for page-to-PNG rendering; `PDFDocument.renderPage()` convenience method; works in Node.js (via `canvas` npm) and browser; `PDFRenderer.create(bytes)` / `.fromDocument(doc)` / `.renderPage(i)` / `.renderAllPages()` / `.destroy()`; lazy-imported so pdfjs-dist stays optional; 15 tests (signed PDFs, visual sigs, image sigs, counter-signed, created-from-scratch); exported via `pdfbox-ts/render` sub-path
34. **Native rendering (Phase 1)** — `NativeRenderer` evaluates COS objects directly to produce OperatorList → Canvas 2D rendering; no save→re-parse round-trip; `evaluatePage()` walks content streams with full operator support (graphics state, paths, text, color, XObjects, images); `NativeCanvasGraphics` renders OperatorList to Canvas; font resolution via FontDecoder + StandardFontMetrics fallback; image decoding (Gray/RGB/CMYK/JPEG passthrough); Form XObject recursion; visual comparison tests: < 0.12% mismatch vs PDF.js on text-based PDFs, pixel-perfect shapes/colors verified; 30 tests
35. **Element Model (Phase 1)** — `evaluatePageWithElements()` emits `PageElement[]` alongside OperatorList; tracks CTM, text matrix, font metrics, fill/stroke colors; extracts positioned text runs (with font name, size, measured width/height), shapes (rect/line/curve with fill/stroke colors), paths (moveTo/lineTo/curveTo with bounds), and images (with dimensions + transform); `getPageElements()` on NativeRenderer + standalone function; `src/elements/` types package with `./elements` sub-path export; 21 tests
36. **Element Model (Phase 2)** — Spatial queries (`queryElementsInRect`, `elementAtPoint`, `extractTextInRect`, `boundingBox`, etc.); redaction preview (`getRedactionPreview` + `formatRedactionLog`); element-based redaction (`applyElementRedaction` surgical op-index removal + `redactContentByRect` one-liner); integration tests with full round-trip (create → save → load → extract → query → redact); 79 new tests (spatial 42, redaction-preview 12, redact 13, integration 12)
37. **Element Model (Phase 3)** — Interactive canvas headless state machine (`InteractionStore`): FSM with 4 modes (idle/selecting/marquee/drawing-rect), hover detection via `elementAtPoint`, click/shift-click/marquee selection, draw-rect-to-redact mode with `rectDrawn` event, coordinate conversion (viewport↔page with Y-flip + scale), `useSyncExternalStore`-compatible `subscribe()`/`getSnapshot()`, semantic event subscription via `onEvent()`. Zero DOM dependencies — adapters are ~50 LOC leaves. 56 new tests (coordinate-utils 13, interaction-store 43).
38. **Hybrid Signature Appearance** — Three appearance modes (`hybrid`, `image-only`, `text-only`). Hybrid (default when PNG provided): signature squiggle left + branded info box right with "Digitally signed by [Name]", date, reason, location. Dapple geodesic logo watermark at 15% opacity behind text (alpha-aware). White text background for readability on colored pages. `brandText` option (default: "Dapple SafeSign"). `AppearanceMode` type exported. 9 new tests. 1565 total.

---

## What Changed Since beta.4 Release

### Native Rendering Phase 1: Native Evaluator

New native rendering pipeline that evaluates COS objects directly — no save→re-parse round-trip through PDF.js.

**New files:**
- `src/render/ops.ts` — OPS integer constants mirroring PDF.js (~60 constants)
- `src/render/operator-list.ts` — OperatorList container (fnArray/argsArray parallel arrays)
- `src/render/evaluator.ts` — Native content stream evaluator (~500 lines): walks page content streams, tokenizes, maps PDF operators to OPS codes, resolves fonts via FontDecoder, decodes images (Gray/RGB/CMYK/JPEG), handles Form XObjects recursively
- `src/render/canvas-graphics.ts` — NativeCanvasGraphics: renders OperatorList to Canvas 2D API (~400 lines); graphics state stack, text matrix tracking, glyph-by-glyph rendering, color space conversion, deferred clipping
- `src/render/NativeRenderer.ts` — High-level renderer: `fromDocument(doc)` / `fromPages()` / `renderPage()` / `renderAllPages()`; coordinate system transform (scale + Y flip); canvas creation for Node.js + browser
- `src/render/__tests__/native-evaluator.test.ts` — 30 tests covering OPS constants, OperatorList, evaluator on real PDFs, NativeRenderer integration, canvas graphics unit tests, visual comparison (native vs PDF.js < 1% mismatch), pixel spot-check for shapes/colors

**Integration:**
- `src/render/index.ts` — Updated with exports for NativeRenderer, renderPageNative, evaluatePage, OperatorList, OPS, NativeCanvasGraphics, NativeFont, Glyph, NativeImage types

**Test expansion: 1373 tests (up from 1344), 30 native evaluator tests (27 core + 3 visual)**

**Bug fixes in evaluator (be38c1f):**
- Font size parsing: `num(operands, 1)` → `num(operands, 0)` — Tf only has one number operand
- StandardFontMetrics fallback for fonts without /Widths array
- Color operator robustness: `setFillColor`/`setStrokeColor` infer type from properties when discriminant missing
- Known limitation: PDF.js on node-canvas can't render path ops (Path2D missing); native renderer handles correctly

### Element Model Phase 1: Evaluator → PageElements

Instrument the native evaluator to emit a structured `PageElement[]` array alongside OperatorList, enabling downstream element-based redaction, interactive editing, and cross-format unification.

**New files:**
- `src/elements/types.ts` — `PageModel` interface + `PageElement` union type (`TextElement`, `ShapeElement`, `PathElement`, `ImageElement`), with `BoundingBox`, `Color`, `PathSegment` types (145 LOC)
- `src/elements/index.ts` — Barrel export (33 LOC)
- `src/render/__tests__/element-extraction.test.ts` — 21 tests covering text extraction (position, font, size, color, measured width), shape extraction (rect, line, curve, fill/stroke colors), path extraction (moveTo/lineTo/curveTo segments, bounds), image extraction (dimensions, transform), multi-element pages, Form XObject recursion, color space handling

**Modified files:**
- `src/render/evaluator.ts` — Added CTM tracking, text matrix accumulation, font metrics resolution, fill/stroke color state, element emission hooks; new `evaluatePageWithElements()` entry point (+475 LOC)
- `src/render/NativeRenderer.ts` — Added `getPageElements(pageIndex)` method + standalone `getPageElements(pages, pageIndex)` function (+35 LOC)
- `src/render/index.ts` — New exports: `evaluatePageWithElements`, `getPageElements`, `PageModel`, `PageElement`, all element sub-types (+4 LOC)
- `src/index.ts` — Re-exports all element types from `src/elements/` (+19 LOC)
- `package.json` — Added `./elements` sub-path export pointing to `dist/elements/index.js` (+4 LOC)

**Test expansion: 1398 tests (up from 1384), 21 new element extraction tests**

### Element Model Phase 2: Spatial Queries + Element-Based Redaction

Build the query and redaction layers on top of Phase 1's PageElement[] output. Replaces point-in-rect approach with element-model queries for surgical content removal.

**New files:**
- `src/elements/spatial.ts` — 11 spatial query functions: `queryElementsInRect`, `queryTextInRect`, `elementAtPoint`, `boundingBox`, `extractTextInRect`, `elementToRect`, `rectsOverlap`, `pointInRect`, `rectIntersection`, `rectArea`, `overlapFraction` (~120 LOC)
- `src/elements/redaction-preview.ts` — `getRedactionPreview(elements, rect)` returns affected elements + human-readable summary; `formatRedactionLog(preview)` for console output (~110 LOC)
- `src/elements/redact.ts` — `applyElementRedaction(contentStream, elementsToRemove, redactionRects, options?)` for surgical op-index removal; `redactContentByRect(contentStream, pageDict, resolve, rects, options?)` high-level one-liner (~150 LOC)
- `src/elements/__tests__/spatial.test.ts` — 42 tests (overlap, hit testing, bounding box, text extraction, edge cases)
- `src/elements/__tests__/redaction-preview.test.ts` — 12 tests (preview generation, formatting, element descriptions)
- `src/elements/__tests__/redact.test.ts` — 13 tests (op removal, rect insertion, options, edge cases)
- `src/elements/__tests__/integration.test.ts` — 12 tests (full round-trip: create → save → load → extract elements → spatial query → redact)

**Modified files:**
- `src/elements/index.ts` — Updated barrel export with spatial, redaction-preview, redact re-exports
- `src/render/evaluator.ts` — Phase 1 hardening: text matrix advancement for consecutive Tj, TJ spacing, m/l/l/l/h rectangle detection, SVG path data

**Test expansion: 1477 tests (up from 1398), 79 new tests**

### PDF Rendering Module (Phase 0)

New `src/render/` module wraps PDF.js to render PDF pages to PNG. This is Phase 0 of the native rendering roadmap (see `docs/RENDERING_PLAN.md`).

**New files:**
- `src/render/PDFRenderer.ts` — Main renderer class with `create()`, `fromDocument()`, `renderPage()`, `renderAllPages()`, `destroy()`
- `src/render/canvas-factory.ts` — Environment-aware canvas creation (node-canvas in Node.js, native Canvas in browser)
- `src/render/types.ts` — `RenderOptions`, `RenderResult` interfaces
- `src/render/index.ts` — Barrel export (importable via `pdfbox-ts/render`)
- `src/render/__tests__/renderer.test.ts` — 15 tests covering raw bytes, scale, PDFDocument integration, signed/counter-signed/created PDFs

**Integration:**
- `PDFDocument.renderPage()` — Convenience method that lazy-imports `pdfbox-ts/render` (keeps pdfjs-dist optional)
- `package.json` — `pdfjs-dist` and `canvas` as optional peer dependencies; `./render` sub-path export
- `src/testing/visual-test-helpers.ts` — Added `renderPdfPageWithPdfjs()` and `renderAndCompare()` for pdftoppm vs PDF.js comparison
- `src/signer/__tests__/visual-rendering.test.ts` — Renderer comparison tests (env-gated)

**Test expansion: 1344 tests (up from 1329), 15 new renderer tests**

### Counter-Signature Integrity Fix (Incremental-Only Signing)

**Bug**: When counter-signing a PDF (User 1 signs, then User 2 signs), Signature 1's integrity broke because `preparePdfWithAppearance()` called `PDFDocument.load()` + `pdfDoc.save()`, which fully rewrote all bytes — invalidating Signature 1's ByteRange content digest.

**Fix**: Two-path architecture in `preparePdfWithAppearance()`:
- **First signature** (no existing sigs): Uses `preparePdfWithRewrite()` — full PDFDocument.load()+save() rewrite, preserving byte-for-byte parity with Java PDFBox on all 9 fixtures
- **Counter-signing** (existing sigs detected): Uses `preparePdfIncremental()` — returns ORIGINAL bytes unchanged, builds appearance stream entirely in Phase 2 incremental write

**Key changes:**
- `src/pdfbox/parser/object.ts` — Added `resolvePageObjectNumber()` for native page tree traversal (catalog → /Pages → /Kids → page by index)
- `src/signer/pdfbox-signer.ts` — Split `preparePdfWithAppearance()` into `preparePdfWithRewrite()` + `preparePdfIncremental()`. Phase 2 (`signPreparedPdfWithPDFBox`) now builds full text+rect OR image appearance streams with font dicts and PNG XObjects
- `PreparedPdf` interface: Removed `imageObjectNumber`/`imageWidth`/`imageHeight`, added `imageData`/`appearanceText`/`appearanceSignerText`
- Added `buildPngXObject()` helper for native PNG → PDF XObject conversion in Phase 2

**Test changes:**
- `signature-integrity.test.ts` — Removed KNOWN LIMITATION; double-sign expects BOTH sigs valid; triple-sign expects ALL THREE valid
- `visual-signature.test.ts` — Updated for new PreparedPdf interface (imageData instead of imageObjectNumber)

**Verification**: 1329 tests pass, 9/9 parity fixtures pass, counter-sign integrity verified

### Known Limitation Burndown: 12 Corpus Failures Fixed

All 12 fixable known-limitation corpus failures now sign successfully. Only 8 pdf-lib-parse-failure files remain (out of scope — PDF.js fuzz artifacts with exotic COS structures).

**New files:**
- `brute-force-scanner.ts` — Scans PDF bytes for `N G obj` patterns as fallback when xref parsing fails; `bruteForceXRefScan()`, `bruteForceToXRefEntries()`, `scanForCatalog()`
- `safe-inflate.ts` — Wraps pako.inflate with node:zlib fallback for streams pako can't handle
- `brute-force-scanner.test.ts` — 17 unit tests covering standard/CR/CRLF line endings, compact syntax, duplicates, generation numbers, integration scenarios

**Parser fixes:**
- `cosParser.ts` — `skipComment()` now handles `\r` as line terminator (fixed `list-of-uri-actions-with-base.pdf`)
- `xref.ts` — `parseXrefEntries()` wraps normal parsing in try-catch, falls back to brute-force scan; uses safe-inflate instead of raw pako
- `object.ts` — Uses safe-inflate for Object Stream decompression
- `full-document-loader.ts` — Enhanced with three recovery mechanisms:
  1. Full scanning recovery when catalog is missing (`hasCatalogDict()` check)
  2. Supplementary recovery: fills missing objects from brute-force scan
  3. Header offset validation: skip xref entries where `N G obj` not found within 20 bytes
  4. ObjStm child extraction during scanning mode
  5. Critical ref detection: `findMissingCriticalRefs()` for /Pages references
- `NativeDocumentContext.ts` — Fallback catalog/pages resolution via `_findObjectByType()` when root ref doesn't resolve

**Files fixed (by category):**
- broken-xref: `highlights.pdf`, `issue17147.pdf`, `issue8702.pdf`, `xref_command_missing.pdf`, `issue9252.pdf`
- malformed-catalog: `issue9105_reduced.pdf`, `issue10438_reduced.pdf`, `issue18986.pdf`, `list-of-uri-actions-with-base.pdf`, `issue9418.pdf`
- page-tree-issue: `minimal-annotless.pdf`, `issue17554.pdf`

**Test expansion: 1292 tests (up from 1273), 17 new brute-force scanner tests + 2 updated parser robustness tests**

### PDF Encryption & Decryption (AES Only)

Full AES-128 and AES-256 encryption/decryption support. RC4 and legacy ciphers throw descriptive errors naming the specific cipher/revision detected.

**New files (`src/pdfbox/crypto/`):**
- `SecurityHandler.ts` — Parses /Encrypt dictionary, validates cipher type, descriptive error messages
- `KeyDerivation.ts` — Password validation + file encryption key derivation (R=4 MD5-based, R=5/6 SHA-256/384/512 iterative)
- `AESCipher.ts` — AES-CBC encrypt/decrypt wrappers around node-forge
- `PDFDecryptor.ts` — Per-object decryption during document load (AES-128: per-object MD5 key, AES-256: direct key)
- `PDFEncryptor.ts` — Encrypt during save with permission flags and crypt filter dictionaries
- `index.ts` — Barrel export

**Integration:**
- `PDFDocument.load(bytes, { password })` — detects encryption, derives key, decrypts all objects in-place
- `PDFDocument.save({ encrypt: { ownerPassword, keyLength, permissions } })` — encrypts with clone-on-encrypt approach
- Empty user password tried automatically (common case: PDF opens without password)
- `doc.isEncrypted` / `doc.encryptionType` getters for inspection
- Signer guards updated with helpful error message guiding users to decrypt first

**Also fixed:** COS parser `consumeLiteralString()` now correctly handles PDF spec escape sequences (`\n`, `\r`, `\t`, octal `\053`, etc.) — previously all escapes were treated as literal next-character.

**Test expansion: 1273 tests (up from 1231), 40 new encryption tests**

### Signature Verification API

Enhanced `verifySignatures(pdfBytes)` function that verifies all digital signatures in a PDF:
- Locates signature fields via AcroForm → Fields → /FT /Sig → /V
- Extracts ByteRange content, computes SHA-256, compares with CMS MessageDigest (integrity)
- Re-encodes authenticated attributes as SET, verifies RSA or ECDSA signature (authenticity)
- **ECDSA support** via `@noble/curves` — P-256, P-384, P-521 with DER-to-compact conversion
- **Certificate chain validation** — walks from signer cert to root, verifying each link
- **Timestamp token verification** — parses RFC 3161 TSTInfo, verifies TSA signature + messageImprint
- Handles BER indefinite-length CMS (default pdfbox-ts encoding) and DER
- Extracts metadata: fieldName, signedBy (cert CN), signedAt, reason, location, algorithm, chainStatus, timestampInfo
- Returns `certificateDer` for downstream trust validation
- Multi-signature support: returns one result per signed field
- New types exported: `ChainStatus`, `TimestampInfo`
- 29 tests: round-trip, multi-sig, visual sig, tampered content, DER mode, ECDSA curves, EC key extraction, chain status, type shape, parity fixtures, pre-signed PDF

Also fixed `extractIndirectObjectAtOffset` to validate object number matches — prevents returning wrong object when xref entries point to corrupt offsets.

**Test expansion: 938 tests (up from 924)**

### Annotations, Form Field Creation & Form Flattening

Three features that no other open-source JS/TS library offers:

**PDF Annotations (12 types):**
- Base `PDAnnotation` class with /Type, /Subtype, /Rect, /Contents, /T, /M, /C, /F, /CA, /BS
- Text markup: Highlight (default yellow), Underline, Strikeout, Squiggly — with QuadPoints
- Notes: Text (sticky note with icon), FreeText (inline text with /DA)
- Shapes: Line (with endpoints), Square, Circle (with interior color), Ink (freehand paths)
- Other: RubberStamp (APPROVED, DRAFT, etc.), Link (URI action or named destination)
- Appearance stream generation for all types via ContentStreamBuilder
- `PDFPage.addAnnotation()` / `getAnnotationDicts()` for adding/reading annotations
- All annotation types exported from `src/document/annotations/` and re-exported from main index
- 60 tests: dict structure, QuadPoints, colors, flags, round-trip persistence, qpdf validation

**Native Form Field Creation (6 field types):**
- `PDFForm.createTextField/createCheckBox/createDropdown/createOptionList/createRadioGroup/createButton`
- Merged field+widget dictionaries (PDF spec §12.7.3.1) — no separate widget annotation needed
- `/AcroForm` auto-created on catalog with `/Fields`, `/DR` (default resources with Helvetica), `/DA`
- Checkbox: `/AP /N` with `/Yes` (checkmark path) and `/Off` (empty) appearance states
- Radio: `/Kids` array, per-option widget creation with circle appearances
- Dropdown: Combo flag (bit 18), `/Opt` array management
- Duplicate name detection with clear error messages
- 56 tests: dict structure, value round-trips, addToPage, AcroForm auto-creation, qpdf validation

**Native Form Flattening:**
- `PDFForm.flatten()` bakes widget appearance streams into page content
- Transform matrix calculation: `/BBox` → `/Rect` mapping with scale + translate
- State dict resolution for checkboxes/radios (picks `/AS` state from `/AP /N`)
- Non-widget annotations preserved during flattening
- `/AcroForm /Fields` cleared, `/NeedAppearances` removed
- 31 tests: all field types, multi-page, annotation preservation, edge cases, qpdf validation

**Test expansion: 910 tests (up from 763)**

### Strangler Fig Phase 7: pdf-lib Demoted to Optional peerDependency

pdf-lib moved from `dependencies` to optional `peerDependencies`. Apps using create/load/sign/draw never pull in pdf-lib (saves 3.2 MB). Native AcroForm field reading enables the fill-and-sign workflow without pdf-lib.

**Key changes:**
- `NativeFormReader.ts` — reads AcroForm fields from COS objects (readFields, getAcroFormDict, setNeedAppearances)
- `PDFForm.ts` — dual-mode: native read (getFields, getTextField, hasXFA, deleteXFA) + legacy create (createTextField etc.)
- `PDFField.ts` — dual-mode: wraps COS dict + ref for native, pdf-lib field for legacy
- `PDFTextField.ts` — native getText/setText via COS /V entry, sets /NeedAppearances for viewer re-rendering
- `package.json` — pdf-lib moved to peerDependencies (optional: true), kept in devDependencies
- Legacy-only methods (createTextField, flatten, addToPage, etc.) throw helpful error: "Install pdf-lib: pnpm add pdf-lib"

**Test expansion (715 tests, up from 407):**
- `native-form.test.ts` — 22 tests for NativeFormReader (hierarchical fields, field types, flags, UTF-16BE)
- `integration.test.ts` — 30 tests for create/save/load round-trips, real-world PDFs, error boundaries, cross-format verification
- `cos-parser-edge-cases.test.ts` — COS parser edge cases (hex strings, escapes, nested dicts)
- `parser-robustness.test.ts` — xref tables/streams, /Prev chains, object streams
- `builder-edge-cases.test.ts` — ContentStreamBuilder edge cases
- `font-edge-cases.test.ts` — font metrics edge cases for all 14 fonts
- `image-edge-cases.test.ts` — JPEG/PNG embedding edge cases
- `native-context-edge-cases.test.ts` — NativeDocumentContext edge cases
- `native-writer-edge-cases.test.ts` — NativePDFWriter edge cases
- `guards-extended.test.ts` — signer guard edge cases
- 715 tests pass, 18 skipped, 9/9 parity intact

### Strangler Fig Phase 6: Native PDF Load

`PDFDocument.load()` now uses the native COS parser by default, falling back to pdf-lib only for PDFs the parser can't handle (corrupt xref tables, exotic structures).

**Key changes:**
- `NativeDocumentContext.fromLoadedPdf()` — static factory that builds context from parsed objects + trailer
- `NativeDocumentContext.getPageList()` — page tree traversal with inherited property support (MediaBox, CropBox, Resources)
- `NativeDocumentContext.resolveRef()` — COSObjectReference resolution
- `PDFDocument.load()` tries `_loadNative()` first, falls back to `_loadLegacy()` (dynamic pdf-lib import)
- `PDFPage` resource resolution for loaded pages — handles indirect Resources refs, single Contents refs
- Signer bridge dual-mode: works with both `_nativeCtx` (native) and pdf-lib (legacy) documents
- Replaced `PDFName/PDFNull/PDFRef` imports from pdf-lib in signer with COS types

**Parser robustness fixes:**
- `extractStreamObject` handles indirect `/Length` references by scanning for `endstream` keyword
- `loadParsedIndirectObjects` strips stream content before fallback `parseCOSObject` (prevents OOM on binary data)
- 100KB size guard for non-stream object body parsing
- Tokenizer fix: unmatched `)` no longer causes infinite loop (zero-advance guard in `consumeIdentifier`)
- `NativePDFWriter` strips trailing newline after `%%EOF` to match pdf-lib behavior (critical for IncrementalWriteContext separator)

**Test updates:**
- `native-document.test.ts` — updated for Phase 6 (load returns native doc)
- `compat.test.ts` — form/copyPages tests skipped (Phase 7), context test verifies `_nativeCtx`
- `cross-validate.test.ts` — uses `PdfLibDocument` directly for font metric comparison
- 407 tests pass, 20 skipped, 9/9 parity intact

### Strangler Fig Phase 5: Native PDF Create/Save Pipeline
- `PDFDocument.create()` now returns a **native document** — completely bypasses pdf-lib
- New `NativeDocumentContext` — COS-level object registry (catalog, pages tree, info dict, object number allocation)
- New `NativePDFWriter` — serializes NativeDocumentContext to valid PDF bytes using COSWriter + XRefWriter
- `PDFDocument`, `PDFPage`, `PDFFont`, `PDFImage` all dual-mode: `_legacy?` (loaded docs) vs native COS objects (created docs)
- Native Type1 standard font embedding: font dict with `/Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding`
- Native JPEG embedding: parses SOF marker for dimensions, wraps as DCTDecode XObject
- Native PNG embedding: IHDR parsing, IDAT decompression/recompression, alpha channel splitting (SMask), FlateDecode with PNG Predictor 15
- Native graphics state creation (opacity/blend mode) via `NativeDocumentContext.createGraphicsState()`
- MediaBox uses COSFloat for non-integer page dimensions (A4: 595.28 x 841.89)
- All field wrappers updated with `!` assertions for legacy-only usage
- 47 new unit tests (`native-document.test.ts`) covering: isNative flag, metadata round-trip, page management, font embedding, image embedding, NativeDocumentContext internals, NativePDFWriter serialization, full create→draw→save→load pipeline
- Updated existing tests: compat.test.ts (form/copyPages/context tests use loaded docs), cross-validate.test.ts (loads legacy doc for pdf-lib font comparison), native-drawing.test.ts (valid PNG data, native-mode error handling)
- Apps using only `PDFDocument.create()` + standard fonts + drawing never load pdf-lib (tree-shaking eliminates 3.2 MB)

### Strangler Fig Phase 4: Native PDFPage Drawing
- `PDFPage.drawText/drawRectangle/drawSquare/drawLine/drawImage/drawEllipse/drawCircle` now generate operators via native `ContentStreamBuilder` instead of delegating to pdf-lib
- Content stream injection: raw bytes via `context.stream()` + `context.register()` + `node.addContentStream()`
- Resource registration: pdf-lib's low-level `newFontDictionary()`, `newXObject()`, `newExtGState()` for page resource management
- Per-page font/image key caching avoids duplicate resource registrations
- Graphics state creation matches pdf-lib's `maybeEmbedGraphicsState` exactly (ca/CA/BM)
- `drawSvgPath` and `drawPage` still delegate to pdf-lib (complex parsing, Phase 5+)
- `drawText` falls back to legacy when no font tracked (backward compat for auto-embed Helvetica)
- `PDFFont.encodeTextToHex()` — native hex encoding for standard fonts, legacy fallback for custom
- `ContentStreamBuilder.drawEllipse()` — Bézier curve ellipse approximation (KAPPA constant)
- Fixed `drawTextLines` to not emit `T*` after last line (matches pdf-lib exactly)
- Fixed `encodeTextToHex` to use uppercase hex (matches pdf-lib)
- 34 new unit tests (`native-drawing.test.ts`) + 1 visual rendering test (`native-drawing-visual.test.ts`)

### Strangler Fig Phase 2: Native Content Stream Builder
- New `src/document/content-stream/` module — zero pdf-lib dependencies
- `operators.ts`: 40+ pure functions (one per PDF operator) with `formatNumber()` matching pdf-lib's `numberToString` exactly
- `ContentStreamBuilder.ts`: Fluent builder wrapping all operators + 5 compound methods (`drawRect`, `drawLine`, `drawImage`, `drawTextLine`, `drawTextLines`) replicating pdf-lib's exact operator sequences
- Wired into `pdfbox-signer.ts`: Image appearance stream now uses `ContentStreamBuilder` (behavioral no-op; same operators)
- 64 new tests (operators + builder)

### Strangler Fig Phase 3: Native Standard Font Metrics
- New `src/document/fonts/` module — zero pdf-lib dependencies
- `encoding.ts`: WinAnsi (218 code points), Symbol (194), ZapfDingbats (203) encoding tables
- `StandardFontMetrics.ts`: Measurement API matching pdf-lib's `StandardFontEmbedder` exactly — `widthOfTextAtSize`, `heightAtSize`, `sizeAtHeight`
- `TextLayout.ts`: Multi-line text layout with word wrap and alignment
- 14 font data files under `data/` — generated via `scripts/extract-font-metrics.ts` from `@pdf-lib/standard-fonts`
- Cross-validation test proves native widths match pdf-lib to 6 decimal places for all 12 WinAnsi fonts, all test strings, all sizes
- Wired into `PDFFont.ts`: Standard fonts now use native metrics automatically; custom/embedded fonts fall back to pdf-lib
- Registration is lazy + cached — no runtime cost until a font is first used

### Bundle Optimization
- Added `"sideEffects": false` to `package.json` (enables tree-shaking)
- Added sub-path exports: `pdfbox-ts/content-stream` and `pdfbox-ts/fonts` for granular imports

---

## What Changed Since alpha.7 Release

### 100% Robustness Corpus Coverage (46 known-limitation bugs fixed)

All 46 previously failing files now sign successfully:

**acroform-in-objstm (16 files fixed)**: Added xref-aware `ObjectResolver` type in `object.ts`.
`createObjectResolver()` uses `COSDocumentState` xref entries to dispatch type-2 (ObjStm) objects
to `extractObjectFromObjectStream()`. Threaded resolver through `buildAcroFormUpdatePlan`,
`parseReferencedAcroForm`, `collectFieldObjects`, `detectDocMdp`, `detectCatalogDocMdp`,
`detectExistingSignatures`, and `inspectDocumentSignaturesInternal`. Accepts `Uint8Array | ObjectResolver`
for backward compatibility.

**missing-root-trailer (28 files fixed)**: Added `/Prev` chain walking in `trailer.ts`.
`parsePdfTrailer()` now detects xref table vs stream at startxref offset, finds the correct
trailer after the xref section, and walks `/Prev` chain when `/Root` is missing (common in
linearized PDFs). Added matching chain walking in `xref.ts:parseXrefEntries()` to merge entries
from earlier xref sections (later sections take precedence).

**unterminated-trailer-dict (2 files fixed)**: Fixed concatenated `obj<<` token handling in
`parseTrailerFromXrefStream`, `parseTrailerChainSection`, and `extractStreamObject` — the
`readToken()` function consumed `obj<<` as one token, leaving cursor past the `<<`. Also added
string literal `(...)` and comment `%` awareness to `findDictionaryEnd` and `findDictionaryEndBytes`
to prevent `<<`/`>>` inside strings from confusing depth counting.

### COS Parser Fix: PDF Delimiter Handling
- **Root cause**: `consumeName()` and `consumeIdentifier()` in `cosParser.ts` didn't treat `/` as a PDF delimiter
- **Effect**: Compact dictionary syntax like `/Filter/FlateDecode` or `36 0 R/Info` was tokenized incorrectly
- **Fix**: Added all PDF spec delimiters (`/`, `%`, `{`, `}`) to both `consumeName()` and `consumeIdentifier()`
- **Impact**: Linearized PDFs and PDFs with compact xref stream dictionaries now parse correctly
- All 9 parity fixtures unaffected (they already had whitespace between tokens)

### 1105-File Robustness Corpus
- Expanded `known-good-unsigned/` to 1105 PDFs from 9 sources
- Test harness classifies into 4 categories: signable, encrypted, malformed, known-limitations
- **Results**: 1105/1105 tests pass, 7 known-limitation (7 pdf-lib parse failures — all 13 fixable failures resolved via brute-force scanner)

### XRef Parser Hardening (321→0 corpus failures)
Three parser fixes resolved 309 corpus failures:
- **PNG predictor for xref streams**: Apply filter types 0-4 (None/Sub/Up/Average/Paeth) when `/DecodeParms` specifies Predictor 10-15
- **Hybrid-xref PDFs**: Handle PDFs with BOTH traditional xref table AND `/XRefStm` stream — merge entries from both sources
- **CR-only line endings**: Support `\r` (not just `\r\n` or `\n`) in xref table parsing for linearized PDFs from older software
- **Encrypted PDF detection**: Early rejection with clear error message before signing attempt

---

## Next Steps (in priority order)

### Strangler Fig: COMPLETE

All phases done. pdf-lib fully removed:
- ✅ Custom font embedding (Phase 7b)
- ✅ Font subsetting (reduces TTF file size)
- ✅ CFF/OpenType font support (OTTO detection, CFF extraction)
- ✅ copyPages() (deep-clone with object graph remapping)
- ✅ Delete legacy.ts (Phase 8 — pdf-lib removed from peerDependencies)

### Remaining Work

1. ✅ ~~**PDF/A compliance**~~ — Implemented (PDF/A-1b and PDF/A-2b)
2. ✅ ~~**PDF content extraction**~~ — Text + images with full state machine, font decoding, stream decompression
3. ✅ ~~**XRef parser hardening**~~ — PNG predictor, hybrid-xref, CR line endings (1105/1105 corpus)
4. ✅ ~~**Counter-signature integrity**~~ — Incremental-only signing preserves all earlier signatures
5. ✅ ~~**PDF rendering (Phase 0)**~~ — PDFRenderer wraps PDF.js, 15 tests, `pdfbox-ts/render` sub-path
6. ✅ ~~**Native rendering (Phase 1)**~~ — Native Evaluator producing OperatorList from COS objects; NativeRenderer + NativeCanvasGraphics; visual comparison < 0.12% mismatch vs PDF.js; 30 tests
7. ✅ ~~**Defect fixes (beta.6)**~~ — removePage/insertPage COS sync, removeField, setLanguage, stale try-catch removal

### Immediate Next Steps

1. ✅ ~~**Element Model Phase 1**~~ — `evaluatePageWithElements()` emits `PageElement[]` alongside OperatorList (text, shape, path, image extraction with positions, fonts, colors). 21 tests.

2. ✅ ~~**Element Model Phase 2 (Redaction v2)**~~ — Spatial queries, redaction preview, element-based redaction. Surgical content removal by operator index via `applyElementRedaction()`. Preview UX via `getRedactionPreview()` + `formatRedactionLog()`. High-level `redactContentByRect()` one-liner. 79 new tests. 1477 total.

3. ✅ ~~**Element Model Phase 3 (Interactive Canvas)**~~ — Headless state machine (`InteractionStore`) with FSM, hover/selection/marquee/draw-rect, coordinate conversion, `useSyncExternalStore` contract. Zero DOM deps. 56 new tests. 1533 total.

5. **Acrobat crash log monitoring** — `snapshotCrashLogs()` / `detectNewCrashes()` added to `src/testing/acrobat-test-helpers.ts` (code ready, not yet wired into test suite).

6. **Adobe Acrobat LTV validation** — Add LTV root CA to Acrobat trust store, verify DSS/OCSP shows in signature panel

---

## Certificate Trust: Manual One-Time Setup

Adobe Acrobat requires manual trust configuration for self-signed certs. Programmatic approaches (PPKLITE patching, folder-level JS, FDF import, UI automation) are all blocked by Acrobat's security model.

1. Open any PDF signed by pdfbox-ts in Adobe Acrobat
2. Click "Signature Panel" button (right sidebar)
3. Right-click the signature → "Show Signature Properties"
4. Click "Show Signer's Certificate" (or "Certificate" tab)
5. Select "pdfbox-ts Fixture" certificate
6. Click "Trust" tab → "Add to Trusted Certificates"
7. Check "Use this certificate as a trusted root"
8. Check "Certified documents" and "Signed documents"
9. Click OK

After this, all pdfbox-ts signatures will show as "Valid" (blue "Certified" banner, `signatureValidate()` = 4).

**Status**: Trust configured on this machine. Verified with wire-instructions and simple-test fixtures.

## Useful Commands

```bash
# ── Testing tiers (see CLAUDE.md "Testing Tiers" for full docs) ──
pnpm test                                    # Tier 1: Fast tests (~2s, every commit)
pnpm compare -- --all                        # Tier 2: 9-fixture parity (~10s)
pnpm test:corpus                             # Tier 3: 1000+ PDF corpus (~10min, pre-release)
pnpm test:all                                # All tiers: unit + corpus
pnpm test:visual                             # Tier 4: Visual rendering snapshots
pnpm test:acrobat                            # Tier 4: Adobe Acrobat validation
pnpm test:ltv                                # Tier 4: LTV E2E (needs local OCSP)

# ── Specific test files ──
pnpm test -- tsa                             # TSA timestamp tests
pnpm test -- visual-signature                # Visual sig tests
pnpm test -- multi-signature                 # Multi-sig tests
TSA_URL=http://timestamp.digicert.com pnpm test -- tsa-live  # Live TSA test

# ── Parity harness ──
pnpm compare -- --all --skip-java            # All 9 parity fixtures (no JRE)
pnpm parity:report                           # Parity summary

# ── Tools ──
python3 scripts/adobe-auto.py diagnose       # Test Adobe automation (17 tests)
python3 scripts/adobe-auto.py validate <pdf> # Full validation workflow
qpdf --check <pdf>                           # Validate PDF structure
```
