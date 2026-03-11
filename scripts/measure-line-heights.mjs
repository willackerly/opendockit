#!/usr/bin/env node
/**
 * Compare actual rendered line positions between our render and the reference PNG.
 * Finds horizontal scan lines where text appears and compares Y positions.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = '/Users/will/dev/opendockit-main';
const pptxPath = '/Users/will/dev/USG Briefing/USG Briefing Mar 7 - UNCLAS.pptx';
const pngDir = '/Users/will/dev/USG Briefing/PNG-USG Briefing Mar 7 - UNCLAS';
const targetSlide = parseInt(process.argv[2] || '28', 10) - 1; // 0-indexed

const viteProcess = spawn('npx', ['vite', '--port', '0'], {
  cwd: path.join(projectRoot, 'tools', 'element-debug'),
  stdio: ['ignore', 'pipe', 'pipe'],
});

const viteUrl = await new Promise((resolve, reject) => {
  let output = '';
  const timeout = setTimeout(() => reject(new Error('Vite timeout')), 30000);
  viteProcess.stdout.on('data', (chunk) => {
    output += chunk.toString();
    const match = output.match(/Local:\s+(http:\/\/localhost:\d+)/);
    if (match) { clearTimeout(timeout); resolve(match[1]); }
  });
});

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(viteUrl, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ciReady === true, { timeout: 30000 });

// Load PPTX
const pptxB64 = fs.readFileSync(pptxPath).toString('base64');
await page.evaluate(async (b64) => {
  const arr = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  await window.__ciLoad(arr.buffer);
}, pptxB64);

// Load ref PNG for this slide
const pngFiles = fs.readdirSync(pngDir)
  .filter(f => /\.png$/i.test(f))
  .sort((a, b) => parseInt(a.match(/\d+/)?.[0] ?? '0') - parseInt(b.match(/\d+/)?.[0] ?? '0'));

for (let i = 0; i <= targetSlide && i < pngFiles.length; i++) {
  const pngB64 = fs.readFileSync(path.join(pngDir, pngFiles[i])).toString('base64');
  await page.evaluate(async (b64) => { await window.__ciLoadRefPng(b64); }, pngB64);
}

// Render slide and analyze line positions
const analysis = await page.evaluate(async (idx) => {
  const kit = window._slideKit;
  const pres = kit._presentation;
  const dpiScale = kit._dpiScale;

  // Import emuToPx
  const emuToPx = (emu, dpi) => emu / 914400 * dpi;
  const wPx = emuToPx(pres.slideWidth, 96 * dpiScale);
  const hPx = emuToPx(pres.slideHeight, 96 * dpiScale);

  // Render PPTX slide
  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = wPx;
  renderCanvas.height = hPx;
  const ctx = renderCanvas.getContext('2d');

  // Use the full __ciAssess path which handles rendering
  const result = await window.__ciAssess(idx);

  // Now re-render to get pixel data
  ctx.clearRect(0, 0, wPx, hPx);

  // Actually we need to render again since __ciAssess creates internal canvases
  // Let's import and call renderSlide directly
  const { TracingBackend, CanvasBackend, renderSlide } = await import('@opendockit/core/drawingml/renderer');
  const { emuToPx: emuToPxCore } = await import('@opendockit/core');

  const tb = new TracingBackend(new CanvasBackend(ctx), { dpiScale, glyphLevel: false });
  const enriched = await kit._getOrParseSlide(idx);
  const colorMap = {
    ...enriched.master?.colorMap,
    ...(enriched.layout?.colorMap ?? {}),
    ...(enriched.slide?.colorMap ?? {}),
  };

  const slideWidthPt = emuToPxCore(pres.slideWidth, 72);
  const slideHeightPt = emuToPxCore(pres.slideHeight, 72);

  renderSlide(enriched, {
    backend: tb,
    dpiScale,
    theme: pres.theme,
    mediaCache: kit._mediaCache,
    resolveFont: (n) => kit._resolveFont(n),
    colorMap,
    fontMetricsDB: kit._fontMetricsDB,
    slideNumber: idx + 1,
  }, wPx, hPx);

  // Get reference image
  const refImages = window._refImages || [];
  if (!refImages[idx]) return { error: 'No ref image for slide ' + idx };

  const refCanvas = document.createElement('canvas');
  refCanvas.width = wPx;
  refCanvas.height = hPx;
  const refCtx = refCanvas.getContext('2d');
  refCtx.drawImage(refImages[idx], 0, 0, wPx, hPx);

  const renderData = ctx.getImageData(0, 0, wPx, hPx).data;
  const refData = refCtx.getImageData(0, 0, wPx, hPx).data;

  // Find text lines by scanning for horizontal runs of dark pixels
  // against light background (or light pixels on dark background)
  // Compute per-row difference energy
  const rowDiffs = [];
  for (let y = 0; y < hPx; y++) {
    let rowEnergy = 0;
    for (let x = 0; x < wPx; x++) {
      const i = (y * wPx + x) * 4;
      const dr = renderData[i] - refData[i];
      const dg = renderData[i + 1] - refData[i + 1];
      const db = renderData[i + 2] - refData[i + 2];
      rowEnergy += Math.sqrt(dr * dr + dg * dg + db * db);
    }
    rowDiffs.push(rowEnergy / wPx);
  }

  // Find peaks in row difference energy (where text lines differ)
  const threshold = 10;
  const peaks = [];
  let inPeak = false;
  let peakStart = 0;
  let peakMax = 0;
  let peakMaxY = 0;

  for (let y = 0; y < hPx; y++) {
    if (rowDiffs[y] > threshold) {
      if (!inPeak) { inPeak = true; peakStart = y; peakMax = 0; }
      if (rowDiffs[y] > peakMax) { peakMax = rowDiffs[y]; peakMaxY = y; }
    } else if (inPeak) {
      peaks.push({ startY: peakStart, endY: y - 1, peakY: peakMaxY, energy: peakMax.toFixed(1) });
      inPeak = false;
    }
  }

  // Also compute the RMSE for just the top/bottom/left/right quadrants
  const halfW = Math.floor(wPx / 2);
  const halfH = Math.floor(hPx / 2);
  const quadrants = { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 };
  const quadCounts = { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 };

  for (let y = 0; y < hPx; y++) {
    for (let x = 0; x < wPx; x++) {
      const i = (y * wPx + x) * 4;
      const dr = renderData[i] - refData[i];
      const dg = renderData[i + 1] - refData[i + 1];
      const db = renderData[i + 2] - refData[i + 2];
      const dist2 = dr * dr + dg * dg + db * db;
      const q = y < halfH ? (x < halfW ? 'topLeft' : 'topRight') : (x < halfW ? 'bottomLeft' : 'bottomRight');
      quadrants[q] += dist2;
      quadCounts[q]++;
    }
  }

  for (const q of Object.keys(quadrants)) {
    quadrants[q] = Math.sqrt(quadrants[q] / quadCounts[q]) / 255;
  }

  return {
    slideIndex: idx,
    canvasSize: { width: wPx, height: hPx },
    diffPeaks: peaks.slice(0, 30), // Top 30 peaks
    totalPeaks: peaks.length,
    quadrantRMSE: quadrants,
    pptxRmse: result.pptxVsRef?.rmse,
  };
}, targetSlide);

// Also expose refImages
await page.evaluate(() => {
  // The refImages array is module-scoped in debug-viewer.ts, need to expose it
});

console.log(`\nSlide ${targetSlide + 1} Analysis:`);
console.log(`Canvas: ${analysis.canvasSize?.width}x${analysis.canvasSize?.height}`);
console.log(`RMSE: ${analysis.pptxRmse?.toFixed(4)}`);

if (analysis.quadrantRMSE) {
  console.log('\nQuadrant RMSE:');
  for (const [q, rmse] of Object.entries(analysis.quadrantRMSE)) {
    console.log(`  ${q.padEnd(15)} ${rmse.toFixed(4)}`);
  }
}

if (analysis.diffPeaks) {
  console.log(`\nDifference Peaks (${analysis.totalPeaks} total, showing top 30):`);
  console.log('  Y-range      Peak-Y   Energy');
  for (const p of analysis.diffPeaks) {
    console.log(`  ${String(p.startY).padStart(4)}-${String(p.endY).padEnd(4)}   ${String(p.peakY).padStart(6)}   ${p.energy}`);
  }
}

await browser.close();
viteProcess.kill('SIGTERM');
