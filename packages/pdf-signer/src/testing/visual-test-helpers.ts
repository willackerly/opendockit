import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// pdftoppm availability
// ---------------------------------------------------------------------------

let _pdftoppmAvailable: boolean | null = null;

export function isPdftoppmAvailable(): boolean {
  if (_pdftoppmAvailable !== null) return _pdftoppmAvailable;
  try {
    execFileSync('which', ['pdftoppm'], { stdio: 'pipe' });
    _pdftoppmAvailable = true;
  } catch {
    _pdftoppmAvailable = false;
  }
  return _pdftoppmAvailable;
}

// ---------------------------------------------------------------------------
// PDF → PNG rendering
// ---------------------------------------------------------------------------

/**
 * Render a single page of a PDF to PNG using pdftoppm (Poppler).
 *
 * @param pdfBytes  Raw PDF bytes
 * @param page      1-based page number (default: 1)
 * @param dpi       Resolution in DPI (default: 150 — good balance of speed vs detail)
 * @returns PNG file contents as a Buffer
 */
export function renderPdfPage(
  pdfBytes: Uint8Array,
  page = 1,
  dpi = 150,
): Buffer {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfbox-visual-'));
  const pdfPath = path.join(tmpDir, 'input.pdf');
  const outPrefix = path.join(tmpDir, 'page');

  try {
    fs.writeFileSync(pdfPath, pdfBytes);

    execFileSync('pdftoppm', [
      '-png',
      '-r', String(dpi),
      '-f', String(page),
      '-l', String(page),
      pdfPath,
      outPrefix,
    ], { stdio: 'pipe', timeout: 30_000 });

    // pdftoppm names output like page-01.png, page-1.png, etc.
    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('page') && f.endsWith('.png'));
    if (files.length === 0) {
      throw new Error(`pdftoppm produced no PNG output for page ${page}`);
    }

    return fs.readFileSync(path.join(tmpDir, files[0]));
  } finally {
    // Clean up temp files
    for (const f of fs.readdirSync(tmpDir)) {
      fs.unlinkSync(path.join(tmpDir, f));
    }
    fs.rmdirSync(tmpDir);
  }
}

// ---------------------------------------------------------------------------
// PDF → PNG rendering (PDF.js + node-canvas)
// ---------------------------------------------------------------------------

let _pdfjsAvailable: boolean | null = null;

export function isPdfjsAvailable(): boolean {
  if (_pdfjsAvailable !== null) return _pdfjsAvailable;
  try {
    require.resolve('pdfjs-dist');
    require.resolve('canvas');
    _pdfjsAvailable = true;
  } catch {
    _pdfjsAvailable = false;
  }
  return _pdfjsAvailable;
}

/**
 * Render a single page of a PDF to PNG using PDF.js + node-canvas.
 *
 * This uses the same rendering engine as the browser demo/viewer,
 * allowing direct comparison with pdftoppm (Poppler) output.
 *
 * @param pdfBytes  Raw PDF bytes
 * @param page      1-based page number (default: 1)
 * @param scale     Scale factor (default: 2.0 — equivalent to ~144 DPI on letter-size)
 * @returns PNG file contents as a Buffer
 */
export async function renderPdfPageWithPdfjs(
  pdfBytes: Uint8Array,
  page = 1,
  scale = 2.0,
): Promise<Buffer> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('canvas');

  // Custom CanvasFactory ensures PDF.js uses the same node-canvas binding for
  // ALL canvases — both the main render target and internal temporaries (used
  // by paintImageXObject, _scaleImage, etc.). Without this, PDF.js defaults to
  // @napi-rs/canvas which causes drawImage() InstanceOf check failures.
  class NodeCanvasFactory {
    create(width: number, height: number) {
      const canvas = createCanvas(width, height);
      return { canvas, context: canvas.getContext('2d') };
    }
    reset(canvasAndContext: any, width: number, height: number) {
      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
    }
    destroy(canvasAndContext: any) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
    }
  }

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBytes),
    useSystemFonts: true,
    isEvalSupported: false,
    CanvasFactory: NodeCanvasFactory,
  }).promise;

  const pdfPage = await doc.getPage(page);
  const viewport = pdfPage.getViewport({ scale });

  const { canvas, context } = (doc as any).canvasFactory.create(
    Math.floor(viewport.width),
    Math.floor(viewport.height),
  );

  await (pdfPage.render as any)({
    canvasContext: context,
    viewport,
  }).promise;

  await doc.destroy();
  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// Snapshot comparison
// ---------------------------------------------------------------------------

export interface CompareResult {
  match: boolean;
  mismatchPixels: number;
  totalPixels: number;
  mismatchPercent: number;
  diffPng: Buffer;
}

/**
 * Compare two PNG buffers using pixelmatch.
 *
 * @param actual      The rendered PNG
 * @param reference   The stored reference PNG
 * @param threshold   Matching threshold 0-1 (default: 0.1 — tolerant of anti-aliasing)
 * @param maxMismatchPercent  Max percentage of mismatched pixels before failing (default: 0.5)
 */
