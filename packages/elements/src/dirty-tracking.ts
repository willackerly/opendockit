/**
 * Dirty tracking primitives for the unified element model.
 *
 * WeakSet-based pattern mirrors both:
 *   - packages/core/src/edit/edit-tracker.ts (EditTracker)
 *   - packages/pdf-signer COSUpdateTracker
 *
 * Using a WeakSet means tracked objects can be garbage-collected if no other
 * references exist, preventing memory leaks in long-running editing sessions.
 *
 * The generic `DirtyTracker<T>` extends EditTracker with a strong-reference
 * Set to support `getDirtyItems()` — callers that need to enumerate all dirty
 * items must use the strong-ref variant (DirtyTracker), not WeakSet alone.
 */

// ─── WeakSet-only tracker (no enumeration needed) ───────

/**
 * Lightweight dirty tracker backed by a WeakSet.
 * Tracks object identity only — no enumeration support.
 * Use this when you only need isDirty() checks.
 */
export class WeakDirtyTracker {
  private dirty = new WeakSet<object>();

  /** Mark an object as dirty (modified since last save/reset). */
  markDirty(obj: object): void {
    this.dirty.add(obj);
  }

  /** Check if an object has been modified. */
  isDirty(obj: object): boolean {
    return this.dirty.has(obj);
  }

  /** Reset all dirty state (e.g., after save). Creates a fresh WeakSet. */
  clearAll(): void {
    this.dirty = new WeakSet<object>();
  }
}

// ─── Strong-ref tracker (supports enumeration) ──────────

/**
 * Dirty tracker with enumeration support.
 *
 * Maintains both a WeakSet (for cheap identity lookups) and a regular Set
 * (for getDirtyItems() enumeration). The strong Set keeps objects alive
 * until clearAll() is called — callers must call clearAll() after a save
 * to release references.
 *
 * @template T - The type of tracked objects. Must extend object.
 */
export class DirtyTracker<T extends object> {
  private weakDirty = new WeakSet<T>();
  private strongDirty = new Set<T>();

  /** Mark an object as dirty (modified since last save/reset). */
  markDirty(obj: T): void {
    this.weakDirty.add(obj);
    this.strongDirty.add(obj);
  }

  /** Check if an object has been modified. */
  isDirty(obj: T): boolean {
    return this.weakDirty.has(obj);
  }

  /**
   * Get all currently dirty items.
   * Returns a snapshot array — safe to iterate even if markDirty() is called concurrently.
   */
  getDirtyItems(): T[] {
    return Array.from(this.strongDirty);
  }

  /**
   * Reset all dirty state (e.g., after save).
   * Clears both the WeakSet and the strong Set, releasing all held references.
   */
  clearAll(): void {
    this.weakDirty = new WeakSet<T>();
    this.strongDirty = new Set<T>();
  }

  /** Returns the number of currently dirty items. */
  get size(): number {
    return this.strongDirty.size;
  }
}
