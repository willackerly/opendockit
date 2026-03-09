import { describe, it, expect } from 'vitest';
import {
  matchElements,
  extractText,
  centroidDistance,
  computeIoU,
  longestCommonSubstring,
} from '../debug/element-matcher.js';
import type { TextElement, ShapeElement, ImageElement, PageElement } from '../types.js';
import {
  baseProps,
  makeTextElement,
  makeMultiRunTextElement,
  makeShapeElement,
  makeImageElement,
} from './test-helpers.js';

// ─── Additional helpers ──────────────────────────────────

/** Create a TextElement with multiple paragraphs. */
function makeMultiParagraphText(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  paragraphs: string[],
): TextElement {
  return {
    ...baseProps,
    id,
    type: 'text',
    x,
    y,
    width,
    height,
    paragraphs: paragraphs.map((text) => ({
      runs: [
        {
          text,
          fontFamily: 'Helvetica',
          fontSize: 12,
          color: { r: 0, g: 0, b: 0 },
          x: 0,
          y: 0,
          width,
          height: 14,
        },
      ],
    })),
  };
}

/** Create a TextElement with empty paragraphs (no text). */
function makeEmptyTextElement(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): TextElement {
  return {
    ...baseProps,
    id,
    type: 'text',
    x,
    y,
    width,
    height,
    paragraphs: [],
  };
}

// ─── extractText ─────────────────────────────────────────

describe('extractText', () => {
  it('concatenates runs from a single paragraph', () => {
    const el = makeMultiRunTextElement('t1', 0, 0, 100, 20, [
      { text: 'Hello', x: 0, runWidth: 40 },
      { text: ' World', x: 40, runWidth: 60 },
    ]);
    expect(extractText(el)).toBe('Hello World');
  });

  it('joins multiple paragraphs with newlines', () => {
    const el = makeMultiParagraphText('t2', 0, 0, 100, 40, [
      'First paragraph',
      'Second paragraph',
    ]);
    expect(extractText(el)).toBe('First paragraph\nSecond paragraph');
  });

  it('returns empty string for a text element with no paragraphs', () => {
    const el = makeEmptyTextElement('t3', 0, 0, 100, 20);
    expect(extractText(el)).toBe('');
  });

  it('returns empty string for a shape element', () => {
    const el = makeShapeElement('s1', 0, 0, 100, 100);
    expect(extractText(el)).toBe('');
  });

  it('returns empty string for an image element', () => {
    const el = makeImageElement('i1', 0, 0, 100, 100);
    expect(extractText(el)).toBe('');
  });

  it('handles a single-run single-paragraph element', () => {
    const el = makeTextElement('t4', 0, 0, 100, 20, 'Simple text');
    expect(extractText(el)).toBe('Simple text');
  });
});

// ─── centroidDistance ────────────────────────────────────

describe('centroidDistance', () => {
  it('returns 0 for the same position and size', () => {
    const a = makeShapeElement('a', 10, 20, 100, 50);
    const b = makeShapeElement('b', 10, 20, 100, 50);
    expect(centroidDistance(a, b)).toBe(0);
  });

  it('computes correct horizontal distance', () => {
    const a = makeShapeElement('a', 0, 0, 10, 10); // centroid (5, 5)
    const b = makeShapeElement('b', 10, 0, 10, 10); // centroid (15, 5)
    expect(centroidDistance(a, b)).toBe(10);
  });

  it('computes correct vertical distance', () => {
    const a = makeShapeElement('a', 0, 0, 10, 10); // centroid (5, 5)
    const b = makeShapeElement('b', 0, 20, 10, 10); // centroid (5, 25)
    expect(centroidDistance(a, b)).toBe(20);
  });

  it('computes correct diagonal distance (3-4-5 triangle)', () => {
    const a = makeShapeElement('a', 0, 0, 0, 0); // centroid (0, 0)
    const b = makeShapeElement('b', 3, 4, 0, 0); // centroid (3, 4)
    expect(centroidDistance(a, b)).toBe(5);
  });

  it('accounts for width and height when computing centroids', () => {
    const a = makeShapeElement('a', 0, 0, 20, 20); // centroid (10, 10)
    const b = makeShapeElement('b', 20, 20, 40, 40); // centroid (40, 40)
    // dx = 30, dy = 30, distance = sqrt(900 + 900) = sqrt(1800)
    expect(centroidDistance(a, b)).toBeCloseTo(Math.sqrt(1800));
  });
});

// ─── computeIoU ──────────────────────────────────────────

