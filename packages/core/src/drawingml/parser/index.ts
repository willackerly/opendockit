/**
 * DrawingML Parser — barrel export.
 *
 * Exports fill and line parsers. Additional parsers (effect, transform,
 * text-body, shape-properties, etc.) will be added by other agents.
 */

export { parseFill } from './fill.js';
export { parseLine, parseLineFromParent } from './line.js';
