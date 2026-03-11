#!/usr/bin/env node
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = '/Users/will/dev/opendockit-main';
const pptxPath = '/Users/will/dev/USG Briefing/USG Briefing Mar 7 - UNCLAS.pptx';

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

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(viteUrl, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ciReady === true, { timeout: 30000 });

const pptxB64 = fs.readFileSync(pptxPath).toString('base64');
await page.evaluate(async (b64) => {
  const arr = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  await window.__ciLoad(arr.buffer);
}, pptxB64);

const info = await page.evaluate(() => {
  const kit = window._slideKit;
  const pres = kit._presentation;
  const theme = pres.theme;

  // Check font resolution
  const testFonts = ['Barlow', 'Barlow Light', 'Barlow Medium', 'Open Sans', 'Raleway', 'Roboto Slab', 'Roboto Slab Light', '+mn-lt', '+mj-lt', 'Calibri', 'sans-serif'];
  const resolved = {};
  for (const f of testFonts) {
    resolved[f] = kit._resolveFont(f);
  }

  // Check font metrics DB
  const metricsDB = kit._fontMetricsDB;
  const metricsInfo = {};
  if (metricsDB) {
    for (const f of ['Barlow', 'Open Sans', 'Raleway', 'Roboto Slab', 'Calibri']) {
      const vm = metricsDB.getVerticalMetrics(f, 24, false, false);
      const vmBold = metricsDB.getVerticalMetrics(f, 24, true, false);
      metricsInfo[f] = {
        normal: vm ? { ascender: vm.ascender.toFixed(2), descender: vm.descender?.toFixed(2), lineHeight: vm.lineHeight?.toFixed(2) } : null,
        bold: vmBold ? { ascender: vmBold.ascender.toFixed(2), descender: vmBold.descender?.toFixed(2), lineHeight: vmBold.lineHeight?.toFixed(2) } : null,
      };
    }
  }

  // Check what text widths Canvas2D gives us vs font metrics DB
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const testStrings = ['Data-agnostic, protective wrapper; enables', 'Maximum Optimization for Size and Power'];
  const widthComparison = {};
  for (const s of testStrings) {
    const widths = {};
    for (const f of ['Barlow', 'Open Sans', 'Raleway', 'sans-serif']) {
      ctx.font = `13pt ${f}`;
      widths[f] = ctx.measureText(s).width.toFixed(1);
    }
    widthComparison[s] = widths;
  }

  return {
    theme: {
      name: theme?.name,
      fontScheme: theme?.fontScheme,
      colorSchemeKeys: theme?.colorScheme ? Object.keys(theme.colorScheme) : [],
    },
    resolved,
    metricsInfo,
    metricsDBPresent: !!metricsDB,
    widthComparison,
  };
});

console.log('\n=== THEME INFO ===');
console.log(JSON.stringify(info.theme, null, 2));

console.log('\n=== FONT RESOLUTION ===');
for (const [k, v] of Object.entries(info.resolved)) {
  console.log(`  ${k.padEnd(20)} → ${v}`);
}

console.log('\n=== FONT METRICS DB ===');
console.log(`Present: ${info.metricsDBPresent}`);
for (const [k, v] of Object.entries(info.metricsInfo)) {
  console.log(`  ${k}: normal=${JSON.stringify(v.normal)} bold=${JSON.stringify(v.bold)}`);
}

console.log('\n=== TEXT WIDTH COMPARISON (Canvas2D) ===');
for (const [s, widths] of Object.entries(info.widthComparison)) {
  console.log(`  "${s.slice(0, 40)}..."`);
  for (const [f, w] of Object.entries(widths)) {
    console.log(`    ${f.padEnd(15)} = ${w}px`);
  }
}

await browser.close();
viteProcess.kill('SIGTERM');
