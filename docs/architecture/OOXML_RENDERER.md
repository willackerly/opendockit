# OpenDocKit: Unified OOXML Renderer Architecture

## Executive Summary

OpenDocKit is a progressive-fidelity, client-side renderer for OOXML documents (PPTX,
with clean fork points for DOCX and XLSX). The architecture separates **shared OOXML
infrastructure** from **format-specific document models** and **format-specific layout
engines**, enabling significant code reuse while respecting the fundamentally different
rendering paradigms of presentations, documents, and spreadsheets.

---

## Part 1: Should We Design for DOCX/XLSX From Day 1?

### The Short Answer

**Yes, but surgically.** There is a substantial shared core (~40% of total code) that
should be designed format-agnostic from the start. But the document model and layout
engine for each format are fundamentally different and should NOT be prematurely
abstracted. The danger is building a leaky "universal document" abstraction that makes
all three formats worse.

### The OOXML Sharing Matrix

Here's the actual overlap based on the ECMA-376 spec structure:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SHARED ACROSS ALL THREE                       │
│                                                                   │
│  OPC (Open Packaging Conventions)                                │
│    - ZIP container handling                                       │
│    - [Content_Types].xml parsing                                 │
│    - _rels/*.rels relationship resolution                        │
│    - Part URI resolution                                         │
│                                                                   │
│  DrawingML Core (xmlns:a)                          §20.1          │
│    - Shape properties (a:spPr)                                   │
│    - Preset geometries (a:prstGeom)                              │
│    - Custom geometries (a:custGeom)                              │
│    - Fills (solid, gradient, pattern, picture)                   │
│    - Line/outline (a:ln)                                         │
│    - Effects (shadow, glow, reflection, 3D)                      │
│    - Transforms (a:xfrm — offset, extent, rotation, flip)       │
│    - Non-visual properties (cNvPr, cNvSpPr)                      │
│                                                                   │
│  DrawingML Text (xmlns:a)                          §21.1          │
│    - Paragraphs (a:p) and runs (a:r)                             │
│    - Character properties (a:rPr — bold, italic, font, size)    │
│    - Paragraph properties (a:pPr — alignment, spacing, indent)  │
│    - Bullets and numbering (a:buFont, a:buChar, a:buAutoNum)     │
│    - Text body properties (a:bodyPr — wrap, autofit, columns)   │
│                                                                   │
│  DrawingML Pictures (xmlns:pic)                    §20.2          │
│    - pic:pic, pic:blipFill, a:blip                               │
│    - Crop, stretch, tile                                         │
│                                                                   │
│  DrawingML Charts (xmlns:c)                        §21.2          │
│    - Chart types, series, axes, legends                          │
│    - Chart data extraction                                       │
│                                                                   │
│  DrawingML Diagrams/SmartArt (xmlns:dgm)           §21.4          │
│    - Diagram data, layout, style, colors                         │
│                                                                   │
│  Theme (xmlns:a — theme1.xml)                                    │
│    - Color schemes (a:clrScheme)                                 │
│    - Font schemes (a:fontScheme)                                 │
│    - Format schemes (a:fmtScheme)                                │
│    - Background fill styles                                      │
│                                                                   │
│  Shared MLs                                                       │
│    - Core properties (dc:title, dc:creator, etc.)                │
│    - App properties (docProps/app.xml)                            │
│    - Custom properties                                           │
│    - EMU/DXA/half-point unit conversions                         │
│    - Color resolution (schemeClr, srgbClr, hslClr, sysClr)      │
│    - Hyperlink handling                                          │
│    - Embedded object references                                  │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│              DIVERGENT: Placement / Anchoring                     │
│                                                                   │
│  PPTX: Shapes are direct children of <p:spTree>                 │
│        Absolute positioning within slide canvas                   │
│        Master → Layout → Slide inheritance                       │
│        xmlns:p namespace                                         │
│                                                                   │
│  DOCX: Shapes wrapped in <w:drawing> → <wp:inline>|<wp:anchor>  │
│        Inline (in text flow) or floating (anchored to page)      │
│        Text wrapping modes (tight, square, through, etc.)        │
│        xmlns:w + xmlns:wp namespaces                             │
│        Also: legacy VML via <mc:AlternateContent>                │
│                                                                   │
│  XLSX: Shapes in separate drawing part (drawing1.xml)            │
│        Anchored to cells via <xdr:twoCellAnchor>                 │
│        or absolute via <xdr:absoluteAnchor>                      │
│        xmlns:xdr namespace                                       │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│              DIVERGENT: Document Model                            │
│                                                                   │
│  PPTX: Slides, masters, layouts, notes                           │
│        PresentationML (§19)                                      │
│        Fixed-size canvas (slide dimensions)                      │
│        No text reflow between slides                             │
│                                                                   │
│  DOCX: Sections, pages, paragraphs, tables, lists                │
│        WordprocessingML (§17)                                    │
│        FLOWING layout — content reflows across pages             │
│        Headers/footers, footnotes, TOC, fields                   │
│        Track changes, comments, bookmarks                        │
│        Styles cascade (document defaults → styles → direct)      │
│                                                                   │
│  XLSX: Workbook, sheets, rows, cells, formulas                   │
│        SpreadsheetML (§18)                                       │
│        GRID layout — cells positioned by row/column              │
│        Cell formatting, conditional formatting                    │
│        Shared strings table, named ranges                         │
│        Pivot tables (massive complexity)                          │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│              DIVERGENT: Text Model                                │
│                                                                   │
│  PPTX: Uses DrawingML text (a:p, a:r, a:rPr)                    │
│        Text in shapes/text boxes only                            │
│        Auto-fit (shrink, resize shape)                           │
│        Columns in text body                                       │
│                                                                   │
│  DOCX: Uses WordprocessingML text (w:p, w:r, w:rPr)             │
│        COMPLETELY DIFFERENT from DrawingML text                   │
│        Different element names, different semantics               │
│        Runs, complex fields, structured doc tags                  │
│        Sections, page breaks, columns (section-level)            │
│                                                                   │
│  XLSX: Cell values (strings via shared string table)             │
│        Rich text in cells uses r:rPr (yet another variant)       │
│        Minimal text layout (single-cell wrapping)                │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│              DIVERGENT: Layout Engine                              │
│                                                                   │
│  PPTX: TRIVIAL — absolute positioning on fixed canvas            │
│        No reflow. Each slide is independent.                     │
│        This is why we start here.                                │
│                                                                   │
│  DOCX: HARD — full page layout engine                            │
│        Paragraph/line breaking, widow/orphan control             │
│        Table layout algorithm, cell merging                       │
│        Float positioning, text wrapping                           │
│        Multi-column sections                                     │
│        Header/footer with page numbers                           │
│        THIS IS THE HARDEST LAYOUT PROBLEM IN COMPUTING           │
│                                                                   │
│  XLSX: MEDIUM — grid layout with variable row/col sizes          │
│        Cell merging, overflow into adjacent cells                 │
│        Frozen panes, split views                                 │
│        Conditional formatting evaluation                          │
│        Auto-filter dropdowns                                     │
└─────────────────────────────────────────────────────────────────┘
```

### The Architectural Principle

**Shared core handles DrawingML — format-specific layers handle everything else.**

```
                        ┌─────────────────────┐
                        │   @opendockit/core   │
                        │                     │
                        │  OPC / ZIP          │
                        │  DrawingML parser   │
                        │  DrawingML renderer │
                        │  Theme engine       │
                        │  Chart engine       │
                        │  Color resolver     │
                        │  Unit conversions   │
                        │  Capability registry│
                        │  WASM loader        │
                        └────────┬────────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
    ┌───────────▼──┐   ┌────────▼───────┐  ┌─────▼──────────┐
    │ @opendockit/  │   │ @opendockit/   │  │ @opendockit/   │
    │ pptx          │   │ docx           │  │ xlsx           │
    │               │   │                │  │                │
    │ PresentationML│   │ WordprocessML  │  │ SpreadsheetML  │
    │ parser        │   │ parser         │  │ parser         │
    │               │   │                │  │                │
    │ Slide model   │   │ Document model │  │ Workbook model │
    │ Slide layout  │   │ Page layout    │  │ Grid layout    │
    │ engine        │   │ engine         │  │ engine         │
    │               │   │                │  │                │
    │ SlideViewport │   │ PageViewport   │  │ SheetViewport  │
    └──────────────┘   └────────────────┘  └────────────────┘
```

---

## Part 2: Package Structure

### Monorepo with Package Boundaries

```
opendockit/
├── packages/
│   ├── core/                          # @opendockit/core
│   │   ├── src/
│   │   │   ├── opc/                   # Open Packaging Conventions
│   │   │   │   ├── package-reader.ts       # ZIP + content types + rels
│   │   │   │   ├── relationship-resolver.ts
│   │   │   │   ├── content-types.ts
│   │   │   │   └── part-uri.ts
│   │   │   │
│   │   │   ├── drawingml/             # DrawingML parser + renderer
│   │   │   │   ├── parser/
│   │   │   │   │   ├── shape-properties.ts    # a:spPr → ShapePropertiesIR
│   │   │   │   │   ├── text-body.ts           # a:txBody → TextBodyIR
│   │   │   │   │   ├── paragraph.ts           # a:p → ParagraphIR
│   │   │   │   │   ├── run.ts                 # a:r → RunIR
│   │   │   │   │   ├── fill.ts                # solid/gradient/pattern/picture
│   │   │   │   │   ├── line.ts                # a:ln → LineIR
│   │   │   │   │   ├── effect.ts              # shadow, glow, reflection
│   │   │   │   │   ├── transform.ts           # a:xfrm → TransformIR
│   │   │   │   │   ├── picture.ts             # pic:pic → PictureIR
│   │   │   │   │   └── group.ts               # a:grpSp → GroupIR
│   │   │   │   │
│   │   │   │   ├── geometry/
│   │   │   │   │   ├── preset-geometries.ts   # All 200+ preset shape definitions
│   │   │   │   │   ├── shape-guide-eval.ts    # Formula evaluator for guides
│   │   │   │   │   ├── path-builder.ts        # Guide results → canvas paths
│   │   │   │   │   └── custom-geometry.ts     # a:custGeom paths
│   │   │   │   │
│   │   │   │   └── renderer/
│   │   │   │       ├── shape-renderer.ts      # ShapeIR → Canvas2D calls
│   │   │   │       ├── text-renderer.ts       # TextBodyIR → Canvas2D text
│   │   │   │       ├── fill-renderer.ts       # FillIR → Canvas2D fill
│   │   │   │       ├── line-renderer.ts       # LineIR → Canvas2D stroke
│   │   │   │       ├── effect-renderer.ts     # EffectIR → Canvas2D effects
│   │   │   │       ├── picture-renderer.ts    # PictureIR → drawImage
│   │   │   │       └── group-renderer.ts      # Recursive group rendering
│   │   │   │
│   │   │   ├── theme/                 # Theme resolution
│   │   │   │   ├── theme-parser.ts         # theme1.xml → ThemeIR
│   │   │   │   ├── color-resolver.ts       # schemeClr/srgbClr/etc → #RRGGBB
│   │   │   │   ├── font-resolver.ts        # +mj-lt/+mn-lt → concrete font
│   │   │   │   └── format-resolver.ts      # Fill/line/effect style resolution
│   │   │   │
│   │   │   ├── chart/                 # ChartML (shared across all formats)
│   │   │   │   ├── parser/
│   │   │   │   │   ├── chart-parser.ts       # c:chart → ChartIR
│   │   │   │   │   ├── series.ts             # Data series extraction
│   │   │   │   │   └── axis.ts               # Axis configuration
│   │   │   │   └── renderer/
│   │   │   │       ├── bar-chart.ts
│   │   │   │       ├── line-chart.ts
│   │   │   │       ├── pie-chart.ts
│   │   │   │       └── scatter-chart.ts
│   │   │   │
│   │   │   ├── units/                 # Coordinate systems
│   │   │   │   ├── emu.ts                  # EMU ↔ px/pt/in/cm
│   │   │   │   ├── dxa.ts                  # DXA (twentieths of a point)
│   │   │   │   └── half-points.ts          # Half-points (font sizes)
│   │   │   │
│   │   │   ├── xml/                   # XML parsing utilities
│   │   │   │   ├── fast-parser.ts          # Thin wrapper over fast-xml-parser
│   │   │   │   ├── namespace-map.ts        # All OOXML namespace URIs
│   │   │   │   └── attribute-helpers.ts    # Common attribute parsing patterns
│   │   │   │
│   │   │   ├── capability/            # Capability registry + routing
│   │   │   │   ├── registry.ts
│   │   │   │   ├── render-plan.ts
│   │   │   │   └── coverage-report.ts
│   │   │   │
│   │   │   ├── wasm/                  # WASM module loader
│   │   │   │   ├── module-loader.ts
│   │   │   │   ├── module-manifest.ts      # Module ID → URL + size + capabilities
│   │   │   │   └── progress-tracker.ts
│   │   │   │
│   │   │   ├── font/                  # Font handling (shared)
│   │   │   │   ├── font-resolver.ts        # Font name → available font
│   │   │   │   ├── substitution-table.ts   # Calibri→Arial, Cambria→Georgia
│   │   │   │   ├── font-metrics.ts         # Width/height estimation
│   │   │   │   └── font-loader.ts          # FontFace API integration
│   │   │   │
│   │   │   ├── media/                 # Media handling (shared)
│   │   │   │   ├── image-loader.ts         # Lazy image extraction + decoding
│   │   │   │   ├── media-cache.ts          # Memory-managed media cache
│   │   │   │   └── image-transforms.ts     # Crop, recolor, brightness/contrast
│   │   │   │
│   │   │   └── ir/                    # Shared IR type definitions
│   │   │       ├── drawingml-ir.ts         # ShapeIR, TextBodyIR, FillIR, etc.
│   │   │       ├── chart-ir.ts
│   │   │       ├── theme-ir.ts
│   │   │       └── common.ts              # BoundingBox, Color, etc.
│   │   │
│   │   ├── __tests__/
│   │   │   ├── geometry/              # Preset shape rendering tests
│   │   │   ├── color/                 # Color resolution tests
│   │   │   ├── text/                  # Text measurement tests
│   │   │   └── fixtures/              # Test XML fragments
│   │   │
│   │   └── package.json
│   │
│   ├── pptx/                          # @opendockit/pptx
│   │   ├── src/
│   │   │   ├── parser/
│   │   │   │   ├── presentation.ts         # presentation.xml → PresentationIR
│   │   │   │   ├── slide.ts                # slideN.xml → SlideIR
│   │   │   │   ├── slide-master.ts         # slideMasterN.xml → MasterIR
│   │   │   │   ├── slide-layout.ts         # slideLayoutN.xml → LayoutIR
│   │   │   │   ├── notes.ts                # notesSlideN.xml
│   │   │   │   ├── shape-tree.ts           # p:spTree → element list
│   │   │   │   ├── placeholder.ts          # Placeholder type resolution
│   │   │   │   └── inheritance.ts          # Master → Layout → Slide cascade
│   │   │   │
│   │   │   ├── model/
│   │   │   │   ├── presentation-ir.ts      # Top-level IR
│   │   │   │   ├── slide-ir.ts             # Per-slide IR (extends core DrawingML IR)
│   │   │   │   └── transition-ir.ts        # Slide transition definitions
│   │   │   │
│   │   │   ├── layout/
│   │   │   │   └── slide-layout-engine.ts  # Trivial: absolute positioning
│   │   │   │
│   │   │   ├── renderer/
│   │   │   │   ├── slide-renderer.ts       # Orchestrates rendering a slide
│   │   │   │   ├── background-renderer.ts  # Slide background
│   │   │   │   ├── transition-renderer.ts  # CSS/Canvas transitions
│   │   │   │   └── notes-renderer.ts       # Speaker notes display
│   │   │   │
│   │   │   ├── viewport/
│   │   │   │   ├── slide-viewport.ts       # Canvas management, DPI scaling
│   │   │   │   ├── slide-navigator.ts      # Slide-to-slide navigation
│   │   │   │   ├── thumbnail-strip.ts      # Slide thumbnail panel
│   │   │   │   └── presenter-view.ts       # Notes + current + next slide
│   │   │   │
│   │   │   └── index.ts                    # Public API: SlideKit
│   │   │
│   │   ├── __tests__/
│   │   │   ├── parser/
│   │   │   ├── renderer/
│   │   │   ├── visual-regression/     # Pixel comparison vs LibreOffice
│   │   │   └── fixtures/              # Test .pptx files
│   │   │
│   │   └── package.json
│   │
│   ├── docx/                          # @opendockit/docx (FUTURE)
│   │   ├── src/
│   │   │   ├── parser/
│   │   │   │   ├── document.ts             # document.xml → DocumentIR
│   │   │   │   ├── paragraph.ts            # w:p → WParagraphIR (NOT DrawingML a:p)
│   │   │   │   ├── run.ts                  # w:r → WRunIR (NOT DrawingML a:r)
│   │   │   │   ├── table.ts                # w:tbl → WTableIR
│   │   │   │   ├── section.ts              # w:sectPr → SectionIR
│   │   │   │   ├── styles.ts               # styles.xml → StylesIR
│   │   │   │   ├── numbering.ts            # numbering.xml → NumberingIR
│   │   │   │   ├── drawing-anchor.ts       # wp:inline / wp:anchor → DrawingPlacement
│   │   │   │   ├── headers-footers.ts      # header/footer parts
│   │   │   │   ├── footnotes.ts
│   │   │   │   ├── comments.ts
│   │   │   │   └── fields.ts               # Complex fields (TOC, page numbers)
│   │   │   │
│   │   │   ├── model/
│   │   │   │   ├── document-ir.ts
│   │   │   │   ├── paragraph-ir.ts         # WordprocessingML-specific
│   │   │   │   └── section-ir.ts
│   │   │   │
│   │   │   ├── layout/                     # THE HARD PART
│   │   │   │   ├── page-layout-engine.ts   # Full page composition
│   │   │   │   ├── line-breaker.ts         # Knuth-Plass or greedy line breaking
│   │   │   │   ├── paragraph-layout.ts     # Paragraph → positioned lines
│   │   │   │   ├── table-layout.ts         # Table sizing algorithm
│   │   │   │   ├── float-layout.ts         # Floating object positioning
│   │   │   │   ├── column-layout.ts        # Multi-column sections
│   │   │   │   └── page-break.ts           # Widow/orphan, forced breaks
│   │   │   │
│   │   │   ├── renderer/
│   │   │   │   ├── page-renderer.ts        # Render a single page
│   │   │   │   └── drawing-renderer.ts     # Delegates to core DrawingML renderer
│   │   │   │
│   │   │   └── viewport/
│   │   │       ├── page-viewport.ts        # Scrollable page view
│   │   │       └── page-navigator.ts
│   │   │
│   │   └── package.json
│   │
│   ├── xlsx/                          # @opendockit/xlsx (FUTURE)
│   │   ├── src/
│   │   │   ├── parser/
│   │   │   │   ├── workbook.ts
│   │   │   │   ├── sheet.ts
│   │   │   │   ├── shared-strings.ts
│   │   │   │   ├── styles.ts              # Cell styles, number formats
│   │   │   │   ├── cell.ts
│   │   │   │   ├── conditional-formatting.ts
│   │   │   │   ├── drawing-anchor.ts      # xdr:twoCellAnchor / absoluteAnchor
│   │   │   │   └── formula.ts             # Formula extraction (not evaluation)
│   │   │   │
│   │   │   ├── model/
│   │   │   │   ├── workbook-ir.ts
│   │   │   │   ├── sheet-ir.ts
│   │   │   │   └── cell-ir.ts
│   │   │   │
│   │   │   ├── layout/
│   │   │   │   ├── grid-layout-engine.ts   # Row/column sizing
│   │   │   │   ├── cell-renderer.ts        # Cell content rendering
│   │   │   │   └── merge-handler.ts        # Merged cell regions
│   │   │   │
│   │   │   ├── renderer/
│   │   │   │   ├── sheet-renderer.ts       # Canvas-based grid renderer
│   │   │   │   └── chart-anchor.ts         # Charts positioned in sheet
│   │   │   │
│   │   │   └── viewport/
│   │   │       ├── sheet-viewport.ts       # Virtual scrolling grid
│   │   │       └── frozen-panes.ts
│   │   │
│   │   └── package.json
│   │
│   └── wasm-modules/                  # WASM rendering accelerators
│       ├── text-layout/               # HarfBuzz + ICU for complex scripts
│       ├── effect-engine/             # Skia/CanvasKit subset for effects
│       ├── chart-render/              # (if not done in pure TS)
│       └── emf-wmf/                   # Legacy metafile rendering
│
├── tools/
│   ├── visual-regression/             # LibreOffice oracle + pixelmatch
│   ├── corpus-runner/                 # Run against 1000+ test files
│   ├── coverage-dashboard/            # Web UI showing spec coverage
│   └── preset-geometry-extractor/     # Extract shapes from OOXML spec
│
├── docs/
│   ├── architecture.md                # This document
│   ├── ooxml-spec-notes/             # Per-section implementation notes
│   └── adr/                          # Architecture Decision Records
│       ├── 001-canvas2d-primary.md
│       ├── 002-no-libreoffice-embed.md
│       ├── 003-drawingml-shared-core.md
│       └── 004-ir-serializable.md
│
├── .prettierrc
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Part 3: The Shared Core in Detail

### 3.1 OPC Layer (Open Packaging Conventions)

This is 100% shared. Every OOXML file is a ZIP with the same conventions.

```typescript
// packages/core/src/opc/package-reader.ts

export interface OpcPackage {
  contentTypes: ContentTypeMap;
  relationships: RelationshipMap;      // Package-level rels
  getPart(uri: string): Promise<Uint8Array>;
  getPartText(uri: string): Promise<string>;
  getPartRelationships(uri: string): Promise<RelationshipMap>;
  listParts(): string[];
}

export interface Relationship {
  id: string;           // e.g., "rId1"
  type: string;         // e.g., ".../officeDocument"
  target: string;       // e.g., "ppt/presentation.xml"
  targetMode?: 'Internal' | 'External';
}

// Content type lookup
export interface ContentTypeMap {
  getType(partUri: string): string | undefined;
  getPartsByType(contentType: string): string[];
}

export class OpcPackageReader {
  private zip: JSZip;
  private contentTypes: ContentTypeMap;
  private relCache: Map<string, RelationshipMap> = new Map();

  static async open(
    data: ArrayBuffer | Blob,
    onProgress?: (phase: string, loaded: number, total: number) => void
  ): Promise<OpcPackage> {
    onProgress?.('unzip', 0, 1);
    const zip = await JSZip.loadAsync(data, {
      // Don't decompress everything — lazy extraction
      createFolders: false,
    });
    onProgress?.('unzip', 1, 1);

    onProgress?.('content-types', 0, 1);
    const ctXml = await zip.file('[Content_Types].xml')!.async('string');
    const contentTypes = parseContentTypes(ctXml);
    onProgress?.('content-types', 1, 1);

    return new OpcPackageReader(zip, contentTypes);
  }

  // Lazy: only decompress a part when requested
  async getPart(uri: string): Promise<Uint8Array> {
    const normalized = normalizePartUri(uri);
    const entry = this.zip.file(normalized);
    if (!entry) throw new Error(`Part not found: ${uri}`);
    return entry.async('uint8array');
  }

  // Resolve relationship target relative to source part
  resolveRelTarget(sourcePart: string, rel: Relationship): string {
    if (rel.targetMode === 'External') return rel.target;
    const sourceDir = sourcePart.substring(0, sourcePart.lastIndexOf('/'));
    return resolveUri(sourceDir, rel.target);
  }
}
```

**Key design:** Lazy extraction means opening a 100MB PPTX doesn't decompress all media
upfront. Each slide's XML and its referenced images are extracted only when that slide
is navigated to.

### 3.2 DrawingML Parser (The Big Shared Win)

The DrawingML parser is format-agnostic. It takes XML elements from the `a:` namespace
and produces IR objects. The format-specific layers call into it when they encounter
DrawingML content.

```typescript
// packages/core/src/drawingml/parser/shape-properties.ts

import { XmlElement } from '../../xml/fast-parser';
import { ThemeIR } from '../../ir/theme-ir';
import { FillIR, LineIR, EffectIR, TransformIR } from '../../ir/drawingml-ir';

export interface ShapePropertiesIR {
  transform: TransformIR;        // Position, size, rotation, flip
  fill?: FillIR;                 // Solid, gradient, pattern, picture, or none
  line?: LineIR;                 // Outline/border
  effects: EffectIR[];           // Shadow, glow, reflection, etc.
  geometry: GeometryIR;          // Preset or custom shape path
}

/**
 * Parse an a:spPr element into a ShapePropertiesIR.
 *
 * This function is called by:
 * - PPTX: when parsing p:sp/p:spPr in a slide's shape tree
 * - DOCX: when parsing wps:wsp/wps:spPr in a word drawing
 * - XLSX: when parsing xdr:sp/xdr:spPr in a spreadsheet drawing
 *
 * The a:spPr content is IDENTICAL across all three formats.
 * Only the parent wrapper element differs.
 */
