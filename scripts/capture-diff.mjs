#!/usr/bin/env node
/**
 * Analyze per-region pixel differences for a slide using the debug viewer.
 * Navigates to the slide in the debug viewer UI, then extracts pixel data.
 * Usage: node scripts/capture-diff.mjs [slide-number]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = '/Users/will/dev/opendockit-main';
const pptxPath = '/Users/will/dev/USG Briefing/USG Briefing Mar 7 - UNCLAS.pptx';
const pngDir = '/Users/will/dev/USG Briefing/PNG-USG Briefing Mar 7 - UNCLAS';
const targetSlide = parseInt(process.argv[2] || '25', 10) - 1;

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

const pptxB64 = fs.readFileSync(pptxPath).toString('base64');
await page.evaluate(async (b64) => {
  const arr = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  await window.__ciLoad(arr.buffer);
}, pptxB64);

const pngFiles = fs.readdirSync(pngDir)
  .filter(f => /\.png$/i.test(f))
  .sort((a, b) => parseInt(a.match(/\d+/)?.[0] ?? '0') - parseInt(b.match(/\d+/)?.[0] ?? '0'));

for (let i = 0; i <= targetSlide && i < pngFiles.length; i++) {
  const pngB64 = fs.readFileSync(path.join(pngDir, pngFiles[i])).toString('base64');
  await page.evaluate(async (b64) => { await window.__ciLoadRefPng(b64); }, pngB64);
}

// Use __ciAssess to render and get RMSE
const assessment = await page.evaluate(async (idx) => {
  return await window.__ciAssess(idx);
}, targetSlide);

// Now get the canvas that the debug viewer's slide kit rendered to
// We need to access it. The SlideKit has a canvas property.
const analysis = await page.evaluate(async (idx) => {
  const kit = window._slideKit;
  const pres = kit._presentation;
  const dpiScale = kit._dpiScale;
  const emuToPx = (emu, dpi) => emu / 914400 * dpi;
  const wPx = Math.round(emuToPx(pres.slideWidth, 96 * dpiScale));
  const hPx = Math.round(emuToPx(pres.slideHeight, 96 * dpiScale));

  // Render the slide through the kit (which handles the full pipeline)
  // by calling renderSlide on the kit itself
  const canvas = document.createElement('canvas');
  canvas.width = wPx;
  canvas.height = hPx;

  // Use the kit's internal method
  kit._canvas = canvas;
  kit._ctx = canvas.getContext('2d');
  await kit.renderSlide(idx);

  const renderData = kit._ctx.getImageData(0, 0, wPx, hPx).data;

  // Get ref
  const refImages = window._refImages || [];
  const refCanvas = document.createElement('canvas');
  refCanvas.width = wPx;
  refCanvas.height = hPx;
  const refCtx = refCanvas.getContext('2d');
  if (refImages[idx]) {
    refCtx.drawImage(refImages[idx], 0, 0, wPx, hPx);
  }
  const refData = refCtx.getImageData(0, 0, wPx, hPx).data;

  // Row energy
  const rowEnergy = [];
  for (let y = 0; y < hPx; y++) {
    let e = 0;
    for (let x = 0; x < wPx; x++) {
      const i = (y * wPx + x) * 4;
      const dr = renderData[i] - refData[i];
      const dg = renderData[i + 1] - refData[i + 1];
      const db = renderData[i + 2] - refData[i + 2];
      e += Math.sqrt(dr*dr + dg*dg + db*db);
    }
    rowEnergy.push(e / wPx);
  }

  // Find bands
  const bands = [];
  let inBand = false, bandStart = 0, bandEnergy = 0, bandPeak = 0;
  for (let y = 0; y < hPx; y++) {
    if (rowEnergy[y] > 5) {
      if (!inBand) { inBand = true; bandStart = y; bandEnergy = 0; bandPeak = 0; }
      bandEnergy += rowEnergy[y];
      bandPeak = Math.max(bandPeak, rowEnergy[y]);
    } else if (inBand) {
      bands.push({ startY: bandStart, endY: y - 1, height: y - bandStart, totalEnergy: bandEnergy, peakEnergy: bandPeak });
      inBand = false;
    }
  }
  if (inBand) bands.push({ startY: bandStart, endY: hPx - 1, height: hPx - bandStart, totalEnergy: bandEnergy, peakEnergy: bandPeak });
  bands.sort((a, b) => b.totalEnergy - a.totalEnergy);

  const topBands = bands.slice(0, 10).map(b => {
    const midY = Math.floor((b.startY + b.endY) / 2);
    const samples = [];
    for (let x = 0; x < wPx; x += Math.floor(wPx / 20)) {
      const i = (midY * wPx + x) * 4;
      const dr = Math.abs(renderData[i] - refData[i]);
      const dg = Math.abs(renderData[i + 1] - refData[i + 1]);
      const db = Math.abs(renderData[i + 2] - refData[i + 2]);
      if (dr + dg + db > 30) {
        samples.push({
          x, y: midY,
          render: `rgb(${renderData[i]},${renderData[i+1]},${renderData[i+2]})`,
          ref: `rgb(${refData[i]},${refData[i+1]},${refData[i+2]})`,
          diff: dr + dg + db,
        });
      }
    }
    return { ...b, totalEnergy: b.totalEnergy.toFixed(0), peakEnergy: b.peakEnergy.toFixed(1), samples: samples.slice(0, 5) };
  });

  // Column energy
  const colBands = [];
  const colEnergy = [];
  for (let x = 0; x < wPx; x++) {
    let e = 0;
    for (let y = 0; y < hPx; y++) {
      const i = (y * wPx + x) * 4;
      const dr = renderData[i] - refData[i];
      const dg = renderData[i + 1] - refData[i + 1];
      const db = renderData[i + 2] - refData[i + 2];
      e += Math.sqrt(dr*dr + dg*dg + db*db);
    }
    colEnergy.push(e / hPx);
  }
  inBand = false;
  for (let x = 0; x < wPx; x++) {
    if (colEnergy[x] > 5) {
      if (!inBand) { inBand = true; bandStart = x; bandEnergy = 0; bandPeak = 0; }
      bandEnergy += colEnergy[x];
      bandPeak = Math.max(bandPeak, colEnergy[x]);
    } else if (inBand) {
      colBands.push({ startX: bandStart, endX: x - 1, width: x - bandStart, totalEnergy: bandEnergy.toFixed(0), peakEnergy: bandPeak.toFixed(1) });
      inBand = false;
    }
  }
  colBands.sort((a, b) => parseFloat(b.totalEnergy) - parseFloat(a.totalEnergy));

  // Quadrant analysis
  const halfW = Math.floor(wPx / 2);
  const halfH = Math.floor(hPx / 2);
  const quads = { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 };
  const quadCounts = { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 };
  for (let y = 0; y < hPx; y++) {
    for (let x = 0; x < wPx; x++) {
      const i = (y * wPx + x) * 4;
      const dr = renderData[i] - refData[i];
      const dg = renderData[i + 1] - refData[i + 1];
      const db = renderData[i + 2] - refData[i + 2];
      const dist2 = dr*dr + dg*dg + db*db;
      const q = y < halfH ? (x < halfW ? 'topLeft' : 'topRight') : (x < halfW ? 'bottomLeft' : 'bottomRight');
      quads[q] += dist2;
      quadCounts[q]++;
    }
  }
  for (const q of Object.keys(quads)) quads[q] = Math.sqrt(quads[q] / quadCounts[q]) / 255;

  return { canvasSize: { w: wPx, h: hPx }, topBands, topColBands: colBands.slice(0, 10), quads };
}, targetSlide);

console.log(`\nSlide ${targetSlide + 1} RMSE: ${assessment.pptxVsRef?.rmse?.toFixed(4)}`);
console.log(`Canvas: ${analysis.canvasSize.w}x${analysis.canvasSize.h}`);

console.log(`\nQuadrant RMSE:`);
for (const [q, rmse] of Object.entries(analysis.quads)) {
  console.log(`  ${q.padEnd(15)} ${rmse.toFixed(4)}`);
}

console.log(`\nTop horizontal difference bands:`);
console.log('  Y-range      Height  Energy     Peak');
for (const b of analysis.topBands) {
  console.log(`  ${String(b.startY).padStart(4)}-${String(b.endY).padEnd(4)}   ${String(b.height).padStart(4)}px   ${b.totalEnergy.padStart(8)}   ${b.peakEnergy}`);
  for (const s of b.samples) {
    console.log(`    x=${s.x} render:${s.render} ref:${s.ref} Δ=${s.diff}`);
  }
}

console.log(`\nTop vertical difference bands:`);
console.log('  X-range      Width   Energy     Peak');
for (const b of analysis.topColBands) {
  console.log(`  ${String(b.startX).padStart(4)}-${String(b.endX).padEnd(4)}   ${String(b.width).padStart(4)}px   ${b.totalEnergy.padStart(8)}   ${b.peakEnergy}`);
}

await browser.close();
viteProcess.kill('SIGTERM');
