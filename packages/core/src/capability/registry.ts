/**
 * Capability Registry — routes slide elements to the best available renderer.
 *
 * The registry is the architectural heart of progressive fidelity. It:
 *   1. Accepts renderer registrations (TS-immediate or WASM-deferred)
 *   2. Routes individual elements to the highest-priority matching renderer
 *   3. Generates RenderPlans that categorize arrays of elements
 *   4. Produces CoverageReports for debugging and dashboards
 *
 * Registration order is irrelevant — the highest-priority renderer that
 * can handle an element always wins.
 */

import type { SlideElementIR } from '../ir/index.js';
import type { RenderPlan } from './render-plan.js';
import type { CoverageReport } from './coverage-report.js';

// ---------------------------------------------------------------------------
// Registration types
// ---------------------------------------------------------------------------

/** A registered renderer's capabilities and metadata. */
export interface RendererRegistration {
  /** Unique renderer identifier, e.g. 'ts-shape', 'wasm-chart'. */
  id: string;
  /** Whether the renderer is available now or requires loading. */
  kind: 'immediate' | 'deferred';
  /** Returns true if this renderer can handle the given element. */
  canRender: (element: SlideElementIR) => boolean;
  /** Priority — higher values win when multiple renderers match. Default: 0. */
  priority?: number;
  /** WASM module ID (required for deferred renderers). */
  moduleId?: string;
  /** Estimated download size in bytes (for deferred renderers). */
  estimatedBytes?: number;
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

/** The result of routing a single element. */
export interface RenderVerdict {
  /** The matched renderer, or undefined if unsupported. */
  renderer: RendererRegistration | undefined;
  /** Rendering status. */
  status: 'immediate' | 'deferred' | 'unsupported';
  /** Reason string when status is 'unsupported'. */
  reason?: string;
}

// ---------------------------------------------------------------------------
// CapabilityRegistry
// ---------------------------------------------------------------------------

export class CapabilityRegistry {
  private registrations: RendererRegistration[] = [];

  /**
   * Register a renderer with its capabilities.
   *
   * Registrations are order-independent — the highest-priority renderer
   * matching an element always wins.
   */
  register(entry: RendererRegistration): void {
    this.registrations.push(entry);
  }

  /**
   * Route a single element to the best available renderer.
   *
   * Returns a verdict with:
   *   - 'immediate' if a TS renderer is matched
   *   - 'deferred' if only a WASM renderer is available
   *   - 'unsupported' if no renderer can handle the element
   */
  route(element: SlideElementIR): RenderVerdict {
    let best: RendererRegistration | undefined;
    let bestPriority = -Infinity;

    for (const reg of this.registrations) {
      const priority = reg.priority ?? 0;
      if (priority > bestPriority && reg.canRender(element)) {
        best = reg;
        bestPriority = priority;
      }
    }

    if (!best) {
      return {
        renderer: undefined,
        status: 'unsupported',
        reason: `No renderer registered for element kind '${element.kind}'`,
      };
    }

    return {
      renderer: best,
      status: best.kind,
    };
  }

  /**
   * Plan rendering for an array of elements.
   *
   * Returns a RenderPlan that categorizes elements into immediate,
   * deferred, and unsupported buckets with aggregate statistics.
   */
  planRender(elements: SlideElementIR[]): RenderPlan {
    const plan: RenderPlan = {
      immediate: [],
      deferred: [],
      unsupported: [],
      stats: { total: elements.length, immediate: 0, deferred: 0, unsupported: 0 },
    };

    for (const element of elements) {
      const verdict = this.route(element);

      switch (verdict.status) {
        case 'immediate':
          plan.immediate.push({ element, renderer: verdict.renderer! });
          plan.stats.immediate++;
          break;
        case 'deferred':
          plan.deferred.push({
            element,
            renderer: verdict.renderer!,
            moduleId: verdict.renderer!.moduleId ?? 'unknown',
            estimatedBytes: verdict.renderer!.estimatedBytes ?? 0,
          });
          plan.stats.deferred++;
          break;
        case 'unsupported':
          plan.unsupported.push({
            element,
            reason: verdict.reason ?? 'Unknown reason',
          });
          plan.stats.unsupported++;
          break;
      }
    }

    return plan;
  }

  /**
   * Generate a per-element coverage report.
   *
   * Returns an entry for each element with its rendering status,
   * matched renderer ID, and reason if unsupported.
   */
  generateCoverageReport(elements: SlideElementIR[]): CoverageReport {
    const entries = elements.map((element) => {
      const verdict = this.route(element);
      return {
        element,
        status: verdict.status,
        rendererId: verdict.renderer?.id,
        reason: verdict.reason,
      };
    });

    const summary = {
      total: elements.length,
      immediate: entries.filter((e) => e.status === 'immediate').length,
      deferred: entries.filter((e) => e.status === 'deferred').length,
      unsupported: entries.filter((e) => e.status === 'unsupported').length,
    };

    return { entries, summary };
  }
}
