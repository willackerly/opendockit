/**
 * EditablePresentation -- the top-level mutable container for a presentation.
 *
 * Holds a flat registry of all editable elements, provides mutation methods
 * (move, resize, setText, setFill, delete), and tracks which parts are dirty
 * for incremental save.
 *
 * This mirrors the pdfbox-ts pattern where COSUpdateTracker tracks modified
 * COS objects, enabling minimal-diff saves.
 */

import type {
  EditableElement,
  EditableShape,
  EditableParagraph,
} from './editable-types.js';
import type { FillIR } from '../ir/index.js';
import { EditTracker } from './edit-tracker.js';

/** A slide in the editable presentation. */
export interface EditableSlide {
  /** Slide index (0-based). */
  readonly index: number;
  /** OPC part URI for this slide. */
  readonly partUri: string;
  /** Elements on this slide. */
  readonly elements: EditableElement[];
}

/**
 * Mutable presentation model with dirty tracking.
 *
 * Constructed from parsed IR, this class provides:
 * - O(1) element lookup by composite ID
 * - Mutation methods that automatically mark elements dirty
 * - Dirty-part queries for incremental save
 * - Slide reordering and deletion
 */
export class EditablePresentation {
  private readonly tracker = new EditTracker();
  private readonly elementRegistry = new Map<string, EditableElement>();
  private readonly slides: EditableSlide[];
  /** Raw XML text per part, captured on load for reconstitution. */
  readonly originalPartXml: Map<string, string>;
  /** Slide order tracking -- slide part URIs in presentation order. */
  private slideOrder: string[];
  /** Deleted slide indices. */
  private deletedSlides = new Set<number>();

  constructor(
    slides: EditableSlide[],
    originalPartXml: Map<string, string>,
  ) {
    this.slides = slides;
    this.originalPartXml = originalPartXml;
    this.slideOrder = slides.map((s) => s.partUri);

    // Register all elements (including group children)
    for (const slide of slides) {
      for (const el of slide.elements) {
        this.elementRegistry.set(el.id, el);
        if (el.kind === 'group') {
          this.registerGroupChildren(el);
        }
      }
    }
  }

  private registerGroupChildren(group: {
    kind: 'group';
    children: EditableElement[];
  }): void {
    for (const child of group.children) {
      this.elementRegistry.set(child.id, child);
      if (child.kind === 'group') {
        this.registerGroupChildren(child);
      }
    }
  }

  /** Get an element by ID. */
  getElement(id: string): EditableElement | undefined {
    return this.elementRegistry.get(id);
  }

  /** Get all slides (in current order). */
  getSlides(): readonly EditableSlide[] {
    return this.slides;
  }

  /** Move an element by delta EMU. */
  moveElement(id: string, dx: number, dy: number): void {
    const el = this.requireElement(id);
    el.transform.x = el.transform.x + dx;
    el.transform.y = el.transform.y + dy;
    el.dirty.position = true;
    this.tracker.markDirty(el);
  }

  /** Resize an element to new dimensions (EMU). */
  resizeElement(id: string, width: number, height: number): void {
    const el = this.requireElement(id);
    el.transform.width = width;
    el.transform.height = height;
    el.dirty.size = true;
    this.tracker.markDirty(el);
  }

  /** Set text content for a shape. */
  setText(id: string, paragraphs: EditableParagraph[]): void {
    const el = this.requireElement(id);
    if (el.kind !== 'shape') {
      throw new Error(`Cannot set text on element kind '${el.kind}'`);
    }
    (el as EditableShape).textEdits = { paragraphs };
    el.dirty.text = true;
    this.tracker.markDirty(el);
  }

  /** Override fill for a shape. */
  setFill(id: string, fill: FillIR): void {
    const el = this.requireElement(id);
    if (el.kind !== 'shape') {
      throw new Error(`Cannot set fill on element kind '${el.kind}'`);
    }
    (el as EditableShape).fillOverride = fill;
    el.dirty.fill = true;
    this.tracker.markDirty(el);
  }

  /** Soft-delete an element. */
  deleteElement(id: string): void {
    const el = this.requireElement(id);
    el.deleted = true;
    el.dirty.deleted = true;
    this.tracker.markDirty(el);
  }

  /** Reorder slides by moving a slide from one index to another. */
  reorderSlides(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.slideOrder.length) {
      throw new RangeError(`Invalid fromIndex: ${fromIndex}`);
    }
    if (toIndex < 0 || toIndex >= this.slideOrder.length) {
      throw new RangeError(`Invalid toIndex: ${toIndex}`);
    }
    const [removed] = this.slideOrder.splice(fromIndex, 1);
    this.slideOrder.splice(toIndex, 0, removed);
  }

  /** Delete a slide by index. */
  deleteSlide(index: number): void {
    if (index < 0 || index >= this.slides.length) {
      throw new RangeError(`Invalid slide index: ${index}`);
    }
    this.deletedSlides.add(index);
  }

  /** Get part URIs that contain dirty elements. */
  getDirtyParts(): string[] {
    const dirtyParts = new Set<string>();
    for (const el of this.elementRegistry.values()) {
      if (this.tracker.isDirty(el)) {
        dirtyParts.add(el.originalPartUri);
      }
    }
    return [...dirtyParts];
  }

  /** Get all dirty elements for a given part. */
  getDirtyElementsForPart(partUri: string): EditableElement[] {
    const result: EditableElement[] = [];
    for (const el of this.elementRegistry.values()) {
      if (el.originalPartUri === partUri && this.tracker.isDirty(el)) {
        result.push(el);
      }
    }
    return result;
  }

  /** Check if the slide order has changed. */
  isSlideOrderDirty(): boolean {
    if (this.deletedSlides.size > 0) return true;
    for (let i = 0; i < this.slides.length; i++) {
      if (this.slideOrder[i] !== this.slides[i].partUri) return true;
    }
    return false;
  }

  /** Get the current slide order (part URIs), excluding deleted slides. */
  getSlideOrder(): string[] {
    // Build set of deleted slide part URIs
    const deletedPartUris = new Set<string>();
    for (const idx of this.deletedSlides) {
      if (idx < this.slides.length) {
        deletedPartUris.add(this.slides[idx].partUri);
      }
    }
    return this.slideOrder.filter((uri) => !deletedPartUris.has(uri));
  }

  /** Get deleted slide indices. */
  getDeletedSlides(): Set<number> {
    return new Set(this.deletedSlides);
  }

  /** Check if an element is dirty. */
  isElementDirty(id: string): boolean {
    const el = this.elementRegistry.get(id);
    return el !== undefined && this.tracker.isDirty(el);
  }

  /** Reset all dirty tracking (call after save). */
  resetDirtyState(): void {
    this.tracker.reset();
    for (const el of this.elementRegistry.values()) {
      el.dirty = {};
    }
  }

  private requireElement(id: string): EditableElement {
    const el = this.elementRegistry.get(id);
    if (el === undefined) {
      throw new Error(`Element not found: ${id}`);
    }
    if (el.deleted) {
      throw new Error(`Element has been deleted: ${id}`);
    }
    return el;
  }
}
