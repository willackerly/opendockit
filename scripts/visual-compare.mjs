#!/usr/bin/env node
/**
 * Visual regression pipeline — re-render PPTX slides via dev viewer,
 * compare against PDF reference PNGs using ImageMagick RMSE.
 *
 * Usage:
 *   node scripts/visual-compare.mjs [pptx-path] [comparison-dir]
 *
 * Defaults:
 *   pptx-path:      ../pptx-pdf-comparisons/IC CISO Visit to Virtru.pptx
 *   comparison-dir:  ../pptx-pdf-comparisons/comparison-output
 *
 * Requires:
 *   - Playwright chromium (pnpm install)
 *   - ImageMagick 7 (magick compare)
 */

import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const args = process.argv.slice(2);

const pptxPath = path.resolve(
  args[0] ?? path.join(projectRoot, '..', 'pptx-pdf-comparisons', 'IC CISO Visit to Virtru.pptx')
);
const comparisonDir = path.resolve(
  args[1] ?? path.join(projectRoot, '..', 'pptx-pdf-comparisons', 'comparison-output')
);

const renderedDir = path.join(comparisonDir, 'rendered');
const referenceDir = path.join(comparisonDir, 'reference');
const diffsDir = path.join(comparisonDir, 'diffs');

if (!fs.existsSync(pptxPath)) {
  console.error(`PPTX not found: ${pptxPath}`);
  process.exit(1);
}

if (!fs.existsSync(referenceDir)) {
  console.error(`Reference directory not found: ${referenceDir}`);
  process.exit(1);
}

fs.mkdirSync(renderedDir, { recursive: true });
fs.mkdirSync(diffsDir, { recursive: true });

// Baseline RMSE values (2x DPI render + 192 DPI reference, 2026-02-24)
// Updated 2026-02-23: table cell margins/alignment fix (slides 11, 16)
// Both reference and rendered at 1920x1080 — no interpolation artifacts.
const BASELINE_RMSE = {
  1: 0.0464,
  2: 0.0729,
  3: 0.0338,
  4: 0.0906,
  5: 0.1663,
  6: 0.0387,
  7: 0.0664,
  8: 0.1050,
  9: 0.1629,
  10: 0.0297,
  11: 0.1420,
  12: 0.1710,
  13: 0.1436,
  14: 0.0610,
  15: 0.1582,
  16: 0.0800,
  17: 0.1060,
  18: 0.0923,
  19: 0.1281,
  20: 0.0451,
  21: 0.1391,
  22: 0.1268,
  23: 0.1347,
  24: 0.0454,
  25: 0.1429,
  26: 0.0544,
  27: 0.0524,
  28: 0.0487,
  29: 0.1528,
  30: 0.0497,
  31: 0.1318,
  32: 0.0454,
  33: 0.0312,
  34: 0.1642,
  35: 0.1853,
  36: 0.0320,
  37: 0.0306,
  38: 0.1389,
  39: 0.1432,
  40: 0.1274,
  41: 0.1298,
  42: 0.1418,
  43: 0.1536,
  44: 0.1253,
  45: 0.1480,
  46: 0.1372,
  47: 0.1210,
  48: 0.1390,
  49: 0.1323,
  50: 0.1553,
  51: 0.1636,
  52: 0.0546,
  53: 0.0970,
  54: 0.1857,
};

// Regression threshold — a slide is considered "regressed" if RMSE exceeds
// baseline by more than this amount. Small drifts (< threshold) are noise.
const REGRESSION_THRESHOLD = 0.008;

// ---------------------------------------------------------------------------
// Step 1: Start Vite dev server
// ---------------------------------------------------------------------------

console.log('=== Step 1: Starting Vite dev server ===');

let viteProcess;
let viteUrl;

