#!/usr/bin/env node
/**
 * Corpus visual regression pipeline — render all corpus PPTX files,
 * compare against self-referential baseline PNGs using ImageMagick RMSE.
 *
 * Self-referential: the first run renders and saves baselines. Subsequent
 * runs re-render and compare against saved baselines. This detects rendering
 * regressions but NOT fidelity bugs (those are baked into the baseline).
 *
 * Usage:
 *   node scripts/visual-compare-corpus.mjs [options]
 *
 * Options:
 *   --update-baselines   Re-render and overwrite saved baselines + RMSE values
 *   --corpus-dir <dir>   Corpus directory (default: test-data/corpus)
 *   --file <name>        Run only a single PPTX file (e.g., --file charts-bar)
 *
 * Requires:
 *   - Playwright chromium (pnpm install)
 *   - ImageMagick 7 (magick compare)
 *   - Built core package (pnpm build)
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

const updateBaselines = args.includes('--update-baselines');
const fileFilter = args.includes('--file')
  ? args[args.indexOf('--file') + 1]
  : null;

const corpusDirArg = args.includes('--corpus-dir')
  ? args[args.indexOf('--corpus-dir') + 1]
  : null;

const corpusDir = path.resolve(
  corpusDirArg ?? path.join(projectRoot, 'test-data', 'corpus')
);
const baselinesDir = path.join(projectRoot, 'test-data', 'corpus-baselines');
const baselinesJsonPath = path.join(baselinesDir, 'rmse-baselines.json');

// Self-referential regression threshold — since both images come from the
// same renderer, differences should be near-zero (only font loading or
// environment drift). Use a tight threshold.
const REGRESSION_THRESHOLD = 0.003;

// ---------------------------------------------------------------------------
// Discover PPTX files
// ---------------------------------------------------------------------------

let pptxFiles = fs
  .readdirSync(corpusDir)
  .filter((f) => f.endsWith('.pptx'))
  .sort();

if (fileFilter) {
  const target = fileFilter.endsWith('.pptx') ? fileFilter : `${fileFilter}.pptx`;
  pptxFiles = pptxFiles.filter((f) => f === target);
  if (pptxFiles.length === 0) {
    console.error(`File not found: ${target} in ${corpusDir}`);
    process.exit(1);
  }
}

if (pptxFiles.length === 0) {
  console.error(`No PPTX files found in ${corpusDir}`);
  process.exit(1);
}

console.log(`Found ${pptxFiles.length} PPTX file(s) in ${corpusDir}`);

// Load existing baselines
let baselines = {};
if (fs.existsSync(baselinesJsonPath)) {
  baselines = JSON.parse(fs.readFileSync(baselinesJsonPath, 'utf-8'));
}

const isFirstRun = Object.keys(baselines).length === 0;
if (isFirstRun && !updateBaselines) {
  console.log('\nNo baselines found — running in bootstrap mode (will save baselines).\n');
}

// ---------------------------------------------------------------------------
// Step 1: Start Vite dev server
// ---------------------------------------------------------------------------

console.log('\n=== Step 1: Starting Vite dev server ===');

let viteProcess;

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

let viteUrl;
try {
  viteUrl = await startViteServer();
  console.log(`  Vite running at ${viteUrl}`);
} catch (err) {
  console.error('Failed to start Vite dev server:', err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 2: Launch browser and load fonts
// ---------------------------------------------------------------------------

console.log('\n=== Step 2: Launching browser and loading fonts ===');

const browser = await chromium.launch();
const browserContext = await browser.newContext({
  deviceScaleFactor: 2,
  viewport: { width: 1400, height: 900 },
});

const VARIANT_DESCRIPTORS = {
  regular: {},
  bold: { weight: 'bold' },
  italic: { style: 'italic' },
  boldItalic: { weight: 'bold', style: 'italic' },
};

const manifestPath = pathToFileURL(
  path.join(projectRoot, 'packages/core/dist/font/data/woff2/manifest.js')
).href;
const { BUNDLED_FONTS } = await import(manifestPath);

const moduleCache = new Map();
const woff2Dir = path.join(projectRoot, 'packages/core/dist/font/data/woff2');

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
    fontEntries.push({ registerAs: entry.registerAs, variants });
  }
}

console.log(`  Prepared ${fontEntries.length} font families`);

// ---------------------------------------------------------------------------
// Helper: inject fonts into a page
// ---------------------------------------------------------------------------

async function injectFonts(page) {
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
              () => {}
            )
          );
        }
      }
      await Promise.all(promises);
    }, chunk);
  }
  await page.waitForFunction(
    () => document.fonts.ready.then(() => document.fonts.status === 'loaded'),
    { timeout: 30_000 }
  );
}

// ---------------------------------------------------------------------------
// Helper: render a single PPTX and return slide PNG buffers
// ---------------------------------------------------------------------------

async function renderPptx(pptxPath) {
  const page = await browserContext.newPage();
  await page.goto(viteUrl, { waitUntil: 'networkidle' });
  await injectFonts(page);

  const fileInput = page.locator('#file-input');
  await fileInput.setInputFiles(pptxPath);

  await page.waitForFunction(
    () => {
      const status = document.getElementById('status');
      return status?.textContent?.startsWith('Rendered ');
    },
    { timeout: 120_000 }
  );

  const slideCount = await page.locator('.slide-image').count();
  const slides = [];

  for (let i = 0; i < slideCount; i++) {
    const img = page.locator('.slide-image').nth(i);
    await img.scrollIntoViewIfNeeded();
    await page.waitForTimeout(50);

    const dataUrl = await img.getAttribute('src');
    if (dataUrl && dataUrl.startsWith('data:image/png;base64,')) {
      const base64Data = dataUrl.replace('data:image/png;base64,', '');
      slides.push(Buffer.from(base64Data, 'base64'));
    } else {
      // Fallback: screenshot
      slides.push(await img.screenshot());
    }
  }

  await page.close();
  return slides;
}

// ---------------------------------------------------------------------------
// Step 3: Render and compare each PPTX
// ---------------------------------------------------------------------------

console.log('\n=== Step 3: Rendering and comparing corpus files ===');

fs.mkdirSync(baselinesDir, { recursive: true });

const allResults = {};
let totalSlides = 0;
let totalRegressed = 0;
let totalImproved = 0;
let totalUnchanged = 0;
let totalNew = 0;

for (const pptxFile of pptxFiles) {
  const baseName = pptxFile.replace('.pptx', '');
  const pptxPath = path.join(corpusDir, pptxFile);
  const fileBaselineDir = path.join(baselinesDir, baseName);

  console.log(`\n--- ${pptxFile} ---`);

  // Render slides
  let slides;
  try {
    slides = await renderPptx(pptxPath);
    console.log(`  Rendered ${slides.length} slide(s)`);
  } catch (err) {
    console.log(`  FAILED: ${err.message}`);
    allResults[baseName] = { error: err.message };
    continue;
  }

  totalSlides += slides.length;

  // Save rendered PNGs to temp dir for comparison
  const tmpDir = path.join(baselinesDir, '.tmp', baseName);
  fs.mkdirSync(tmpDir, { recursive: true });
  for (let i = 0; i < slides.length; i++) {
    fs.writeFileSync(
      path.join(tmpDir, `slide-${String(i + 1).padStart(2, '0')}.png`),
      slides[i]
    );
  }

  // If bootstrapping or updating, save as baselines
  if (isFirstRun || updateBaselines) {
    fs.mkdirSync(fileBaselineDir, { recursive: true });
    for (let i = 0; i < slides.length; i++) {
      fs.writeFileSync(
        path.join(fileBaselineDir, `slide-${String(i + 1).padStart(2, '0')}.png`),
        slides[i]
      );
    }
    console.log(`  Saved ${slides.length} baseline(s)`);

    // Set RMSE baselines to 0 (self-referential — identical images)
    baselines[baseName] = {};
    for (let i = 0; i < slides.length; i++) {
      baselines[baseName][i + 1] = 0;
    }
    totalNew += slides.length;
    allResults[baseName] = { slides: slides.length, status: 'baseline-saved' };
    continue;
  }

  // Compare against existing baselines
  if (!fs.existsSync(fileBaselineDir)) {
    console.log(`  No baseline — skipping comparison (run with --update-baselines)`);
    allResults[baseName] = { slides: slides.length, status: 'no-baseline' };
    continue;
  }

  const fileBaselines = baselines[baseName] ?? {};
  const fileResults = [];

  for (let i = 0; i < slides.length; i++) {
    const slideNum = i + 1;
    const renderedPath = path.join(tmpDir, `slide-${String(slideNum).padStart(2, '0')}.png`);
    const baselinePath = path.join(
      fileBaselineDir,
      `slide-${String(slideNum).padStart(2, '0')}.png`
    );

    if (!fs.existsSync(baselinePath)) {
      fileResults.push({ slide: slideNum, rmse: null, baseline: null, status: 'new' });
      totalNew++;
      continue;
    }

    try {
      // Compare using ImageMagick RMSE
      const stderr = execSync(
        `magick compare -metric RMSE "${renderedPath}" "${baselinePath}" null: 2>&1 || true`,
        { encoding: 'utf-8' }
      ).trim();

      const match = stderr.match(/\(([0-9.]+)\)/);
      const rmse = match ? parseFloat(match[1]) : null;
      const baseline = fileBaselines[slideNum] ?? 0;
      const delta = rmse != null ? rmse - baseline : null;

      let status;
      if (delta != null && delta > REGRESSION_THRESHOLD) {
        status = 'WORSE';
        totalRegressed++;
      } else if (delta != null && delta < -0.001) {
        status = 'BETTER';
        totalImproved++;
      } else {
        status = '=';
        totalUnchanged++;
      }

      fileResults.push({ slide: slideNum, rmse, baseline, delta, status });
    } catch {
      fileResults.push({ slide: slideNum, rmse: null, baseline: null, status: 'error' });
    }
  }

  // Print per-file results
  const worstSlides = fileResults
    .filter((r) => r.rmse != null && r.rmse > 0.001)
    .sort((a, b) => b.rmse - a.rmse);

  if (worstSlides.length > 0) {
    for (const r of worstSlides) {
      const statusIcon = r.status === 'WORSE' ? 'WORSE' : r.status === 'BETTER' ? 'BETTER' : '=';
      console.log(
        `  slide ${String(r.slide).padStart(2)}: RMSE=${r.rmse.toFixed(4)} ${statusIcon}`
      );
    }
  } else {
    console.log(`  All ${slides.length} slide(s) match baseline (RMSE ≈ 0)`);
  }

  allResults[baseName] = { slides: slides.length, results: fileResults };
}

// ---------------------------------------------------------------------------
// Cleanup temp dir
// ---------------------------------------------------------------------------

const tmpRoot = path.join(baselinesDir, '.tmp');
if (fs.existsSync(tmpRoot)) {
  fs.rmSync(tmpRoot, { recursive: true });
}

// ---------------------------------------------------------------------------
// Save baselines JSON
// ---------------------------------------------------------------------------

if (isFirstRun || updateBaselines) {
  fs.writeFileSync(baselinesJsonPath, JSON.stringify(baselines, null, 2) + '\n');
  console.log(`\nBaselines saved to ${baselinesJsonPath}`);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

await browser.close();
if (viteProcess) viteProcess.kill('SIGTERM');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n=== Corpus Visual Regression Summary ===\n');
console.log(`  Files:     ${pptxFiles.length}`);
console.log(`  Slides:    ${totalSlides}`);

if (isFirstRun || updateBaselines) {
  console.log(`  Baselines: ${totalNew} saved (first run / update)`);
  console.log('\nBASELINE: Baselines bootstrapped. Run again to detect regressions.');
  process.exit(0);
}

console.log(`  Unchanged: ${totalUnchanged}`);
console.log(`  Improved:  ${totalImproved}`);
console.log(`  Regressed: ${totalRegressed}`);
console.log(`  New:       ${totalNew}`);

if (totalRegressed > 0) {
  // Collect regressed slide details
  const regressedDetails = [];
  for (const [name, data] of Object.entries(allResults)) {
    if (!data.results) continue;
    for (const r of data.results) {
      if (r.status === 'WORSE') {
        regressedDetails.push(`${name}/slide-${r.slide} (RMSE=${r.rmse.toFixed(4)})`);
      }
    }
  }
  console.error(
    `\nFAIL: ${totalRegressed} slide(s) regressed beyond threshold (${REGRESSION_THRESHOLD}):`
  );
  for (const d of regressedDetails) {
    console.error(`  - ${d}`);
  }
  process.exit(1);
}

console.log('\nPASS: No corpus visual regressions detected.');
