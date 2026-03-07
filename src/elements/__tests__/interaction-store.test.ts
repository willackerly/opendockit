import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InteractionStore } from '../interaction-store.js';
import type { InteractionEvent } from '../interaction-types.js';
import type { Rect } from '../spatial.js';
import { makeTextElement, makeShapeElement, DEFAULT_VIEWPORT } from './test-helpers.js';

// ─── Helpers ─────────────────────────────────────────────

/** Create a store with standard test elements on an 612×792 page at scale 1. */
function createTestStore() {
  const elements = [
    makeShapeElement('s1', 100, 600, 50, 50),   // bottom-left region
    makeTextElement('t1', 300, 400, 100, 20, 'Hello'),
    makeShapeElement('s2', 300, 400, 100, 20),   // overlaps t1 (on top)
  ];
  return new InteractionStore(elements, DEFAULT_VIEWPORT);
}

/** Convert page coords to viewport coords for a scale-1, 792-height page. */
function pv(px: number, py: number) {
  return { vx: px, vy: 792 - py };
}

describe('InteractionStore — initial state', () => {
  it('starts in idle mode with empty selection', () => {
    const store = createTestStore();
    const snap = store.getSnapshot();
    expect(snap.mode).toBe('idle');
    expect(snap.selectedIds.size).toBe(0);
    expect(snap.hoveredId).toBeNull();
    expect(snap.selectionRect).toBeNull();
  });

  it('snapshot is reference-stable when unchanged', () => {
    const store = createTestStore();
    const a = store.getSnapshot();
    const b = store.getSnapshot();
    expect(a).toBe(b);
  });
});

describe('InteractionStore — hover', () => {
  it('updates hoveredId on pointerMove over an element', () => {
    const store = createTestStore();
    const { vx, vy } = pv(125, 625); // center of s1
    store.pointerMove(vx, vy);
    expect(store.getSnapshot().hoveredId).toBe('s1');
  });

  it('clears hoveredId on pointerMove to empty space', () => {
    const store = createTestStore();
    store.pointerMove(pv(125, 625).vx, pv(125, 625).vy);
    expect(store.getSnapshot().hoveredId).toBe('s1');

    store.pointerMove(pv(0, 0).vx, pv(0, 0).vy);
    expect(store.getSnapshot().hoveredId).toBeNull();
  });

  it('emits hoverChanged event', () => {
    const store = createTestStore();
    const events: InteractionEvent[] = [];
    store.onEvent(e => events.push(e));

    store.pointerMove(pv(125, 625).vx, pv(125, 625).vy);
    const hoverEvt = events.find(e => e.type === 'hoverChanged');
    expect(hoverEvt).toBeDefined();
    expect(hoverEvt!.type === 'hoverChanged' && hoverEvt!.hoveredId).toBe('s1');
  });

  it('returns topmost element when overlapping', () => {
    const store = createTestStore();
    // t1 and s2 overlap at (300, 400, 100, 20) — s2 is on top
    store.pointerMove(pv(350, 410).vx, pv(350, 410).vy);
    expect(store.getSnapshot().hoveredId).toBe('s2');
  });
});

describe('InteractionStore — click selection', () => {
  it('selects element on pointerDown', () => {
    const store = createTestStore();
    const { vx, vy } = pv(125, 625);
    store.pointerDown(vx, vy);
    expect(store.getSnapshot().selectedIds.has('s1')).toBe(true);
    expect(store.getSnapshot().mode).toBe('selecting');
  });

  it('returns to idle on pointerUp', () => {
    const store = createTestStore();
    const { vx, vy } = pv(125, 625);
    store.pointerDown(vx, vy);
    store.pointerUp(vx, vy);
    expect(store.getSnapshot().mode).toBe('idle');
    expect(store.getSnapshot().selectedIds.has('s1')).toBe(true);
  });

  it('clears selection when clicking empty space', () => {
    const store = createTestStore();
    // First select s1
    const s1 = pv(125, 625);
    store.pointerDown(s1.vx, s1.vy);
    store.pointerUp(s1.vx, s1.vy);
    expect(store.getSnapshot().selectedIds.size).toBe(1);

    // Click empty space
    const empty = pv(0, 0);
    store.pointerDown(empty.vx, empty.vy);
    store.pointerUp(empty.vx, empty.vy);
    expect(store.getSnapshot().selectedIds.size).toBe(0);
  });

  it('replaces selection when clicking a different element', () => {
    const store = createTestStore();
    // Select s1
    const s1 = pv(125, 625);
    store.pointerDown(s1.vx, s1.vy);
    store.pointerUp(s1.vx, s1.vy);
    expect(store.getSnapshot().selectedIds.has('s1')).toBe(true);

    // Click s2 (on top at overlap)
    const s2 = pv(350, 410);
    store.pointerDown(s2.vx, s2.vy);
    store.pointerUp(s2.vx, s2.vy);
    expect(store.getSnapshot().selectedIds.has('s2')).toBe(true);
    expect(store.getSnapshot().selectedIds.has('s1')).toBe(false);
  });
});

