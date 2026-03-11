/**
 * Element-level structural diff engine for comparing PDF renderer output
 * against ground truth from pdftotext -bbox-layout.
 *
 * Provides:
 * - flattenTextRuns: extracts individual text runs with absolute positions
 * - matchTextElements: greedy nearest-neighbor matching by position + text
 * - scorePageElements: aggregate quality metrics
 * - generateElementDiffReport: self-contained HTML visualization
 */

import type { PageElement, TextElement, TextRun } from '../../elements/types.js';

// ─── Ground Truth Types ─────────────────────────────────────────────

export interface GroundTruthWord {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
}

export interface GroundTruthLine {
  x: number;
  y: number;
  width: number;
  height: number;
  words: GroundTruthWord[];
}

export interface GroundTruthBlock {
  x: number;
  y: number;
  width: number;
  height: number;
  lines: GroundTruthLine[];
}

export interface GroundTruthPage {
  width: number;
  height: number;
  words: GroundTruthWord[];
  lines: GroundTruthLine[];
  blocks: GroundTruthBlock[];
}

// ─── Flat Text Run ──────────────────────────────────────────────────

export interface FlatTextRun {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
}

// ─── Match / Score Types ────────────────────────────────────────────

export interface TextMatch {
  ours: FlatTextRun;
  ground: GroundTruthWord;
  positionDelta: number;
  textSimilarity: number;
  fontSizeDelta: number;
  widthDelta: number;
}

export interface PageScore {
  totalGroundWords: number;
  totalOurRuns: number;
  matchedCount: number;
  unmatchedGroundCount: number;
  unmatchedOursCount: number;
  avgPositionDelta: number;
  avgTextSimilarity: number;
  avgFontSizeDelta: number;
  textAccuracy: number;
  positionAccuracy: number;
}

export interface PageDiffResult {
  pageNum: number;
  score: PageScore;
  matches: TextMatch[];
  unmatchedGround: GroundTruthWord[];
  unmatchedOurs: FlatTextRun[];
}

// ─── Levenshtein Distance ───────────────────────────────────────────

/**
 * Compute the Levenshtein edit distance between two strings.
 * Uses a standard dynamic programming approach with O(min(m,n)) space.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure a is the shorter string for space efficiency
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const m = a.length;
  const n = b.length;

  // Single row DP — prev[j] holds distance for (i-1, j)
  let prev = new Array<number>(m + 1);
  let curr = new Array<number>(m + 1);

  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,       // insert
        prev[j] + 1,           // delete
        prev[j - 1] + cost     // substitute
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[m];
}

/**
 * Normalized edit distance ratio: 0 = identical, 1 = completely different.
 */
export function editDistanceRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return levenshteinDistance(a, b) / maxLen;
}

// ─── Flatten Text Runs ──────────────────────────────────────────────

/**
 * Flatten TextElement trees into individual text runs with absolute positions.
 * Run x/y are offsets from the element origin, so we add the element's x/y.
 */
export function flattenTextRuns(elements: PageElement[]): FlatTextRun[] {
  const runs: FlatTextRun[] = [];

  for (const el of elements) {
    if (el.type !== 'text') continue;
    const textEl = el as TextElement;

    for (const para of textEl.paragraphs) {
      for (const run of para.runs) {
        if (!run.text || run.text.trim().length === 0) continue;
        runs.push({
          text: run.text,
          x: textEl.x + run.x,
          y: textEl.y + run.y,
          width: run.width,
          height: run.height,
          fontSize: run.fontSize,
          fontFamily: run.fontFamily,
        });
      }
    }
  }

  return runs;
}

/**
 * Group consecutive same-line runs into word-level chunks for better matching
 * against pdftotext words. Runs on the same line (similar y, adjacent x)
 * with no whitespace gap are concatenated.
 */
