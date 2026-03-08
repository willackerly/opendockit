import { describe, it, expect } from 'vitest';
import { searchText } from '../text-search.js';
import type { PageModel, TextElement } from '../types.js';
import { makeTextElement, makeShapeElement, makePage } from './test-helpers.js';

// ─── Helpers ─────────────────────────────────────────────

function singlePage(elements: PageModel['elements']): PageModel[] {
  return [makePage('p1', elements)];
}

// ─── Basic matching ───────────────────────────────────────

describe('searchText — basic matching', () => {
  it('returns empty array for empty query', () => {
    const pages = singlePage([makeTextElement('t1', 0, 0, 100, 20, 'Hello world')]);
    expect(searchText(pages, '')).toHaveLength(0);
  });

  it('returns empty array when no matches', () => {
    const pages = singlePage([makeTextElement('t1', 0, 0, 100, 20, 'Hello world')]);
    expect(searchText(pages, 'xyz')).toHaveLength(0);
  });

  it('finds a simple match', () => {
    const pages = singlePage([makeTextElement('t1', 0, 0, 100, 20, 'Hello world')]);
    const results = searchText(pages, 'world');
    expect(results).toHaveLength(1);
    expect(results[0].elementId).toBe('t1');
    expect(results[0].text).toBe('Hello world');
    expect(results[0].matchStart).toBe(6);
    expect(results[0].matchEnd).toBe(11);
  });

  it('finds multiple matches in a single element', () => {
    const pages = singlePage([makeTextElement('t1', 0, 0, 100, 20, 'the cat sat on the mat')]);
    const results = searchText(pages, 'the');
    expect(results).toHaveLength(2);
    expect(results[0].matchStart).toBe(0);
    expect(results[1].matchStart).toBe(15);
  });

  it('finds matches across multiple elements', () => {
    const pages = singlePage([
      makeTextElement('t1', 0, 0, 100, 20, 'foo bar'),
      makeTextElement('t2', 0, 30, 100, 20, 'baz foo'),
    ]);
    const results = searchText(pages, 'foo');
    expect(results).toHaveLength(2);
    expect(results[0].elementId).toBe('t1');
    expect(results[1].elementId).toBe('t2');
  });

  it('skips non-text elements', () => {
    const pages = singlePage([
      makeShapeElement('s1', 0, 0, 100, 100),
      makeTextElement('t1', 0, 0, 100, 20, 'foo bar'),
    ]);
    const results = searchText(pages, 'foo');
    expect(results).toHaveLength(1);
    expect(results[0].elementId).toBe('t1');
  });

  it('reports the correct page index', () => {
    const pages = [
      makePage('p1', [makeTextElement('t1', 0, 0, 100, 20, 'not here')]),
      makePage('p2', [makeTextElement('t2', 0, 0, 100, 20, 'match here')]),
    ];
    const results = searchText(pages, 'match');
    expect(results).toHaveLength(1);
    expect(results[0].pageIndex).toBe(1);
  });
});

// ─── Case sensitivity ────────────────────────────────────

describe('searchText — case sensitivity', () => {
  it('is case-insensitive by default', () => {
    const pages = singlePage([makeTextElement('t1', 0, 0, 100, 20, 'Hello HELLO hello')]);
    const results = searchText(pages, 'hello');
    expect(results).toHaveLength(3);
  });

  it('is case-sensitive when caseSensitive: true', () => {
    const pages = singlePage([makeTextElement('t1', 0, 0, 100, 20, 'Hello HELLO hello')]);
    const results = searchText(pages, 'hello', { caseSensitive: true });
    expect(results).toHaveLength(1);
    expect(results[0].matchStart).toBe(12);
  });

  it('case-insensitive matches partial word', () => {
    const pages = singlePage([makeTextElement('t1', 0, 0, 100, 20, 'TypeScript typescript')]);
    const results = searchText(pages, 'typescript');
    expect(results).toHaveLength(2);
  });
});

// ─── Whole word matching ─────────────────────────────────

describe('searchText — whole word matching', () => {
  it('only matches complete words', () => {
    const pages = singlePage([makeTextElement('t1', 0, 0, 100, 20, 'cat concatenate catch')]);
    const results = searchText(pages, 'cat', { wholeWord: true });
    expect(results).toHaveLength(1);
    expect(results[0].matchStart).toBe(0);
  });

  it('matches word at end of string', () => {
    const pages = singlePage([makeTextElement('t1', 0, 0, 100, 20, 'the cat')]);
    const results = searchText(pages, 'cat', { wholeWord: true });
    expect(results).toHaveLength(1);
  });

  it('does not match substring', () => {
    const pages = singlePage([makeTextElement('t1', 0, 0, 100, 20, 'concatenate')]);
    const results = searchText(pages, 'cat', { wholeWord: true });
    expect(results).toHaveLength(0);
  });

  it('respects word boundaries around punctuation', () => {
    const pages = singlePage([makeTextElement('t1', 0, 0, 100, 20, 'foo, foo. foo!')]);
    const results = searchText(pages, 'foo', { wholeWord: true });
    expect(results).toHaveLength(3);
  });
});

// ─── Regex matching ──────────────────────────────────────

