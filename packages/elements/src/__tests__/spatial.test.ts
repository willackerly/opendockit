import { describe, it, expect } from 'vitest';
import {
  rectsOverlap,
  pointInRect,
  isPointInBounds,
  hitTest,
  elementAtPoint,
  getBounds,
  getOverlapping,
  queryElementsInRect,
  queryTextInRect,
  elementAtPoint as _elementAtPoint,
  boundingBox,
  extractTextInRect,
  rectIntersection,
  rectArea,
  overlapFraction,
  elementToRect,
} from '../spatial.js';
import type { PageElement, TextElement, ShapeElement, ImageElement } from '../types.js';

// ─── Test helpers ────────────────────────────────────────

const baseProps = {
  rotation: 0,
  opacity: 1,
  index: '0',
  parentId: null,
  locked: false,
};

function makeTextElement(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
): TextElement {
  return {
    ...baseProps,
    id,
    type: 'text',
    x,
    y,
    width,
    height,
    paragraphs: [
      {
        runs: [
          {
            text,
            fontFamily: 'Helvetica',
            fontSize: 12,
            color: { r: 0, g: 0, b: 0 },
            x: 0,
            y: 0,
            width,
            height,
          },
        ],
      },
    ],
  };
}

function makeShapeElement(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): ShapeElement {
  return {
    ...baseProps,
    id,
    type: 'shape',
    x,
    y,
    width,
    height,
    shapeType: 'rectangle',
    fill: null,
    stroke: null,
  };
}

function makeImageElement(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): ImageElement {
  return {
    ...baseProps,
    id,
    type: 'image',
    x,
    y,
    width,
    height,
    imageRef: 'img1',
    mimeType: 'image/png',
    objectFit: 'fill',
  };
}

// ─── Tests ──────────────────────────────────────────────

describe('rectsOverlap', () => {
  it('detects overlapping rectangles', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 5, y: 5, width: 10, height: 10 };
    expect(rectsOverlap(a, b)).toBe(true);
  });

  it('detects non-overlapping rectangles (horizontally separated)', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 20, y: 0, width: 10, height: 10 };
    expect(rectsOverlap(a, b)).toBe(false);
  });

  it('detects non-overlapping rectangles (vertically separated)', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 0, y: 20, width: 10, height: 10 };
    expect(rectsOverlap(a, b)).toBe(false);
  });

  it('returns false for edge-touching (no area overlap)', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 10, y: 0, width: 10, height: 10 };
    expect(rectsOverlap(a, b)).toBe(false);
  });

  it('detects contained rectangle', () => {
    const outer = { x: 0, y: 0, width: 100, height: 100 };
    const inner = { x: 10, y: 10, width: 20, height: 20 };
    expect(rectsOverlap(outer, inner)).toBe(true);
    expect(rectsOverlap(inner, outer)).toBe(true);
  });

  it('detects identical rectangles', () => {
    const a = { x: 5, y: 5, width: 10, height: 10 };
    expect(rectsOverlap(a, a)).toBe(true);
  });
});

describe('isPointInBounds / pointInRect', () => {
  const rect = { x: 10, y: 10, width: 20, height: 20 };

  it('returns true for point inside', () => {
    expect(isPointInBounds(15, 15, rect)).toBe(true);
    expect(pointInRect(15, 15, rect)).toBe(true);
  });

  it('returns false for point outside', () => {
    expect(isPointInBounds(5, 5, rect)).toBe(false);
    expect(isPointInBounds(35, 35, rect)).toBe(false);
  });

  it('returns true for point on edge (inclusive)', () => {
    expect(isPointInBounds(10, 10, rect)).toBe(true); // top-left corner
    expect(isPointInBounds(30, 30, rect)).toBe(true); // bottom-right corner
    expect(isPointInBounds(20, 10, rect)).toBe(true); // top edge
    expect(isPointInBounds(10, 20, rect)).toBe(true); // left edge
  });

  it('returns false for point just outside edge', () => {
    expect(isPointInBounds(9.999, 15, rect)).toBe(false);
    expect(isPointInBounds(30.001, 15, rect)).toBe(false);
  });
});

describe('hitTest / elementAtPoint', () => {
  // z-ordered back to front: s1 (back), s2 (front)
  const elements: PageElement[] = [
    makeShapeElement('s1', 0, 0, 100, 100),
    makeShapeElement('s2', 50, 50, 100, 100),
  ];

  it('returns the topmost (last) element at the point', () => {
    // Point (75, 75) is inside both s1 and s2 — s2 is on top
    const result = hitTest(elements, 75, 75);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('s2');
  });

  it('elementAtPoint is an alias for hitTest', () => {
    expect(elementAtPoint(elements, 75, 75)).toEqual(hitTest(elements, 75, 75));
  });

  it('returns the only element at a point', () => {
    // Point (10, 10) is only inside s1
    const result = hitTest(elements, 10, 10);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('s1');
  });

  it('returns null for a miss', () => {
    const result = hitTest(elements, 300, 300);
    expect(result).toBeNull();
  });

  it('returns null for empty element list', () => {
    const result = hitTest([], 10, 10);
    expect(result).toBeNull();
  });
});

