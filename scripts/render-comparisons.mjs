#!/usr/bin/env node
/**
 * Render side-by-side comparison PNGs for all (or specific) slides.
 * Uses the CI bridge's ciAssess internally and exposes render + ref canvases.
 * Usage: node scripts/render-comparisons.mjs [--slide N] [--output-dir DIR]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = '/Users/will/dev/opendockit-main';
const pptxPath = '/Users/will/dev/USG Briefing/USG Briefing Mar 7 - UNCLAS.pptx';
const pngDir = '/Users/will/dev/USG Briefing/PNG-USG Briefing Mar 7 - UNCLAS';

let targetSlide = null;
let outputDir = '/tmp/slide-comparisons';
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--slide') targetSlide = parseInt(process.argv[++i], 10) - 1;
  if (process.argv[i] === '--output-dir') outputDir = process.argv[++i];
}

fs.mkdirSync(outputDir, { recursive: true });

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

const slideCount = await page.evaluate(() => window.__ciGetSlideCount().pptx);
const maxSlide = Math.min(slideCount, pngFiles.length);

for (let i = 0; i < maxSlide; i++) {
  const pngB64 = fs.readFileSync(path.join(pngDir, pngFiles[i])).toString('base64');
  await page.evaluate(async (b64) => { await window.__ciLoadRefPng(b64); }, pngB64);
}

// Inject a comparison renderer that hooks into ciAssess internals
// by monkey-patching to capture the canvases
await page.evaluate(() => {
  // Store last rendered canvases globally
  window._lastRenderCanvas = null;
  window._lastRefCanvas = null;
});

const startIdx = targetSlide ?? 0;
const endIdx = targetSlide != null ? targetSlide + 1 : maxSlide;

for (let idx = startIdx; idx < endIdx; idx++) {
  const slideNum = idx + 1;
  process.stdout.write(`Slide ${slideNum}...`);

  const result = await page.evaluate(async (slideIdx) => {
    const kit = window._slideKit;
    const pres = kit._presentation;
    const dpiScale = kit._dpiScale;
    const emuToPx = (emu, dpi) => emu / 914400 * dpi;
    const wPx = Math.round(emuToPx(pres.slideWidth, 96 * dpiScale));
    const hPx = Math.round(emuToPx(pres.slideHeight, 96 * dpiScale));

    // Run ciAssess which does the full rendering internally
    const assessment = await window.__ciAssess(slideIdx);
    const rmse = assessment.pptxVsRef?.rmse;

    // Now we need to replicate what ciAssess does to get the canvases.
    // ciAssess creates a pptxCanvas internally but doesn't expose it.
    // We need to re-render. Use the SlideKit's renderSlide which renders
    // to its internal canvas.

    // Create a fresh canvas and have the kit render to it
    const renderCanvas = document.createElement('canvas');
    renderCanvas.width = wPx;
    renderCanvas.height = hPx;

    // Save original canvas reference, swap in ours, render, swap back
    const origCanvas = kit._canvas;
    kit._canvas = renderCanvas;
    try {
      await kit.renderSlide(slideIdx);
    } finally {
      kit._canvas = origCanvas;
    }

    // Get ref image and draw to canvas at matching size
    const refImages = window._refImages || [];
    const refCanvas = document.createElement('canvas');
    refCanvas.width = wPx;
    refCanvas.height = hPx;
    const refCtx = refCanvas.getContext('2d');
    if (refImages[slideIdx]) {
      refCtx.drawImage(refImages[slideIdx], 0, 0, wPx, hPx);
    }

    // Create diff heat map
    const rCtx = renderCanvas.getContext('2d');
    const renderData = rCtx.getImageData(0, 0, wPx, hPx).data;
    const refData = refCtx.getImageData(0, 0, wPx, hPx).data;

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = wPx;
    diffCanvas.height = hPx;
    const diffCtx = diffCanvas.getContext('2d');
    const diffImg = diffCtx.createImageData(wPx, hPx);

    for (let i = 0; i < renderData.length; i += 4) {
      const dr = Math.abs(renderData[i] - refData[i]);
      const dg = Math.abs(renderData[i + 1] - refData[i + 1]);
      const db = Math.abs(renderData[i + 2] - refData[i + 2]);
      const maxDiff = Math.max(dr, dg, db);
      const amp = Math.min(255, maxDiff * 4);
      if (amp > 20) {
        diffImg.data[i] = amp;
        diffImg.data[i + 1] = Math.min(255, amp > 128 ? (amp - 128) * 2 : 0);
        diffImg.data[i + 2] = 0;
      } else {
        diffImg.data[i] = Math.floor(refData[i] * 0.3);
        diffImg.data[i + 1] = Math.floor(refData[i + 1] * 0.3);
        diffImg.data[i + 2] = Math.floor(refData[i + 2] * 0.3);
      }
      diffImg.data[i + 3] = 255;
    }
    diffCtx.putImageData(diffImg, 0, 0);

    // Create side-by-side composite
    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = wPx * 3;
    compositeCanvas.height = hPx + 40;
    const compCtx = compositeCanvas.getContext('2d');

    compCtx.fillStyle = '#333';
    compCtx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);

    compCtx.fillStyle = '#fff';
    compCtx.font = 'bold 20px sans-serif';
    compCtx.textAlign = 'center';
    compCtx.fillText(`SlideKit PPTX (Slide ${slideIdx + 1})`, wPx * 0.5, 25);
    compCtx.fillText('PowerPoint Reference', wPx * 1.5, 25);
    const rmseStr = rmse != null ? rmse.toFixed(4) : '?';
    compCtx.fillText(`Diff (RMSE: ${rmseStr})`, wPx * 2.5, 25);

    compCtx.drawImage(renderCanvas, 0, 35);
    compCtx.drawImage(refCanvas, wPx, 35);
    compCtx.drawImage(diffCanvas, wPx * 2, 35);

    return {
      rmse,
      composite: compositeCanvas.toDataURL('image/png'),
    };
  }, idx);

  const b64 = result.composite.split(',')[1];
  const outPath = path.join(outputDir, `slide${String(slideNum).padStart(2, '0')}-comparison.png`);
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  console.log(` RMSE: ${result.rmse?.toFixed(4)} → ${outPath}`);
}

console.log(`\nAll comparisons saved to ${outputDir}/`);

await browser.close();
viteProcess.kill('SIGTERM');
