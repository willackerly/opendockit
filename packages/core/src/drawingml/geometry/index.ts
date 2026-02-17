/**
 * Geometry Engine — barrel export.
 *
 * Shape guide formula evaluator and preset geometry definitions.
 */

export { createGuideContext, evaluateFormula, evaluateGuides } from './shape-guide-eval.js';
export type { GuideContext } from './shape-guide-eval.js';

export { getPresetGeometry, getPresetGeometryNames } from './preset-geometries.js';
export type { PresetGeometryDef, PresetPath, PresetPathCommand } from './preset-geometries.js';
