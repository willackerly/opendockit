/**
 * Element Debug Viewer — all slides rendered side-by-side (PPTX + PDF),
 * scrollable, with per-element diff overlays and click-to-inspect.
 *
 * Renders PPTX directly via TracingBackend(CanvasBackend) for combined
 * visual render + element extraction. NativeRenderer for PDF.
 */

import { SlideKit } from '@opendockit/pptx';
import { TracingBackend } from '@opendockit/core/drawingml/renderer';
import type { RenderTrace } from '@opendockit/core/drawingml/renderer';
import { CanvasBackend } from '@opendockit/core/drawingml/renderer';
import { emuToPx } from '@opendockit/core';
import { PDFDocument } from '@opendockit/pdf-signer';
import { NativeRenderer } from '@opendockit/pdf-signer/render';
import {
  traceToElements,
  generateDiffReport,
} from '@opendockit/elements';
import type {
  DiffReport,
  ElementDiff,
  PageElement,
} from '@opendockit/elements';
import { renderSlide } from '@opendockit/pptx';

// ─── State ──────────────────────────────────────────────

let slideKit: SlideKit | null = null;
let pdfRenderer: NativeRenderer | null = null;
let slideCount = 0;
let pdfPageCount = 0;
let slideWidthPt = 720;
let slideHeightPt = 540;

// Reference PNGs (ground truth from PowerPoint export)
let refImages: HTMLImageElement[] = [];

// Per-slide results
interface SlideResult {
  index: number;
  report: DiffReport;
  pptxElements: PageElement[];
  pdfElements: PageElement[];
  pptxCanvas: HTMLCanvasElement;
  pdfCanvas: HTMLCanvasElement;
  pptxOverlay: HTMLCanvasElement;
  pdfOverlay: HTMLCanvasElement;
  pdfPageWidthPt: number;
  pdfPageHeightPt: number;
}
const slideResults: SlideResult[] = [];

// ─── DOM refs ───────────────────────────────────────────

const btnPptx = document.getElementById('btn-pptx')!;
const btnPdf = document.getElementById('btn-pdf')!;
const btnRef = document.getElementById('btn-ref')!;
const inputPptx = document.getElementById('input-pptx') as HTMLInputElement;
const inputPdf = document.getElementById('input-pdf') as HTMLInputElement;
const inputRef = document.getElementById('input-ref') as HTMLInputElement;
const btnRun = document.getElementById('btn-run')!;
const btnOverlay = document.getElementById('btn-overlay')!;
let overlaysVisible = true;
const statusEl = document.getElementById('status')!;
const summaryBar = document.getElementById('summary-bar')!;
const detailPanel = document.getElementById('detail-panel')!;
const container = document.getElementById('slides-container')!;
const emptyState = document.getElementById('empty-state')!;
const progressFill = document.getElementById('progress-fill')!;

function setStatus(msg: string) { statusEl.textContent = msg; }
function setProgress(pct: number) { progressFill.style.width = `${pct}%`; }

// ─── Helpers ────────────────────────────────────────────

function severityColor(sev: string, alpha = 0.3): string {
  switch (sev) {
    case 'match': return `rgba(76, 175, 80, ${alpha})`;
    case 'minor': return `rgba(255, 235, 59, ${alpha})`;
    case 'major': return `rgba(255, 152, 0, ${alpha})`;
    case 'critical': return `rgba(244, 67, 54, ${alpha})`;
    default: return `rgba(128, 128, 128, ${alpha})`;
  }
}

function worstSeverity(report: DiffReport): string {
  const RANK: Record<string, number> = { match: 0, minor: 1, major: 2, critical: 3 };
  let worst = 'match';
  for (const d of report.matched) {
    if ((RANK[d.overallSeverity] ?? 0) > (RANK[worst] ?? 0)) worst = d.overallSeverity;
  }
  return worst;
}

function formatValue(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'number') return v.toFixed(2);
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return v.length > 20 ? v.slice(0, 20) + '...' : v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('r' in o && 'g' in o && 'b' in o) return `rgb(${o.r},${o.g},${o.b})`;
    return JSON.stringify(v).slice(0, 30);
  }
  return String(v);
}

// ─── Pixel-level RMSE comparison ────────────────────────