export function groupRunsIntoWords(
  runs: FlatTextRun[],
  yTolerance = 2,
  xGapTolerance = 3
): FlatTextRun[] {
  if (runs.length === 0) return [];

  // Sort by y then x
  const sorted = [...runs].sort((a, b) => {
    const dy = a.y - b.y;
    if (Math.abs(dy) > yTolerance) return dy;
    return a.x - b.x;
  });

  const words: FlatTextRun[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const run = sorted[i];
    const sameLine = Math.abs(run.y - current.y) <= yTolerance;
    const adjacent = run.x - (current.x + current.width) <= xGapTolerance;
    const sameFont = run.fontFamily === current.fontFamily;

    if (sameLine && adjacent && sameFont) {
      // Merge into current word
      current.text += run.text;
      current.width = run.x + run.width - current.x;
      current.height = Math.max(current.height, run.height);
      current.fontSize = Math.max(current.fontSize, run.fontSize);
    } else {
      words.push(current);
      current = { ...run };
    }
  }
  words.push(current);

  return words;
}

// ─── Match Text Elements ────────────────────────────────────────────

function centerX(r: { x: number; width: number }): number {
  return r.x + r.width / 2;
}

function centerY(r: { y: number; height: number }): number {
  return r.y + r.height / 2;
}

function euclideanDistance(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): number {
  const dx = centerX(a) - centerX(b);
  const dy = centerY(a) - centerY(b);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Greedy nearest-neighbor matching: for each ground truth word, find the
 * closest unmatched run by position (Euclidean distance of centers).
 * Only matches within the given threshold.
 *
 * Returns matches, unmatched ground words, and unmatched our runs.
 */
export function matchTextElements(
  ours: FlatTextRun[],
  ground: GroundTruthWord[],
  distanceThreshold = 50
): {
  matches: TextMatch[];
  unmatchedGround: GroundTruthWord[];
  unmatchedOurs: FlatTextRun[];
} {
  const matched = new Set<number>(); // indices into ours
  const matches: TextMatch[] = [];
  const unmatchedGround: GroundTruthWord[] = [];

  for (const gw of ground) {
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = 0; i < ours.length; i++) {
      if (matched.has(i)) continue;
      const dist = euclideanDistance(ours[i], gw);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestDist <= distanceThreshold) {
      matched.add(bestIdx);
      const ourRun = ours[bestIdx];
      matches.push({
        ours: ourRun,
        ground: gw,
        positionDelta: bestDist,
        textSimilarity: editDistanceRatio(ourRun.text, gw.text),
        fontSizeDelta: Math.abs(ourRun.fontSize - (gw.fontSize ?? ourRun.fontSize)),
        widthDelta: Math.abs(ourRun.width - gw.width),
      });
    } else {
      unmatchedGround.push(gw);
    }
  }

  const unmatchedOurs = ours.filter((_, i) => !matched.has(i));

  return { matches, unmatchedGround, unmatchedOurs };
}

// ─── Score Page Elements ────────────────────────────────────────────

/**
 * Compute aggregate quality metrics for a page's element matches.
 */
export function scorePageElements(
  matches: TextMatch[],
  unmatchedOurs: FlatTextRun[],
  unmatchedGround: GroundTruthWord[]
): PageScore {
  const matchedCount = matches.length;
  const totalGroundWords = matchedCount + unmatchedGround.length;
  const totalOurRuns = matchedCount + unmatchedOurs.length;

  if (matchedCount === 0) {
    return {
      totalGroundWords,
      totalOurRuns,
      matchedCount: 0,
      unmatchedGroundCount: unmatchedGround.length,
      unmatchedOursCount: unmatchedOurs.length,
      avgPositionDelta: 0,
      avgTextSimilarity: 0,
      avgFontSizeDelta: 0,
      textAccuracy: 0,
      positionAccuracy: 0,
    };
  }

  let sumPosDelta = 0;
  let sumTextSim = 0;
  let sumFontSizeDelta = 0;
  let correctTextCount = 0;
  let goodPositionCount = 0;

  for (const m of matches) {
    sumPosDelta += m.positionDelta;
    sumTextSim += m.textSimilarity;
    sumFontSizeDelta += m.fontSizeDelta;
    if (m.textSimilarity < 0.1) correctTextCount++;
    if (m.positionDelta < 5) goodPositionCount++;
  }

  return {
    totalGroundWords,
    totalOurRuns,
    matchedCount,
    unmatchedGroundCount: unmatchedGround.length,
    unmatchedOursCount: unmatchedOurs.length,
    avgPositionDelta: sumPosDelta / matchedCount,
    avgTextSimilarity: sumTextSim / matchedCount,
    avgFontSizeDelta: sumFontSizeDelta / matchedCount,
    textAccuracy: totalGroundWords > 0 ? correctTextCount / totalGroundWords : 0,
    positionAccuracy: totalGroundWords > 0 ? goodPositionCount / totalGroundWords : 0,
  };
}