export function parseShapeProperties(
  spPrElement: XmlElement,
  theme: ThemeIR,
  defaults?: Partial<ShapePropertiesIR>
): ShapePropertiesIR {
  const transform = parseTransform(spPrElement.child('a:xfrm'));
  const fill = parseFill(spPrElement, theme);
  const line = parseLine(spPrElement.child('a:ln'), theme);
  const effects = parseEffects(spPrElement.child('a:effectLst'), theme);
  const geometry = parseGeometry(
    spPrElement.child('a:prstGeom') || spPrElement.child('a:custGeom')
  );

  return { transform, fill, line, effects, geometry };
}
```

**Critical insight from the spec:** <quote from research> DrawingML shapes appear in each
document type — shapes within spreadsheets and presentations are specified nearly
identically (xdr:sp and p:sp use the same a:spPr child), while shapes within Word
are implemented differently at the wrapper level but the inner DrawingML shape
properties (a:spPr) are the same. </quote>

### 3.3 Color Resolution Engine

Colors in OOXML are deeply entwined with themes and require a resolution pipeline
that's identical regardless of format:

```typescript
// packages/core/src/theme/color-resolver.ts

/**
 * OOXML colors come in many forms:
 * - a:srgbClr val="4472C4"          → direct hex
 * - a:schemeClr val="accent1"        → theme lookup
 * - a:sysClr val="windowText"        → system color
 * - a:hslClr h="0" s="100" l="50"   → HSL
 * - a:prstClr val="red"             → preset name
 *
 * Each can have child transforms:
 * - a:lumMod val="75000"            → luminance modulation (75%)
 * - a:lumOff val="25000"            → luminance offset (+25%)
 * - a:tint val="50000"              → tint toward white (50%)
 * - a:shade val="80000"             → shade toward black (80%)
 * - a:alpha val="50000"             → transparency (50%)
 * - a:satMod val="120000"           → saturation modulation
 *
 * All val attributes are in 1/1000 of a percent (100000 = 100%).
 */
