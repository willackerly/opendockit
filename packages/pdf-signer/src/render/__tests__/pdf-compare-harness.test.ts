/**
 * PDF Rendering Comparison Harness
 *
 * Renders a PDF with NativeRenderer, compares against pdftoppm ground truth.
 * Measures per-page RMSE and generates a browsable HTML report with diffs.
 *
 * Run: pnpm test -- src/render/__tests__/pdf-compare-harness.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { PDFDocument } from '../../index.js';
import { NativeRenderer } from '../index.js';

const PDF_PATH = '/Users/will/dev/USG Briefing/USG Briefing Mar 7 - UNCLAS.pdf';
const SCALE = 2;
const MAX_PAGES = 30;

const pdfName = 'usg-briefing';
const outDir = resolve(__dirname, '../../../../tmp/pdf-compare', pdfName);

describe('PDF render vs pdftoppm', () => {
  const refPages: string[] = [];
  const ourPages: string[] = [];
  const results: Array<{ page: number; rmse: number; status: string }> = [];

  it('setup: render reference with pdftoppm', () => {
    mkdirSync(resolve(outDir, 'ref'), { recursive: true });
    mkdirSync(resolve(outDir, 'ours'), { recursive: true });
    mkdirSync(resolve(outDir, 'diff'), { recursive: true });

    const dpi = Math.round(72 * SCALE);
    execSync(`pdftoppm -png -r ${dpi} -l ${MAX_PAGES} "${PDF_PATH}" "${outDir}/ref/page"`, { stdio: 'pipe' });

    for (let i = 1; i <= 999; i++) {
      const candidates = [
        resolve(outDir, `ref/page-${i}.png`),
        resolve(outDir, `ref/page-${String(i).padStart(2, '0')}.png`),
        resolve(outDir, `ref/page-${String(i).padStart(3, '0')}.png`),
      ];
      const found = candidates.find(p => existsSync(p));
      if (found) refPages.push(found);
      else if (refPages.length > 0) break;
    }
    console.log(`\n  Reference: ${refPages.length} pages`);
    expect(refPages.length).toBeGreaterThan(0);
  });

  it('render all pages with NativeRenderer', { timeout: 120_000 }, async () => {
    const data = readFileSync(PDF_PATH);
    const doc = await PDFDocument.load(data);
    const renderer = NativeRenderer.fromDocument(doc);
    const pageCount = Math.min(renderer.pageCount, MAX_PAGES);

    for (let i = 0; i < pageCount; i++) {
      const result = await renderer.renderPage(i, { scale: SCALE });
      const outPath = resolve(outDir, `ours/page-${i + 1}.png`);
      writeFileSync(outPath, result.png);
      ourPages.push(outPath);

      const diagCount = result.diagnostics?.length ?? 0;
      if (diagCount > 0) {
        const msgs = result.diagnostics!.map(d => `[${d.category}] ${d.message}`);
        const unique = [...new Set(msgs)];
        console.log(`  Page ${i + 1}: ${result.width}x${result.height} — ${unique.join(', ')}`);
      }
    }
    console.log(`  Rendered: ${ourPages.length} pages\n`);
    expect(ourPages.length).toBe(pageCount);
  });

  it('compare RMSE per page and generate HTML report', () => {
    console.log('  Page | RMSE     | Status');
    console.log('  -----|----------|--------');

    for (let i = 0; i < Math.min(ourPages.length, refPages.length); i++) {
      const diffPath = resolve(outDir, `diff/page-${i + 1}.png`);

      try {
        // Resize our render to match ref dimensions if needed
        const refInfo = execSync(`magick identify -format "%wx%h" "${refPages[i]}"`, { encoding: 'utf8' }).trim();
        const ourInfo = execSync(`magick identify -format "%wx%h" "${ourPages[i]}"`, { encoding: 'utf8' }).trim();

        let compareOurs = ourPages[i];
        if (refInfo !== ourInfo) {
          const resizedPath = resolve(outDir, `ours/page-${i + 1}-resized.png`);
          execSync(`magick "${ourPages[i]}" -resize "${refInfo}!" "${resizedPath}"`, { stdio: 'pipe' });
          compareOurs = resizedPath;
        }

        let output = '';
        try {
          execSync(
            `magick compare -metric RMSE "${compareOurs}" "${refPages[i]}" "${diffPath}"`,
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
          );
        } catch (err: any) {
          output = err.stderr?.toString() ?? '';
        }

        const match = output.match(/\(([\d.]+)\)/);
        const rmse = match ? parseFloat(match[1]) : -1;
        const status = rmse < 0 ? '⚠️  ERR' : rmse < 0.02 ? '✅ GOOD' : rmse < 0.08 ? '⚠️  FAIR' : '❌ BAD';
        results.push({ page: i + 1, rmse, status });
        console.log(`    ${String(i + 1).padStart(2)}  | ${rmse >= 0 ? rmse.toFixed(4).padStart(8) : '   ERROR'} | ${status}`);
      } catch (err: any) {
        console.log(`    ${String(i + 1).padStart(2)}  |    ERROR | ⚠️  ERR  (${err.message?.slice(0, 60)})`);
        results.push({ page: i + 1, rmse: -1, status: '⚠️  ERR' });
      }
    }

    const valid = results.filter(r => r.rmse >= 0);
    const avg = valid.reduce((s, r) => s + r.rmse, 0) / valid.length;
    const worst = valid.reduce((w, r) => r.rmse > w.rmse ? r : w, valid[0]);
    console.log(`\n  Avg RMSE: ${avg.toFixed(4)}, Worst: page ${worst.page} (${worst.rmse.toFixed(4)})`);

    // Generate HTML report
    generateHtmlReport(results, outDir);

    console.log(`  HTML report: ${resolve(outDir, 'report.html')}`);
    console.log(`  Open: file://${resolve(outDir, 'report.html')}`);
  });
});

function generateHtmlReport(
  results: Array<{ page: number; rmse: number; status: string }>,
  dir: string,
) {
  const pages = results.map(r => {
    const refPath = resolve(dir, `ref/page-${String(r.page).padStart(2, '0')}.png`);
    const refPathAlt = resolve(dir, `ref/page-${r.page}.png`);
    const refFile = existsSync(refPath) ? refPath : refPathAlt;
    const ourFile = resolve(dir, `ours/page-${r.page}.png`);
    const diffFile = resolve(dir, `diff/page-${r.page}.png`);

    const toB64 = (p: string) => {
      try { return 'data:image/png;base64,' + readFileSync(p).toString('base64'); }
      catch { return ''; }
    };

    return {
      page: r.page,
      rmse: r.rmse,
      status: r.status,
      ref: toB64(refFile),
      ours: toB64(ourFile),
      diff: toB64(diffFile),
    };
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PDF Render Comparison — USG Briefing</title>
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
  <h1>PDF Render — NativeRenderer vs pdftoppm</h1>
  <div class="nav" id="nav"></div>
  <div class="controls">
    <label><input type="checkbox" id="stackToggle"> Stack</label>
    <label><input type="checkbox" id="diffOnly"> Diff only</label>
    <span style="font-size:11px;color:#666">
      <span class="kbd">←</span> <span class="kbd">→</span> navigate
      <span class="kbd">D</span> diff
      <span class="kbd">S</span> stack
    </span>
  </div>
</header>

<div class="summary" id="summary">
  <h3>Summary — Avg RMSE: <span id="avgRmse"></span></h3>
  <table id="summaryTable"><thead><tr><th>Page</th><th>RMSE</th><th></th></tr></thead><tbody></tbody></table>
</div>

<div id="slidesContainer"></div>

<script>
const pages = ${JSON.stringify(pages.map(p => ({ page: p.page, rmse: p.rmse })))};
const imageData = {};
${pages.map(p => `imageData[${p.page}] = { ours: "${p.ours.slice(0, 50)}…TRUNCATED", ref: "${p.ref.slice(0, 50)}…TRUNCATED", diff: "${p.diff.slice(0, 50)}…TRUNCATED" };`).join('\n')}

// Full image data (split to avoid script parsing issues)
${pages.map(p => `imageData[${p.page}].ours = \`${p.ours}\`;
imageData[${p.page}].ref = \`${p.ref}\`;
imageData[${p.page}].diff = \`${p.diff}\`;`).join('\n')}

function rmseClass(r) { return r < 0.05 ? 'good' : r < 0.10 ? 'ok' : 'bad'; }

const nav = document.getElementById('nav');
pages.forEach(s => {
  const btn = document.createElement('button');
  btn.textContent = s.page;
  btn.className = rmseClass(s.rmse);
  btn.dataset.slide = s.page;
  btn.onclick = () => scrollToSlide(s.page);
  nav.appendChild(btn);
});

const valid = pages.filter(s => s.rmse >= 0);
const avg = valid.reduce((a, s) => a + s.rmse, 0) / valid.length;
document.getElementById('avgRmse').textContent = avg.toFixed(4);
document.getElementById('avgRmse').className = 'rmse-badge rmse-' + rmseClass(avg);
const tbody = document.querySelector('#summaryTable tbody');
[...pages].sort((a, b) => b.rmse - a.rmse).forEach(s => {
  const tr = document.createElement('tr');
  tr.style.cursor = 'pointer';
  tr.onclick = () => scrollToSlide(s.page);
  const pct = Math.min(100, s.rmse / 0.35 * 100);
  tr.innerHTML = '<td>Page ' + s.page + '</td><td>' + s.rmse.toFixed(4) + '</td><td><span class="bar bar-' + rmseClass(s.rmse) + '" style="width:' + pct + '%"></span></td>';
  tbody.appendChild(tr);
});

const container = document.getElementById('slidesContainer');
pages.forEach(s => {
  const div = document.createElement('div');
  div.className = 'slide-container';
  div.id = 'slide-' + s.page;
  const cls = rmseClass(s.rmse);
  div.innerHTML = '<div class="slide-header"><h2>Page ' + s.page + '</h2><span class="rmse-badge rmse-' + cls + '">RMSE: ' + s.rmse.toFixed(4) + '</span></div>' +
    '<div class="panels" id="panels-' + s.page + '">' +
    '<div class="panel ours-panel"><div class="panel-label">NativeRenderer</div><img data-src-key="ours" data-slide="' + s.page + '" alt="Ours"></div>' +
    '<div class="panel ref-panel"><div class="panel-label">pdftoppm (Ground Truth)</div><img data-src-key="ref" data-slide="' + s.page + '" alt="Reference"></div>' +
    '<div class="panel diff-panel"><div class="panel-label">Diff</div><img data-src-key="diff" data-slide="' + s.page + '" alt="Diff"></div>' +
    '</div>';
  container.appendChild(div);
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      const num = parseInt(img.dataset.slide);
      const key = img.dataset.srcKey;
      if (imageData[num] && imageData[num][key]) {
        img.src = imageData[num][key];
        observer.unobserve(img);
      }
    }
  });
}, { rootMargin: '500px' });

document.querySelectorAll('img[data-src-key]').forEach(img => observer.observe(img));

document.addEventListener('click', e => {
  if (e.target.tagName === 'IMG' && e.target.dataset.srcKey) {
    e.target.classList.toggle('zoomed');
  }
});

const stackToggle = document.getElementById('stackToggle');
const diffOnly = document.getElementById('diffOnly');
stackToggle.addEventListener('change', () => {
  document.querySelectorAll('.panels').forEach(p => p.classList.toggle('stacked', stackToggle.checked));
});
diffOnly.addEventListener('change', () => {
  document.querySelectorAll('.ours-panel, .ref-panel').forEach(p => p.classList.toggle('hidden', diffOnly.checked));
});

function scrollToSlide(num) {
  document.getElementById('slide-' + num)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', parseInt(b.dataset.slide) === num));
}

let currentSlide = 1;
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    currentSlide = Math.min(pages.length, currentSlide + 1);
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

  writeFileSync(resolve(dir, 'report.html'), html);
}
