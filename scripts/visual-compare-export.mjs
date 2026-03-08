#!/usr/bin/env node
/**
 * Export visual regression pipeline — compare PPTX Canvas rendering vs PPTX→PDF export.
 *
 * Measures EXPORT FIDELITY: how well the PDF export (SlideKit.exportPDF()) reproduces
 * the original Canvas rendering that users see in the viewer.
 *
 * Pipeline:
 *   1. Render PPTX slides via Canvas (SlideKit in headless Chromium) → canvas-reference/
 *   2. Call SlideKit.exportPDF() in browser → get PDF bytes
 *   3. Render exported PDF pages via PDF.js in browser → pdf-export/
 *   4. Compute RMSE between canvas-reference/ and pdf-export/ using ImageMagick
 *   5. Report fidelity scores per-slide, compare against baselines
 *
 * Usage:
 *   node scripts/visual-compare-export.mjs [pptx-file] [options]
 *
 * Options:
 *   --output-dir <dir>      Output directory (default: ../pptx-pdf-comparisons/export-comparison)
 *   --update-baselines      Re-capture baselines and overwrite RMSE values
 *   --file <name>           Shorthand: resolve against test-data/ dir (e.g. --file basic-shapes)
 *   --scale <n>             Render scale factor (default: 2 for 2x DPI)
 *   --skip-export           Only render Canvas reference (skip PDF export step)
 *
 * Output directory structure:
 *   output-dir/
 *     canvas-reference/    PPTX slides rendered via Canvas2D (the ground truth)
 *     pdf-export/          Exported PDF pages rendered via PDF.js
 *     diffs/               ImageMagick RMSE diff images
 *     export-rmse-report.json  Per-slide RMSE scores and baseline comparison
 *
 * Requires:
 *   - Playwright chromium (pnpm install)
 *   - ImageMagick 7 (magick compare)
 *   - Built core package (pnpm --filter @opendockit/core build)
 *
 * Dependencies:
 *   - SlideKit.exportPDF() — implemented in W3-A (packages/pptx/src/export/)
 *   - If not yet available, the script exits 0 with EXPORT_NOT_IMPLEMENTED message
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

// Parse CLI arguments
const updateBaselines = args.includes('--update-baselines');
const skipExport = args.includes('--skip-export');

const scaleArg = args.includes('--scale') ? parseFloat(args[args.indexOf('--scale') + 1]) : 2;
const scale = Number.isFinite(scaleArg) ? scaleArg : 2;

// Resolve PPTX path: positional arg, --file, or default
let pptxPath;
const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;
const positionalArg = args.find((a) => !a.startsWith('--') && a.endsWith('.pptx'));

if (fileArg) {
  // --file basic-shapes  →  test-data/basic-shapes.pptx
  const name = fileArg.endsWith('.pptx') ? fileArg : `${fileArg}.pptx`;
  pptxPath = path.resolve(projectRoot, 'test-data', name);
} else if (positionalArg) {
  pptxPath = path.resolve(positionalArg);
} else {
  pptxPath = path.resolve(projectRoot, 'test-data', 'basic-shapes.pptx');
}

// Output directory
const outputDirArg = args.includes('--output-dir')
  ? args[args.indexOf('--output-dir') + 1]
  : null;
const outputDir = path.resolve(
  outputDirArg ?? path.join(projectRoot, '..', 'pptx-pdf-comparisons', 'export-comparison')
);

const canvasReferenceDir = path.join(outputDir, 'canvas-reference');
const pdfExportDir = path.join(outputDir, 'pdf-export');
const diffsDir = path.join(outputDir, 'diffs');
const reportPath = path.join(outputDir, 'export-rmse-report.json');
const baselinesPath = path.join(outputDir, 'baselines.json');

// ---------------------------------------------------------------------------
// Validate inputs
// ---------------------------------------------------------------------------

if (!fs.existsSync(pptxPath)) {
  console.error(`PPTX not found: ${pptxPath}`);
  console.error(
    `Tip: use --file <name> to resolve against test-data/, e.g. --file basic-shapes`
  );
  process.exit(1);
}

// Create output directories
fs.mkdirSync(canvasReferenceDir, { recursive: true });
fs.mkdirSync(diffsDir, { recursive: true });

console.log(`Export Visual Regression`);
console.log(`  PPTX:       ${pptxPath}`);
console.log(`  Output dir: ${outputDir}`);
console.log(`  Scale:      ${scale}x`);
if (updateBaselines) console.log(`  Mode:       UPDATE BASELINES`);
if (skipExport) console.log(`  Mode:       CANVAS REFERENCE ONLY (--skip-export)`);
console.log('');

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
// Step 2: Launch browser and load bundled fonts
// ---------------------------------------------------------------------------

console.log('\n=== Step 2: Launching browser and loading fonts ===');

const browser = await chromium.launch();
const browserContext = await browser.newContext({
  // 2x DPI produces smooth antialiased text matching Retina/HiDPI displays.
  deviceScaleFactor: scale,
  viewport: { width: 1400, height: 900 },
});

// Load the bundled WOFF2 font manifest from the compiled core package.
// This must be built before running this script: pnpm --filter @opendockit/core build
const manifestPath = pathToFileURL(
  path.join(projectRoot, 'packages/core/dist/font/data/woff2/manifest.js')
).href;

let BUNDLED_FONTS;
try {
  ({ BUNDLED_FONTS } = await import(manifestPath));
} catch (err) {
  console.error(`Failed to load font manifest from ${manifestPath}`);
  console.error(`  → Run: pnpm --filter @opendockit/core build`);
  console.error(`  → Error: ${err.message}`);
  await browser.close();
  if (viteProcess) viteProcess.kill('SIGTERM');
  process.exit(1);
}

const VARIANT_DESCRIPTORS = {
  regular: {},
  bold: { weight: 'bold' },
  italic: { style: 'italic' },
  boldItalic: { weight: 'bold', style: 'italic' },
};

const moduleCache = new Map();
const woff2Dir = path.join(projectRoot, 'packages/core/dist/font/data/woff2');

// Build font data: collect all WOFF2 base64 payloads from manifest modules.
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
    variants.push({ variant, b64, descriptors: VARIANT_DESCRIPTORS[variant] ?? {} });
  }

  if (variants.length > 0) {
    fontEntries.push({ registerAs: entry.registerAs, variants });
  }
}

console.log(`  Prepared ${fontEntries.length} font families for injection`);

// ---------------------------------------------------------------------------
// Helper: inject bundled fonts into a Playwright page
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
              (loaded) => {
                document.fonts.add(loaded);
              },
              () => {
                /* ignore load failures */
              }
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
// Step 3: Render PPTX slides via Canvas (the reference)
// ---------------------------------------------------------------------------

