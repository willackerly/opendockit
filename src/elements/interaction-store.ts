/**
 * Interactive canvas state machine — headless, zero DOM deps.
 *
 * FSM modes: idle → selecting / marquee / drawing-rect → idle
 *
 * Compatible with React `useSyncExternalStore` via subscribe()/getSnapshot().
 * Thin DOM/framework adapters are separate leaf files (~50 LOC each).
 */

import type { PageElement } from './types.js';
import type { Rect } from './spatial.js';
import { elementAtPoint, queryElementsInRect } from './spatial.js';
import {
  viewportToPage,
  pageToViewport,
  pageRectToViewport,
  viewportRectToPage,
} from './coordinate-utils.js';
import type {
  Viewport,
  Modifiers,
  InteractionMode,
  InteractionSnapshot,
  InteractionEvent,
  StateListener,
  EventListener,
} from './interaction-types.js';

const NO_MODIFIERS: Modifiers = { shift: false, ctrl: false, alt: false };

export class InteractionStore {
  // ─── Internal state ──────────────────────────────────

  private _elements: PageElement[];
  private _viewport: Viewport;
  private _mode: InteractionMode = 'idle';
  private _selectedIds: Set<string> = new Set();
  private _hoveredId: string | null = null;

  // Active drag rect in VIEWPORT pixels (converted to page coords in snapshot)
  private _dragStartVx: number = 0;
  private _dragStartVy: number = 0;
  private _dragCurrentVx: number = 0;
  private _dragCurrentVy: number = 0;
  private _hasDragRect: boolean = false;

  // ─── Subscriptions ───────────────────────────────────

  private _stateListeners: Set<StateListener> = new Set();
  private _eventListeners: Set<EventListener> = new Set();
  private _snapshot: InteractionSnapshot | null = null;

  // ─── Constructor ─────────────────────────────────────

  constructor(elements: PageElement[], viewport: Viewport) {
    this._elements = elements;
    this._viewport = viewport;
  }

  // ─── useSyncExternalStore contract ───────────────────

  /** Subscribe to state changes. Returns unsubscribe function. */
  subscribe = (listener: StateListener): (() => void) => {
    this._stateListeners.add(listener);
    return () => { this._stateListeners.delete(listener); };
  };

  /** Get frozen, reference-stable snapshot. Cached until next notify(). */
  getSnapshot = (): InteractionSnapshot => {
    if (!this._snapshot) {
      this._snapshot = Object.freeze({
        mode: this._mode,
        selectedIds: new Set(this._selectedIds) as ReadonlySet<string>,
        hoveredId: this._hoveredId,
        selectionRect: this._computeSelectionRect(),
        viewport: this._viewport,
        elements: this._elements,
      });
    }
    return this._snapshot;
  };

  // ─── Event subscription ──────────────────────────────

  /** Subscribe to semantic events (selectionChanged, hoverChanged, rectDrawn). */
  onEvent(listener: EventListener): () => void {
    this._eventListeners.add(listener);
    return () => { this._eventListeners.delete(listener); };
  }

  // ─── Input methods (viewport pixel coords) ──────────

  pointerDown(vx: number, vy: number, modifiers: Modifiers = NO_MODIFIERS): void {
    const pagePoint = viewportToPage(this._viewport, vx, vy);
    const hit = elementAtPoint(this._elements, pagePoint.x, pagePoint.y);

    if (this._mode === 'drawing-rect') {
      // Start drawing rect
      this._dragStartVx = vx;
      this._dragStartVy = vy;
      this._dragCurrentVx = vx;
      this._dragCurrentVy = vy;
      this._hasDragRect = true;
      this._notify();
      return;
    }

    if (hit) {
      if (hit.locked) {
        // Locked elements are hoverable but not selectable
        return;
      }

      if (modifiers.shift) {
        // Toggle selection
        const newIds = new Set(this._selectedIds);
        if (newIds.has(hit.id)) {
          newIds.delete(hit.id);
        } else {
          newIds.add(hit.id);
        }
        this._setSelectedIds(newIds);
        // Stay idle — shift-click doesn't enter 'selecting' mode
      } else {
        // Click on element — select it and enter 'selecting'
        this._setSelectedIds(new Set([hit.id]));
        this._mode = 'selecting';
        this._notify();
      }
    } else {
      // Click on empty space — start marquee
      this._setSelectedIds(new Set());
      this._mode = 'marquee';
      this._dragStartVx = vx;
      this._dragStartVy = vy;
      this._dragCurrentVx = vx;
      this._dragCurrentVy = vy;
      this._hasDragRect = true;
      this._notify();
    }
  }

