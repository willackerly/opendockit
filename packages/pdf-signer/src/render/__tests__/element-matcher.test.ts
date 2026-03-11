import { describe, it, expect } from 'vitest';

import {
  levenshteinDistance,
  editDistanceRatio,
  flattenTextRuns,
  groupRunsIntoWords,
  matchTextElements,
  scorePageElements,
  generateElementDiffReport,
  type FlatTextRun,
  type GroundTruthWord,
  type TextMatch,
  type PageDiffResult,
} from './element-matcher.js';

import type { PageElement, TextElement } from '../../elements/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTextElement(
  overrides: Partial<TextElement> & {
    paragraphs: TextElement['paragraphs'];
  }
): TextElement {
  return {
    id: 'text-1',
    type: 'text',
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    rotation: 0,
    opacity: 1,
    index: '0',
    parentId: null,
    locked: false,
    ...overrides,
  };
}

function makeRun(
  text: string,
  x: number,
  y: number,
  width: number,
  height = 12,
  fontSize = 12,
  fontFamily = 'Helvetica'
) {
  return {
    text,
    x,
    y,
    width,
    height,
    fontSize,
    fontFamily,
    color: { r: 0, g: 0, b: 0 },
  };
}

function makeGroundWord(
  text: string,
  x: number,
  y: number,
  width: number,
  height = 12,
  fontSize?: number
): GroundTruthWord {
  return { text, x, y, width, height, fontSize };
}

function makeFlatRun(
  text: string,
  x: number,
  y: number,
  width: number,
  height = 12,
  fontSize = 12,
  fontFamily = 'Helvetica'
): FlatTextRun {
  return { text, x, y, width, height, fontSize, fontFamily };
}

// ─── Levenshtein Distance ───────────────────────────────────────────

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('returns length for empty vs non-empty', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  it('returns 0 for two empty strings', () => {
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('computes single character difference', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
  });

  it('computes insertion', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
  });

  it('computes deletion', () => {
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
  });

  it('computes complex edit distance', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('computes distance for completely different strings', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
  });

  it('is symmetric', () => {
    expect(levenshteinDistance('hello', 'world')).toBe(
      levenshteinDistance('world', 'hello')
    );
  });
});

describe('editDistanceRatio', () => {
  it('returns 0 for identical strings', () => {
    expect(editDistanceRatio('hello', 'hello')).toBe(0);
  });

  it('returns 1 for completely different strings of same length', () => {
    expect(editDistanceRatio('abc', 'xyz')).toBe(1);
  });

  it('returns 0 for two empty strings', () => {
    expect(editDistanceRatio('', '')).toBe(0);
  });

  it('returns value between 0 and 1', () => {
    const ratio = editDistanceRatio('kitten', 'sitting');
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);
    expect(ratio).toBeCloseTo(3 / 7, 5);
  });
});

// ─── flattenTextRuns ────────────────────────────────────────────────

describe('flattenTextRuns', () => {
  it('returns empty array for no elements', () => {
    expect(flattenTextRuns([])).toEqual([]);
  });

  it('ignores non-text elements', () => {
    const elements: PageElement[] = [
      {
        id: 'img-1',
        type: 'image',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        index: '0',
        parentId: null,
        locked: false,
        imageRef: 'ref',
        mimeType: 'image/png',
        objectFit: 'fill',
      },
    ];
    expect(flattenTextRuns(elements)).toEqual([]);
  });

  it('flattens single text element with one run', () => {
    const el = makeTextElement({
      x: 50,
      y: 100,
      paragraphs: [{ runs: [makeRun('Hello', 10, 5, 40)] }],
    });
    const result = flattenTextRuns([el]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      text: 'Hello',
      x: 60, // 50 + 10
      y: 105, // 100 + 5
      width: 40,
      height: 12,
      fontSize: 12,
      fontFamily: 'Helvetica',
    });
  });

  it('flattens multiple paragraphs and runs', () => {
    const el = makeTextElement({
      x: 10,
      y: 20,
      paragraphs: [
        {
          runs: [makeRun('Hello', 0, 0, 30), makeRun('World', 30, 0, 35)],
        },
        {
          runs: [makeRun('Second', 0, 14, 40)],
        },
      ],
    });
    const result = flattenTextRuns([el]);
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe('Hello');
    expect(result[1].text).toBe('World');
    expect(result[2].text).toBe('Second');
  });

  it('skips whitespace-only runs', () => {
    const el = makeTextElement({
      x: 0,
      y: 0,
      paragraphs: [
        {
          runs: [makeRun('A', 0, 0, 10), makeRun('  ', 10, 0, 5), makeRun('B', 15, 0, 10)],
        },
      ],
    });
    const result = flattenTextRuns([el]);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('A');
    expect(result[1].text).toBe('B');
  });

  it('handles multiple text elements', () => {
    const el1 = makeTextElement({
      id: 't1',
      x: 0,
      y: 0,
      paragraphs: [{ runs: [makeRun('First', 0, 0, 30)] }],
    });
    const el2 = makeTextElement({
      id: 't2',
      x: 100,
      y: 200,
      paragraphs: [{ runs: [makeRun('Second', 5, 5, 40)] }],
    });
    const result = flattenTextRuns([el1, el2]);
    expect(result).toHaveLength(2);
    expect(result[1].x).toBe(105);
    expect(result[1].y).toBe(205);
  });
});