console.log('\n=== Step 3: Rendering PPTX slides via Canvas (reference) ===');

const page = await browserContext.newPage();
await page.goto(viteUrl, { waitUntil: 'networkidle' });

console.log('  Injecting bundled fonts...');
await injectFonts(page);
console.log(`  ${fontEntries.length} font families loaded.`);

// Load the PPTX file via the file input
const fileInput = page.locator('#file-input');
await fileInput.setInputFiles(pptxPath);

console.log('  Waiting for all slides to render...');
await page.waitForFunction(
  () => {
    const status = document.getElementById('status');
    return status?.textContent?.startsWith('Rendered ');
  },
  { timeout: 300_000 }
);

const statusText = await page.locator('#status').textContent();
console.log(`  ${statusText}`);

// Extract slide images from the DOM — each <img class="slide-image"> holds the PNG data URL
const slideCount = await page.locator('.slide-image').count();
console.log(`  Found ${slideCount} slide(s)`);

const canvasSlideFiles = [];
for (let i = 0; i < slideCount; i++) {
  const img = page.locator('.slide-image').nth(i);
  await img.scrollIntoViewIfNeeded();
  await page.waitForTimeout(50);

  const dataUrl = await img.getAttribute('src');
  const outFile = path.join(canvasReferenceDir, `slide-${String(i + 1).padStart(2, '0')}.png`);

  if (dataUrl && dataUrl.startsWith('data:image/png;base64,')) {
    const base64Data = dataUrl.replace('data:image/png;base64,', '');
    fs.writeFileSync(outFile, Buffer.from(base64Data, 'base64'));
  } else {
    // Fallback: screenshot the element directly
    await img.screenshot({ path: outFile });
  }

  canvasSlideFiles.push(outFile);
  process.stdout.write(`  Saved canvas-reference/slide-${String(i + 1).padStart(2, '0')}.png\r`);
}
console.log(`\n  All ${slideCount} Canvas reference slide(s) saved.`);

