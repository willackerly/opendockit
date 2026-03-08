/**
 * Structural golden tests for @opendockit/elements.
 *
 * Uses vitest toMatchSnapshot() to create golden baselines for key algorithms.
 * Any future change to the underlying algorithms will cause snapshots to fail,
 * making regressions immediately visible.
 *
 * Coverage focus: cross-cutting scenarios that span multiple modules
 * (search + bounds + clipboard) and edge cases not in the unit tests.
 *
 * IMPORTANT: On first run vitest will CREATE the snapshot file. Subsequent
 * runs compare against it. If the algorithm changes intentionally, run:
 *   pnpm --filter @opendockit/elements test -- --update-snapshots
 */

import { describe, it, expect } from 'vitest';
import {
  searchText,
  hitTest,
  getBounds,
  getOverlapping,
  isPointInBounds,
  queryElementsInRect,
  queryTextInRect,
  boundingBox,
  serializeToClipboard,
  deserializeFromClipboard,
  DirtyTracker,
  WeakDirtyTracker,
  elementToRect,
  rectsOverlap,
  overlapFraction,
  extractTextInRect,
} from '../index.js';
import type { PageModel, TextElement, ShapeElement, GroupElement } from '../index.js';
import {
  makeTextElement,
  makeShapeElement,
  makeImageElement,
  makeMultiRunTextElement,
  makePage,
} from './test-helpers.js';

// ─── Shared fixtures ────────────────────────────────────

/**
 * A two-page document used across multiple test suites.
 * Page 0: mixed elements with overlapping bounding boxes.
 * Page 1: text-only elements at known positions.
 */
const TWO_PAGE_DOC: PageModel[] = [
  makePage('p1', [
    makeTextElement('t1', 10, 20, 200, 30, 'Hello World'),
    makeTextElement('t2', 10, 60, 200, 30, 'The quick brown fox jumps over the lazy dog'),
    makeShapeElement('s1', 10, 100, 100, 50),
    makeImageElement('i1', 120, 100, 80, 50),
  ]),
  makePage('p2', [
    makeTextElement('t3', 10, 20, 200, 30, 'Hello again'),
    makeTextElement('t4', 10, 60, 200, 30, 'World peace'),
  ]),
];

// ─── Text search golden snapshots ───────────────────────

describe('structural golden: text search', () => {
  it('basic "Hello" search result structure matches snapshot', () => {
    const results = searchText(TWO_PAGE_DOC, 'Hello');
    // Snapshot the entire result structure to catch any regression in
    // matchStart, matchEnd, bounds calculation, or elementId assignment.
    expect(results).toMatchSnapshot();
  });

  it('case-insensitive search for "hello" matches snapshot', () => {
    const results = searchText(TWO_PAGE_DOC, 'hello', { caseSensitive: false });
    expect(results).toMatchSnapshot();
  });

  it('case-sensitive search for "Hello" matches snapshot', () => {
    const results = searchText(TWO_PAGE_DOC, 'Hello', { caseSensitive: true });
    expect(results).toMatchSnapshot();
  });

  it('whole-word search for "fox" matches snapshot', () => {
    const results = searchText(TWO_PAGE_DOC, 'fox', { wholeWord: true });
    expect(results).toMatchSnapshot();
  });

  it('regex search for "H[ea]llo" matches snapshot', () => {
    const results = searchText(TWO_PAGE_DOC, 'H[ea]llo', { regex: true });
    expect(results).toMatchSnapshot();
  });

  it('cross-page search finds all "Hello" matches with correct pageIndex', () => {
    const results = searchText(TWO_PAGE_DOC, 'Hello');
    expect(results).toHaveLength(2);
    expect(results[0].pageIndex).toBe(0);
    expect(results[1].pageIndex).toBe(1);
  });

  it('empty query always returns empty', () => {
    const results = searchText(TWO_PAGE_DOC, '');
    expect(results).toHaveLength(0);
  });

  it('non-matching query returns empty', () => {
    const results = searchText(TWO_PAGE_DOC, 'xyz_not_present_12345');
    expect(results).toHaveLength(0);
  });

  it('multi-run text element: search spanning both runs matches snapshot', () => {
    const multiRunPage = makePage('p3', [
      makeMultiRunTextElement('mr1', 10, 20, 300, 30, [
        { text: 'Hello ', x: 0, runWidth: 60 },
        { text: 'World', x: 60, runWidth: 50 },
      ]),
    ]);
    const results = searchText([multiRunPage], 'Hello World');
    expect(results).toMatchSnapshot();
    expect(results).toHaveLength(1);
    // Bounds must span both runs: width should be wider than a single run
    expect(results[0].bounds.width).toBeGreaterThan(60);
  });

  it('multi-run text element: partial match within first run only', () => {
    const multiRunPage = makePage('p3', [
      makeMultiRunTextElement('mr1', 10, 20, 300, 30, [
        { text: 'Hello ', x: 0, runWidth: 60 },
        { text: 'World', x: 60, runWidth: 50 },
      ]),
    ]);
    const results = searchText([multiRunPage], 'Hello');
    expect(results).toMatchSnapshot();
    expect(results).toHaveLength(1);
    // Bounds should stay within the first run's x range
    expect(results[0].bounds.x).toBeGreaterThanOrEqual(10); // element.x = 10
  });

  it('bounds are absolute coordinates (element.x added to run.x)', () => {
    // Element at x=50, run at x=0 relative — result bounds.x must be >= 50
    const page = makePage('p1', [makeTextElement('t1', 50, 100, 200, 40, 'findme')]);
    const results = searchText([page], 'findme');
    expect(results).toHaveLength(1);
    expect(results[0].bounds.x).toBeGreaterThanOrEqual(50);
    expect(results[0].bounds.y).toBeGreaterThanOrEqual(100);
  });

  it('search on page with only shape/image elements returns empty', () => {
    const shapePage = makePage('p1', [
      makeShapeElement('s1', 0, 0, 100, 100),
      makeImageElement('i1', 110, 0, 100, 100),
    ]);
    const results = searchText([shapePage], 'anything');
    expect(results).toHaveLength(0);
  });
});