function computeRMSE(canvasA: HTMLCanvasElement, canvasB: HTMLCanvasElement): { rmse: number; diffCanvas: HTMLCanvasElement } {
  // Normalize to same dimensions (use canvasA as reference size)
  const w = canvasA.width;
  const h = canvasA.height;

  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = w;
  diffCanvas.height = h;
  const diffCtx = diffCanvas.getContext('2d')!;

  // Draw canvasB scaled to match canvasA dimensions
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = w;
  tempCanvas.height = h;
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.drawImage(canvasB, 0, 0, w, h);

  const dataA = canvasA.getContext('2d')!.getImageData(0, 0, w, h).data;
  const dataB = tempCtx.getImageData(0, 0, w, h).data;
  const diffData = diffCtx.createImageData(w, h);

  let sumSqDiff = 0;
  const pixelCount = w * h;

  for (let i = 0; i < dataA.length; i += 4) {
    const dr = dataA[i] - dataB[i];
    const dg = dataA[i + 1] - dataB[i + 1];
    const db = dataA[i + 2] - dataB[i + 2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    sumSqDiff += dist * dist;

    // Diff visualization: bright red/magenta where pixels differ
    if (dist > 10) {
      const intensity = Math.min(255, dist * 2);
      diffData.data[i] = intensity;       // R
      diffData.data[i + 1] = 0;           // G
      diffData.data[i + 2] = intensity;   // B
      diffData.data[i + 3] = 255;         // A
    } else {
      // Faded grayscale of original
      const gray = Math.round((dataA[i] + dataA[i + 1] + dataA[i + 2]) / 3);
      diffData.data[i] = gray;
      diffData.data[i + 1] = gray;
      diffData.data[i + 2] = gray;
      diffData.data[i + 3] = 80;
    }
  }

  diffCtx.putImageData(diffData, 0, 0);
  const rmse = Math.sqrt(sumSqDiff / pixelCount) / 255; // Normalize to 0-1
  return { rmse, diffCanvas };
}

function loadImageAsCanvas(img: HTMLImageElement, targetWidth: number, targetHeight: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = targetWidth;
  c.height = targetHeight;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  return c;
}

// ─── Loading ────────────────────────────────────────────

async function loadPptx(data: ArrayBuffer) {
  setStatus('Loading PPTX...');
  const hiddenCanvas = document.createElement('canvas');
  slideKit = new SlideKit({ canvas: hiddenCanvas, dpiScale: 2 });
  const info = await slideKit.load(data);
  slideCount = info.slideCount;
  slideWidthPt = emuToPx(info.slideWidth, 72);
  slideHeightPt = emuToPx(info.slideHeight, 72);
  updateRunButton();
  setStatus(`PPTX loaded: ${slideCount} slides`);
  // Expose for diagnostic scripts
  (window as unknown as { _slideKit: SlideKit })._slideKit = slideKit;
}

async function loadPdf(data: ArrayBuffer) {
  setStatus('Loading PDF...');
  const doc = await PDFDocument.load(new Uint8Array(data));
  pdfRenderer = NativeRenderer.fromDocument(doc);
  pdfPageCount = pdfRenderer.pageCount;
  updateRunButton();
  setStatus(`PDF loaded: ${pdfPageCount} pages`);
}

async function loadRefImages(files: FileList) {
  setStatus('Loading reference PNGs...');
  // Sort by name to match slide order (Slide1.png, Slide2.png, ...)
  const sorted = [...files].sort((a, b) => {
    const numA = parseInt(a.name.match(/\d+/)?.[0] ?? '0', 10);
    const numB = parseInt(b.name.match(/\d+/)?.[0] ?? '0', 10);
    return numA - numB;
  });

  refImages = [];
  for (const file of sorted) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load ${file.name}`));
      img.src = url;
    });
    refImages.push(img);
  }
  updateRunButton();
  setStatus(`Reference loaded: ${refImages.length} PNGs`);
}

function updateRunButton() {
  (btnRun as HTMLButtonElement).disabled = !(slideKit || pdfRenderer || refImages.length > 0);
  // Update button text based on what's loaded
  if (slideKit && pdfRenderer) {
    btnRun.textContent = 'Compare All Slides';
  } else if (slideKit) {
    btnRun.textContent = 'Render All Slides';
  } else if (pdfRenderer) {
    btnRun.textContent = 'Render All Pages';
  } else {
    btnRun.textContent = 'Run All Slides';
  }
}

// ─── Render All Slides ──────────────────────────────────

async function renderAllSlides() {
  if (!slideKit && !pdfRenderer) return;

  const compareMode = !!(slideKit && pdfRenderer);
  const pptxOnly = !!(slideKit && !pdfRenderer);
  const pdfOnly = !!(!slideKit && pdfRenderer);

  emptyState.style.display = 'none';
  container.innerHTML = '';
  slideResults.length = 0;

  // Determine total pages and PPTX rendering dimensions
  let total: number;
  let kit: {
    _getOrParseSlide: (index: number) => Promise<unknown>;
    _presentation: { theme: unknown; slideWidth: number; slideHeight: number };
    _mediaCache: unknown;
    _fontMetricsDB: unknown;
    _resolveFont: (name: string) => string;
    _dpiScale: number;
  } | null = null;
  let dpiScale = 2;
  let slideWidthPx = 0;
  let slideHeightPx = 0;

  if (slideKit) {
    kit = slideKit as unknown as typeof kit;
    const pres = kit!._presentation;
    dpiScale = kit!._dpiScale;
    slideWidthPx = emuToPx(pres.slideWidth, 96 * dpiScale);
    slideHeightPx = emuToPx(pres.slideHeight, 96 * dpiScale);
  }

  if (compareMode) {
    total = Math.min(slideCount, pdfPageCount);
  } else if (pptxOnly) {
    total = slideCount;
  } else if (pdfOnly) {
    total = pdfPageCount;
  } else {
    total = refImages.length; // ref-only mode
  }
  // Extend total if ref images go beyond
  if (refImages.length > 0 && total > 0) {
    total = Math.max(total, Math.min(refImages.length, total));
  }

  const label = pdfOnly ? 'pages' : 'slides';
  setStatus(`Rendering ${total} ${label}...`);

  let totalMatched = 0;
  let totalUnmatchedA = 0;
  let totalUnmatchedB = 0;
  let totalPosDelta = 0;
  let totalFontMismatch = 0;
  let totalColorMismatch = 0;
  let reportCount = 0;

  for (let i = 0; i < total; i++) {
    setProgress(((i + 0.5) / total) * 100);
    setStatus(`Rendering ${pdfOnly ? 'page' : 'slide'} ${i + 1}/${total}...`);

    // ── Create DOM structure ──
    const pair = document.createElement('div');
    pair.className = 'slide-pair';
    pair.id = `slide-pair-${i}`;

    const header = document.createElement('div');
    header.className = 'slide-pair-header';
    header.innerHTML = `
      <span class="slide-num">${pdfOnly ? 'Page' : 'Slide'} ${i + 1}</span>
      <span class="slide-stats" id="slide-stats-${i}">rendering...</span>
      <span class="slide-worst" id="slide-worst-${i}"></span>
    `;

    const body = document.createElement('div');
    body.className = 'slide-pair-body';

    // PPTX pane (shown in PPTX-only or compare mode)
    let pptxCanvas: HTMLCanvasElement | null = null;
    let pptxOverlay: HTMLCanvasElement | null = null;
    let pptxWrap: HTMLElement | null = null;
    if (slideKit) {
      const pptxPane = document.createElement('div');
      pptxPane.className = 'slide-pane';
      pptxPane.innerHTML = `<div class="slide-pane-label"><span class="badge pptx">PPTX</span> Render</div>`;
      pptxWrap = document.createElement('div');
      pptxWrap.className = 'slide-canvas-wrap';
      pptxCanvas = document.createElement('canvas');
      pptxCanvas.className = 'render-canvas';
      pptxCanvas.width = slideWidthPx;
      pptxCanvas.height = slideHeightPx;
      pptxOverlay = document.createElement('canvas');
      pptxOverlay.className = 'overlay-canvas';
      pptxOverlay.width = slideWidthPx;
      pptxOverlay.height = slideHeightPx;
      pptxWrap.appendChild(pptxCanvas);
      pptxWrap.appendChild(pptxOverlay);
      pptxPane.appendChild(pptxWrap);
      body.appendChild(pptxPane);
    }

    // PDF pane (shown in PDF-only or compare mode)
    let pdfCanvas: HTMLCanvasElement | null = null;
    let pdfOverlay: HTMLCanvasElement | null = null;
    let pdfWrap: HTMLElement | null = null;
    if (pdfRenderer) {
      const pdfPane = document.createElement('div');
      pdfPane.className = 'slide-pane';
      pdfPane.innerHTML = `<div class="slide-pane-label"><span class="badge pdf">PDF</span> ${compareMode ? 'Reference' : 'Render'}</div>`;
      pdfWrap = document.createElement('div');
      pdfWrap.className = 'slide-canvas-wrap';
      pdfCanvas = document.createElement('canvas');
      pdfCanvas.className = 'render-canvas';
      pdfOverlay = document.createElement('canvas');
      pdfOverlay.className = 'overlay-canvas';
      pdfWrap.appendChild(pdfCanvas);
      pdfWrap.appendChild(pdfOverlay);
      pdfPane.appendChild(pdfWrap);
      body.appendChild(pdfPane);
    }

    // Reference PNG pane (shown when ref images loaded)
    if (refImages.length > i) {
      const refPane = document.createElement('div');
      refPane.className = 'slide-pane';
      refPane.innerHTML = `<div class="slide-pane-label"><span class="badge ref">REF</span> Ground Truth</div>`;
      const refWrap = document.createElement('div');
      refWrap.className = 'slide-canvas-wrap';
      const refCanvas = document.createElement('canvas');
      refCanvas.className = 'render-canvas';
      refCanvas.width = refImages[i].naturalWidth;
      refCanvas.height = refImages[i].naturalHeight;
      const rctx = refCanvas.getContext('2d')!;
      rctx.drawImage(refImages[i], 0, 0);
      refWrap.appendChild(refCanvas);
      refPane.appendChild(refWrap);
      body.appendChild(refPane);
    }

    pair.appendChild(header);
    pair.appendChild(body);
    container.appendChild(pair);

    // ── Render PPTX ──
    let pptxElements: PageElement[] = [];
    if (slideKit && kit && pptxCanvas) {
      const pctx = pptxCanvas.getContext('2d')!;
      pctx.clearRect(0, 0, pptxCanvas.width, pptxCanvas.height);
      const tracingBackend = new TracingBackend(new CanvasBackend(pctx), {
        dpiScale,
        glyphLevel: false,
      });

      const pres = kit._presentation;
      const enriched = await kit._getOrParseSlide(i);
      const colorMap = {
        ...(enriched as { master: { colorMap: Record<string, string> } }).master.colorMap,
        ...((enriched as { layout: { colorMap?: Record<string, string> } }).layout.colorMap ?? {}),
        ...((enriched as { slide: { colorMap?: Record<string, string> } }).slide.colorMap ?? {}),
      };

      renderSlide(
        enriched as Parameters<typeof renderSlide>[0],
        {
          backend: tracingBackend,
          dpiScale,
          theme: pres.theme,
          mediaCache: kit._mediaCache,
          resolveFont: (name: string) => kit!._resolveFont(name),
          colorMap,
          fontMetricsDB: kit._fontMetricsDB,
          slideNumber: i + 1,
        } as Parameters<typeof renderSlide>[1],
        slideWidthPx,
        slideHeightPx,
      );

      const trace: RenderTrace = tracingBackend.getTrace(`pptx:slide${i + 1}`, slideWidthPt, slideHeightPt);
      pptxElements = traceToElements(trace);
    }

    // ── Render PDF page ──
    let pdfElements: PageElement[] = [];
    if (pdfRenderer && pdfCanvas && pdfOverlay && i < pdfPageCount) {
      pdfElements = pdfRenderer.getPageElements(i);
      await pdfRenderer.renderPageToCanvas(i, pdfCanvas, { scale: 2 });
      pdfOverlay.width = pdfCanvas.width;
      pdfOverlay.height = pdfCanvas.height;
    }

    // ── Diff (only in compare mode) ──
    const report = compareMode
      ? generateDiffReport(pptxElements, pdfElements)
      : generateDiffReport([], []);
    const worst = compareMode ? worstSeverity(report) : '';

    // PDF page dimensions in points (canvas pixels / scale factor)
    const pdfScale = 2;
    const pdfPageWidthPt = pdfCanvas ? pdfCanvas.width / pdfScale : slideWidthPt;
    const pdfPageHeightPt = pdfCanvas ? pdfCanvas.height / pdfScale : slideHeightPt;

    const result: SlideResult = {
      index: i,
      report,
      pptxElements,
      pdfElements,
      pptxCanvas: pptxCanvas!,
      pdfCanvas: pdfCanvas!,
      pptxOverlay: pptxOverlay!,
      pdfOverlay: pdfOverlay!,
      pdfPageWidthPt,
      pdfPageHeightPt,
    };
    slideResults.push(result);

    // Draw overlays (only in compare mode)
    if (compareMode) {
      drawSlideOverlays(result);
    }

    // ── Pixel diff against reference PNGs ──
    let slideRmse = -1;
    if (refImages.length > i && pptxCanvas) {
      const refCanvas = loadImageAsCanvas(refImages[i], pptxCanvas.width, pptxCanvas.height);
      const { rmse, diffCanvas } = computeRMSE(pptxCanvas, refCanvas);
      slideRmse = rmse;

      // Add diff pane
      const diffPane = document.createElement('div');
      diffPane.className = 'slide-pane';
      const rmseClass = rmse < 0.02 ? 'rmse-good' : rmse < 0.05 ? 'rmse-ok' : 'rmse-bad';
      diffPane.innerHTML = `<div class="slide-pane-label"><span class="badge diff">DIFF</span> Pixel Diff <span class="rmse-badge ${rmseClass}">RMSE: ${rmse.toFixed(4)}</span></div>`;
      const diffWrap = document.createElement('div');
      diffWrap.className = 'slide-canvas-wrap';
      diffCanvas.className = 'render-canvas';
      diffWrap.appendChild(diffCanvas);
      diffPane.appendChild(diffWrap);
      body.appendChild(diffPane);
    }

    // Update header stats
    const statsEl = document.getElementById(`slide-stats-${i}`)!;
    const statParts: string[] = [];
    if (compareMode) {
      statParts.push(`${report.summary.matchedCount} matched  |  ${report.unmatchedA.length}+${report.unmatchedB.length} unmatched  |  pos: ${report.summary.avgPositionDelta.toFixed(1)}pt`);
      const worstEl = document.getElementById(`slide-worst-${i}`)!;
      worstEl.textContent = worst;
      worstEl.style.color = severityColor(worst, 1);
    } else if (slideKit || pdfRenderer) {
      const elCount = pptxOnly ? pptxElements.length : pdfElements.length;
      statParts.push(`${elCount} elements`);
    }
    if (slideRmse >= 0) {
      statParts.push(`RMSE: ${slideRmse.toFixed(4)}`);
    }
    statsEl.textContent = statParts.join('  |  ');

    // Wire click handlers
    if (pptxWrap) {
      pptxWrap.addEventListener('click', (e) => {
        handleClick(e, result, result.pptxCanvas, result.pptxElements, 'PPTX');
      });
    }
    if (pdfWrap) {
      pdfWrap.addEventListener('click', (e) => {
        handleClick(e, result, result.pdfCanvas, result.pdfElements, 'PDF');
      });
    }

    // Accumulate totals
    if (compareMode) {
      totalMatched += report.summary.matchedCount;
      totalUnmatchedA += report.unmatchedA.length;
      totalUnmatchedB += report.unmatchedB.length;
      totalPosDelta += report.summary.avgPositionDelta;
      totalFontMismatch += report.summary.fontMismatches;
      totalColorMismatch += report.summary.colorMismatches;
      reportCount++;
    }
  }

  setProgress(100);

  // Update summary bar (only in compare mode)
  if (compareMode) {
    summaryBar.classList.add('visible');
    const set = (id: string, value: string, cls?: string) => {
      const el = document.getElementById(id)!;
      el.textContent = value;
      el.className = 'stat-value' + (cls ? ` ${cls}` : '');
    };
    set('stat-matched', String(totalMatched), 'good');
    set('stat-unmatched-a', String(totalUnmatchedA), totalUnmatchedA > 0 ? 'warn' : 'good');
    set('stat-unmatched-b', String(totalUnmatchedB), totalUnmatchedB > 0 ? 'warn' : 'good');
    const avgPos = reportCount > 0 ? totalPosDelta / reportCount : 0;
    set('stat-pos', `${avgPos.toFixed(1)}pt`, avgPos > 3 ? 'bad' : avgPos > 1 ? 'warn' : 'good');
    set('stat-font', String(totalFontMismatch), totalFontMismatch > 0 ? 'bad' : 'good');
    set('stat-color', String(totalColorMismatch), totalColorMismatch > 0 ? 'warn' : 'good');
    setStatus(`Done — ${total} slides, ${totalMatched} matched, ${totalUnmatchedA + totalUnmatchedB} unmatched`);
  } else {
    summaryBar.classList.remove('visible');
    setStatus(`Done — ${total} ${label} rendered`);
  }
}

// ─── Overlay Drawing ────────────────────────────────────

function drawSlideOverlays(result: SlideResult) {
  const { report, pptxCanvas, pdfCanvas, pptxOverlay, pdfOverlay, pdfPageHeightPt } = result;

  const pptxOctx = pptxOverlay.getContext('2d')!;
  const pdfOctx = pdfOverlay.getContext('2d')!;
  pptxOctx.clearRect(0, 0, pptxOverlay.width, pptxOverlay.height);
  pdfOctx.clearRect(0, 0, pdfOverlay.width, pdfOverlay.height);

  // PPTX: coordinates are in points (top-left origin, Y down) — scale to canvas pixels
  const scaleX = pptxCanvas.width / slideWidthPt;
  const scaleY = pptxCanvas.height / slideHeightPt;

  // PDF: coordinates are in points (bottom-left origin, Y up) — flip Y and use PDF page dimensions
  const pdfScaleX = pdfCanvas.width > 0 ? pdfCanvas.width / result.pdfPageWidthPt : scaleX;
  const pdfScaleY = pdfCanvas.height > 0 ? pdfCanvas.height / pdfPageHeightPt : scaleY;

  // Helper to convert PDF element coords (bottom-left origin) to canvas coords (top-left origin)
  function pdfToCanvas(el: { x: number; y: number; width: number; height: number }) {
    return {
      x: el.x * pdfScaleX,
      y: (pdfPageHeightPt - el.y - el.height) * pdfScaleY,
      w: el.width * pdfScaleX,
      h: el.height * pdfScaleY,
    };
  }

  for (const diff of report.matched) {
    const sev = diff.overallSeverity;
    const fill = severityColor(sev, 0.15);
    const stroke = severityColor(sev, 0.8);

    const a = diff.pair.a;
    pptxOctx.fillStyle = fill;
    pptxOctx.strokeStyle = stroke;
    pptxOctx.lineWidth = 2;
    pptxOctx.fillRect(a.x * scaleX, a.y * scaleY, a.width * scaleX, a.height * scaleY);
    pptxOctx.strokeRect(a.x * scaleX, a.y * scaleY, a.width * scaleX, a.height * scaleY);

    const b = pdfToCanvas(diff.pair.b);
    pdfOctx.fillStyle = fill;
    pdfOctx.strokeStyle = stroke;
    pdfOctx.lineWidth = 2;
    pdfOctx.fillRect(b.x, b.y, b.w, b.h);
    pdfOctx.strokeRect(b.x, b.y, b.w, b.h);
  }

  for (const el of report.unmatchedA) {
    pptxOctx.strokeStyle = 'rgba(244, 67, 54, 0.6)';
    pptxOctx.lineWidth = 1;
    pptxOctx.setLineDash([4, 4]);
    pptxOctx.strokeRect(el.x * scaleX, el.y * scaleY, el.width * scaleX, el.height * scaleY);
    pptxOctx.setLineDash([]);
  }

  for (const el of report.unmatchedB) {
    const b = pdfToCanvas(el);
    pdfOctx.strokeStyle = 'rgba(244, 67, 54, 0.6)';
    pdfOctx.lineWidth = 1;
    pdfOctx.setLineDash([4, 4]);
    pdfOctx.strokeRect(b.x, b.y, b.w, b.h);
    pdfOctx.setLineDash([]);
  }
}

// ─── Click → Detail Panel ───────────────────────────────


function handleClick(
  e: MouseEvent,
  result: SlideResult,
  canvas: HTMLCanvasElement,
  elements: PageElement[],
  side: 'PPTX' | 'PDF',
) {
  const rect = canvas.getBoundingClientRect();

  let clickX: number, clickY: number;
  if (side === 'PDF') {
    // PDF elements are in bottom-left origin — convert canvas click to PDF space
    clickX = ((e.clientX - rect.left) / rect.width) * result.pdfPageWidthPt;
    clickY = result.pdfPageHeightPt - ((e.clientY - rect.top) / rect.height) * result.pdfPageHeightPt;
  } else {
    // PPTX elements are in top-left origin
    clickX = ((e.clientX - rect.left) / rect.width) * slideWidthPt;
    clickY = ((e.clientY - rect.top) / rect.height) * slideHeightPt;
  }

  for (const el of [...elements].reverse()) {
    if (clickX >= el.x && clickX <= el.x + el.width && clickY >= el.y && clickY <= el.y + el.height) {
      const matchedDiff = result.report.matched.find(
        (d) => (side === 'PPTX' && d.pair.a.id === el.id) || (side === 'PDF' && d.pair.b.id === el.id),
      );
      if (matchedDiff) {
        showElementDetail(matchedDiff);
      } else {
        showUnmatchedDetail(el, side);
      }
      detailPanel.classList.add('visible');
      return;
    }
  }
}

function showElementDetail(diff: ElementDiff) {
  document.getElementById('detail-type')!.textContent = diff.pair.a.type.toUpperCase();
  document.getElementById('detail-id')!.textContent = `${diff.pair.a.id} ↔ ${diff.pair.b.id}`;
  document.getElementById('detail-match')!.textContent = `${diff.pair.matchMethod} (${(diff.pair.confidence * 100).toFixed(0)}%) — ${diff.overallSeverity}`;

  const list = document.getElementById('delta-list')!;
  list.innerHTML = '';
  for (const d of diff.deltas) {
    const row = document.createElement('div');
    row.className = 'delta-row';
    row.innerHTML = `
      <span class="delta-sev sev-${d.severity}"></span>
      <span class="delta-prop" title="${d.property}">${d.property}</span>
      <span class="delta-values">
        <span class="delta-val" title="${formatValue(d.valueA)}">${formatValue(d.valueA)}</span>
        <span class="delta-arrow">→</span>
        <span class="delta-val" title="${formatValue(d.valueB)}">${formatValue(d.valueB)}</span>
        ${d.delta !== undefined ? `<span class="delta-val">(Δ${d.delta.toFixed(2)})</span>` : ''}
      </span>
    `;
    list.appendChild(row);
  }
}

function showUnmatchedDetail(el: PageElement, side: 'PPTX' | 'PDF') {
  document.getElementById('detail-type')!.textContent = el.type.toUpperCase();
  document.getElementById('detail-id')!.textContent = el.id;
  document.getElementById('detail-match')!.textContent = `Unmatched (${side} only)`;
  document.getElementById('delta-list')!.innerHTML = `
    <div class="delta-row"><span class="delta-prop">x</span><span class="delta-val">${el.x.toFixed(1)}</span></div>
    <div class="delta-row"><span class="delta-prop">y</span><span class="delta-val">${el.y.toFixed(1)}</span></div>
    <div class="delta-row"><span class="delta-prop">width</span><span class="delta-val">${el.width.toFixed(1)}</span></div>
    <div class="delta-row"><span class="delta-prop">height</span><span class="delta-val">${el.height.toFixed(1)}</span></div>
  `;
}

// ─── Event Wiring ───────────────────────────────────────

btnPptx.addEventListener('click', () => inputPptx.click());
btnPdf.addEventListener('click', () => inputPdf.click());
btnRef.addEventListener('click', () => inputRef.click());

inputRef.addEventListener('change', async () => {
  const files = inputRef.files;
  if (files && files.length > 0) {
    try { await loadRefImages(files); }
    catch (err) { setStatus(`Reference load error: ${err}`); }
  }
});

inputPptx.addEventListener('change', async () => {
  const file = inputPptx.files?.[0];
  if (file) {
    try { await loadPptx(await file.arrayBuffer()); }
    catch (err) { setStatus(`PPTX load error: ${err}`); }
  }
});

inputPdf.addEventListener('change', async () => {
  const file = inputPdf.files?.[0];
  if (file) {
    try { await loadPdf(await file.arrayBuffer()); }
    catch (err) { setStatus(`PDF load error: ${err}`); }
  }
});

btnRun.addEventListener('click', async () => {
  (btnRun as HTMLButtonElement).disabled = true;
  try { await renderAllSlides(); }
  catch (err) { setStatus(`Error: ${err}`); console.error(err); }
  finally { (btnRun as HTMLButtonElement).disabled = false; }
});

document.getElementById('detail-close')!.addEventListener('click', () => {
  detailPanel.classList.remove('visible');
});

btnOverlay.addEventListener('click', () => {
  overlaysVisible = !overlaysVisible;
  btnOverlay.textContent = `Overlays: ${overlaysVisible ? 'ON' : 'OFF'}`;
  const overlays = document.querySelectorAll<HTMLCanvasElement>('.overlay-canvas');
  for (const el of overlays) {
    el.style.display = overlaysVisible ? '' : 'none';
  }
});

// ─── CI bridge ──────────────────────────────────────────

interface CIWindow {
  __ciLoad: typeof loadPptx;
  __ciLoadPdf: typeof loadPdf;
  __ciLoadRefPng: (b64: string) => Promise<void>;
  __ciGetSlideCount: () => { pptx: number; pdf: number; ref: number };
  __ciAssess: (slideIndex: number) => Promise<CIAssessResult>;
  __ciReady: boolean;
}

interface CIAssessResult {
  slideIndex: number;
  pptxVsRef: { rmse: number } | null;
  pdfVsRef: { rmse: number } | null;
  pptxVsPdf: {
    matchedCount: number;
    unmatchedA: number;
    unmatchedB: number;
    avgPositionDelta: number;
    fontMismatches: number;
    colorMismatches: number;
    worstSeverity: string;
    matched: Array<{
      aId: string; bId: string; aType: string;
      matchMethod: string; confidence: number;
      overallSeverity: string;
      deltas: Array<{ property: string; valueA: unknown; valueB: unknown; delta?: number; severity: string }>;
    }>;
  } | null;
}

const win = window as unknown as CIWindow;

/** Load a single reference PNG from base64. Call once per image, in order. */
async function ciLoadRefPng(b64: string): Promise<void> {
  const img = new Image();
  const blob = new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load ref PNG'));
    img.src = url;
  });
  refImages.push(img);
  // Expose for diagnostic scripts
  (window as unknown as { _refImages: HTMLImageElement[] })._refImages = refImages;
}

function ciGetSlideCount() {
  return { pptx: slideCount, pdf: pdfPageCount, ref: refImages.length };
}

/** Run full assessment for a single slide/page. Returns pixel RMSE + element diffs. */
async function ciAssess(slideIndex: number): Promise<CIAssessResult> {
  const result: CIAssessResult = {
    slideIndex,
    pptxVsRef: null,
    pdfVsRef: null,
    pptxVsPdf: null,
  };

  let pptxCanvas: HTMLCanvasElement | null = null;
  let pptxElements: PageElement[] = [];
  let pdfCanvas: HTMLCanvasElement | null = null;
  let pdfElements: PageElement[] = [];

  // ── Render PPTX ──
  if (slideKit && slideIndex < slideCount) {
    const kit = slideKit as unknown as {
      _getOrParseSlide: (index: number) => Promise<unknown>;
      _presentation: { theme: unknown; slideWidth: number; slideHeight: number };
      _mediaCache: unknown;
      _fontMetricsDB: unknown;
      _resolveFont: (name: string) => string;
      _dpiScale: number;
    };
    const pres = kit._presentation;
    const dpiScale = kit._dpiScale;
    const wPx = emuToPx(pres.slideWidth, 96 * dpiScale);
    const hPx = emuToPx(pres.slideHeight, 96 * dpiScale);

    pptxCanvas = document.createElement('canvas');
    pptxCanvas.width = wPx;
    pptxCanvas.height = hPx;
    const pctx = pptxCanvas.getContext('2d')!;
    const tb = new TracingBackend(new CanvasBackend(pctx), { dpiScale, glyphLevel: false });
    const enriched = await kit._getOrParseSlide(slideIndex);
    const colorMap = {
      ...(enriched as { master: { colorMap: Record<string, string> } }).master.colorMap,
      ...((enriched as { layout: { colorMap?: Record<string, string> } }).layout.colorMap ?? {}),
      ...((enriched as { slide: { colorMap?: Record<string, string> } }).slide.colorMap ?? {}),
    };
    renderSlide(
      enriched as Parameters<typeof renderSlide>[0],
      { backend: tb, dpiScale, theme: pres.theme, mediaCache: kit._mediaCache, resolveFont: (n: string) => kit._resolveFont(n), colorMap, fontMetricsDB: kit._fontMetricsDB, slideNumber: slideIndex + 1 } as Parameters<typeof renderSlide>[1],
      wPx, hPx,
    );
    const trace = tb.getTrace(`pptx:slide${slideIndex + 1}`, slideWidthPt, slideHeightPt);
    pptxElements = traceToElements(trace);
  }

  // ── Render PDF ──
  if (pdfRenderer && slideIndex < pdfPageCount) {
    pdfCanvas = document.createElement('canvas');
    await pdfRenderer.renderPageToCanvas(slideIndex, pdfCanvas, { scale: 2 });
    pdfElements = pdfRenderer.getPageElements(slideIndex);
  }

  // ── PPTX vs Reference PNG (pixel RMSE) ──
  if (pptxCanvas && refImages.length > slideIndex) {
    const refCanvas = loadImageAsCanvas(refImages[slideIndex], pptxCanvas.width, pptxCanvas.height);
    const { rmse } = computeRMSE(pptxCanvas, refCanvas);
    result.pptxVsRef = { rmse };
  }

  // ── PDF vs Reference PNG (pixel RMSE) ──
  if (pdfCanvas && refImages.length > slideIndex) {
    const refCanvas = loadImageAsCanvas(refImages[slideIndex], pdfCanvas.width, pdfCanvas.height);
    const { rmse } = computeRMSE(pdfCanvas, refCanvas);
    result.pdfVsRef = { rmse };
  }

  // ── PPTX vs PDF (element-level diff) ──
  if (pptxElements.length > 0 && pdfElements.length > 0) {
    const report = generateDiffReport(pptxElements, pdfElements);
    const RANK: Record<string, number> = { match: 0, minor: 1, major: 2, critical: 3 };
    let worst = 'match';
    for (const d of report.matched) {
      if ((RANK[d.overallSeverity] ?? 0) > (RANK[worst] ?? 0)) worst = d.overallSeverity;
    }
    result.pptxVsPdf = {
      matchedCount: report.summary.matchedCount,
      unmatchedA: report.unmatchedA.length,
      unmatchedB: report.unmatchedB.length,
      avgPositionDelta: report.summary.avgPositionDelta,
      fontMismatches: report.summary.fontMismatches,
      colorMismatches: report.summary.colorMismatches,
      worstSeverity: worst,
      matched: report.matched.map((d) => ({
        aId: d.pair.a.id, bId: d.pair.b.id, aType: d.pair.a.type,
        matchMethod: d.pair.matchMethod, confidence: d.pair.confidence,
        overallSeverity: d.overallSeverity,
        deltas: d.deltas.map((dd) => ({ property: dd.property, valueA: dd.valueA, valueB: dd.valueB, delta: dd.delta, severity: dd.severity })),
      })),
    };
  }

  return result;
}

win.__ciLoad = loadPptx;
win.__ciLoadPdf = loadPdf;
win.__ciLoadRefPng = ciLoadRefPng;
win.__ciGetSlideCount = ciGetSlideCount;
win.__ciAssess = ciAssess;
win.__ciReady = true;

setStatus('Ready — load PPTX and PDF files to begin');
