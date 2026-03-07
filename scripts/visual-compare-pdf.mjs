#!/usr/bin/env node
/**
 * PDF visual regression pipeline — render each PDF page with both PDF.js (reference)
 * and NativeRenderer (test), then compare using ImageMagick RMSE.
 *
 * Reference: PDF.js + node-canvas (the ground truth / high-fidelity renderer)
 * Test:      NativeRenderer (our custom Canvas2D renderer to evaluate)
 *
 * Usage:
 *   node scripts/visual-compare-pdf.mjs                    # Run all reference PDFs
 *   node scripts/visual-compare-pdf.mjs --update-baselines  # Update RMSE baselines
 *   node scripts/visual-compare-pdf.mjs --file <name>.pdf   # Single file
 *
 * Output:
 *   ../pptx-pdf-comparisons/pdf-comparison-output/
 *   ├── reference/    PDF.js rendered PNGs  (page-<file>-<N>.png)
 *   ├── rendered/     NativeRenderer PNGs
 *   ├── diffs/        ImageMagick diff images
 *   └── rmse-report.json
 *
 * Baselines:
 *   Stored inline in BASELINE_RMSE below.
 *   Run with --update-baselines to print new values after improvements.
 *
 * Requires:
 *   - ImageMagick 7 (magick compare)
 *   - pdf-signer devDependencies (pdfjs-dist, canvas) — pnpm install in pdf-signer
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const args = process.argv.slice(2);

const updateBaselines = args.includes('--update-baselines');
const fileFilter = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;

// Helper script — lives in the pdf-signer package so it can resolve pdfjs-dist + canvas
const helperScript = path.join(
  projectRoot,
  'packages',
  'pdf-signer',
  'scripts',
  'pdf-render-helper.ts',
);
const tsxBin = path.join(
  projectRoot,
  'packages',
  'pdf-signer',
  'node_modules',
  '.bin',
  'tsx',
);

// Output directory (parallel to pptx comparison outputs)
const comparisonDir = path.resolve(
  projectRoot,
  '..',
  'pptx-pdf-comparisons',
  'pdf-comparison-output',
);
const renderedDir = path.join(comparisonDir, 'rendered');
const referenceDir = path.join(comparisonDir, 'reference');
const diffsDir = path.join(comparisonDir, 'diffs');
const reportPath = path.join(comparisonDir, 'rmse-report.json');
const baselinesPath = path.join(comparisonDir, 'rmse-baselines.json');

// Regression threshold — page is "regressed" if RMSE exceeds baseline by more than this.
const REGRESSION_THRESHOLD = 0.015;

// ---------------------------------------------------------------------------
// Reference PDF corpus
// ---------------------------------------------------------------------------

// Curated set of PDFs from packages/pdf-signer/test-pdfs/.
// Covers: simple text, multi-page, images, presentations, signed docs, object-streams.
// Key: file stem used for naming PNGs. Value: relative path from pdf-signer package root.

const PDF_SIGNER_ROOT = path.join(projectRoot, 'packages', 'pdf-signer');

const REFERENCE_PDFS = [
  // --- Simple / baseline ---
  {
    id: 'wire-instructions',
    file: 'test-pdfs/working/wire-instructions.pdf',
    description: 'Simple 1-page text PDF (letter)',
    tags: ['simple', 'text', 'letter'],
  },
  {
    id: 'simple-test',
    file: 'test-pdfs/working/simple-test.pdf',
    description: 'Minimal test PDF (letter)',
    tags: ['minimal', 'text', 'letter'],
  },
  {
    id: 'test-document',
    file: 'test-pdfs/working/test-document.pdf',
    description: 'PDF with text and basic graphics (letter)',
    tags: ['text', 'graphics', 'letter'],
  },

  // --- Object streams / advanced structure ---
  {
    id: 'object-stream',
    file: 'test-pdfs/working/object-stream.pdf',
    description: 'PDF with object streams / xref streams (PDF 1.7)',
    tags: ['object-stream', 'xref-stream'],
  },

  // --- Real-world: Google Docs exports ---
  {
    id: 'simple-test-google-docs',
    file: 'test-pdfs/chrome-google-docs/simple-test-google-docs.pdf',
    description: 'Simple Google Docs export',
    tags: ['google-docs', 'text'],
  },
  {
    id: 'text-with-images-google-docs',
    file: 'test-pdfs/chrome-google-docs/text-with-images-google-docs.pdf',
    description: 'Multi-page Google Docs with text and inline images',
    tags: ['google-docs', 'multi-page', 'images'],
  },

  // --- Real-world: Chrome print / presentations ---
  {
    id: 'complex-with-images-chrome-print',
    file: 'test-pdfs/chrome-google-docs/complex-with-images-chrome-print.pdf',
    description: 'Complex Chrome print PDF with 552 objects and embedded images',
    tags: ['chrome', 'images', 'complex'],
  },
  {
    id: 'complex-presentation-google-docs',
    file: 'test-pdfs/chrome-google-docs/complex-presentation-google-docs.pdf',
    description: 'Large Google Slides export (35 pages, custom 720x405 size)',
    tags: ['presentation', 'multi-page', 'custom-size'],
    maxPages: 5, // Limit to first 5 pages for speed; full run takes ~2 min
  },

  // --- Signed documents ---
  {
    id: 'wire-instructions-signed',
    file: 'test-pdfs/working/wire-instructions-signed.pdf',
    description: 'Pre-signed version of wire-instructions (has signature widget)',
    tags: ['signed', 'signature-widget'],
  },
];

// ---------------------------------------------------------------------------
// Validate prerequisites
// ---------------------------------------------------------------------------

if (!fs.existsSync(helperScript)) {
  console.error(`Render helper not found: ${helperScript}`);
  console.error('Make sure packages/pdf-signer/scripts/pdf-render-helper.ts exists.');
  process.exit(1);
}

if (!fs.existsSync(tsxBin)) {
  console.error(`tsx not found: ${tsxBin}`);
  console.error('Run: pnpm --filter @opendockit/pdf-signer install');
  process.exit(1);
}

try {
  execSync('magick --version', { stdio: 'pipe' });
} catch {
  console.error('ImageMagick 7 (magick) not found. Install with: brew install imagemagick');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Filter PDFs
// ---------------------------------------------------------------------------

let pdfEntries = REFERENCE_PDFS.filter((entry) => {
  return fs.existsSync(path.join(PDF_SIGNER_ROOT, entry.file));
});

if (fileFilter) {
  const target = fileFilter.replace(/\.pdf$/, '');
  // Prefer exact ID match; fall back to substring match on file basename
  const exactMatch = pdfEntries.filter((e) => e.id === target);
  pdfEntries = exactMatch.length > 0
    ? exactMatch
    : pdfEntries.filter((e) => path.basename(e.file, '.pdf') === target);
  if (pdfEntries.length === 0) {
    console.error(`No PDF found matching: ${fileFilter}`);
    console.error(`Available IDs: ${REFERENCE_PDFS.map((e) => e.id).join(', ')}`);
    process.exit(1);
  }
}

console.log(`\n=== PDF Visual Regression Pipeline ===`);
console.log(`  ${pdfEntries.length} PDF(s) to process`);
console.log(`  Output: ${comparisonDir}`);
if (updateBaselines) console.log('  Mode: UPDATE BASELINES');
console.log('');

// ---------------------------------------------------------------------------
// Load / initialize baselines
// ---------------------------------------------------------------------------

let baselines = {};
if (fs.existsSync(baselinesPath)) {
  baselines = JSON.parse(fs.readFileSync(baselinesPath, 'utf-8'));
}
const isFirstRun = Object.keys(baselines).length === 0;
if (isFirstRun && !updateBaselines) {
  console.log('No baselines found — running in bootstrap mode (will save baselines).\n');
}

// ---------------------------------------------------------------------------
// Create output directories
// ---------------------------------------------------------------------------

fs.mkdirSync(renderedDir, { recursive: true });
fs.mkdirSync(referenceDir, { recursive: true });
fs.mkdirSync(diffsDir, { recursive: true });

// ---------------------------------------------------------------------------
// Helper: render one page using the tsx helper subprocess
// ---------------------------------------------------------------------------

function renderPage(pdfAbsPath, pageIndex, refOut, nativeOut) {
  const result = spawnSync(
    tsxBin,
    [helperScript, pdfAbsPath, String(pageIndex), refOut, nativeOut],
    {
      cwd: PDF_SIGNER_ROOT, // must run from pdf-signer to resolve node_modules
      encoding: 'utf-8',
      timeout: 120_000,
    },
  );

  if (result.error) {
    throw new Error(`Spawn error: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(`Render helper failed (exit ${result.status}): ${stderr}`);
  }

  // Parse REF:WxH and NATIVE:WxH from stdout
  const stdout = result.stdout || '';
  const refMatch = stdout.match(/REF:(\d+)x(\d+)/);
  const nativeMatch = stdout.match(/NATIVE:(\d+)x(\d+)/);

  return {
    refSize: refMatch ? { w: parseInt(refMatch[1]), h: parseInt(refMatch[2]) } : null,
    nativeSize: nativeMatch ? { w: parseInt(nativeMatch[1]), h: parseInt(nativeMatch[2]) } : null,
  };
}

// ---------------------------------------------------------------------------
// Helper: compute RMSE via ImageMagick
// ---------------------------------------------------------------------------

function computeRmse(renderedPath, referencePath, diffPath, targetSize) {
  // Resize reference to match rendered dimensions, then compare.
  // `magick compare` outputs RMSE to stderr: "12345.6 (0.1234)"
  const cmd =
    `magick compare -metric RMSE "${renderedPath}" ` +
    `\\( "${referencePath}" -resize ${targetSize}! \\) ` +
    `"${diffPath}" 2>&1 || true`;

  try {
    const output = execSync(cmd, { encoding: 'utf-8' }).trim();
    const match = output.match(/\(([0-9.]+)\)/);
    return match ? parseFloat(match[1]) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main processing loop
// ---------------------------------------------------------------------------

const allResults = [];
let totalPagesRendered = 0;

for (const entry of pdfEntries) {
  const pdfAbsPath = path.join(PDF_SIGNER_ROOT, entry.file);
  const maxPages = entry.maxPages ?? Infinity;

  console.log(`--- ${entry.id} ---`);
  console.log(`  ${entry.description}`);

  // Determine page count via PDF.js (using the helper script's output)
  // We'll render page 0 first to get dimensions, then iterate.

  // Gather page results for this file
  const fileResults = [];

  // We'll discover page count by attempting renders until we get an out-of-range error.
  // Start with page 0 and keep going.
  let pageIndex = 0;
  let consecutiveErrors = 0;

  while (pageIndex < maxPages) {
    const pageLabel = String(pageIndex + 1).padStart(2, '0');
    const fileId = entry.id;
    const refOut = path.join(referenceDir, `${fileId}-page${pageLabel}.png`);
    const nativeOut = path.join(renderedDir, `${fileId}-page${pageLabel}.png`);
    const diffOut = path.join(diffsDir, `${fileId}-page${pageLabel}.png`);

    let refSize = null;

    try {
      const sizes = renderPage(pdfAbsPath, pageIndex, refOut, nativeOut);
      refSize = sizes.refSize;
      consecutiveErrors = 0;
    } catch (err) {
      const msg = err.message || '';
      // Out-of-range means we've exceeded the page count — stop
      if (msg.includes('out of range') || msg.includes('out of bounds')) {
        break;
      }
      // Other render errors — record and continue to next page
      console.log(`  Page ${pageIndex + 1}: ERROR — ${msg.split('\n')[0]}`);
      fileResults.push({ pageIndex, pageNum: pageIndex + 1, rmse: null, error: msg });
      consecutiveErrors++;
      if (consecutiveErrors >= 3) {
        console.log(`  Stopping after 3 consecutive errors.`);
        break;
      }
      pageIndex++;
      continue;
    }

    // Run RMSE comparison
    let rmse = null;
    if (fs.existsSync(refOut) && fs.existsSync(nativeOut) && refSize) {
      const targetSize = `${refSize.w}x${refSize.h}`;
      rmse = computeRmse(nativeOut, refOut, diffOut, targetSize);
    }

    fileResults.push({ pageIndex, pageNum: pageIndex + 1, rmse });
    totalPagesRendered++;

    if (rmse !== null) {
      process.stdout.write(`  Page ${pageLabel}: RMSE=${rmse.toFixed(4)}\r`);
    }

    pageIndex++;
  }

  console.log(`\n  Rendered ${fileResults.filter((r) => !r.error).length} page(s).`);

  allResults.push({
    id: entry.id,
    file: entry.file,
    description: entry.description,
    pages: fileResults,
  });
}

console.log(`\nTotal pages rendered: ${totalPagesRendered}`);

// ---------------------------------------------------------------------------
// Compute baselines or compare against them
// ---------------------------------------------------------------------------

// Build per-file RMSE maps: { [fileId]: { [pageNum]: rmse } }
const currentRmse = {};
for (const fileResult of allResults) {
  const pages = {};
  for (const page of fileResult.pages) {
    if (page.rmse !== null) {
      pages[page.pageNum] = page.rmse;
    }
  }
  currentRmse[fileResult.id] = pages;
}

if (isFirstRun || updateBaselines) {
  // Save baselines
  baselines = currentRmse;
  fs.writeFileSync(baselinesPath, JSON.stringify(baselines, null, 2) + '\n');
  console.log(`\nBaselines saved to: ${baselinesPath}`);

  // Write report
  const report = {
    timestamp: new Date().toISOString(),
    mode: 'baseline',
    totalPages: totalPagesRendered,
    files: allResults,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`Report saved to: ${reportPath}`);
  console.log('\nBASELINE: First run complete. Run again to detect regressions.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Compare against saved baselines
// ---------------------------------------------------------------------------

console.log('\n=== RMSE Report (sorted by RMSE, worst first) ===\n');

let improved = 0;
let regressed = 0;
let unchanged = 0;
let newPages = 0;
const regressedDetails = [];

// Flatten all page results for sorting
const allPageResults = [];
for (const fileResult of allResults) {
  const fileBaselines = baselines[fileResult.id] ?? {};
  for (const page of fileResult.pages) {
    if (page.rmse === null) continue;
    const baseline = fileBaselines[page.pageNum] ?? null;
    const delta = baseline !== null ? page.rmse - baseline : null;
    allPageResults.push({
      id: fileResult.id,
      pageNum: page.pageNum,
      rmse: page.rmse,
      baseline,
      delta,
    });
  }
}

// Sort by RMSE descending (worst first)
allPageResults.sort((a, b) => b.rmse - a.rmse);

console.log('  File/Page                      |  RMSE   | Baseline |  Delta  | Status');
console.log('  -------------------------------|---------|----------|---------|--------');

for (const r of allPageResults) {
  const label = `${r.id}/p${String(r.pageNum).padStart(2, '0')}`;
  const labelStr = label.padEnd(30).slice(0, 30);
  const rmseStr = r.rmse.toFixed(4).padStart(7);
  const baseStr = r.baseline !== null ? r.baseline.toFixed(4).padStart(8) : '     N/A';

  let deltaStr, status;

  if (r.delta !== null) {
    const absDelta = Math.abs(r.delta);
    if (r.delta > REGRESSION_THRESHOLD) {
      deltaStr = ` +${absDelta.toFixed(4)}`;
      status = '  WORSE';
      regressed++;
      regressedDetails.push(`${r.id}/page${r.pageNum} (+${r.delta.toFixed(4)})`);
    } else if (r.delta < -0.005) {
      deltaStr = ` -${absDelta.toFixed(4)}`;
      status = '  BETTER';
      improved++;
    } else {
      deltaStr = '   ~0   ';
      status = '  =';
      unchanged++;
    }
  } else {
    deltaStr = '     N/A';
    status = '  NEW';
    newPages++;
  }

  console.log(`  ${labelStr} | ${rmseStr} | ${baseStr} | ${deltaStr} | ${status}`);
}

console.log(`\n  Summary: ${improved} improved, ${regressed} regressed, ${unchanged} unchanged, ${newPages} new`);

// Top 10 worst
if (allPageResults.length > 0) {
  console.log('\n=== Top 10 Worst Pages ===\n');
  for (const r of allPageResults.slice(0, Math.min(10, allPageResults.length))) {
    const diffFile = path.join(diffsDir, `${r.id}-page${String(r.pageNum).padStart(2, '0')}.png`);
    console.log(`  ${r.id}/page${r.pageNum}: RMSE=${r.rmse.toFixed(4)}  diff: ${diffFile}`);
  }
}

// ---------------------------------------------------------------------------
// Write JSON report
// ---------------------------------------------------------------------------

const reportData = {
  timestamp: new Date().toISOString(),
  mode: updateBaselines ? 'baseline' : 'compare',
  totalPages: totalPagesRendered,
  regressionThreshold: REGRESSION_THRESHOLD,
  summary: { improved, regressed, unchanged, newPages },
  files: allResults.map((fr) => {
    const fileBaselines = baselines[fr.id] ?? {};
    return {
      id: fr.id,
      file: fr.file,
      description: fr.description,
      pages: fr.pages.map((p) => {
        const baseline = fileBaselines[p.pageNum] ?? null;
        return {
          pageNum: p.pageNum,
          rmse: p.rmse,
          baseline,
          delta: p.rmse !== null && baseline !== null ? p.rmse - baseline : null,
        };
      }),
    };
  }),
};

fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2) + '\n');
console.log(`\nJSON report: ${reportPath}`);

// ---------------------------------------------------------------------------
// Update baselines output (print new values)
// ---------------------------------------------------------------------------

if (updateBaselines) {
  console.log('\n=== New baseline values ===\n');
  for (const fileResult of allResults) {
    console.log(`  ${fileResult.id}:`);
    for (const page of fileResult.pages) {
      if (page.rmse !== null) {
        console.log(`    page ${page.pageNum}: ${page.rmse.toFixed(4)}`);
      }
    }
  }
  console.log('\nBaselines saved to:', baselinesPath);
}

// ---------------------------------------------------------------------------
// Exit
// ---------------------------------------------------------------------------

if (regressed > 0) {
  console.error(
    `\nFAIL: ${regressed} page(s) regressed beyond threshold (${REGRESSION_THRESHOLD}):\n` +
    regressedDetails.map((d) => `  - ${d}`).join('\n'),
  );
  process.exit(1);
}

console.log('\nPASS: No visual regressions detected.');
