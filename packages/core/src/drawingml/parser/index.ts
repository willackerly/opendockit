/**
 * DrawingML Parser — barrel export.
 *
 * Exports all DrawingML parsers: fill, line, effect, transform,
 * text-body, shape-properties, group, and picture.
 */

export { parseFill } from './fill.js';
export { parseLine, parseLineFromParent } from './line.js';
export { parseEffectList, parseEffectsFromParent } from './effect.js';
export { parseTransform, parseTransformFromParent, parseGroupTransform } from './transform.js';
export type { GroupTransformResult } from './transform.js';
export { parseTextBody, parseTextBodyFromParent, parseListStyle } from './text-body.js';
export { parseParagraphProperties, parseBulletProperties } from './paragraph.js';
export { parsePicture } from './picture.js';
export { parseShapeProperties, parseShapePropertiesFromParent } from './shape-properties.js';
export { parseGroup, parseShapeTreeChildren } from './group.js';
export { parseStyleReference } from './style-reference.js';
export { parseTable, parseTableRow, parseTableCell, parseTableCellBorders } from './table.js';
