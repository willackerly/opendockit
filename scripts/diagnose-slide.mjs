#!/usr/bin/env node
/**
 * Diagnose rendering differences for specific slides.
 * Dumps paragraph layout details (spacing, line heights, wrap points).
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = '/Users/will/dev/opendockit-main';
const pptxPath = '/Users/will/dev/USG Briefing/USG Briefing Mar 7 - UNCLAS.pptx';
const targetSlides = [28, 29, 25, 9]; // 0-indexed internally

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
console.log(`Vite at ${viteUrl}`);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', msg => { if (msg.type() === 'error') console.error(`[browser] ${msg.text()}`); });
await page.goto(viteUrl, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ciReady === true, { timeout: 30000 });

// Load PPTX
const pptxB64 = fs.readFileSync(pptxPath).toString('base64');
await page.evaluate(async (b64) => {
  const arr = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  await window.__ciLoad(arr.buffer);
}, pptxB64);

// For each target slide, dump rendering diagnostics
for (const slideIdx of targetSlides) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SLIDE ${slideIdx + 1} DIAGNOSTICS`);
  console.log('='.repeat(60));

  const diag = await page.evaluate(async (idx) => {
    // Access SlideKit internals
    const kit = window._slideKit;
    if (!kit) return { error: 'No slideKit' };

    const enriched = await kit._getOrParseSlide(idx);
    const slide = enriched.slide;

    const results = [];

    // Look at all shapes with text on this slide
    function inspectElements(elements, path = '') {
      for (const el of elements) {
        if (el.type === 'group' && el.children) {
          inspectElements(el.children, path + 'grp/');
          continue;
        }

        const textBody = el.textBody;
        if (!textBody || !textBody.paragraphs || textBody.paragraphs.length === 0) continue;

        const shapeName = el.name || el.type || 'unknown';
        const bodyProps = textBody.bodyProperties || {};

        const paraInfo = [];
        for (let pi = 0; pi < textBody.paragraphs.length; pi++) {
          const p = textBody.paragraphs[pi];
          const props = p.properties || {};
          const text = p.runs
            .filter(r => r.kind === 'run')
            .map(r => r.text)
            .join('')
            .slice(0, 80);

          // Get run font sizes
          const runSizes = p.runs
            .filter(r => r.kind === 'run')
            .map(r => ({
              fontSize: r.properties?.fontSize,
              fontFamily: r.properties?.fontFamily || r.properties?.latin,
              bold: r.properties?.bold,
            }));

          paraInfo.push({
            index: pi,
            text: text || '(empty)',
            level: props.level ?? 0,
            alignment: props.alignment,
            spaceBefore: props.spaceBefore,
            spaceAfter: props.spaceAfter,
            lineSpacing: props.lineSpacing,
            marginLeft: props.marginLeft,
            indent: props.indent,
            bullet: p.bulletProperties?.type,
            runs: runSizes,
          });
        }

        results.push({
          path: path + shapeName,
          type: el.type,
          bodyProps: {
            wrap: bodyProps.wrap,
            verticalAlign: bodyProps.verticalAlign,
            autoFit: bodyProps.autoFit,
            fontScale: bodyProps.fontScale,
            lnSpcReduction: bodyProps.lnSpcReduction,
            leftInset: bodyProps.leftInset,
            rightInset: bodyProps.rightInset,
            topInset: bodyProps.topInset,
            bottomInset: bodyProps.bottomInset,
            spcFirstLastPara: bodyProps.spcFirstLastPara,
          },
          paragraphs: paraInfo,
        });
      }
    }

    inspectElements(slide.elements || []);

    // Also check master/layout defaults
    const masterDefaults = enriched.master?.textDefaults;
    const layoutDefaults = enriched.layout?.textDefaults;

    return {
      shapeCount: (slide.elements || []).length,
      shapes: results,
      masterDefaultsPresent: !!masterDefaults,
      layoutDefaultsPresent: !!layoutDefaults,
    };
  }, slideIdx);

  if (diag.error) {
    console.log('Error:', diag.error);
    continue;
  }

  console.log(`Shapes: ${diag.shapeCount}, with text: ${diag.shapes.length}`);
  console.log(`Master defaults: ${diag.masterDefaultsPresent}, Layout defaults: ${diag.layoutDefaultsPresent}`);

  for (const shape of diag.shapes) {
    console.log(`\n  Shape: "${shape.path}" (${shape.type})`);
    console.log(`  Body: wrap=${shape.bodyProps.wrap} align=${shape.bodyProps.verticalAlign} autoFit=${shape.bodyProps.autoFit}`);
    if (shape.bodyProps.fontScale) console.log(`  fontScale=${shape.bodyProps.fontScale} lnSpcReduction=${shape.bodyProps.lnSpcReduction}`);

    for (const p of shape.paragraphs) {
      const spcB = p.spaceBefore ? `spcBef=${JSON.stringify(p.spaceBefore)}` : '';
      const spcA = p.spaceAfter ? `spcAft=${JSON.stringify(p.spaceAfter)}` : '';
      const lnSpc = p.lineSpacing ? `lnSpc=${JSON.stringify(p.lineSpacing)}` : '';
      const spacing = [spcB, spcA, lnSpc].filter(Boolean).join(' ');
      const fontSize = p.runs[0]?.fontSize ? `${p.runs[0].fontSize / 100}pt` : '?pt';
      const fontFamily = p.runs[0]?.fontFamily || '?';
      const bold = p.runs[0]?.bold ? ' B' : '';
      const bullet = p.bullet ? ` [${p.bullet}]` : '';
      const indent = p.indent ? ` indent=${p.indent}` : '';
      const margin = p.marginLeft ? ` marL=${p.marginLeft}` : '';

      console.log(`    P${p.index}: L${p.level}${bullet}${indent}${margin} ${fontSize} ${fontFamily}${bold} ${spacing}`);
      console.log(`      "${p.text}"`);
    }
  }
}

await browser.close();
viteProcess.kill('SIGTERM');