// ---------------------------------------------------------------------------
// Step 4: Export PPTX to PDF via SlideKit.exportPDF()
// ---------------------------------------------------------------------------

let pdfExportPages = [];
let exportAvailable = false;
let exportErrorMessage = null;
let exportErrorCode = null;

if (!skipExport) {
  console.log('\n=== Step 4: Exporting PPTX to PDF via SlideKit.exportPDF() ===');

  // Try calling exportPDF() from the viewer's debug API.
  // SlideKit.exportPDF() is implemented in W3-A (packages/pptx/src/export/pdf-exporter.ts).
  // If not yet available, we get a clear NOT_IMPLEMENTED message and skip gracefully.
  const exportResult = await page.evaluate(async () => {
    const kit = window.__debug?.kit;
    if (!kit) {
      return { error: 'NO_KIT', message: 'window.__debug.kit not available' };
    }
    if (typeof kit.exportPDF !== 'function') {
      return {
        error: 'EXPORT_NOT_IMPLEMENTED',
        message:
          'SlideKit.exportPDF() is not yet implemented. ' +
          'This method will be added in W3-A (packages/pptx/src/export/pdf-exporter.ts). ' +
          'Re-run this script after W3-A is merged to measure export fidelity.',
      };
    }
    try {
      const pdfBytes = await kit.exportPDF();
      // Return as base64 to cross the Playwright serialization boundary
      const arr = Array.from(new Uint8Array(pdfBytes));
      const b64 = btoa(String.fromCharCode(...arr));
      return { success: true, b64, byteLength: pdfBytes.byteLength };
    } catch (err) {
      return { error: 'EXPORT_FAILED', message: err?.message ?? String(err) };
    }
  });

  if (exportResult.error === 'EXPORT_NOT_IMPLEMENTED') {
    console.log('');
    console.log('  EXPORT_NOT_IMPLEMENTED');
    console.log('');
    console.log(`  ${exportResult.message}`);
    console.log('');
    console.log('  The canvas-reference/ images have been saved. You can:');
    console.log('    1. Re-run after W3-A (SlideKit.exportPDF()) is merged');
    console.log('    2. Use --skip-export to only capture canvas reference images');
    console.log('');
    exportErrorMessage = exportResult.message;
    exportErrorCode = exportResult.error;
  } else if (exportResult.error) {
    console.error(`  Export failed: [${exportResult.error}] ${exportResult.message}`);
    exportErrorMessage = `${exportResult.error}: ${exportResult.message}`;
    exportErrorCode = exportResult.error;
  } else {
    console.log(`  Exported PDF: ${exportResult.byteLength.toLocaleString()} bytes`);
    exportAvailable = true;

    // Save the exported PDF for debugging
    const exportedPdfPath = path.join(outputDir, 'exported.pdf');
    const pdfBytes = Buffer.from(exportResult.b64, 'base64');
    fs.writeFileSync(exportedPdfPath, pdfBytes);
    console.log(`  Saved: ${exportedPdfPath}`);

    // ---------------------------------------------------------------------------
    // Step 4b: Render exported PDF pages via PDF.js in the browser
    // ---------------------------------------------------------------------------

    console.log('\n=== Step 4b: Rendering exported PDF via PDF.js ===');
    fs.mkdirSync(pdfExportDir, { recursive: true });

    // Render each page of the exported PDF using PDF.js inside the browser.
    // We inject pdfjs-dist from CDN (or use the already-loaded one from the viewer).
    const pdfPageResults = await page.evaluate(async (b64) => {
      // Load PDF.js — try to use an already-available global, or load from CDN
      let pdfjsLib = window.pdfjsLib;
      if (!pdfjsLib) {
        try {
          // Dynamic import from CDN
          pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/+esm');
        } catch {
          return {
            error: 'PDFJS_UNAVAILABLE',
            message: 'Could not load PDF.js for PDF rendering',
          };
        }
      }

      // Decode PDF bytes
      const binaryStr = atob(b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      // Load the PDF document
      let pdfDoc;
      try {
        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        pdfDoc = await loadingTask.promise;
      } catch (err) {
        return { error: 'PDF_LOAD_FAILED', message: err?.message ?? String(err) };
      }

      const numPages = pdfDoc.numPages;
      const pageDataUrls = [];

      // Render each page to an OffscreenCanvas, convert to PNG data URL
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 }); // 2x for HiDPI

        const canvas = new OffscreenCanvas(
          Math.floor(viewport.width),
          Math.floor(viewport.height)
        );
        const ctx = canvas.getContext('2d');

        // White background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;

        // Convert to PNG blob → data URL
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        const reader = new FileReader();
        const dataUrl = await new Promise((resolve) => {
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });

        pageDataUrls.push(dataUrl);
      }

      await pdfDoc.destroy();
      return { success: true, pages: pageDataUrls };
    }, exportResult.b64);

    if (pdfPageResults.error) {
      console.error(`  PDF rendering failed: [${pdfPageResults.error}] ${pdfPageResults.message}`);
      exportErrorMessage = `PDF_RENDER: ${pdfPageResults.error}: ${pdfPageResults.message}`;
      exportErrorCode = 'PDF_RENDER_FAILED';
      exportAvailable = false;
    } else {
      console.log(`  Rendered ${pdfPageResults.pages.length} PDF page(s)`);

      for (let i = 0; i < pdfPageResults.pages.length; i++) {
        const dataUrl = pdfPageResults.pages[i];
        const outFile = path.join(pdfExportDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
        const base64Data = dataUrl.replace('data:image/png;base64,', '');
        fs.writeFileSync(outFile, Buffer.from(base64Data, 'base64'));
        pdfExportPages.push(outFile);
        process.stdout.write(
          `  Saved pdf-export/slide-${String(i + 1).padStart(2, '0')}.png\r`
        );
      }
      console.log(`\n  All ${pdfExportPages.length} PDF export page(s) saved.`);
    }
  }
}

