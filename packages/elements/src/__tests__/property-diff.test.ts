/**
 * Tests for the property-diff module — verifies per-element property diffs,
 * severity thresholds, and aggregate diff report generation.
 */

import { describe, it, expect } from 'vitest';
import { diffElements, generateDiffReport } from '../debug/property-diff.js';
import type {
  MatchedPair,
  PropertyDelta,
  ElementDiff,
  DiffReport,
} from '../debug/property-diff.js';
import type {
  TextElement,
  ShapeElement,
  PageElement,
  Paragraph,
  TextRun,
  Color,
} from '../types.js';
import { baseProps } from './test-helpers.js';

// ─── Helpers ──────────────────────────────────────────────

function makeRun(overrides: Partial<TextRun> = {}): TextRun {
  return {
    text: 'Hello',
    fontFamily: 'Helvetica',
    fontSize: 12,
    color: { r: 0, g: 0, b: 0 },
    x: 0,
    y: 0,
    width: 50,
    height: 14,
    ...overrides,
  };
}

function makeParagraph(overrides: Partial<Paragraph> = {}): Paragraph {
  return {
    runs: [makeRun()],
    ...overrides,
  };
}

function makeText(
  id: string,
  overrides: Partial<Omit<TextElement, 'id' | 'type'>> = {},
): TextElement {
  return {
    ...baseProps,
    id,
    type: 'text',
    x: 100,
    y: 200,
    width: 300,
    height: 50,
    paragraphs: [makeParagraph()],
    ...overrides,
  };
}

function makeShape(
  id: string,
  overrides: Partial<Omit<ShapeElement, 'id' | 'type'>> = {},
): ShapeElement {
  return {
    ...baseProps,
    id,
    type: 'shape',
    x: 100,
    y: 200,
    width: 300,
    height: 50,
    shapeType: 'rectangle',
    fill: null,
    stroke: null,
    ...overrides,
  };
}

function makePair(
  a: PageElement,
  b: PageElement,
  overrides: Partial<Omit<MatchedPair, 'a' | 'b'>> = {},
): MatchedPair {
  return {
    a,
    b,
    confidence: 1.0,
    matchMethod: 'text-exact',
    ...overrides,
  };
}

/** Find a delta by property name in an ElementDiff. */
function findDelta(diff: ElementDiff, prop: string): PropertyDelta | undefined {
  return diff.deltas.find((d) => d.property === prop);
}

/** Find all deltas whose property matches a substring. */
function findDeltas(diff: ElementDiff, substr: string): PropertyDelta[] {
  return diff.deltas.filter((d) => d.property.includes(substr));
}

// ─── diffElements ─────────────────────────────────────────

