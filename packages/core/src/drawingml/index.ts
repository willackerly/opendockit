/**
 * DrawingML — barrel export for all DrawingML modules.
 *
 * Re-exports parsers, renderers, and geometry engine for use
 * by downstream packages.
 */

// Parsers
export {
  parseFill,
  parseLine,
  parseLineFromParent,
  parseEffectList,
  parseEffectsFromParent,
  parseTransform,
  parseTransformFromParent,
  parseGroupTransform,
  parseTextBody,
  parseTextBodyFromParent,
  parsePicture,
  parseShapeProperties,
  parseShapePropertiesFromParent,
  parseGroup,
  parseShapeTreeChildren,
} from './parser/index.js';
export type { GroupTransformResult } from './parser/index.js';

// Renderers
export type { RenderContext } from './renderer/index.js';
export {
  emuToScaledPx,
  applyFill,
  applyLine,
  drawLineEnds,
  applyEffects,
  renderTextBody,
  renderPicture,
  renderShape,
  renderSlideElement,
  renderGroup,
} from './renderer/index.js';

// Geometry
export {
  createGuideContext,
  evaluateFormula,
  evaluateGuides,
  getPresetGeometry,
  getPresetGeometryNames,
  buildPresetPath,
  buildCustomPath,
  tracePresetPath,
  traceCustomPath,
} from './geometry/index.js';
export type {
  GuideContext,
  PresetGeometryDef,
  PresetPath,
  PresetPathCommand,
} from './geometry/index.js';
