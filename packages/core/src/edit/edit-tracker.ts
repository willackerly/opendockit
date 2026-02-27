/**
 * Dirty tracking for editable elements.
 *
 * Mirrors the pdfbox-ts COSUpdateTracker pattern: a WeakSet-based registry
 * that records which objects have been modified since the last save/reset.
 *
 * Using a WeakSet means that tracked objects can be garbage-collected if no
 * other references exist, preventing memory leaks in long-running sessions.
 */
export class EditTracker {
  private dirty = new WeakSet<object>();

  /** Mark an object as dirty (modified since last save). */
  markDirty(obj: object): void {
    this.dirty.add(obj);
  }

  /** Check if an object has been modified. */
  isDirty(obj: object): boolean {
    return this.dirty.has(obj);
  }

  /** Reset all dirty state (e.g., after save). Creates a fresh WeakSet. */
  reset(): void {
    this.dirty = new WeakSet<object>();
  }
}