describe('diffElements', () => {
  describe('identical elements', () => {
    it('returns all-match severity for identical text elements', () => {
      const a = makeText('a1');
      const b = makeText('b1');
      const diff = diffElements(makePair(a, b));

      expect(diff.overallSeverity).toBe('match');
      for (const d of diff.deltas) {
        expect(d.severity).toBe('match');
      }
    });

    it('returns all-match severity for identical shape elements', () => {
      const a = makeShape('a1');
      const b = makeShape('b1');
      const diff = diffElements(makePair(a, b));

      expect(diff.overallSeverity).toBe('match');
      // Shape diffs only include position/size (x, y, width, height)
      expect(diff.deltas).toHaveLength(4);
      for (const d of diff.deltas) {
        expect(d.severity).toBe('match');
        expect(d.delta).toBe(0);
      }
    });

    it('preserves the original pair reference', () => {
      const pair = makePair(makeText('a1'), makeText('b1'));
      const diff = diffElements(pair);
      expect(diff.pair).toBe(pair);
    });
  });

  describe('position diffs', () => {
    it('classifies <1pt position diff as match', () => {
      const a = makeText('a1', { x: 100 });
      const b = makeText('b1', { x: 100.5 });
      const diff = diffElements(makePair(a, b));

      const xDelta = findDelta(diff, 'x')!;
      expect(xDelta.severity).toBe('match');
      expect(xDelta.delta).toBeCloseTo(0.5);
    });

    it('classifies 1-3pt position diff as minor', () => {
      const a = makeText('a1', { y: 100 });
      const b = makeText('b1', { y: 102 });
      const diff = diffElements(makePair(a, b));

      const yDelta = findDelta(diff, 'y')!;
      expect(yDelta.severity).toBe('minor');
      expect(yDelta.delta).toBe(2);
    });

    it('classifies exactly 3pt as minor (boundary)', () => {
      const a = makeText('a1', { x: 100 });
      const b = makeText('b1', { x: 103 });
      const diff = diffElements(makePair(a, b));

      expect(findDelta(diff, 'x')!.severity).toBe('minor');
    });

    it('classifies 3-8pt position diff as major', () => {
      const a = makeText('a1', { x: 100 });
      const b = makeText('b1', { x: 105 });
      const diff = diffElements(makePair(a, b));

      const xDelta = findDelta(diff, 'x')!;
      expect(xDelta.severity).toBe('major');
      expect(xDelta.delta).toBe(5);
    });

    it('classifies exactly 8pt as major (boundary)', () => {
      const a = makeText('a1', { x: 100 });
      const b = makeText('b1', { x: 108 });
      const diff = diffElements(makePair(a, b));

      expect(findDelta(diff, 'x')!.severity).toBe('major');
    });

    it('classifies >8pt position diff as critical', () => {
      const a = makeText('a1', { x: 100 });
      const b = makeText('b1', { x: 110 });
      const diff = diffElements(makePair(a, b));

      const xDelta = findDelta(diff, 'x')!;
      expect(xDelta.severity).toBe('critical');
      expect(xDelta.delta).toBe(10);
    });

    it('compares all four position/size properties', () => {
      const a = makeText('a1', { x: 10, y: 20, width: 100, height: 50 });
      const b = makeText('b1', { x: 10, y: 20, width: 100, height: 50 });
      const diff = diffElements(makePair(a, b));

      expect(findDelta(diff, 'x')).toBeDefined();
      expect(findDelta(diff, 'y')).toBeDefined();
      expect(findDelta(diff, 'width')).toBeDefined();
      expect(findDelta(diff, 'height')).toBeDefined();
    });
  });

  describe('size diffs', () => {
    it('classifies <1pt width diff as match', () => {
      const a = makeText('a1', { width: 300 });
      const b = makeText('b1', { width: 300.9 });
      const diff = diffElements(makePair(a, b));

      expect(findDelta(diff, 'width')!.severity).toBe('match');
    });

    it('classifies 1-3pt height diff as minor', () => {
      const a = makeText('a1', { height: 50 });
      const b = makeText('b1', { height: 52 });
      const diff = diffElements(makePair(a, b));

      expect(findDelta(diff, 'height')!.severity).toBe('minor');
    });

    it('classifies >8pt size diff as critical', () => {
      const a = makeText('a1', { width: 300 });
      const b = makeText('b1', { width: 320 });
      const diff = diffElements(makePair(a, b));

      expect(findDelta(diff, 'width')!.severity).toBe('critical');
      expect(findDelta(diff, 'width')!.delta).toBe(20);
    });
  });

  describe('text-specific: font family', () => {
    it('reports match for identical font families', () => {
      const a = makeText('a1');
      const b = makeText('b1');
      const diff = diffElements(makePair(a, b));

      // No fontFamily delta should appear (only appears on mismatch)
      const fontDeltas = findDeltas(diff, 'fontFamily');
      expect(fontDeltas).toHaveLength(0);
    });

    it('reports major severity for different font families', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ fontFamily: 'Arial' })] })],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ fontFamily: 'Times' })] })],
      });
      const diff = diffElements(makePair(a, b));

      const fontDelta = findDeltas(diff, 'fontFamily')[0]!;
      expect(fontDelta.severity).toBe('major');
      expect(fontDelta.valueA).toBe('Arial');
      expect(fontDelta.valueB).toBe('Times');
    });

    it('normalizes font family comparison (case-insensitive)', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ fontFamily: 'Arial' })] })],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ fontFamily: 'arial' })] })],
      });
      const diff = diffElements(makePair(a, b));

      const fontDeltas = findDeltas(diff, 'fontFamily');
      expect(fontDeltas).toHaveLength(0);
    });
  });

  describe('text-specific: font size', () => {
    it('classifies <0.5pt font size diff as match', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ fontSize: 12 })] })],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ fontSize: 12.3 })] })],
      });
      const diff = diffElements(makePair(a, b));

      const fsDelta = findDeltas(diff, 'fontSize')[0]!;
      expect(fsDelta.severity).toBe('match');
      expect(fsDelta.delta).toBeCloseTo(0.3);
    });

    it('classifies 0.5-1pt font size diff as minor', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ fontSize: 12 })] })],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ fontSize: 12.7 })] })],
      });
      const diff = diffElements(makePair(a, b));

      expect(findDeltas(diff, 'fontSize')[0]!.severity).toBe('minor');
    });

    it('classifies exactly 1pt font size diff as minor (boundary)', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ fontSize: 12 })] })],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ fontSize: 13 })] })],
      });
      const diff = diffElements(makePair(a, b));

      expect(findDeltas(diff, 'fontSize')[0]!.severity).toBe('minor');
    });

    it('classifies >1pt font size diff as major', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ fontSize: 12 })] })],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ fontSize: 14 })] })],
      });
      const diff = diffElements(makePair(a, b));

      const fsDelta = findDeltas(diff, 'fontSize')[0]!;
      expect(fsDelta.severity).toBe('major');
      expect(fsDelta.delta).toBe(2);
    });
  });

  describe('text-specific: bold/italic', () => {
    it('reports no delta when both bold', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ bold: true })] })],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ bold: true })] })],
      });
      const diff = diffElements(makePair(a, b));

      expect(findDeltas(diff, 'bold')).toHaveLength(0);
    });

    it('reports major severity for bold mismatch', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ bold: true })] })],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ bold: false })] })],
      });
      const diff = diffElements(makePair(a, b));

      const boldDelta = findDeltas(diff, 'bold')[0]!;
      expect(boldDelta.severity).toBe('major');
      expect(boldDelta.valueA).toBe(true);
      expect(boldDelta.valueB).toBe(false);
    });

    it('treats undefined bold same as false', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ runs: [makeRun()] })], // bold undefined
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ bold: false })] })],
      });
      const diff = diffElements(makePair(a, b));

      // Both falsy, so no bold delta
      expect(findDeltas(diff, 'bold')).toHaveLength(0);
    });

    it('reports major severity for italic mismatch', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ italic: true })] })],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ italic: false })] })],
      });
      const diff = diffElements(makePair(a, b));

      const italicDelta = findDeltas(diff, 'italic')[0]!;
      expect(italicDelta.severity).toBe('major');
    });
  });

  describe('text-specific: color', () => {
    it('classifies identical colors as match', () => {
      const color: Color = { r: 128, g: 64, b: 200 };
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ color })] })],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ color: { ...color } })] })],
      });
      const diff = diffElements(makePair(a, b));

      const colorDelta = findDeltas(diff, 'color')[0]!;
      expect(colorDelta.severity).toBe('match');
      expect(colorDelta.delta).toBe(0);
    });

    it('classifies Euclidean RGB distance <10 as match', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ color: { r: 100, g: 100, b: 100 } })] })],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ color: { r: 105, g: 103, b: 100 } })] })],
      });
      const diff = diffElements(makePair(a, b));

      const colorDelta = findDeltas(diff, 'color')[0]!;
      // sqrt(25 + 9 + 0) = sqrt(34) ~= 5.83
      expect(colorDelta.severity).toBe('match');
      expect(colorDelta.delta).toBeLessThan(10);
    });

    it('classifies Euclidean RGB distance 10-30 as minor', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ color: { r: 100, g: 100, b: 100 } })] })],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ color: { r: 115, g: 110, b: 100 } })] })],
      });
      const diff = diffElements(makePair(a, b));

      const colorDelta = findDeltas(diff, 'color')[0]!;
      // sqrt(225 + 100 + 0) = sqrt(325) ~= 18.03
      expect(colorDelta.severity).toBe('minor');
    });

    it('classifies Euclidean RGB distance >30 as major', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ color: { r: 0, g: 0, b: 0 } })] })],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ color: { r: 255, g: 0, b: 0 } })] })],
      });
      const diff = diffElements(makePair(a, b));

      const colorDelta = findDeltas(diff, 'color')[0]!;
      expect(colorDelta.severity).toBe('major');
      expect(colorDelta.delta).toBe(255);
    });

    it('classifies exactly distance 10 as minor (boundary)', () => {
      // r diff of 10 only => distance = 10
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ color: { r: 0, g: 0, b: 0 } })] })],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ color: { r: 10, g: 0, b: 0 } })] })],
      });
      const diff = diffElements(makePair(a, b));

      expect(findDeltas(diff, 'color')[0]!.severity).toBe('minor');
    });

    it('classifies exactly distance 30 as minor (boundary)', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ color: { r: 0, g: 0, b: 0 } })] })],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ color: { r: 30, g: 0, b: 0 } })] })],
      });
      const diff = diffElements(makePair(a, b));

      expect(findDeltas(diff, 'color')[0]!.severity).toBe('minor');
    });
  });

  describe('text-specific: paragraph/run count mismatches', () => {
    it('reports critical for different paragraph counts', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph(), makeParagraph()],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph()],
      });
      const diff = diffElements(makePair(a, b));

      // The missing paragraph should produce a critical delta
      const paraDelta = diff.deltas.find(
        (d) => d.property === 'paragraphs[1]' && d.severity === 'critical',
      );
      expect(paraDelta).toBeDefined();
      expect(paraDelta!.valueA).toBeDefined();
      expect(paraDelta!.valueB).toBeUndefined();
    });

    it('reports critical for different run counts within a paragraph', () => {
      const a = makeText('a1', {
        paragraphs: [
          makeParagraph({
            runs: [makeRun({ text: 'First' }), makeRun({ text: 'Second' })],
          }),
        ],
      });
      const b = makeText('b1', {
        paragraphs: [
          makeParagraph({
            runs: [makeRun({ text: 'First' })],
          }),
        ],
      });
      const diff = diffElements(makePair(a, b));

      const runDelta = diff.deltas.find(
        (d) => d.property === 'paragraphs[0].runs[1]' && d.severity === 'critical',
      );
      expect(runDelta).toBeDefined();
      expect(runDelta!.valueA).toBe('Second');
      expect(runDelta!.valueB).toBeUndefined();
    });

    it('reports critical when B has extra paragraphs', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph()],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph(), makeParagraph()],
      });
      const diff = diffElements(makePair(a, b));

      const paraDelta = diff.deltas.find(
        (d) => d.property === 'paragraphs[1]' && d.severity === 'critical',
      );
      expect(paraDelta).toBeDefined();
      expect(paraDelta!.valueA).toBeUndefined();
      expect(paraDelta!.valueB).toBeDefined();
    });
  });

  describe('text content diff', () => {
    it('reports major severity for different text content in a run', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ text: 'Hello' })] })],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ text: 'World' })] })],
      });
      const diff = diffElements(makePair(a, b));

      const textDelta = findDeltas(diff, '.text')[0]!;
      expect(textDelta.severity).toBe('major');
      expect(textDelta.valueA).toBe('Hello');
      expect(textDelta.valueB).toBe('World');
    });
  });

  describe('paragraph alignment diff', () => {
    it('reports minor severity for alignment mismatch', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ align: 'left' })],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ align: 'center' })],
      });
      const diff = diffElements(makePair(a, b));

      const alignDelta = findDeltas(diff, 'align')[0]!;
      expect(alignDelta.severity).toBe('minor');
      expect(alignDelta.valueA).toBe('left');
      expect(alignDelta.valueB).toBe('center');
    });
  });

  describe('run width diff (position severity)', () => {
    it('classifies run width diff using position thresholds', () => {
      const a = makeText('a1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ width: 50 })] })],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph({ runs: [makeRun({ width: 55 })] })],
      });
      const diff = diffElements(makePair(a, b));

      // 5pt diff => major (3-8pt range)
      const wDelta = diff.deltas.find(
        (d) => d.property === 'paragraphs[0].runs[0].width',
      )!;
      expect(wDelta.severity).toBe('major');
      expect(wDelta.delta).toBe(5);
    });
  });

  describe('overall severity', () => {
    it('equals worst severity across all deltas', () => {
      const a = makeText('a1', { x: 100, y: 200 });
      const b = makeText('b1', { x: 100.5, y: 215 }); // x: match, y: critical (15pt)
      const diff = diffElements(makePair(a, b));

      expect(diff.overallSeverity).toBe('critical');
    });

    it('is match when all deltas are match', () => {
      const a = makeShape('a1');
      const b = makeShape('b1');
      const diff = diffElements(makePair(a, b));

      expect(diff.overallSeverity).toBe('match');
    });

    it('is minor when worst is minor', () => {
      const a = makeShape('a1', { x: 100 });
      const b = makeShape('b1', { x: 102 }); // 2pt => minor
      const diff = diffElements(makePair(a, b));

      expect(diff.overallSeverity).toBe('minor');
    });

    it('is major when worst is major', () => {
      const a = makeShape('a1', { x: 100 });
      const b = makeShape('b1', { x: 105 }); // 5pt => major
      const diff = diffElements(makePair(a, b));

      expect(diff.overallSeverity).toBe('major');
    });

    it('picks critical from mixed text deltas', () => {
      // position is fine, but paragraph count mismatch => critical
      const a = makeText('a1', {
        paragraphs: [makeParagraph(), makeParagraph()],
      });
      const b = makeText('b1', {
        paragraphs: [makeParagraph()],
      });
      const diff = diffElements(makePair(a, b));

      expect(diff.overallSeverity).toBe('critical');
    });
  });

  describe('multiple runs in a paragraph', () => {
    it('diffs each run independently', () => {
      const a = makeText('a1', {
        paragraphs: [
          makeParagraph({
            runs: [
              makeRun({ text: 'First', fontFamily: 'Arial', fontSize: 12 }),
              makeRun({ text: 'Second', fontFamily: 'Helvetica', fontSize: 14 }),
            ],
          }),
        ],
      });
      const b = makeText('b1', {
        paragraphs: [
          makeParagraph({
            runs: [
              makeRun({ text: 'First', fontFamily: 'Arial', fontSize: 12 }),
              makeRun({ text: 'Second', fontFamily: 'Times', fontSize: 14 }),
            ],
          }),
        ],
      });
      const diff = diffElements(makePair(a, b));

      // Run 0 font family should match (no delta)
      const run0Font = diff.deltas.find(
        (d) => d.property === 'paragraphs[0].runs[0].fontFamily',
      );
      expect(run0Font).toBeUndefined();

      // Run 1 font family should differ
      const run1Font = diff.deltas.find(
        (d) => d.property === 'paragraphs[0].runs[1].fontFamily',
      );
      expect(run1Font).toBeDefined();
      expect(run1Font!.severity).toBe('major');
    });
  });
});