describe('getBounds', () => {
  it('returns element position and size as bounds', () => {
    const el = makeShapeElement('s1', 15, 25, 35, 45);
    expect(getBounds(el)).toEqual({ x: 15, y: 25, width: 35, height: 45 });
  });
});

describe('getOverlapping', () => {
  const elements: PageElement[] = [
    makeShapeElement('s1', 0, 0, 50, 50),
    makeTextElement('t1', 100, 100, 50, 20, 'Hello'),
    makeImageElement('i1', 200, 200, 30, 30),
  ];

  it('returns elements overlapping the given bounds', () => {
    const result = getOverlapping(elements, { x: 0, y: 0, width: 60, height: 60 });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('s1');
  });

  it('returns multiple overlapping elements', () => {
    const result = getOverlapping(elements, { x: 0, y: 0, width: 250, height: 250 });
    expect(result).toHaveLength(3);
  });
});

describe('queryElementsInRect', () => {
  const elements: PageElement[] = [
    makeShapeElement('s1', 0, 0, 50, 50),
    makeTextElement('t1', 100, 100, 50, 20, 'Hello'),
    makeImageElement('i1', 200, 200, 30, 30),
  ];

  it('returns elements overlapping the query rect', () => {
    const result = queryElementsInRect(elements, { x: 0, y: 0, width: 60, height: 60 });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('s1');
  });

  it('returns multiple overlapping elements', () => {
    const result = queryElementsInRect(elements, { x: 0, y: 0, width: 250, height: 250 });
    expect(result).toHaveLength(3);
  });

  it('returns empty array when nothing overlaps', () => {
    const result = queryElementsInRect(elements, { x: 500, y: 500, width: 10, height: 10 });
    expect(result).toHaveLength(0);
  });

  it('handles partial overlap', () => {
    const result = queryElementsInRect(elements, { x: 45, y: 45, width: 10, height: 10 });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('s1');
  });
});

describe('queryTextInRect', () => {
  const elements: PageElement[] = [
    makeShapeElement('s1', 0, 0, 50, 50),
    makeTextElement('t1', 10, 10, 30, 10, 'Hello'),
    makeTextElement('t2', 100, 100, 30, 10, 'World'),
    makeImageElement('i1', 20, 20, 10, 10),
  ];

  it('returns only text elements in the rect', () => {
    const result = queryTextInRect(elements, { x: 0, y: 0, width: 60, height: 60 });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t1');
    expect(result[0].type).toBe('text');
  });

  it('excludes non-text elements even if they overlap', () => {
    const result = queryTextInRect(elements, { x: 0, y: 0, width: 200, height: 200 });
    expect(result).toHaveLength(2);
    expect(result.every((el) => el.type === 'text')).toBe(true);
  });

  it('returns empty when no text overlaps', () => {
    const result = queryTextInRect(elements, { x: 500, y: 500, width: 10, height: 10 });
    expect(result).toHaveLength(0);
  });
});

