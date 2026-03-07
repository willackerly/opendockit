#!/usr/bin/env tsx
/**
 * Extract font metrics from @pdf-lib/standard-fonts compressed JSON.
 * Generates TypeScript data files under src/document/fonts/data/.
 *
 * Usage: npx tsx scripts/extract-font-metrics.ts
 */

import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use createRequire to load the CJS @pdf-lib/standard-fonts package
// which isn't hoisted by pnpm
const require = createRequire(
  path.resolve(__dirname, '../node_modules/pdf-lib/package.json'),
);
const { Font } = require('@pdf-lib/standard-fonts');

const OUTPUT_DIR = path.resolve(__dirname, '../src/document/fonts/data');

interface CharMetric {
  N: string;  // glyph name
  WX: number; // width
  C: number;  // char code
}

interface FontData {
  FontName: string;
  Ascender: number;
  Descender: number;
  CapHeight: number;
  XHeight: number;
  FontBBox: [number, number, number, number];
  CharMetrics: CharMetric[];
  KernPairs: [string, string, number][];
}

const FONT_NAMES: string[] = [
  'Courier',
  'Courier-Bold',
  'Courier-Oblique',
  'Courier-BoldOblique',
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
  'Times-Roman',
  'Times-Bold',
  'Times-Italic',
  'Times-BoldItalic',
  'Symbol',
  'ZapfDingbats',
];

function sanitizeName(fontName: string): string {
  return fontName.replace(/-/g, '_');
}

function generateFontFile(fontName: string): string {
  const font: FontData = Font.load(fontName);
  const safeName = sanitizeName(fontName);

  // Build widths object: { glyphName: width }
  const widths: Record<string, number> = {};
  for (const metric of font.CharMetrics) {
    widths[metric.N] = metric.WX;
  }

  // Build kern pairs: { leftGlyph: { rightGlyph: amount } }
  const kerns: Record<string, Record<string, number>> = {};
  if (font.KernPairs) {
    for (const [left, right, amount] of font.KernPairs) {
      if (!kerns[left]) kerns[left] = {};
      kerns[left][right] = amount;
    }
  }

  const lines: string[] = [];
  lines.push(`/**`);
  lines.push(` * Font metrics for ${fontName}.`);
  lines.push(` * Auto-generated from @pdf-lib/standard-fonts — do not edit.`);
  lines.push(` */`);
  lines.push(``);
  lines.push(`import type { FontMetricsData } from '../StandardFontMetrics.js';`);
  lines.push(``);
  lines.push(`export const ${safeName}Metrics: FontMetricsData = {`);
  lines.push(`  name: '${fontName}',`);
  lines.push(`  ascender: ${font.Ascender},`);
  lines.push(`  descender: ${font.Descender},`);
  lines.push(`  fontBBox: [${font.FontBBox.join(', ')}],`);

  // Widths
  lines.push(`  widths: {`);
  const sortedGlyphs = Object.keys(widths).sort();
  for (const glyph of sortedGlyphs) {
    // Escape glyph names that aren't valid JS identifiers
    const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(glyph) ? glyph : `'${glyph}'`;
    lines.push(`    ${key}: ${widths[glyph]},`);
  }
  lines.push(`  },`);

  // Kern pairs
  const kernLefts = Object.keys(kerns).sort();
  if (kernLefts.length > 0) {
    lines.push(`  kerns: {`);
    for (const left of kernLefts) {
      const leftKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(left) ? left : `'${left}'`;
      const rights = kerns[left];
      const rightEntries = Object.keys(rights)
        .sort()
        .map(right => {
          const rk = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(right) ? right : `'${right}'`;
          return `${rk}: ${rights[right]}`;
        })
        .join(', ');
      lines.push(`    ${leftKey}: { ${rightEntries} },`);
    }
    lines.push(`  },`);
  } else {
    lines.push(`  kerns: {},`);
  }

  lines.push(`};`);
  lines.push(``);

  return lines.join('\n');
}

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const indexExports: string[] = [];

for (const fontName of FONT_NAMES) {
  const content = generateFontFile(fontName);
  const fileName = `${fontName}.ts`;
  const filePath = path.join(OUTPUT_DIR, fileName);
  fs.writeFileSync(filePath, content);
  console.log(`  Generated ${fileName} (${(content.length / 1024).toFixed(1)} KB)`);

  const safeName = sanitizeName(fontName);
  indexExports.push(
    `export { ${safeName}Metrics } from './${fontName}.js';`
  );
}

// Generate barrel export
const indexContent = [
  `/**`,
  ` * Auto-generated barrel export for font metrics data.`,
  ` */`,
  ``,
  ...indexExports,
  ``,
].join('\n');
fs.writeFileSync(path.join(OUTPUT_DIR, 'index.ts'), indexContent);
console.log(`  Generated index.ts`);

console.log(`\nDone! ${FONT_NAMES.length} font files generated in ${OUTPUT_DIR}`);
