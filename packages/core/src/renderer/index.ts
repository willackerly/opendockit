/**
 * Renderer entry point — tree-shakeable import for rendering-only consumers.
 *
 * Re-exports DrawingML Canvas2D renderers, the capability registry,
 * and the diagnostics system. Does NOT include parsing or IR types.
 *
 * Usage:
 *   import { renderShape, CapabilityRegistry } from '@opendockit/core/renderer';
 */

// DrawingML renderers
export {
  emuToScaledPx,
  applyFill,
  applyLine,
  drawLineEnds,
  applyEffects,
  renderTextBody,
  measureTextBodyHeight,
  renderPicture,
  renderShape,
  renderSlideElement,
  renderConnector,
  renderGroup,
  renderTable,
  CanvasBackend,
  TracingBackend,
} from '../drawingml/renderer/index.js';
export type {
  RenderContext,
  DynamicRenderer,
  RenderBackend,
  RenderTrace,
  TraceEvent,
  TraceConfig,
  TextTraceEvent,
  ShapeTraceEvent,
  ImageTraceEvent,
  ShapeContext,
} from '../drawingml/renderer/index.js';

// Capability registry
export { CapabilityRegistry, renderGreyBox } from '../capability/index.js';
export type {
  RendererRegistration,
  RenderVerdict,
  RenderPlan,
  RenderPlanStats,
  ImmediateEntry,
  DeferredEntry,
  UnsupportedEntry,
  CoverageReport,
  ElementCoverageStatus,
} from '../capability/index.js';

// Diagnostics
export { DiagnosticEmitter } from '../diagnostics/index.js';
export type {
  DiagnosticCategory,
  DiagnosticSeverity,
  DiagnosticEvent,
  DiagnosticListener,
  DiagnosticSummary,
} from '../diagnostics/index.js';
