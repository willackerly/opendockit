# Module: Chart Engine (`@opendockit/core/chart`)

**Purpose:** Parse ChartML (c: namespace) and render charts to Canvas2D. Shared across all OOXML formats.

**Tier:** Phase 4 (deferred — charts are complex and less common)

**Inputs:** Chart XML from OPC package parts

**Outputs:**
- `parser/chart-parser.ts` — `parseChart(xml: XmlElement): ChartIR`
- `parser/series.ts` — data series extraction
- `parser/axis.ts` — axis configuration
- `renderer/bar-chart.ts`, `line-chart.ts`, `pie-chart.ts`, `scatter-chart.ts`
- `index.ts` — barrel export

**Dependencies:**
- `../xml/` — XML parsing
- `../ir/` — `ChartIR`
- `../theme/` — color resolution for chart series

**Key reference:** `docs/architecture/OOXML_RENDERER.md` Part 7, Phase 4

**Testing:** Parse charts from real PPTX files, verify data extraction, visual regression.
