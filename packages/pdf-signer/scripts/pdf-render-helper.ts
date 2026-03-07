#!/usr/bin/env tsx
/**
 * PDF render helper — renders a single PDF page with both renderers and writes PNGs.
 *
 * Used by scripts/visual-compare-pdf.mjs as a subprocess (via tsx).
 * Run from the pdf-signer package directory so node_modules can be resolved.
 *
 * Usage:
 *   tsx packages/pdf-signer/scripts/pdf-render-helper.ts \
 *     <pdf-path> <page-index> <reference-out> <native-out>
 *
 * Outputs:
 *   <reference-out>  PDF.js reference render (PNG)
 *   <native-out>     NativeRenderer render (PNG)
 *
 * Both renders use scale=2.0 (~144 DPI on US Letter).
 *
 * Stdout (for parent process to parse):
 *   REF:<width>x<height>
 *   NATIVE:<width>x<height>
 *
 * Exit codes:
 *   0  success
 *   1  render error
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCALE = 2.0; // ~144 DPI on US Letter

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.length < 4) {
  console.error(
    'Usage: tsx packages/pdf-signer/scripts/pdf-render-helper.ts ' +
    '<pdf-path> <page-index> <reference-out> <native-out>',
  );
  process.exit(1);
}

const pdfPath = path.resolve(args[0]);
const pageIndex = parseInt(args[1], 10);
const referenceOut = path.resolve(args[2]);
const nativeOut = path.resolve(args[3]);

if (!fs.existsSync(pdfPath)) {
  console.error(`PDF not found: ${pdfPath}`);
  process.exit(1);
}

if (isNaN(pageIndex) || pageIndex < 0) {
  console.error(`Invalid page index: ${args[1]}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Resolve src/ path relative to this script
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, '..', 'src');

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const pdfBytes = new Uint8Array(fs.readFileSync(pdfPath));

  // -------------------------------------------------------------------------
  // Step 1: Reference render with PDF.js + node-canvas
  // -------------------------------------------------------------------------

  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { createCanvas } = await import('canvas');

    // Custom CanvasFactory — ensures all PDF.js canvases use the same node-canvas
    // binding (required so drawImage InstanceOf check doesn't fail on internal temps).
    class NodeCanvasFactory {
      create(width: number, height: number) {
        const canvas = createCanvas(width, height);
        return { canvas, context: canvas.getContext('2d') };
      }
      reset(cc: any, width: number, height: number) {
        cc.canvas.width = width;
        cc.canvas.height = height;
      }
      destroy(cc: any) {
        cc.canvas.width = 0;
        cc.canvas.height = 0;
      }
    }

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBytes),
      useSystemFonts: true,
      isEvalSupported: false,
      CanvasFactory: NodeCanvasFactory,
    });

    const doc = await loadingTask.promise;

    if (pageIndex >= doc.numPages) {
      console.error(`Page index ${pageIndex} out of range (0..${doc.numPages - 1})`);
      await doc.destroy();
      process.exit(1);
    }

    const page = await doc.getPage(pageIndex + 1); // PDF.js is 1-based
    const viewport = page.getViewport({ scale: SCALE });

    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);
    const { canvas, context } = (doc as any).canvasFactory.create(width, height);

    // White background (match the NativeRenderer default)
    context.fillStyle = 'white';
    context.fillRect(0, 0, width, height);

    await page.render({ canvasContext: context, viewport }).promise;
    await doc.destroy();

    const refPng: Buffer = canvas.toBuffer('image/png');
    fs.mkdirSync(path.dirname(referenceOut), { recursive: true });
    fs.writeFileSync(referenceOut, refPng);
    process.stdout.write(`REF:${width}x${height}\n`);
  } catch (err) {
    console.error(`Reference render failed: ${(err as Error).message}`);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Step 2: Test render with NativeRenderer
  // -------------------------------------------------------------------------

  try {
    const { PDFDocument } = await import(
      path.join(srcDir, 'document', 'PDFDocument.js')
    ) as typeof import('../src/document/PDFDocument.js');

    const { NativeRenderer } = await import(
      path.join(srcDir, 'render', 'NativeRenderer.js')
    ) as typeof import('../src/render/NativeRenderer.js');

    const doc = await PDFDocument.load(pdfBytes);
    const renderer = NativeRenderer.fromDocument(doc);

    if (pageIndex >= renderer.pageCount) {
      console.error(`Page index ${pageIndex} out of range (0..${renderer.pageCount - 1})`);
      process.exit(1);
    }

    const result = await renderer.renderPage(pageIndex, { scale: SCALE, background: 'white' });

    fs.mkdirSync(path.dirname(nativeOut), { recursive: true });
    fs.writeFileSync(nativeOut, result.png);
    process.stdout.write(`NATIVE:${result.width}x${result.height}\n`);
  } catch (err) {
    console.error(`Native render failed: ${(err as Error).message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
