/**
 * Trace Pipeline Harness — Phase 2 integration test.
 *
 * Converts CanvasTreeRecorder trace events directly into FlatTextRun[]
 * (via traceToFlatRuns adapter) and compares against pdftotext ground truth.
 *
 * This is the same comparison as element-diff-harness.test.ts but uses
 * trace-based data (what was actually rendered via Canvas2D) instead of
 * evaluator-based elements (what was extracted from the content stream).
 *
 * Key improvement: trace captures actual CSS font strings, effective font
 * sizes after matrix composition, and world-space coordinates via shadow CTM.
 *
 * Run: pnpm test -- src/render/__tests__/trace-pipeline-harness.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { PDFDocument } from '../../index.js';
import { NativeRenderer } from '../index.js';
import type { RenderTrace, TextTraceEvent } from '../canvas-tree-recorder.js';
import { extractAllPages } from './ground-truth-extractor.js';
import {
  matchTextElements,
  scorePageElements,
  generateElementDiffReport,
  type FlatTextRun,
  type PageDiffResult,
} from './element-matcher.js';

const PDF_PATH = '/Users/will/dev/USG Briefing/USG Briefing Mar 7 - UNCLAS.pdf';
const MAX_PAGES = 30;

const pdfName = 'usg-briefing';
const outDir = resolve(__dirname, '../../../../tmp/pdf-compare', pdfName);

// ─── Trace → FlatTextRun adapter ────────────────────────────────────

/**
 * Parse a CSS font string to extract the font family name.
 * Handles: "normal normal 12px Helvetica", "bold italic 14px 'Segoe UI', sans-serif"
 */
