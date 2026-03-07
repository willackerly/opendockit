import type { COSBase } from './COSBase';

/**
 * Minimal COSUpdateInfo equivalent that tracks which COS objects were mutated
 * so the incremental writer can decide whether they need to be serialized in
 * the incremental update. Backed by a WeakSet so references don't leak.
 */
export class COSUpdateTracker {
  private updated = new WeakSet<COSBase>();

  markUpdated(object: COSBase | undefined | null): void {
    if (object) {
      this.updated.add(object);
    }
  }

  isUpdated(object: COSBase | undefined | null): boolean {
    return !!object && this.updated.has(object);
  }

  clear(object: COSBase | undefined | null): void {
    if (object) {
      this.updated.delete(object);
    }
  }

  reset(): void {
    this.updated = new WeakSet();
  }
}

export const globalUpdateTracker = new COSUpdateTracker();

export function markObjectUpdated(object: COSBase | undefined | null): void {
  globalUpdateTracker.markUpdated(object);
}

export function isObjectUpdated(object: COSBase | undefined | null): boolean {
  return globalUpdateTracker.isUpdated(object);
}

export function clearObjectUpdated(object: COSBase | undefined | null): void {
  globalUpdateTracker.clear(object);
}

export function resetUpdateTracking(): void {
  globalUpdateTracker.reset();
}
