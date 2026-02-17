# Module: DrawingML Parsers (`@opendockit/core/drawingml/parser`)

**Purpose:** Parse DrawingML XML elements (`a:` namespace) into IR objects. Format-agnostic — called by PPTX, DOCX, and XLSX layers identically.

**Tier:** Fan-out 2 (depends on IR Types + XML Parser + Theme Engine for color resolution)

**Each file is independently implementable. No parser depends on another parser (except shape-properties which composes them all).**

**Files:**

| File | Input (XML) | Output (IR) | Independent? |
|------|-------------|-------------|-------------|
| `shape-properties.ts` | `a:spPr` | `ShapePropertiesIR` | No — calls fill, line, effect, transform, geometry parsers |
| `fill.ts` | `a:solidFill`, `a:gradFill`, `a:pattFill`, `a:blipFill`, `a:noFill` | `FillIR` | Yes |
| `line.ts` | `a:ln` | `LineIR` | Yes |
| `effect.ts` | `a:effectLst`, `a:effectDag` | `EffectIR[]` | Yes |
| `transform.ts` | `a:xfrm` | `TransformIR` | Yes |
| `text-body.ts` | `a:txBody` | `TextBodyIR` | Yes (includes paragraph + run parsing) |
| `paragraph.ts` | `a:p` | `ParagraphIR` | Yes (called by text-body) |
| `run.ts` | `a:r` | `RunIR` | Yes (called by paragraph) |
| `picture.ts` | `pic:pic` | `PictureIR` | Yes (uses fill parser for blipFill) |
| `group.ts` | `a:grpSp` | `GroupIR` | No — recursive, calls shape-properties |

**Dependencies:**
- `../../xml/` — `XmlElement`, `parseXml`
- `../../ir/` — all IR types
- `../../theme/` — `resolveColor`, `ThemeIR` (for color attributes in fills/lines)
- `../../units/` — EMU conversions for transforms

**Parallelization:** Implement `fill.ts`, `line.ts`, `effect.ts`, `transform.ts`, `text-body.ts`, `picture.ts` as 6 parallel agents. Then `shape-properties.ts` and `group.ts` as a composition step.

**Key reference:** `docs/architecture/OOXML_RENDERER.md` Parts 3.2, 5 (text divergence)

**Testing:** Parse XML fragments from real PPTX files. Verify IR output structure matches type definitions. Include edge cases (missing attributes, empty elements).