describe('computeIoU', () => {
  it('returns 1.0 for identical boxes', () => {
    const a = makeShapeElement('a', 10, 10, 100, 50);
    const b = makeShapeElement('b', 10, 10, 100, 50);
    expect(computeIoU(a, b)).toBe(1);
  });

  it('returns 0 for non-overlapping boxes', () => {
    const a = makeShapeElement('a', 0, 0, 10, 10);
    const b = makeShapeElement('b', 20, 20, 10, 10);
    expect(computeIoU(a, b)).toBe(0);
  });

  it('returns 0 for boxes that touch but do not overlap', () => {
    const a = makeShapeElement('a', 0, 0, 10, 10);
    const b = makeShapeElement('b', 10, 0, 10, 10); // shares edge at x=10
    expect(computeIoU(a, b)).toBe(0);
  });

  it('computes correct partial overlap', () => {
    // a: [0,0] to [10,10], b: [5,5] to [15,15]
    // intersection: [5,5] to [10,10] = 5*5 = 25
    // areaA = 100, areaB = 100, union = 100+100-25 = 175
    // IoU = 25/175 = 1/7
    const a = makeShapeElement('a', 0, 0, 10, 10);
    const b = makeShapeElement('b', 5, 5, 10, 10);
    expect(computeIoU(a, b)).toBeCloseTo(25 / 175);
  });

  it('computes correct IoU when one box is contained in another', () => {
    // a: [0,0] to [20,20] = 400, b: [5,5] to [15,15] = 100
    // intersection = 100, union = 400+100-100 = 400
    // IoU = 100/400 = 0.25
    const a = makeShapeElement('a', 0, 0, 20, 20);
    const b = makeShapeElement('b', 5, 5, 10, 10);
    expect(computeIoU(a, b)).toBeCloseTo(0.25);
  });

  it('returns 0 for zero-area boxes', () => {
    const a = makeShapeElement('a', 5, 5, 0, 0);
    const b = makeShapeElement('b', 5, 5, 0, 0);
    expect(computeIoU(a, b)).toBe(0);
  });

  it('returns 0 when one box has zero width', () => {
    const a = makeShapeElement('a', 0, 0, 0, 10);
    const b = makeShapeElement('b', 0, 0, 10, 10);
    expect(computeIoU(a, b)).toBe(0);
  });
});

// ─── longestCommonSubstring ──────────────────────────────

describe('longestCommonSubstring', () => {
  it('returns full length for identical strings', () => {
    expect(longestCommonSubstring('hello', 'hello')).toBe(5);
  });

  it('returns 0 for completely different strings', () => {
    expect(longestCommonSubstring('abc', 'xyz')).toBe(0);
  });

  it('finds the longest common substring', () => {
    expect(longestCommonSubstring('abcdef', 'xbcdey')).toBe(4); // 'bcde'
  });

  it('returns 0 when first string is empty', () => {
    expect(longestCommonSubstring('', 'hello')).toBe(0);
  });

  it('returns 0 when second string is empty', () => {
    expect(longestCommonSubstring('hello', '')).toBe(0);
  });

  it('returns 0 when both strings are empty', () => {
    expect(longestCommonSubstring('', '')).toBe(0);
  });

  it('handles single character match', () => {
    expect(longestCommonSubstring('a', 'a')).toBe(1);
  });

  it('handles single character no match', () => {
    expect(longestCommonSubstring('a', 'b')).toBe(0);
  });

  it('finds substring at the beginning', () => {
    expect(longestCommonSubstring('abcxyz', 'abcdef')).toBe(3); // 'abc'
  });

  it('finds substring at the end', () => {
    expect(longestCommonSubstring('xyzabc', 'defabc')).toBe(3); // 'abc'
  });

  it('returns length of longer common substring when multiple exist', () => {
    // 'ab' and 'ef' are common, but 'ab' is first; both length 2
    expect(longestCommonSubstring('ab--ef', 'ab..ef')).toBe(2);
  });
});

// ─── matchElements ───────────────────────────────────────