export function resolveColor(
  colorElement: XmlElement,
  theme: ThemeIR,
  context?: ColorContext   // For phClr (placeholder color) resolution
): ResolvedColor {
  let baseColor: RgbaColor;

  const tag = colorElement.name;
  switch (tag) {
    case 'a:srgbClr':
      baseColor = hexToRgba(colorElement.attr('val'));
      break;
    case 'a:schemeClr': {
      const schemeKey = colorElement.attr('val');
      // phClr = "placeholder color" — resolved from context
      if (schemeKey === 'phClr' && context?.placeholderColor) {
        baseColor = context.placeholderColor;
      } else {
        baseColor = theme.colorScheme[mapSchemeColorName(schemeKey)];
      }
      break;
    }
    case 'a:sysClr':
      baseColor = resolveSystemColor(colorElement.attr('val'),
                                      colorElement.attr('lastClr'));
      break;
    case 'a:hslClr':
      baseColor = hslToRgba(
        parseInt(colorElement.attr('hue')) / 60000,
        parseInt(colorElement.attr('sat')) / 100000,
        parseInt(colorElement.attr('lum')) / 100000
      );
      break;
    case 'a:prstClr':
      baseColor = PRESET_COLORS[colorElement.attr('val')];
      break;
    default:
      baseColor = { r: 0, g: 0, b: 0, a: 1 };
  }

  // Apply child transforms in document order
  for (const child of colorElement.children) {
    baseColor = applyColorTransform(baseColor, child);
  }

  return baseColor;
}
```

### 3.4 Theme Engine

Themes are format-agnostic (`theme1.xml` has the same schema in all three formats):

```typescript
// packages/core/src/theme/theme-parser.ts