// ─── Spatial query golden snapshots ─────────────────────

describe('structural golden: spatial queries', () => {
  const elements = [
    makeShapeElement('s1', 10, 10, 100, 50),
    makeTextElement('t1', 50, 30, 200, 40, 'Overlapping text'),
    makeImageElement('i1', 300, 300, 100, 100),
  ];

  it('getBounds returns exact element position and size', () => {
    const shape = makeShapeElement('s1', 15, 25, 80, 60);
    expect(getBounds(shape)).toEqual({ x: 15, y: 25, width: 80, height: 60 });
  });

  it('getBounds snapshot for text element', () => {
    const text = makeTextElement('t1', 10, 20, 200, 30, 'Golden snapshot text');
    expect(getBounds(text)).toMatchSnapshot();
  });

  it('hitTest at point inside s1 only returns s1', () => {
    // Point (20, 20) is inside s1 (10,10,100,50) but not t1 (50,30)
    const result = hitTest(elements, 20, 20);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('s1');
  });

  it('hitTest at overlapping point returns topmost (last z-order) element', () => {
    // Point (60, 35) is inside both s1 and t1 — t1 is last (front)
    const result = hitTest(elements, 60, 35);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('t1');
  });

  it('hitTest at point with no element returns null', () => {
    const result = hitTest(elements, 500, 500);
    expect(result).toBeNull();
  });

  it('isPointInBounds: point inside rect', () => {
    expect(isPointInBounds(50, 30, { x: 10, y: 10, width: 100, height: 50 })).toBe(true);
  });

  it('isPointInBounds: point outside rect', () => {
    expect(isPointInBounds(200, 200, { x: 10, y: 10, width: 100, height: 50 })).toBe(false);
  });

  it('isPointInBounds: point on corner (inclusive)', () => {
    expect(isPointInBounds(10, 10, { x: 10, y: 10, width: 100, height: 50 })).toBe(true);
    expect(isPointInBounds(110, 60, { x: 10, y: 10, width: 100, height: 50 })).toBe(true);
  });

  it('getOverlapping finds all elements in a large rect (snapshot)', () => {
    const result = getOverlapping(elements, { x: 0, y: 0, width: 250, height: 200 });
    // Snapshot the IDs in z-order
    expect(result.map((e) => e.id)).toMatchSnapshot();
  });

  it('getOverlapping returns only elements that actually overlap', () => {
    // Rect that only overlaps s1
    const result = getOverlapping(elements, { x: 0, y: 0, width: 40, height: 40 });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('s1');
  });

  it('queryElementsInRect snapshot for partial coverage rect', () => {
    // Rect that partially overlaps s1 and t1 but not i1
    const result = queryElementsInRect(elements, { x: 30, y: 25, width: 100, height: 50 });
    expect(result.map((e) => ({ id: e.id, type: e.type }))).toMatchSnapshot();
  });

  it('queryTextInRect returns only text elements (not shapes or images)', () => {
    const result = queryTextInRect(elements, { x: 0, y: 0, width: 400, height: 400 });
    expect(result.every((e) => e.type === 'text')).toBe(true);
    expect(result.map((e) => e.id)).toMatchSnapshot();
  });

  it('boundingBox of multiple elements snapshot', () => {
    const bb = boundingBox(elements);
    expect(bb).toMatchSnapshot();
  });

  it('boundingBox of single element equals element rect', () => {
    const el = makeShapeElement('s1', 5, 10, 50, 30);
    expect(boundingBox([el])).toEqual({ x: 5, y: 10, width: 50, height: 30 });
  });

  it('boundingBox of empty array returns null', () => {
    expect(boundingBox([])).toBeNull();
  });

  it('overlapFraction: fully contained element returns 1.0', () => {
    const el = makeShapeElement('s1', 10, 10, 20, 20);
    const bigRect = { x: 0, y: 0, width: 200, height: 200 };
    expect(overlapFraction(el, bigRect)).toBeCloseTo(1.0);
  });

  it('overlapFraction: no overlap returns 0', () => {
    const el = makeShapeElement('s1', 0, 0, 10, 10);
    const farRect = { x: 100, y: 100, width: 50, height: 50 };
    expect(overlapFraction(el, farRect)).toBe(0);
  });

  it('extractTextInRect from page elements snapshot', () => {
    const textElements = [
      makeTextElement('t1', 0, 0, 100, 20, 'First line'),
      makeTextElement('t2', 0, 25, 100, 20, 'Second line'),
      makeShapeElement('s1', 0, 50, 100, 20),
    ];
    const text = extractTextInRect(textElements, { x: 0, y: 0, width: 200, height: 200 });
    expect(text).toMatchSnapshot();
    // Shape should not contribute to extracted text
    expect(text).not.toContain('shape');
  });

  it('elementToRect extracts position fields', () => {
    const el = makeImageElement('i1', 7, 13, 42, 17);
    expect(elementToRect(el)).toEqual({ x: 7, y: 13, width: 42, height: 17 });
  });

  it('rectsOverlap: partial overlap', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
  });

  it('rectsOverlap: edge-touching returns false', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });
});

