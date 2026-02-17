# Module: OPC Package Reader (`@opendockit/core/opc`)

**Purpose:** Read Open Packaging Conventions (ZIP container + content types + relationships). Every OOXML file is an OPC package. This module opens the ZIP and provides lazy access to parts.

**Tier:** Fan-out 1 (depends on XML Parser)

**Inputs:** `ArrayBuffer | Blob` (the raw OOXML file bytes)

**Outputs:**
- `package-reader.ts` — `OpcPackageReader` class implementing `OpcPackage` interface:
  - `static open(data: ArrayBuffer | Blob, onProgress?): Promise<OpcPackage>`
  - `.getPart(uri: string): Promise<Uint8Array>` — lazy extraction
  - `.getPartText(uri: string): Promise<string>`
  - `.getPartRelationships(uri: string): Promise<RelationshipMap>`
  - `.listParts(): string[]`
  - `.resolveRelTarget(sourcePart, rel): string`
- `content-types.ts` — `ContentTypeMap` (parses `[Content_Types].xml`)
  - `.getType(partUri): string | undefined`
  - `.getPartsByType(contentType): string[]`
- `relationship-resolver.ts` — `RelationshipMap` (parses `_rels/*.rels`)
  - `.getById(id): Relationship | undefined`
  - `.getByType(type): Relationship[]`
- `part-uri.ts` — URI normalization and resolution utilities
- `index.ts` — barrel export

**Dependencies:**
- `jszip` (npm package) — ZIP extraction
- `../xml/` — for parsing content types and relationship XML

**Key reference:** `docs/architecture/OOXML_RENDERER.md` Part 3.1

**Design decisions:**
- **Lazy extraction** — don't decompress all parts on open. Only extract when `.getPart()` is called.
- Progress callbacks for unzip phase
- Cache decompressed parts in memory (don't re-extract from ZIP)

**Testing:** Open real PPTX/DOCX/XLSX files, verify part listing, content type resolution, relationship traversal. Create minimal test ZIP fixtures if real files aren't available.
