/**
 * Barrel export for the Capability Registry module.
 *
 * Usage:
 *   import { CapabilityRegistry, renderGreyBox } from '@opendockit/core/capability';
 */

// Registry
export { CapabilityRegistry } from './registry.js';
export type { RendererRegistration, RenderVerdict } from './registry.js';

// Render plan
export type {
  RenderPlan,
  RenderPlanStats,
  ImmediateEntry,
  DeferredEntry,
  UnsupportedEntry,
} from './render-plan.js';

// Coverage report
export type { CoverageReport, ElementCoverageStatus } from './coverage-report.js';

// Grey-box fallback
export { renderGreyBox } from './grey-box.js';
