#!/usr/bin/env node
/**
 * Per-Element Regression Guard — runs element-level PPTX↔PDF diff
 * and reports per-slide severity, with exit code for CI.
 *
 * Usage:
 *   node scripts/per-element-regression.mjs [pptx-path] [pdf-path] [options]
 *
 * Options:
 *   --slide <n>            Slide index (0-based, default: all)
 *   --threshold <severity> Fail threshold: minor|major|critical (default: critical)
 *   --json                 Output raw JSON
 *   --verbose              Print per-element details
 *
 * Requires:
 *   - Playwright chromium (pnpm install)
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const args = process.argv.slice(2);

const opts = {
  slide: null,
  threshold: 'critical',
  json: false,
  verbose: false,
};

const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--slide') { opts.slide = parseInt(args[++i], 10); }
  else if (args[i] === '--threshold') { opts.threshold = args[++i]; }
  else if (args[i] === '--json') { opts.json = true; }
  else if (args[i] === '--verbose') { opts.verbose = true; }
  else { positional.push(args[i]); }
}

const pptxPath = path.resolve(
  positional[0] ?? path.join(projectRoot, '..', 'USG Briefing Mar 7 - UNCLAS.pptx')
);
const pdfPath = path.resolve(
  positional[1] ?? path.join(projectRoot, '..', 'USG Briefing Mar 7 - UNCLAS.pdf')
);

const SEVERITY_RANK = { match: 0, minor: 1, major: 2, critical: 3 };
const thresholdRank = SEVERITY_RANK[opts.threshold] ?? 3;

if (!fs.existsSync(pptxPath)) {
  console.error(`PPTX not found: ${pptxPath}`);
  process.exit(2);
}
if (!fs.existsSync(pdfPath)) {
  console.error(`PDF not found: ${pdfPath}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Step 1: Start Vite dev server for element-debug tool
// ---------------------------------------------------------------------------

console.log('=== Per-Element Regression Guard ===');
console.log(`PPTX: ${path.basename(pptxPath)}`);
console.log(`PDF:  ${path.basename(pdfPath)}`);
console.log(`Threshold: ${opts.threshold}`);
console.log('');
console.log('Starting Vite dev server...');

let viteProcess;
let viteUrl;

function startViteServer() {
  return new Promise((resolve, reject) => {
    viteProcess = spawn('npx', ['vite', '--port', '0'], {
      cwd: path.join(projectRoot, 'tools', 'element-debug'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let output = '';
    const timeout = setTimeout(() => {
      reject(new Error('Vite server did not start within 30s'));
    }, 30_000);

    viteProcess.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const match = output.match(/Local:\s+(http:\/\/localhost:\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });

    viteProcess.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });

    viteProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    viteProcess.on('exit', (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Vite exited with code ${code}: ${output}`));
      }
    });
  });
}

try {
  viteUrl = await startViteServer();
  console.log(`Vite running at ${viteUrl}`);
} catch (err) {
  console.error('Failed to start Vite dev server:', err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 2: Launch browser and run diffs via bridge functions
// ---------------------------------------------------------------------------

console.log('Launching headless Chromium...');

const browser = await chromium.launch();
const context = await browser.newContext({
  deviceScaleFactor: 2,
  viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();

// Collect console output for debugging
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    console.error(`  [browser] ${msg.text()}`);
  }
});

await page.goto(viteUrl, { waitUntil: 'networkidle' });

// Wait for the debug viewer module to initialize
console.log('Waiting for debug viewer to initialize...');
await page.waitForFunction(() => (window).__ciReady === true, { timeout: 30_000 });
console.log('Debug viewer ready.');

// Read files and convert to base64
const pptxBytes = fs.readFileSync(pptxPath);
const pdfBytes = fs.readFileSync(pdfPath);
const pptxB64 = pptxBytes.toString('base64');
const pdfB64 = pdfBytes.toString('base64');

// Load both files via CI bridge
console.log('Loading PPTX and PDF...');
await page.evaluate(async (b64) => {
  const arr = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  await (window).__ciLoad(arr.buffer);
}, pptxB64);
await page.evaluate(async (b64) => {
  const arr = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  await (window).__ciLoadPdf(arr.buffer);
}, pdfB64);

const info = await page.evaluate(() => (window).__ciGetSlideCount());
console.log(`PPTX: ${info.pptx} slides, PDF: ${info.pdf} pages`);
console.log('');

// Determine which slides to diff
const slidesToDiff = opts.slide !== null
  ? [opts.slide]
  : Array.from({ length: Math.min(info.pptx, info.pdf) }, (_, i) => i);

// Run diffs slide by slide
const results = [];

for (const slideIdx of slidesToDiff) {
  process.stdout.write(`  Slide ${slideIdx + 1}/${slidesToDiff.length}...`);

  try {
    const assessResult = await page.evaluate(async (idx) => {
      return await (window).__ciAssess(idx);
    }, slideIdx);
    const result = {
      slideIndex: assessResult.slideIndex,
      matched: assessResult.pptxVsPdf?.matched ?? [],
      unmatchedA: assessResult.pptxVsPdf?.unmatchedA ?? 0,
      unmatchedB: assessResult.pptxVsPdf?.unmatchedB ?? 0,
      summary: assessResult.pptxVsPdf ? {
        matchedCount: assessResult.pptxVsPdf.matchedCount,
        avgPositionDelta: assessResult.pptxVsPdf.avgPositionDelta,
        fontMismatches: assessResult.pptxVsPdf.fontMismatches,
        colorMismatches: assessResult.pptxVsPdf.colorMismatches,
      } : { matchedCount: 0, avgPositionDelta: 0, fontMismatches: 0, colorMismatches: 0 },
    };

    results.push(result);
    const worst = result.matched.reduce(
      (w, d) => (SEVERITY_RANK[d.overallSeverity] || 0) > (SEVERITY_RANK[w] || 0) ? d.overallSeverity : w,
      'match'
    );
    console.log(` ${result.summary.matchedCount} matched, ${result.unmatchedA}+${result.unmatchedB} unmatched, worst: ${worst}`);
  } catch (err) {
    console.log(` ERROR: ${err.message}`);
    results.push({ slideIndex: slideIdx, error: err.message });
  }
}

// Clean up
await browser.close();
if (viteProcess) viteProcess.kill('SIGTERM');

// ---------------------------------------------------------------------------
// Step 3: Report
// ---------------------------------------------------------------------------

console.log('');
console.log('Per-Element Regression Report');
console.log('='.repeat(70));
console.log(`File: ${path.basename(pptxPath)}`);
console.log(`Reference: ${path.basename(pdfPath)}`);
console.log('');

const header = 'Slide  Matched  Unmatch(PPTX)  Unmatch(PDF)  AvgPos    Worst';
console.log(header);
console.log('-'.repeat(header.length));

let totalMatched = 0;
let totalUnmatched = 0;
let failedSlides = 0;

for (const result of results) {
  if (result.error) {
    console.log(`  ${String((result.slideIndex ?? '?') + 1).padStart(3)}   ERROR: ${result.error}`);
    continue;
  }

  const s = result.summary;
  const worst = result.matched.reduce(
    (w, d) => (SEVERITY_RANK[d.overallSeverity] || 0) > (SEVERITY_RANK[w] || 0) ? d.overallSeverity : w,
    'match'
  );

  totalMatched += s.matchedCount;
  totalUnmatched += result.unmatchedA + result.unmatchedB;

  if (SEVERITY_RANK[worst] >= thresholdRank) failedSlides++;

  const line = [
    String(result.slideIndex + 1).padStart(5),
    String(s.matchedCount).padStart(9),
    String(result.unmatchedA).padStart(14),
    String(result.unmatchedB).padStart(13),
    `${s.avgPositionDelta.toFixed(1)}pt`.padStart(9),
    worst.padStart(10),
  ].join('');
  console.log(line);

  if (opts.verbose && result.matched.length > 0) {
    for (const diff of result.matched) {
      if (diff.overallSeverity === 'match') continue;
      const nonMatch = diff.deltas.filter(d => d.severity !== 'match');
      for (const d of nonMatch) {
        console.log(`         ${d.severity.padEnd(8)} ${d.property}: ${fmtVal(d.valueA)} -> ${fmtVal(d.valueB)}${d.delta !== undefined ? ` (d${d.delta.toFixed(2)})` : ''}`);
      }
    }
  }
}

console.log('');
console.log(`Summary: ${slidesToDiff.length} slides, ${totalMatched} matched, ${totalUnmatched} unmatched`);

if (failedSlides > 0) {
  console.log(`Result: FAIL (${failedSlides} slides with ${opts.threshold}+ severity)`);
  if (opts.json) console.log(JSON.stringify(results, null, 2));
  process.exit(1);
} else {
  console.log('Result: PASS');
  if (opts.json) console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

function fmtVal(v) {
  if (v === undefined) return 'undefined';
  if (typeof v === 'number') return v.toFixed(2);
  if (typeof v === 'object' && v !== null && 'r' in v) return `rgb(${v.r},${v.g},${v.b})`;
  return String(v).slice(0, 30);
}
