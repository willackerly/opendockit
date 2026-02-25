/**
 * Tests for the DiagnosticEmitter.
 *
 * Covers:
 *   - Basic event emission and collection
 *   - Deduplication by (category, message, slideNumber)
 *   - Listener callback invocation
 *   - getSummary grouping by category
 *   - Console.warn for unsupported-element events
 *   - clear() resets state
 *   - getEvents returns readonly snapshot
 */

import { describe, expect, it, vi } from 'vitest';
import { DiagnosticEmitter } from '../index.js';
import type { DiagnosticEvent, DiagnosticListener } from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides?: Partial<DiagnosticEvent>): DiagnosticEvent {
  return {
    category: 'unsupported-element',
    severity: 'warning',
    message: 'Chart element not supported',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Basic emission
// ---------------------------------------------------------------------------

describe('DiagnosticEmitter — basic emission', () => {
  it('collects emitted events', () => {
    const emitter = new DiagnosticEmitter();
    emitter.emit(makeEvent());
    emitter.emit(makeEvent({ message: 'SmartArt not supported' }));

    const events = emitter.getEvents();
    expect(events).toHaveLength(2);
    expect(events[0].message).toBe('Chart element not supported');
    expect(events[1].message).toBe('SmartArt not supported');
  });

  it('returns empty array when no events emitted', () => {
    const emitter = new DiagnosticEmitter();
    expect(emitter.getEvents()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

describe('DiagnosticEmitter — deduplication', () => {
  it('deduplicates events with same category, message, and slide number', () => {
    const emitter = new DiagnosticEmitter();
    const event = makeEvent({ context: { slideNumber: 3 } });

    emitter.emit(event);
    emitter.emit(event);
    emitter.emit(event);

    expect(emitter.getEvents()).toHaveLength(1);
  });

  it('allows same message on different slides', () => {
    const emitter = new DiagnosticEmitter();

    emitter.emit(makeEvent({ context: { slideNumber: 1 } }));
    emitter.emit(makeEvent({ context: { slideNumber: 2 } }));
    emitter.emit(makeEvent({ context: { slideNumber: 3 } }));

    expect(emitter.getEvents()).toHaveLength(3);
  });

  it('allows same slide with different messages', () => {
    const emitter = new DiagnosticEmitter();

    emitter.emit(makeEvent({ message: 'A', context: { slideNumber: 1 } }));
    emitter.emit(makeEvent({ message: 'B', context: { slideNumber: 1 } }));

    expect(emitter.getEvents()).toHaveLength(2);
  });

  it('allows same message with different categories', () => {
    const emitter = new DiagnosticEmitter();

    emitter.emit(makeEvent({ category: 'unsupported-element', message: 'X' }));
    emitter.emit(makeEvent({ category: 'missing-font', message: 'X' }));

    expect(emitter.getEvents()).toHaveLength(2);
  });

  it('deduplicates events without context (slide number undefined)', () => {
    const emitter = new DiagnosticEmitter();

    emitter.emit(makeEvent({ message: 'No context' }));
    emitter.emit(makeEvent({ message: 'No context' }));

    expect(emitter.getEvents()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Listener callback
// ---------------------------------------------------------------------------

describe('DiagnosticEmitter — listener', () => {
  it('calls the listener for each unique event', () => {
    const listener = vi.fn<DiagnosticListener>();
    const emitter = new DiagnosticEmitter(listener);

    const e1 = makeEvent({ message: 'A' });
    const e2 = makeEvent({ message: 'B' });
    emitter.emit(e1);
    emitter.emit(e2);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith(e1);
    expect(listener).toHaveBeenCalledWith(e2);
  });

  it('does not call the listener for duplicate events', () => {
    const listener = vi.fn<DiagnosticListener>();
    const emitter = new DiagnosticEmitter(listener);

    const event = makeEvent();
    emitter.emit(event);
    emitter.emit(event);
    emitter.emit(event);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('works without a listener', () => {
    const emitter = new DiagnosticEmitter();
    // Should not throw
    emitter.emit(makeEvent());
    expect(emitter.getEvents()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getSummary
// ---------------------------------------------------------------------------

describe('DiagnosticEmitter — getSummary', () => {
  it('groups events by category', () => {
    const emitter = new DiagnosticEmitter();

    emitter.emit(makeEvent({ category: 'unsupported-element', message: 'Chart' }));
    emitter.emit(makeEvent({ category: 'unsupported-element', message: 'SmartArt' }));
    emitter.emit(makeEvent({ category: 'missing-font', message: 'Wingdings' }));
    emitter.emit(makeEvent({ category: 'fallback-used', message: 'Calibri' }));

    const summary = emitter.getSummary();
    expect(summary.total).toBe(4);
    expect(summary.byCategory['unsupported-element']).toHaveLength(2);
    expect(summary.byCategory['missing-font']).toHaveLength(1);
    expect(summary.byCategory['fallback-used']).toHaveLength(1);
    expect(summary.byCategory['partial-rendering']).toBeUndefined();
  });

  it('returns zero total for empty emitter', () => {
    const emitter = new DiagnosticEmitter();
    const summary = emitter.getSummary();
    expect(summary.total).toBe(0);
    expect(Object.keys(summary.byCategory)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Console.warn for unsupported elements
// ---------------------------------------------------------------------------

describe('DiagnosticEmitter — console.warn', () => {
  it('logs unsupported-element events to console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const emitter = new DiagnosticEmitter();

    emitter.emit(makeEvent({ category: 'unsupported-element', message: 'OLE object' }));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('OOXML FEATURE UNSUPPORTED: OLE object');

    warnSpy.mockRestore();
  });

  it('does not log non-unsupported events to console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const emitter = new DiagnosticEmitter();

    emitter.emit(makeEvent({ category: 'missing-font', message: 'Wingdings' }));
    emitter.emit(makeEvent({ category: 'fallback-used', message: 'Calibri' }));
    emitter.emit(makeEvent({ category: 'partial-rendering', message: '3D effect' }));

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------

describe('DiagnosticEmitter — clear', () => {
  it('clears all events and deduplication state', () => {
    const emitter = new DiagnosticEmitter();

    emitter.emit(makeEvent({ message: 'A' }));
    emitter.emit(makeEvent({ message: 'B' }));
    expect(emitter.getEvents()).toHaveLength(2);

    emitter.clear();
    expect(emitter.getEvents()).toHaveLength(0);
    expect(emitter.getSummary().total).toBe(0);
  });

  it('allows re-emitting previously deduplicated events after clear', () => {
    const emitter = new DiagnosticEmitter();

    emitter.emit(makeEvent({ message: 'X' }));
    expect(emitter.getEvents()).toHaveLength(1);

    emitter.clear();

    emitter.emit(makeEvent({ message: 'X' }));
    expect(emitter.getEvents()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Event context
// ---------------------------------------------------------------------------

describe('DiagnosticEmitter — event context', () => {
  it('preserves full context on collected events', () => {
    const emitter = new DiagnosticEmitter();

    emitter.emit({
      category: 'unsupported-element',
      severity: 'error',
      message: 'SmartArt diagram',
      context: {
        slideNumber: 5,
        shapeName: 'Diagram 1',
        shapeId: '42',
        elementType: 'smartart',
      },
    });

    const event = emitter.getEvents()[0];
    expect(event.context?.slideNumber).toBe(5);
    expect(event.context?.shapeName).toBe('Diagram 1');
    expect(event.context?.shapeId).toBe('42');
    expect(event.context?.elementType).toBe('smartart');
    expect(event.severity).toBe('error');
  });
});
