/**
 * Coverage report types for the Capability Registry.
 *
 * A CoverageReport provides per-element rendering status, useful for
 * debugging and for displaying coverage dashboards.
 */

import type { SlideElementIR } from '../ir/index.js';

// ---------------------------------------------------------------------------
// Per-element status
// ---------------------------------------------------------------------------

/** Rendering status for a single element. */
export interface ElementCoverageStatus {
  /** The element being reported on. */
  element: SlideElementIR;
  /** Rendering status. */
  status: 'immediate' | 'deferred' | 'unsupported';
  /** Renderer ID if matched, undefined if unsupported. */
  rendererId?: string;
  /** Reason if unsupported. */
  reason?: string;
}

// ---------------------------------------------------------------------------
// CoverageReport
// ---------------------------------------------------------------------------

/** Per-element coverage report for a set of slide elements. */
export interface CoverageReport {
  /** Status for each element, in order. */
  entries: ElementCoverageStatus[];
  /** Summary counts. */
  summary: {
    total: number;
    immediate: number;
    deferred: number;
    unsupported: number;
  };
}