// ─── Clipboard golden snapshots ──────────────────────────

describe('structural golden: clipboard round-trip', () => {
  it('shape serialization snapshot (source bag stripped)', () => {
    const shape: ShapeElement = {
      ...makeShapeElement('s1', 15, 25, 80, 60),
      fill: { type: 'solid', color: { r: 255, g: 0, b: 0 } },
      stroke: { color: { r: 0, g: 0, b: 0 }, width: 2 },
      source: {
        format: 'pptx',
        offX: 685800,
        offY: 1143000,
        extCx: 3657600,
        extCy: 1828800,
        rot: 0,
      },
    };
    const data = serializeToClipboard([shape], 'pptx', 0);

    // Snapshot the serialized form (source should be absent)
    expect(data).toMatchSnapshot();

    // Assert source bag was stripped
    expect(data.elements[0].source).toBeUndefined();
    // Visual properties preserved
    expect(data.elements[0].x).toBe(15);
    expect(data.elements[0].y).toBe(25);
    expect(data.elements[0].width).toBe(80);
    expect(data.elements[0].height).toBe(60);
  });

  it('text element serialization snapshot preserves paragraphs', () => {
    const text = makeTextElement('t1', 0, 0, 200, 40, 'Hello World');
    const data = serializeToClipboard([text], 'pptx', 0);
    expect(data).toMatchSnapshot();
    const textOut = data.elements[0] as TextElement;
    expect(textOut.paragraphs[0].runs[0].text).toBe('Hello World');
  });

  it('mixed element set: types and positions snapshot (IDs excluded)', () => {
    const elements = [
      makeShapeElement('s1', 0, 0, 50, 50),
      makeTextElement('t1', 60, 0, 100, 20, 'text'),
      makeImageElement('i1', 0, 60, 50, 50),
    ];
    const data = serializeToClipboard(elements, 'pptx', 0);
    expect(data.elements).toHaveLength(3);
    // Snapshot type+position only (IDs change on every paste)
    expect(data.elements.map((e) => ({ type: e.type, x: e.x, y: e.y, width: e.width, height: e.height }))).toMatchSnapshot();
  });

  it('round-trip: shape visual properties survive serialize → deserialize', () => {
    const shape = makeShapeElement('s1', 15, 25, 80, 60);
    const data = serializeToClipboard([shape], 'pptx', 0);
    const pasted = deserializeFromClipboard(data, 'pptx');

    expect(pasted[0].x).toBe(15);
    expect(pasted[0].y).toBe(25);
    expect(pasted[0].width).toBe(80);
    expect(pasted[0].height).toBe(60);
    // New ID assigned
    expect(pasted[0].id).not.toBe('s1');
  });

  it('round-trip: text paragraph content survives serialize → deserialize', () => {
    const text = makeTextElement('t1', 10, 20, 300, 40, 'Round-trip text content');
    const data = serializeToClipboard([text], 'pptx', 0);
    const pasted = deserializeFromClipboard(data, 'pptx') as TextElement[];
    expect(pasted[0].paragraphs[0].runs[0].text).toBe('Round-trip text content');
  });

  it('round-trip: group childIds remapped to new IDs', () => {
    const child = makeShapeElement('child1', 10, 10, 30, 30);
    const group: GroupElement = {
      id: 'group1',
      type: 'group',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      index: '0',
      parentId: null,
      locked: false,
      childIds: ['child1'],
    };
    const data = serializeToClipboard([child, group], 'pptx', 0);
    const pasted = deserializeFromClipboard(data, 'pptx');

    const pastedGroup = pasted.find((e) => e.type === 'group') as GroupElement;
    const pastedChild = pasted.find((e) => e.type === 'shape')!;

    // childIds must be updated to the new child ID
    expect(pastedGroup.childIds).toContain(pastedChild.id);
    expect(pastedGroup.childIds).not.toContain('child1');
  });

  it('sourceFormat is normalized to lowercase canonical value', () => {
    expect(serializeToClipboard([], 'PPTX', 0).sourceFormat).toBe('pptx');
    expect(serializeToClipboard([], 'PDF', 0).sourceFormat).toBe('pdf');
  });

  it('sourcePage is preserved in ClipboardData', () => {
    expect(serializeToClipboard([], 'pptx', 5).sourcePage).toBe(5);
  });

  it('each deserialize call produces unique IDs', () => {
    const elements = [makeShapeElement('s1', 0, 0, 50, 50)];
    const data = serializeToClipboard(elements, 'pptx', 0);
    const paste1 = deserializeFromClipboard(data, 'pptx');
    const paste2 = deserializeFromClipboard(data, 'pptx');
    expect(paste1[0].id).not.toBe(paste2[0].id);
  });
});

