/**
 * Geometry Engine — barrel export.
 *
 * Shape guide formula evaluator, preset geometry definitions,
 * and path builder for Canvas2D rendering.
 */

export { createGuideContext, evaluateFormula, evaluateGuides } from './shape-guide-eval.js';
export type { GuideContext } from './shape-guide-eval.js';

export { getPresetGeometry, getPresetGeometryNames } from './preset-geometries.js';
export type { PresetGeometryDef, PresetPath, PresetPathCommand } from './preset-geometries.js';

export {
  buildPresetPath,
  buildCustomPath,
  tracePresetPath,
  traceCustomPath,
} from './path-builder.js';
