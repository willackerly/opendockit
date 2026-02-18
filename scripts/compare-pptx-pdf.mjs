#!/usr/bin/env node
/**
 * Compare PPTX rendering against PDF reference.
 *
 * Usage:
 *   node scripts/compare-pptx-pdf.mjs <pptx-file> <pdf-file> [output-dir]
 *
 * Steps:
 *   1. Rasterize PDF pages to PNGs using pdftoppm
 *   2. Start the Vite dev viewer
 *   3. Use Playwright (headless Chromium) to load the PPTX and screenshot each slide
 *   4. Save rendered PNGs + PDF PNGs side-by-side in the output directory
 *
 * Requirements:
 *   - pdftoppm (from poppler-utils) on PATH
 *   - Playwright chromium browser installed
 */

import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node scripts/compare-pptx-pdf.mjs <pptx-file> <pdf-file> [output-dir]');
  process.exit(1);
}

const pptxPath = path.resolve(args[0]);
const pdfPath = path.resolve(args[1]);
const outputDir = path.resolve(args[2] ?? path.join(path.dirname(pptxPath), 'comparison-output'));

if (!fs.existsSync(pptxPath)) {
  console.error(`PPTX file not found: ${pptxPath}`);
  process.exit(1);
}
if (!fs.existsSync(pdfPath)) {
  console.error(`PDF file not found: ${pdfPath}`);
  process.exit(1);
}

// Create output directories
const renderedDir = path.join(outputDir, 'rendered');
const referenceDir = path.join(outputDir, 'reference');
fs.mkdirSync(renderedDir, { recursive: true });
fs.mkdirSync(referenceDir, { recursive: true });

// ---------------------------------------------------------------------------
// Step 1: Rasterize PDF to PNGs
// ---------------------------------------------------------------------------

console.log('Step 1: Rasterizing PDF pages...');

try {
  // pdftoppm outputs files like: prefix-01.png, prefix-02.png, etc.
  execSync(
    `pdftoppm -png -r 150 "${pdfPath}" "${path.join(referenceDir, 'slide')}"`,
    { stdio: 'pipe' }
  );
} catch (err) {
  console.error('pdftoppm failed. Is poppler-utils installed?');
  console.error(err.stderr?.toString());
  process.exit(1);
}

// Collect reference PNGs (sorted by name)
const refFiles = fs.readdirSync(referenceDir)
  .filter(f => f.endsWith('.png'))
  .sort();
console.log(`  → ${refFiles.length} PDF pages rasterized.`);

// ---------------------------------------------------------------------------
// Step 2: Start Vite dev server
// ---------------------------------------------------------------------------

console.log('Step 2: Starting Vite dev server...');

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
let viteProcess;
let viteUrl;

try {
  viteUrl = await startViteServer(projectRoot);
  console.log(`  → Vite running at ${viteUrl}`);
} catch (err) {
  console.error('Failed to start Vite dev server:', err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 3: Render PPTX slides via Playwright
// ---------------------------------------------------------------------------

console.log('Step 3: Rendering PPTX slides via headless Chromium...');

const browser = await chromium.launch();
const page = await browser.newPage();

// Set a large viewport to avoid scaling issues
await page.setViewportSize({ width: 1400, height: 900 });

await page.goto(viteUrl, { waitUntil: 'networkidle' });

// Load the PPTX file via the file input
const fileInput = await page.locator('#file-input');
await fileInput.setInputFiles(pptxPath);

// Wait for rendering to complete — poll the status bar text.
// It should eventually say "Rendered N slides in Xs."
console.log('  → Waiting for rendering to complete...');
await page.waitForFunction(
  () => {
    const status = document.getElementById('status');
    return status?.textContent?.startsWith('Rendered ');
  },
  { timeout: 120_000 }
);

const statusText = await page.locator('#status').textContent();
console.log(`  → ${statusText}`);

// Screenshot each slide image element
const slideImgs = await page.locator('.slide-image').all();
console.log(`  → Found ${slideImgs.length} rendered slides.`);

for (let i = 0; i < slideImgs.length; i++) {
  const outFile = path.join(renderedDir, `slide-${String(i + 1).padStart(2, '0')}.png`);

  // Scroll the image into view first
  await slideImgs[i].scrollIntoViewIfNeeded();
  await page.waitForTimeout(100); // Let paint settle

  await slideImgs[i].screenshot({ path: outFile });
  console.log(`  → Saved ${path.basename(outFile)}`);
}

await browser.close();

// ---------------------------------------------------------------------------
// Step 4: Kill Vite server
// ---------------------------------------------------------------------------

if (viteProcess) {
  viteProcess.kill('SIGTERM');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n=== Comparison Output ===');
console.log(`Rendered slides: ${renderedDir}/`);
console.log(`PDF reference:   ${referenceDir}/`);
console.log(`\nSlide count: ${slideImgs.length} rendered vs ${refFiles.length} PDF pages`);

// List side-by-side
const maxSlides = Math.max(slideImgs.length, refFiles.length);
console.log('\n  Slide  | Rendered                     | Reference');
console.log('  -------|------------------------------|-----------------------------');
for (let i = 0; i < maxSlides; i++) {
  const rendered = i < slideImgs.length ? `slide-${String(i + 1).padStart(2, '0')}.png` : '(missing)';
  const reference = i < refFiles.length ? refFiles[i] : '(missing)';
  console.log(`  ${String(i + 1).padStart(5)} | ${rendered.padEnd(28)} | ${reference}`);
}

console.log(`\nDone! Open the output directory to compare:\n  ${outputDir}`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startViteServer(cwd) {
  return new Promise((resolve, reject) => {
    viteProcess = spawn('npx', ['vite', '--port', '0'], {
      cwd: path.join(cwd, 'tools', 'viewer'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let output = '';
    const timeout = setTimeout(() => {
      reject(new Error('Vite server did not start within 15s'));
    }, 15_000);

    viteProcess.stdout.on('data', (chunk) => {
      output += chunk.toString();
      // Look for the Local URL line
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
