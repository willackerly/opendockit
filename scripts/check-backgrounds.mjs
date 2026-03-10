#!/usr/bin/env node
/**
 * Check if slide backgrounds are rendering correctly.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = '/Users/will/dev/opendockit-main';
const pptxPath = '/Users/will/dev/USG Briefing/USG Briefing Mar 7 - UNCLAS.pptx';
const pngDir = '/Users/will/dev/USG Briefing/PNG-USG Briefing Mar 7 - UNCLAS';

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

// Load all ref PNGs
const pngFiles = fs.readdirSync(pngDir)
  .filter(f => /\.png$/i.test(f))
  .sort((a, b) => parseInt(a.match(/\d+/)?.[0] ?? '0') - parseInt(b.match(/\d+/)?.[0] ?? '0'));

for (let i = 0; i < pngFiles.length; i++) {
  const pngB64 = fs.readFileSync(path.join(pngDir, pngFiles[i])).toString('base64');
  await page.evaluate(async (b64) => { await window.__ciLoadRefPng(b64); }, pngB64);
}

// Check backgrounds for each slide
const results = await page.evaluate(async () => {
  const kit = window._slideKit;
  const pres = kit._presentation;
  const slideCount = pres.slideCount || 30;
  const results = [];

  for (let idx = 0; idx < slideCount; idx++) {
    const enriched = await kit._getOrParseSlide(idx);
    const slideBg = enriched.slide?.background;
    const layoutBg = enriched.layout?.background;
    const masterBg = enriched.master?.background;
    const effectiveBg = slideBg ?? layoutBg ?? masterBg;

    results.push({
      slide: idx + 1,
      slideBg: slideBg ? JSON.stringify(slideBg.fill?.type) : 'none',
      layoutBg: layoutBg ? JSON.stringify(layoutBg.fill?.type) : 'none',
      masterBg: masterBg ? JSON.stringify(masterBg.fill?.type) : 'none',
      effectiveBgType: effectiveBg?.fill?.type || 'none',
      effectiveBgDetail: effectiveBg?.fill ? JSON.stringify(effectiveBg.fill).substring(0, 100) : 'none',
    });
  }
  return results;
}, undefined);

console.log('Slide backgrounds:');
console.log('Slide  SlideBg    LayoutBg   MasterBg   Effective');
for (const r of results) {
  console.log(`  ${String(r.slide).padStart(2)}   ${r.slideBg.padEnd(10)} ${r.layoutBg.padEnd(10)} ${r.masterBg.padEnd(10)} ${r.effectiveBgType} → ${r.effectiveBgDetail}`);
}

await browser.close();
viteProcess.kill('SIGTERM');
