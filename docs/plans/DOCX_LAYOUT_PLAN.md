# DOCX Page Layout Engine — Design Plan

## Overview

The DOCX page layout engine transforms parsed `DocumentIR` (paragraphs, runs, sections) into a fully paginated layout with positioned lines, runs, and inline elements. It replaces the current `estimateParagraphHeight()` scaffold with real text measurement, word-boundary line breaking, and proper pagination.

## Architecture

```
                          DocumentIR
                             │
                    ┌────────┴────────┐
                    │  PageLayoutEngine │  ← orchestrator (per-section)
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
      ┌───────┴──────┐  ┌───┴───┐  ┌───────┴──────┐
      │  LineBreaker  │  │ Table │  │  Pagination   │
      │  (text flow)  │  │Layout │  │  (page split) │
      └───────┬──────┘  └───┬───┘  └───────┬──────┘
              │              │              │
              ▼              ▼              ▼
          LayoutLine     LayoutTable    LayoutPage[]
              │              │              │
              └──────────────┼──────────────┘
                             │
                      LayoutDocument
                    (list of LayoutPage)
                             │
                             ▼
                      DocKit.renderPage()
                    (Canvas2D drawing pass)
```

### Data Flow

1. **Input**: `SectionIR` with paragraphs (from parser)
2. **Line breaking**: Each paragraph is broken into `LayoutLine[]` using `LineBreaker`
3. **Block layout**: Lines are stacked vertically, tracking Y cursor
4. **Pagination**: When Y cursor exceeds content area height, start new page
5. **Output**: `LayoutPage[]` each containing `LayoutBlock[]` with positioned lines

## Key Type Definitions

### Layout IR (output of layout engine)

```typescript
/** A single measured text run positioned on a line. */
interface LayoutRun {
  text: string; // text content
  x: number; // x offset from line start (pt)
  width: number; // measured width (pt)
  fontString: string; // CSS font string for Canvas2D
  fillStyle: string; // CSS color string
  run: RunIR; // back-reference to source IR
}

/** A single line of text within a paragraph. */
interface LayoutLine {
  runs: LayoutRun[]; // positioned runs on this line
  width: number; // total content width (pt)
  height: number; // line height including leading (pt)
  ascent: number; // distance from top to baseline (pt)
  y: number; // y offset from block top (pt)
}

/** A laid-out paragraph block. */
interface LayoutBlock {
  kind: 'paragraph';
  lines: LayoutLine[];
  y: number; // y offset from content area top (pt)
  height: number; // total height including spacing (pt)
  paragraph: ParagraphIR; // back-reference to source
  spacingBefore: number; // resolved spacing before (pt)
  spacingAfter: number; // resolved spacing after (pt)
}

/** A single page of laid-out content. */
interface LayoutPage {
  pageIndex: number;
  blocks: LayoutBlock[];
  pageWidth: number; // from section (pt)
  pageHeight: number; // from section (pt)
  contentArea: ContentArea;
}

/** Complete layout result for an entire document. */
interface LayoutDocument {
  pages: LayoutPage[];
}
```

## Input: What the Parser Produces

The parser yields `DocumentIR`:

- `sections: SectionIR[]` — each with page size, margins, and `paragraphs: ParagraphIR[]`
- `styles: StyleMap` — paragraph style definitions with inheritance resolved
- `defaultStyle?: ParagraphStyleIR` — document-wide defaults from `<w:docDefaults>`

Each `ParagraphIR` has:

- `runs: RunIR[]` — text with formatting (font, size, bold, italic, color, etc.)
- `alignment`, `spacingBefore`, `spacingAfter`, `lineSpacing`
- `indentLeft`, `indentRight`, `indentFirstLine`
- `bulletChar`, `numberingLevel`, `styleId`

## Output: What the Layout Engine Produces

