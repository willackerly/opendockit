#!/usr/bin/env node
/**
 * Visual Assessment Test — comprehensive three-axis comparison:
 *
 *   1. PPTX render vs Reference PNG  (pixel RMSE)
 *   2. PDF render  vs Reference PNG  (pixel RMSE)
 *   3. PPTX       vs PDF             (element-level property diffs)
 *
 * The reference PNGs (exported from PowerPoint) serve as ground truth.
 *
 * Usage:
 *   node scripts/visual-assessment.mjs <test-data-dir> [options]
 *
 *   <test-data-dir> must contain:
 *     - A .pptx file
 *     - A .pdf file
 *     - A folder of numbered PNGs (Slide1.png, Slide2.png, ...)
 *
 * Options:
 *   --slide <n>              Only assess slide N (1-based)
 *   --rmse-threshold <val>   RMSE fail threshold (default: 0.08)
 *   --severity-threshold <s> Element diff fail threshold: minor|major|critical (default: critical)
 *   --json                   Output JSON report to stdout
 *   --json-file <path>       Write JSON report to file
 *   --verbose                Print per-element details
 *   --no-pdf                 Skip PDF (PPTX vs PNG only)
 *   --no-pptx                Skip PPTX (PDF vs PNG only)
 *
 * Exit codes:
 *   0 = PASS (all within thresholds)
 *   1 = FAIL (threshold exceeded)
 *   2 = Error (missing files, crash, etc.)
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const args = process.argv.slice(2);

const opts = {
  slide: null,
  rmseThreshold: 0.08,
  severityThreshold: 'critical',
  json: false,
  jsonFile: null,
  verbose: false,
  noPdf: false,
  noPptx: false,
};

let testDataDir = null;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--slide': opts.slide = parseInt(args[++i], 10); break;
    case '--rmse-threshold': opts.rmseThreshold = parseFloat(args[++i]); break;
    case '--severity-threshold': opts.severityThreshold = args[++i]; break;
    case '--json': opts.json = true; break;
    case '--json-file': opts.jsonFile = args[++i]; break;
    case '--verbose': opts.verbose = true; break;
    case '--no-pdf': opts.noPdf = true; break;
    case '--no-pptx': opts.noPptx = true; break;
    default:
      if (!args[i].startsWith('--')) testDataDir = path.resolve(args[i]);
      else { console.error(`Unknown option: ${args[i]}`); process.exit(2); }
  }
}

if (!testDataDir) {
  // Try default location
  testDataDir = path.resolve(projectRoot, '..', 'USG Briefing');
  if (!fs.existsSync(testDataDir)) {
    console.error('Usage: node scripts/visual-assessment.mjs <test-data-dir> [options]');
    console.error('');
    console.error('Test data directory must contain a .pptx, .pdf, and folder of numbered PNGs.');
    process.exit(2);
  }
}

if (!fs.existsSync(testDataDir)) {
  console.error(`Test data directory not found: ${testDataDir}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Discover files in test data directory
// ---------------------------------------------------------------------------

const dirEntries = fs.readdirSync(testDataDir);

const pptxFile = dirEntries.find(f => f.endsWith('.pptx'));
const pdfFile = dirEntries.find(f => f.endsWith('.pdf'));

// Find PNG directory (folder containing numbered PNGs)
let pngDir = null;
for (const entry of dirEntries) {
  const full = path.join(testDataDir, entry);
  if (fs.statSync(full).isDirectory()) {
    const contents = fs.readdirSync(full);
    if (contents.some(f => /\d+\.png$/i.test(f))) {
      pngDir = full;
      break;
    }
  }
}

// Also check for PNGs directly in the test data dir
if (!pngDir) {
  const pngsInRoot = dirEntries.filter(f => /\d+\.png$/i.test(f));
  if (pngsInRoot.length > 0) pngDir = testDataDir;
}

const pptxPath = pptxFile ? path.join(testDataDir, pptxFile) : null;
const pdfPath = pdfFile ? path.join(testDataDir, pdfFile) : null;

if (!pptxPath && !opts.noPptx) {
  console.error(`No .pptx file found in ${testDataDir}`);
  process.exit(2);
}
if (!pdfPath && !opts.noPdf) {
  console.error(`No .pdf file found in ${testDataDir}`);
  process.exit(2);
}
if (!pngDir) {
  console.error(`No PNG reference directory found in ${testDataDir}`);
  process.exit(2);
}

// Sort PNGs by slide number
const pngFiles = fs.readdirSync(pngDir)
  .filter(f => /\.png$/i.test(f))
  .sort((a, b) => {
    const na = parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
    const nb = parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
    return na - nb;
  })
  .map(f => path.join(pngDir, f));

if (pngFiles.length === 0) {
  console.error(`No PNG files found in ${pngDir}`);
  process.exit(2);
}

const SEVERITY_RANK = { match: 0, minor: 1, major: 2, critical: 3 };
const thresholdRank = SEVERITY_RANK[opts.severityThreshold] ?? 3;

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

console.log('');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║              Visual Assessment Test                         ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`  Test data:   ${path.basename(testDataDir)}`);
if (pptxPath && !opts.noPptx) console.log(`  PPTX:        ${path.basename(pptxPath)}`);
if (pdfPath && !opts.noPdf)   console.log(`  PDF:         ${path.basename(pdfPath)}`);
console.log(`  Reference:   ${pngFiles.length} PNGs from ${path.basename(pngDir)}`);
console.log(`  RMSE thresh: ${opts.rmseThreshold}`);
console.log(`  Sev thresh:  ${opts.severityThreshold}`);
if (opts.slide) console.log(`  Slide:       ${opts.slide}`);
console.log('');

// ---------------------------------------------------------------------------
// Step 1: Start Vite dev server
// ---------------------------------------------------------------------------

console.log('[1/5] Starting Vite dev server...');

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
  console.log(`  Vite running at ${viteUrl}`);
} catch (err) {
  console.error('  Failed to start Vite:', err.message);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Step 2: Launch browser
// ---------------------------------------------------------------------------

console.log('[2/5] Launching headless Chromium...');

const browser = await chromium.launch();
const context = await browser.newContext({
  deviceScaleFactor: 2,
  viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') {
    console.error(`  [browser] ${msg.text()}`);
  }
});

page.on('pageerror', (err) => {
  console.error(`  [browser error] ${err.message}`);
});

await page.goto(viteUrl, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ciReady === true, { timeout: 30_000 });
console.log('  Debug viewer ready.');

// ---------------------------------------------------------------------------
// Step 3: Load files
// ---------------------------------------------------------------------------

console.log('[3/5] Loading files into browser...');

// Load PPTX
if (pptxPath && !opts.noPptx) {
  const pptxBytes = fs.readFileSync(pptxPath);
  const pptxB64 = pptxBytes.toString('base64');
  await page.evaluate(async (b64) => {
    const arr = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    await window.__ciLoad(arr.buffer);
  }, pptxB64);
  console.log(`  PPTX loaded.`);
}

// Load PDF
if (pdfPath && !opts.noPdf) {
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfB64 = pdfBytes.toString('base64');
  await page.evaluate(async (b64) => {
    const arr = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    await window.__ciLoadPdf(arr.buffer);
  }, pdfB64);
  console.log(`  PDF loaded.`);
}

// Load reference PNGs
console.log(`  Loading ${pngFiles.length} reference PNGs...`);
for (let i = 0; i < pngFiles.length; i++) {
  const pngBytes = fs.readFileSync(pngFiles[i]);
  const pngB64 = pngBytes.toString('base64');
  await page.evaluate(async (b64) => {
    await window.__ciLoadRefPng(b64);
  }, pngB64);
  if ((i + 1) % 10 === 0 || i === pngFiles.length - 1) {
    process.stdout.write(`\r  Loaded ${i + 1}/${pngFiles.length} PNGs`);
  }
}
console.log('');

// Get counts
const counts = await page.evaluate(() => window.__ciGetSlideCount());
console.log(`  Counts: PPTX=${counts.pptx} slides, PDF=${counts.pdf} pages, REF=${counts.ref} PNGs`);

// ---------------------------------------------------------------------------
// Step 4: Run per-slide assessment
// ---------------------------------------------------------------------------

const totalSlides = Math.max(counts.pptx, counts.pdf, counts.ref);
const slidesToAssess = opts.slide !== null
  ? [opts.slide - 1]  // Convert 1-based to 0-based
  : Array.from({ length: totalSlides }, (_, i) => i);

console.log(`[4/5] Assessing ${slidesToAssess.length} slides...`);
console.log('');

const results = [];

for (const idx of slidesToAssess) {
  process.stdout.write(`  Slide ${idx + 1}/${totalSlides}...`);

  try {
    const result = await page.evaluate(async (i) => {
      return await window.__ciAssess(i);
    }, idx);
    results.push(result);

    // Quick summary line
    const parts = [];
    if (result.pptxVsRef) parts.push(`PPTX-RMSE:${result.pptxVsRef.rmse.toFixed(4)}`);
    if (result.pdfVsRef) parts.push(`PDF-RMSE:${result.pdfVsRef.rmse.toFixed(4)}`);
    if (result.pptxVsPdf) parts.push(`${result.pptxVsPdf.matchedCount}m/${result.pptxVsPdf.unmatchedA}+${result.pptxVsPdf.unmatchedB}u worst:${result.pptxVsPdf.worstSeverity}`);
    console.log(` ${parts.join('  ')}`);

    // Verbose: per-element details
    if (opts.verbose && result.pptxVsPdf) {
      for (const diff of result.pptxVsPdf.matched) {
        if (diff.overallSeverity === 'match') continue;
        const nonMatch = diff.deltas.filter(d => d.severity !== 'match');
        for (const d of nonMatch) {
          console.log(`           ${d.severity.padEnd(8)} ${d.property}: ${fmtVal(d.valueA)} → ${fmtVal(d.valueB)}${d.delta !== undefined ? ` (Δ${d.delta.toFixed(2)})` : ''}`);
        }
      }
    }
  } catch (err) {
    console.log(` ERROR: ${err.message}`);
    results.push({ slideIndex: idx, error: err.message });
  }
}

// Clean up browser + Vite
await browser.close();
if (viteProcess) viteProcess.kill('SIGTERM');

// ---------------------------------------------------------------------------
// Step 5: Generate report
// ---------------------------------------------------------------------------

console.log('');
console.log('[5/5] Assessment Report');
console.log('═'.repeat(78));

// ── Table 1: PPTX vs Reference PNG ──
const pptxRmseResults = results.filter(r => r.pptxVsRef && !r.error);
if (pptxRmseResults.length > 0) {
  console.log('');
  console.log('┌─ PPTX Render vs Reference PNG (Pixel RMSE) ─────────────────────────┐');
  console.log('│  Slide    RMSE     Status                                            │');
  console.log('│  ─────    ─────    ──────                                            │');

  let pptxPassCount = 0;
  let pptxTotalRmse = 0;
  let pptxWorstRmse = 0;
  let pptxWorstSlide = 0;

  for (const r of pptxRmseResults) {
    const rmse = r.pptxVsRef.rmse;
    const pass = rmse <= opts.rmseThreshold;
    if (pass) pptxPassCount++;
    pptxTotalRmse += rmse;
    if (rmse > pptxWorstRmse) { pptxWorstRmse = rmse; pptxWorstSlide = r.slideIndex + 1; }

    const status = pass ? '  PASS' : '  FAIL';
    const bar = rmseBar(rmse, opts.rmseThreshold);
    console.log(`│  ${String(r.slideIndex + 1).padStart(5)}    ${rmse.toFixed(4).padStart(6)}   ${status}  ${bar}`.padEnd(77) + '│');
  }

  const avgRmse = pptxTotalRmse / pptxRmseResults.length;
  console.log('│' + ' '.repeat(76) + '│');
  console.log(`│  Avg: ${avgRmse.toFixed(4)}  Worst: ${pptxWorstRmse.toFixed(4)} (Slide ${pptxWorstSlide})  Pass: ${pptxPassCount}/${pptxRmseResults.length}`.padEnd(77) + '│');
  console.log('└' + '─'.repeat(76) + '┘');
}

// ── Table 2: PDF vs Reference PNG ──
const pdfRmseResults = results.filter(r => r.pdfVsRef && !r.error);
if (pdfRmseResults.length > 0) {
  console.log('');
  console.log('┌─ PDF Render vs Reference PNG (Pixel RMSE) ──────────────────────────┐');
  console.log('│  Slide    RMSE     Status                                            │');
  console.log('│  ─────    ─────    ──────                                            │');

  let pdfPassCount = 0;
  let pdfTotalRmse = 0;
  let pdfWorstRmse = 0;
  let pdfWorstSlide = 0;

  for (const r of pdfRmseResults) {
    const rmse = r.pdfVsRef.rmse;
    const pass = rmse <= opts.rmseThreshold;
    if (pass) pdfPassCount++;
    pdfTotalRmse += rmse;
    if (rmse > pdfWorstRmse) { pdfWorstRmse = rmse; pdfWorstSlide = r.slideIndex + 1; }

    const status = pass ? '  PASS' : '  FAIL';
    const bar = rmseBar(rmse, opts.rmseThreshold);
    console.log(`│  ${String(r.slideIndex + 1).padStart(5)}    ${rmse.toFixed(4).padStart(6)}   ${status}  ${bar}`.padEnd(77) + '│');
  }

  const avgRmse = pdfTotalRmse / pdfRmseResults.length;
  console.log('│' + ' '.repeat(76) + '│');
  console.log(`│  Avg: ${avgRmse.toFixed(4)}  Worst: ${pdfWorstRmse.toFixed(4)} (Slide ${pdfWorstSlide})  Pass: ${pdfPassCount}/${pdfRmseResults.length}`.padEnd(77) + '│');
  console.log('└' + '─'.repeat(76) + '┘');
}

// ── Table 3: PPTX vs PDF Element Diffs ──
const elementResults = results.filter(r => r.pptxVsPdf && !r.error);
if (elementResults.length > 0) {
  console.log('');
  console.log('┌─ PPTX vs PDF Element-Level Diffs ───────────────────────────────────┐');
  console.log('│  Slide  Matched  Unmatched  AvgPos  Fonts  Colors  Worst            │');
  console.log('│  ─────  ───────  ─────────  ──────  ─────  ──────  ─────            │');

  let totalMatched = 0, totalUnmatched = 0, totalFont = 0, totalColor = 0;
  let elemFailCount = 0;

  for (const r of elementResults) {
    const e = r.pptxVsPdf;
    totalMatched += e.matchedCount;
    totalUnmatched += e.unmatchedA + e.unmatchedB;
    totalFont += e.fontMismatches;
    totalColor += e.colorMismatches;

    const sevFail = (SEVERITY_RANK[e.worstSeverity] ?? 0) >= thresholdRank;
    if (sevFail) elemFailCount++;

    console.log(`│  ${String(r.slideIndex + 1).padStart(5)}  ${String(e.matchedCount).padStart(7)}  ${String(e.unmatchedA + e.unmatchedB).padStart(9)}  ${(e.avgPositionDelta.toFixed(1) + 'pt').padStart(6)}  ${String(e.fontMismatches).padStart(5)}  ${String(e.colorMismatches).padStart(6)}  ${e.worstSeverity.padEnd(8)}`.padEnd(77) + '│');
  }

  console.log('│' + ' '.repeat(76) + '│');
  console.log(`│  Total: ${totalMatched} matched, ${totalUnmatched} unmatched, ${totalFont} font, ${totalColor} color  Fail: ${elemFailCount}/${elementResults.length}`.padEnd(77) + '│');
  console.log('└' + '─'.repeat(76) + '┘');
}

// ── Final verdict ──
console.log('');

let failed = false;
const failReasons = [];

// Check PPTX RMSE failures
const pptxFails = pptxRmseResults.filter(r => r.pptxVsRef.rmse > opts.rmseThreshold);
if (pptxFails.length > 0) {
  failed = true;
  failReasons.push(`${pptxFails.length} slides exceed PPTX RMSE threshold (${opts.rmseThreshold})`);
}

// Check PDF RMSE failures
const pdfFails = pdfRmseResults.filter(r => r.pdfVsRef.rmse > opts.rmseThreshold);
if (pdfFails.length > 0) {
  failed = true;
  failReasons.push(`${pdfFails.length} slides exceed PDF RMSE threshold (${opts.rmseThreshold})`);
}

// Check element severity failures
const elemFails = elementResults.filter(r => (SEVERITY_RANK[r.pptxVsPdf.worstSeverity] ?? 0) >= thresholdRank);
if (elemFails.length > 0) {
  failed = true;
  failReasons.push(`${elemFails.length} slides have ${opts.severityThreshold}+ element severity`);
}

// Check errors
const errors = results.filter(r => r.error);
if (errors.length > 0) {
  failed = true;
  failReasons.push(`${errors.length} slides errored`);
}

if (failed) {
  console.log('RESULT: ❌ FAIL');
  for (const reason of failReasons) {
    console.log(`  - ${reason}`);
  }
} else {
  console.log('RESULT: ✅ PASS');
  console.log(`  All ${slidesToAssess.length} slides within thresholds.`);
}

// ── JSON output ──
const jsonReport = {
  testDataDir: path.basename(testDataDir),
  pptxFile: pptxFile ?? null,
  pdfFile: pdfFile ?? null,
  refCount: pngFiles.length,
  thresholds: {
    rmse: opts.rmseThreshold,
    severity: opts.severityThreshold,
  },
  passed: !failed,
  failReasons,
  slides: results,
  summary: {
    pptxVsRef: pptxRmseResults.length > 0 ? {
      avgRmse: pptxRmseResults.reduce((s, r) => s + r.pptxVsRef.rmse, 0) / pptxRmseResults.length,
      worstRmse: Math.max(...pptxRmseResults.map(r => r.pptxVsRef.rmse)),
      passCount: pptxRmseResults.filter(r => r.pptxVsRef.rmse <= opts.rmseThreshold).length,
      totalCount: pptxRmseResults.length,
    } : null,
    pdfVsRef: pdfRmseResults.length > 0 ? {
      avgRmse: pdfRmseResults.reduce((s, r) => s + r.pdfVsRef.rmse, 0) / pdfRmseResults.length,
      worstRmse: Math.max(...pdfRmseResults.map(r => r.pdfVsRef.rmse)),
      passCount: pdfRmseResults.filter(r => r.pdfVsRef.rmse <= opts.rmseThreshold).length,
      totalCount: pdfRmseResults.length,
    } : null,
    pptxVsPdf: elementResults.length > 0 ? {
      totalMatched: elementResults.reduce((s, r) => s + r.pptxVsPdf.matchedCount, 0),
      totalUnmatched: elementResults.reduce((s, r) => s + r.pptxVsPdf.unmatchedA + r.pptxVsPdf.unmatchedB, 0),
      totalFontMismatches: elementResults.reduce((s, r) => s + r.pptxVsPdf.fontMismatches, 0),
      totalColorMismatches: elementResults.reduce((s, r) => s + r.pptxVsPdf.colorMismatches, 0),
      failCount: elemFails.length,
      totalCount: elementResults.length,
    } : null,
  },
};

if (opts.json) {
  console.log('');
  console.log(JSON.stringify(jsonReport, null, 2));
}

if (opts.jsonFile) {
  fs.writeFileSync(opts.jsonFile, JSON.stringify(jsonReport, null, 2));
  console.log(`  JSON report written to ${opts.jsonFile}`);
}

console.log('');
process.exit(failed ? 1 : 0);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtVal(v) {
  if (v === undefined) return 'undefined';
  if (typeof v === 'number') return v.toFixed(2);
  if (typeof v === 'object' && v !== null && 'r' in v) return `rgb(${v.r},${v.g},${v.b})`;
  return String(v).slice(0, 30);
}

function rmseBar(rmse, threshold) {
  const maxWidth = 20;
  const filled = Math.min(maxWidth, Math.round((rmse / Math.max(threshold * 2, 0.2)) * maxWidth));
  const bar = '█'.repeat(filled) + '░'.repeat(maxWidth - filled);
  return rmse <= threshold * 0.5 ? `\x1b[32m${bar}\x1b[0m` :
         rmse <= threshold       ? `\x1b[33m${bar}\x1b[0m` :
                                   `\x1b[31m${bar}\x1b[0m`;
}