// ─── generateDiffReport ───────────────────────────────────

describe('generateDiffReport', () => {
  describe('empty inputs', () => {
    it('returns empty report for two empty arrays', () => {
      const report = generateDiffReport([], []);

      expect(report.matched).toHaveLength(0);
      expect(report.unmatchedA).toHaveLength(0);
      expect(report.unmatchedB).toHaveLength(0);
      expect(report.summary).toEqual({
        totalA: 0,
        totalB: 0,
        matchedCount: 0,
        avgPositionDelta: 0,
        avgSizeDelta: 0,
        fontMismatches: 0,
        colorMismatches: 0,
      });
    });

    it('reports all elements as unmatched when no matches possible', () => {
      const a = [makeText('a1', { x: 0, y: 0 })];
      const b = [makeShape('b1', { x: 500, y: 500 })];
      const report = generateDiffReport(a, b);

      // Text vs shape at different positions - unlikely to match
      expect(report.summary.totalA).toBe(1);
      expect(report.summary.totalB).toBe(1);
      expect(report.unmatchedA.length + report.unmatchedB.length).toBeGreaterThan(0);
    });
  });

  describe('matched elements produce diffs', () => {
    it('matches identical text elements and produces diffs', () => {
      const a = [makeText('a1')];
      const b = [makeText('b1')];
      const report = generateDiffReport(a, b);

      expect(report.summary.matchedCount).toBe(1);
      expect(report.matched).toHaveLength(1);
      expect(report.matched[0].overallSeverity).toBe('match');
    });

    it('matches multiple text elements', () => {
      const a = [
        makeText('a1', { x: 10, y: 10, paragraphs: [makeParagraph({ runs: [makeRun({ text: 'Alpha' })] })] }),
        makeText('a2', { x: 200, y: 200, paragraphs: [makeParagraph({ runs: [makeRun({ text: 'Beta' })] })] }),
      ];
      const b = [
        makeText('b1', { x: 10, y: 10, paragraphs: [makeParagraph({ runs: [makeRun({ text: 'Alpha' })] })] }),
        makeText('b2', { x: 200, y: 200, paragraphs: [makeParagraph({ runs: [makeRun({ text: 'Beta' })] })] }),
      ];
      const report = generateDiffReport(a, b);

      expect(report.summary.matchedCount).toBe(2);
      expect(report.unmatchedA).toHaveLength(0);
      expect(report.unmatchedB).toHaveLength(0);
    });
  });

  describe('unmatched elements', () => {
    it('tracks elements only in source A as unmatchedA', () => {
      const a = [
        makeText('a1', { paragraphs: [makeParagraph({ runs: [makeRun({ text: 'shared' })] })] }),
        makeText('a2', { x: 500, y: 500, paragraphs: [makeParagraph({ runs: [makeRun({ text: 'unique-a-content-xyz' })] })] }),
      ];
      const b = [
        makeText('b1', { paragraphs: [makeParagraph({ runs: [makeRun({ text: 'shared' })] })] }),
      ];
      const report = generateDiffReport(a, b);

      expect(report.summary.totalA).toBe(2);
      expect(report.summary.totalB).toBe(1);
      expect(report.unmatchedA.length).toBeGreaterThanOrEqual(1);
    });

    it('tracks elements only in source B as unmatchedB', () => {
      const a = [
        makeText('a1', { paragraphs: [makeParagraph({ runs: [makeRun({ text: 'shared' })] })] }),
      ];
      const b = [
        makeText('b1', { paragraphs: [makeParagraph({ runs: [makeRun({ text: 'shared' })] })] }),
        makeText('b2', { x: 500, y: 500, paragraphs: [makeParagraph({ runs: [makeRun({ text: 'unique-b-content-xyz' })] })] }),
      ];
      const report = generateDiffReport(a, b);

      expect(report.unmatchedB.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('summary statistics', () => {
    it('computes avgPositionDelta from x and y deltas', () => {
      // Two text elements with known position diffs
      const a = [
        makeText('a1', { x: 100, y: 200, paragraphs: [makeParagraph({ runs: [makeRun({ text: 'test-pos' })] })] }),
      ];
      const b = [
        makeText('b1', { x: 104, y: 206, paragraphs: [makeParagraph({ runs: [makeRun({ text: 'test-pos' })] })] }),
      ];
      const report = generateDiffReport(a, b);

      expect(report.summary.matchedCount).toBe(1);
      // x delta = 4, y delta = 6 => avg = (4 + 6) / 2 = 5
      expect(report.summary.avgPositionDelta).toBe(5);
    });

    it('computes avgSizeDelta from width and height deltas', () => {
      const a = [
        makeText('a1', { width: 300, height: 50, paragraphs: [makeParagraph({ runs: [makeRun({ text: 'test-size' })] })] }),
      ];
      const b = [
        makeText('b1', { width: 304, height: 56, paragraphs: [makeParagraph({ runs: [makeRun({ text: 'test-size' })] })] }),
      ];
      const report = generateDiffReport(a, b);

      // width delta = 4, height delta = 6 => avg = (4 + 6) / 2 = 5
      expect(report.summary.avgSizeDelta).toBe(5);
    });

    it('counts font family mismatches', () => {
      const a = [
        makeText('a1', {
          paragraphs: [makeParagraph({ runs: [makeRun({ text: 'font-test', fontFamily: 'Arial' })] })],
        }),
      ];
      const b = [
        makeText('b1', {
          paragraphs: [makeParagraph({ runs: [makeRun({ text: 'font-test', fontFamily: 'Times' })] })],
        }),
      ];
      const report = generateDiffReport(a, b);

      expect(report.summary.fontMismatches).toBe(1);
    });

    it('counts color mismatches', () => {
      const a = [
        makeText('a1', {
          paragraphs: [makeParagraph({ runs: [makeRun({ text: 'color-test', color: { r: 0, g: 0, b: 0 } })] })],
        }),
      ];
      const b = [
        makeText('b1', {
          paragraphs: [makeParagraph({ runs: [makeRun({ text: 'color-test', color: { r: 255, g: 0, b: 0 } })] })],
        }),
      ];
      const report = generateDiffReport(a, b);

      expect(report.summary.colorMismatches).toBe(1);
    });

    it('does not count matching colors as mismatches', () => {
      const a = [
        makeText('a1', {
          paragraphs: [makeParagraph({ runs: [makeRun({ text: 'same-color', color: { r: 50, g: 50, b: 50 } })] })],
        }),
      ];
      const b = [
        makeText('b1', {
          paragraphs: [makeParagraph({ runs: [makeRun({ text: 'same-color', color: { r: 55, g: 50, b: 50 } })] })],
        }),
      ];
      const report = generateDiffReport(a, b);

      // Distance = 5 < 10 => match, not a mismatch
      expect(report.summary.colorMismatches).toBe(0);
    });

    it('reports correct totals', () => {
      const a = [makeText('a1'), makeText('a2', { x: 999 })];
      const b = [makeText('b1'), makeText('b2', { x: 888 }), makeText('b3', { x: 777 })];
      const report = generateDiffReport(a, b);

      expect(report.summary.totalA).toBe(2);
      expect(report.summary.totalB).toBe(3);
    });

    it('returns avgPositionDelta 0 when no matches exist', () => {
      const a = [makeText('a1', { x: 0, paragraphs: [makeParagraph({ runs: [makeRun({ text: 'unique-aaaa' })] })] })];
      const b = [makeText('b1', { x: 999, paragraphs: [makeParagraph({ runs: [makeRun({ text: 'unique-bbbb' })] })] })];
      const report = generateDiffReport(a, b);

      if (report.summary.matchedCount === 0) {
        expect(report.summary.avgPositionDelta).toBe(0);
        expect(report.summary.avgSizeDelta).toBe(0);
      }
    });
  });

  describe('spatial matching for shapes', () => {
    it('matches overlapping shapes of the same type', () => {
      const a = [makeShape('a1', { x: 100, y: 100, width: 200, height: 200 })];
      const b = [makeShape('b1', { x: 100, y: 100, width: 200, height: 200 })];
      const report = generateDiffReport(a, b);

      expect(report.summary.matchedCount).toBe(1);
      expect(report.matched[0].pair.matchMethod).toBe('spatial');
    });
  });
});
