# Module: PDF (`@opendockit/pdf`)

**Purpose:** Public PDF document engine for OpenDocKit. A thin re-export layer that surfaces the general-purpose PDF functionality from `@opendockit/pdf-signer` while deliberately excluding signing-specific code (PKCS#7, CMS, TSA, LTV, verification). Consumers that only need PDF creation, rendering, parsing, or editing should depend on this package rather than `@opendockit/pdf-signer` directly.

**Dependencies:** `@opendockit/pdf-signer` (workspace peer)

**Peer dependencies:** `pdfjs-dist >= 4.0.0` (optional, for `./render`), `canvas >= 2.0.0` (optional, Node.js rendering)

## Entry Points

The package exports multiple sub-paths. Import only what you need.

### `@opendockit/pdf` (main)

Full document API: create, load, modify, save, embed fonts/images/pages, form fields, annotations, content stream building, redaction, PDF/A compliance, content extraction, encryption/decryption, page copying, CFF/TrueType font parsing and subsetting.

Key classes: `PDFDocument`, `PDFPage`, `PDFFont`, `PDFImage`, `PDFEmbeddedPage`, `PDFForm`

Form field classes: `PDFField`, `PDFTextField`, `PDFCheckBox`, `PDFRadioGroup`, `PDFDropdown`, `PDFOptionList`, `PDFButton`, `PDFSignature`

Annotation classes: `PDAnnotation`, `PDAnnotationHighlight`, `PDAnnotationUnderline`, `PDAnnotationStrikeout`, `PDAnnotationSquiggly`, `PDAnnotationText`, `PDAnnotationFreeText`, `PDAnnotationRubberStamp`, `PDAnnotationLine`, `PDAnnotationSquare`, `PDAnnotationCircle`, `PDAnnotationInk`, `PDAnnotationLink`, `PDAnnotationRedact`

Encryption: `PDFEncryptor`, `PDFDecryptor`, `computePermissions`, `parsePermissions`, `parseEncryptionDict`, `getEncryptionDescription`, `validateEncryption`

Color factories: `rgb`, `cmyk`, `grayscale` — Rotation factories: `degrees`, `radians`

Enums: `StandardFonts`, `ParseSpeeds`, `BlendMode`, `LineCapStyle`, `TextRenderingMode`, `TextAlignment`, `ImageAlignment`, `PageSizes`

Field appearance generators: `generateTextFieldAppearance`, `generateCheckBoxAppearance`, `generateDropdownAppearance`, `generateAllFieldAppearances`

**Explicitly excluded** (only available from `@opendockit/pdf-signer`): `signPDFWithPDFBox`, `preparePdfWithAppearance`, `signPreparedPdfWithPDFBox`, `fetchTimestampToken`, `addLtvToPdf`, `verifySignatures`, `PDFBOX_TS_VERSION`

### `@opendockit/pdf/render`

PDF page rendering via pdf.js or native Canvas2D graphics.

| Export | Description |
| --- | --- |
| `PDFRenderer` | High-level renderer class |
| `renderPage(page, canvas, options?)` | Render a PDF page to a canvas element |
| `NativeRenderer` | Canvas2D renderer that does not require pdf.js |
| `renderPageNative(page, ctx, options?)` | Render via `NativeRenderer` |
| `evaluatePage(page, options?)` | Evaluate page operators without rendering |
| `evaluatePageWithElements(page, options?)` | Evaluate and extract element model |
| `getPageElements(page)` | Extract `PageElement[]` from a PDF page |
| `OperatorList` / `OPS` | Low-level operator list types |
| `NativeCanvasGraphics` | Internal graphics state machine |
| Types: `RenderOptions`, `RenderResult`, `NativeFont`, `Glyph`, `NativeImage` | |

### `@opendockit/pdf/elements`

Unified element model for PDF pages (spatial queries, element model types, interaction store, coordinate transforms, redaction helpers).

| Export | Description |
| --- | --- |
| Types: `PageModel`, `PageElement`, `TextElement`, `ShapeElement`, `ImageElement`, `PathElement`, `GroupElement`, `PdfSource`, `PptxSource`, `Paragraph`, `TextRun`, `Fill`, `Stroke`, `Color`, `Rect` | Element model types |
| `queryElementsInRect`, `queryTextInRect`, `elementAtPoint`, `boundingBox`, `extractTextInRect`, `elementToRect`, `rectsOverlap`, `pointInRect`, `rectIntersection`, `rectArea`, `overlapFraction` | Spatial query functions |
| `InteractionStore` | UI interaction state manager |
| `viewportToPage`, `pageToViewport`, `pageRectToViewport`, `viewportRectToPage` | Coordinate system conversions |
| `getRedactionPreview`, `formatRedactionLog`, `applyElementRedaction`, `redactContentByRect` | Element-level redaction helpers |

### `@opendockit/pdf/extraction`

Text and image content extraction.

Key exports: `extractText`, `extractTextContent`, `extractImages`, `extractPageText`, `extractPageImages`, `joinTextItems`, `loadAndParseDocument`, `parseToUnicodeCMap`, `buildFontDecoder`, `glyphNameToUnicode`, `getDecompressedStreamData`, `getRawStreamData`, `getStreamFilters`

### `@opendockit/pdf/annotations`

Annotation class and type re-exports. Same set as in the main entry point but importable independently.

### `@opendockit/pdf/redaction`

Content stream redaction: `applyRedactions`, `tokenizeContentStream`, `parseOperations`

### `@opendockit/pdf/pdfa`

PDF/A compliance: `applyPDFAConformance`, `generateXMPMetadata`, `buildSRGBICCProfile`

### `@opendockit/pdf/content-stream`

Low-level PDF content stream building: `ContentStreamBuilder`, `formatNumber`

### `@opendockit/pdf/fonts`

Font metrics, encoding, layout, and subsetting: `StandardFontMetrics`, `WinAnsiEncoding`, `SymbolEncoding`, `ZapfDingbatsEncoding`, `encodingForFont`, `encodeTextToHex`, `layoutMultilineText`, `parseCFFFont`, `subsetTrueTypeFont`, `TextAlignment`

## Test Coverage

24 tests in 1 test file (`exports.test.ts`). These are smoke tests that verify the re-export wiring is correct: each test imports a sub-path and asserts that expected symbols are defined. The tests also assert that signing-only APIs (`signPDFWithPDFBox`, etc.) are absent from the main entry point.

## Known Issues

- This package is a pure re-export layer. All business logic lives in `@opendockit/pdf-signer`. If a bug is found here, it almost certainly originates there.
- `pdfjs-dist` and `canvas` are optional peer dependencies. The `./render` sub-path requires one or both depending on the rendering strategy. Missing peers produce runtime errors only when rendering is attempted, not at import time.
