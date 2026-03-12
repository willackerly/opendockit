import { describe, it, expect } from 'vitest';
import { ChangeTracker } from '../change-tracker';

describe('ChangeTracker', () => {
  it('should start with no changes', () => {
    const tracker = new ChangeTracker();
    expect(tracker.hasChanges).toBe(false);
    expect(tracker.size).toBe(0);
    expect(tracker.getModifiedObjects()).toEqual([]);
  });

  it('should track a single modification', () => {
    const tracker = new ChangeTracker();
    tracker.trackModification(5, 0);

    expect(tracker.hasChanges).toBe(true);
    expect(tracker.size).toBe(1);
    expect(tracker.getModifiedObjects()).toEqual([
      { objectNumber: 5, generation: 0 },
    ]);
  });

  it('should track multiple modifications', () => {
    const tracker = new ChangeTracker();
    tracker.trackModification(5, 0);
    tracker.trackModification(10, 0);
    tracker.trackModification(3, 1);

    expect(tracker.size).toBe(3);
    const objects = tracker.getModifiedObjects();
    expect(objects).toHaveLength(3);
    expect(objects).toContainEqual({ objectNumber: 5, generation: 0 });
    expect(objects).toContainEqual({ objectNumber: 10, generation: 0 });
    expect(objects).toContainEqual({ objectNumber: 3, generation: 1 });
  });

  it('should deduplicate tracking of the same object', () => {
    const tracker = new ChangeTracker();
    tracker.trackModification(5, 0);
    tracker.trackModification(5, 0);
    tracker.trackModification(5, 0);

    expect(tracker.size).toBe(1);
    expect(tracker.getModifiedObjects()).toEqual([
      { objectNumber: 5, generation: 0 },
    ]);
  });

  it('should distinguish objects with different generation numbers', () => {
    const tracker = new ChangeTracker();
    tracker.trackModification(5, 0);
    tracker.trackModification(5, 1);

    expect(tracker.size).toBe(2);
  });

  it('should report isModified correctly', () => {
    const tracker = new ChangeTracker();
    tracker.trackModification(5, 0);

    expect(tracker.isModified(5, 0)).toBe(true);
    expect(tracker.isModified(5, 1)).toBe(false);
    expect(tracker.isModified(6, 0)).toBe(false);
  });

  it('should clear all tracked modifications', () => {
    const tracker = new ChangeTracker();
    tracker.trackModification(5, 0);
    tracker.trackModification(10, 0);

    expect(tracker.hasChanges).toBe(true);

    tracker.clear();

    expect(tracker.hasChanges).toBe(false);
    expect(tracker.size).toBe(0);
    expect(tracker.getModifiedObjects()).toEqual([]);
    expect(tracker.isModified(5, 0)).toBe(false);
  });

  it('should allow tracking after clear', () => {
    const tracker = new ChangeTracker();
    tracker.trackModification(5, 0);
    tracker.clear();
    tracker.trackModification(10, 0);

    expect(tracker.size).toBe(1);
    expect(tracker.getModifiedObjects()).toEqual([
      { objectNumber: 10, generation: 0 },
    ]);
  });
});