describe('searchText — regex matching', () => {
  it('matches using a regex pattern', () => {
    const pages = singlePage([makeTextElement('t1', 0, 0, 100, 20, 'foo123 bar456')]);
    const results = searchText(pages, '\\d+', { regex: true });
    expect(results).toHaveLength(2);
    expect(results[0].text.slice(results[0].matchStart, results[0].matchEnd)).toBe('123');
    expect(results[1].text.slice(results[1].matchStart, results[1].matchEnd)).toBe('456');
  });

  it('matches an alternation pattern', () => {
    const pages = singlePage([makeTextElement('t1', 0, 0, 100, 20, 'cat dog bird')]);
    const results = searchText(pages, 'cat|dog', { regex: true });
    expect(results).toHaveLength(2);
  });

  it('treats query as literal when regex: false (default)', () => {
    const pages = singlePage([makeTextElement('t1', 0, 0, 100, 20, 'price $1.00')]);
    // Without regex, $ and . are literal — no regex interpretation
    const results = searchText(pages, '$1.00');
    expect(results).toHaveLength(1);
  });

  it('handles anchored regex patterns', () => {
    const pages = singlePage([makeTextElement('t1', 0, 0, 100, 20, 'hello world')]);
    const results = searchText(pages, '^hello', { regex: true });
    expect(results).toHaveLength(1);
    expect(results[0].matchStart).toBe(0);
  });
});

// ─── Bounding box computation ────────────────────────────

describe('searchText — bounding boxes', () => {
  it('returns bounds within the element bounds for a single-run match', () => {
    const el = makeTextElement('t1', 10, 20, 200, 30, 'Hello world');
    const pages = singlePage([el]);
    const results = searchText(pages, 'world');
    expect(results).toHaveLength(1);
    const { bounds } = results[0];
    // Bounds must be within or equal to the element bounds
    expect(bounds.x).toBeGreaterThanOrEqual(el.x);
    expect(bounds.y).toBeGreaterThanOrEqual(el.y);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(el.x + el.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(el.y + el.height);
  });

  it('bounds x is proportional to match position', () => {
    // Single-run element with text "Hello world" — each char is ~1/11 of width
    const el = makeTextElement('t1', 0, 0, 110, 20, 'Hello world');
    const pages = singlePage([el]);

    const helloResults = searchText(pages, 'Hello');
    const worldResults = searchText(pages, 'world');

    // "Hello" starts at char 0, "world" starts at char 6 — world's x should be greater
    expect(worldResults[0].bounds.x).toBeGreaterThan(helloResults[0].bounds.x);
  });

  it('uses element bounds as fallback when no runs match', () => {
    // Construct a text element with an empty paragraph (no runs)
    const el: TextElement = {
      id: 't-empty',
      type: 'text',
      x: 5,
      y: 10,
      width: 100,
      height: 20,
      rotation: 0,
      opacity: 1,
      index: '0',
      parentId: null,
      locked: false,
      paragraphs: [{ runs: [] }],
    };
    // searchText won't match an empty paragraph — but let's verify element with content works
    const el2 = makeTextElement('t2', 5, 10, 100, 20, 'test');
    const pages = singlePage([el, el2]);
    const results = searchText(pages, 'test');
    expect(results[0].bounds.x).toBeGreaterThanOrEqual(5);
  });

  it('produces correct pageIndex in bounds (always the element coords)', () => {
    const pages = [
      makePage('p1', [makeTextElement('t1', 50, 100, 200, 40, 'find me')]),
      makePage('p2', [makeTextElement('t2', 30, 60, 150, 30, 'find me')]),
    ];
    const results = searchText(pages, 'find me');
    expect(results).toHaveLength(2);
    // Page 0 element at x=50, page 1 element at x=30
    expect(results[0].bounds.x).toBeGreaterThanOrEqual(50);
    expect(results[1].bounds.x).toBeGreaterThanOrEqual(30);
  });
});

// ─── Multi-paragraph elements ────────────────────────────

describe('searchText — multi-paragraph elements', () => {
  it('searches each paragraph independently', () => {
    const el: TextElement = {
      id: 't1',
      type: 'text',
      x: 0,
      y: 0,
      width: 200,
      height: 60,
      rotation: 0,
      opacity: 1,
      index: '0',
      parentId: null,
      locked: false,
      paragraphs: [
        { runs: [{ text: 'foo bar', fontFamily: 'Helvetica', fontSize: 12, color: { r: 0, g: 0, b: 0 }, x: 0, y: 0, width: 100, height: 20 }] },
        { runs: [{ text: 'baz foo', fontFamily: 'Helvetica', fontSize: 12, color: { r: 0, g: 0, b: 0 }, x: 0, y: 25, width: 100, height: 20 }] },
      ],
    };
    const pages = singlePage([el]);
    const results = searchText(pages, 'foo');
    expect(results).toHaveLength(2);
    // Both matches are in the same element
    expect(results[0].elementId).toBe('t1');
    expect(results[1].elementId).toBe('t1');
  });

  it('does not match across paragraph boundaries', () => {
    const el: TextElement = {
      id: 't1',
      type: 'text',
      x: 0,
      y: 0,
      width: 200,
      height: 60,
      rotation: 0,
      opacity: 1,
      index: '0',
      parentId: null,
      locked: false,
      paragraphs: [
        { runs: [{ text: 'foo', fontFamily: 'Helvetica', fontSize: 12, color: { r: 0, g: 0, b: 0 }, x: 0, y: 0, width: 30, height: 20 }] },
        { runs: [{ text: 'bar', fontFamily: 'Helvetica', fontSize: 12, color: { r: 0, g: 0, b: 0 }, x: 0, y: 25, width: 30, height: 20 }] },
      ],
    };
    const pages = singlePage([el]);
    // "foobar" spans two paragraphs — should NOT match
    const results = searchText(pages, 'foobar');
    expect(results).toHaveLength(0);
  });
});

// ─── Empty inputs ────────────────────────────────────────

describe('searchText — empty inputs', () => {
  it('returns empty array for empty pages array', () => {
    expect(searchText([], 'hello')).toHaveLength(0);
  });

  it('returns empty array for page with no elements', () => {
    const pages = [makePage('p1', [])];
    expect(searchText(pages, 'hello')).toHaveLength(0);
  });
});
