/**
 * OpenDocKit Compare — PPTX round-trip comparison tool.
 *
 * Renders each slide via Canvas2D (SlideKit), exports the presentation to PDF,
 * re-renders via NativeRenderer, and computes pixel-level RMSE diffs.
 *
 * Three-pane layout: Canvas2D | Diff (4x amplified) | PDF Export
 */

import { SlideKit } from '@opendockit/pptx';
import type { PdfExportOptions } from '@opendockit/pptx';
import { emuToPx } from '@opendockit/core';
import { OpcPackageReader } from '@opendockit/core/opc';
import { PDFDocument } from '@opendockit/pdf-signer';
import { NativeRenderer } from '@opendockit/pdf-signer/render';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentSlide = 0;
let slideCount = 0;
let showDiff = true;

/** Pre-rendered data URLs per slide. */
const canvasSnapshots: string[] = [];
const pdfSnapshots: string[] = [];
const diffSnapshots: string[] = [];
const rmseScores: number[] = [];

let exportStats: {
  fontCount: number;
  imageCount: number;
  pdfSizeBytes: number;
} | null = null;

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const btnOpen = document.getElementById('btn-open') as HTMLButtonElement;
const btnDiff = document.getElementById('btn-diff') as HTMLButtonElement;
const btnPrev = document.getElementById('btn-prev') as HTMLButtonElement;
const btnNext = document.getElementById('btn-next') as HTMLButtonElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const fileNameEl = document.getElementById('file-name') as HTMLSpanElement;
const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
const progressContainer = document.getElementById('progress-container') as HTMLDivElement;
const progressBar = document.getElementById('progress-bar') as HTMLDivElement;
const progressLabel = document.getElementById('progress-label') as HTMLSpanElement;
const compareContainer = document.getElementById('compare-container') as HTMLDivElement;
const paneLabels = document.getElementById('pane-labels') as HTMLDivElement;
const panesEl = document.getElementById('panes') as HTMLDivElement;
const diffPane = document.getElementById('diff-pane') as HTMLDivElement;
const diffLabelEl = document.getElementById('diff-label') as HTMLSpanElement;
const canvasImg = document.getElementById('canvas-img') as HTMLImageElement;
const diffImg = document.getElementById('diff-img') as HTMLImageElement;
const pdfImg = document.getElementById('pdf-img') as HTMLImageElement;
const rmseBadge = document.getElementById('rmse-badge') as HTMLSpanElement;
const slideCounter = document.getElementById('slide-counter') as HTMLSpanElement;
const statsEl = document.getElementById('stats') as HTMLDivElement;
const statFonts = document.getElementById('stat-fonts') as HTMLSpanElement;
const statImages = document.getElementById('stat-images') as HTMLSpanElement;
const statSize = document.getElementById('stat-size') as HTMLSpanElement;
const statRmse = document.getElementById('stat-rmse') as HTMLSpanElement;

// ---------------------------------------------------------------------------
// Progress helpers
// ---------------------------------------------------------------------------

function showProgress(label: string, pct: number) {
  dropZone.classList.remove('visible');
  compareContainer.classList.remove('visible');
  progressContainer.classList.add('visible');
  progressLabel.textContent = label;
  progressBar.style.width = `${Math.round(pct * 100)}%`;
}

function hideProgress() {
  progressContainer.classList.remove('visible');
}

// ---------------------------------------------------------------------------
// View management
// ---------------------------------------------------------------------------

function showEmptyState() {
  dropZone.classList.add('visible');
  compareContainer.classList.remove('visible');
  progressContainer.classList.remove('visible');
  statsEl.style.display = 'none';
  btnPrev.disabled = true;
  btnNext.disabled = true;
  slideCounter.textContent = '';
}

function showCompareView() {
  dropZone.classList.remove('visible');
  progressContainer.classList.remove('visible');
  compareContainer.classList.add('visible');
  statsEl.style.display = '';
  updateDiffVisibility();
}

function updateDiffVisibility() {
  if (showDiff) {
    diffPane.style.display = '';
    diffLabelEl.style.display = '';
    panesEl.classList.remove('no-diff');
    paneLabels.classList.remove('no-diff');
  } else {
    diffPane.style.display = 'none';
    diffLabelEl.style.display = 'none';
    panesEl.classList.add('no-diff');
    paneLabels.classList.add('no-diff');
  }
}

// ---------------------------------------------------------------------------
// Slide navigation
// ---------------------------------------------------------------------------