// ─── groupRunsIntoWords ─────────────────────────────────────────────

describe('groupRunsIntoWords', () => {
  it('returns empty for empty input', () => {
    expect(groupRunsIntoWords([])).toEqual([]);
  });

  it('merges adjacent same-line runs', () => {
    const runs: FlatTextRun[] = [
      makeFlatRun('Hel', 10, 100, 20),
      makeFlatRun('lo', 30, 100, 15),
    ];
    const words = groupRunsIntoWords(runs);
    expect(words).toHaveLength(1);
    expect(words[0].text).toBe('Hello');
    expect(words[0].x).toBe(10);
    expect(words[0].width).toBe(35); // 10+35 - 10
  });

  it('does not merge runs on different lines', () => {
    const runs: FlatTextRun[] = [
      makeFlatRun('Hello', 10, 100, 30),
      makeFlatRun('World', 10, 120, 30),
    ];
    const words = groupRunsIntoWords(runs);
    expect(words).toHaveLength(2);
  });

  it('does not merge runs with large x gap', () => {
    const runs: FlatTextRun[] = [
      makeFlatRun('Hello', 10, 100, 30),
      makeFlatRun('World', 60, 100, 30),
    ];
    const words = groupRunsIntoWords(runs);
    expect(words).toHaveLength(2);
  });

  it('does not merge runs with different fonts', () => {
    const runs: FlatTextRun[] = [
      makeFlatRun('Hello', 10, 100, 30, 12, 12, 'Helvetica'),
      makeFlatRun('World', 40, 100, 30, 12, 12, 'Times'),
    ];
    const words = groupRunsIntoWords(runs);
    expect(words).toHaveLength(2);
  });
});

// ─── matchTextElements ──────────────────────────────────────────────

describe('matchTextElements', () => {
  it('matches identical elements perfectly', () => {
    const ours = [makeFlatRun('Hello', 10, 10, 30)];
    const ground = [makeGroundWord('Hello', 10, 10, 30)];

    const { matches, unmatchedGround, unmatchedOurs } = matchTextElements(ours, ground);

    expect(matches).toHaveLength(1);
    expect(unmatchedGround).toHaveLength(0);
    expect(unmatchedOurs).toHaveLength(0);
    expect(matches[0].positionDelta).toBe(0);
    expect(matches[0].textSimilarity).toBe(0);
  });

  it('matches nearby elements with position delta', () => {
    const ours = [makeFlatRun('Hello', 12, 10, 30)];
    const ground = [makeGroundWord('Hello', 10, 10, 30)];

    const { matches } = matchTextElements(ours, ground);
    expect(matches).toHaveLength(1);
    // Centers differ by 2 in x (12+15 vs 10+15), 0 in y
    expect(matches[0].positionDelta).toBeCloseTo(2, 1);
  });

  it('computes text similarity for different text', () => {
    const ours = [makeFlatRun('Helo', 10, 10, 30)];
    const ground = [makeGroundWord('Hello', 10, 10, 30)];

    const { matches } = matchTextElements(ours, ground);
    expect(matches).toHaveLength(1);
    expect(matches[0].textSimilarity).toBeGreaterThan(0);
    expect(matches[0].textSimilarity).toBeLessThan(1);
  });

  it('does not match elements beyond threshold', () => {
    const ours = [makeFlatRun('Hello', 10, 10, 30)];
    const ground = [makeGroundWord('Hello', 200, 200, 30)];

    const { matches, unmatchedGround, unmatchedOurs } = matchTextElements(ours, ground);
    expect(matches).toHaveLength(0);
    expect(unmatchedGround).toHaveLength(1);
    expect(unmatchedOurs).toHaveLength(1);
  });

  it('handles empty inputs', () => {
    expect(matchTextElements([], []).matches).toHaveLength(0);
    expect(matchTextElements([makeFlatRun('A', 0, 0, 10)], []).unmatchedOurs).toHaveLength(1);
    expect(matchTextElements([], [makeGroundWord('A', 0, 0, 10)]).unmatchedGround).toHaveLength(1);
  });

  it('matches multiple elements greedily', () => {
    const ours = [
      makeFlatRun('First', 10, 10, 30),
      makeFlatRun('Second', 10, 30, 40),
      makeFlatRun('Third', 10, 50, 30),
    ];
    const ground = [
      makeGroundWord('First', 10, 10, 30),
      makeGroundWord('Second', 10, 30, 40),
    ];

    const { matches, unmatchedGround, unmatchedOurs } = matchTextElements(ours, ground);
    expect(matches).toHaveLength(2);
    expect(unmatchedGround).toHaveLength(0);
    expect(unmatchedOurs).toHaveLength(1);
    expect(unmatchedOurs[0].text).toBe('Third');
  });

  it('does not double-match a single run', () => {
    const ours = [makeFlatRun('Hello', 10, 10, 30)];
    const ground = [
      makeGroundWord('Hello', 10, 10, 30),
      makeGroundWord('Hello', 11, 10, 30),
    ];

    const { matches, unmatchedGround } = matchTextElements(ours, ground);
    expect(matches).toHaveLength(1);
    expect(unmatchedGround).toHaveLength(1);
  });

  it('respects custom distance threshold', () => {
    const ours = [makeFlatRun('A', 10, 10, 10)];
    const ground = [makeGroundWord('A', 30, 10, 10)];

    // Default threshold 50 — should match
    expect(matchTextElements(ours, ground).matches).toHaveLength(1);

    // Tight threshold 5 — should not match (centers differ by 20)
    expect(matchTextElements(ours, ground, 5).matches).toHaveLength(0);
  });

  it('computes font size delta', () => {
    const ours = [makeFlatRun('Hello', 10, 10, 30, 12, 14)];
    const ground = [makeGroundWord('Hello', 10, 10, 30, 12, 10)];

    const { matches } = matchTextElements(ours, ground);
    expect(matches[0].fontSizeDelta).toBe(4);
  });

  it('treats missing ground fontSize as no delta', () => {
    const ours = [makeFlatRun('Hello', 10, 10, 30, 12, 14)];
    const ground = [makeGroundWord('Hello', 10, 10, 30)]; // no fontSize

    const { matches } = matchTextElements(ours, ground);
    expect(matches[0].fontSizeDelta).toBe(0);
  });
});

