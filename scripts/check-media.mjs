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

const info = await page.evaluate(async () => {
  const kit = window._slideKit;
  const cache = kit._mediaCache;
  const entries = cache._entries;
  const keys = [...entries.keys()];

  const targetPaths = [
    '/ppt/media/image135.png',
    '/ppt/media/image136.png',
    '/ppt/media/image137.png',
    '/ppt/media/image138.png',
  ];

  const slide25 = [];
  for (const p of targetPaths) {
    const entry = entries.get(p);
    if (entry) {
      const d = entry.data;
      const type = d instanceof ImageBitmap ? 'ImageBitmap' :
                   d instanceof HTMLImageElement ? 'HTMLImageElement' :
                   d instanceof Uint8Array ? 'Uint8Array' : typeof d;
      slide25.push({ path: p, found: true, type, bytes: entry.byteSize, width: d.width, height: d.height });
    } else {
      slide25.push({ path: p, found: false });
    }
  }

  const byType = { ImageBitmap: 0, HTMLImageElement: 0, Uint8Array: 0, other: 0 };
  for (const [, entry] of entries) {
    const d = entry.data;
    if (d instanceof ImageBitmap) byType.ImageBitmap++;
    else if (d instanceof HTMLImageElement) byType.HTMLImageElement++;
    else if (d instanceof Uint8Array) byType.Uint8Array++;
    else byType.other++;
  }

  return {
    totalEntries: keys.length,
    totalBytes: cache._totalBytes,
    maxEntries: cache._maxEntries,
    maxBytes: cache._maxBytes,
    byType,
    slide25,
    sampleKeys: keys.slice(0, 5),
    matchingKeys: keys.filter(k => k.includes('135')),
  };
});

console.log(`Media cache: ${info.totalEntries} entries, ${(info.totalBytes/1024/1024).toFixed(1)}MB / ${(info.maxBytes/1024/1024).toFixed(0)}MB max`);
console.log(`Max entries: ${info.maxEntries}`);
console.log(`By type: ${JSON.stringify(info.byType)}`);
console.log(`Sample keys: ${info.sampleKeys.join(', ')}`);
console.log(`Keys matching '135': ${info.matchingKeys.join(', ')}`);
console.log('\nSlide 25 images:');
for (const img of info.slide25) {
  if (img.found) {
    console.log(`  ${img.path}: ${img.type} ${img.width}x${img.height} (${img.bytes} bytes)`);
  } else {
    console.log(`  ${img.path}: NOT FOUND`);
  }
}

await browser.close();
viteProcess.kill('SIGTERM');
