/**
 * Property Diff — computes per-element property diffs between matched
 * element pairs and generates a summary report.
 */

import type {
  PageElement,
  TextElement,
  Color,
  TextRun,
} from '../types.js';
import { matchElements } from './element-matcher.js';
import type { MatchedPair } from './element-matcher.js';

// Re-export MatchedPair so consumers can import from here
export type { MatchedPair };

// ─── Public Types ──────────────────────────────────────

/** A single property comparison between two matched elements. */
export interface PropertyDelta {
  /** Dot-path of the compared property (e.g. "x", "paragraphs[0].runs[1].fontSize"). */
  property: string;
  valueA: unknown;
  valueB: unknown;
  /** Absolute numeric difference, when applicable. */
  delta?: number;
  severity: 'match' | 'minor' | 'major' | 'critical';
}

/** Full diff for one matched element pair. */
export interface ElementDiff {
  pair: MatchedPair;
  deltas: PropertyDelta[];
  /** Worst severity across all deltas. */
  overallSeverity: 'match' | 'minor' | 'major' | 'critical';
}

/** Aggregate diff report across all elements. */
export interface DiffReport {
  matched: ElementDiff[];
  unmatchedA: PageElement[];
  unmatchedB: PageElement[];
  summary: {
    totalA: number;
    totalB: number;
    matchedCount: number;
    avgPositionDelta: number;
    avgSizeDelta: number;
    fontMismatches: number;
    colorMismatches: number;
  };
}

// ─── Severity helpers ──────────────────────────────────

type Severity = 'match' | 'minor' | 'major' | 'critical';

const SEVERITY_RANK: Record<Severity, number> = {
  match: 0,
  minor: 1,
  major: 2,
  critical: 3,
};

function worstSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/**
 * Position/size threshold: <1pt match, 1-3pt minor, 3-8pt major, >8pt critical.
 */
function positionSeverity(delta: number): Severity {
  if (delta < 1) return 'match';
  if (delta <= 3) return 'minor';
  if (delta <= 8) return 'major';
  return 'critical';
}

/**
 * Font size threshold: <0.5pt match, 0.5-1pt minor, >1pt major.
 */
function fontSizeSeverity(delta: number): Severity {
  if (delta < 0.5) return 'match';
  if (delta <= 1) return 'minor';
  return 'major';
}

/**
 * Color comparison using Euclidean distance in RGB space.
 * <10 match, 10-30 minor, >30 major.
 */
function colorDistance(a: Color, b: Color): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function colorSeverity(dist: number): Severity {
  if (dist < 10) return 'match';
  if (dist <= 30) return 'minor';
  return 'major';
}

/**
 * Normalize font family for comparison:
 * - Strip CSS fallback chain: "Barlow", sans-serif → Barlow
 * - Remove quotes: "RobotoSlab" → RobotoSlab
 * - Lowercase for case-insensitive comparison
 */