// ─── scorePageElements ──────────────────────────────────────────────

describe('scorePageElements', () => {
  it('returns zeros for empty matches', () => {
    const score = scorePageElements([], [], []);
    expect(score.matchedCount).toBe(0);
    expect(score.totalGroundWords).toBe(0);
    expect(score.totalOurRuns).toBe(0);
    expect(score.textAccuracy).toBe(0);
    expect(score.positionAccuracy).toBe(0);
  });

  it('handles all unmatched', () => {
    const ground = [makeGroundWord('A', 0, 0, 10), makeGroundWord('B', 0, 10, 10)];
    const ours = [makeFlatRun('X', 100, 100, 10)];
    const score = scorePageElements([], ours, ground);

    expect(score.totalGroundWords).toBe(2);
    expect(score.totalOurRuns).toBe(1);
    expect(score.matchedCount).toBe(0);
    expect(score.unmatchedGroundCount).toBe(2);
    expect(score.unmatchedOursCount).toBe(1);
    expect(score.textAccuracy).toBe(0);
  });

  it('computes perfect score for exact matches', () => {
    const matches: TextMatch[] = [
      {
        ours: makeFlatRun('Hello', 10, 10, 30),
        ground: makeGroundWord('Hello', 10, 10, 30),
        positionDelta: 0,
        textSimilarity: 0,
        fontSizeDelta: 0,
        widthDelta: 0,
      },
      {
        ours: makeFlatRun('World', 10, 30, 30),
        ground: makeGroundWord('World', 10, 30, 30),
        positionDelta: 1,
        textSimilarity: 0,
        fontSizeDelta: 0,
        widthDelta: 0,
      },
    ];

    const score = scorePageElements(matches, [], []);

    expect(score.totalGroundWords).toBe(2);
    expect(score.totalOurRuns).toBe(2);
    expect(score.matchedCount).toBe(2);
    expect(score.avgPositionDelta).toBe(0.5);
    expect(score.avgTextSimilarity).toBe(0);
    expect(score.textAccuracy).toBe(1); // both have similarity < 0.1
    expect(score.positionAccuracy).toBe(1); // both have delta < 5
  });

  it('computes partial scores correctly', () => {
    const matches: TextMatch[] = [
      {
        ours: makeFlatRun('Hello', 10, 10, 30),
        ground: makeGroundWord('Hello', 10, 10, 30),
        positionDelta: 2,
        textSimilarity: 0,
        fontSizeDelta: 0,
        widthDelta: 0,
      },
      {
        ours: makeFlatRun('Wrld', 10, 30, 30),
        ground: makeGroundWord('World', 10, 30, 30),
        positionDelta: 10, // > 5pt threshold
        textSimilarity: 0.4, // > 0.1 threshold
        fontSizeDelta: 2,
        widthDelta: 5,
      },
    ];
    const unmatchedGround = [makeGroundWord('Missed', 0, 50, 30)];

    const score = scorePageElements(matches, [], unmatchedGround);

    expect(score.totalGroundWords).toBe(3); // 2 matched + 1 unmatched
    expect(score.matchedCount).toBe(2);
    expect(score.unmatchedGroundCount).toBe(1);
    expect(score.avgPositionDelta).toBe(6); // (2 + 10) / 2
    expect(score.avgTextSimilarity).toBe(0.2); // (0 + 0.4) / 2
    // textAccuracy: 1 correct text out of 3 total ground words
    expect(score.textAccuracy).toBeCloseTo(1 / 3, 5);
    // positionAccuracy: 1 good position out of 3 total ground words
    expect(score.positionAccuracy).toBeCloseTo(1 / 3, 5);
  });
});

