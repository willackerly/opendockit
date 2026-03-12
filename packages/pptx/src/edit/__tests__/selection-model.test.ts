import { describe, it, expect } from 'vitest';
import { SelectionModel } from '../selection-model.js';
import type { TextPosition } from '../selection-model.js';

describe('SelectionModel', () => {
  it('starts with no selection', () => {
    const model = new SelectionModel();
    expect(model.anchor).toBeNull();
    expect(model.focus).toBeNull();
    expect(model.hasSelection).toBe(false);
    expect(model.getOrderedRange()).toBeNull();
  });

  it('setCursor sets a collapsed selection', () => {
    const model = new SelectionModel();
    const pos: TextPosition = { paragraphIndex: 0, runIndex: 0, charOffset: 5 };
    model.setCursor(pos);

    expect(model.anchor).toEqual(pos);
    expect(model.focus).toEqual(pos);
    expect(model.hasSelection).toBe(false);
  });

  it('setCursor clones the position (mutation safety)', () => {
    const model = new SelectionModel();
    const pos: TextPosition = { paragraphIndex: 0, runIndex: 0, charOffset: 5 };
    model.setCursor(pos);
    pos.charOffset = 99;

    expect(model.anchor!.charOffset).toBe(5);
    expect(model.focus!.charOffset).toBe(5);
  });

  it('extendTo creates a range selection', () => {
    const model = new SelectionModel();
    model.setCursor({ paragraphIndex: 0, runIndex: 0, charOffset: 0 });
    model.extendTo({ paragraphIndex: 0, runIndex: 1, charOffset: 3 });

    expect(model.hasSelection).toBe(true);
    expect(model.anchor).toEqual({ paragraphIndex: 0, runIndex: 0, charOffset: 0 });
    expect(model.focus).toEqual({ paragraphIndex: 0, runIndex: 1, charOffset: 3 });
  });

  it('hasSelection is false when collapsed, true when range', () => {
    const model = new SelectionModel();
    model.setCursor({ paragraphIndex: 1, runIndex: 0, charOffset: 2 });
    expect(model.hasSelection).toBe(false);

    model.extendTo({ paragraphIndex: 1, runIndex: 0, charOffset: 5 });
    expect(model.hasSelection).toBe(true);
  });

  it('getOrderedRange returns [start, end] in document order (forward)', () => {
    const model = new SelectionModel();
    model.setCursor({ paragraphIndex: 0, runIndex: 0, charOffset: 2 });
    model.extendTo({ paragraphIndex: 1, runIndex: 0, charOffset: 0 });

    const range = model.getOrderedRange();
    expect(range).not.toBeNull();
    expect(range![0]).toEqual({ paragraphIndex: 0, runIndex: 0, charOffset: 2 });
    expect(range![1]).toEqual({ paragraphIndex: 1, runIndex: 0, charOffset: 0 });
  });

  it('getOrderedRange returns [start, end] in document order (backward)', () => {
    const model = new SelectionModel();
    model.setCursor({ paragraphIndex: 1, runIndex: 0, charOffset: 5 });
    model.extendTo({ paragraphIndex: 0, runIndex: 0, charOffset: 0 });

    const range = model.getOrderedRange();
    expect(range).not.toBeNull();
    expect(range![0]).toEqual({ paragraphIndex: 0, runIndex: 0, charOffset: 0 });
    expect(range![1]).toEqual({ paragraphIndex: 1, runIndex: 0, charOffset: 5 });
  });

  it('getOrderedRange returns cloned positions', () => {
    const model = new SelectionModel();
    model.setCursor({ paragraphIndex: 0, runIndex: 0, charOffset: 0 });
    model.extendTo({ paragraphIndex: 0, runIndex: 0, charOffset: 5 });

    const range = model.getOrderedRange();
    range![0].charOffset = 99;
    expect(model.anchor!.charOffset).toBe(0);
  });

  it('clear resets all state', () => {
    const model = new SelectionModel();
    model.setCursor({ paragraphIndex: 0, runIndex: 0, charOffset: 3 });
    model.extendTo({ paragraphIndex: 1, runIndex: 0, charOffset: 0 });
    model.clear();

    expect(model.anchor).toBeNull();
    expect(model.focus).toBeNull();
    expect(model.hasSelection).toBe(false);
    expect(model.getOrderedRange()).toBeNull();
  });

  describe('compare', () => {
    it('returns 0 for equal positions', () => {
      const a: TextPosition = { paragraphIndex: 0, runIndex: 1, charOffset: 5 };
      const b: TextPosition = { paragraphIndex: 0, runIndex: 1, charOffset: 5 };
      expect(SelectionModel.compare(a, b)).toBe(0);
    });

    it('compares by paragraph index first', () => {
      const a: TextPosition = { paragraphIndex: 0, runIndex: 5, charOffset: 99 };
      const b: TextPosition = { paragraphIndex: 1, runIndex: 0, charOffset: 0 };
      expect(SelectionModel.compare(a, b)).toBe(-1);
      expect(SelectionModel.compare(b, a)).toBe(1);
    });

    it('compares by run index within same paragraph', () => {
      const a: TextPosition = { paragraphIndex: 2, runIndex: 0, charOffset: 99 };
      const b: TextPosition = { paragraphIndex: 2, runIndex: 1, charOffset: 0 };
      expect(SelectionModel.compare(a, b)).toBe(-1);
      expect(SelectionModel.compare(b, a)).toBe(1);
    });

    it('compares by char offset within same run', () => {
      const a: TextPosition = { paragraphIndex: 0, runIndex: 0, charOffset: 3 };
      const b: TextPosition = { paragraphIndex: 0, runIndex: 0, charOffset: 7 };
      expect(SelectionModel.compare(a, b)).toBe(-1);
      expect(SelectionModel.compare(b, a)).toBe(1);
    });
  });
});