describe('InteractionStore — shift-click (toggle selection)', () => {
  it('adds element to selection with shift', () => {
    const store = createTestStore();
    // Select s1
    store.pointerDown(pv(125, 625).vx, pv(125, 625).vy);
    store.pointerUp(pv(125, 625).vx, pv(125, 625).vy);

    // Shift-click s2
    store.pointerDown(pv(350, 410).vx, pv(350, 410).vy, { shift: true, ctrl: false, alt: false });
    expect(store.getSnapshot().selectedIds.has('s1')).toBe(true);
    expect(store.getSnapshot().selectedIds.has('s2')).toBe(true);
  });

  it('removes element from selection with shift on already-selected', () => {
    const store = createTestStore();
    // Select s1
    store.pointerDown(pv(125, 625).vx, pv(125, 625).vy);
    store.pointerUp(pv(125, 625).vx, pv(125, 625).vy);

    // Shift-click s1 again → deselect
    store.pointerDown(pv(125, 625).vx, pv(125, 625).vy, { shift: true, ctrl: false, alt: false });
    expect(store.getSnapshot().selectedIds.has('s1')).toBe(false);
  });
});

describe('InteractionStore — locked elements', () => {
  it('locked elements are hoverable but not selectable', () => {
    const lockedEl = makeShapeElement('locked1', 100, 600, 50, 50);
    lockedEl.locked = true;
    const store = new InteractionStore([lockedEl], DEFAULT_VIEWPORT);

    // Hover works
    store.pointerMove(pv(125, 625).vx, pv(125, 625).vy);
    expect(store.getSnapshot().hoveredId).toBe('locked1');

    // Click doesn't select
    store.pointerDown(pv(125, 625).vx, pv(125, 625).vy);
    expect(store.getSnapshot().selectedIds.size).toBe(0);
  });

  it('locked elements are excluded from selectAll', () => {
    const elements = [
      makeShapeElement('s1', 100, 600, 50, 50),
      (() => { const e = makeShapeElement('locked1', 200, 600, 50, 50); e.locked = true; return e; })(),
    ];
    const store = new InteractionStore(elements, DEFAULT_VIEWPORT);
    store.selectAll();
    expect(store.getSnapshot().selectedIds.has('s1')).toBe(true);
    expect(store.getSnapshot().selectedIds.has('locked1')).toBe(false);
  });
});

describe('InteractionStore — marquee selection', () => {
  it('enters marquee mode on pointerDown in empty space', () => {
    const store = createTestStore();
    const empty = pv(0, 0);
    store.pointerDown(empty.vx, empty.vy);
    expect(store.getSnapshot().mode).toBe('marquee');
    expect(store.getSnapshot().selectionRect).not.toBeNull();
  });

  it('updates selection as marquee grows', () => {
    const store = createTestStore();
    // Start drag at far corner (no elements)
    const start = pv(80, 660);
    store.pointerDown(start.vx, start.vy);
    expect(store.getSnapshot().mode).toBe('marquee');

    // Drag to cover s1 at (100, 600, 50, 50)
    const end = pv(160, 590);
    store.pointerMove(end.vx, end.vy);
    expect(store.getSnapshot().selectedIds.has('s1')).toBe(true);
  });

  it('finalizes on pointerUp and returns to idle', () => {
    const store = createTestStore();
    const start = pv(80, 660);
    store.pointerDown(start.vx, start.vy);

    const end = pv(160, 590);
    store.pointerMove(end.vx, end.vy);
    store.pointerUp(end.vx, end.vy);

    expect(store.getSnapshot().mode).toBe('idle');
    expect(store.getSnapshot().selectionRect).toBeNull();
    expect(store.getSnapshot().selectedIds.has('s1')).toBe(true);
  });

  it('handles reverse-direction drag (right-to-left)', () => {
    const store = createTestStore();
    // Start right of s1, drag left past it
    const start = pv(160, 590);
    store.pointerDown(start.vx, start.vy);

    const end = pv(80, 660);
    store.pointerMove(end.vx, end.vy);
    expect(store.getSnapshot().selectedIds.has('s1')).toBe(true);
  });
});

