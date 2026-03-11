/**
 * Canvas Tree Harness — integration test that renders a real PDF with
 * trace capture enabled and validates the structural output.
 *
 * This is the end-to-end proof that CanvasTreeRecorder works with
 * NativeRenderer on real PDF content.
 *
 * Run: pnpm test -- src/render/__tests__/canvas-tree-harness.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { PDFDocument } from '../../index.js';
import { NativeRenderer } from '../index.js';
import type { TextTraceEvent, ShapeTraceEvent, ImageTraceEvent } from '../canvas-tree-recorder.js';

const PDF_PATH = '/Users/will/dev/USG Briefing/USG Briefing Mar 7 - UNCLAS.pdf';
const outDir = resolve(__dirname, '../../../../tmp/pdf-compare/usg-briefing');

describe('Canvas Tree integration', () => {
  it('captures trace events from a real PDF page', async () => {
    const pdfBytes = readFileSync(PDF_PATH);
    const doc = await PDFDocument.load(pdfBytes);
    const renderer = NativeRenderer.fromDocument(doc);

    // Render page 0 with trace capture
    const { result, trace } = await renderer.renderPageWithTrace(0, { scale: 2 });

    // Basic validation
    expect(result.png.length).toBeGreaterThan(0);
    expect(trace.events.length).toBeGreaterThan(0);
    expect(trace.source).toBe('pdf:page0');

    // Count event types
    const textEvents = trace.events.filter(e => e.kind === 'text') as TextTraceEvent[];
    const shapeEvents = trace.events.filter(e => e.kind === 'shape') as ShapeTraceEvent[];
    const imageEvents = trace.events.filter(e => e.kind === 'image') as ImageTraceEvent[];

    console.log(`\nPage 0 trace summary:`);
    console.log(`  Total events: ${trace.events.length}`);
    console.log(`  Text events: ${textEvents.length}`);
    console.log(`  Shape events: ${shapeEvents.length}`);
    console.log(`  Image events: ${imageEvents.length}`);
    console.log(`  Page size: ${trace.slideWidthPt} x ${trace.slideHeightPt} pt`);

    // Should have text (this PDF has text on every page)
    expect(textEvents.length).toBeGreaterThan(0);

    // Check text events have valid data
    for (const ev of textEvents.slice(0, 5)) {
      expect(ev.text.length).toBeGreaterThan(0);
      expect(ev.fontSizePt).toBeGreaterThan(0);
      expect(ev.fontString.length).toBeGreaterThan(0);
      expect(ev.fillStyle.length).toBeGreaterThan(0);
      expect(ev.ctm).toHaveLength(6);
    }

    // Print first 10 text events for inspection
    console.log(`\n  First 10 text events:`);
    for (const ev of textEvents.slice(0, 10)) {
      console.log(`    "${ev.text}" at (${ev.x.toFixed(1)}, ${ev.y.toFixed(1)}) ${ev.fontSizePt}pt ${ev.fontString}`);
    }
  });

  it('captures traces for multiple pages and generates summary', async () => {
    const pdfBytes = readFileSync(PDF_PATH);
    const doc = await PDFDocument.load(pdfBytes);
    const renderer = NativeRenderer.fromDocument(doc);

    const pagesToTest = Math.min(5, renderer.pageCount);
    const summaries: Array<{ page: number; text: number; shape: number; image: number; total: number }> = [];

    for (let i = 0; i < pagesToTest; i++) {
      const { trace } = await renderer.renderPageWithTrace(i, { scale: 2 });

      const textCount = trace.events.filter(e => e.kind === 'text').length;
      const shapeCount = trace.events.filter(e => e.kind === 'shape').length;
      const imageCount = trace.events.filter(e => e.kind === 'image').length;

      summaries.push({
        page: i,
        text: textCount,
        shape: shapeCount,
        image: imageCount,
        total: trace.events.length,
      });
    }

    console.log('\nTrace capture summary (first 5 pages):');
    console.log('  Page | Text | Shape | Image | Total');
    console.log('  -----|------|-------|-------|------');
    for (const s of summaries) {
      console.log(`  ${String(s.page).padStart(4)} | ${String(s.text).padStart(4)} | ${String(s.shape).padStart(5)} | ${String(s.image).padStart(5)} | ${String(s.total).padStart(5)}`);
    }

    // Every page should have some events
    for (const s of summaries) {
      expect(s.total).toBeGreaterThan(0);
    }
  });

  it('generates trace analysis HTML report', async () => {
    const pdfBytes = readFileSync(PDF_PATH);
    const doc = await PDFDocument.load(pdfBytes);
    const renderer = NativeRenderer.fromDocument(doc);

    const pagesToAnalyze = Math.min(5, renderer.pageCount);
    const pageData: Array<{
      page: number;
      textEvents: TextTraceEvent[];
      fontFamilies: Set<string>;
      fontSizes: Set<number>;
    }> = [];

    for (let i = 0; i < pagesToAnalyze; i++) {
      const { trace } = await renderer.renderPageWithTrace(i, { scale: 2 });
      const textEvents = trace.events.filter(e => e.kind === 'text') as TextTraceEvent[];

      const fontFamilies = new Set<string>();
      const fontSizes = new Set<number>();
      for (const ev of textEvents) {
        // Extract font family from CSS font string
        const match = ev.fontString.match(/(\d+(?:\.\d+)?)px\s+(.+)/);
        if (match) fontFamilies.add(match[2]);
        fontSizes.add(Math.round(ev.fontSizePt * 10) / 10);
      }

      pageData.push({ page: i, textEvents, fontFamilies, fontSizes });
    }

    // Generate analysis report
    const html = generateTraceReport(pageData);
    mkdirSync(outDir, { recursive: true });
    const reportPath = resolve(outDir, 'trace-analysis.html');
    writeFileSync(reportPath, html);
    console.log(`\nTrace analysis report: ${reportPath}`);
    console.log(`  Open: file://${reportPath}`);
  });
});

function generateTraceReport(
  pages: Array<{
    page: number;
    textEvents: TextTraceEvent[];
    fontFamilies: Set<string>;
    fontSizes: Set<number>;
  }>
): string {
  const rows = pages.map(p => {
    const fonts = [...p.fontFamilies].sort().join(', ');
    const sizes = [...p.fontSizes].sort((a, b) => a - b).join(', ');
    return `<tr>
      <td>${p.page}</td>
      <td>${p.textEvents.length}</td>
      <td style="max-width:400px;overflow:hidden;text-overflow:ellipsis">${fonts}</td>
      <td>${sizes}</td>
    </tr>`;
  }).join('\n');

  // Build text content preview for each page
  const pageDetails = pages.map(p => {
    const textContent = p.textEvents.map(e => e.text).join('');
    const words = textContent.replace(/\s+/g, ' ').trim();
    const preview = words.length > 200 ? words.slice(0, 200) + '...' : words;

    const fontUsage = new Map<string, number>();
    for (const ev of p.textEvents) {
      const match = ev.fontString.match(/(\d+(?:\.\d+)?)px\s+(.+)/);
      const family = match ? match[2] : 'unknown';
      fontUsage.set(family, (fontUsage.get(family) ?? 0) + 1);
    }

    const fontTable = [...fontUsage.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([f, count]) => `<tr><td>${f}</td><td>${count}</td></tr>`)
      .join('\n');

    return `
    <details>
      <summary>Page ${p.page} — ${p.textEvents.length} text events, ${p.fontFamilies.size} fonts</summary>
      <h4>Text Content</h4>
      <p style="background:#f5f5f5;padding:8px;border-radius:4px;font-size:12px">${preview}</p>
      <h4>Font Usage</h4>
      <table border="1" cellpadding="4" cellspacing="0">
        <tr><th>Font Family</th><th>Glyph Count</th></tr>
        ${fontTable}
      </table>
    </details>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <title>Canvas Tree Trace Analysis</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 20px auto; padding: 0 20px; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    th { background: #333; color: white; padding: 8px; text-align: left; }
    td { padding: 6px 8px; border-bottom: 1px solid #ddd; }
    details { margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
    summary { cursor: pointer; font-weight: bold; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 8px; }
  </style>
</head>
<body>
  <h1>Canvas Tree Trace Analysis</h1>
  <p>Generated: ${new Date().toISOString()}</p>
  <p>This report shows the structured rendering operations captured by CanvasTreeRecorder
  during PDF rendering. Each text event represents a single glyph drawn via fillText().</p>

  <h2>Summary</h2>
  <table border="1" cellpadding="4" cellspacing="0">
    <tr><th>Page</th><th>Text Events</th><th>Font Families</th><th>Font Sizes (pt)</th></tr>
    ${rows}
  </table>

  <h2>Per-Page Details</h2>
  ${pageDetails}
</body>
</html>`;
}