// Close browser and Vite server
await browser.close();
if (viteProcess) viteProcess.kill('SIGTERM');

// ---------------------------------------------------------------------------
// Step 5: ImageMagick RMSE comparison
// ---------------------------------------------------------------------------

let results = [];
let targetSize = null;

if (exportAvailable && pdfExportPages.length > 0) {
  console.log('\n=== Step 5: Computing RMSE (Canvas vs PDF export) ===');

  // Get dimensions from first canvas reference image
  try {
    const identify = execSync(
      `magick identify -format '%wx%h' "${canvasSlideFiles[0]}"`,
      { encoding: 'utf-8' }
    ).trim();
    targetSize = identify;
    console.log(`  Canvas reference image size: ${targetSize}`);
  } catch {
    targetSize = null;
    console.log(`  Could not identify canvas reference size, using raw comparison`);
  }

  const compareCount = Math.min(canvasSlideFiles.length, pdfExportPages.length);

  for (let i = 0; i < compareCount; i++) {
    const slideNum = i + 1;
    const referencePath = canvasSlideFiles[i];
    const testPath = pdfExportPages[i];
    const diffPath = path.join(diffsDir, `diff-${String(slideNum).padStart(2, '0')}.png`);

    try {
      // Compare canvas reference vs PDF export rendering.
      // Resize PDF page to match canvas reference dimensions (they may differ due to scale).
      // magick compare outputs RMSE to stderr: "12345.6 (0.1234)"
      const cmd = targetSize
        ? `magick compare -metric RMSE "${referencePath}" ` +
          `\\( "${testPath}" -resize ${targetSize}! \\) ` +
          `"${diffPath}" 2>&1 || true`
        : `magick compare -metric RMSE "${referencePath}" "${testPath}" "${diffPath}" 2>&1 || true`;

      const stderr = execSync(cmd, { encoding: 'utf-8' }).trim();
      const match = stderr.match(/\(([0-9.]+)\)/);
      const rmse = match ? parseFloat(match[1]) : null;

      results.push({ slideNum, rmse, diffPath });
      process.stdout.write(
        `  slide-${String(slideNum).padStart(2, '0')}: RMSE=${rmse?.toFixed(4) ?? 'N/A'}\r`
      );
    } catch (err) {
      results.push({ slideNum, rmse: null, diffPath, error: err.message });
      process.stdout.write(`  slide-${String(slideNum).padStart(2, '0')}: ERROR\r`);
    }
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Step 6: Load/update baselines and report
// ---------------------------------------------------------------------------

let baselines = {};
if (fs.existsSync(baselinesPath)) {
  baselines = JSON.parse(fs.readFileSync(baselinesPath, 'utf-8'));
}

const isFirstRun = Object.keys(baselines).length === 0;
const REGRESSION_THRESHOLD = 0.01; // 1% RMSE threshold for export fidelity

if (exportAvailable && results.length > 0) {
  console.log('\n=== Export Fidelity Report (sorted by RMSE, worst first) ===\n');

  const sorted = results.filter((r) => r.rmse != null).sort((a, b) => b.rmse - a.rmse);

  console.log('  Slide  |  RMSE   | Baseline |  Delta  | Status');
  console.log('  -------|---------|----------|---------|--------');

  let improved = 0;
  let regressed = 0;
  let unchanged = 0;

  const newBaselines = {};

  for (const r of sorted) {
    const baseline = baselines[r.slideNum];
    const delta = r.rmse != null && baseline != null ? r.rmse - baseline : null;

    const slideStr = String(r.slideNum).padStart(5);
    const rmseStr = r.rmse.toFixed(4).padStart(7);
    const baseStr = baseline != null ? baseline.toFixed(4).padStart(8) : '     N/A';
    let deltaStr, status;

    if (delta != null) {
      const absDelta = Math.abs(delta);
      if (delta > REGRESSION_THRESHOLD) {
        deltaStr = ` +${absDelta.toFixed(4)}`;
        status = '  WORSE';
        regressed++;
      } else if (delta < -0.005) {
        deltaStr = ` -${absDelta.toFixed(4)}`;
        status = '  BETTER';
        improved++;
      } else {
        deltaStr = '   ~0   ';
        status = '  =';
        unchanged++;
      }
    } else if (isFirstRun || updateBaselines) {
      deltaStr = '   NEW  ';
      status = '  BASELINE';
    } else {
      deltaStr = '     N/A';
      status = '  ?';
    }

    console.log(`  ${slideStr} | ${rmseStr} | ${baseStr} | ${deltaStr} | ${status}`);
    newBaselines[r.slideNum] = r.rmse;
  }

  // Show any slides with errors
  const errored = results.filter((r) => r.rmse == null);
  for (const r of errored) {
    console.log(
      `  ${String(r.slideNum).padStart(5)} |   ERROR  |          |         | ERROR: ${r.error ?? 'unknown'}`
    );
  }

  if (!isFirstRun && !updateBaselines) {
    console.log(`\n  Summary: ${improved} improved, ${regressed} regressed, ${unchanged} unchanged`);
  } else {
    console.log(`\n  Summary: ${results.filter((r) => r.rmse != null).length} slides baselined`);
  }

  // Top worst slides
  if (sorted.length > 0) {
    console.log('\n=== Worst Fidelity Slides ===\n');
    for (const r of sorted.slice(0, Math.min(10, sorted.length))) {
      console.log(
        `  Slide ${String(r.slideNum).padStart(2)}: RMSE=${r.rmse.toFixed(4)}  diff: ${r.diffPath}`
      );
    }
  }

  // Update baselines
  if (isFirstRun || updateBaselines) {
    fs.writeFileSync(baselinesPath, JSON.stringify(newBaselines, null, 2) + '\n');
    console.log(`\n  Baselines saved: ${baselinesPath}`);
  }

  // Write JSON report
  const report = {
    timestamp: new Date().toISOString(),
    pptxFile: pptxPath,
    slideCount,
    scale,
    targetSize,
    exportAvailable: true,
    results: results.map((r) => ({
      slide: r.slideNum,
      rmse: r.rmse,
      baseline: baselines[r.slideNum] ?? null,
      delta: r.rmse != null && baselines[r.slideNum] != null ? r.rmse - baselines[r.slideNum] : null,
    })),
    summary: {
      improved,
      regressed,
      unchanged,
      errored: errored.length,
    },
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n  JSON report: ${reportPath}`);

  // Exit with non-zero if regressions detected
  if (regressed > 0 && !isFirstRun && !updateBaselines) {
    const regressedSlides = sorted
      .filter((r) => {
        const baseline = baselines[r.slideNum];
        return r.rmse != null && baseline != null && r.rmse - baseline > REGRESSION_THRESHOLD;
      })
      .map((r) => `slide ${r.slideNum} (+${(r.rmse - baselines[r.slideNum]).toFixed(4)})`)
      .join(', ');
    console.error(
      `\nFAIL: ${regressed} slide(s) regressed beyond export fidelity threshold (${REGRESSION_THRESHOLD}): ${regressedSlides}`
    );
    process.exit(1);
  }

  if (isFirstRun || updateBaselines) {
    console.log('\nBASELINE: Baselines saved. Run again to detect regressions.');
  } else {
    console.log('\nPASS: Export fidelity within acceptable range.');
  }
} else {
  // Export not yet available — write a partial report with canvas-reference info only
  const report = {
    timestamp: new Date().toISOString(),
    pptxFile: pptxPath,
    slideCount,
    scale,
    exportAvailable: false,
    exportError: exportErrorCode,
    exportErrorMessage,
    canvasReferenceDir,
    message: exportErrorMessage ?? 'Export skipped via --skip-export',
    results: [],
    summary: null,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n  JSON report: ${reportPath}`);

  if (skipExport) {
    console.log('\nCANVAS REFERENCE ONLY: PDF export step skipped (--skip-export).');
    console.log(`  Canvas reference images saved to: ${canvasReferenceDir}`);
    console.log('  Re-run without --skip-export after W3-A is merged to compute export fidelity.');
  } else if (exportErrorCode === 'EXPORT_NOT_IMPLEMENTED') {
    console.log('\nEXPORT_NOT_IMPLEMENTED: Cannot compute export fidelity yet.');
    console.log(`  Canvas reference images saved to: ${canvasReferenceDir}`);
    console.log('  Re-run after W3-A (SlideKit.exportPDF) is merged to measure export fidelity.');
  } else {
    console.log('\nERROR: Export pipeline failed — see report for details.');
    process.exit(1);
  }
}