describe('InteractionStore — drawing-rect mode', () => {
  it('enters drawing-rect via setMode', () => {
    const store = createTestStore();
    store.setMode('drawing-rect');
    expect(store.getSnapshot().mode).toBe('drawing-rect');
  });

  it('draws a rect and emits rectDrawn event', () => {
    const store = createTestStore();
    store.setMode('drawing-rect');

    const events: InteractionEvent[] = [];
    store.onEvent(e => events.push(e));

    const start = pv(100, 700);
    const end = pv(200, 600);
    store.pointerDown(start.vx, start.vy);
    store.pointerMove(end.vx, end.vy);
    store.pointerUp(end.vx, end.vy);

    const rectDrawn = events.find(e => e.type === 'rectDrawn');
    expect(rectDrawn).toBeDefined();
    expect(rectDrawn!.type === 'rectDrawn' && rectDrawn!.rect.width).toBeCloseTo(100);
    expect(rectDrawn!.type === 'rectDrawn' && rectDrawn!.rect.height).toBeCloseTo(100);
  });

  it('returns to idle after drawing', () => {
    const store = createTestStore();
    store.setMode('drawing-rect');

    store.pointerDown(pv(100, 700).vx, pv(100, 700).vy);
    store.pointerUp(pv(200, 600).vx, pv(200, 600).vy);
    expect(store.getSnapshot().mode).toBe('idle');
  });

  it('does not emit rectDrawn for zero-area rect', () => {
    const store = createTestStore();
    store.setMode('drawing-rect');

    const events: InteractionEvent[] = [];
    store.onEvent(e => events.push(e));

    const pt = pv(100, 700);
    store.pointerDown(pt.vx, pt.vy);
    store.pointerUp(pt.vx, pt.vy);

    const rectDrawn = events.find(e => e.type === 'rectDrawn');
    expect(rectDrawn).toBeUndefined();
  });
});

describe('InteractionStore — keyboard', () => {
  it('Escape clears selection', () => {
    const store = createTestStore();
    store.pointerDown(pv(125, 625).vx, pv(125, 625).vy);
    store.pointerUp(pv(125, 625).vx, pv(125, 625).vy);
    expect(store.getSnapshot().selectedIds.size).toBe(1);

    store.keyDown('Escape');
    expect(store.getSnapshot().selectedIds.size).toBe(0);
  });

  it('Escape cancels marquee', () => {
    const store = createTestStore();
    store.pointerDown(pv(0, 0).vx, pv(0, 0).vy);
    expect(store.getSnapshot().mode).toBe('marquee');

    store.keyDown('Escape');
    expect(store.getSnapshot().mode).toBe('idle');
    expect(store.getSnapshot().selectionRect).toBeNull();
  });

  it('Escape cancels drawing-rect', () => {
    const store = createTestStore();
    store.setMode('drawing-rect');
    store.pointerDown(pv(100, 700).vx, pv(100, 700).vy);

    store.keyDown('Escape');
    expect(store.getSnapshot().mode).toBe('idle');
  });

  it('Ctrl+A selects all unlocked elements', () => {
    const store = createTestStore();
    store.keyDown('a', { shift: false, ctrl: true, alt: false });
    expect(store.getSnapshot().selectedIds.size).toBe(3);
  });
});

