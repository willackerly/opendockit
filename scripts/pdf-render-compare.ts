/**
 * PDF Rendering Comparison Harness
 *
 * Renders a PDF with our NativeRenderer and pdftoppm (ground truth),
 * then measures per-page RMSE to quantify rendering quality.
 *
 * Usage:
 *   npx tsx scripts/pdf-render-compare.ts <pdf-path> [--pages N] [--scale S]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, basename } from 'path';

// --- Args ---
const args = process.argv.slice(2);
const pdfPath = args.find(a => !a.startsWith('--'));
if (!pdfPath) {
  console.error('Usage: npx tsx scripts/pdf-render-compare.ts <pdf-path> [--pages N] [--scale S]');
  process.exit(1);
}
const maxPages = parseInt(args.find(a => a.startsWith('--pages'))?.split('=')[1] ?? args[args.indexOf('--pages') + 1] ?? '5');
const scale = parseFloat(args.find(a => a.startsWith('--scale'))?.split('=')[1] ?? args[args.indexOf('--scale') + 1] ?? '2');

const pdfName = basename(pdfPath, '.pdf').replace(/\s+/g, '-').toLowerCase();
const outDir = resolve('tmp/pdf-compare', pdfName);
mkdirSync(resolve(outDir, 'ours'), { recursive: true });
mkdirSync(resolve(outDir, 'ref'), { recursive: true });
mkdirSync(resolve(outDir, 'diff'), { recursive: true });

console.log(`\n📄 PDF: ${basename(pdfPath)}`);
console.log(`📁 Output: ${outDir}`);
console.log(`🔍 Scale: ${scale}, Max pages: ${maxPages}\n`);

// --- Step 1: Render with pdftoppm (ground truth) ---
console.log('Step 1: Rendering ground truth with pdftoppm...');
const dpi = Math.round(72 * scale);
execSync(`pdftoppm -png -r ${dpi} -l ${maxPages} "${pdfPath}" "${outDir}/ref/page"`, { stdio: 'pipe' });

// Find ref pages (pdftoppm uses zero-padded names like page-01.png)
const refPages: string[] = [];
for (let i = 1; i <= 999; i++) {
  const candidates = [
    resolve(outDir, `ref/page-${i}.png`),
    resolve(outDir, `ref/page-${String(i).padStart(2, '0')}.png`),
    resolve(outDir, `ref/page-${String(i).padStart(3, '0')}.png`),
  ];
  const found = candidates.find(p => existsSync(p));
  if (found) refPages.push(found);
  else if (refPages.length > 0) break; // stop after last found
}
console.log(`  → ${refPages.length} reference pages rendered\n`);

// --- Step 2: Render with our NativeRenderer ---
console.log('Step 2: Rendering with NativeRenderer...');

async function renderOurs() {
  const { PDFDocument } = await import('../packages/pdf-signer/src/index.js');
  const { NativeRenderer } = await import('../packages/pdf-signer/src/render/index.js');

  const data = readFileSync(resolve(pdfPath!));
  const doc = await PDFDocument.load(data);
  const renderer = NativeRenderer.fromDocument(doc);
  const pageCount = Math.min(renderer.pageCount, maxPages);

  const ourPages: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    const result = await renderer.renderPage(i, { scale });
    const outPath = resolve(outDir, `ours/page-${i + 1}.png`);
    writeFileSync(outPath, result.png);
    ourPages.push(outPath);

    if (result.diagnostics && result.diagnostics.length > 0) {
      console.log(`  Page ${i + 1}: ${result.width}x${result.height} — ${result.diagnostics.length} diagnostics`);
      const groups: Record<string, number> = {};
      for (const d of result.diagnostics) {
        const key = `[${d.category}] ${d.message}`;
        groups[key] = (groups[key] || 0) + 1;
      }
      for (const [msg, count] of Object.entries(groups)) {
        console.log(`    ${count > 1 ? `(×${count}) ` : ''}${msg}`);
      }
    } else {
      console.log(`  Page ${i + 1}: ${result.width}x${result.height} — clean`);
    }
  }
  return ourPages;
}

async function main() {
const ourPages = await renderOurs();
console.log(`  → ${ourPages.length} pages rendered\n`);

// --- Step 3: Compare with ImageMagick ---
console.log('Step 3: Comparing (RMSE)...\n');
console.log('Page | RMSE     | Status');
console.log('-----|----------|--------');

const results: Array<{ page: number; rmse: number; status: string }> = [];

for (let i = 0; i < Math.min(ourPages.length, refPages.length); i++) {
  const diffPath = resolve(outDir, `diff/page-${i + 1}.png`);

  try {
    // Resize our render to match ref dimensions, then compare
    const refInfo = execSync(`magick identify -format "%wx%h" "${refPages[i]}"`, { encoding: 'utf8' }).trim();
    const ourInfo = execSync(`magick identify -format "%wx%h" "${ourPages[i]}"`, { encoding: 'utf8' }).trim();

    let compareOurs = ourPages[i];
    if (refInfo !== ourInfo) {
      const resizedPath = resolve(outDir, `ours/page-${i + 1}-resized.png`);
      execSync(`magick "${ourPages[i]}" -resize "${refInfo}!" "${resizedPath}"`, { stdio: 'pipe' });
      compareOurs = resizedPath;
    }

    // magick compare outputs RMSE to stderr and returns exit code 1 when images differ
    let output = '';
    try {
      execSync(
        `magick compare -metric RMSE "${compareOurs}" "${refPages[i]}" "${diffPath}"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
    } catch (cmpErr: any) {
      // Exit code 1 is normal (images differ). Capture stderr which has the metric.
      output = cmpErr.stderr?.toString() ?? cmpErr.stdout?.toString() ?? cmpErr.message ?? '';
    }

    const match = output.match(/\(([\d.]+)\)/);
    const rmse = match ? parseFloat(match[1]) : -1;
    const status = rmse < 0 ? '⚠️  ERR' : rmse < 0.02 ? '✅ GOOD' : rmse < 0.08 ? '⚠️  FAIR' : '❌ BAD';
    results.push({ page: i + 1, rmse, status });
    console.log(`  ${String(i + 1).padStart(2)}  | ${rmse >= 0 ? rmse.toFixed(4).padStart(8) : '   ERROR'} | ${status}`);
  } catch (err: any) {
    console.log(`  ${String(i + 1).padStart(2)}  |    ERROR | ⚠️  ERR  (${err.message?.slice(0, 60)})`);
    results.push({ page: i + 1, rmse: -1, status: '⚠️  ERR' });
  }
}

// Summary
const avgRmse = results.filter(r => r.rmse >= 0).reduce((s, r) => s + r.rmse, 0) / results.filter(r => r.rmse >= 0).length;
const worst = results.reduce((w, r) => r.rmse > w.rmse ? r : w, results[0]);
const good = results.filter(r => r.rmse >= 0 && r.rmse < 0.01).length;
const fair = results.filter(r => r.rmse >= 0.01 && r.rmse < 0.05).length;
const bad = results.filter(r => r.rmse >= 0.05).length;

console.log(`\n${'─'.repeat(40)}`);
console.log(`📊 Summary: ${results.length} pages compared`);
console.log(`   Avg RMSE: ${avgRmse.toFixed(4)}`);
console.log(`   Worst:    Page ${worst.page} (${worst.rmse.toFixed(4)})`);
console.log(`   ✅ Good (<0.01): ${good}  ⚠️ Fair (<0.05): ${fair}  ❌ Bad (≥0.05): ${bad}`);
console.log(`\n   Outputs: ${outDir}/`);
console.log(`   Diff images: ${outDir}/diff/`);
}

main().catch(err => { console.error(err); process.exit(1); });