describe('boundingBox', () => {
  it('returns null for empty input', () => {
    expect(boundingBox([])).toBeNull();
  });

  it('returns the element rect for a single element', () => {
    const elements: PageElement[] = [makeShapeElement('s1', 10, 20, 30, 40)];
    const bb = boundingBox(elements);
    expect(bb).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it('computes combined bounding box of multiple elements', () => {
    const elements: PageElement[] = [
      makeShapeElement('s1', 0, 0, 10, 10),
      makeShapeElement('s2', 50, 50, 10, 10),
    ];
    const bb = boundingBox(elements);
    expect(bb).toEqual({ x: 0, y: 0, width: 60, height: 60 });
  });

  it('handles overlapping elements', () => {
    const elements: PageElement[] = [
      makeShapeElement('s1', 0, 0, 100, 100),
      makeShapeElement('s2', 10, 10, 20, 20),
    ];
    const bb = boundingBox(elements);
    expect(bb).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});

describe('extractTextInRect', () => {
  const elements: PageElement[] = [
    makeTextElement('t1', 0, 0, 50, 20, 'Hello'),
    makeTextElement('t2', 0, 30, 50, 20, 'World'),
    makeShapeElement('s1', 0, 60, 50, 20),
  ];

  it('extracts text from matching elements', () => {
    const text = extractTextInRect(elements, { x: 0, y: 0, width: 100, height: 100 });
    expect(text).toBe('Hello\nWorld');
  });

  it('returns empty string when no text matches', () => {
    const text = extractTextInRect(elements, { x: 500, y: 500, width: 10, height: 10 });
    expect(text).toBe('');
  });

  it('extracts text from only overlapping text elements', () => {
    const text = extractTextInRect(elements, { x: 0, y: 0, width: 100, height: 25 });
    expect(text).toBe('Hello');
  });

  it('joins multiple runs in a paragraph', () => {
    const multiRunText: TextElement = {
      ...baseProps,
      id: 'mr',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      paragraphs: [
        {
          runs: [
            {
              text: 'Hello ',
              fontFamily: 'Helvetica',
              fontSize: 12,
              color: { r: 0, g: 0, b: 0 },
              x: 0,
              y: 0,
              width: 40,
              height: 12,
            },
            {
              text: 'World',
              fontFamily: 'Helvetica',
              fontSize: 12,
              color: { r: 0, g: 0, b: 0 },
              x: 40,
              y: 0,
              width: 40,
              height: 12,
            },
          ],
        },
      ],
    };
    const text = extractTextInRect([multiRunText], { x: 0, y: 0, width: 200, height: 200 });
    expect(text).toBe('Hello World');
  });
});

describe('rectIntersection', () => {
  it('computes intersection of overlapping rects', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 5, y: 5, width: 10, height: 10 };
    expect(rectIntersection(a, b)).toEqual({ x: 5, y: 5, width: 5, height: 5 });
  });

  it('returns null for non-overlapping rects', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 20, y: 20, width: 10, height: 10 };
    expect(rectIntersection(a, b)).toBeNull();
  });

  it('returns null for edge-touching rects', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 10, y: 0, width: 10, height: 10 };
    expect(rectIntersection(a, b)).toBeNull();
  });

  it('returns inner rect when fully contained', () => {
    const outer = { x: 0, y: 0, width: 100, height: 100 };
    const inner = { x: 10, y: 10, width: 20, height: 20 };
    expect(rectIntersection(outer, inner)).toEqual({ x: 10, y: 10, width: 20, height: 20 });
  });

  it('returns identical rect for self-intersection', () => {
    const r = { x: 5, y: 5, width: 10, height: 10 };
    expect(rectIntersection(r, r)).toEqual(r);
  });
});

describe('rectArea', () => {
  it('computes area', () => {
    expect(rectArea({ x: 0, y: 0, width: 10, height: 5 })).toBe(50);
  });

  it('returns 0 for zero-dimension rect', () => {
    expect(rectArea({ x: 0, y: 0, width: 0, height: 10 })).toBe(0);
    expect(rectArea({ x: 0, y: 0, width: 10, height: 0 })).toBe(0);
  });
});

describe('overlapFraction', () => {
  it('returns 1.0 for full containment', () => {
    const el = makeShapeElement('s1', 10, 10, 20, 20);
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    expect(overlapFraction(el, rect)).toBeCloseTo(1.0);
  });

  it('returns 0.25 for quarter overlap', () => {
    const el = makeShapeElement('s1', 0, 0, 10, 10);
    const rect = { x: 5, y: 5, width: 20, height: 20 };
    // Intersection is (5,5)-(10,10) = 5x5 = 25; element area = 100; fraction = 0.25
    expect(overlapFraction(el, rect)).toBeCloseTo(0.25);
  });

  it('returns 0 for no overlap', () => {
    const el = makeShapeElement('s1', 0, 0, 10, 10);
    const rect = { x: 50, y: 50, width: 10, height: 10 };
    expect(overlapFraction(el, rect)).toBe(0);
  });

  it('returns 0 for zero-area element', () => {
    const el = makeShapeElement('s1', 5, 5, 0, 0);
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    expect(overlapFraction(el, rect)).toBe(0);
  });

  it('returns 0.5 for half overlap', () => {
    const el = makeShapeElement('s1', 0, 0, 20, 10);
    const rect = { x: 10, y: 0, width: 20, height: 10 };
    // Intersection is (10,0)-(20,10) = 10x10 = 100; element area = 200; fraction = 0.5
    expect(overlapFraction(el, rect)).toBeCloseTo(0.5);
  });
});

describe('elementToRect', () => {
  it('extracts position and size from an element', () => {
    const el = makeShapeElement('s1', 15, 25, 35, 45);
    expect(elementToRect(el)).toEqual({ x: 15, y: 25, width: 35, height: 45 });
  });
});