export interface ThemeIR {
  name: string;

  colorScheme: {
    dk1: RgbaColor;      // Dark 1 (typically black)
    lt1: RgbaColor;      // Light 1 (typically white)
    dk2: RgbaColor;      // Dark 2
    lt2: RgbaColor;      // Light 2
    accent1: RgbaColor;
    accent2: RgbaColor;
    accent3: RgbaColor;
    accent4: RgbaColor;
    accent5: RgbaColor;
    accent6: RgbaColor;
    hlink: RgbaColor;    // Hyperlink
    folHlink: RgbaColor; // Followed hyperlink
  };

  fontScheme: {
    majorLatin: string;   // Heading font (e.g., "Calibri Light")
    majorEastAsia: string;
    majorComplexScript: string;
    minorLatin: string;   // Body font (e.g., "Calibri")
    minorEastAsia: string;
    minorComplexScript: string;
  };

  formatScheme: {
    fillStyles: FillIR[];      // 3 fill styles (subtle, moderate, intense)
    lineStyles: LineIR[];      // 3 line styles
    effectStyles: EffectIR[];  // 3 effect styles
    bgFillStyles: FillIR[];    // 3 background fill styles
  };
}
```

### 3.5 Preset Geometry Engine

This is a MAJOR shared component. The 200+ preset shapes are used across all formats
and defined by the same formula language. This is pure math — no format dependency.

```typescript
// packages/core/src/drawingml/geometry/shape-guide-eval.ts

/**
 * OOXML preset geometry formula language.
 *
 * Each guide is: name = operator(arg1, arg2, ...)
 *
 * Operators:
 *   val       — literal value
 *   */        — multiply then divide: a * b / c
 *   +-        — add then subtract: a + b - c
 *   +/        — add then divide: (a + b) / c
 *   ?:        — conditional: if a > 0 then b else c
 *   abs       — absolute value
 *   at2       — atan2(y, x) in 60000ths of a degree
 *   cat2      — cos(atan2(y, x)) * distance
 *   cos       — cos(angle) * distance
 *   max       — max(a, b)
 *   min       — min(a, b)
 *   mod       — sqrt(a² + b² + c²)
 *   pin       — clamp(val, min, max)
 *   sat2      — sin(atan2(y, x)) * distance
 *   sin       — sin(angle) * distance
 *   sqrt      — square root
 *   tan       — tan(angle) * distance
 *   val       — literal value
 *
 * Built-in variables:
 *   w, h      — shape width/height (from a:xfrm extent)
 *   wd2, hd2  — w/2, h/2
 *   wd4, hd4  — w/4, h/4 (and wd5..wd12, hd5..hd12)
 *   l, t, r, b — left(0), top(0), right(w), bottom(h)
 *   ls, ss     — long side, short side: max/min of w, h
 *   cd2, cd4, cd8 — 360°/2, /4, /8 in 60000ths of a degree
 *   3cd4, 3cd8, 5cd8, 7cd8 — fractional circles
 */

interface GuideEnvironment {
  variables: Map<string, number>;
  resolve(nameOrLiteral: string): number;
}

export function evaluateGuides(
  guides: ShapeGuide[],
  width: number,
  height: number,
  adjustValues: Map<string, number>
): GuideEnvironment {
  const env = new GuideEnvironment();

  // Built-in variables
  env.set('w', width);
  env.set('h', height);
  env.set('wd2', width / 2);
  env.set('hd2', height / 2);
  // ... wd4..wd12, hd4..hd12, cd2, cd4, etc.
  env.set('l', 0);
  env.set('t', 0);
  env.set('r', width);
  env.set('b', height);
  env.set('ls', Math.max(width, height));
  env.set('ss', Math.min(width, height));

  // Adjust values (with defaults from preset)
  for (const [name, value] of adjustValues) {
    env.set(name, value);
  }

  // Evaluate guides in order (they can reference previous guides)
  for (const guide of guides) {
    const result = evaluateFormula(guide.formula, env);
    env.set(guide.name, result);
  }

  return env;
}

