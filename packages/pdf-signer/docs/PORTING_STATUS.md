# Porting Status

_Updated: 2026-02-16_

Component-level tracking of Java PDFBox → TypeScript port status. Covers COSWriter internals, full-save infrastructure, and core TS↔Java symbol mapping.

---

## COSWriter Component Checklist

| Java Component | Description | TS Status |
|----------------|-------------|-----------|
| `COSWriter.write(PDDocument, SignatureInterface)` | Entry point; orchestrates header/body/xref and signature injection | ✅ Partial — signer stitches pieces, COSWriter owns queue + serialization |
| `detectPossibleSignature` | Identifies `/Type /Sig` dicts to capture ByteRange/Contents offsets | ✅ Ported |
| `addObjectToWrite` / `writeObject` | Schedules indirect objects, maintains `objectKeys` | ✅ Queue + duplicate guards mirrored |
| `COSWriterObjectStream`, `COSWriterCompressionPool` | Packs eligible objects into `/ObjStm` | ✅ Implemented via `ObjectStreamPool`; incremental + full-save can pack |
| `PDFXRefStream` | Generates `/Type /XRef` streams with `/W`, `/Index`, Flate body | ✅ `buildXRefStream` mirrors PDFBox |
| `XReferenceEntry` hierarchy | xref entries + `fillGapsWithFreeEntries`, `getXRefRanges` | ✅ `XRefEntries.ts` handles normal/free/type2 |
| `doWriteXRefTable`, `doWriteXRefInc` | xref table/stream + trailer, `/Prev`, `/Size`, `/ID` | ✅ Full-save + incremental both handled |
| `RandomAccessRead`-backed `doWriteIncrement` | Copies original bytes, appends incremental section, ByteRange rewrite | ✅ Handled in `signPreparedPdfWithPDFBox` |
| `COSUpdateInfo` | Tracks mutated objects for incremental writer | ✅ Lightweight tracker wired into dicts/arrays |

### Remaining COSWriter Work

1. ~~Full document traversal~~ ✅ — `full-document-loader.ts` materializes all indirect objects
2. ~~Full-save orchestration~~ ✅ — `FullSaveWriter.ts` + `decideFullSaveMode()` switch; orphan scrubbing via `object-graph.ts`
3. **RandomAccessRead plumbing** — Align with PDFBox `ScratchFile` semantics for large PDFs (not needed for current fixtures)

---

## Full-Save Port Coverage

| PDFBox Component | TypeScript File | Status | Notes |
|------------------|----------------|--------|-------|
| `COSStandardOutputStream` | `COSStandardOutputStream.ts` | ✅ | Binary header, offset tracking, newline handling |
| `COSWriter` core | `COSWriter.ts` | ✅ | Object queue + signature offsets; unsupported branches throw |
| `ObjectNumberAllocator` / `COSObjectKey` | `ObjectNumberAllocator.ts`, `COSObjectKey.ts` | ✅ | Object-number reuse + free-list ported 1:1 |
| XRef builders | `XRefBuilder.ts`, `XRefWriter.ts`, `XRefStreamWriter.ts` | ✅ | Tables + `/Type /XRef` stream match Java |
| `/ObjStm` writer + compression pool | `ObjectStreamPool.ts`, `CompressionPool.ts` | ✅ | All 9 fixtures pass parity; Slides incremental path works |
| COS loader | `full-document-loader.ts` | ✅ | Loads raw + parsed objects including `/ObjStm` children |
| Patched signer behavior | `PDSignatureField.ts`, `pdfbox-signer.ts` | ✅ | Signature/catalog/page rewrites mirror Java incremental |
| `PDDocument.save` fallback | `FullSaveWriter.ts` + signer fallback | ✅ Complete | Writer ported; all 9 fixtures pass parity |
| Java harness observability | PatchedSignature logging | 🚧 Planned | Future verbose env-flag logging |

---

## Java Audit Checklist

When investigating parity issues, review these PDFBox classes and confirm TS matches:

| Java Class | What to Inspect | TS File |
|------------|-----------------|---------|
| `COSWriter#doWriteObject/Body/XRef` | Object order, signature tracking, CR/LF | `COSWriter.ts`, `FullWriteContext` |
| `COSWriterCompressionPool#createObjectStreams` | Which objects are packable during save | `CompressionPool.ts`, `ObjectStreamPool.ts` |
| `COSWriterObjectStream` | Header format, offsets, Flate compression | `ObjectStreamPool.ts` |
| `PDDocument.save` / `SaveVisitor` | Orphan scrubbing, `/ID`, DocMDP | `PatchedSignature.java`, `pdfbox-signer.ts` |
| `SigUtils.setMDPPermission` | `/Perms`, `/Reference`, DocMDP dicts | `pdfbox-signer.ts` |

---

