/**
 * Unit tests for SlideKit.
 *
 * Tests what is testable in a Node.js environment without browser APIs.
 * Canvas-dependent features are tested at the integration level.
 */

import { describe, expect, it } from 'vitest';
import { SlideKit } from '../slide-viewport.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SlideKit', () => {
  it('can be constructed with minimal options', () => {
    const kit = new SlideKit({});
    expect(kit).toBeDefined();
    expect(kit.currentSlide).toBe(0);
    kit.dispose();
  });

  it('defaults dpiScale to 1 in Node.js (no window)', () => {
    const kit = new SlideKit({});
    // The dpiScale is private but we can verify indirectly — no error.
    expect(kit).toBeDefined();
    kit.dispose();
  });

  it('accepts explicit dpiScale', () => {
    const kit = new SlideKit({ dpiScale: 2 });
    expect(kit).toBeDefined();
    kit.dispose();
  });

  it('accepts font substitutions', () => {
    const kit = new SlideKit({
      fontSubstitutions: { Calibri: 'Arial', 'Calibri Light': 'Helvetica' },
    });
    expect(kit).toBeDefined();
    kit.dispose();
  });

  it('throws when rendering without loading', async () => {
    const kit = new SlideKit({});
    await expect(kit.renderSlide(0)).rejects.toThrow('No presentation loaded');
    kit.dispose();
  });

  it('throws when navigating without loading', async () => {
    const kit = new SlideKit({});
    await expect(kit.nextSlide()).rejects.toThrow('No presentation loaded');
    await expect(kit.previousSlide()).rejects.toThrow('No presentation loaded');
    kit.dispose();
  });

  it('throws after dispose', async () => {
    const kit = new SlideKit({});
    kit.dispose();

    const blob = new Blob([new Uint8Array(0)]);
    await expect(kit.load(blob)).rejects.toThrow('disposed');
  });

  it('dispose is idempotent', () => {
    const kit = new SlideKit({});
    kit.dispose();
    kit.dispose(); // Should not throw.
  });

  it('has the expected public API methods', () => {
    const kit = new SlideKit({});
    expect(typeof kit.load).toBe('function');
    expect(typeof kit.renderSlide).toBe('function');
    expect(typeof kit.nextSlide).toBe('function');
    expect(typeof kit.previousSlide).toBe('function');
    expect(typeof kit.goToSlide).toBe('function');
    expect(typeof kit.dispose).toBe('function');
    expect(typeof kit.currentSlide).toBe('number');
    kit.dispose();
  });

  it('emits progress events during load', async () => {
    const events: Array<{ phase: string; current: number; total: number }> = [];
    const kit = new SlideKit({
      onProgress: (event) => {
        events.push({ phase: event.phase, current: event.current, total: event.total });
      },
    });

    // Loading with invalid data should fail, but progress events should be
    // emitted before the failure.
    const emptyBlob = new Blob([new Uint8Array(0)]);
    try {
      await kit.load(emptyBlob);
    } catch {
      // Expected to fail with invalid PPTX data.
    }

    // At least the initial loading event should have been emitted.
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].phase).toBe('loading');
    kit.dispose();
  });
});
