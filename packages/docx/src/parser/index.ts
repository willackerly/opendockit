/**
 * Parser module — barrel export.
 */
export { parseDocument, parseDocumentFromXml } from './document.js';
export { parseParagraph } from './paragraph.js';
export { parseRun, parseRunProperties } from './run.js';
export { parseSectionProperties, defaultSectionDimensions } from './section-properties.js';
export { parseStyles, parseDocDefaults } from './styles.js';
export { parseNumbering, getBulletChar } from './numbering.js';
export type { NumberingDef, NumberingLevelDef, NumberingMap } from './numbering.js';
export { parseTable } from './table.js';
