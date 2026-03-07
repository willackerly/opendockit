import { describe, it, expect } from 'vitest';
import { WeakDirtyTracker, DirtyTracker } from '../dirty-tracking.js';

// ─── WeakDirtyTracker tests ──────────────────────────────

describe('WeakDirtyTracker', () => {
  it('starts with nothing dirty', () => {
    const tracker = new WeakDirtyTracker();
    const obj = { id: 1 };
    expect(tracker.isDirty(obj)).toBe(false);
  });

  it('marks objects as dirty', () => {
    const tracker = new WeakDirtyTracker();
    const obj = { id: 1 };
    tracker.markDirty(obj);
    expect(tracker.isDirty(obj)).toBe(true);
  });

  it('tracks object identity, not equality', () => {
    const tracker = new WeakDirtyTracker();
    const a = { id: 1 };
    const b = { id: 1 }; // same shape, different reference
    tracker.markDirty(a);
    expect(tracker.isDirty(a)).toBe(true);
    expect(tracker.isDirty(b)).toBe(false);
  });

  it('clears all dirty state after clearAll()', () => {
    const tracker = new WeakDirtyTracker();
    const a = { id: 1 };
    const b = { id: 2 };
    tracker.markDirty(a);
    tracker.markDirty(b);
    tracker.clearAll();
    expect(tracker.isDirty(a)).toBe(false);
    expect(tracker.isDirty(b)).toBe(false);
  });

  it('can re-mark objects as dirty after clearAll()', () => {
    const tracker = new WeakDirtyTracker();
    const obj = { id: 1 };
    tracker.markDirty(obj);
    tracker.clearAll();
    expect(tracker.isDirty(obj)).toBe(false);
    tracker.markDirty(obj);
    expect(tracker.isDirty(obj)).toBe(true);
  });

  it('is idempotent — marking dirty twice is fine', () => {
    const tracker = new WeakDirtyTracker();
    const obj = { id: 1 };
    tracker.markDirty(obj);
    tracker.markDirty(obj);
    expect(tracker.isDirty(obj)).toBe(true);
  });
});

// ─── DirtyTracker<T> tests ────────────────────────────────

describe('DirtyTracker', () => {
  it('starts empty', () => {
    const tracker = new DirtyTracker<object>();
    expect(tracker.getDirtyItems()).toHaveLength(0);
    expect(tracker.size).toBe(0);
  });

  it('marks objects as dirty and returns them from getDirtyItems', () => {
    const tracker = new DirtyTracker<{ id: number }>();
    const a = { id: 1 };
    const b = { id: 2 };
    tracker.markDirty(a);
    tracker.markDirty(b);
    const items = tracker.getDirtyItems();
    expect(items).toHaveLength(2);
    expect(items).toContain(a);
    expect(items).toContain(b);
  });

  it('isDirty returns true for marked objects', () => {
    const tracker = new DirtyTracker<{ id: number }>();
    const obj = { id: 1 };
    expect(tracker.isDirty(obj)).toBe(false);
    tracker.markDirty(obj);
    expect(tracker.isDirty(obj)).toBe(true);
  });

  it('tracks object identity, not equality', () => {
    const tracker = new DirtyTracker<{ id: number }>();
    const a = { id: 1 };
    const b = { id: 1 }; // same shape, different reference
    tracker.markDirty(a);
    expect(tracker.isDirty(a)).toBe(true);
    expect(tracker.isDirty(b)).toBe(false);
    expect(tracker.getDirtyItems()).not.toContain(b);
  });

  it('size reflects the number of distinct dirty objects', () => {
    const tracker = new DirtyTracker<{ id: number }>();
    const a = { id: 1 };
    const b = { id: 2 };
    expect(tracker.size).toBe(0);
    tracker.markDirty(a);
    expect(tracker.size).toBe(1);
    tracker.markDirty(b);
    expect(tracker.size).toBe(2);
    // Marking same object again should not increase count
    tracker.markDirty(a);
    expect(tracker.size).toBe(2);
  });

  it('clearAll resets size and getDirtyItems', () => {
    const tracker = new DirtyTracker<{ id: number }>();
    const a = { id: 1 };
    tracker.markDirty(a);
    expect(tracker.size).toBe(1);
    tracker.clearAll();
    expect(tracker.size).toBe(0);
    expect(tracker.getDirtyItems()).toHaveLength(0);
    expect(tracker.isDirty(a)).toBe(false);
  });

  it('getDirtyItems returns a snapshot array safe to iterate', () => {
    const tracker = new DirtyTracker<{ id: number }>();
    const a = { id: 1 };
    const b = { id: 2 };
    tracker.markDirty(a);
    tracker.markDirty(b);
    const snapshot = tracker.getDirtyItems();
    // Mutate tracker after snapshot — snapshot should be unaffected
    const c = { id: 3 };
    tracker.markDirty(c);
    expect(snapshot).toHaveLength(2);
    expect(snapshot).not.toContain(c);
  });

  it('can re-mark objects dirty after clearAll', () => {
    const tracker = new DirtyTracker<{ id: number }>();
    const obj = { id: 1 };
    tracker.markDirty(obj);
    tracker.clearAll();
    tracker.markDirty(obj);
    expect(tracker.isDirty(obj)).toBe(true);
    expect(tracker.getDirtyItems()).toContain(obj);
  });

  it('works with typed element objects', () => {
    interface Element {
      id: string;
      value: number;
    }
    const tracker = new DirtyTracker<Element>();
    const el: Element = { id: 'e1', value: 42 };
    tracker.markDirty(el);
    expect(tracker.isDirty(el)).toBe(true);
    const items = tracker.getDirtyItems();
    expect(items[0]).toBe(el);
    expect(items[0].id).toBe('e1');
  });
});