describe('matchElements', () => {
  // ── Empty inputs ──

  it('returns empty result for two empty arrays', () => {
    const result = matchElements([], []);
    expect(result.matched).toEqual([]);
    expect(result.unmatchedA).toEqual([]);
    expect(result.unmatchedB).toEqual([]);
  });

  it('returns all A elements as unmatched when B is empty', () => {
    const a = [makeTextElement('a1', 0, 0, 100, 20, 'Hello')];
    const result = matchElements(a, []);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatchedA).toEqual(a);
    expect(result.unmatchedB).toEqual([]);
  });

  it('returns all B elements as unmatched when A is empty', () => {
    const b = [makeTextElement('b1', 0, 0, 100, 20, 'Hello')];
    const result = matchElements([], b);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatchedA).toEqual([]);
    expect(result.unmatchedB).toEqual(b);
  });

  // ── Pass 1: Text-exact matching ──

  describe('text-exact matching', () => {
    it('matches text elements with identical text', () => {
      const a = [makeTextElement('a1', 0, 0, 100, 20, 'Hello World')];
      const b = [makeTextElement('b1', 0, 0, 100, 20, 'Hello World')];
      const result = matchElements(a, b);

      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].matchMethod).toBe('text-exact');
      expect(result.matched[0].confidence).toBe(1.0);
      expect(result.matched[0].a.id).toBe('a1');
      expect(result.matched[0].b.id).toBe('b1');
      expect(result.unmatchedA).toHaveLength(0);
      expect(result.unmatchedB).toHaveLength(0);
    });

    it('normalizes whitespace and case for exact matching', () => {
      const a = [makeTextElement('a1', 0, 0, 100, 20, '  Hello   World  ')];
      const b = [makeTextElement('b1', 0, 0, 100, 20, 'hello world')];
      const result = matchElements(a, b);

      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].matchMethod).toBe('text-exact');
    });

    it('picks the closest centroid when multiple B elements have the same text', () => {
      const a = [makeTextElement('a1', 10, 10, 100, 20, 'Hello')];
      const bFar = makeTextElement('b-far', 500, 500, 100, 20, 'Hello');
      const bNear = makeTextElement('b-near', 12, 12, 100, 20, 'Hello');
      const result = matchElements(a, [bFar, bNear]);

      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].b.id).toBe('b-near');
      expect(result.unmatchedB).toHaveLength(1);
      expect(result.unmatchedB[0].id).toBe('b-far');
    });

    it('skips text elements with empty normalized text', () => {
      const a = [makeEmptyTextElement('a1', 0, 0, 100, 20)];
      const b = [makeEmptyTextElement('b1', 0, 0, 100, 20)];
      const result = matchElements(a, b);

      expect(result.matched).toHaveLength(0);
      expect(result.unmatchedA).toHaveLength(1);
      expect(result.unmatchedB).toHaveLength(1);
    });

    it('matches multiple text-exact pairs', () => {
      const a = [
        makeTextElement('a1', 0, 0, 100, 20, 'First'),
        makeTextElement('a2', 0, 30, 100, 20, 'Second'),
      ];
      const b = [
        makeTextElement('b1', 0, 0, 100, 20, 'First'),
        makeTextElement('b2', 0, 30, 100, 20, 'Second'),
      ];
      const result = matchElements(a, b);

      expect(result.matched).toHaveLength(2);
      expect(result.matched.every((m) => m.matchMethod === 'text-exact')).toBe(true);
    });
  });

  // ── Pass 2: Text-fuzzy matching ──

  describe('text-fuzzy matching', () => {
    it('matches text elements with similar text above 0.7 threshold and within 50pt', () => {
      // 'Hello World' vs 'Hello Worl' — LCS = 10, max = 11, ratio ~0.909
      const a = [makeTextElement('a1', 0, 0, 100, 20, 'Hello World')];
      const b = [makeTextElement('b1', 5, 5, 100, 20, 'Hello Worl')];
      const result = matchElements(a, b);

      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].matchMethod).toBe('text-fuzzy');
      expect(result.matched[0].confidence).toBeGreaterThan(0.7);
    });

    it('does not match text with similarity below 0.7', () => {
      // 'abcdefghij' vs 'xyzabcwwww' — LCS = 3, max = 10, ratio = 0.3
      const a = [makeTextElement('a1', 0, 0, 100, 20, 'abcdefghij')];
      const b = [makeTextElement('b1', 5, 5, 100, 20, 'xyzabcwwww')];
      const result = matchElements(a, b);

      expect(result.matched).toHaveLength(0);
    });

    it('does not match text when centroid distance exceeds 50pt', () => {
      // Same text with minor difference, but far apart
      const a = [makeTextElement('a1', 0, 0, 100, 20, 'Hello World')];
      const b = [makeTextElement('b1', 200, 200, 100, 20, 'Hello Worl')];
      const result = matchElements(a, b);

      expect(result.matched).toHaveLength(0);
    });

    it('prefers higher similarity over closer distance', () => {
      const a = [makeTextElement('a1', 0, 0, 100, 20, 'abcdefghij')];
      // b1: LCS = 8 ('abcdefgh'), similarity = 8/10 = 0.8, distance = 30
      const b1 = makeTextElement('b1', 30, 0, 100, 20, 'abcdefghzz');
      // b2: LCS = 9 ('abcdefghi'), similarity = 9/10 = 0.9, distance = 40
      const b2 = makeTextElement('b2', 40, 0, 100, 20, 'abcdefghiz');
      const result = matchElements(a, [b1, b2]);

      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].b.id).toBe('b2');
      expect(result.matched[0].matchMethod).toBe('text-fuzzy');
    });

    it('uses distance as tiebreaker when similarity is equal', () => {
      const a = [makeTextElement('a1', 0, 0, 100, 20, 'abcdefghij')];
      // Both have same LCS with 'a1': LCS of 'abcdefghi' = 9, similarity = 9/10
      const bFar = makeTextElement('b-far', 30, 0, 100, 20, 'abcdefghiX');
      const bNear = makeTextElement('b-near', 5, 0, 100, 20, 'abcdefghiY');
      const result = matchElements(a, [bFar, bNear]);

      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].b.id).toBe('b-near');
    });

    it('does not fuzzy-match elements already matched in pass 1', () => {
      const a = [
        makeTextElement('a1', 0, 0, 100, 20, 'Exact match text'),
        makeTextElement('a2', 0, 30, 100, 20, 'Similar tex'),
      ];
      const b = [
        makeTextElement('b1', 0, 0, 100, 20, 'Exact match text'), // exact match with a1
        makeTextElement('b2', 0, 30, 100, 20, 'Similar text'),
      ];
      const result = matchElements(a, b);

      expect(result.matched).toHaveLength(2);
      // a1 matched exact with b1
      const exactMatch = result.matched.find((m) => m.a.id === 'a1');
      expect(exactMatch?.matchMethod).toBe('text-exact');
      expect(exactMatch?.b.id).toBe('b1');
      // a2 fuzzy-matched with b2
      const fuzzyMatch = result.matched.find((m) => m.a.id === 'a2');
      expect(fuzzyMatch?.matchMethod).toBe('text-fuzzy');
      expect(fuzzyMatch?.b.id).toBe('b2');
    });
  });

  // ── Pass 3: Spatial matching ──

  describe('spatial matching', () => {
    it('matches non-text elements with IoU > 0.3', () => {
      // Identical shapes
      const a = [makeShapeElement('a1', 10, 10, 100, 50)];
      const b = [makeShapeElement('b1', 10, 10, 100, 50)];
      const result = matchElements(a, b);

      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].matchMethod).toBe('spatial');
      expect(result.matched[0].confidence).toBe(1);
    });

    it('does not spatially match elements with IoU <= 0.3', () => {
      // Boxes far apart
      const a = [makeShapeElement('a1', 0, 0, 10, 10)];
      const b = [makeShapeElement('b1', 50, 50, 10, 10)];
      const result = matchElements(a, b);

      expect(result.matched).toHaveLength(0);
      expect(result.unmatchedA).toHaveLength(1);
      expect(result.unmatchedB).toHaveLength(1);
    });

    it('requires same type for spatial matching', () => {
      // Shape vs Image at same position — should NOT match
      const a: PageElement[] = [makeShapeElement('a1', 10, 10, 100, 50)];
      const b: PageElement[] = [makeImageElement('b1', 10, 10, 100, 50)];
      const result = matchElements(a, b);

      expect(result.matched).toHaveLength(0);
      expect(result.unmatchedA).toHaveLength(1);
      expect(result.unmatchedB).toHaveLength(1);
    });

    it('matches image elements spatially', () => {
      const a: PageElement[] = [makeImageElement('a1', 10, 10, 100, 50)];
      const b: PageElement[] = [makeImageElement('b1', 10, 10, 100, 50)];
      const result = matchElements(a, b);

      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].matchMethod).toBe('spatial');
    });

    it('picks the best IoU when multiple candidates exist', () => {
      const a: PageElement[] = [makeShapeElement('a1', 0, 0, 100, 100)];
      const bLowOverlap = makeShapeElement('b-low', 60, 60, 100, 100);
      const bHighOverlap = makeShapeElement('b-high', 10, 10, 100, 100);
      const b: PageElement[] = [bLowOverlap, bHighOverlap];
      const result = matchElements(a, b);

      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].b.id).toBe('b-high');
    });

    it('does not spatially match text elements', () => {
      // Text elements with identical bounding boxes but different text
      // should NOT be spatially matched (spatial pass only runs on non-text)
      const a = [makeTextElement('a1', 10, 10, 100, 20, 'XXXX')];
      const b = [makeTextElement('b1', 10, 10, 100, 20, 'YYYY')];
      const result = matchElements(a, b);

      // Neither exact nor fuzzy will match these (no common substring)
      // Spatial pass skips text elements
      expect(result.matched).toHaveLength(0);
      expect(result.unmatchedA).toHaveLength(1);
      expect(result.unmatchedB).toHaveLength(1);
    });
  });

  // ── Mixed types ──

  describe('mixed element types', () => {
    it('matches text elements first, then spatial for non-text', () => {
      const a: PageElement[] = [
        makeTextElement('a-text', 0, 0, 100, 20, 'Title'),
        makeShapeElement('a-shape', 50, 50, 80, 80),
      ];
      const b: PageElement[] = [
        makeTextElement('b-text', 0, 0, 100, 20, 'Title'),
        makeShapeElement('b-shape', 50, 50, 80, 80),
      ];
      const result = matchElements(a, b);

      expect(result.matched).toHaveLength(2);

      const textMatch = result.matched.find((m) => m.a.id === 'a-text');
      expect(textMatch?.matchMethod).toBe('text-exact');

      const shapeMatch = result.matched.find((m) => m.a.id === 'a-shape');
      expect(shapeMatch?.matchMethod).toBe('spatial');
    });

    it('leaves unmatched elements from both sources', () => {
      const a: PageElement[] = [
        makeTextElement('a1', 0, 0, 100, 20, 'Completely unique alpha'),
        makeShapeElement('a2', 200, 200, 50, 50),
      ];
      const b: PageElement[] = [
        makeTextElement('b1', 0, 0, 100, 20, 'Totally different beta'),
        makeImageElement('b2', 300, 300, 50, 50),
      ];
      const result = matchElements(a, b);

      expect(result.matched).toHaveLength(0);
      expect(result.unmatchedA).toHaveLength(2);
      expect(result.unmatchedB).toHaveLength(2);
    });

    it('handles a complex scenario with all three match methods', () => {
      const a: PageElement[] = [
        makeTextElement('a-exact', 0, 0, 100, 20, 'Exact Match'),
        makeTextElement('a-fuzzy', 0, 30, 100, 20, 'Almost the same text here'),
        makeShapeElement('a-spatial', 50, 50, 80, 80),
        makeTextElement('a-unmatched', 0, 60, 100, 20, 'Unique to A'),
      ];
      const b: PageElement[] = [
        makeTextElement('b-exact', 2, 2, 100, 20, 'Exact Match'),
        makeTextElement('b-fuzzy', 2, 32, 100, 20, 'Almost the same text her'),
        makeShapeElement('b-spatial', 55, 55, 80, 80),
        makeImageElement('b-unmatched', 300, 300, 50, 50),
      ];
      const result = matchElements(a, b);

      expect(result.matched).toHaveLength(3);

      const exact = result.matched.find((m) => m.matchMethod === 'text-exact');
      expect(exact?.a.id).toBe('a-exact');
      expect(exact?.b.id).toBe('b-exact');

      const fuzzy = result.matched.find((m) => m.matchMethod === 'text-fuzzy');
      expect(fuzzy?.a.id).toBe('a-fuzzy');
      expect(fuzzy?.b.id).toBe('b-fuzzy');

      const spatial = result.matched.find((m) => m.matchMethod === 'spatial');
      expect(spatial?.a.id).toBe('a-spatial');
      expect(spatial?.b.id).toBe('b-spatial');

      expect(result.unmatchedA).toHaveLength(1);
      expect(result.unmatchedA[0].id).toBe('a-unmatched');
      expect(result.unmatchedB).toHaveLength(1);
      expect(result.unmatchedB[0].id).toBe('b-unmatched');
    });

    it('does not double-match an element used in an earlier pass', () => {
      // b1 has exact text match with a1, and also high IoU with a-shape
      // but b1 is text so spatial pass won't consider it anyway
      // Meanwhile, a-shape should not match b1
      const a: PageElement[] = [
        makeTextElement('a-text', 10, 10, 100, 20, 'Shared Text'),
        makeShapeElement('a-shape', 10, 10, 100, 20),
      ];
      const b: PageElement[] = [
        makeTextElement('b-text', 10, 10, 100, 20, 'Shared Text'),
      ];
      const result = matchElements(a, b);

      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].matchMethod).toBe('text-exact');
      expect(result.unmatchedA).toHaveLength(1);
      expect(result.unmatchedA[0].id).toBe('a-shape');
    });
  });
});
