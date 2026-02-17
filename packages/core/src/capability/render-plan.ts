/**
 * Render plan types for the Capability Registry.
 *
 * A RenderPlan categorizes slide elements into three buckets:
 *   - immediate: renderable now with a TypeScript renderer
 *   - deferred: requires a WASM module to be loaded first
 *   - unsupported: no renderer available — will show a grey box
 *
 * The plan also includes aggregate stats for progress reporting.
 */

import type { SlideElementIR } from '../ir/index.js';
import type { RendererRegistration } from './registry.js';

// ---------------------------------------------------------------------------
// Plan entry types
// ---------------------------------------------------------------------------

/** An element matched to an immediately-available renderer. */
export interface ImmediateEntry {
  element: SlideElementIR;
  renderer: RendererRegistration;
}

/** An element matched to a deferred (WASM) renderer. */
export interface DeferredEntry {
  element: SlideElementIR;
  renderer: RendererRegistration;
  moduleId: string;
  estimatedBytes: number;
}

/** An element with no matching renderer. */
export interface UnsupportedEntry {
  element: SlideElementIR;
  reason: string;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** Aggregate statistics for a render plan. */
export interface RenderPlanStats {
  /** Total number of elements in the plan. */
  total: number;
  /** Elements renderable immediately. */
  immediate: number;
  /** Elements requiring WASM module download. */
  deferred: number;
  /** Elements with no renderer. */
  unsupported: number;
}

// ---------------------------------------------------------------------------
// RenderPlan
// ---------------------------------------------------------------------------

/** A categorized rendering plan for an array of slide elements. */
export interface RenderPlan {
  /** Elements renderable immediately with TypeScript renderers. */
  immediate: ImmediateEntry[];
  /** Elements requiring WASM modules (deferred loading). */
  deferred: DeferredEntry[];
  /** Elements with no available renderer (grey-box fallback). */
  unsupported: UnsupportedEntry[];
  /** Aggregate statistics. */
  stats: RenderPlanStats;
}