function startViteServer() {
  return new Promise((resolve, reject) => {
    viteProcess = spawn('npx', ['vite', '--port', '0'], {
      cwd: path.join(projectRoot, 'tools', 'viewer'),
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
  console.error('Failed to start Vite dev server:', err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 2: Render PPTX slides via Playwright
// ---------------------------------------------------------------------------

console.log('\n=== Step 2: Rendering PPTX slides via headless Chromium ===');

const browser = await chromium.launch();
const context = await browser.newContext({
  // Render at 2x DPI — matches Retina displays and produces smooth antialiased
  // text. Without this, headless Chromium defaults to 1x (960x540 canvas),
  // which looks blocky compared to the PDF reference.
  deviceScaleFactor: 2,
  viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();

await page.goto(viteUrl, { waitUntil: 'networkidle' });

// Load bundled WOFF2 fonts — the exact same fonts SlideKit uses in production.
// This eliminates measurement-vs-rendering drift from Google Fonts CDN differences.
console.log('  Loading bundled WOFF2 fonts...');

const VARIANT_DESCRIPTORS = {
  regular: {},
  bold: { weight: 'bold' },
  italic: { style: 'italic' },
  boldItalic: { weight: 'bold', style: 'italic' },
};

// Import the manifest from built core package
const manifestPath = pathToFileURL(
  path.join(projectRoot, 'packages/core/dist/font/data/woff2/manifest.js')
).href;
const { BUNDLED_FONTS } = await import(manifestPath);

// Deduplicate module paths — multiple entries may share the same module
// (e.g., "carlito" and "calibri" both point to ./carlito.js)
const moduleCache = new Map();
const woff2Dir = path.join(projectRoot, 'packages/core/dist/font/data/woff2');

// Build font registration data: { registerAs, variants: { name, b64, descriptors }[] }[]
const fontEntries = [];
for (const [, entry] of Object.entries(BUNDLED_FONTS)) {
  const modulePath = path.resolve(woff2Dir, entry.module);
  const moduleUrl = pathToFileURL(modulePath).href;

  let mod = moduleCache.get(moduleUrl);
  if (!mod) {
    mod = await import(moduleUrl);
    moduleCache.set(moduleUrl, mod);
  }

  const variants = [];
  for (const variant of entry.variants) {
    const b64 = mod[variant];
    if (!b64) continue;
    const descriptors = VARIANT_DESCRIPTORS[variant] ?? {};
    variants.push({ variant, b64, descriptors });
  }

  if (variants.length > 0) {
    fontEntries.push({
      registerAs: entry.registerAs,
      variants,
    });
  }
}

console.log(`  Prepared ${fontEntries.length} font families for injection...`);

// Inject all fonts into the browser via FontFace API.
// We batch into chunks to avoid hitting the page.evaluate serialization limit.
const CHUNK_SIZE = 4;
for (let i = 0; i < fontEntries.length; i += CHUNK_SIZE) {
  const chunk = fontEntries.slice(i, i + CHUNK_SIZE);
  await page.evaluate(async (families) => {
    const promises = [];
    for (const family of families) {
      for (const v of family.variants) {
        const dataUrl = `data:font/woff2;base64,${v.b64}`;
        const face = new FontFace(family.registerAs, `url(${dataUrl})`, v.descriptors);
        promises.push(
          face.load().then(
            (loaded) => { document.fonts.add(loaded); },
            () => { /* ignore load failures */ }
          )
        );
      }
    }
    await Promise.all(promises);
  }, chunk);
}

// Wait for all fonts to finish loading
await page.waitForFunction(
  () => document.fonts.ready.then(() => document.fonts.status === 'loaded'),
  { timeout: 30_000 }
);
console.log(`  ${fontEntries.length} bundled font families loaded.`);

// Load the PPTX
const fileInput = page.locator('#file-input');
await fileInput.setInputFiles(pptxPath);

console.log('  Waiting for all slides to render...');
await page.waitForFunction(
  () => {
    const status = document.getElementById('status');
    return status?.textContent?.startsWith('Rendered ');
  },
  { timeout: 180_000 }
);

const statusText = await page.locator('#status').textContent();
console.log(`  ${statusText}`);

// Extract slide images — get the data URL src from each <img class="slide-image">
const slideCount = await page.locator('.slide-image').count();
console.log(`  Found ${slideCount} slide images`);

for (let i = 0; i < slideCount; i++) {
  const img = page.locator('.slide-image').nth(i);
  await img.scrollIntoViewIfNeeded();
  await page.waitForTimeout(50);

  // Extract the data URL from the img src (exact canvas pixel data)
  const dataUrl = await img.getAttribute('src');
  if (dataUrl && dataUrl.startsWith('data:image/png;base64,')) {
    const base64Data = dataUrl.replace('data:image/png;base64,', '');
    const buffer = Buffer.from(base64Data, 'base64');
    const outFile = path.join(renderedDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
    fs.writeFileSync(outFile, buffer);
    process.stdout.write(`  Saved slide-${String(i + 1).padStart(2, '0')}.png\r`);
  } else {
    // Fallback: screenshot the element
    const outFile = path.join(renderedDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
    await img.screenshot({ path: outFile });
    process.stdout.write(`  Screenshot slide-${String(i + 1).padStart(2, '0')}.png\r`);
  }
}
console.log(`\n  All ${slideCount} slides saved.`);

await browser.close();

if (viteProcess) {
  viteProcess.kill('SIGTERM');
}

// ---------------------------------------------------------------------------
// Step 3: ImageMagick RMSE comparison
// ---------------------------------------------------------------------------

console.log('\n=== Step 3: Computing RMSE against reference PNGs ===');

// Get the rendered image dimensions for resize target
const renderedFiles = fs
  .readdirSync(renderedDir)
  .filter((f) => f.match(/^slide-\d+\.png$/))
  .sort();
const referenceFiles = fs
  .readdirSync(referenceDir)
  .filter((f) => f.match(/^slide-\d+\.png$/))
  .sort();

// Get rendered image size from first file
let targetSize;
try {
  const identify = execSync(
    `magick identify -format '%wx%h' "${path.join(renderedDir, renderedFiles[0])}"`,
    {
      encoding: 'utf-8',
    }
  ).trim();
  targetSize = identify;
  console.log(`  Rendered image size: ${targetSize}`);
} catch {
  targetSize = '960x540';
  console.log(`  Using default target size: ${targetSize}`);
}

const results = [];

for (let i = 0; i < Math.min(renderedFiles.length, referenceFiles.length); i++) {
  const slideNum = i + 1;
  const renderedPath = path.join(renderedDir, renderedFiles[i]);
  const referencePath = path.join(referenceDir, referenceFiles[i]);
  const diffPath = path.join(diffsDir, `diff-${String(slideNum).padStart(2, '0')}.png`);

  try {
    // Compare rendered against resized reference.
    // magick compare outputs RMSE to stderr in format: "12345.6 (0.1234)"
    // The number in parens is the normalized RMSE (0-1 range).
    const stderr = execSync(
      `magick compare -metric RMSE "${renderedPath}" ` +
        `\\( "${referencePath}" -resize ${targetSize}! \\) ` +
        `"${diffPath}" 2>&1 || true`,
      { encoding: 'utf-8' }
    ).trim();

    // Parse RMSE — format: "12345.6 (0.1234)"
    const match = stderr.match(/\(([0-9.]+)\)/);
    const rmse = match ? parseFloat(match[1]) : null;

    const baseline = BASELINE_RMSE[slideNum];
    const delta = rmse != null && baseline != null ? rmse - baseline : null;

    results.push({ slideNum, rmse, baseline, delta, diffPath });
    process.stdout.write(
      `  slide-${String(slideNum).padStart(2, '0')}: RMSE=${rmse?.toFixed(4) ?? 'N/A'}\r`
    );
  } catch (err) {
    results.push({
      slideNum,
      rmse: null,
      baseline: BASELINE_RMSE[slideNum],
      delta: null,
      diffPath,
    });
    process.stdout.write(`  slide-${String(slideNum).padStart(2, '0')}: ERROR\r`);
  }
}

console.log('');

// ---------------------------------------------------------------------------
// Step 4: Report
// ---------------------------------------------------------------------------

console.log('\n=== RMSE Report (sorted by RMSE, worst first) ===\n');

// Sort by RMSE descending
const sorted = results.filter((r) => r.rmse != null).sort((a, b) => b.rmse - a.rmse);

console.log('  Slide  |  RMSE   | Baseline |  Delta  | Status');
console.log('  -------|---------|----------|---------|--------');

let improved = 0;
let regressed = 0;
let unchanged = 0;

for (const r of sorted) {
  const slideStr = String(r.slideNum).padStart(5);
  const rmseStr = r.rmse.toFixed(4).padStart(7);
  const baseStr = r.baseline != null ? r.baseline.toFixed(4).padStart(8) : '     N/A';
  let deltaStr, status;

  if (r.delta != null) {
    const absDelta = Math.abs(r.delta);
    if (r.delta > REGRESSION_THRESHOLD) {
      deltaStr = ` +${absDelta.toFixed(4)}`;
      status = '  WORSE';
      regressed++;
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
    status = '  ?';
  }

  console.log(`  ${slideStr} | ${rmseStr} | ${baseStr} | ${deltaStr} | ${status}`);
}

console.log(`\n  Summary: ${improved} improved, ${regressed} regressed, ${unchanged} unchanged`);

// Top 10 worst slides
console.log('\n=== Top 10 Worst Slides ===\n');
for (const r of sorted.slice(0, 10)) {
  console.log(
    `  Slide ${String(r.slideNum).padStart(2)}: RMSE=${r.rmse.toFixed(4)}  diff: ${r.diffPath}`
  );
}

// Write machine-readable JSON report
const reportPath = path.join(comparisonDir, 'rmse-report.json');
fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      pptxFile: pptxPath,
      slideCount,
      targetSize,
      results: results.map((r) => ({
        slide: r.slideNum,
        rmse: r.rmse,
        baseline: r.baseline,
        delta: r.delta,
      })),
      summary: { improved, regressed, unchanged },
    },
    null,
    2
  )
);
console.log(`\n  JSON report: ${reportPath}`);

// ---------------------------------------------------------------------------
// Step 5: Update baselines (if --update-baselines flag is passed)
// ---------------------------------------------------------------------------

if (process.argv.includes('--update-baselines')) {
  console.log('\n=== Updating baselines ===\n');
  const lines = results
    .filter((r) => r.rmse != null)
    .map((r) => `  ${r.slideNum}: ${r.rmse.toFixed(4)},`)
    .join('\n');
  console.log('  New BASELINE_RMSE values:\n');
  console.log(lines);
  console.log('\n  Copy these into the BASELINE_RMSE object in this script.');
}

// ---------------------------------------------------------------------------
// Step 6: Exit with non-zero code if any regressions detected
// ---------------------------------------------------------------------------

if (regressed > 0) {
  const regressedSlides = sorted
    .filter(
      (r) => r.delta != null && r.delta > REGRESSION_THRESHOLD
    )
    .map((r) => `slide ${r.slideNum} (+${r.delta.toFixed(4)})`)
    .join(', ');
  console.error(
    `\nFAIL: ${regressed} slide(s) regressed beyond threshold (${REGRESSION_THRESHOLD}): ${regressedSlides}`
  );
  process.exit(1);
}

console.log('\nPASS: No visual regressions detected.');
