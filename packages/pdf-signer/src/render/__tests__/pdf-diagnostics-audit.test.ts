/**
 * Diagnostic audit: render all test PDFs and report diagnostics.
 * Run with: pnpm test -- src/render/__tests__/pdf-diagnostics-audit.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PDFDocument } from '../../index.js';
import { NativeRenderer } from '../index.js';

const BASE = resolve(__dirname, '../../../');

function loadPdf(rel: string): Uint8Array {
  return readFileSync(resolve(BASE, rel));
}

const testPdfs = [
  'test-pdfs/working/ic-ciso-visit.pdf',
  'test-pdfs/chrome-google-docs/complex-with-images-chrome-print.pdf',
  'test-pdfs/chrome-google-docs/text-with-images-google-docs.pdf',
  'test-pdfs/working/wire-instructions.pdf',
  'test-pdfs/working/simple-test.pdf',
  'test-pdfs/working/test-document.pdf',
];

describe('PDF rendering diagnostics audit', () => {
  for (const rel of testPdfs) {
    const name = rel.split('/').pop()!;

    it(`renders ${name} and reports diagnostics`, async () => {
      const data = loadPdf(rel);
      const doc = await PDFDocument.load(data);
      const renderer = NativeRenderer.fromDocument(doc);

      const allDiagnostics: Array<{ page: number; category: string; message: string; details?: Record<string, unknown> }> = [];

      for (let i = 0; i < Math.min(renderer.pageCount, 5); i++) {
        const result = await renderer.renderPage(i, { scale: 1.0 });
        expect(result.png.length).toBeGreaterThan(0);

        if (result.diagnostics) {
          for (const d of result.diagnostics) {
            allDiagnostics.push({ page: i + 1, category: d.category, message: d.message, details: d.details });
          }
        }
      }

      // Log diagnostics summary
      if (allDiagnostics.length > 0) {
        console.log(`\n📋 ${name}: ${allDiagnostics.length} diagnostics across ${Math.min(renderer.pageCount, 5)} pages`);
        // Group by message
        const groups: Record<string, { count: number; pages: number[] }> = {};
        for (const d of allDiagnostics) {
          const key = `[${d.category}] ${d.message}`;
          if (!groups[key]) groups[key] = { count: 0, pages: [] };
          groups[key].count++;
          if (!groups[key].pages.includes(d.page)) groups[key].pages.push(d.page);
        }
        for (const [msg, info] of Object.entries(groups)) {
          const sample = allDiagnostics.find(d => `[${d.category}] ${d.message}` === msg);
          console.log(`  ${info.count > 1 ? `(x${info.count}) ` : ''}${msg} [pages: ${info.pages.join(',')}]`);
          if (sample?.details) console.log(`    Details:`, JSON.stringify(sample.details));
        }
      } else {
        console.log(`\n✅ ${name}: 0 diagnostics`);
      }
    });
  }
});