function evaluateFormula(formula: GuideFormula, env: GuideEnvironment): number {
  switch (formula.op) {
    case 'val':
      return env.resolve(formula.args[0]);
    case '*/':
      return env.resolve(formula.args[0]) * env.resolve(formula.args[1])
             / env.resolve(formula.args[2]);
    case '+-':
      return env.resolve(formula.args[0]) + env.resolve(formula.args[1])
             - env.resolve(formula.args[2]);
    case 'sin': {
      const dist = env.resolve(formula.args[0]);
      const angle = env.resolve(formula.args[1]) * Math.PI / (180 * 60000);
      return dist * Math.sin(angle);
    }
    case 'cos': {
      const dist = env.resolve(formula.args[0]);
      const angle = env.resolve(formula.args[1]) * Math.PI / (180 * 60000);
      return dist * Math.cos(angle);
    }
    case 'at2': {
      const y = env.resolve(formula.args[0]);
      const x = env.resolve(formula.args[1]);
      return Math.atan2(y, x) * 180 * 60000 / Math.PI;
    }
    case 'mod': {
      const a = env.resolve(formula.args[0]);
      const b = env.resolve(formula.args[1]);
      const c = env.resolve(formula.args[2]);
      return Math.sqrt(a * a + b * b + c * c);
    }
    case 'pin': {
      const val = env.resolve(formula.args[1]);
      const min = env.resolve(formula.args[0]);
      const max = env.resolve(formula.args[2]);
      return Math.max(min, Math.min(max, val));
    }
    case '?:': {
      const test = env.resolve(formula.args[0]);
      return test > 0 ? env.resolve(formula.args[1])
                       : env.resolve(formula.args[2]);
    }
    // ... remaining operators
    default:
      throw new Error(`Unknown guide operator: ${formula.op}`);
  }
}
```

### 3.6 DrawingML Renderer

The renderer takes IR objects and emits Canvas2D calls. Format-agnostic.

```typescript
// packages/core/src/drawingml/renderer/shape-renderer.ts

export interface RenderContext {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  dpiScale: number;
  theme: ThemeIR;
  mediaCache: MediaCache;
  fontResolver: FontResolver;
  capabilityRegistry: CapabilityRegistry;
}

/**
 * Render a DrawingML shape (used by PPTX, DOCX, XLSX).
 *
 * The caller (format-specific code) is responsible for:
 * 1. Setting up the coordinate space (translate/scale to the shape's position)
 * 2. Providing the resolved ShapePropertiesIR and TextBodyIR
 *
 * This renderer handles:
 * - Geometry path construction (preset or custom)
 * - Fill application
 * - Stroke/outline application
 * - Effect rendering (shadow, etc.)
 * - Text body rendering (if present)
 */
export function renderDrawingMLShape(
  rctx: RenderContext,
  shape: DrawingMLShapeIR
): RenderResult {
  const { ctx } = rctx;
  const { transform, properties, textBody } = shape;

  ctx.save();

  // Apply transform (rotation, flip)
  applyTransform(ctx, transform, rctx.dpiScale);

  // Build geometry path
  const pathResult = buildGeometryPath(ctx, properties.geometry,
                                        transform.width, transform.height);

  // Render shadow FIRST (behind shape)
  for (const effect of properties.effects) {
    if (effect.type === 'outerShadow') {
      renderOuterShadow(ctx, pathResult, effect);
    }
  }

  // Fill
  if (properties.fill) {
    const fillVerdict = rctx.capabilityRegistry.canRenderFill(properties.fill);
    if (fillVerdict.status === 'full') {
      applyFill(ctx, properties.fill, transform, rctx);
      pathResult.fill(ctx);
    } else {
      // Grey hatch for unsupported fill types
      renderFallbackFill(ctx, pathResult, properties.fill);
    }
  }

  // Stroke
  if (properties.line) {
    applyLine(ctx, properties.line, rctx);
    pathResult.stroke(ctx);
  }

  // Text body
  if (textBody) {
    renderTextBody(rctx, textBody, {
      x: 0, y: 0,
      width: transform.width,
      height: transform.height,
    });
  }

  ctx.restore();

  return {
    rendered: true,
    unsupportedEffects: properties.effects
      .filter(e => !canRenderEffect(e))
      .map(e => e.type),
  };
}
```

---

## Part 4: Format-Specific Layers

### 4.1 PPTX: The Integration Point

The PPTX layer's job is to parse PresentationML-specific structure, resolve the
master/layout/slide inheritance chain, and produce a flat list of DrawingML shapes
with resolved properties that the core renderer can handle.

```typescript
// packages/pptx/src/parser/slide.ts

import { OpcPackage } from '@opendockit/core/opc';
import { parseShapeProperties, parseTextBody } from '@opendockit/core/drawingml';
import { ThemeIR } from '@opendockit/core/ir';

export async function parseSlide(
  pkg: OpcPackage,
  slideUri: string,
  master: MasterIR,
  layout: LayoutIR,
  theme: ThemeIR
): Promise<SlideIR> {
  const xml = await pkg.getPartText(slideUri);
  const doc = parseXml(xml);
  const cSld = doc.child('p:sld').child('p:cSld');

  // Parse background (with master/layout fallback)
  const background = parseSlideBackground(cSld, layout, master, theme);

  // Parse shape tree
  const spTree = cSld.child('p:spTree');
  const elements: SlideElementIR[] = [];

  for (const child of spTree.children) {
    switch (child.name) {
      case 'p:sp':
        elements.push(parsePresentationShape(child, layout, master, theme));
        break;
      case 'p:pic':
        elements.push(parsePicture(child, theme));
        break;
      case 'p:grpSp':
        elements.push(parseGroup(child, theme));
        break;
      case 'p:graphicFrame':
        elements.push(parseGraphicFrame(child, pkg, theme));
        break;
      case 'p:cxnSp':
        elements.push(parseConnector(child, theme));
        break;
      default:
        // CRITICAL: Capture unsupported elements with bounds
        elements.push(makeUnsupported(child));
    }
  }

  return { dimensions: getDimensions(master), background, elements };
}

/**
 * Parse a presentation shape (p:sp).
 *
 * This is the PPTX-specific wrapper. It handles:
 * - Placeholder resolution (ph type/idx → inherited properties)
 * - Style reference resolution (a:style → theme formatting)
 *
 * Then delegates to core DrawingML parsers for the shape interior.
 */
function parsePresentationShape(
  spElement: XmlElement,
  layout: LayoutIR,
  master: MasterIR,
  theme: ThemeIR
): ShapeIR {
  const nvSpPr = spElement.child('p:nvSpPr');
  const spPr = spElement.child('p:spPr');
  const txBody = spElement.child('p:txBody');
  const style = spElement.child('p:style');

  // Check for placeholder
  const phElement = nvSpPr?.child('p:nvPr')?.child('p:ph');
  const placeholder = phElement
    ? resolvePlaceholder(phElement, layout, master)
    : undefined;

  // Merge: direct properties > placeholder > style reference > defaults
  const mergedSpPr = mergePlaceholderProperties(spPr, placeholder?.spPr);
  const mergedTxBody = mergePlaceholderText(txBody, placeholder?.txBody);

  // Delegate to core DrawingML parsers
  const properties = parseShapeProperties(mergedSpPr, theme);

  // Apply style reference (a:style) if present
  if (style) {
    applyStyleReference(properties, style, theme);
  }

  const text = mergedTxBody
    ? parseTextBody(mergedTxBody, theme)
    : undefined;

  return {
    kind: 'shape',
    properties,
    textBody: text,
    bounds: transformToBounds(properties.transform),
    placeholderType: placeholder?.type,
  };
}
```

### 4.2 DOCX: How the Fork Works

When DOCX support is added, the DrawingML integration is clear but the wrapper is
different:

```typescript
// packages/docx/src/parser/drawing-anchor.ts (FUTURE)

