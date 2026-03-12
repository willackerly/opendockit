/**
 * Hybrid signature visual integrity test for USG Briefing PDF.
 *
 * Signs the PDF incrementally, renders all pages before/after via pdftoppm,
 * and verifies only the signature page has visual changes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { signPDFWithPDFBox } from '../pdfbox-signer.js';
import { getFixtureSigner } from '../../testing/fixture-signer.js';

const PDF_PATH = '/Users/will/dev/USG Briefing/USG Briefing Mar 7 - UNCLAS.pdf';
const OUT_DIR = '/tmp/hybrid-sign-visual-diff';

// Pixel diff threshold — pdftoppm may produce 1-2 pixel jitter from
// metadata changes (ModDate, ID) that affect rendering hints. Anything
// below this threshold is considered identical.
const NOISE_THRESHOLD = 5;

// Minimum diff for the signature page to confirm the sig is visible
const MIN_SIG_DIFF = 100;

const hasPdf = existsSync(PDF_PATH);
const hasPdftoppm = (() => {
  try { execSync('which pdftoppm', { stdio: 'pipe' }); return true; } catch { return false; }
})();
const hasCompare = (() => {
  try { execSync('which compare', { stdio: 'pipe' }); return true; } catch { return false; }
})();

function renderPages(pdfPath: string, outDir: string): string[] {
  mkdirSync(outDir, { recursive: true });
  execSync(`pdftoppm -png -r 150 "${pdfPath}" "${outDir}/page"`, {
    timeout: 120000,
    stdio: ['pipe', 'pipe', 'pipe'], // suppress stderr warnings
  });
  return readdirSync(outDir).filter(f => f.endsWith('.png')).sort();
}

/**
 * Count differing pixels between two images using ImageMagick compare.
 * Uses -fuzz 1% to ignore sub-pixel rendering noise.
 */
function pixelDiff(imgA: string, imgB: string, diffOut: string): number {
  try {
    const out = execSync(
      `compare -fuzz 1% -metric AE "${imgA}" "${imgB}" "${diffOut}" 2>&1`,
      { encoding: 'utf-8', timeout: 30000 }
    ).trim();
    return parseInt(out, 10);
  } catch (err: any) {
    const stderr = err.stderr || err.stdout || err.message || '';
    const match = stderr.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : -1;
  }
}

describe.skipIf(!hasPdf || !hasPdftoppm || !hasCompare)(
  'Hybrid signature visual integrity',
  () => {
    it('only the signature page should differ after signing', async () => {
      // Clean
      execSync(`rm -rf "${OUT_DIR}"`);
      mkdirSync(join(OUT_DIR, 'original'), { recursive: true });
      mkdirSync(join(OUT_DIR, 'signed'), { recursive: true });
      mkdirSync(join(OUT_DIR, 'diffs'), { recursive: true });

      // 1. Render original
      const origPages = renderPages(PDF_PATH, join(OUT_DIR, 'original'));
      expect(origPages.length).toBeGreaterThan(0);

      // 2. Sign — place signature on last page
      const pdfBytes = readFileSync(PDF_PATH);
      const signer = getFixtureSigner();
      const sigPageIdx = origPages.length - 1; // 0-indexed

      const result = await signPDFWithPDFBox(pdfBytes, signer, {
        reason: 'Visual integrity test',
        location: 'Automated Test',
        contactInfo: 'test@example.com',
        signatureAppearance: {
          position: {
            page: sigPageIdx,
            x: 350,
            y: 50,
            width: 200,
            height: 60,
          },
        },
      });

      const signedPath = join(OUT_DIR, 'signed.pdf');
      writeFileSync(signedPath, Buffer.from(result.signedData));

      // Verify incremental save (signed should be larger, not a rewrite)
      const origSize = pdfBytes.length;
      const signedSize = result.signedData.length;
      console.log(`\nOriginal: ${(origSize / 1024).toFixed(0)} KB`);
      console.log(`Signed:   ${(signedSize / 1024).toFixed(0)} KB`);
      console.log(`Delta:    ${((signedSize - origSize) / 1024).toFixed(0)} KB (incremental append)`);
      expect(signedSize).toBeGreaterThan(origSize);

      // 3. Render signed
      const signedPages = renderPages(signedPath, join(OUT_DIR, 'signed'));
      expect(signedPages.length).toBe(origPages.length);

      // 4. Per-page pixel diff
      const sigPageNum = origPages.length; // 1-indexed
      const results: { page: number; diffPixels: number }[] = [];

      for (let i = 0; i < origPages.length; i++) {
        const origPng = join(OUT_DIR, 'original', origPages[i]);
        const signedPng = join(OUT_DIR, 'signed', signedPages[i]);
        const diffPng = join(OUT_DIR, 'diffs', `diff-${String(i + 1).padStart(2, '0')}.png`);
        const diffPixels = pixelDiff(origPng, signedPng, diffPng);
        results.push({ page: i + 1, diffPixels });
      }

      // Log summary table
      console.log(`\n=== VISUAL DIFF RESULTS (${origPages.length} pages) ===`);
      console.log(`Signature placed on page ${sigPageNum}`);
      console.log('Page | Diff Pixels | Status');
      console.log('-----|-------------|-------');

      const unexpectedDiffs: { page: number; pixels: number }[] = [];
      let sigPageDiffPixels = 0;

      for (const r of results) {
        const isSigPage = r.page === sigPageNum;
        const isNoise = r.diffPixels <= NOISE_THRESHOLD;
        let status: string;

        if (isSigPage) {
          sigPageDiffPixels = r.diffPixels;
          status = r.diffPixels >= MIN_SIG_DIFF
            ? '✅ signature visible'
            : `⚠️  signature may be too small (${r.diffPixels} px)`;
        } else if (isNoise) {
          status = r.diffPixels === 0 ? '✅ identical' : `✅ noise (≤${NOISE_THRESHOLD} px)`;
        } else {
          status = '❌ UNEXPECTED DIFF';
          unexpectedDiffs.push({ page: r.page, pixels: r.diffPixels });
        }

        console.log(`  ${String(r.page).padStart(2)}  | ${String(r.diffPixels).padStart(11)} | ${status}`);
      }

      console.log(`\nDiff images: ${OUT_DIR}/diffs/`);
      console.log(`Signed PDF:  ${signedPath}`);

      // Assertions
      expect(sigPageDiffPixels).toBeGreaterThanOrEqual(MIN_SIG_DIFF);
      expect(unexpectedDiffs).toEqual([]);
    }, 120000);
  }
);