// ─── generateElementDiffReport ──────────────────────────────────────

describe('generateElementDiffReport', () => {
  it('generates valid HTML string', () => {
    const pages: PageDiffResult[] = [
      {
        pageNum: 1,
        score: {
          totalGroundWords: 10,
          totalOurRuns: 8,
          matchedCount: 7,
          unmatchedGroundCount: 3,
          unmatchedOursCount: 1,
          avgPositionDelta: 2.5,
          avgTextSimilarity: 0.05,
          avgFontSizeDelta: 0.5,
          textAccuracy: 0.7,
          positionAccuracy: 0.8,
        },
        matches: [
          {
            ours: makeFlatRun('Hello', 10, 10, 30),
            ground: makeGroundWord('Hello', 10, 10, 30),
            positionDelta: 1.2,
            textSimilarity: 0,
            fontSizeDelta: 0,
            widthDelta: 0,
          },
        ],
        unmatchedGround: [makeGroundWord('Missing', 50, 50, 40)],
        unmatchedOurs: [makeFlatRun('Extra', 200, 200, 30)],
      },
    ];

    const html = generateElementDiffReport(pages);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Element-Level Diff Report');
    expect(html).toContain('Page 1');
    expect(html).toContain('Hello');
    expect(html).toContain('Missing');
    expect(html).toContain('Extra');
    expect(html).toContain('70.0%'); // text accuracy
    expect(html).toContain('toggleDetail');
  });

  it('handles empty pages array', () => {
    const html = generateElementDiffReport([]);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('0'); // 0 pages
  });

  it('escapes HTML in text content', () => {
    const pages: PageDiffResult[] = [
      {
        pageNum: 1,
        score: {
          totalGroundWords: 1,
          totalOurRuns: 1,
          matchedCount: 1,
          unmatchedGroundCount: 0,
          unmatchedOursCount: 0,
          avgPositionDelta: 0,
          avgTextSimilarity: 0,
          avgFontSizeDelta: 0,
          textAccuracy: 1,
          positionAccuracy: 1,
        },
        matches: [
          {
            ours: makeFlatRun('<script>alert("xss")</script>', 10, 10, 30),
            ground: makeGroundWord('<script>alert("xss")</script>', 10, 10, 30),
            positionDelta: 0,
            textSimilarity: 0,
            fontSizeDelta: 0,
            widthDelta: 0,
          },
        ],
        unmatchedGround: [],
        unmatchedOurs: [],
      },
    ];

    const html = generateElementDiffReport(pages);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('applies correct CSS class based on score', () => {
    const goodPage: PageDiffResult = {
      pageNum: 1,
      score: {
        totalGroundWords: 10,
        totalOurRuns: 10,
        matchedCount: 10,
        unmatchedGroundCount: 0,
        unmatchedOursCount: 0,
        avgPositionDelta: 1,
        avgTextSimilarity: 0.01,
        avgFontSizeDelta: 0,
        textAccuracy: 0.95,
        positionAccuracy: 0.9,
      },
      matches: [],
      unmatchedGround: [],
      unmatchedOurs: [],
    };
    const badPage: PageDiffResult = {
      pageNum: 2,
      score: {
        totalGroundWords: 10,
        totalOurRuns: 2,
        matchedCount: 1,
        unmatchedGroundCount: 9,
        unmatchedOursCount: 1,
        avgPositionDelta: 20,
        avgTextSimilarity: 0.5,
        avgFontSizeDelta: 5,
        textAccuracy: 0.1,
        positionAccuracy: 0.1,
      },
      matches: [],
      unmatchedGround: [],
      unmatchedOurs: [],
    };

    const html = generateElementDiffReport([goodPage, badPage]);
    expect(html).toContain('class="good"');
    expect(html).toContain('class="bad"');
  });
});
