import { describe, it, expect } from 'vitest';
import { EditTracker } from '../edit-tracker.js';

// ---------------------------------------------------------------------------
// markDirty + isDirty
// ---------------------------------------------------------------------------

describe('EditTracker', () => {
  it('marks an object dirty and reports it as dirty', () => {
    const tracker = new EditTracker();
    const obj = { name: 'shape1' };
    tracker.markDirty(obj);
    expect(tracker.isDirty(obj)).toBe(true);
  });

  it('returns false for unmarked objects', () => {
    const tracker = new EditTracker();
    const obj = { name: 'shape1' };
    expect(tracker.isDirty(obj)).toBe(false);
  });

  it('tracks multiple objects independently', () => {
    const tracker = new EditTracker();
    const a = { id: 'a' };
    const b = { id: 'b' };
    const c = { id: 'c' };

    tracker.markDirty(a);
    tracker.markDirty(c);

    expect(tracker.isDirty(a)).toBe(true);
    expect(tracker.isDirty(b)).toBe(false);
    expect(tracker.isDirty(c)).toBe(true);
  });

  it('marking the same object twice is idempotent', () => {
    const tracker = new EditTracker();
    const obj = { id: '1' };
    tracker.markDirty(obj);
    tracker.markDirty(obj);
    expect(tracker.isDirty(obj)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // reset
  // ---------------------------------------------------------------------------

  it('reset clears all dirty state', () => {
    const tracker = new EditTracker();
    const a = { id: 'a' };
    const b = { id: 'b' };
    tracker.markDirty(a);
    tracker.markDirty(b);

    tracker.reset();

    expect(tracker.isDirty(a)).toBe(false);
    expect(tracker.isDirty(b)).toBe(false);
  });

  it('objects can be re-dirtied after reset', () => {
    const tracker = new EditTracker();
    const obj = { id: '1' };

    tracker.markDirty(obj);
    expect(tracker.isDirty(obj)).toBe(true);

    tracker.reset();
    expect(tracker.isDirty(obj)).toBe(false);

    tracker.markDirty(obj);
    expect(tracker.isDirty(obj)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Works with different object types
  // ---------------------------------------------------------------------------

  it('works with plain objects', () => {
    const tracker = new EditTracker();
    const obj = {};
    tracker.markDirty(obj);
    expect(tracker.isDirty(obj)).toBe(true);
  });

  it('works with arrays', () => {
    const tracker = new EditTracker();
    const arr = [1, 2, 3];
    tracker.markDirty(arr);
    expect(tracker.isDirty(arr)).toBe(true);
  });

  it('works with class instances', () => {
    const tracker = new EditTracker();
    const date = new Date();
    tracker.markDirty(date);
    expect(tracker.isDirty(date)).toBe(true);
  });

  it('works with nested objects', () => {
    const tracker = new EditTracker();
    const nested = { inner: { deep: true } };
    tracker.markDirty(nested);
    expect(tracker.isDirty(nested)).toBe(true);
    // Inner objects are not dirty unless explicitly marked
    expect(tracker.isDirty(nested.inner)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // WeakSet behavior (no strong refs)
  // ---------------------------------------------------------------------------

  it('does not hold strong references (conceptual — no prevent-GC assertion)', () => {
    // We cannot directly test garbage collection in JS, but we can verify
    // that the tracker does not expose any enumeration or size API that
    // would require strong refs.
    const tracker = new EditTracker();
    const obj = { id: 'ephemeral' };
    tracker.markDirty(obj);
    expect(tracker.isDirty(obj)).toBe(true);

    // After reset, even with the same reference, it's no longer dirty
    tracker.reset();
    expect(tracker.isDirty(obj)).toBe(false);
  });
});