function goToSlide(index: number) {
  if (index < 0 || index >= slideCount) return;
  currentSlide = index;

  canvasImg.src = canvasSnapshots[index] || '';
  pdfImg.src = pdfSnapshots[index] || '';
  diffImg.src = diffSnapshots[index] || '';

  const rmse = rmseScores[index];
  if (rmse !== undefined) {
    rmseBadge.textContent = `RMSE ${rmse.toFixed(4)}`;
    rmseBadge.className = 'rmse-badge ' + (rmse < 0.05 ? 'good' : rmse < 0.10 ? 'warn' : 'bad');
  } else {
    rmseBadge.textContent = '';
  }

  slideCounter.textContent = `Slide ${index + 1} / ${slideCount}`;
  btnPrev.disabled = index === 0;
  btnNext.disabled = index === slideCount - 1;
}

// ---------------------------------------------------------------------------
// Diff computation (pure JS, no ImageMagick)
// ---------------------------------------------------------------------------

function computeDiff(
  left: ImageData,
  right: ImageData
): { diffDataURL: string; rmse: number } {
  const w = left.width;
  const h = left.height;
  const n = w * h;
  const diffData = new Uint8ClampedArray(left.data.length);
  let sumSqErr = 0;
  const AMPLIFY = 4;

  for (let i = 0; i < left.data.length; i += 4) {
    const dr = Math.abs(left.data[i] - right.data[i]);
    const dg = Math.abs(left.data[i + 1] - right.data[i + 1]);
    const db = Math.abs(left.data[i + 2] - right.data[i + 2]);

    diffData[i] = Math.min(255, dr * AMPLIFY);
    diffData[i + 1] = Math.min(255, dg * AMPLIFY);
    diffData[i + 2] = Math.min(255, db * AMPLIFY);
    diffData[i + 3] = 255;

    sumSqErr += (dr / 255) ** 2 + (dg / 255) ** 2 + (db / 255) ** 2;
  }

  const rmse = Math.sqrt(sumSqErr / (n * 3));

  // Convert diff ImageData to data URL
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = w;
  diffCanvas.height = h;
  const ctx = diffCanvas.getContext('2d')!;
  ctx.putImageData(new ImageData(diffData, w, h), 0, 0);
  const diffDataURL = diffCanvas.toDataURL('image/png');

  return { diffDataURL, rmse };
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function loadAndCompare(bytes: ArrayBuffer) {
  // Reset state
  canvasSnapshots.length = 0;
  pdfSnapshots.length = 0;
  diffSnapshots.length = 0;
  rmseScores.length = 0;
  exportStats = null;
  currentSlide = 0;

  // -----------------------------------------------------------------------
  // Phase 1: Load PPTX and render all slides via Canvas2D
  // -----------------------------------------------------------------------
  showProgress('Loading PPTX...', 0);

  const offscreenCanvas = document.createElement('canvas');
  const kit = new SlideKit({ canvas: offscreenCanvas });
  const pres = await kit.load(bytes);
  slideCount = pres.slideCount;

  const slideWidthPx = emuToPx(pres.slideWidth, 96);
  const slideHeightPx = emuToPx(pres.slideHeight, 96);

  for (let i = 0; i < slideCount; i++) {
    showProgress(
      `Rendering slide ${i + 1} / ${slideCount} (Canvas2D)...`,
      (i / slideCount) * 0.3
    );
    await kit.renderSlide(i);

    // Capture snapshot
    canvasSnapshots.push(offscreenCanvas.toDataURL('image/png'));
  }

  // -----------------------------------------------------------------------
  // Phase 2: Export to PDF
  // -----------------------------------------------------------------------
  showProgress('Exporting to PDF...', 0.3);

  // Build image provider from OPC package
  const opcPkg = await OpcPackageReader.open(bytes);
  const imageMap = new Map<string, Uint8Array>();
  for (const uri of opcPkg.listParts()) {
    if (uri.startsWith('/ppt/media/')) {
      imageMap.set(uri, await opcPkg.getPart(uri));
    }
  }

  const exportOptions: PdfExportOptions = {
    getImageBytes: (uri: string) => imageMap.get(uri),
  };

  const exportResult = await kit.exportPDF(exportOptions);
  exportStats = {
    fontCount: exportResult.fontCount,
    imageCount: exportResult.imageCount,
    pdfSizeBytes: exportResult.bytes.length,
  };

  // -----------------------------------------------------------------------
  // Phase 3: Load exported PDF and render via NativeRenderer
  // -----------------------------------------------------------------------
  showProgress('Loading exported PDF...', 0.5);

  const pdfDoc = await PDFDocument.load(exportResult.bytes);
  const renderer = NativeRenderer.fromDocument(pdfDoc);
  const pageCount = pdfDoc.getPageCount();

  // Calculate scale to match Canvas2D pixel dimensions
  // Canvas2D: emuToPx(w, 96) → pixels at 96 DPI
  // PDF pages are in points (72 DPI)
  // So pdfScale = slideWidthPx / pageWidthPt ≈ 96/72 = 1.333

  const pdfCanvas = document.createElement('canvas');

  for (let i = 0; i < Math.min(pageCount, slideCount); i++) {
    showProgress(
      `Rendering page ${i + 1} / ${pageCount} (PDF)...`,
      0.5 + (i / pageCount) * 0.3
    );

    // Get page dimensions to calculate scale
    const page = pdfDoc.getPage(i);
    const mediaBox = page.getMediaBox();
    const pageWidthPt = mediaBox.width;
    const pdfScale = slideWidthPx / pageWidthPt;

    await renderer.renderPageToCanvas(i, pdfCanvas, { scale: pdfScale });

    // Resize to exact canvas dimensions if slightly off
    const matchCanvas = document.createElement('canvas');
    matchCanvas.width = slideWidthPx;
    matchCanvas.height = slideHeightPx;
    const matchCtx = matchCanvas.getContext('2d')!;
    matchCtx.drawImage(pdfCanvas, 0, 0, slideWidthPx, slideHeightPx);

    pdfSnapshots.push(matchCanvas.toDataURL('image/png'));
  }

  // -----------------------------------------------------------------------
  // Phase 4: Compute diffs
  // -----------------------------------------------------------------------
  const diffCanvas2 = document.createElement('canvas');
  diffCanvas2.width = slideWidthPx;
  diffCanvas2.height = slideHeightPx;
  const diffCtx = diffCanvas2.getContext('2d')!;

  for (let i = 0; i < Math.min(canvasSnapshots.length, pdfSnapshots.length); i++) {
    showProgress(
      `Computing diff ${i + 1} / ${slideCount}...`,
      0.8 + (i / slideCount) * 0.2
    );

    // Load both snapshots into ImageData
    const leftData = await loadImageData(canvasSnapshots[i], slideWidthPx, slideHeightPx, diffCtx);
    const rightData = await loadImageData(pdfSnapshots[i], slideWidthPx, slideHeightPx, diffCtx);

    const { diffDataURL, rmse } = computeDiff(leftData, rightData);
    diffSnapshots.push(diffDataURL);
    rmseScores.push(rmse);
  }

  // -----------------------------------------------------------------------
  // Done — show results
  // -----------------------------------------------------------------------
  hideProgress();
  updateStats();
  showCompareView();
  goToSlide(0);

  // Clean up
  kit.dispose();
}

/** Load a data URL into ImageData at the given dimensions. */
async function loadImageData(
  dataURL: string,
  w: number,
  h: number,
  ctx: CanvasRenderingContext2D
): Promise<ImageData> {
  const img = new Image();
  img.src = dataURL;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image'));
  });
  ctx.canvas.width = w;
  ctx.canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function updateStats() {
  if (!exportStats) return;

  statFonts.textContent = String(exportStats.fontCount);
  statImages.textContent = String(exportStats.imageCount);

  const sizeMB = exportStats.pdfSizeBytes / (1024 * 1024);
  statSize.textContent = sizeMB < 1
    ? `${(exportStats.pdfSizeBytes / 1024).toFixed(0)} KB`
    : `${sizeMB.toFixed(1)} MB`;

  if (rmseScores.length > 0) {
    const avg = rmseScores.reduce((a, b) => a + b, 0) / rmseScores.length;
    statRmse.textContent = avg.toFixed(4);
  }
}

