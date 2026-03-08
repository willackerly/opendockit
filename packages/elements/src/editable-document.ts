/**
 * EditableDocument — format-agnostic base class for mutable document editing.
 *
 * Provides common mutation operations (move, resize, delete) with dirty
 * tracking and a zero-alloc fast path for deriveElement(). Format-specific
 * subclasses (PPTX, PDF) extend this class and implement save().
 *
 * Coordinate system: all spatial values are in POINTS (1/72 inch).
 */

import type { PageElement, PdfSource, PptxSource } from './types.js';
import { DirtyTracker } from './dirty-tracking.js';

// ---------------------------------------------------------------------------
// Source type constraint
// ---------------------------------------------------------------------------

/**
 * Source type constraint — must be either PdfSource or PptxSource.
 */
export type DocumentSource = PdfSource | PptxSource;

// ---------------------------------------------------------------------------
// EditableElement
// ---------------------------------------------------------------------------

/**
 * An editable element wrapping a PageElement with mutation tracking.
 *
 * The `element` field is the current (possibly mutated) state.
 * The `_originalElement` field holds the immutable snapshot taken at load
 * time, used by the zero-alloc fast path in deriveElement().
 */
export interface EditableElement<TSource extends DocumentSource = DocumentSource> {
  /** Unique element ID within the document. */
  readonly id: string;
  /** Current element state (may reflect mutations). */
  element: PageElement;
  /** Format-specific source data for lossless round-trip. */
  readonly source: TSource;
  /** Whether this element has been modified. */
  readonly dirty: boolean;
  /**
   * Immutable snapshot of the element as it was at load time.
   * Used by deriveElement() for the zero-alloc fast path.
   * @internal
   */
  readonly _originalElement: Readonly<PageElement>;
}

// ---------------------------------------------------------------------------
// InteractionState
// ---------------------------------------------------------------------------

/**
 * Transient interaction state for the editing UI.
 * Mutated directly (not tracked as dirty document mutations).
 */
export interface InteractionState {
  /** Currently selected element IDs. */
  selectedIds: Set<string>;
  /** Element being actively dragged (null if none). */
  dragTarget: string | null;
  /** Current drag offset from drag-start position (points). */
  dragOffset: { dx: number; dy: number } | null;
  /** Element being resized (null if none). */
  resizeTarget: string | null;
}

// ---------------------------------------------------------------------------
// EditableDocument base class
// ---------------------------------------------------------------------------

/**
 * Base class for editable documents.
 *
 * Provides format-agnostic mutation operations (move, resize, delete)
 * with dirty tracking. Format-specific subclasses implement save().
 *
 * Zero-alloc fast path: deriveElement() returns the original PageElement
 * object reference for unmodified elements. Only dirty elements get a
 * new object (shallow copy with mutations applied).
 */
export abstract class EditableDocument<TSource extends DocumentSource> {
  protected readonly tracker: DirtyTracker<EditableElement<TSource>>;
  protected readonly elements: Map<string, EditableElement<TSource>>;
  protected readonly deletedIds: Set<string>;
  readonly interaction: InteractionState;

  constructor() {
    this.tracker = new DirtyTracker<EditableElement<TSource>>();
    this.elements = new Map<string, EditableElement<TSource>>();
    this.deletedIds = new Set<string>();
    this.interaction = {
      selectedIds: new Set<string>(),
      dragTarget: null,
      dragOffset: null,
      resizeTarget: null,
    };
  }

  // -------------------------------------------------------------------------
  // Query
  // -------------------------------------------------------------------------

  /** Get an element by ID (returns undefined if not found or deleted). */
  getElement(id: string): EditableElement<TSource> | undefined {
    if (this.deletedIds.has(id)) return undefined;
    return this.elements.get(id);
  }

  /** Get all non-deleted elements, in insertion order. */
  getElements(): EditableElement<TSource>[] {
    const result: EditableElement<TSource>[] = [];
    for (const el of this.elements.values()) {
      if (!this.deletedIds.has(el.id)) {
        result.push(el);
      }
    }
    return result;
  }

  /** Get all elements that have been modified (dirty). */
  getDirtyElements(): EditableElement<TSource>[] {
    const result: EditableElement<TSource>[] = [];
    for (const el of this.elements.values()) {
      if (this.tracker.isDirty(el)) {
        result.push(el);
      }
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Mutations (auto-mark dirty)
  // -------------------------------------------------------------------------

  /**
   * Move an element by a delta (points).
   * Throws if the element does not exist or has been deleted.
   */
  moveElement(id: string, dx: number, dy: number): void {
    const el = this.requireElement(id);
    el.element = { ...el.element, x: el.element.x + dx, y: el.element.y + dy };
    this.tracker.markDirty(el);
  }

  /**
   * Resize an element to new absolute dimensions (points).
   * Throws if the element does not exist or has been deleted.
   */
  resizeElement(id: string, width: number, height: number): void {
    const el = this.requireElement(id);
    el.element = { ...el.element, width, height };
    this.tracker.markDirty(el);
  }

  /**
   * Soft-delete an element. Deleted elements are excluded from getElements()
   * and deriveElement() returns null.
   * Throws if the element does not exist or has already been deleted.
   */
  deleteElement(id: string): void {
    const el = this.requireElement(id);
    this.deletedIds.add(id);
    this.tracker.markDirty(el);
  }

  // -------------------------------------------------------------------------
  // Derivation
  // -------------------------------------------------------------------------

  /**
   * Derive the current visual state of an element.
   *
   * Zero-alloc fast path: returns the original PageElement reference if the
   * element has not been modified (same object identity, no copy).
   *
   * Returns null if the element was deleted or does not exist.
   */
  deriveElement(id: string): PageElement | null {
    if (this.deletedIds.has(id)) return null;

    const el = this.elements.get(id);
    if (el === undefined) return null;

    // Fast path: not dirty → return original (zero allocation)
    if (!this.tracker.isDirty(el)) {
      return el._originalElement as PageElement;
    }

    // Slow path: return the current (mutated) element state
    return el.element;
  }

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------

  /** Add an element to the current selection. */
  select(id: string): void {
    this.interaction.selectedIds.add(id);
  }

  /** Remove an element from the current selection. */
  deselect(id: string): void {
    this.interaction.selectedIds.delete(id);
  }

  /** Clear all selections. */
  clearSelection(): void {
    this.interaction.selectedIds.clear();
  }

  // -------------------------------------------------------------------------
  // Abstract (format-specific)
  // -------------------------------------------------------------------------

  /** Serialise the document with all mutations applied. */
  abstract save(): Promise<Uint8Array>;

  /**
   * Load elements from the format-specific document.
   * Subclasses call this from their constructor (or a factory method) to
   * populate the element registry.
   * @internal
   */
  protected abstract loadElements(): EditableElement<TSource>[];

  // -------------------------------------------------------------------------
  // Protected helpers
  // -------------------------------------------------------------------------

  /**
   * Register loaded elements into the internal map.
   * Subclasses should call this after loadElements() returns.
   */
  protected registerElements(loaded: EditableElement<TSource>[]): void {
    for (const el of loaded) {
      this.elements.set(el.id, el);
    }
  }

  /**
   * Require an element by ID; throw if missing or deleted.
   */
  protected requireElement(id: string): EditableElement<TSource> {
    if (this.deletedIds.has(id)) {
      throw new Error(`Element has been deleted: ${id}`);
    }
    const el = this.elements.get(id);
    if (el === undefined) {
      throw new Error(`Element not found: ${id}`);
    }
    return el;
  }
}
