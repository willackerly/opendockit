/**
 * R-tree spatial index for O(log n) hit testing and range queries on PageElement[].
 *
 * Wraps rbush with PageElement-aware coordinate conversion. Elements are stored
 * by their axis-aligned bounding box (rotation is accounted for by expanding
 * to the AABB of the rotated rectangle).
 */

import RBush, { type BBox } from 'rbush';
import type { PageElement } from './types.js';

// ─── Internal item stored in the tree ───────────────────

interface IndexedItem extends BBox {
  /** Reference back to the original element. */
  element: PageElement;
  /** Original array index — used as z-order tiebreaker. */
  zOrder: number;
}

// ─── AABB helper for rotated elements ───────────────────

/**
 * Compute the axis-aligned bounding box for an element, accounting for
 * rotation around the element center.
 */
function elementAABB(el: PageElement): BBox {
  const rot = el.rotation;
  if (rot === 0) {
    return {
      minX: el.x,
      minY: el.y,
      maxX: el.x + el.width,
      maxY: el.y + el.height,
    };
  }

  // Corners relative to center, then rotate
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const hw = el.width / 2;
  const hh = el.height / 2;

  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // The four corners relative to center
  const corners: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [dx, dy] of corners) {
    const rx = cx + dx * cos - dy * sin;
    const ry = cy + dx * sin + dy * cos;
    minX = Math.min(minX, rx);
    minY = Math.min(minY, ry);
    maxX = Math.max(maxX, rx);
    maxY = Math.max(maxY, ry);
  }

  return { minX, minY, maxX, maxY };
}

// ─── Custom RBush subclass ──────────────────────────────

class ElementTree extends RBush<IndexedItem> {
  toBBox(item: IndexedItem): BBox {
    return item;
  }
  compareMinX(a: IndexedItem, b: IndexedItem): number {
    return a.minX - b.minX;
  }
  compareMinY(a: IndexedItem, b: IndexedItem): number {
    return a.minY - b.minY;
  }
}

// ─── Public API ─────────────────────────────────────────

export class SpatialIndex {
  private tree = new ElementTree();

  /** Number of elements currently indexed. */
  get size(): number {
    return this.tree.all().length;
  }

  /**
   * Bulk-load elements into the index. Clears any existing data first.
   * Elements are assumed to be in z-order (back to front) — the array index
   * is preserved as z-order for hit-test tiebreaking.
   */
  build(elements: ReadonlyArray<PageElement>): void {
    this.tree.clear();
    const items: IndexedItem[] = elements.map((element, i) => {
      const bbox = elementAABB(element);
      return { ...bbox, element, zOrder: i };
    });
    this.tree.load(items);
  }

  /**
   * Range query — find all elements whose AABB intersects the given rect.
   * Results are returned in z-order (back to front).
   */
  query(rect: { x: number; y: number; width: number; height: number }): PageElement[] {
    const results = this.tree.search({
      minX: rect.x,
      minY: rect.y,
      maxX: rect.x + rect.width,
      maxY: rect.y + rect.height,
    });
    // Sort by z-order (back to front)
    results.sort((a, b) => a.zOrder - b.zOrder);
    return results.map((item) => item.element);
  }

  /**
   * Point hit test — return the topmost element at (x, y), or null.
   * "Topmost" = highest z-order (last in the original array).
   */
  hitTest(x: number, y: number): PageElement | null {
    const results = this.tree.search({
      minX: x,
      minY: y,
      maxX: x,
      maxY: y,
    });
    if (results.length === 0) return null;

    // Return highest z-order
    let best = results[0];
    for (let i = 1; i < results.length; i++) {
      if (results[i].zOrder > best.zOrder) {
        best = results[i];
      }
    }
    return best.element;
  }

  /** Clear the index. */
  clear(): void {
    this.tree.clear();
  }
}
