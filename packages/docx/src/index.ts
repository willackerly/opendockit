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
} from './parser/index.js';
export type { NumberingDef, NumberingLevelDef, NumberingMap } from './parser/index.js';

// Layout
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
