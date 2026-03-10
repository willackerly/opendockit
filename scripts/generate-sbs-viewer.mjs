#!/usr/bin/env node
/**
 * Generate an interactive HTML viewer with side-by-side comparisons.
 * Embeds render, reference, and diff images as base64 data URIs.
 *
 * Usage:
 *   node scripts/generate-sbs-viewer.mjs --pptx <path> --ref-dir <path> [--output path.html]
 *   pnpm sbs -- --pptx <path> --ref-dir <path>
 *
 * Options:
 *   --pptx <path>      Path to the PPTX file to render
 *   --ref-dir <path>   Directory of reference PNG images (numbered, e.g. slide1.png)
 *   --output <path>    Output HTML path (default: /tmp/sbs-viewer.html)
 *   --help             Show this help message
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ── CLI argument parsing ────────────────────────────────────────────────────
function parseArgs() {
  const args = { pptx: '', refDir: '', output: '/tmp/sbs-viewer.html' };

  for (let i = 2; i < process.argv.length; i++) {
    switch (process.argv[i]) {
      case '--pptx':
        args.pptx = process.argv[++i];
        break;
      case '--ref-dir':
        args.refDir = process.argv[++i];
        break;
      case '--output':
        args.output = process.argv[++i];
        break;
      case '--help':
      case '-h':
        console.log(`Usage: node scripts/generate-sbs-viewer.mjs --pptx <path> --ref-dir <path> [--output path.html]

Options:
  --pptx <path>      Path to the PPTX file to render
  --ref-dir <path>   Directory of reference PNG images (numbered, e.g. slide1.png)
  --output <path>    Output HTML path (default: /tmp/sbs-viewer.html)
  --help             Show this help message`);
        process.exit(0);
    }
  }

  if (!args.pptx) {
    console.error('Error: --pptx <path> is required');
    process.exit(1);
  }
  if (!args.refDir) {
    console.error('Error: --ref-dir <path> is required');
    process.exit(1);
  }

  // Resolve paths relative to cwd
  args.pptx = path.resolve(args.pptx);
  args.refDir = path.resolve(args.refDir);
  args.output = path.resolve(args.output);

  if (!fs.existsSync(args.pptx)) {
    console.error(`Error: PPTX file not found: ${args.pptx}`);
    process.exit(1);
  }
  if (!fs.existsSync(args.refDir)) {
    console.error(`Error: Reference directory not found: ${args.refDir}`);
    process.exit(1);
  }

  return args;
}

const args = parseArgs();

// ── Start Vite dev server ───────────────────────────────────────────────────
console.log('Starting Vite...');
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

// ── Launch browser and load PPTX ────────────────────────────────────────────
console.log('Launching browser...');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(viteUrl, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ciReady === true, { timeout: 30000 });

console.log(`Loading PPTX: ${args.pptx}`);
const pptxB64 = fs.readFileSync(args.pptx).toString('base64');
await page.evaluate(async (b64) => {
  const arr = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  await window.__ciLoad(arr.buffer);
}, pptxB64);

const pngFiles = fs.readdirSync(args.refDir)
  .filter(f => /\.png$/i.test(f))
  .sort((a, b) => parseInt(a.match(/\d+/)?.[0] ?? '0') - parseInt(b.match(/\d+/)?.[0] ?? '0'));

const slideCount = await page.evaluate(() => window.__ciGetSlideCount().pptx);
const maxSlide = Math.min(slideCount, pngFiles.length);

console.log(`Loading ${maxSlide} reference PNGs from: ${args.refDir}`);
for (let i = 0; i < maxSlide; i++) {
  const pngB64 = fs.readFileSync(path.join(args.refDir, pngFiles[i])).toString('base64');
  await page.evaluate(async (b64) => { await window.__ciLoadRefPng(b64); }, pngB64);
}

// ── Render slides and compute diffs ─────────────────────────────────────────
const slides = [];

for (let idx = 0; idx < maxSlide; idx++) {
  const slideNum = idx + 1;
  process.stdout.write(`\rRendering slide ${slideNum}/${maxSlide}...`);

  const result = await page.evaluate(async (slideIdx) => {
    const kit = window._slideKit;
    const pres = kit._presentation;
    const dpiScale = kit._dpiScale;
    const emuToPx = (emu, dpi) => emu / 914400 * dpi;
    const wPx = Math.round(emuToPx(pres.slideWidth, 96 * dpiScale));
    const hPx = Math.round(emuToPx(pres.slideHeight, 96 * dpiScale));

    const assessment = await window.__ciAssess(slideIdx);
    const rmse = assessment.pptxVsRef?.rmse;

    // Re-render
    const renderCanvas = document.createElement('canvas');
    renderCanvas.width = wPx;
    renderCanvas.height = hPx;
    const origCanvas = kit._canvas;
    kit._canvas = renderCanvas;
    try { await kit.renderSlide(slideIdx); } finally { kit._canvas = origCanvas; }

    // Ref
    const refImages = window._refImages || [];
    const refCanvas = document.createElement('canvas');
    refCanvas.width = wPx;
    refCanvas.height = hPx;
    const refCtx = refCanvas.getContext('2d');
    if (refImages[slideIdx]) refCtx.drawImage(refImages[slideIdx], 0, 0, wPx, hPx);

    // Diff
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
      const amp = Math.min(255, maxDiff * 5);
      if (amp > 15) {
        diffImg.data[i] = amp;
        diffImg.data[i + 1] = Math.max(0, amp - 128);
        diffImg.data[i + 2] = 0;
      } else {
        diffImg.data[i] = Math.floor(refData[i] * 0.25);
        diffImg.data[i + 1] = Math.floor(refData[i + 1] * 0.25);
        diffImg.data[i + 2] = Math.floor(refData[i + 2] * 0.25);
      }
      diffImg.data[i + 3] = 255;
    }
    diffCtx.putImageData(diffImg, 0, 0);

    // Export as JPEG (much smaller than PNG for photos)
    return {
      rmse,
      render: renderCanvas.toDataURL('image/jpeg', 0.85),
      ref: refCanvas.toDataURL('image/jpeg', 0.85),
      diff: diffCanvas.toDataURL('image/png'),
    };
  }, idx);

  slides.push({
    num: slideNum,
    rmse: result.rmse,
    render: result.render,
    ref: result.ref,
    diff: result.diff,
  });
}

// ── Build HTML output ───────────────────────────────────────────────────────
console.log('\nBuilding HTML...');

const pptxName = path.basename(args.pptx, path.extname(args.pptx));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenDocKit — SBS: ${pptxName}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #1a1a2e; color: #eee; font-family: system-ui, -apple-system, sans-serif; }
header { background: #16213e; padding: 12px 24px; display: flex; align-items: center; gap: 20px; position: sticky; top: 0; z-index: 100; border-bottom: 1px solid #0f3460; }
header h1 { font-size: 16px; font-weight: 600; white-space: nowrap; }
.nav { display: flex; gap: 4px; flex-wrap: wrap; }
.nav button { background: #0f3460; border: 1px solid #1a5276; color: #8ec; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-family: monospace; }
.nav button:hover { background: #1a5276; }
.nav button.active { background: #e94560; border-color: #e94560; color: #fff; }
.nav button.good { border-color: #2ecc71; }
.nav button.ok { border-color: #f39c12; }
.nav button.bad { border-color: #e74c3c; }
.controls { display: flex; gap: 12px; align-items: center; margin-left: auto; flex-shrink: 0; }
.controls label { font-size: 13px; cursor: pointer; user-select: none; }
.controls input[type=checkbox] { margin-right: 4px; }
.slide-container { padding: 16px; }
.slide-header { display: flex; align-items: baseline; gap: 16px; margin-bottom: 12px; }
.slide-header h2 { font-size: 20px; }
.rmse-badge { font-size: 14px; padding: 3px 10px; border-radius: 12px; font-weight: 600; font-family: monospace; }
.rmse-good { background: #27ae60; color: #fff; }
.rmse-ok { background: #f39c12; color: #000; }
.rmse-bad { background: #e74c3c; color: #fff; }
.panels { display: flex; gap: 8px; }
.panels.stacked { flex-direction: column; }
.panel { flex: 1; min-width: 0; }
.panel-label { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 4px; text-align: center; }
.panel img { width: 100%; display: block; border: 1px solid #333; border-radius: 4px; cursor: zoom-in; }
.panel img.zoomed { cursor: zoom-out; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; object-fit: contain; z-index: 200; background: rgba(0,0,0,0.9); border: none; border-radius: 0; }
.summary { background: #16213e; padding: 16px 24px; margin: 16px; border-radius: 8px; }
.summary h3 { margin-bottom: 8px; }
.summary table { width: 100%; border-collapse: collapse; font-size: 13px; font-family: monospace; }
.summary td, .summary th { padding: 4px 8px; text-align: left; border-bottom: 1px solid #0f3460; }
.bar { display: inline-block; height: 12px; border-radius: 2px; vertical-align: middle; }
.bar-good { background: #27ae60; }
.bar-ok { background: #f39c12; }
.bar-bad { background: #e74c3c; }
.hidden { display: none !important; }
.kbd { background: #333; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-family: monospace; }
</style>
</head>
<body>
<header>
  <h1>OpenDocKit — ${pptxName}</h1>
  <div class="nav" id="nav"></div>
  <div class="controls">
    <label title="Show render/ref/diff side by side or stacked">
      <input type="checkbox" id="stackToggle"> Stack
    </label>
    <label>
      <input type="checkbox" id="diffOnly"> Diff only
    </label>
    <span style="font-size:11px;color:#666">
      <span class="kbd">\u2190</span> <span class="kbd">\u2192</span> navigate &nbsp;
      <span class="kbd">D</span> diff &nbsp;
      <span class="kbd">S</span> stack
    </span>
  </div>
</header>

<div class="summary" id="summary">
  <h3>Summary — Avg RMSE: <span id="avgRmse"></span></h3>
  <table id="summaryTable"><thead><tr><th>Slide</th><th>RMSE</th><th></th></tr></thead><tbody></tbody></table>
</div>

<div id="slidesContainer"></div>

<script>
const slides = ${JSON.stringify(slides.map(s => ({ num: s.num, rmse: s.rmse })))};
const imageData = {};
${slides.map(s => `imageData[${s.num}] = { render: "${s.render}", ref: "${s.ref}", diff: "${s.diff}" };`).join('\n')}

function rmseClass(r) { return r < 0.08 ? 'good' : r < 0.15 ? 'ok' : 'bad'; }

// Build nav
const nav = document.getElementById('nav');
slides.forEach(s => {
  const btn = document.createElement('button');
  btn.textContent = s.num;
  btn.className = rmseClass(s.rmse);
  btn.dataset.slide = s.num;
  btn.onclick = () => scrollToSlide(s.num);
  nav.appendChild(btn);
});

// Build summary
const avg = slides.reduce((a, s) => a + s.rmse, 0) / slides.length;
document.getElementById('avgRmse').textContent = avg.toFixed(4);
document.getElementById('avgRmse').className = 'rmse-badge rmse-' + rmseClass(avg);
const tbody = document.querySelector('#summaryTable tbody');
[...slides].sort((a, b) => b.rmse - a.rmse).forEach(s => {
  const tr = document.createElement('tr');
  tr.style.cursor = 'pointer';
  tr.onclick = () => scrollToSlide(s.num);
  const pct = Math.min(100, s.rmse / 0.35 * 100);
  tr.innerHTML = \`<td>Slide \${s.num}</td><td>\${s.rmse.toFixed(4)}</td><td><span class="bar bar-\${rmseClass(s.rmse)}" style="width:\${pct}%"></span></td>\`;
  tbody.appendChild(tr);
});

// Build slide panels
const container = document.getElementById('slidesContainer');
slides.forEach(s => {
  const div = document.createElement('div');
  div.className = 'slide-container';
  div.id = 'slide-' + s.num;
  const cls = rmseClass(s.rmse);
  div.innerHTML = \`
    <div class="slide-header">
      <h2>Slide \${s.num}</h2>
      <span class="rmse-badge rmse-\${cls}">RMSE: \${s.rmse.toFixed(4)}</span>
    </div>
    <div class="panels" id="panels-\${s.num}">
      <div class="panel render-panel" id="renderPanel-\${s.num}">
        <div class="panel-label">Our Render</div>
        <img data-src-key="render" data-slide="\${s.num}" alt="Render">
      </div>
      <div class="panel ref-panel" id="refPanel-\${s.num}">
        <div class="panel-label">PowerPoint Reference</div>
        <img data-src-key="ref" data-slide="\${s.num}" alt="Reference">
      </div>
      <div class="panel diff-panel" id="diffPanel-\${s.num}">
        <div class="panel-label">Diff (amplified 5\u00d7)</div>
        <img data-src-key="diff" data-slide="\${s.num}" alt="Diff">
      </div>
    </div>
  \`;
  container.appendChild(div);
});

// Lazy load images with IntersectionObserver
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      const slideNum = parseInt(img.dataset.slide);
      const key = img.dataset.srcKey;
      if (imageData[slideNum] && imageData[slideNum][key]) {
        img.src = imageData[slideNum][key];
        observer.unobserve(img);
      }
    }
  });
}, { rootMargin: '500px' });

document.querySelectorAll('img[data-src-key]').forEach(img => observer.observe(img));

// Zoom on click
document.addEventListener('click', e => {
  if (e.target.tagName === 'IMG' && e.target.dataset.srcKey) {
    e.target.classList.toggle('zoomed');
  }
});

// Controls
const stackToggle = document.getElementById('stackToggle');
const diffOnly = document.getElementById('diffOnly');

stackToggle.addEventListener('change', () => {
  document.querySelectorAll('.panels').forEach(p => p.classList.toggle('stacked', stackToggle.checked));
});

diffOnly.addEventListener('change', () => {
  document.querySelectorAll('.render-panel, .ref-panel').forEach(p => p.classList.toggle('hidden', diffOnly.checked));
});

function scrollToSlide(num) {
  document.getElementById('slide-' + num)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', parseInt(b.dataset.slide) === num));
}

// Keyboard nav
let currentSlide = 1;
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    currentSlide = Math.min(slides.length, currentSlide + 1);
    scrollToSlide(currentSlide);
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    currentSlide = Math.max(1, currentSlide - 1);
    scrollToSlide(currentSlide);
  } else if (e.key === 'd' || e.key === 'D') {
    diffOnly.checked = !diffOnly.checked;
    diffOnly.dispatchEvent(new Event('change'));
  } else if (e.key === 's' || e.key === 'S') {
    stackToggle.checked = !stackToggle.checked;
    stackToggle.dispatchEvent(new Event('change'));
  } else if (e.key === 'Escape') {
    document.querySelectorAll('.zoomed').forEach(el => el.classList.remove('zoomed'));
  }
});

// Track current slide from scroll
const slideObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const num = parseInt(entry.target.id.split('-')[1]);
      currentSlide = num;
      document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', parseInt(b.dataset.slide) === num));
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.slide-container').forEach(el => slideObserver.observe(el));
</script>
</body>
</html>`;

fs.writeFileSync(args.output, html);
const sizeMB = (fs.statSync(args.output).size / 1024 / 1024).toFixed(1);
console.log(`\nViewer written to ${args.output} (${sizeMB} MB)`);
console.log(`Open: file://${args.output}`);

await browser.close();
viteProcess.kill('SIGTERM');