function parseFontFamily(fontString: string): string {
  const match = fontString.match(/(\d+(?:\.\d+)?(?:px|pt))\s+(.+)/);
  if (!match) return 'unknown';
  return match[2]
    .replace(/["']/g, '')
    .split(',')[0]
    .trim();
}

/**
 * Group glyph-level FlatTextRuns into word-level runs.
 *
 * Uses space characters as explicit word delimiters (spaces have isSpace=true
 * marker in the text field). Adjacent non-space glyphs on the same line
 * are merged into words. Line breaks trigger word breaks too.
 */
function groupGlyphsIntoWords(
  glyphs: FlatTextRun[],
  yTol = 2
): FlatTextRun[] {
  if (glyphs.length === 0) return [];

  // Sort by Y (lines) then X (left to right)
  const sorted = [...glyphs].sort((a, b) => {
    const dy = a.y - b.y;
    if (Math.abs(dy) > yTol) return dy;
    return a.x - b.x;
  });

  const words: FlatTextRun[] = [];
  let current: FlatTextRun | null = null;

  for (const g of sorted) {
    const isSpace = g.text === ' ' || g.text === '\t' || g.text.trim() === '';

    if (isSpace) {
      // Space → emit current word if any
      if (current && current.text.trim()) {
        words.push(current);
      }
      current = null;
      continue;
    }

    if (current === null) {
      current = { ...g };
      continue;
    }

    const sameLine = Math.abs(g.y - current.y) <= yTol;
    if (sameLine) {
      // Merge into current word
      current.text += g.text;
      current.width = g.x + g.width - current.x;
      current.height = Math.max(current.height, g.height);
      current.fontSize = Math.max(current.fontSize, g.fontSize);
    } else {
      // New line → word break
      if (current.text.trim()) words.push(current);
      current = { ...g };
    }
  }

  if (current && current.text.trim()) words.push(current);

  return words;
}

/**
 * Convert trace text events to FlatTextRun[] in top-left-origin PDF points.
 *
 * Trace events are in world-space (canvas pixels) because the shadow CTM
 * includes the viewport transform: scale(S, 0, 0, -S, -vb0*S, vb3*S).
 *
 * To convert back to top-left PDF points:
 *   pdfX = worldX / scale
 *   pdfY = worldY / scale  (Y is already flipped by the negative scale)
 */
function traceToFlatRuns(trace: RenderTrace, scale: number): FlatTextRun[] {
  const runs: FlatTextRun[] = [];

  for (const event of trace.events) {
    if (event.kind !== 'text') continue;
    const ev = event as TextTraceEvent;

    // Keep space characters — they serve as word boundary markers.
    // Skip other non-printable whitespace.
    if (ev.text !== ' ' && !ev.text.trim()) continue;

    // Convert from world-space (canvas pixels) to PDF points.
    // The viewport transform is scale(S, 0, 0, -S, -vb0*S, vb3*S), so:
    //   wx = S*(pdfX - vb0)  →  pdfX = wx/S + vb0
    //   wy = S*(vb3 - pdfY)  →  pdfY_topLeft = wy/S (when vb0=0, vb1=0)
    const x = ev.x / scale;
    let y = ev.y / scale;

    // The trace fontSizePt = rawFontSize * textMatrixScale, which is in text-matrix
    // coordinate space. To get PDF points, multiply by the page CTM scale factor
    // (without viewport): ctmScale / viewportScale.
    // The CTM includes both viewport(Sx) and page cm transforms(pageSx):
    //   ctm[0] = Sx * pageSx → pageSx = ctm[0] / Sx
    const ctmScale = Math.sqrt(ev.ctm[0] * ev.ctm[0] + ev.ctm[1] * ev.ctm[1]);
    const pageCTMScale = ctmScale / scale;
    const fontSize = ev.fontSizePt * pageCTMScale;

    // Our Y is the text baseline. pdftotext gives yMin (top of glyph bbox).
    // Subtract approximate ascent to align: ascent ≈ 0.8 * fontSize
    const ascent = fontSize * 0.8;
    y -= ascent;

    // Estimate glyph advance width from the traced width
    const width = ev.width / scale;

    // Estimate height from font size
    const height = fontSize;

    runs.push({
      text: ev.text,
      x,
      y,
      width,
      height,
      fontSize,
      fontFamily: parseFontFamily(ev.fontString),
    });
  }

  return runs;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Trace pipeline structural diff', () => {
  const pageResults: PageDiffResult[] = [];

  it('extract ground truth from pdftotext', { timeout: 30_000 }, async () => {
    if (!existsSync(PDF_PATH)) {
      console.log(`  Skipping: test PDF not found at ${PDF_PATH}`);
      return;
    }

    const groundTruth = await extractAllPages(PDF_PATH);
    expect(groundTruth.length).toBeGreaterThan(0);
    console.log(`\n  Ground truth: ${groundTruth.length} pages`);

    (globalThis as any).__traceGroundTruth = groundTruth;
  });

  it(
    'compare trace-based elements per page',
    { timeout: 120_000 },
    async () => {
      const groundTruth = (globalThis as any).__traceGroundTruth;
      if (!groundTruth) {
        console.log('  Skipping: no ground truth available');
        return;
      }

      const data = readFileSync(PDF_PATH);
      const doc = await PDFDocument.load(data);
      const renderer = NativeRenderer.fromDocument(doc);
      const pageCount = Math.min(renderer.pageCount, MAX_PAGES, groundTruth.length);
      const scale = 2; // Must match renderPageWithTrace scale

      console.log('\n  Trace-based element comparison (CanvasTreeRecorder → ground truth):');
      console.log('  Page | Words(GT) | Runs(Ours) | Matched | PosΔ   | TextAcc | PosAcc');
      console.log('  -----|----------|------------|---------|--------|---------|-------');

      for (let i = 0; i < pageCount; i++) {
        const gt = groundTruth[i];

        // Render with trace capture
        const { trace } = await renderer.renderPageWithTrace(i, { scale });

        // Convert trace events → FlatTextRun[] (glyph-level, top-left PDF points)
        const glyphRuns = traceToFlatRuns(trace, scale);

        // Group adjacent glyphs into words using space detection
        const words = groupGlyphsIntoWords(glyphRuns);

        // Match against ground truth
        const { matches, unmatchedOurs, unmatchedGround } = matchTextElements(
          words,
          gt.words,
          50 // 50pt matching threshold
        );

        const score = scorePageElements(matches, unmatchedOurs, unmatchedGround);

        pageResults.push({
          pageNum: i + 1,
          score,
          matches,
          unmatchedGround,
          unmatchedOurs,
        });

        const posD = score.avgPositionDelta.toFixed(1).padStart(5);
        const textAcc = (score.textAccuracy * 100).toFixed(0).padStart(5) + '%';
        const posAcc = (score.positionAccuracy * 100).toFixed(0).padStart(5) + '%';
        console.log(
          `  ${String(i + 1).padStart(4)} | ${String(gt.words.length).padStart(8)} | ${String(words.length).padStart(10)} | ${String(score.matchedCount).padStart(7)} | ${posD}pt | ${textAcc} | ${posAcc}`
        );
      }

      // Print sample matches from first page for debugging
      if (pageResults.length > 0 && pageResults[0].matches.length > 0) {
        console.log(`\n  Sample matches (page ${pageResults[0].pageNum}):`);
        for (const m of pageResults[0].matches.slice(0, 5)) {
          const d = m.positionDelta.toFixed(1);
          console.log(
            `    "${m.ours.text}" ↔ "${m.ground.text}" | Δ=${d}pt | font: ${m.ours.fontFamily} ${m.ours.fontSize.toFixed(1)}pt`
          );
        }
      }


      expect(pageResults.length).toBe(pageCount);
    }
  );

  it('generate trace-pipeline HTML report', () => {
    if (pageResults.length === 0) {
      console.log('  Skipping: no page results');
      return;
    }

    mkdirSync(outDir, { recursive: true });

    const html = generateElementDiffReport(pageResults);
    const reportPath = resolve(outDir, 'trace-pipeline-report.html');
    writeFileSync(reportPath, html);
    console.log(`\n  Trace pipeline report: ${reportPath}`);

    const avgTextAcc =
      pageResults.reduce((sum, p) => sum + p.score.textAccuracy, 0) / pageResults.length;
    const avgPosAcc =
      pageResults.reduce((sum, p) => sum + p.score.positionAccuracy, 0) / pageResults.length;
    const avgPosDelta =
      pageResults.reduce((sum, p) => sum + p.score.avgPositionDelta, 0) / pageResults.length;

    console.log(`  Avg text accuracy:     ${(avgTextAcc * 100).toFixed(1)}%`);
    console.log(`  Avg position accuracy: ${(avgPosAcc * 100).toFixed(1)}%`);
    console.log(`  Avg position delta:    ${avgPosDelta.toFixed(2)}pt`);
    console.log(`\n  Open: file://${reportPath}\n`);

    expect(avgTextAcc).toBeGreaterThan(0);
  });
});
