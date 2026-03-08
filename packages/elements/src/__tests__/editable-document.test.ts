/**
 * Tests for EditableDocument base class.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EditableDocument } from '../editable-document.js';
import type { EditableElement } from '../editable-document.js';
import type { PageElement, PptxSource } from '../types.js';

// ---------------------------------------------------------------------------
// Concrete test subclass
// ---------------------------------------------------------------------------

function makePptxSource(id: string): PptxSource {
  return {
    kind: 'pptx',
    partUri: '/ppt/slides/slide1.xml',
    shapeId: id,
    elementId: `/ppt/slides/slide1.xml#${id}`,
  };
}

function makeShapeElement(id: string, x = 0, y = 0, w = 100, h = 50): PageElement {
  return { kind: 'shape', id, x, y, width: w, height: h };
}

function makeEditableElement(
  pageEl: PageElement,
  source: PptxSource,
): EditableElement<PptxSource> {
  return {
    id: pageEl.id,
    element: pageEl,
    source,
    get dirty() {
      // Computed by the tracker — this field isn't used directly in tests,
      // but must satisfy the interface. The tracker on the document is the
      // authoritative source.
      return false;
    },
    _originalElement: Object.freeze({ ...pageEl }),
  };
}

class TestEditableDocument extends EditableDocument<PptxSource> {
  constructor(pageElements: PageElement[]) {
    super();
    const loaded = this.loadElements(pageElements);
    this.registerElements(loaded);
  }

  async save(): Promise<Uint8Array> {
    return new Uint8Array();
  }

  protected loadElements(pageElements?: PageElement[]): EditableElement<PptxSource>[] {
    if (!pageElements) return [];
    return pageElements.map((el) => makeEditableElement(el, makePptxSource(el.id)));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(...ids: string[]): TestEditableDocument {
  return new TestEditableDocument(
    ids.map((id, i) => makeShapeElement(id, i * 10, i * 10, 100, 50)),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EditableDocument', () => {
  describe('constructor', () => {
    it('creates empty state when no elements provided', () => {
      const doc = new TestEditableDocument([]);
      expect(doc.getElements()).toHaveLength(0);
      expect(doc.getDirtyElements()).toHaveLength(0);
      expect(doc.interaction.selectedIds.size).toBe(0);
      expect(doc.interaction.dragTarget).toBeNull();
      expect(doc.interaction.dragOffset).toBeNull();
      expect(doc.interaction.resizeTarget).toBeNull();
    });

    it('registers provided elements', () => {
      const doc = makeDoc('a', 'b', 'c');
      expect(doc.getElements()).toHaveLength(3);
    });
  });

  describe('getElement', () => {
    it('retrieves an element by ID', () => {
      const doc = makeDoc('foo');
      const el = doc.getElement('foo');
      expect(el).toBeDefined();
      expect(el?.id).toBe('foo');
    });

    it('returns undefined for unknown ID', () => {
      const doc = makeDoc('foo');
      expect(doc.getElement('bar')).toBeUndefined();
    });

    it('returns undefined for deleted elements', () => {
      const doc = makeDoc('foo');
      doc.deleteElement('foo');
      expect(doc.getElement('foo')).toBeUndefined();
    });
  });

  describe('getElements', () => {
    it('returns all non-deleted elements', () => {
      const doc = makeDoc('a', 'b', 'c');
      doc.deleteElement('b');
      const ids = doc.getElements().map((e) => e.id);
      expect(ids).toEqual(['a', 'c']);
    });

    it('returns empty array when all deleted', () => {
      const doc = makeDoc('a');
      doc.deleteElement('a');
      expect(doc.getElements()).toHaveLength(0);
    });
  });

  describe('moveElement', () => {
    it('updates position by delta', () => {
      const doc = makeDoc('a');
      doc.moveElement('a', 30, 20);
      const el = doc.getElement('a')!;
      expect(el.element.x).toBe(0 + 30); // initial x=0 (id 'a' is index 0)
      expect(el.element.y).toBe(0 + 20);
    });

    it('marks element dirty', () => {
      const doc = makeDoc('a');
      expect(doc.getDirtyElements()).toHaveLength(0);
      doc.moveElement('a', 5, 5);
      expect(doc.getDirtyElements()).toHaveLength(1);
      expect(doc.getDirtyElements()[0].id).toBe('a');
    });

    it('accumulates multiple moves', () => {
      const doc = makeDoc('a');
      doc.moveElement('a', 10, 0);
      doc.moveElement('a', 5, 3);
      const el = doc.getElement('a')!;
      expect(el.element.x).toBe(15);
      expect(el.element.y).toBe(3);
    });

    it('throws for unknown element', () => {
      const doc = makeDoc('a');
      expect(() => doc.moveElement('unknown', 1, 1)).toThrow('Element not found: unknown');
    });

    it('throws for deleted element', () => {
      const doc = makeDoc('a');
      doc.deleteElement('a');
      expect(() => doc.moveElement('a', 1, 1)).toThrow('Element has been deleted: a');
    });
  });

  describe('resizeElement', () => {
    it('updates width and height', () => {
      const doc = makeDoc('a');
      doc.resizeElement('a', 200, 150);
      const el = doc.getElement('a')!;
      expect(el.element.width).toBe(200);
      expect(el.element.height).toBe(150);
    });

    it('marks element dirty', () => {
      const doc = makeDoc('a');
      doc.resizeElement('a', 200, 100);
      expect(doc.getDirtyElements()).toHaveLength(1);
    });

    it('throws for unknown element', () => {
      const doc = makeDoc('a');
      expect(() => doc.resizeElement('unknown', 10, 10)).toThrow('Element not found: unknown');
    });

    it('throws for deleted element', () => {
      const doc = makeDoc('a');
      doc.deleteElement('a');
      expect(() => doc.resizeElement('a', 10, 10)).toThrow('Element has been deleted: a');
    });
  });

  describe('deleteElement', () => {
    it('removes element from getElements()', () => {
      const doc = makeDoc('a', 'b');
      doc.deleteElement('a');
      const ids = doc.getElements().map((e) => e.id);
      expect(ids).not.toContain('a');
      expect(ids).toContain('b');
    });

    it('marks the element dirty', () => {
      const doc = makeDoc('a');
      doc.deleteElement('a');
      // getDirtyElements includes all dirty elements (including deleted)
      expect(doc.getDirtyElements()).toHaveLength(1);
    });

    it('throws for unknown element', () => {
      const doc = makeDoc('a');
      expect(() => doc.deleteElement('unknown')).toThrow('Element not found: unknown');
    });

    it('throws on double-delete', () => {
      const doc = makeDoc('a');
      doc.deleteElement('a');
      expect(() => doc.deleteElement('a')).toThrow('Element has been deleted: a');
    });
  });

  describe('deriveElement', () => {
    it('returns original object reference for clean elements (zero-alloc fast path)', () => {
      const doc = makeDoc('a');
      const el = doc.getElement('a')!;
      const derived = doc.deriveElement('a');
      // Must be the exact same object reference as _originalElement
      expect(derived).toBe(el._originalElement);
    });

    it('returns updated element for dirty elements', () => {
      const doc = makeDoc('a');
      const originalEl = doc.getElement('a')!._originalElement;
      doc.moveElement('a', 50, 50);
      const derived = doc.deriveElement('a');
      // Should NOT be the original reference
      expect(derived).not.toBe(originalEl);
      // But should reflect the mutation
      expect(derived?.x).toBe(50);
      expect(derived?.y).toBe(50);
    });

    it('returns null for deleted elements', () => {
      const doc = makeDoc('a');
      doc.deleteElement('a');
      expect(doc.deriveElement('a')).toBeNull();
    });

    it('returns null for unknown element', () => {
      const doc = makeDoc('a');
      expect(doc.deriveElement('unknown')).toBeNull();
    });

    it('preserves original element after multiple dirty mutations', () => {
      const doc = makeDoc('a');
      const original = doc.getElement('a')!._originalElement;
      doc.moveElement('a', 10, 0);
      doc.resizeElement('a', 300, 200);
      // Original should be unchanged
      expect(original.x).toBe(0);
      expect(original.width).toBe(100);
      // Derived should reflect all mutations
      const derived = doc.deriveElement('a')!;
      expect(derived.x).toBe(10);
      expect(derived.width).toBe(300);
    });
  });

  describe('getDirtyElements', () => {
    it('returns empty array when nothing is modified', () => {
      const doc = makeDoc('a', 'b', 'c');
      expect(doc.getDirtyElements()).toHaveLength(0);
    });

    it('returns only modified elements', () => {
      const doc = makeDoc('a', 'b', 'c');
      doc.moveElement('b', 1, 1);
      const dirty = doc.getDirtyElements();
      expect(dirty).toHaveLength(1);
      expect(dirty[0].id).toBe('b');
    });

    it('includes deleted elements', () => {
      const doc = makeDoc('a', 'b');
      doc.deleteElement('a');
      doc.moveElement('b', 5, 5);
      expect(doc.getDirtyElements()).toHaveLength(2);
    });

    it('includes elements marked dirty by move and resize independently', () => {
      const doc = makeDoc('a', 'b', 'c');
      doc.moveElement('a', 1, 1);
      doc.resizeElement('c', 50, 50);
      const ids = doc.getDirtyElements().map((e) => e.id).sort();
      expect(ids).toEqual(['a', 'c']);
    });
  });

  describe('select / deselect / clearSelection', () => {
    it('select adds to selectedIds', () => {
      const doc = makeDoc('a', 'b');
      doc.select('a');
      expect(doc.interaction.selectedIds.has('a')).toBe(true);
      expect(doc.interaction.selectedIds.has('b')).toBe(false);
    });

    it('deselect removes from selectedIds', () => {
      const doc = makeDoc('a', 'b');
      doc.select('a');
      doc.select('b');
      doc.deselect('a');
      expect(doc.interaction.selectedIds.has('a')).toBe(false);
      expect(doc.interaction.selectedIds.has('b')).toBe(true);
    });

    it('clearSelection removes all', () => {
      const doc = makeDoc('a', 'b', 'c');
      doc.select('a');
      doc.select('b');
      doc.select('c');
      doc.clearSelection();
      expect(doc.interaction.selectedIds.size).toBe(0);
    });

    it('select is idempotent', () => {
      const doc = makeDoc('a');
      doc.select('a');
      doc.select('a');
      expect(doc.interaction.selectedIds.size).toBe(1);
    });

    it('deselect on non-selected is a no-op', () => {
      const doc = makeDoc('a');
      expect(() => doc.deselect('a')).not.toThrow();
      expect(doc.interaction.selectedIds.size).toBe(0);
    });
  });

  describe('multiple mutations accumulate', () => {
    it('applies move, resize and separate move in sequence', () => {
      const doc = makeDoc('a');
      doc.moveElement('a', 10, 5);
      doc.resizeElement('a', 200, 100);
      doc.moveElement('a', 5, -3);
      const el = doc.getElement('a')!;
      expect(el.element.x).toBe(15);
      expect(el.element.y).toBe(2);
      expect(el.element.width).toBe(200);
      expect(el.element.height).toBe(100);
    });

    it('dirty set has only one entry for repeatedly mutated element', () => {
      const doc = makeDoc('a');
      doc.moveElement('a', 1, 0);
      doc.moveElement('a', 2, 0);
      doc.resizeElement('a', 50, 50);
      // Even after 3 mutations, only one dirty entry
      expect(doc.getDirtyElements()).toHaveLength(1);
    });
  });

  describe('save', () => {
    it('returns a Uint8Array', async () => {
      const doc = makeDoc('a');
      const result = await doc.save();
      expect(result).toBeInstanceOf(Uint8Array);
    });
  });
});