import { parseShapeProperties, parseTextBody } from '@opendockit/core/drawingml';

/**
 * DOCX embeds DrawingML objects inside w:drawing elements,
 * wrapped in either wp:inline or wp:anchor.
 *
 * The DrawingML CONTENT is identical to PPTX — same a:spPr, etc.
 * Only the PLACEMENT differs:
 *
 * - wp:inline: object flows with text (like a tall character)
 * - wp:anchor: object is absolutely positioned relative to
 *   page/column/paragraph, with text wrapping
 *
 * Additionally, DOCX uses <mc:AlternateContent> to provide both
 * DrawingML (mc:Choice) and legacy VML (mc:Fallback) for shapes.
 */
export function parseDrawingElement(
  drawingElement: XmlElement,   // w:drawing
  theme: ThemeIR
): DocxDrawingIR {
  const child = drawingElement.firstChild;

  if (child.name === 'wp:inline') {
    return {
      placement: 'inline',
      extent: parseExtent(child.child('wp:extent')),
      // Delegate to SHARED core DrawingML parser:
      shape: parseGraphicData(child.child('a:graphic'), theme),
    };
  }

  if (child.name === 'wp:anchor') {
    return {
      placement: 'anchor',
      behindDoc: child.attr('behindDoc') === '1',
      position: parseAnchorPosition(child),
      wrapping: parseTextWrapping(child),
      // SAME shared core DrawingML parser:
      shape: parseGraphicData(child.child('a:graphic'), theme),
    };
  }

  return makeUnsupported(drawingElement);
}

/**
 * Parse a:graphicData — this is the shared entry point.
 * The content inside is IDENTICAL across all three formats.
 */
function parseGraphicData(
  graphicElement: XmlElement,
  theme: ThemeIR
): DrawingMLShapeIR {
  const graphicData = graphicElement.child('a:graphicData');
  const uri = graphicData.attr('uri');

  switch (uri) {
    case PICTURE_URI:
      return parsePicture(graphicData.child('pic:pic'), theme);

    case WPS_URI:  // Word Processing Shape
      return parseWordShape(graphicData.child('wps:wsp'), theme);

    case CHART_URI:
      return { kind: 'chart-ref', relId: /* extract relationship */ };

    case DIAGRAM_URI:
      return { kind: 'diagram-ref', relId: /* extract */ };

    default:
      return makeUnsupported(graphicData);
  }
}

/**
 * wps:wsp (Word Processing Shape) wraps standard DrawingML shape
 * properties with Word-specific additions.
 */
function parseWordShape(
  wspElement: XmlElement,
  theme: ThemeIR
): DrawingMLShapeIR {
  // CORE: Same as PPTX — delegates to shared parser
  const properties = parseShapeProperties(wspElement.child('wps:spPr'), theme);
  const textBody = wspElement.child('wps:txbx')?.child('w:txbxContent')
    ? parseWordTextBoxContent(wspElement)  // ← Uses WordprocessingML text, NOT DrawingML
    : undefined;

  // Word-specific: body properties may differ slightly
  const bodyPr = wspElement.child('wps:bodyPr');

  return { kind: 'shape', properties, textBody, bodyPr };
}
```

**Key insight here:** The shape GEOMETRY and FILL are 100% shared. But the TEXT inside
a Word shape uses WordprocessingML (w:p, w:r) not DrawingML (a:p, a:r). This is a
critical divergence point — the text body parser is format-specific even inside a
shared shape.

### 4.3 XLSX: Same Pattern, Different Anchor

```typescript
// packages/xlsx/src/parser/drawing-anchor.ts (FUTURE)

import { parseShapeProperties } from '@opendockit/core/drawingml';

/**
 * XLSX puts drawings in a separate part (drawing1.xml).
 * Shapes are anchored to the cell grid:
 *
 * <xdr:twoCellAnchor>
 *   <xdr:from><xdr:col>1</xdr:col><xdr:row>2</xdr:row>...</xdr:from>
 *   <xdr:to><xdr:col>4</xdr:col><xdr:row>8</xdr:row>...</xdr:to>
 *   <xdr:sp>
 *     <xdr:spPr>
 *       <!-- Standard DrawingML shape properties — SHARED -->
 *     </xdr:spPr>
 *   </xdr:sp>
 * </xdr:twoCellAnchor>
 */
export function parseSpreadsheetDrawing(
  drawingXml: string,
  theme: ThemeIR,
  gridDimensions: GridDimensions  // Row heights, column widths
): SpreadsheetDrawingIR[] {
  const doc = parseXml(drawingXml);
  const drawings: SpreadsheetDrawingIR[] = [];

  for (const anchor of doc.children) {
    switch (anchor.name) {
      case 'xdr:twoCellAnchor': {
        const from = parseCellAnchor(anchor.child('xdr:from'));
        const to = parseCellAnchor(anchor.child('xdr:to'));
        // Convert cell coordinates to pixels using grid dimensions
        const bounds = cellAnchorToBounds(from, to, gridDimensions);

        const shapeElement = anchor.firstChild(
          n => ['xdr:sp', 'xdr:pic', 'xdr:grpSp', 'xdr:graphicFrame'].includes(n)
        );

        // Delegate to SHARED DrawingML parser for shape interior
        const shape = parseSpreadsheetShapeContent(shapeElement, theme);

        drawings.push({ bounds, shape, anchor: { from, to } });
        break;
      }
      case 'xdr:absoluteAnchor': {
        // Similar but with EMU position/extent
        break;
      }
      case 'xdr:oneCellAnchor': {
        // Anchored at one cell, extent in EMU
        break;
      }
    }
  }

  return drawings;
}
```

---

## Part 5: The Text Divergence Problem

This deserves special attention because it's the most confusing part of the shared
vs. divergent question.

### Three Text Systems

```
DrawingML Text (a:p, a:r, a:rPr)
├── Used in: PPTX shapes, PPTX text boxes, charts, SmartArt
├── Also in: XLSX cell rich text (partially)
├── Features: bullets, autofit, columns, vertical text
└── Font sizes: in hundredths of a point (e.g., 1800 = 18pt)

WordprocessingML Text (w:p, w:r, w:rPr)
├── Used in: DOCX body text, DOCX headers/footers, DOCX text boxes
├── NOT used in: PPTX, XLSX
├── Features: styles, tracked changes, fields, complex formatting
└── Font sizes: in half-points (e.g., 36 = 18pt)

SpreadsheetML Text (cell values + formatting)
├── Used in: XLSX cells
├── Shared strings: all unique text strings in one table
├── Rich text: r elements with rPr (simplified subset of w:rPr)
└── Font sizes: in points (e.g., 18 = 18pt)
```

### Strategy

```typescript
// packages/core/src/drawingml/renderer/text-renderer.ts

/**
 * Shared DrawingML text renderer.
 *
 * Handles a:txBody → Canvas2D text rendering.
 * Used by PPTX directly, and by shapes in DOCX/XLSX that contain
 * DrawingML text (charts, SmartArt, some shapes).
 *
 * NOT used for:
 * - DOCX body text (WordprocessingML w:p/w:r)
 * - XLSX cell text
 * - DOCX text box content (which uses w:p/w:r inside the shape)
 */
export function renderDrawingMLTextBody(
  rctx: RenderContext,
  textBody: TextBodyIR,
  bounds: { x: number; y: number; width: number; height: number }
): void {
  // ...shared text rendering logic...
}

// Meanwhile, in the DOCX package:
// packages/docx/src/renderer/text-renderer.ts

/**
 * WordprocessingML text renderer.
 *
 * Handles w:p/w:r → Canvas2D text rendering.
 * Separate from DrawingML text because:
 * - Different element names and structure
 * - Different font size units
 * - Different feature set (tracked changes, fields, etc.)
 * - Different paragraph properties
 *
 * BUT: shares the same underlying font resolution, measurement,
 * and Canvas2D text drawing utilities from @opendockit/core.
 */
