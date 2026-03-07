# PDFBox TypeScript Port (module overview)

This folder mirrors the Apache PDFBox components we rely on for deterministic signing:

- `writer/` – COS writers, xref table/stream builders, object-stream pool, full-write context
- `parser/` – trailer/xref/object loaders (including `/ObjStm` extraction)
- `pdmodel/` – PDAcroForm + signature-field helpers used by the signer
- `io/` – `RandomAccessBuffer`/`COSInputStream` utilities so we can re-read original PDFs

## Status snapshot (Feb 2026)

| Area | Notes |
| --- | --- |
| Incremental COSWriter stack | ✅ Byte-for-byte parity with PDFBox (all 9 fixtures) |
| Full-save writer (`saveFullDocument`) | ✅ Emits byte-identical headers/xrefs; all incremental fixtures pass |
| PDF parser / loader | ✅ Parses every indirect object (xref tables + `/ObjStm` children) |
| PDAcroForm / PDSignatureField helpers | ✅ DocMDP wiring, widget annotations, multi-user signing |
| PKCS#7 builder | ✅ Forge-based CMS builder with BER/DER toggle |
| Visual signatures | ✅ PNG embedding, appearance streams, Adobe Acrobat verified |

See `docs/PORTING_STATUS.md` for the full burndown and class-by-class audit plan. When adding new modules, keep this README updated so contributors know which portions of PDFBox already live here.