## TS ↔ Java Symbol Mapping (P1 Core)

Status key: `mirrors` = complete, `partial` = functional but differs, `missing` = not ported, `custom` = TS-only

### Writer / IO

| TS Symbol | TS File | Java Class | Status | Notes |
|-----------|---------|------------|--------|-------|
| COSStandardOutputStream#write | COSStandardOutputStream.ts | COSStandardOutputStream.write | partial | Supports Uint8Array/number[] |
| COSStandardOutputStream#writeString | COSStandardOutputStream.ts | COSStandardOutputStream.writeString | mirrors | ISO-8859-1 enforced |
| IncrementalUpdateManager | IncrementalUpdateManager.ts | — | mirrors | allocate, registerOffset, setSignatureTracking |
| ObjectNumberAllocator#allocate | ObjectNumberAllocator.ts | — | mirrors | Present |
| XRefBuilder (all methods) | XRefBuilder.ts | — | mirrors | buildEntries, registerExisting, reserveObjectNumber, rewriteOffsets, trackSignature, writeEntries |
| RandomAccessBuffer | RandomAccessBuffer.ts | RandomAccessRead | partial | Bounds/exception semantics differ; read-only in signing path |
| COSInputStream | COSInputStream.ts | COSInputStream | mirrors | close, read, readBytes |

### Parser

| TS Symbol | TS File | Java Class | Status | Notes |
|-----------|---------|------------|--------|-------|
| parseCOSObject | cosParser.ts | COSParser.parseCOSObject | partial | Minimal; no decrypt |
| parseCOSStreamObject | cosParser.ts | COSParser.parseCOSStream | partial | Minimal; no decrypt/filter |
| loadRawIndirectObjects | full-document-loader.ts | COSParser / RandomAccessRead | partial | Uses xref offsets; no BruteForceParser |
| loadParsedIndirectObjects | full-document-loader.ts | COSParser | partial | Simplified parser |
| extractIndirectObject | object.ts | COSParser.parseObject | partial | Regex slice; lacks full robustness |
| DateConverter#parsePdfDate | object.ts | DateConverter | partial | Helper present; not full port |
| BruteForceParser | _(missing)_ | BruteForceParser | missing | Needed for damaged PDF recovery |
| COSParser (full) | _(missing)_ | COSParser | missing | Full parser absent |
| RandomAccessReadBufferedFile | _(missing)_ | RandomAccessReadBufferedFile | missing | Only in-memory buffers |

### COS Primitives

| TS Symbol | TS File | Java Class | Status | Notes |
|-----------|---------|------------|--------|-------|
| COSArray | COSTypes.ts | COSArray | partial | Basic add/get/size; no visitor/equals |
| COSDictionary | COSTypes.ts | COSDictionary | partial | Core set/get; missing merge/setDate |
| COSName | COSTypes.ts | COSName | partial | Basic + constants; missing full static set |
| COSInteger/Float/Boolean/Null | COSTypes.ts | — | partial | Core present; missing equals/hashCode |
| COSString | COSTypes.ts | COSString | partial | Literal/hex; missing encrypt/decrypt |
| COSObjectReference | COSTypes.ts | COSObject | partial | Reference wrapper; actual deref missing |
| Filters (ASCII85/Hex/CCITT/etc.) | _(missing)_ | Filter impls | missing | Only Flate supported |

### Signer Helpers

| TS Symbol | TS File | Java Class | Status | Notes |
|-----------|---------|------------|--------|-------|
| buildAcroFormUpdatePlan | object.ts | PDSignatureField/SigUtils | custom | TS helper; covers Java's field + form wiring |
| buildPageWidgetDictionary | object.ts | PDSignatureField | custom | Loosely mirrors widget build |
| buildCompressionPlan | CompressionPool.ts | COSWriterCompressionPool | custom | Heuristic selection; needs Java trace alignment |
| saveFullDocument | FullSaveWriter.ts | COSWriter.doWrite | partial | Core flow ported; ObjStm order diverges |
| writeFullDocumentForSignature | pdfbox-signer.ts | PDDocument.save | partial | Uses TS full-save; packing differs |
| computeRsaSignature | pdfbox-signer.ts | — | custom | Extracted RSA signing for TSA pre-computation |
| buildUnsignedAttributes | pdfbox-signer.ts | CMSProcessable | custom | id-aa-timeStampToken unsigned attr |
| fetchTimestampToken | tsa.ts | TSAClient | mirrors | RFC 3161 SHA-256 + certReq, no nonce |
| buildTimeStampReq | tsa.ts | TSAClient | mirrors | Version 1, SHA-256 MessageImprint |
| parseTimeStampResp | tsa.ts | TSAClient | mirrors | Status check + token extraction |
| PDSignature#setSignDate | _(missing)_ | PDSignature | missing | Dates set manually |