  pointerMove(vx: number, vy: number): void {
    if (this._mode === 'marquee' || this._mode === 'drawing-rect') {
      this._dragCurrentVx = vx;
      this._dragCurrentVy = vy;

      if (this._mode === 'marquee') {
        // Update selection based on marquee rect
        const pageRect = this._computeSelectionRect()!;
        const hits = queryElementsInRect(this._elements, pageRect);
        const newIds = new Set(hits.filter(el => !el.locked).map(el => el.id));
        this._setSelectedIds(newIds, false); // suppress separate notify — we notify below
      }

      this._notify();
      return;
    }

    // Hover detection (idle or selecting)
    const pagePoint = viewportToPage(this._viewport, vx, vy);
    const hit = elementAtPoint(this._elements, pagePoint.x, pagePoint.y);
    const newHoveredId = hit ? hit.id : null;

    if (newHoveredId !== this._hoveredId) {
      const previousId = this._hoveredId;
      this._hoveredId = newHoveredId;
      this._emit({ type: 'hoverChanged', hoveredId: newHoveredId, previousId });
      this._notify();
    }
  }

  pointerUp(vx: number, vy: number): void {
    if (this._mode === 'drawing-rect') {
      this._dragCurrentVx = vx;
      this._dragCurrentVy = vy;
      const pageRect = this._computeSelectionRect();
      this._hasDragRect = false;
      this._mode = 'idle';

      if (pageRect && pageRect.width > 0 && pageRect.height > 0) {
        this._emit({ type: 'rectDrawn', rect: pageRect });
      }
      this._notify();
      return;
    }

    if (this._mode === 'marquee') {
      // Finalize marquee — selection already updated during pointerMove
      this._hasDragRect = false;
      this._mode = 'idle';
      this._notify();
      return;
    }

    if (this._mode === 'selecting') {
      this._mode = 'idle';
      this._notify();
    }
  }

  keyDown(key: string, modifiers: Modifiers = NO_MODIFIERS): void {
    if (key === 'Escape') {
      if (this._mode === 'marquee' || this._mode === 'drawing-rect') {
        this._hasDragRect = false;
        this._mode = 'idle';
        this._notify();
      } else {
        this.clearSelection();
      }
      return;
    }

    if (key === 'a' && modifiers.ctrl) {
      this.selectAll();
    }
  }

  // ─── Programmatic API ────────────────────────────────

  setElements(elements: PageElement[]): void {
    this._elements = elements;
    // Prune selectedIds to only include elements still present
    const ids = new Set(elements.map(el => el.id));
    let changed = false;
    for (const id of this._selectedIds) {
      if (!ids.has(id)) {
        this._selectedIds.delete(id);
        changed = true;
      }
    }
    // Update hover
    if (this._hoveredId && !ids.has(this._hoveredId)) {
      this._hoveredId = null;
    }
    if (changed) {
      this._emit({ type: 'selectionChanged', selectedIds: new Set(this._selectedIds) });
    }
    this._notify();
  }

  setViewport(viewport: Viewport): void {
    this._viewport = viewport;
    this._notify();
  }

  selectAll(): void {
    const allIds = new Set(
      this._elements.filter(el => !el.locked).map(el => el.id),
    );
    this._setSelectedIds(allIds);
  }

  clearSelection(): void {
    if (this._selectedIds.size === 0) return;
    this._setSelectedIds(new Set());
  }

  selectElements(ids: string[]): void {
    this._setSelectedIds(new Set(ids));
  }

  setMode(mode: InteractionMode): void {
    this._mode = mode;
    if (mode !== 'marquee' && mode !== 'drawing-rect') {
      this._hasDragRect = false;
    }
    this._notify();
  }

  // ─── Coordinate conversion (public for adapters) ────

  viewportToPage(vx: number, vy: number): { x: number; y: number } {
    return viewportToPage(this._viewport, vx, vy);
  }

  pageToViewport(px: number, py: number): { x: number; y: number } {
    return pageToViewport(this._viewport, px, py);
  }

  pageRectToViewport(rect: Rect): Rect {
    return pageRectToViewport(this._viewport, rect);
  }

  viewportRectToPage(rect: Rect): Rect {
    return viewportRectToPage(this._viewport, rect);
  }

  // ─── Internals ───────────────────────────────────────

  /** Compute the active drag rect in PAGE coordinates, normalized for any drag direction. */
  private _computeSelectionRect(): Rect | null {
    if (!this._hasDragRect) return null;

    const x1 = Math.min(this._dragStartVx, this._dragCurrentVx);
    const y1 = Math.min(this._dragStartVy, this._dragCurrentVy);
    const x2 = Math.max(this._dragStartVx, this._dragCurrentVx);
    const y2 = Math.max(this._dragStartVy, this._dragCurrentVy);

    // Convert viewport rect to page coordinates
    const vpRect: Rect = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    return viewportRectToPage(this._viewport, vpRect);
  }

  private _setSelectedIds(ids: Set<string>, doNotify: boolean = true): void {
    if (this._setsEqual(this._selectedIds, ids)) return;
    this._selectedIds = ids;
    this._emit({ type: 'selectionChanged', selectedIds: new Set(ids) });
    if (doNotify) this._notify();
  }

  private _setsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const v of a) {
      if (!b.has(v)) return false;
    }
    return true;
  }

  private _notify(): void {
    this._snapshot = null; // invalidate cache
    this._emit({ type: 'stateChanged' });
    for (const listener of this._stateListeners) {
      listener();
    }
  }

  private _emit(event: InteractionEvent): void {
    for (const listener of this._eventListeners) {
      listener(event);
    }
  }
}