describe('InteractionStore — programmatic API', () => {
  it('selectAll selects all unlocked', () => {
    const store = createTestStore();
    store.selectAll();
    expect(store.getSnapshot().selectedIds.size).toBe(3);
  });

  it('clearSelection empties selection', () => {
    const store = createTestStore();
    store.selectAll();
    store.clearSelection();
    expect(store.getSnapshot().selectedIds.size).toBe(0);
  });

  it('selectElements selects specific ids', () => {
    const store = createTestStore();
    store.selectElements(['s1', 't1']);
    expect(store.getSnapshot().selectedIds.has('s1')).toBe(true);
    expect(store.getSnapshot().selectedIds.has('t1')).toBe(true);
    expect(store.getSnapshot().selectedIds.has('s2')).toBe(false);
  });

  it('setElements prunes stale selection', () => {
    const store = createTestStore();
    store.selectAll();
    expect(store.getSnapshot().selectedIds.size).toBe(3);

    // Replace with only s1
    store.setElements([makeShapeElement('s1', 100, 600, 50, 50)]);
    expect(store.getSnapshot().selectedIds.size).toBe(1);
    expect(store.getSnapshot().selectedIds.has('s1')).toBe(true);
  });

  it('setElements clears stale hoveredId', () => {
    const store = createTestStore();
    store.pointerMove(pv(125, 625).vx, pv(125, 625).vy);
    expect(store.getSnapshot().hoveredId).toBe('s1');

    store.setElements([makeShapeElement('s2', 300, 400, 100, 20)]);
    expect(store.getSnapshot().hoveredId).toBeNull();
  });

  it('setViewport updates snapshot', () => {
    const store = createTestStore();
    const newVp = { scale: 2, pageWidth: 612, pageHeight: 792 };
    store.setViewport(newVp);
    expect(store.getSnapshot().viewport.scale).toBe(2);
  });
});

describe('InteractionStore — subscribe / getSnapshot', () => {
  it('subscribe notifies on state change', () => {
    const store = createTestStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.pointerMove(pv(125, 625).vx, pv(125, 625).vy);
    expect(listener).toHaveBeenCalled();
  });

  it('unsubscribe stops notifications', () => {
    const store = createTestStore();
    const listener = vi.fn();
    const unsub = store.subscribe(listener);

    unsub();
    store.pointerMove(pv(125, 625).vx, pv(125, 625).vy);
    expect(listener).not.toHaveBeenCalled();
  });

  it('snapshot invalidates after state change', () => {
    const store = createTestStore();
    const a = store.getSnapshot();
    store.pointerMove(pv(125, 625).vx, pv(125, 625).vy);
    const b = store.getSnapshot();
    expect(a).not.toBe(b);
  });

  it('onEvent receives semantic events', () => {
    const store = createTestStore();
    const events: InteractionEvent[] = [];
    store.onEvent(e => events.push(e));

    store.pointerDown(pv(125, 625).vx, pv(125, 625).vy);
    const selEvents = events.filter(e => e.type === 'selectionChanged');
    expect(selEvents.length).toBeGreaterThan(0);
  });

  it('onEvent unsubscribe works', () => {
    const store = createTestStore();
    const events: InteractionEvent[] = [];
    const unsub = store.onEvent(e => events.push(e));

    unsub();
    store.pointerDown(pv(125, 625).vx, pv(125, 625).vy);
    expect(events.length).toBe(0);
  });
});

describe('InteractionStore — coordinate conversion (public API)', () => {
  it('viewportToPage delegates correctly', () => {
    const store = createTestStore();
    const p = store.viewportToPage(100, 200);
    expect(p.x).toBe(100);
    expect(p.y).toBe(792 - 200);
  });

  it('pageToViewport delegates correctly', () => {
    const store = createTestStore();
    const p = store.pageToViewport(100, 592);
    expect(p.x).toBe(100);
    expect(p.y).toBe(200);
  });

  it('pageRectToViewport delegates correctly', () => {
    const store = createTestStore();
    const r = store.pageRectToViewport({ x: 0, y: 0, width: 100, height: 100 });
    expect(r.width).toBe(100);
    expect(r.height).toBe(100);
  });

  it('viewportRectToPage delegates correctly', () => {
    const store = createTestStore();
    const r = store.viewportRectToPage({ x: 0, y: 0, width: 100, height: 100 });
    expect(r.width).toBe(100);
    expect(r.height).toBe(100);
  });
});

describe('InteractionStore — selectionChanged event', () => {
  it('emits selectionChanged with correct ids', () => {
    const store = createTestStore();
    const events: InteractionEvent[] = [];
    store.onEvent(e => { if (e.type === 'selectionChanged') events.push(e); });

    store.selectElements(['s1', 't1']);
    expect(events.length).toBe(1);
    const e = events[0];
    expect(e.type === 'selectionChanged' && e.selectedIds.has('s1')).toBe(true);
    expect(e.type === 'selectionChanged' && e.selectedIds.has('t1')).toBe(true);
  });

  it('does not emit selectionChanged when selection unchanged', () => {
    const store = createTestStore();
    store.selectElements(['s1']);

    const events: InteractionEvent[] = [];
    store.onEvent(e => { if (e.type === 'selectionChanged') events.push(e); });

    store.selectElements(['s1']); // same selection
    expect(events.length).toBe(0);
  });
});