// ─── Dirty tracking golden snapshots ────────────────────

describe('structural golden: DirtyTracker', () => {
  it('starts with nothing dirty, size=0, getDirtyItems empty', () => {
    const tracker = new DirtyTracker<{ id: string }>();
    expect(tracker.size).toBe(0);
    expect(tracker.getDirtyItems()).toHaveLength(0);
  });

  it('markDirty + isDirty lifecycle', () => {
    const tracker = new DirtyTracker<{ id: string }>();
    const obj1 = { id: 'a' };
    const obj2 = { id: 'b' };

    expect(tracker.isDirty(obj1)).toBe(false);
    tracker.markDirty(obj1);
    expect(tracker.isDirty(obj1)).toBe(true);
    expect(tracker.isDirty(obj2)).toBe(false);
  });

  it('getDirtyItems returns all marked objects', () => {
    const tracker = new DirtyTracker<{ id: string }>();
    const a = { id: 'a' };
    const b = { id: 'b' };
    const c = { id: 'c' };
    tracker.markDirty(a);
    tracker.markDirty(b);
    tracker.markDirty(c);
    const items = tracker.getDirtyItems();
    expect(items).toHaveLength(3);
    expect(items).toContain(a);
    expect(items).toContain(b);
    expect(items).toContain(c);
    expect(tracker.size).toBe(3);
  });

  it('marking same object twice does not increase size', () => {
    const tracker = new DirtyTracker<{ id: string }>();
    const obj = { id: 'x' };
    tracker.markDirty(obj);
    tracker.markDirty(obj);
    expect(tracker.size).toBe(1);
    expect(tracker.getDirtyItems()).toHaveLength(1);
  });

  it('clearAll resets all state', () => {
    const tracker = new DirtyTracker<{ id: string }>();
    const a = { id: 'a' };
    const b = { id: 'b' };
    tracker.markDirty(a);
    tracker.markDirty(b);
    tracker.clearAll();
    expect(tracker.size).toBe(0);
    expect(tracker.getDirtyItems()).toHaveLength(0);
    expect(tracker.isDirty(a)).toBe(false);
    expect(tracker.isDirty(b)).toBe(false);
  });

  it('objects can be re-dirtied after clearAll', () => {
    const tracker = new DirtyTracker<{ id: string }>();
    const obj = { id: 'a' };
    tracker.markDirty(obj);
    tracker.clearAll();
    tracker.markDirty(obj);
    expect(tracker.isDirty(obj)).toBe(true);
    expect(tracker.size).toBe(1);
  });

  it('getDirtyItems snapshot is independent of subsequent markDirty calls', () => {
    const tracker = new DirtyTracker<{ id: string }>();
    const a = { id: 'a' };
    const b = { id: 'b' };
    tracker.markDirty(a);
    const snapshot = tracker.getDirtyItems();
    tracker.markDirty(b);
    // Original snapshot must not include b
    expect(snapshot).toHaveLength(1);
    expect(snapshot).not.toContain(b);
  });

  it('tracks object identity, not structural equality', () => {
    const tracker = new DirtyTracker<{ id: string }>();
    const a = { id: 'same' };
    const b = { id: 'same' }; // equal content, different reference
    tracker.markDirty(a);
    expect(tracker.isDirty(a)).toBe(true);
    expect(tracker.isDirty(b)).toBe(false);
  });
});

