/**
 * Debug utilities for the unified element model.
 */
export { traceToElements, parseCssColor, parseCssFont } from './trace-to-elements.js';
export type {
  RenderTrace,
  TraceEvent,
  TextTraceEvent,
  StrokeTextTraceEvent,
  ShapeTraceEvent,
  ImageTraceEvent,
  TraceConfig,
} from './trace-to-elements.js';

export {
  matchElements,
  extractText,
  centroidDistance,
  computeIoU,
  longestCommonSubstring,
} from './element-matcher.js';
export type { MatchedPair, MatchResult } from './element-matcher.js';

export {
  diffElements,
  generateDiffReport,
} from './property-diff.js';
export type {
  PropertyDelta,
  ElementDiff,
  DiffReport,
} from './property-diff.js';