// ---------------------------------------------------------------------------
// File handling
// ---------------------------------------------------------------------------

async function handleFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.pptx')) {
    alert('Please drop a .pptx file');
    return;
  }

  fileNameEl.textContent = file.name;

  try {
    const bytes = await file.arrayBuffer();
    await loadAndCompare(bytes);
  } catch (err) {
    console.error('Compare failed:', err);
    hideProgress();
    showEmptyState();
    alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

// File picker
btnOpen.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) handleFile(file);
  fileInput.value = '';
});

// Drag and drop
let dragCounter = 0;

document.body.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  document.body.classList.add('drag-over');
});

document.body.addEventListener('dragleave', () => {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    document.body.classList.remove('drag-over');
  }
});

document.body.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.body.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  document.body.classList.remove('drag-over');
  const file = e.dataTransfer?.files[0];
  if (file) handleFile(file);
});

// Drop zone click
dropZone.addEventListener('click', () => fileInput.click());

// Navigation
btnPrev.addEventListener('click', () => goToSlide(currentSlide - 1));
btnNext.addEventListener('click', () => goToSlide(currentSlide + 1));

document.addEventListener('keydown', (e) => {
  if (slideCount === 0) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    goToSlide(currentSlide - 1);
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    goToSlide(currentSlide + 1);
  }
});

// Diff toggle
btnDiff.addEventListener('click', () => {
  showDiff = !showDiff;
  btnDiff.classList.toggle('active', showDiff);
  updateDiffVisibility();
});

// Initial state
showEmptyState();
