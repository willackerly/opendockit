/**
 * Element-Level Structural Diff Harness
 *
 * Compares NativeRenderer's emitted elements against pdftotext ground truth.
 * Generates a per-page element accuracy report alongside the pixel RMSE report.
 *
 * Run: pnpm test -- src/render/__tests__/element-diff-harness.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { PDFDocument } from '../../index.js';
import { NativeRenderer } from '../index.js';
import { extractAllPages } from './ground-truth-extractor.js';
import {
  flattenTextRuns,
  groupRunsIntoWords,
  matchTextElements,
  scorePageElements,
  generateElementDiffReport,
  type PageDiffResult,
} from './element-matcher.js';

const PDF_PATH = '/Users/will/dev/USG Briefing/USG Briefing Mar 7 - UNCLAS.pdf';
const MAX_PAGES = 30;

const pdfName = 'usg-briefing';
const outDir = resolve(__dirname, '../../../../tmp/pdf-compare', pdfName);

describe('Element-level structural diff', () => {
  const pageResults: PageDiffResult[] = [];

  it('extract ground truth from pdftotext', { timeout: 30_000 }, async () => {
    if (!existsSync(PDF_PATH)) {
      console.log(`  Skipping: test PDF not found at ${PDF_PATH}`);
      return;
    }

    const groundTruth = await extractAllPages(PDF_PATH);
    expect(groundTruth.length).toBeGreaterThan(0);
    console.log(`\n  Ground truth: ${groundTruth.length} pages`);

    // Store for next test
    (globalThis as any).__groundTruth = groundTruth;
  });

  it(
    'compare elements per page',
    { timeout: 120_000 },
    async () => {
      const groundTruth = (globalThis as any).__groundTruth;
      if (!groundTruth) {
        console.log('  Skipping: no ground truth available');
        return;
      }

      const data = readFileSync(PDF_PATH);
      const doc = await PDFDocument.load(data);
      const renderer = NativeRenderer.fromDocument(doc);
      const pageCount = Math.min(renderer.pageCount, MAX_PAGES, groundTruth.length);

      console.log('  Page | Words(GT) | Runs(Ours) | Matched | PosΔ   | TextAcc | PosAcc');
      console.log('  -----|----------|------------|---------|--------|---------|-------');

      for (let i = 0; i < pageCount; i++) {
        const elements = renderer.getPageElements(i);
        const gt = groundTruth[i];

        // Flatten our elements into text runs (flip Y to top-left origin),
        // then group into words for matching against ground truth
        const runs = flattenTextRuns(elements, gt.height);
        const words = groupRunsIntoWords(runs);

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

      expect(pageResults.length).toBe(pageCount);
    }
  );

  it('generate HTML element diff report', () => {
    if (pageResults.length === 0) {
      console.log('  Skipping: no page results');
      return;
    }

    mkdirSync(outDir, { recursive: true });

    const html = generateElementDiffReport(pageResults);
    const reportPath = resolve(outDir, 'element-diff-report.html');
    writeFileSync(reportPath, html);
    console.log(`\n  Element diff report: ${reportPath}`);

    // Summary stats
    const avgTextAcc =
      pageResults.reduce((sum, p) => sum + p.score.textAccuracy, 0) / pageResults.length;
    const avgPosAcc =
      pageResults.reduce((sum, p) => sum + p.score.positionAccuracy, 0) / pageResults.length;
    const avgPosDelta =
      pageResults.reduce((sum, p) => sum + p.score.avgPositionDelta, 0) / pageResults.length;

    console.log(`  Avg text accuracy:     ${(avgTextAcc * 100).toFixed(1)}%`);
    console.log(`  Avg position accuracy: ${(avgPosAcc * 100).toFixed(1)}%`);
    console.log(`  Avg position delta:    ${avgPosDelta.toFixed(2)}pt`);

    // Open in browser
    console.log(`\n  Open: file://${reportPath}\n`);

    expect(avgTextAcc).toBeGreaterThan(0); // sanity — some text should match
  });
});