export function renderWordParagraph(
  rctx: RenderContext,
  paragraph: WParagraphIR,
  lineBox: LineBox
): void {
  // Uses core font resolver, core Canvas2D text drawing
  // But paragraph structure and features are DOCX-specific
}
```

The key shared utilities at the text rendering level are:
- **Font resolution** (name → available font, substitution)
- **Font metrics** (measureText, ascent, descent, line height)
- **Canvas2D text drawing** (fillText, strokeText, decoration)
- **Bidirectional text algorithm** (shared when needed)

These live in `@opendockit/core/font/` and are used by all three format-specific
text renderers.

---

## Part 6: Capability Registry (Expanded)

### Registry Architecture for Multi-Format

```typescript
// packages/core/src/capability/registry.ts

export class CapabilityRegistry {
  private renderers: Map<string, RendererEntry[]> = new Map();

  /**
   * Register a renderer for an element kind.
   *
   * Renderers are registered with:
   * - elementKind: e.g., 'drawingml:shape', 'drawingml:chart',
   *                'pptx:transition', 'docx:paragraph', 'xlsx:cell'
   * - capability: can it render this specific element?
   * - priority: higher = preferred (TS renderer > WASM fallback)
   * - format: which format(s) this renderer applies to
   */
  register(entry: RendererRegistration): void {
    const key = entry.elementKind;
    const list = this.renderers.get(key) || [];
    list.push({ ...entry });
    list.sort((a, b) => b.priority - a.priority);
    this.renderers.set(key, list);
  }

  /**
   * Plan rendering for a list of elements.
   * Returns categorized render plan with progress metadata.
   */
  planRender(elements: BaseElementIR[]): RenderPlan {
    const plan: RenderPlan = {
      immediate: [],
      deferred: [],
      unsupported: [],
      stats: { total: 0, supported: 0, partial: 0, needsWasm: 0, unsupported: 0 },
    };

    for (const element of elements) {
      plan.stats.total++;
      const verdict = this.route(element);

      switch (verdict.status) {
        case 'full':
          plan.immediate.push({ element, renderer: verdict.renderer });
          plan.stats.supported++;
          break;
        case 'partial':
          plan.immediate.push({ element, renderer: verdict.renderer,
                                 missing: verdict.missing });
          plan.stats.partial++;
          break;
        case 'needs-wasm':
          plan.deferred.push({ element, moduleId: verdict.moduleId,
                                estimatedBytes: verdict.estimatedSize });
          plan.stats.needsWasm++;
          break;
        case 'unsupported':
          plan.unsupported.push({ element, reason: verdict.reason });
          plan.stats.unsupported++;
          break;
      }
    }

    return plan;
  }

  /**
   * Generate a coverage report for diagnostics / UI display.
   */
  generateCoverageReport(elements: BaseElementIR[]): CoverageReport {
    const plan = this.planRender(elements);
    return {
      totalElements: plan.stats.total,
      rendered: plan.stats.supported,
      partial: plan.stats.partial,
      wasmRequired: plan.stats.needsWasm,
      unsupported: plan.stats.unsupported,
      coveragePercent: Math.round(
        (plan.stats.supported + plan.stats.partial) / plan.stats.total * 100
      ),
      wasmModulesNeeded: [...new Set(plan.deferred.map(d => d.moduleId))],
      wasmTotalBytes: plan.deferred.reduce((sum, d) => sum + d.estimatedBytes, 0),
      unsupportedTypes: [...new Set(plan.unsupported.map(u => u.element.kind))],
      details: [
        ...plan.immediate.map((e, i) => ({
          index: i, kind: e.element.kind,
          status: 'rendered' as const, missing: e.missing,
        })),
        ...plan.deferred.map((e, i) => ({
          index: plan.immediate.length + i, kind: e.element.kind,
          status: 'wasm-pending' as const, moduleId: e.moduleId,
        })),
        ...plan.unsupported.map((e, i) => ({
          index: plan.immediate.length + plan.deferred.length + i,
          kind: e.element.kind,
          status: 'unsupported' as const, reason: e.reason,
        })),
      ],
    };
  }
}
```

---

## Part 7: Implementation Phases (Revised with Fork Points)

### Phase 0: Monorepo + Core Foundation (Weeks 1-3)

```
Deliverable: @opendockit/core with OPC, XML, units, types
```

- [ ] Monorepo setup (pnpm workspaces)
- [ ] TypeScript strict mode, ESLint, Vitest
- [ ] `core/opc`: OPC package reader with lazy extraction + progress
- [ ] `core/xml`: XML parser wrapper (fast-xml-parser) with namespace support
- [ ] `core/units`: EMU, DXA, half-point conversions with exhaustive tests
- [ ] `core/ir`: All shared IR type definitions (ShapePropertiesIR, FillIR, etc.)
- [ ] `core/theme`: Theme parser (theme1.xml → ThemeIR)
- [ ] `core/theme`: Color resolver (all 5 color types + transforms)
- [ ] `core/font`: Font substitution table, FontFace API integration

**Verification:**
- Unit tests for every unit conversion
- Parse themes from 10+ real PPTX/DOCX/XLSX files — same parser works for all
- Color resolution tests against known PowerPoint outputs
- ✅ **Fork-point validation:** theme parser works with docx/theme/theme1.xml and
  xl/theme/theme1.xml identically

### Phase 1: DrawingML Parser + Renderer (Weeks 4-8)

```
Deliverable: @opendockit/core DrawingML pipeline renders shapes to canvas
```

- [ ] `core/drawingml/parser`: Shape properties (fill, line, effects, transform)
- [ ] `core/drawingml/parser`: Text body (paragraphs, runs, character props)
- [ ] `core/drawingml/parser`: Picture (blipFill, crop, stretch)
- [ ] `core/drawingml/parser`: Group shapes (recursive)
- [ ] `core/drawingml/geometry`: Shape guide evaluator (formula engine)
- [ ] `core/drawingml/geometry`: Top-40 preset geometries
- [ ] `core/drawingml/geometry`: Custom geometry paths
- [ ] `core/drawingml/renderer`: Shape → Canvas2D (fill, stroke, geometry)
- [ ] `core/drawingml/renderer`: Text → Canvas2D (basic: wrapping, alignment)
- [ ] `core/drawingml/renderer`: Picture → Canvas2D (drawImage + transforms)
- [ ] `core/drawingml/renderer`: Effects → Canvas2D (drop shadow, basic)
- [ ] `core/drawingml/renderer`: Group → recursive rendering

**Verification:**
- Render every preset geometry as a standalone test
- Visual regression: render test shapes, compare against reference PNGs
- ✅ **Fork-point validation:** render a DrawingML shape extracted from a DOCX
  (floating image, text box) using the same renderer — it should work

### Phase 2: PPTX Integration (Weeks 9-13)

```
Deliverable: @opendockit/pptx renders real presentations
```

- [ ] `pptx/parser`: presentation.xml → slide list, dimensions
- [ ] `pptx/parser`: Slide master parser
- [ ] `pptx/parser`: Slide layout parser
- [ ] `pptx/parser`: Slide parser (shape tree → flat element list)
- [ ] `pptx/parser`: Placeholder resolution (master → layout → slide cascade)
- [ ] `pptx/parser`: Style reference resolution (a:style → theme formatting)
- [ ] `pptx/renderer`: Slide background (solid, gradient, image)
- [ ] `pptx/renderer`: Slide renderer (orchestrates element rendering)
- [ ] `pptx/viewport`: SlideViewport (canvas management, DPI, resize)
- [ ] `pptx/viewport`: Slide navigator (prev/next, thumbnail strip)
- [ ] Capability registry integration
- [ ] Grey-box fallback renderer with badges
- [ ] Coverage report API

**Verification:**
- Render slides from 20+ real-world PPTX files
- Visual regression CI with LibreOffice reference renders
- Coverage report for each test file
- ✅ **Fork-point proof:** core DrawingML code is only called via imports,
  no PPTX-specific logic leaks into core

### Phase 3: Progressive Fidelity Infrastructure (Weeks 14-17)

```
Deliverable: WASM loader, progress UX, expanded coverage
```

- [ ] WASM module loader with Cache API + streaming compile
- [ ] Per-element progress spinners during WASM download
- [ ] Deferred render pipeline (render, download, re-render in place)
- [ ] Table renderer (DrawingML tables, shared)
- [ ] Remaining preset geometries (batch implementation)
- [ ] Auto-fit text (shrink-to-fit, auto-size)
- [ ] Connector shapes
- [ ] Hyperlinks
- [ ] Notes view

**Verification:**
- 90%+ element coverage on test corpus
- WASM module loads and re-renders smoothly
- Lighthouse performance audit on slide load

### Phase 4: Charts + Expanded Features (Weeks 18-24)

```
Deliverable: Chart rendering, expanded effects
```

- [ ] `core/chart`: ChartML parser (bar, line, pie, scatter)
- [ ] `core/chart`: Chart renderer (Canvas2D, pure TS)
- [ ] First WASM module: CanvasKit for advanced effects
- [ ] Reflection, glow, soft edges via CanvasKit
- [ ] Slide transitions (CSS animation for common ones)
- [ ] Embedded video player (HTML5 video element overlay)
- [ ] Print/export (render all slides to PDF via jsPDF or similar)

### Phase 5: DOCX Fork (Weeks 25-36)

```
Deliverable: @opendockit/docx reads and renders Word documents
```

This is where the shared core pays off massively:

- [ ] `docx/parser`: document.xml → DocumentIR (WordprocessingML)
- [ ] `docx/parser`: styles.xml → StylesIR (style cascade)
- [ ] `docx/parser`: numbering.xml → NumberingIR
- [ ] `docx/parser`: Drawing anchor (wp:inline, wp:anchor)
      → **delegates to core DrawingML parser** ✅
- [ ] `docx/parser`: VML fallback (mc:AlternateContent)
- [ ] `docx/parser`: Headers, footers, footnotes
- [ ] `docx/layout`: Page layout engine (the hard part)
- [ ] `docx/layout`: Line breaking algorithm
- [ ] `docx/layout`: Table layout
- [ ] `docx/layout`: Float positioning + text wrapping
- [ ] `docx/renderer`: Page renderer
      → **uses core DrawingML renderer for embedded shapes** ✅
- [ ] `docx/viewport`: Scrollable page view

**Estimated code reuse from core:** ~40% of the codebase
- OPC layer: 100% reused
- Theme engine: 100% reused
- DrawingML parser: 100% reused (shapes, pictures, charts in DOCX)
- DrawingML renderer: 100% reused
- Color resolver: 100% reused
- Font resolver: 100% reused
- Chart engine: 100% reused
- Preset geometries: 100% reused
- Text renderer: 0% reused (WordprocessingML ≠ DrawingML text)
- Layout engine: 0% reused (page flow ≠ absolute positioning)
- Document model: 0% reused (sections/paragraphs ≠ slides)

### Phase 6: XLSX Fork (Weeks 37-48)

```
Deliverable: @opendockit/xlsx reads and renders spreadsheets
```

- [ ] `xlsx/parser`: workbook.xml, sheet.xml, shared strings, styles
- [ ] `xlsx/parser`: Drawing anchors (xdr:twoCellAnchor)
      → **delegates to core DrawingML parser** ✅
- [ ] `xlsx/layout`: Grid layout engine (row/col sizing, merges)
- [ ] `xlsx/renderer`: Cell renderer (values, formatting, borders)
- [ ] `xlsx/renderer`: Sheet renderer (virtual scrolling canvas)
      → **uses core DrawingML renderer for embedded charts/shapes** ✅
- [ ] `xlsx/renderer`: Conditional formatting visual rules
- [ ] `xlsx/viewport`: Sheet viewport with frozen panes

---

## Part 8: Risk Analysis & Mitigations

### Risk: Preset Geometry Complexity
**Impact:** 200+ shapes, each with unique formulas
**Mitigation:** Extract definitions programmatically from the OOXML spec XSD.
The shape definitions are declarative data, not code. Build a code generator
that reads the spec and emits TypeScript shape definitions. Test each shape
independently.

### Risk: Text Layout Fidelity
**Impact:** PowerPoint's text wrapping has undocumented behaviors
**Mitigation:** Accept approximate text layout initially. Use LibreOffice
reference renders to identify divergences. Build a "text layout accuracy"
score into the CI pipeline. Optionally load HarfBuzz WASM for complex scripts.

### Risk: Font Availability
**Impact:** Users won't have Calibri/Cambria on non-Windows systems
**Mitigation:** Font substitution table built into core. Document font
dependencies in the coverage report. Support embedded fonts from PPTX.
Consider bundling a web-safe font set (Noto) as optional download.

### Risk: DOCX Layout Engine Complexity
**Impact:** Full page layout is an enormous engineering effort
**Mitigation:** Start with a simplified layout engine (no floating objects,
no multi-column). Add features progressively. The "grey box" approach
works for unsupported layout features too — show the content even if
positioning is imperfect.

### Risk: Memory on Large Files
**Impact:** 100MB+ PPTX files with embedded video
**Mitigation:** Lazy extraction (already in design). Media LRU cache with
configurable size limit. `OffscreenCanvas` in workers. Explicit cleanup API.

---

## Part 9: Dependencies

| Package | License | Size | Used By | Purpose |
|---------|---------|------|---------|---------|
| jszip | MIT | 45KB | core | ZIP extraction |
| fast-xml-parser | MIT | 40KB | core | XML → JS object |
| canvaskit-wasm | BSD-3 | 1.5MB gz | wasm-modules | Advanced 2D effects |
| opentype.js | MIT | 180KB | core | Font metrics |
| harfbuzzjs | MIT | 800KB | wasm-modules | Complex text shaping |

**Total core bundle (no WASM):** ~265KB gzipped
**With CanvasKit (on-demand):** +1.5MB
**With HarfBuzz (on-demand):** +800KB

---

## Part 10: Public API Surface

```typescript
// @opendockit/pptx — consumer-facing API

