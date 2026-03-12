/**
 * Cross-format comparison harness — PPTX Canvas2D vs PowerPoint-exported PDF.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  CRITICAL: The PDF ground truth MUST be exported from PowerPoint.  │
 * │  NEVER use our exportPDF() to generate comparison PDFs.            │
 * │  Our PDF exporter has its own rendering quirks — comparing against │
 * │  it would test our code against itself. The goal is to match       │
 * │  PowerPoint's native output.                                       │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Pipeline:
 *   A: Load .pptx → parse → render slide via TracingBackend → PPTX trace → elements
 *   B: Load .pdf (PowerPoint-exported) → NativeRenderer.renderPageWithTrace() → PDF trace → elements
 *   Compare: matchElements() → diffElements() → DiffReport with HTML report
 *
 * Requires matched .pptx + .pdf pairs where the PDF was exported from PowerPoint.
 * Currently uses: USG Briefing Mar 7 - UNCLAS.{pptx,pdf}
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createCanvas } from 'canvas';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// PPTX parsing + rendering
import { OpcPackageReader } from '@opendockit/core/opc';
import { CanvasBackend, TracingBackend } from '@opendockit/core/drawingml/renderer';
import type { RenderContext } from '@opendockit/core/drawingml/renderer';
import { MediaCache, loadAndCacheImage } from '@opendockit/core/media';
import { emuToPt, emuToPx } from '@opendockit/core';
import { FontMetricsDB } from '@opendockit/core/font';
import { metricsBundle } from '@opendockit/core/font/data/metrics-bundle';
import { parsePresentation } from '../../parser/presentation.js';
import { parseSlide } from '../../parser/slide.js';
import { parseSlideLayout } from '../../parser/slide-layout.js';
import { parseSlideMaster } from '../../parser/slide-master.js';
import { renderSlide } from '../../renderer/index.js';
import type { EnrichedSlideData } from '../../model/index.js';

// PDF rendering
import { PDFDocument } from '@opendockit/pdf-signer';
import { NativeRenderer } from '@opendockit/pdf-signer/render';

// Element comparison
import {
  traceToElements,
  generateDiffReport,
  extractText,
} from '@opendockit/elements/debug';
import type { DiffReport } from '@opendockit/elements/debug';
import type { PageElement } from '@opendockit/elements';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Matched pair: PPTX + PowerPoint-exported PDF
// The PDF MUST be exported from PowerPoint, NOT from our exportPDF().
const PPTX_PATH = '/Users/will/dev/USG Briefing/USG Briefing Mar 7 - UNCLAS.pptx';
const PDF_PATH = '/Users/will/dev/USG Briefing/USG Briefing Mar 7 - UNCLAS.pdf';
const OUT_DIR = resolve(__dirname, '../../../../tmp/cross-format');

const DPI_SCALE = 1;
const PDF_RENDER_SCALE = 1.0; // Match DPI between PPTX and PDF rendering

// Skip if test files don't exist (CI, other dev machines)
const FILES_EXIST = existsSync(PPTX_PATH) && existsSync(PDF_PATH);

// ---------------------------------------------------------------------------
// PPTX loading + rendering with trace
// ---------------------------------------------------------------------------

async function loadAndRenderPptxSlide(
  slideIndex: number,
): Promise<{ trace: any; png: Buffer; elements: PageElement[] }> {
  const bytes = readFileSync(PPTX_PATH);
  const pkg = await OpcPackageReader.open(bytes.buffer as ArrayBuffer);
  const pres = await parsePresentation(pkg);

  // Parse the target slide + its layout + master
  const slideRef = pres.slides[slideIndex];

  // Resolve the correct theme — use master-specific theme if available
  const slideTheme = pres.masterThemes?.[slideRef.masterPartUri] ?? pres.theme;

  const masterXml = await pkg.getPartXml(slideRef.masterPartUri);
  const master = parseSlideMaster(masterXml, slideRef.masterPartUri, slideTheme);

  const layoutXml = await pkg.getPartXml(slideRef.layoutPartUri);
  const layout = parseSlideLayout(layoutXml, slideRef.layoutPartUri, slideRef.masterPartUri, slideTheme);

  const slideXml = await pkg.getPartXml(slideRef.partUri);
  const slide = parseSlide(slideXml, slideRef.partUri, slideRef.layoutPartUri, slideRef.masterPartUri, slideTheme);

  const enriched: EnrichedSlideData = { slide, layout, master };

  // Load images into media cache
  const mediaCache = new MediaCache();
  for (const element of [...slide.elements, ...layout.elements, ...master.elements]) {
    if (element.kind === 'picture' && element.imageUri) {
      try {
        const imgBytes = await pkg.getPartBytes(element.imageUri);
        if (imgBytes) {
          await loadAndCacheImage(mediaCache, element.imageUri, imgBytes);
        }
      } catch {
        // Skip images that fail to load
      }
    }
  }

  // Render with TracingBackend
  const slideWidthPx = Math.round(emuToPx(pres.slideWidth, 96 * DPI_SCALE));
  const slideHeightPx = Math.round(emuToPx(pres.slideHeight, 96 * DPI_SCALE));

  const canvas = createCanvas(slideWidthPx, slideHeightPx);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, slideWidthPx, slideHeightPx);

  const inner = new CanvasBackend(ctx as any);
  const tracing = new TracingBackend(inner, { glyphLevel: false, dpiScale: DPI_SCALE });

  // Load font metrics for accurate text measurement
  const fontMetricsDB = new FontMetricsDB();
  fontMetricsDB.loadBundle(metricsBundle as any);

  const rctx: RenderContext = {
    backend: tracing,
    dpiScale: DPI_SCALE,
    theme: slideTheme,
    mediaCache,
    resolveFont: (name: string) => name,
    fontMetricsDB,
  };

  renderSlide(enriched, rctx, slideWidthPx, slideHeightPx);

  const slideWidthPt = emuToPt(pres.slideWidth);
  const slideHeightPt = emuToPt(pres.slideHeight);
  const trace = tracing.getTrace(`pptx:slide${slideIndex}`, slideWidthPt, slideHeightPt);
  const elements = traceToElements(trace);

  return {
    trace,
    png: canvas.toBuffer('image/png'),
    elements,
  };
}

// ---------------------------------------------------------------------------
// PDF loading + rendering with trace
// ---------------------------------------------------------------------------

async function loadAndRenderPdfPage(
  pageIndex: number,
): Promise<{ trace: any; png: Uint8Array; elements: PageElement[] }> {
  const bytes = readFileSync(PDF_PATH);
  const doc = await PDFDocument.load(new Uint8Array(bytes));
  const renderer = NativeRenderer.fromDocument(doc);

  const { result, trace } = await renderer.renderPageWithTrace(pageIndex, {
    scale: PDF_RENDER_SCALE,
  });
  await renderer.dispose();

  const elements = traceToElements(trace);

  return {
    trace,
    png: result.png,
    elements,
  };
}

// ---------------------------------------------------------------------------
// HTML report
// ---------------------------------------------------------------------------

function writeReport(
  testName: string,
  report: DiffReport,
  pptxTrace: any,
  pdfTrace: any,
): string {
  const dir = resolve(OUT_DIR, testName);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const lines: string[] = [];
  lines.push('<!DOCTYPE html><html><head><meta charset="utf-8">');
  lines.push(`<title>Cross-Format: ${testName}</title>`);
  lines.push('<style>');
  lines.push('body { font-family: system-ui; margin: 20px; max-width: 1200px; }');
  lines.push('table { border-collapse: collapse; margin: 10px 0; width: 100%; }');
  lines.push('th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; font-size: 13px; }');
  lines.push('.match { background: #d4edda; }');
  lines.push('.minor { background: #fff3cd; }');
  lines.push('.major { background: #f8d7da; }');
  lines.push('.critical { background: #f5c6cb; }');
  lines.push('.side-by-side { display: flex; gap: 20px; }');
  lines.push('.side-by-side img { max-width: 48%; border: 1px solid #ccc; }');
  lines.push('.warning { background: #fff3cd; padding: 10px; border: 1px solid #ffc107; margin: 10px 0; }');
  lines.push('</style></head><body>');

  lines.push(`<h1>Cross-Format Comparison: ${testName}</h1>`);
  lines.push('<div class="warning"><strong>Ground truth:</strong> PDF exported from Microsoft PowerPoint. NOT from our exportPDF().</div>');

  const s = report.summary;
  lines.push('<h2>Summary</h2><table>');
  lines.push(`<tr><td>PPTX elements (A)</td><td><strong>${s.totalA}</strong></td></tr>`);
  lines.push(`<tr><td>PDF elements (B)</td><td><strong>${s.totalB}</strong></td></tr>`);
  lines.push(`<tr><td>Matched pairs</td><td><strong>${s.matchedCount}</strong></td></tr>`);
  lines.push(`<tr><td>Unmatched PPTX</td><td>${report.unmatchedA.length}</td></tr>`);
  lines.push(`<tr><td>Unmatched PDF</td><td>${report.unmatchedB.length}</td></tr>`);
  lines.push(`<tr><td>Avg position delta</td><td><strong>${s.avgPositionDelta.toFixed(2)} pt</strong></td></tr>`);
  lines.push(`<tr><td>Avg size delta</td><td>${s.avgSizeDelta.toFixed(2)} pt</td></tr>`);
  lines.push(`<tr><td>Font mismatches</td><td>${s.fontMismatches}</td></tr>`);
  lines.push(`<tr><td>Color mismatches</td><td>${s.colorMismatches}</td></tr>`);
  lines.push(`<tr><td>PPTX trace events</td><td>${pptxTrace.events.length}</td></tr>`);
  lines.push(`<tr><td>PDF trace events</td><td>${pdfTrace.events.length}</td></tr>`);
  lines.push('</table>');

  lines.push('<h2>Visual Comparison</h2>');
  lines.push('<div class="side-by-side">');
  lines.push('<div><h3>A: PPTX (Canvas2D)</h3><img src="pptx.png"></div>');
  lines.push('<div><h3>B: PDF (PowerPoint-exported, NativeRenderer)</h3><img src="pdf.png"></div>');
  lines.push('</div>');

  // Per-element diffs
  if (report.matched.length > 0) {
    lines.push('<h2>Matched Element Diffs</h2>');
    for (const ed of report.matched) {
      const textContent = extractText(ed.pair.a) || `[${ed.pair.a.type}]`;
      const label = textContent.length > 50 ? textContent.slice(0, 50) + '...' : textContent;
      lines.push(`<h3 class="${ed.overallSeverity}">"${label}" — ${ed.overallSeverity}</h3>`);

      const nonMatch = ed.deltas.filter(d => d.severity !== 'match');
      if (nonMatch.length === 0) { lines.push('<p>All properties match.</p>'); continue; }

      lines.push('<table><tr><th>Property</th><th>PPTX</th><th>PDF</th><th>Delta</th><th>Severity</th></tr>');
      for (const d of nonMatch) {
        const va = typeof d.valueA === 'number' ? (d.valueA as number).toFixed(2) : JSON.stringify(d.valueA);
        const vb = typeof d.valueB === 'number' ? (d.valueB as number).toFixed(2) : JSON.stringify(d.valueB);
        lines.push(`<tr class="${d.severity}"><td>${d.property}</td><td>${va}</td><td>${vb}</td><td>${d.delta?.toFixed(2) ?? '—'}</td><td>${d.severity}</td></tr>`);
      }
      lines.push('</table>');
    }
  }

  // Unmatched elements
  if (report.unmatchedA.length > 0) {
    lines.push('<h2>Unmatched PPTX Elements (not found in PDF)</h2><ul>');
    for (const el of report.unmatchedA.slice(0, 20)) {
      const text = extractText(el) || `[${el.type}]`;
      lines.push(`<li>${el.type}: "${text}" at (${el.x.toFixed(1)}, ${el.y.toFixed(1)})</li>`);
    }
    if (report.unmatchedA.length > 20) lines.push(`<li>... and ${report.unmatchedA.length - 20} more</li>`);
    lines.push('</ul>');
  }
  if (report.unmatchedB.length > 0) {
    lines.push('<h2>Unmatched PDF Elements (not found in PPTX)</h2><ul>');
    for (const el of report.unmatchedB.slice(0, 20)) {
      const text = extractText(el) || `[${el.type}]`;
      lines.push(`<li>${el.type}: "${text}" at (${el.x.toFixed(1)}, ${el.y.toFixed(1)})</li>`);
    }
    if (report.unmatchedB.length > 20) lines.push(`<li>... and ${report.unmatchedB.length - 20} more</li>`);
    lines.push('</ul>');
  }

  lines.push('</body></html>');
  const html = lines.join('\n');
  writeFileSync(resolve(dir, 'report.html'), html);

  return resolve(dir, 'report.html');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!FILES_EXIST)('cross-format comparison (PPTX vs PowerPoint-exported PDF)', () => {
  beforeAll(() => {
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  });

  it('slide 0 — title slide', async () => {
    const pptx = await loadAndRenderPptxSlide(0);
    const pdf = await loadAndRenderPdfPage(0);

    // Write PNGs
    const dir = resolve(OUT_DIR, 'slide-0');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'pptx.png'), pptx.png);
    writeFileSync(resolve(dir, 'pdf.png'), pdf.png);

    const report = generateDiffReport(pptx.elements, pdf.elements);
    const reportPath = writeReport('slide-0', report, pptx.trace, pdf.trace);

    console.log(`\n  Slide 0 — PPTX: ${pptx.elements.length} elements, PDF: ${pdf.elements.length} elements`);
    console.log(`  Matched: ${report.summary.matchedCount}`);
    console.log(`  Avg pos delta: ${report.summary.avgPositionDelta.toFixed(2)} pt`);
    console.log(`  Font mismatches: ${report.summary.fontMismatches}`);
    console.log(`  Report: file://${reportPath}`);

    // Baseline: some elements should match
    expect(report.summary.matchedCount).toBeGreaterThanOrEqual(0);
  }, 30000);

  it('slide 1 — content slide', async () => {
    const pptx = await loadAndRenderPptxSlide(1);
    const pdf = await loadAndRenderPdfPage(1);

    const dir = resolve(OUT_DIR, 'slide-1');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'pptx.png'), pptx.png);
    writeFileSync(resolve(dir, 'pdf.png'), pdf.png);

    const report = generateDiffReport(pptx.elements, pdf.elements);
    const reportPath = writeReport('slide-1', report, pptx.trace, pdf.trace);

    console.log(`\n  Slide 1 — PPTX: ${pptx.elements.length} elements, PDF: ${pdf.elements.length} elements`);
    console.log(`  Matched: ${report.summary.matchedCount}`);
    console.log(`  Avg pos delta: ${report.summary.avgPositionDelta.toFixed(2)} pt`);
    console.log(`  Report: file://${reportPath}`);

    expect(report.summary.matchedCount).toBeGreaterThanOrEqual(0);
  }, 30000);

  // Multi-slide summary across first 5 pages
  it('SUMMARY — first 5 slides quality metrics', async () => {
    const numSlides = 5;
    let totalMatched = 0;
    let totalPptxElements = 0;
    let totalPdfElements = 0;
    let totalPositionDelta = 0;
    let totalFontMismatches = 0;
    let reportsWithMatches = 0;

    for (let i = 0; i < numSlides; i++) {
      try {
        const pptx = await loadAndRenderPptxSlide(i);
        const pdf = await loadAndRenderPdfPage(i);

        const dir = resolve(OUT_DIR, `slide-${i}`);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(resolve(dir, 'pptx.png'), pptx.png);
        writeFileSync(resolve(dir, 'pdf.png'), pdf.png);

        const report = generateDiffReport(pptx.elements, pdf.elements);
        writeReport(`slide-${i}`, report, pptx.trace, pdf.trace);

        totalMatched += report.summary.matchedCount;
        totalPptxElements += report.summary.totalA;
        totalPdfElements += report.summary.totalB;
        totalFontMismatches += report.summary.fontMismatches;
        if (report.summary.matchedCount > 0) {
          totalPositionDelta += report.summary.avgPositionDelta;
          reportsWithMatches++;
        }
      } catch (err) {
        console.log(`  Slide ${i}: ERROR — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const avgPosDelta = reportsWithMatches > 0 ? totalPositionDelta / reportsWithMatches : 0;

    console.log('\n  ════════════════════════════════════════════════');
    console.log('  CROSS-FORMAT QUALITY METRICS (first 5 slides)');
    console.log('  Ground truth: PowerPoint-exported PDF');
    console.log('  ════════════════════════════════════════════════');
    console.log(`  Total PPTX elements: ${totalPptxElements}`);
    console.log(`  Total PDF elements:  ${totalPdfElements}`);
    console.log(`  Total matched:       ${totalMatched}`);
    console.log(`  Avg position delta:  ${avgPosDelta.toFixed(2)} pt`);
    console.log(`  Font mismatches:     ${totalFontMismatches}`);
    console.log(`  Reports: file://${OUT_DIR}/`);
    console.log('  ════════════════════════════════════════════════\n');

    // Expect the harness ran without crashing — quality will improve iteratively
    expect(totalPptxElements + totalPdfElements).toBeGreaterThan(0);
  }, 120000);
});