describe('structural golden: WeakDirtyTracker', () => {
  it('starts clean', () => {
    const tracker = new WeakDirtyTracker();
    const obj = { id: 1 };
    expect(tracker.isDirty(obj)).toBe(false);
  });

  it('markDirty + isDirty basic lifecycle', () => {
    const tracker = new WeakDirtyTracker();
    const obj = { id: 1 };
    tracker.markDirty(obj);
    expect(tracker.isDirty(obj)).toBe(true);
  });

  it('clearAll resets dirty state', () => {
    const tracker = new WeakDirtyTracker();
    const a = { id: 1 };
    const b = { id: 2 };
    tracker.markDirty(a);
    tracker.markDirty(b);
    tracker.clearAll();
    expect(tracker.isDirty(a)).toBe(false);
    expect(tracker.isDirty(b)).toBe(false);
  });

  it('tracks object identity, not equality', () => {
    const tracker = new WeakDirtyTracker();
    const a = { id: 1 };
    const b = { id: 1 }; // same shape, different ref
    tracker.markDirty(a);
    expect(tracker.isDirty(a)).toBe(true);
    expect(tracker.isDirty(b)).toBe(false);
  });
});

// ─── Cross-module integration golden snapshots ──────────

describe('structural golden: search + spatial integration', () => {
  it('searchText results bounds fall within queryTextInRect coverage area', () => {
    const page = makePage('p1', [
      makeTextElement('t1', 50, 100, 200, 30, 'Target text'),
      makeTextElement('t2', 50, 140, 200, 30, 'Other content'),
    ]);

    const searchResults = searchText([page], 'Target text');
    expect(searchResults).toHaveLength(1);

    // The element containing the match should be findable via spatial query
    const matchBounds = searchResults[0].bounds;
    // Query for text elements in the match region
    const textEls = queryTextInRect(page.elements, matchBounds);
    const ids = textEls.map((e) => e.id);
    expect(ids).toContain('t1');
  });

  it('serializeToClipboard then search finds the same text', () => {
    const elements = [
      makeTextElement('t1', 0, 0, 200, 30, 'Clipboard search test'),
    ];
    const data = serializeToClipboard(elements, 'pptx', 0);
    const pasted = deserializeFromClipboard(data, 'pptx');

    // Build a page from the pasted elements
    const page = makePage('pasted', pasted);
    const results = searchText([page], 'Clipboard search test');
    expect(results).toHaveLength(1);
    // The pasted element should be found (new ID, same text)
    expect(results[0].elementId).toBe(pasted[0].id);
  });

  it('boundingBox of search result bounds is contained in element bounds', () => {
    const el = makeTextElement('t1', 20, 40, 300, 50, 'Find this phrase here');
    const page = makePage('p1', [el]);
    const results = searchText([page], 'phrase');
    expect(results).toHaveLength(1);

    const { bounds } = results[0];
    const elBounds = getBounds(el);

    // Match bounds must be within the element bounds
    expect(bounds.x).toBeGreaterThanOrEqual(elBounds.x);
    expect(bounds.y).toBeGreaterThanOrEqual(elBounds.y);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(elBounds.x + elBounds.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(elBounds.y + elBounds.height);
  });
});