function normalizeFontFamily(family: string): string {
  return family
    .split(',')[0]           // take first in CSS fallback chain
    .trim()
    .replace(/^["']|["']$/g, '') // strip quotes
    .toLowerCase()
    .trim();
}

// ─── Core diff logic ───────────────────────────────────

function diffNumericProp(
  property: string,
  a: number,
  b: number,
  severityFn: (delta: number) => Severity,
): PropertyDelta {
  const delta = Math.abs(a - b);
  return { property, valueA: a, valueB: b, delta, severity: severityFn(delta) };
}

function diffTextRuns(
  runsA: TextRun[],
  runsB: TextRun[],
  pathPrefix: string,
): PropertyDelta[] {
  const deltas: PropertyDelta[] = [];
  const maxRuns = Math.max(runsA.length, runsB.length);

  for (let r = 0; r < maxRuns; r++) {
    const prefix = `${pathPrefix}.runs[${r}]`;
    const ra = runsA[r];
    const rb = runsB[r];

    if (!ra || !rb) {
      deltas.push({
        property: prefix,
        valueA: ra ? ra.text : undefined,
        valueB: rb ? rb.text : undefined,
        severity: 'critical',
      });
      continue;
    }

    // Text content
    if (ra.text !== rb.text) {
      deltas.push({
        property: `${prefix}.text`,
        valueA: ra.text,
        valueB: rb.text,
        severity: 'major',
      });
    }

    // Font family (normalized — strip CSS fallbacks, quotes, weight suffixes)
    const fontA = normalizeFontFamily(ra.fontFamily);
    const fontB = normalizeFontFamily(rb.fontFamily);
    if (fontA !== fontB) {
      // Downgrade severity if base family matches (e.g. "barlow light" vs "barlow")
      const baseA = fontA.split(/\s+/)[0];
      const baseB = fontB.split(/\s+/)[0];
      const severity = baseA === baseB ? 'minor' : 'major';
      deltas.push({
        property: `${prefix}.fontFamily`,
        valueA: ra.fontFamily,
        valueB: rb.fontFamily,
        severity,
      });
    }

    // Font size
    deltas.push(
      diffNumericProp(
        `${prefix}.fontSize`,
        ra.fontSize,
        rb.fontSize,
        fontSizeSeverity,
      ),
    );

    // Bold
    if (!!ra.bold !== !!rb.bold) {
      deltas.push({
        property: `${prefix}.bold`,
        valueA: !!ra.bold,
        valueB: !!rb.bold,
        severity: 'major',
      });
    }

    // Italic
    if (!!ra.italic !== !!rb.italic) {
      deltas.push({
        property: `${prefix}.italic`,
        valueA: !!ra.italic,
        valueB: !!rb.italic,
        severity: 'major',
      });
    }

    // Color
    const cDist = colorDistance(ra.color, rb.color);
    const cSev = colorSeverity(cDist);
    deltas.push({
      property: `${prefix}.color`,
      valueA: ra.color,
      valueB: rb.color,
      delta: cDist,
      severity: cSev,
    });

    // Run measured width
    deltas.push(
      diffNumericProp(
        `${prefix}.width`,
        ra.width,
        rb.width,
        positionSeverity,
      ),
    );
  }

  return deltas;
}

// ─── Public API ────────────────────────────────────────

/**
 * Compute property-level diffs between a matched element pair.
 *
 * Compares position, size, and — for TextElements — font properties,
 * color, bold/italic, and run-level measurements.
 *
 * @param pair - A matched pair from the element matcher.
 * @returns Per-property deltas with severity ratings.
 */
export function diffElements(pair: MatchedPair): ElementDiff {
  const { a, b } = pair;
  const deltas: PropertyDelta[] = [];

  // ── Position & Size ──────────────────────────────────

  deltas.push(diffNumericProp('x', a.x, b.x, positionSeverity));
  deltas.push(diffNumericProp('y', a.y, b.y, positionSeverity));
  deltas.push(diffNumericProp('width', a.width, b.width, positionSeverity));
  deltas.push(diffNumericProp('height', a.height, b.height, positionSeverity));

  // ── Text-specific diffs ──────────────────────────────

  if (a.type === 'text' && b.type === 'text') {
    const ta = a as TextElement;
    const tb = b as TextElement;
    const maxParas = Math.max(ta.paragraphs.length, tb.paragraphs.length);

    for (let p = 0; p < maxParas; p++) {
      const pa = ta.paragraphs[p];
      const pb = tb.paragraphs[p];
      const prefix = `paragraphs[${p}]`;

      if (!pa || !pb) {
        deltas.push({
          property: prefix,
          valueA: pa ?? undefined,
          valueB: pb ?? undefined,
          severity: 'critical',
        });
        continue;
      }

      // Paragraph alignment
      if (pa.align !== pb.align) {
        deltas.push({
          property: `${prefix}.align`,
          valueA: pa.align,
          valueB: pb.align,
          severity: 'minor',
        });
      }

      // Runs
      deltas.push(...diffTextRuns(pa.runs, pb.runs, prefix));
    }
  }

  // ── Overall severity ─────────────────────────────────

  let overall: Severity = 'match';
  for (const d of deltas) {
    overall = worstSeverity(overall, d.severity);
  }

  return { pair, deltas, overallSeverity: overall };
}

/**
 * Generate a full diff report comparing two sets of page elements.
 *
 * Runs the element matcher, then diffs each matched pair. Returns
 * per-element diffs plus aggregate statistics.
 *
 * @param sourceA - Elements from the first source.
 * @param sourceB - Elements from the second source.
 * @returns Complete diff report with matched diffs and summary stats.
 */
export function generateDiffReport(
  sourceA: PageElement[],
  sourceB: PageElement[],
): DiffReport {
  const matchResult = matchElements(sourceA, sourceB);
  const matched: ElementDiff[] = matchResult.matched.map((pair) =>
    diffElements(pair),
  );

  // ── Summary statistics ───────────────────────────────

  let totalPosDelta = 0;
  let totalSizeDelta = 0;
  let fontMismatches = 0;
  let colorMismatches = 0;
  let posCount = 0;
  let sizeCount = 0;

  for (const diff of matched) {
    for (const d of diff.deltas) {
      if (d.property === 'x' || d.property === 'y') {
        totalPosDelta += d.delta ?? 0;
        posCount++;
      }
      if (d.property === 'width' || d.property === 'height') {
        totalSizeDelta += d.delta ?? 0;
        sizeCount++;
      }
      if (d.property.endsWith('.fontFamily') && d.severity !== 'match') {
        fontMismatches++;
      }
      if (d.property.endsWith('.color') && d.severity !== 'match') {
        colorMismatches++;
      }
    }
  }

  return {
    matched,
    unmatchedA: matchResult.unmatchedA,
    unmatchedB: matchResult.unmatchedB,
    summary: {
      totalA: sourceA.length,
      totalB: sourceB.length,
      matchedCount: matched.length,
      avgPositionDelta: posCount > 0 ? totalPosDelta / posCount : 0,
      avgSizeDelta: sizeCount > 0 ? totalSizeDelta / sizeCount : 0,
      fontMismatches,
      colorMismatches,
    },
  };
}
