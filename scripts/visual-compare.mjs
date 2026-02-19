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

// Baseline RMSE values (post Wave 7: justify, char spacing, rotation, 24 font families, 2026-02-19)
const BASELINE_RMSE = {
  1: 0.056, 2: 0.080, 3: 0.045, 4: 0.098, 5: 0.158, 6: 0.041, 7: 0.079,
  8: 0.108, 9: 0.178, 10: 0.038, 11: 0.155, 12: 0.159, 13: 0.141, 14: 0.070,
  15: 0.158, 16: 0.096, 17: 0.103, 18: 0.101, 19: 0.121, 20: 0.051,
  21: 0.139, 22: 0.128, 23: 0.138, 24: 0.054, 25: 0.149, 26: 0.780,
  27: 0.730, 28: 0.055, 29: 0.157, 30: 0.444, 31: 0.123, 32: 0.424,
  33: 0.042, 34: 0.162, 35: 0.178, 36: 0.034, 37: 0.033, 38: 0.126,
  39: 0.139, 40: 0.124, 41: 0.132, 42: 0.136, 43: 0.148, 44: 0.123,
  45: 0.139, 46: 0.131, 47: 0.117, 48: 0.138, 49: 0.127, 50: 0.152,
  51: 0.136, 52: 0.058, 53: 0.107, 54: 0.174,
};

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
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

await page.goto(viteUrl, { waitUntil: 'networkidle' });

// Inject Google Fonts so headless Chrome renders with the actual fonts.
// This covers the most common Google Fonts found in Google Slides exports.
console.log('  Loading Google Fonts...');
await page.addStyleTag({
  url: 'https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&family=Roboto+Slab:wght@100;200;300;400;500;600;700;800;900&family=Play:wght@400;700&family=Open+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,300;1,400;1,500;1,600;1,700;1,800&family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900&family=Raleway:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap',
});
// Also register "Barlow Light" as an alias for Barlow weight 300 — Google Slides
// uses "Barlow Light" as a separate family name, not Barlow with weight 300.
await page.addStyleTag({
  content: `
    @font-face {
      font-family: 'Barlow Light';
      font-style: normal;
      font-weight: 400;
      src: url(https://fonts.gstatic.com/s/barlow/v13/7cHqv4kjgoGqM7E3p-kc4A.ttf) format('truetype');
    }
    @font-face {
      font-family: 'Barlow Light';
      font-style: italic;
      font-weight: 400;
      src: url(https://fonts.gstatic.com/s/barlow/v13/7cHsv4kjgoGqM7E_CfOQ4lop.ttf) format('truetype');
    }
    @font-face {
      font-family: 'Roboto Slab Light';
      font-style: normal;
      font-weight: 400;
      src: url(https://fonts.gstatic.com/s/robotoslab/v36/BngbUXZYTXPIvIBgJJSb6s3BzlRRfKOFbvjo0oSWaA.ttf) format('truetype');
    }
    @font-face {
      font-family: 'Roboto Slab SemiBold';
      font-style: normal;
      font-weight: 400;
      src: url(https://fonts.gstatic.com/s/robotoslab/v36/BngbUXZYTXPIvIBgJJSb6s3BzlRRfKOFbvjoUoOWaA.ttf) format('truetype');
    }
  `,
});
// Wait for all fonts to finish loading
await page.waitForFunction(
  () => document.fonts.ready.then(() => document.fonts.status === 'loaded'),
  { timeout: 30_000 },
);
console.log('  Fonts loaded.');

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
const renderedFiles = fs.readdirSync(renderedDir).filter(f => f.match(/^slide-\d+\.png$/)).sort();
const referenceFiles = fs.readdirSync(referenceDir).filter(f => f.match(/^slide-\d+\.png$/)).sort();

// Get rendered image size from first file
let targetSize;
try {
  const identify = execSync(`magick identify -format '%wx%h' "${path.join(renderedDir, renderedFiles[0])}"`, {
    encoding: 'utf-8',
  }).trim();
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
    process.stdout.write(`  slide-${String(slideNum).padStart(2, '0')}: RMSE=${rmse?.toFixed(4) ?? 'N/A'}\r`);
  } catch (err) {
    results.push({ slideNum, rmse: null, baseline: BASELINE_RMSE[slideNum], delta: null, diffPath });
    process.stdout.write(`  slide-${String(slideNum).padStart(2, '0')}: ERROR\r`);
  }
}

console.log('');

// ---------------------------------------------------------------------------
// Step 4: Report
// ---------------------------------------------------------------------------

console.log('\n=== RMSE Report (sorted by RMSE, worst first) ===\n');

// Sort by RMSE descending
const sorted = results.filter(r => r.rmse != null).sort((a, b) => b.rmse - a.rmse);

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
    if (absDelta < 0.005) {
      deltaStr = '   ~0   ';
      status = '  =';
      unchanged++;
    } else if (r.delta < 0) {
      deltaStr = ` -${absDelta.toFixed(4)}`;
      status = '  BETTER';
      improved++;
    } else {
      deltaStr = ` +${absDelta.toFixed(4)}`;
      status = '  WORSE';
      regressed++;
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
  console.log(`  Slide ${String(r.slideNum).padStart(2)}: RMSE=${r.rmse.toFixed(4)}  diff: ${r.diffPath}`);
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
      results: results.map(r => ({
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
console.log('\nDone!');