// ─── HTML Report Generation ─────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scoreClass(score: PageScore): string {
  if (score.textAccuracy >= 0.9 && score.positionAccuracy >= 0.8) return 'good';
  if (score.textAccuracy >= 0.6 || score.positionAccuracy >= 0.5) return 'fair';
  return 'bad';
}

/**
 * Generate a self-contained HTML report showing element-level diff results
 * for one or more pages.
 */
export function generateElementDiffReport(pages: PageDiffResult[]): string {
  const pageRows = pages
    .map((p) => {
      const cls = scoreClass(p.score);
      return `<tr class="${cls}">
        <td>${p.pageNum}</td>
        <td>${p.score.totalGroundWords}</td>
        <td>${p.score.totalOurRuns}</td>
        <td>${p.score.matchedCount}</td>
        <td>${p.score.unmatchedGroundCount}</td>
        <td>${p.score.unmatchedOursCount}</td>
        <td>${p.score.avgPositionDelta.toFixed(2)}</td>
        <td>${p.score.avgTextSimilarity.toFixed(3)}</td>
        <td>${(p.score.textAccuracy * 100).toFixed(1)}%</td>
        <td>${(p.score.positionAccuracy * 100).toFixed(1)}%</td>
      </tr>`;
    })
    .join('\n');

  const pageDetails = pages
    .map((p) => {
      const matchRows = p.matches
        .map(
          (m) =>
            `<tr>
          <td class="text">${escapeHtml(m.ground.text)}</td>
          <td class="text">${escapeHtml(m.ours.text)}</td>
          <td>${m.positionDelta.toFixed(1)}</td>
          <td>${m.textSimilarity.toFixed(3)}</td>
          <td>${m.fontSizeDelta.toFixed(1)}</td>
          <td>${m.widthDelta.toFixed(1)}</td>
        </tr>`
        )
        .join('\n');

      const unmatchedGroundRows = p.unmatchedGround
        .map(
          (w) =>
            `<tr class="unmatched-ground"><td class="text">${escapeHtml(w.text)}</td>
          <td>(${w.x.toFixed(0)}, ${w.y.toFixed(0)})</td>
          <td>${w.width.toFixed(0)}x${w.height.toFixed(0)}</td></tr>`
        )
        .join('\n');

      const unmatchedOursRows = p.unmatchedOurs
        .map(
          (r) =>
            `<tr class="unmatched-ours"><td class="text">${escapeHtml(r.text)}</td>
          <td>(${r.x.toFixed(0)}, ${r.y.toFixed(0)})</td>
          <td>${r.width.toFixed(0)}x${r.height.toFixed(0)}</td></tr>`
        )
        .join('\n');

      return `
      <div class="page-detail" id="page-${p.pageNum}">
        <h3 class="page-header" onclick="toggleDetail(${p.pageNum})">
          Page ${p.pageNum}
          <span class="badge ${scoreClass(p.score)}">${(p.score.textAccuracy * 100).toFixed(0)}% text</span>
          <span class="toggle">[expand]</span>
        </h3>
        <div class="detail-content" id="detail-${p.pageNum}" style="display:none">
          ${
            p.matches.length > 0
              ? `<h4>Matched Elements (${p.matches.length})</h4>
          <table class="match-table">
            <thead><tr><th>Ground</th><th>Ours</th><th>Pos &Delta;</th><th>Text Sim</th><th>Size &Delta;</th><th>Width &Delta;</th></tr></thead>
            <tbody>${matchRows}</tbody>
          </table>`
              : ''
          }
          ${
            p.unmatchedGround.length > 0
              ? `<h4>Unmatched Ground Truth (${p.unmatchedGround.length})</h4>
          <table class="unmatched-table">
            <thead><tr><th>Text</th><th>Position</th><th>Size</th></tr></thead>
            <tbody>${unmatchedGroundRows}</tbody>
          </table>`
              : ''
          }
          ${
            p.unmatchedOurs.length > 0
              ? `<h4>Unmatched Our Runs (${p.unmatchedOurs.length})</h4>
          <table class="unmatched-table">
            <thead><tr><th>Text</th><th>Position</th><th>Size</th></tr></thead>
            <tbody>${unmatchedOursRows}</tbody>
          </table>`
              : ''
          }
        </div>
      </div>`;
    })
    .join('\n');

  // Compute overall summary
  const totalGround = pages.reduce((s, p) => s + p.score.totalGroundWords, 0);
  const totalMatched = pages.reduce((s, p) => s + p.score.matchedCount, 0);
  const avgTextAcc =
    pages.length > 0
      ? pages.reduce((s, p) => s + p.score.textAccuracy, 0) / pages.length
      : 0;
  const avgPosAcc =
    pages.length > 0
      ? pages.reduce((s, p) => s + p.score.positionAccuracy, 0) / pages.length
      : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Element-Level Diff Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #f5f5f5; color: #333; }
  h1 { margin-bottom: 10px; }
  h2 { margin: 20px 0 10px; }
  .summary { background: #fff; padding: 16px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .summary-stats { display: flex; gap: 24px; margin-top: 10px; }
  .stat { text-align: center; }
  .stat .value { font-size: 28px; font-weight: bold; }
  .stat .label { font-size: 12px; color: #666; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; background: #fff; }
  th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #eee; font-size: 13px; }
  th { background: #f9f9f9; font-weight: 600; }
  td.text { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  tr.good { background: #e8f5e9; }
  tr.fair { background: #fff8e1; }
  tr.bad { background: #ffebee; }
  .unmatched-ground td { color: #c62828; }
  .unmatched-ours td { color: #1565c0; }
  .page-detail { background: #fff; margin-bottom: 8px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
  .page-header { padding: 12px 16px; cursor: pointer; display: flex; align-items: center; gap: 10px; }
  .page-header:hover { background: #f5f5f5; }
  .badge { font-size: 12px; padding: 2px 8px; border-radius: 10px; color: #fff; }
  .badge.good { background: #4caf50; }
  .badge.fair { background: #ff9800; }
  .badge.bad { background: #f44336; }
  .toggle { font-size: 12px; color: #999; margin-left: auto; }
  .detail-content { padding: 0 16px 16px; }
  .match-table, .unmatched-table { font-size: 12px; }
  h4 { margin: 12px 0 6px; font-size: 14px; }
</style>
</head>
<body>
<h1>Element-Level Diff Report</h1>
<div class="summary">
  <div class="summary-stats">
    <div class="stat"><div class="value">${pages.length}</div><div class="label">Pages</div></div>
    <div class="stat"><div class="value">${totalGround}</div><div class="label">Ground Words</div></div>
    <div class="stat"><div class="value">${totalMatched}</div><div class="label">Matched</div></div>
    <div class="stat"><div class="value">${(avgTextAcc * 100).toFixed(1)}%</div><div class="label">Avg Text Accuracy</div></div>
    <div class="stat"><div class="value">${(avgPosAcc * 100).toFixed(1)}%</div><div class="label">Avg Position Accuracy</div></div>
  </div>
</div>

<h2>Per-Page Summary</h2>
<table>
  <thead><tr>
    <th>Page</th><th>Ground</th><th>Ours</th><th>Matched</th>
    <th>Unmatched GT</th><th>Unmatched Ours</th>
    <th>Avg Pos &Delta;</th><th>Avg Text Sim</th>
    <th>Text Acc</th><th>Pos Acc</th>
  </tr></thead>
  <tbody>${pageRows}</tbody>
</table>

<h2>Page Details</h2>
${pageDetails}

<script>
function toggleDetail(pageNum) {
  var el = document.getElementById('detail-' + pageNum);
  var toggle = el.parentElement.querySelector('.toggle');
  if (el.style.display === 'none') {
    el.style.display = 'block';
    toggle.textContent = '[collapse]';
  } else {
    el.style.display = 'none';
    toggle.textContent = '[expand]';
  }
}
</script>
</body>
</html>`;
}
