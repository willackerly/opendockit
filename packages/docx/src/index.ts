/**
 * @opendockit/docx — Progressive-fidelity DOCX renderer.
 *
 * Public API entry point. Exports the DocKit class (the main user-facing
 * API), model types, parsers, layout engine, and numbering support.
 */

// Public API: DocKit
export { DocKit } from './viewport/index.js';
export type { RenderOptions, LoadedDocument } from './viewport/index.js';

// Model types
export type {
  DocumentIR,
  SectionIR,
  ParagraphIR,
  ParagraphAlignment,
  RunIR,
  ParagraphStyleIR,
  StyleMap,
  BorderIR,
  BordersIR,
  CellMarginsIR,
  CellVerticalAlignment,
  TableCellIR,
  TableRowIR,
  TableIR,
  BlockElement,
  ParagraphBlock,
  TableBlock,
} from './model/index.js';

// Parsers
export {
  parseDocument,
  parseDocumentFromXml,
  parseParagraph,
  parseRun,
  parseRunProperties,
  parseSectionProperties,
  defaultSectionDimensions,
  parseStyles,
  parseDocDefaults,
  parseNumbering,
  getBulletChar,
  parseTable,
} from './parser/index.js';
export type { NumberingDef, NumberingLevelDef, NumberingMap } from './parser/index.js';

// Layout (legacy scaffold)
export {
  computePageDimensions,
  layoutSection,
  layoutDocument,
  estimateParagraphHeight,
} from './layout/index.js';
export type {
  ContentArea,
  PageDimensions,
  PositionedParagraph,
  PageContent,
  BlockLayoutResult,
} from './layout/index.js';

// Layout engine (new — line-breaking + pagination)
export { breakParagraphIntoLines } from './layout/index.js';
export { layoutDocumentPages, layoutSectionPages } from './layout/index.js';
export type {
  TextMeasurement,
  TextMeasurer,
  LayoutRun,
  LayoutLine,
  LayoutBlock,
  LayoutParagraphBlock,
  LayoutTableBlock,
  LayoutTableCell,
  LayoutTableRow,
  TableLayoutResult,
  LayoutPage,
  LayoutDocument,
} from './layout/index.js';

// Table layout
export { layoutTable } from './layout/index.js';
