# Test PDF Repository

Automated pre-flight test suite for PDF signing validation.

## Directory Structure

```
test-pdfs/
├── manifest.json           # Test case definitions and metadata
├── working/                # PDFs that should sign successfully
│   ├── wire-instructions.pdf
│   ├── test-document.pdf
│   ├── simple-test.pdf
│   └── wire-instructions-signed.pdf
├── edge-cases/             # PDFs we expect to fail (with known errors)
│   └── simple-test-signed-broken.pdf
└── future/                 # PDFs we want to support later
```

## Test Cases

See `manifest.json` for complete test case definitions.

### Working PDFs (should succeed)

| File | Description | Tags |
|------|-------------|------|
| `wire-instructions.pdf` | Original POC test PDF | `poc`, `simple`, `letter` |
| `test-document.pdf` | Created with pdf-lib, has content | `pdf-lib`, `content` |
| `simple-test.pdf` | Minimal test PDF | `minimal`, `simple` |
| `wire-instructions-signed.pdf` | Pre-signed, for validation testing | `signed`, `validation` |
| `chrome-google-docs/complex-with-images-chrome-print.pdf` | Chrome “Print to PDF” export | `chrome`, `object-stream`, `images` |
| `chrome-google-docs/text-with-images-google-docs.pdf` | Google Docs export with inline imagery | `google-docs`, `multi-page` |
| `chrome-google-docs/complex-presentation-google-docs.pdf` | Google Slides deck (forces full-save) | `google-slides`, `full-save`, `objstm` |

### Edge Cases (expected to fail)

| File | Description | Expected Error |
|------|-------------|----------------|
| `simple-test-signed-broken.pdf` | Broken signature structure | Validation failure |

## Adding New Test PDFs

1. Drop PDF into appropriate directory (`working/`, `edge-cases/`, or `future/`)
2. Update `manifest.json` with test case metadata:
   ```json
   {
     "id": "unique-test-id",
     "file": "working/your-pdf.pdf",
     "expectedStatus": "supported|experimental|unsupported",
     "properties": {
       "version": "1.4",
       "pages": 1,
       "objects": 10,
       "pageSize": "Letter|A4|Custom",
       "encrypted": false,
       "linearized": false,
       "hasSignatures": false
     },
     "expectedOutcome": "success|failure|already-signed",
     "notes": "Why this PDF is interesting",
     "tags": ["tag1", "tag2"]
   }
   ```
3. Run pre-flight tests to verify

## Running Tests

```bash
# Harness smoke test
pnpm test

# Targeted parity run (both Java + TS)
JAVA=/opt/homebrew/opt/openjdk@21/bin/java pnpm compare -- --fixture google-docs-presentation-large

# TypeScript-only comparison
pnpm compare -- --fixture wire-instructions --skip-java
```

## Test Outcomes

- ✅ **PASS** - PDF signed successfully, outcome matches expectation
- ❌ **FAIL** - PDF signing failed unexpectedly, or outcome doesn't match
- ⚠️ **UNEXPECTED** - PDF behavior different from manifest (update manifest or fix code)

## Manifest Schema

See `manifest.json` for full schema.

Key fields:
- `expectedStatus`: What compatibility level we expect (supported, experimental, unsupported)
- `expectedOutcome`: What should happen (success, failure, already-signed, validation-failure)
- `properties`: PDF structure details from analyzer
- `notes`: Why this test case matters
- `tags`: Searchable labels

## Future Test PDFs

As we expand compatibility, add PDFs to `future/` directory:
- Multi-page PDFs (10+, 100+ pages)
- Different page sizes (A4, Legal, Tabloid)
- PDFs with existing forms (AcroForm)
- PDFs with existing signatures (countersigning)
- Linearized PDFs (web-optimized)
- PDF 1.5-1.7 with various features
- Complex page trees
- Compressed object streams

**Don't add encrypted PDFs** - we won't support them (by design).

## Breadcrumbs 🍞

Each test case in `manifest.json` leaves breadcrumbs:
- **What** - Which PDF, what structure it has
- **Why** - Why this test case matters
- **Expected** - What should happen
- **Actual** - What actually happened (in test results)

This helps future developers understand:
1. What PDFs we've tested
2. What edge cases we know about
3. What works vs what doesn't
4. When something breaks, what changed

## Test Statistics

Current coverage (manifest-driven):
- **Total test cases**: 10 (9 working + 1 edge case)
- **Working PDFs**: 9 — all pass byte-for-byte parity (SHA256 match with Java PDFBox)
- **Edge cases**: 1 (broken signature, expected failure)

Every `pnpm compare` run captures `ts.json`/`java.json`/`structure-*.txt` outputs so parity reviews have historical breadcrumbs.
