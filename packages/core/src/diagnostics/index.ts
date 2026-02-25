/**
 * Diagnostics system for structured logging and warning output.
 *
 * Provides a {@link DiagnosticEmitter} that collects and deduplicates
 * diagnostic events during rendering. Consuming apps subscribe via
 * a {@link DiagnosticListener} callback to receive warnings about
 * unsupported OOXML features, missing fonts, fallback usage, etc.
 *
 * Usage:
 *   import { DiagnosticEmitter } from '@opendockit/core/diagnostics';
 *
 *   const emitter = new DiagnosticEmitter((event) => {
 *     console.log(`[${event.severity}] ${event.category}: ${event.message}`);
 *   });
 *   emitter.emit({ category: 'missing-font', severity: 'warning', message: '...' });
 *   const summary = emitter.getSummary();
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Categories of diagnostic events. */
export type DiagnosticCategory =
  | 'unsupported-element'
  | 'missing-font'
  | 'partial-rendering'
  | 'fallback-used';

/** Severity levels for diagnostic events. */
export type DiagnosticSeverity = 'info' | 'warning' | 'error';

/** A single diagnostic event emitted during rendering. */
export interface DiagnosticEvent {
  /** The category of this diagnostic. */
  category: DiagnosticCategory;
  /** Severity of this diagnostic. */
  severity: DiagnosticSeverity;
  /** Human-readable description. */
  message: string;
  /** Optional context about where in the presentation this occurred. */
  context?: {
    slideNumber?: number;
    shapeName?: string;
    shapeId?: string;
    elementType?: string;
  };
}

/** Callback type for receiving diagnostic events. */
export type DiagnosticListener = (event: DiagnosticEvent) => void;

/** Summary of collected diagnostic events, grouped by category. */
export interface DiagnosticSummary {
  total: number;
  byCategory: Record<string, DiagnosticEvent[]>;
}

// ---------------------------------------------------------------------------
// DiagnosticEmitter
// ---------------------------------------------------------------------------

/**
 * Collects, deduplicates, and dispatches diagnostic events.
 *
 * Events are deduplicated by a key derived from category, message, and
 * slide number. Duplicate events within the same slide are silently
 * dropped. The optional listener callback receives each unique event
 * as it is emitted.
 *
 * Unsupported-element events are also logged to `console.warn` with
 * a standard prefix for easy filtering.
 */
export class DiagnosticEmitter {
  private listener?: DiagnosticListener;
  private events: DiagnosticEvent[] = [];
  private seen = new Set<string>();

  constructor(listener?: DiagnosticListener) {
    this.listener = listener;
  }

  /**
   * Emit a diagnostic event.
   *
   * Deduplicates by (category, message, slideNumber). If the event is
   * new, it is stored, forwarded to the listener, and (for unsupported
   * elements) logged to the console.
   */
  emit(event: DiagnosticEvent): void {
    const key = `${event.category}:${event.message}:${event.context?.slideNumber ?? ''}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.events.push(event);
    if (this.listener) this.listener(event);
    if (event.category === 'unsupported-element') {
      console.warn(`OOXML FEATURE UNSUPPORTED: ${event.message}`);
    }
  }

  /**
   * Get a summary of all collected events grouped by category.
   */
  getSummary(): DiagnosticSummary {
    const byCategory: Record<string, DiagnosticEvent[]> = {};
    for (const e of this.events) {
      (byCategory[e.category] ??= []).push(e);
    }
    return { total: this.events.length, byCategory };
  }

  /**
   * Get all collected events as a readonly array.
   */
  getEvents(): readonly DiagnosticEvent[] {
    return this.events;
  }

  /**
   * Clear all collected events and deduplication state.
   */
  clear(): void {
    this.events = [];
    this.seen.clear();
  }
}