`LayoutDocument` — a flat list of `LayoutPage`, each containing positioned `LayoutBlock` objects. Every block contains `LayoutLine[]` with `LayoutRun[]`. All coordinates are in points (1/72"), ready for direct Canvas2D rendering.

The DocKit renderer iterates pages, then blocks, then lines, then runs — setting `ctx.font` and `ctx.fillStyle` and calling `ctx.fillText()`.

## Component Design

### 1. TextMeasurer (interface)

An abstraction over text measurement. In the browser this wraps `ctx.measureText()`. For testing, a mock can return character-count-based widths.

```typescript
interface TextMeasurer {
  measureText(text: string, fontString: string): { width: number; ascent: number; descent: number };
}
```

Why an interface: The core text-renderer (PPTX) uses `backend.measureText()` directly. For DOCX layout, we need to measure text _before_ we have a canvas (layout is a pure computation step). The measurer abstraction lets us:

- Run layout in Node.js tests without a real canvas
- Swap in font-metrics-DB-based measurement later
- Keep layout logic pure (no canvas dependency)

### 2. LineBreaker

Breaks a `ParagraphIR` into `LayoutLine[]` given a content width and `TextMeasurer`.

**Algorithm** (greedy, word-boundary):

1. Concatenate all run texts into a single string
2. Split at word boundaries (spaces, hyphens)
3. Greedily fit words onto the current line
4. When a word doesn't fit, start a new line
5. Handle first-line indent (positive or hanging)
6. Track per-fragment font metrics for line height calculation

This mirrors the PPTX `wrapParagraph()` in `text-renderer.ts` (line 572) but operates on DOCX `RunIR` instead of DrawingML `RunIR`.

**Reuse**: The word-splitting and greedy-fit logic is the same pattern. We build a DOCX-specific version because the IR types differ (DOCX uses flat properties vs DrawingML's nested `CharacterPropertiesIR`), but the algorithm is identical.

### 3. PageLayoutEngine

Orchestrator that:

1. Resolves styles (applies `StyleMap` defaults to each paragraph)
2. Calls `LineBreaker` for each paragraph
3. Stacks blocks vertically, tracking Y cursor
4. Paginates when content exceeds the content area

### 4. Pagination Rules

- **Page break**: When accumulated Y exceeds `contentArea.height`, start new page
- **Widow/orphan control** (Phase 2): Avoid leaving 1 line alone on a page
- **Keep-with-next** (Phase 2): Some paragraphs must not be separated from the next
- **Explicit page breaks** (Phase 2): `<w:br w:type="page"/>` in run text

## Phase Breakdown

### Phase 1: Core Line Breaking + Pagination (THIS PHASE)

- `types.ts` — Layout IR types
- `line-breaker.ts` — Word-boundary line breaking with text measurement
- `page-layout-engine.ts` — Block stacking + pagination
- `index.ts` — Updated barrel exports
- Update `DocKit.renderPage()` to use new layout IR
- **Goal**: Correct line wrapping and page breaks for simple paragraphs

### Phase 2: Paragraph Formatting

- Paragraph alignment (left/center/right/justify)
- First-line indent and hanging indent
- Bullet/numbering rendering with proper indentation
- Space before/after paragraphs
- Line spacing (single, 1.5x, double, exact, at-least)

### Phase 3: Style Resolution

- Apply `StyleMap` to paragraphs (resolve `styleId` to formatting)
- Apply `defaultStyle` (docDefaults) as base
- Style inheritance (basedOn chain, already resolved by parser)

### Phase 4: Headers, Footers, Sections

- Per-section page dimensions (already parsed)
- Header/footer content rendering
- First-page header/footer variants
- Odd/even header/footer variants
- Section break types (next page, continuous, even page, odd page)

### Phase 5: Tables

- Cell layout (each cell is a mini page-layout region)
- Column widths (fixed, auto, percentage)
- Row heights (auto, exact, at-least)
- Cell margins and spacing
- Table splitting across pages
- Merged cells (horizontal and vertical spanning)

### Phase 6: Inline Images + Floating Elements

- Inline `<w:drawing>` (DrawingML pictures/shapes within text flow)
- Anchored/floating elements with text wrapping
- Text flow around floating objects

### Phase 7: Multi-column Layout

- `<w:cols>` section property
- Equal and unequal column widths
- Column breaks
- Text flow across columns then down to next page

### Phase 8: Advanced

- Widow/orphan control
- Keep-with-next / keep-lines-together
- Tab stops
- Footnotes and endnotes
- Fields (page numbers, TOC, cross-references)
- Bookmarks and hyperlinks

## Existing Code to Reuse

| Component                  | Source                                                       | Reuse                                     |
| -------------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| Page dimension computation | `layout/page-layout.ts`                                      | Keep as-is, LayoutEngine calls it         |
| Section parsing            | `parser/section-properties.ts`                               | Already produces `SectionIR` with margins |
| Style resolution           | `parser/styles.ts`                                           | Already resolves inheritance chains       |
| Unit conversions           | `@opendockit/core` (`dxaToPt`, `halfPointsToPt`)             | Import directly                           |
| Word-wrap algorithm        | `core/drawingml/renderer/text-renderer.ts:wrapParagraph()`   | Port pattern to DOCX types                |
| Font string building       | `core/drawingml/renderer/text-renderer.ts:buildFontString()` | Simpler DOCX version                      |
| `RenderBackend` interface  | `core/drawingml/renderer/render-backend.ts`                  | Use for text measurement                  |

## Build New

| Component                                                    | Why                                             |
| ------------------------------------------------------------ | ----------------------------------------------- |
| `LayoutRun`, `LayoutLine`, `LayoutBlock`, `LayoutPage` types | DOCX-specific layout IR                         |
| `TextMeasurer` interface                                     | Decouples layout from Canvas2D                  |
| `LineBreaker`                                                | DOCX paragraph → lines (different IR from PPTX) |
| `PageLayoutEngine`                                           | DOCX sections → pages orchestrator              |

## Test Strategy

### Unit Tests (`line-breaker.test.ts`)

- Single run fits on one line → 1 line, 1 run
- Long text wraps at word boundary → multiple lines
- Multiple runs with different fonts → correct measurement per run
- Empty paragraph → single empty line
- First-line indent reduces available width
- Hanging indent (negative first-line indent)
- Bullet character prepended to first line

### Unit Tests (`page-layout-engine.test.ts`)

- Single short paragraph → 1 page, 1 block, 1 line
- Paragraphs exceeding page height → multiple pages
- Spacing before/after correctly accumulated
- Empty section → 1 empty page
- Style resolution applies font size from styleId

### Integration Tests

- Round-trip: parse DOCX fixture → layout → verify page count
- Render to canvas → visual snapshot (Phase 2+)

### Mock TextMeasurer for Tests

```typescript
/** Fixed-width measurer: every character is `charWidth` points wide. */
class FixedWidthMeasurer implements TextMeasurer {
  constructor(
    private charWidth: number = 6,
    private lineHeight: number = 14
  ) {}
  measureText(text: string, _font: string) {
    return {
      width: text.length * this.charWidth,
      ascent: this.lineHeight * 0.8,
      descent: this.lineHeight * 0.2,
    };
  }
}
```

This makes line-breaking tests deterministic without needing a real canvas.

## Key Files

- `packages/docx/src/layout/types.ts` — Layout IR type definitions
- `packages/docx/src/layout/line-breaker.ts` — Line breaking algorithm
- `packages/docx/src/layout/page-layout-engine.ts` — Orchestrator (replaces block-layout.ts)
- `packages/docx/src/layout/page-layout.ts` — Page dimension computation (existing, keep)
- `packages/docx/src/layout/block-layout.ts` — Current scaffold (to be replaced)
- `packages/docx/src/layout/index.ts` — Barrel exports
- `packages/docx/src/viewport/doc-kit.ts` — Renderer (consumes layout output)
- `packages/docx/src/model/document-ir.ts` — Parser IR types (input to layout)
