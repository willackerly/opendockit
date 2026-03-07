# Dirty Tracking: COSUpdateTracker

## Overview

`COSUpdateTracker` is a lightweight change-tracking mechanism that records which COS (Carousel Object System) objects have been mutated since the last save or reset. This enables the **incremental writer** to serialize only changed objects into the PDF update section, rather than rewriting the entire document.

## Implementation

**File:** `src/pdfbox/cos/COSUpdateInfo.ts`

The tracker uses a `WeakSet<COSBase>` internally:

```typescript
export class COSUpdateTracker {
  private updated = new WeakSet<COSBase>();

  markUpdated(object: COSBase | undefined | null): void {
    if (object) this.updated.add(object);
  }

  isUpdated(object: COSBase | undefined | null): boolean {
    return !!object && this.updated.has(object);
  }

  clear(object: COSBase | undefined | null): void {
    if (object) this.updated.delete(object);
  }

  reset(): void {
    this.updated = new WeakSet();
  }
}
```

A **global singleton** instance is exported along with convenience functions:

```typescript
export const globalUpdateTracker = new COSUpdateTracker();

export function markObjectUpdated(object: COSBase | undefined | null): void { ... }
export function isObjectUpdated(object: COSBase | undefined | null): boolean { ... }
export function clearObjectUpdated(object: COSBase | undefined | null): void { ... }
export function resetUpdateTracking(): void { ... }
```

## How COS Objects Auto-Mark on Mutation

COS container types (`COSDictionary`, `COSArray`, `COSString`) call `markObjectUpdated(this)` in every mutating method. This makes dirty tracking automatic -- callers never need to manually mark objects.

**COSDictionary** marks on `setItem()` and `removeItem()`:

```typescript
setItem(key: COSName | string, value: COSBase): void {
  const keyName = typeof key === 'string' ? key : key.getName();
  this.items.set(keyName, value);
  markObjectUpdated(this);  // <-- auto-mark
}
```

**COSArray** marks on `add()`, `set()`, `remove()`, and `insert()`:

```typescript
add(element: COSBase): void {
  this.elements.push(element);
  markObjectUpdated(this);  // <-- auto-mark
}
```

**COSString** marks when value or hex mode changes in the constructor.

## How the Incremental Writer Queries Dirty State

`COSWriter` (in `src/pdfbox/writer/COSWriter.ts`) checks `isObjectUpdated()` to decide whether a COS object needs to be written into the incremental update section:

```typescript
// Skip objects that were already written and haven't changed since
if (this.writtenObjects.has(object) && !isObjectUpdated(object)) {
  return false;
}
```

After successfully writing an object, the writer clears its dirty flag:

```typescript
clearObjectUpdated(object);
```

This ensures that if the same document is saved again, only objects modified after the first save are re-serialized.

## How reset() Works

`reset()` replaces the internal `WeakSet` with a fresh instance:

```typescript
reset(): void {
  this.updated = new WeakSet();
}
```

This is more efficient than iterating and clearing each entry. The old `WeakSet` becomes unreachable and is garbage-collected along with any weak references it held. Objects themselves are not affected -- they are only weakly referenced and their lifecycle is independent of the tracker.

This design is intentionally GC-friendly: there are no strong references from the tracker to tracked objects, so objects that go out of scope elsewhere are automatically cleaned up.

## Why WeakSet?

- **No memory leaks.** COS objects can be garbage-collected even while the tracker is alive. A regular `Set` would keep objects alive indefinitely.
- **O(1) lookups.** Checking dirty state is a constant-time hash lookup.
- **No enumeration needed.** The incremental writer walks the object graph itself -- it only needs to query individual objects, not iterate all dirty objects.

The tradeoff is that `WeakSet` is not enumerable, so you cannot ask "give me all dirty objects." This is acceptable because the writer already traverses the object tree and checks each object individually.

## Cross-Reference: OpenDocKit EditTracker

OpenDocKit's `EditTracker` (in `packages/core/src/edit/edit-tracker.ts`) mirrors this pattern exactly. Its doc comment says:

> *"Mirrors the pdfbox-ts COSUpdateTracker pattern: a WeakSet-based registry that records which objects have been modified since the last save/reset."*

The API surface is nearly identical:

| pdfbox-ts `COSUpdateTracker` | OpenDocKit `EditTracker` |
| --- | --- |
| `markUpdated(obj)` | `markDirty(obj)` |
| `isUpdated(obj)` | `isDirty(obj)` |
| `reset()` | `reset()` |
| `clear(obj)` | *(not needed yet)* |

Both use `WeakSet` internally and replace it on `reset()` for GC-friendly bulk clearing.
