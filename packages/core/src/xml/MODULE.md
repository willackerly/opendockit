# Module: XML Parser Wrapper (`@opendockit/core/xml`)

**Purpose:** Thin wrapper over `fast-xml-parser` providing a clean `XmlElement` interface for navigating parsed OOXML. Every parser module depends on this.

**Tier:** Spine (must be implemented first — blocks all parsers)

**Inputs:** Raw XML strings from OPC package parts

**Outputs:**
- `fast-parser.ts` — `XmlElement` class/interface with methods:
  - `.name: string` — element tag name (e.g., `'a:spPr'`)
  - `.attr(name: string): string | undefined` — get attribute value
  - `.child(name: string): XmlElement | undefined` — first child with tag name
  - `.children: XmlElement[]` — all child elements
  - `.text(): string` — text content
  - `parseXml(xml: string): XmlElement` — parse XML string to element tree
- `namespace-map.ts` — constants for all OOXML namespace URIs:
  - `NS_A` (DrawingML), `NS_P` (PresentationML), `NS_R` (relationships), `NS_W` (WordprocessingML), `NS_XDR` (SpreadsheetML Drawing), `NS_C` (ChartML), `NS_PIC` (Picture), `NS_WPS` (Word Processing Shape), etc.
- `attribute-helpers.ts` — `parseBoolAttr()`, `parseIntAttr()`, `parseEnumAttr()`, `parseOptionalInt()`
- `index.ts` — barrel export

**Dependencies:** `fast-xml-parser` (npm package)

**Key reference:** `docs/architecture/OOXML_RENDERER.md` Part 3.2 shows how parsers use `XmlElement` (e.g., `spPrElement.child('a:xfrm')`, `colorElement.attr('val')`).

**Design decisions:**
- `fast-xml-parser` returns plain objects. Wrap in `XmlElement` for ergonomic navigation.
- Handle OOXML's namespace prefixes (e.g., `a:`, `p:`, `r:`) — parser must preserve them.
- `.child()` returns `undefined` (not throws) for missing elements — parsers check presence.
- `.children` returns only element nodes, not text nodes.

**Testing:** Parse real OOXML XML fragments, verify navigation. Include fragments from the architecture doc code samples.
