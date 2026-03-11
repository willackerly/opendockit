#!/usr/bin/env node
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = '/Users/will/dev/opendockit-main';
const pptxPath = '/Users/will/dev/USG Briefing/USG Briefing Mar 7 - UNCLAS.pptx';

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

const fontInfo = await page.evaluate(async () => {
  const kit = window._slideKit;

  // Get loaded fonts set
  const loadedFonts = [...kit._loadedFonts];

  // Check FontFace API for all registered fonts
  const fontFaces = [];
  for (const face of document.fonts) {
    fontFaces.push({
      family: face.family,
      style: face.style,
      weight: face.weight,
      status: face.status,
    });
  }

  // Test which fonts are actually available by checking if measurement differs from fallback
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const testString = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  ctx.font = '24px monospace';
  const monoWidth = ctx.measureText(testString).width;
  ctx.font = '24px sans-serif';
  const sansWidth = ctx.measureText(testString).width;

  const testFamilies = [
    'Barlow', 'Barlow Light', 'Barlow Medium', 'Barlow SemiBold',
    'Open Sans', 'Raleway', 'Roboto Slab', 'Roboto Slab Light',
    'Arial', 'Carlito', 'Calibri',
  ];

  const available = {};
  for (const f of testFamilies) {
    ctx.font = `24px '${f}', monospace`;
    const width = ctx.measureText(testString).width;
    // If width differs from monospace fallback, font is loaded
    available[f] = {
      loaded: Math.abs(width - monoWidth) > 1,
      width: width.toFixed(1),
      sansWidth: sansWidth.toFixed(1),
      monoWidth: monoWidth.toFixed(1),
    };
  }

  // Also check document.fonts.check()
  const checkResults = {};
  for (const f of testFamilies) {
    checkResults[f] = document.fonts.check(`24px '${f}'`);
  }

  return { loadedFonts, fontFaceCount: fontFaces.length, fontFaces: fontFaces.slice(0, 30), available, checkResults };
});

console.log('\n=== LOADED FONTS (SlideKit) ===');
console.log(fontInfo.loadedFonts.sort().join(', '));

console.log(`\n=== FONT FACES REGISTERED (${fontInfo.fontFaceCount}) ===`);
for (const f of fontInfo.fontFaces) {
  console.log(`  ${f.family.padEnd(25)} ${f.weight.padEnd(6)} ${f.style.padEnd(8)} ${f.status}`);
}

console.log('\n=== FONT AVAILABILITY ===');
for (const [f, info] of Object.entries(fontInfo.available)) {
  const check = fontInfo.checkResults[f];
  console.log(`  ${f.padEnd(25)} loaded: ${String(info.loaded).padEnd(5)} check: ${String(check).padEnd(5)} width: ${info.width}`);
}

await browser.close();
viteProcess.kill('SIGTERM');
