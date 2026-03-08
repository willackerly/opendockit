# Specifications Reference

Key specifications used in OpenDocKit development.

## OOXML Standards

- **ECMA-376** — Office Open XML File Formats (5th Edition, 2021)
  - Part 1: Fundamentals and Markup Language Reference
  - Part 2: Open Packaging Conventions (OPC)
  - Part 3: Markup Compatibility and Extensibility
  - Part 4: Transitional Migration Features
  - [ECMA-376 Download](https://ecma-international.org/publications-and-standards/standards/ecma-376/)

- **ISO/IEC 29500** — ISO equivalent of ECMA-376

## DrawingML Reference

- ECMA-376 Part 1, §20 — DrawingML framework (shapes, text, effects, transforms)
- ECMA-376 Part 1, §19 — PresentationML (slides, layouts, masters, animations)

## OPC (Open Packaging Conventions)

- ECMA-376 Part 2 — ZIP container, content types, relationships, digital signatures

## Font Specifications

- **OpenType** — [Microsoft OpenType Spec](https://learn.microsoft.com/en-us/typography/opentype/spec/)
- **WOFF2** — [W3C WOFF2 Spec](https://www.w3.org/TR/WOFF2/)
- **OS/2 Table** — Font metrics: sTypoAscender, sTypoDescender, sTypoLineGap

## PDF Specifications

- **PDF 2.0** — ISO 32000-2:2020
- **PDF Signature** — PAdES (ETSI EN 319 142)

## Key OOXML Sections for Implementation

| Spec Section             | Status   | Notes                              |
| ------------------------ | -------- | ---------------------------------- |
| OPC (Part 2)             | Complete | `@opendockit/core` OPC layer       |
| DrawingML Core (§20.1)   | Complete | Shapes, fills, effects, transforms |
| DrawingML Pictures (§20.2) | Complete | Picture parser and renderer       |
| DrawingML Text (§21.1)   | Complete | Text body, paragraphs, runs        |
| PresentationML (§19)     | Complete | Slides, masters, layouts           |
| DrawingML Charts (§21.2) | Partial  | Cached image fallback only         |
| DrawingML Diagrams (§21.4) | Partial | SmartArt fallback rendering       |
| WordprocessingML (§17)   | Planned  | Future `@opendockit/docx`          |
| SpreadsheetML (§18)      | Planned  | Future `@opendockit/xlsx`          |