export function compareSnapshots(
  actual: Buffer,
  reference: Buffer,
  threshold = 0.1,
  maxMismatchPercent = 0.5,
): CompareResult {
  const imgActual = PNG.sync.read(actual);
  const imgRef = PNG.sync.read(reference);

  // If dimensions differ, resize the comparison to the larger of the two
  const width = Math.max(imgActual.width, imgRef.width);
  const height = Math.max(imgActual.height, imgRef.height);

  // Pad images to the same dimensions if needed
  const actualData = padImage(imgActual, width, height);
  const refData = padImage(imgRef, width, height);

  const diff = new PNG({ width, height });
  const totalPixels = width * height;

  const mismatchPixels = pixelmatch(
    actualData,
    refData,
    diff.data,
    width,
    height,
    { threshold },
  );

  const mismatchPercent = (mismatchPixels / totalPixels) * 100;

  return {
    match: mismatchPercent <= maxMismatchPercent,
    mismatchPixels,
    totalPixels,
    mismatchPercent,
    diffPng: PNG.sync.write(diff),
  };
}

/**
 * Pad a PNG image to target dimensions with transparent pixels.
 * Returns the raw RGBA pixel data.
 */
function padImage(img: PNG, targetWidth: number, targetHeight: number): Buffer {
  if (img.width === targetWidth && img.height === targetHeight) {
    return img.data as Buffer;
  }

  const padded = Buffer.alloc(targetWidth * targetHeight * 4, 0);
  for (let y = 0; y < img.height; y++) {
    const srcOffset = y * img.width * 4;
    const dstOffset = y * targetWidth * 4;
    (img.data as Buffer).copy(padded, dstOffset, srcOffset, srcOffset + img.width * 4);
  }
  return padded;
}

// ---------------------------------------------------------------------------
// Snapshot path management
// ---------------------------------------------------------------------------

/**
 * Resolve the path to a snapshot PNG file.
 */
export function snapshotPath(testName: string): string {
  return path.resolve(repoRoot, 'test-snapshots', `${testName}.png`);
}

/**
 * Resolve the path to a diff PNG file (for debugging mismatches).
 */
export function diffPath(testName: string): string {
  return path.resolve(repoRoot, 'test-snapshots', 'diffs', `${testName}-diff.png`);
}

/**
 * Write or update a reference snapshot.
 */
export function updateSnapshot(testName: string, pngData: Buffer): void {
  const p = snapshotPath(testName);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, pngData);
}

/**
 * Read a reference snapshot, or return null if it doesn't exist.
 */
export function readSnapshot(testName: string): Buffer | null {
  const p = snapshotPath(testName);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}

/**
 * Write a diff image for debugging.
 */
export function writeDiff(testName: string, diffPng: Buffer): void {
  const p = diffPath(testName);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, diffPng);
}

/**
 * Whether we should update snapshots instead of comparing.
 */
export function isUpdateMode(): boolean {
  return process.env.PDFBOX_TS_UPDATE_SNAPSHOTS === '1';
}

// ---------------------------------------------------------------------------
// Side-by-side renderer comparison
// ---------------------------------------------------------------------------

/**
 * Render a PDF page with both pdftoppm and PDF.js, saving PNGs side by side.
 * Useful for comparing rendering quality between the two engines.
 *
 * Outputs to `test-snapshots/compare/`:
 *   - `{name}-pdftoppm.png`
 *   - `{name}-pdfjs.png`
 *   - `{name}-diff.png` (pixelmatch diff)
 *
 * @returns Comparison stats
 */
export async function renderAndCompare(
  name: string,
  pdfBytes: Uint8Array,
  page = 1,
): Promise<{ pdftoppmPath: string; pdfjsPath: string; diffPath: string; mismatchPercent: number }> {
  const outDir = path.resolve(repoRoot, 'test-snapshots', 'compare');
  fs.mkdirSync(outDir, { recursive: true });

  const pdftoppmPng = renderPdfPage(pdfBytes, page, 150);
  const pdfjsPng = await renderPdfPageWithPdfjs(pdfBytes, page, 150 / 72);

  const pdftoppmPath = path.join(outDir, `${name}-pdftoppm.png`);
  const pdfjsPath = path.join(outDir, `${name}-pdfjs.png`);
  const diffOutPath = path.join(outDir, `${name}-diff.png`);

  fs.writeFileSync(pdftoppmPath, pdftoppmPng);
  fs.writeFileSync(pdfjsPath, pdfjsPng);

  const result = compareSnapshots(pdftoppmPng, pdfjsPng, 0.1, 100);
  fs.writeFileSync(diffOutPath, result.diffPng);

  return {
    pdftoppmPath,
    pdfjsPath,
    diffPath: diffOutPath,
    mismatchPercent: result.mismatchPercent,
  };
}
