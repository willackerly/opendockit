/**
 * ChangeTracker - Tracks modifications to PDF objects for incremental save.
 *
 * Records which indirect objects have been modified so the IncrementalWriter
 * knows which objects to include in the appended update section.
 */

export class ChangeTracker {
  private readonly _modified = new Map<string, { objectNumber: number; generation: number }>();

  /**
   * Record that an indirect object was modified.
   * Duplicate calls for the same object are deduplicated automatically.
   */
  trackModification(objectNumber: number, generation: number): void {
    const key = `${objectNumber}-${generation}`;
    this._modified.set(key, { objectNumber, generation });
  }

  /**
   * Get all modified object references.
   */
  getModifiedObjects(): Array<{ objectNumber: number; generation: number }> {
    return Array.from(this._modified.values());
  }

  /**
   * Whether any modifications have been tracked.
   */
  get hasChanges(): boolean {
    return this._modified.size > 0;
  }

  /**
   * Number of modified objects tracked.
   */
  get size(): number {
    return this._modified.size;
  }

  /**
   * Check if a specific object has been marked as modified.
   */
  isModified(objectNumber: number, generation: number): boolean {
    return this._modified.has(`${objectNumber}-${generation}`);
  }

  /**
   * Clear all tracked modifications.
   */
  clear(): void {
    this._modified.clear();
  }
}
