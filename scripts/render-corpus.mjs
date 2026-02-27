#!/usr/bin/env node
/**
 * Render all corpus PPTX files to PNG images via the dev viewer.
 *
 * Usage:
 *   node scripts/render-corpus.mjs [corpus-dir] [output-dir]
 *
 * Defaults:
 *   corpus-dir: test-data/corpus
 *   output-dir: ../pptx-pdf-comparisons/corpus-rendered
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const args = process.argv.slice(2);

const corpusDir = path.resolve(args[0] ?? path.join(projectRoot, 'test-data', 'corpus'));
const outputDir = path.resolve(
  args[1] ?? path.join(projectRoot, '..', 'pptx-pdf-comparisons', 'corpus-rendered')
);

const pptxFiles = fs
  .readdirSync(corpusDir)
  .filter((f) => f.endsWith('.pptx'))
  .sort();

if (pptxFiles.length === 0) {
  console.error(`No PPTX files found in ${corpusDir}`);
  process.exit(1);
}

console.log(`Found ${pptxFiles.length} PPTX files in ${corpusDir}`);
fs.mkdirSync(outputDir, { recursive: true });

// ---------------------------------------------------------------------------
// Step 1: Start Vite dev server
// ---------------------------------------------------------------------------

console.log('\n=== Starting Vite dev server ===');

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
// Step 2: Launch browser and load fonts
// ---------------------------------------------------------------------------

const browser = await chromium.launch();
const context = await browser.newContext({
  deviceScaleFactor: 2,
  viewport: { width: 1400, height: 900 },
});

const VARIANT_DESCRIPTORS = {
  regular: {},
  bold: { weight: 'bold' },
  italic: { style: 'italic' },
  boldItalic: { weight: 'bold', style: 'italic' },
};

// Load bundled WOFF2 fonts
const manifestPath = pathToFileURL(
  path.join(projectRoot, 'packages/core/dist/font/data/woff2/manifest.js')
).href;
const { BUNDLED_FONTS } = await import(manifestPath);

const moduleCache = new Map();
const woff2Dir = path.join(projectRoot, 'packages/core/dist/font/data/woff2');

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
    const descriptors = VARIANT_DESCRIPTORS[variant] ?? {};
    variants.push({ variant, b64, descriptors });
  }

  if (variants.length > 0) {
    fontEntries.push({ registerAs: entry.registerAs, variants });
  }
}

console.log(`  Prepared ${fontEntries.length} font families`);

// ---------------------------------------------------------------------------
// Step 3: Render each PPTX
// ---------------------------------------------------------------------------

for (const pptxFile of pptxFiles) {
  const baseName = pptxFile.replace('.pptx', '');
  const pptxPath = path.join(corpusDir, pptxFile);
  const fileOutDir = path.join(outputDir, baseName);
  fs.mkdirSync(fileOutDir, { recursive: true });

  console.log(`\n=== Rendering: ${pptxFile} ===`);

  const page = await context.newPage();
  await page.goto(viteUrl, { waitUntil: 'networkidle' });

  // Inject fonts
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
              () => {}
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

  // Load PPTX
  const fileInput = page.locator('#file-input');
  await fileInput.setInputFiles(pptxPath);

  // Wait for render
  try {
    await page.waitForFunction(
      () => {
        const status = document.getElementById('status');
        return status?.textContent?.startsWith('Rendered ');
      },
      { timeout: 60_000 }
    );
  } catch {
    console.log(`  TIMEOUT: ${pptxFile} did not finish rendering`);
    await page.close();
    continue;
  }

  const statusText = await page.locator('#status').textContent();
  console.log(`  ${statusText}`);

  // Capture console warnings (diagnostics)
  const diagnostics = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning' && msg.text().includes('OOXML FEATURE UNSUPPORTED')) {
      diagnostics.push(msg.text());
    }
  });

  // Extract slide images
  const slideCount = await page.locator('.slide-image').count();

  for (let i = 0; i < slideCount; i++) {
    const img = page.locator('.slide-image').nth(i);
    await img.scrollIntoViewIfNeeded();
    await page.waitForTimeout(50);

    const dataUrl = await img.getAttribute('src');
    if (dataUrl && dataUrl.startsWith('data:image/png;base64,')) {
      const base64Data = dataUrl.replace('data:image/png;base64,', '');
      const buffer = Buffer.from(base64Data, 'base64');
      const outFile = path.join(fileOutDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
      fs.writeFileSync(outFile, buffer);
    }
  }

  console.log(`  Saved ${slideCount} slides to ${fileOutDir}/`);

  if (diagnostics.length > 0) {
    console.log(`  Diagnostics (${diagnostics.length}):`);
    for (const d of diagnostics) {
      console.log(`    ${d}`);
    }
    // Write diagnostics to file
    fs.writeFileSync(path.join(fileOutDir, 'diagnostics.txt'), diagnostics.join('\n') + '\n');
  }

  await page.close();
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

await browser.close();
if (viteProcess) viteProcess.kill('SIGTERM');

console.log(`\n=== Done! All renders in ${outputDir} ===`);
