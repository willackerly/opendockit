import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistoryManager } from '../history-manager.js';
import type { Operation } from '../operation.js';

function makeOp(overrides: Partial<Operation> = {}): Operation {
  return {
    elementId: '/ppt/slides/slide1.xml#sp1',
    field: 'x',
    oldValue: 0,
    newValue: 100,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('HistoryManager', () => {
  let hm: HistoryManager;

  beforeEach(() => {
    hm = new HistoryManager();
  });

  // ---- Basic undo/redo ----

  it('undo returns null on empty stack', () => {
    expect(hm.undo()).toBeNull();
  });

  it('redo returns null on empty stack', () => {
    expect(hm.redo()).toBeNull();
  });

  it('records and undoes a single-op auto-committed transaction', () => {
    const op = makeOp();
    hm.record(op);

    expect(hm.canUndo).toBe(true);
    expect(hm.undoCount).toBe(1);

    const tx = hm.undo();
    expect(tx).not.toBeNull();
    expect(tx!.operations).toHaveLength(1);
    expect(tx!.operations[0]).toEqual(op);
    expect(hm.canUndo).toBe(false);
  });

  it('redo replays the undone transaction', () => {
    hm.record(makeOp({ newValue: 50 }));
    hm.undo();

    expect(hm.canRedo).toBe(true);
    expect(hm.redoCount).toBe(1);

    const tx = hm.redo();
    expect(tx).not.toBeNull();
    expect(tx!.operations[0].newValue).toBe(50);
    expect(hm.canRedo).toBe(false);
    expect(hm.canUndo).toBe(true);
  });

  // ---- Transaction grouping ----

  it('groups multiple ops into one transaction', () => {
    hm.beginTransaction('Move shape');
    hm.record(makeOp({ field: 'x', oldValue: 0, newValue: 10 }));
    hm.record(makeOp({ field: 'y', oldValue: 0, newValue: 20 }));
    hm.commit();

    expect(hm.undoCount).toBe(1);
    const tx = hm.undo();
    expect(tx!.label).toBe('Move shape');
    expect(tx!.operations).toHaveLength(2);
  });

  // ---- New action clears redo ----

  it('new action clears redo stack', () => {
    hm.record(makeOp({ newValue: 1 }));
    hm.record(makeOp({ newValue: 2 }));
    hm.undo();
    expect(hm.canRedo).toBe(true);

    // New action should clear redo
    hm.record(makeOp({ newValue: 3 }));
    expect(hm.canRedo).toBe(false);
    expect(hm.redoCount).toBe(0);
  });

  it('committed transaction clears redo stack', () => {
    hm.record(makeOp({ newValue: 1 }));
    hm.undo();
    expect(hm.canRedo).toBe(true);

    hm.beginTransaction('New edit');
    hm.record(makeOp({ newValue: 2 }));
    hm.commit();

    expect(hm.canRedo).toBe(false);
  });

  // ---- Max stack size ----

  it('trims undo stack to maxStackSize, dropping oldest', () => {
    const small = new HistoryManager(3);
    for (let i = 0; i < 5; i++) {
      small.record(makeOp({ newValue: i }));
    }
    expect(small.undoCount).toBe(3);
    // The oldest (0, 1) should have been dropped; 2, 3, 4 remain
    const tx1 = small.undo();
    expect(tx1!.operations[0].newValue).toBe(4);
    const tx2 = small.undo();
    expect(tx2!.operations[0].newValue).toBe(3);
    const tx3 = small.undo();
    expect(tx3!.operations[0].newValue).toBe(2);
    expect(small.undo()).toBeNull();
  });

  // ---- canUndo / canRedo flags ----

  it('canUndo and canRedo reflect stack state', () => {
    expect(hm.canUndo).toBe(false);
    expect(hm.canRedo).toBe(false);

    hm.record(makeOp());
    expect(hm.canUndo).toBe(true);
    expect(hm.canRedo).toBe(false);

    hm.undo();
    expect(hm.canUndo).toBe(false);
    expect(hm.canRedo).toBe(true);

    hm.redo();
    expect(hm.canUndo).toBe(true);
    expect(hm.canRedo).toBe(false);
  });

  // ---- clear() ----

  it('clear() resets everything', () => {
    hm.record(makeOp());
    hm.record(makeOp());
    hm.undo();

    hm.clear();

    expect(hm.canUndo).toBe(false);
    expect(hm.canRedo).toBe(false);
    expect(hm.undoCount).toBe(0);
    expect(hm.redoCount).toBe(0);
  });

  // ---- Empty commit is no-op ----

  it('commit with no pending ops is a no-op', () => {
    hm.beginTransaction('Empty');
    hm.commit();
    expect(hm.undoCount).toBe(0);
  });

  it('commit without beginTransaction is a no-op', () => {
    hm.commit();
    expect(hm.undoCount).toBe(0);
  });

  // ---- Multiple undo/redo cycles ----

  it('supports multiple sequential undo then redo', () => {
    hm.record(makeOp({ newValue: 'a' }));
    hm.record(makeOp({ newValue: 'b' }));
    hm.record(makeOp({ newValue: 'c' }));

    expect(hm.undoCount).toBe(3);

    hm.undo(); // c
    hm.undo(); // b
    expect(hm.undoCount).toBe(1);
    expect(hm.redoCount).toBe(2);

    const tx = hm.redo();
    expect(tx!.operations[0].newValue).toBe('b');
    expect(hm.undoCount).toBe(2);
    expect(hm.redoCount).toBe(1);
  });

  // ---- Auto-commit uses field as label ----

  it('auto-committed transaction uses field name as label', () => {
    hm.record(makeOp({ field: 'width' }));
    const tx = hm.undo();
    expect(tx!.label).toBe('width');
  });

  // ---- Transaction timestamp ----

  it('transaction gets a timestamp on commit', () => {
    const before = Date.now();
    hm.beginTransaction('Test');
    hm.record(makeOp());
    hm.commit();
    const after = Date.now();

    const tx = hm.undo();
    expect(tx!.timestamp).toBeGreaterThanOrEqual(before);
    expect(tx!.timestamp).toBeLessThanOrEqual(after);
  });
});