import { SlideKit } from '@opendockit/pptx';

// Initialize
const kit = new SlideKit({
  container: document.getElementById('viewer'),
  wasmBasePath: '/wasm/',        // Where WASM modules are served
  fontSubstitutions: { ... },    // Optional overrides
  showDebugInfo: false,          // Show XML tags in grey boxes
  onProgress: (event) => { ... },
});

// Load a presentation
const presentation = await kit.load(pptxArrayBuffer);

// Inspect before rendering
console.log(presentation.slideCount);
console.log(presentation.dimensions);     // { width, height } in EMU
console.log(presentation.theme);          // Resolved theme
console.log(presentation.coverageReport); // What we can/can't render

// Render a slide
await kit.renderSlide(0);

// Navigate
kit.nextSlide();
kit.previousSlide();
kit.goToSlide(5);

// Get per-slide coverage
const report = kit.getSlideCoverage(3);
// { totalElements: 14, rendered: 12, partial: 1, unsupported: 1,
//   unsupportedTypes: ['SmartArt'], wasmModulesNeeded: [] }

// Cleanup
kit.dispose();
```

```typescript
// @opendockit/docx (FUTURE) — same philosophy, different viewport

import { DocKit } from '@opendockit/docx';

const kit = new DocKit({
  container: document.getElementById('viewer'),
  wasmBasePath: '/wasm/',
  onProgress: (event) => { ... },
});

const doc = await kit.load(docxArrayBuffer);
console.log(doc.pageCount);  // estimated (layout must run)
console.log(doc.coverageReport);

// Render is paginated
await kit.renderPage(0);
kit.scrollToPage(3);
kit.dispose();
```

---

## Conclusion

The key architectural decisions:

1. **Monorepo with clear package boundaries** — `core` knows nothing about PPTX/DOCX/XLSX
2. **DrawingML is the shared core** — shapes, fills, effects, pictures, charts
3. **Document model and layout are format-specific** — no premature abstraction
4. **Text diverges sharply** — DrawingML text vs WordprocessingML text vs cell text
5. **Placement/anchoring diverges** — absolute (PPTX) vs inline/float (DOCX) vs cell-grid (XLSX)
6. **Start PPTX because layout is trivial** — absolute positioning on fixed canvas
7. **DOCX layout is the hardest problem** — defer to Phase 5, benefit from everything else

The estimated code reuse when adding DOCX support: **~40%** (everything in `@opendockit/core`).
For XLSX: **~35%** (less DrawingML content in typical spreadsheets, but charts reuse).

This means the PPTX investment isn't just a PPTX investment — it's building the foundation
for a complete OOXML rendering suite.
