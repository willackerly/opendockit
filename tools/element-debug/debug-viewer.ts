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
}
const slideResults: SlideResult[] = [];

// ─── DOM refs ───────────────────────────────────────────

const btnPptx = document.getElementById('btn-pptx')!;
const btnPdf = document.getElementById('btn-pdf')!;
const inputPptx = document.getElementById('input-pptx') as HTMLInputElement;
const inputPdf = document.getElementById('input-pdf') as HTMLInputElement;
const btnRun = document.getElementById('btn-run')!;
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
}

async function loadPdf(data: ArrayBuffer) {
  setStatus('Loading PDF...');
  const doc = await PDFDocument.load(new Uint8Array(data));
  pdfRenderer = NativeRenderer.fromDocument(doc);
  pdfPageCount = pdfRenderer.pageCount;
  updateRunButton();
  setStatus(`PDF loaded: ${pdfPageCount} pages`);
}

function updateRunButton() {
  (btnRun as HTMLButtonElement).disabled = !(slideKit && pdfRenderer);
}

// ─── Render All Slides ──────────────────────────────────

async function renderAllSlides() {
  if (!slideKit || !pdfRenderer) return;

  emptyState.style.display = 'none';
  container.innerHTML = '';
  slideResults.length = 0;

  const total = Math.min(slideCount, pdfPageCount);
  setStatus(`Rendering ${total} slides...`);

  // Access SlideKit internals for direct rendering
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
  const slideWidthPx = emuToPx(pres.slideWidth, 96 * dpiScale);
  const slideHeightPx = emuToPx(pres.slideHeight, 96 * dpiScale);

  let totalMatched = 0;
  let totalUnmatchedA = 0;
  let totalUnmatchedB = 0;
  let totalPosDelta = 0;
  let totalFontMismatch = 0;
  let totalColorMismatch = 0;
  let reportCount = 0;

  for (let i = 0; i < total; i++) {
    setProgress(((i + 0.5) / total) * 100);
    setStatus(`Rendering slide ${i + 1}/${total}...`);

    // ── Create DOM structure for this slide pair ──
    const pair = document.createElement('div');
    pair.className = 'slide-pair';
    pair.id = `slide-pair-${i}`;

    const header = document.createElement('div');
    header.className = 'slide-pair-header';
    header.innerHTML = `
      <span class="slide-num">Slide ${i + 1}</span>
      <span class="slide-stats" id="slide-stats-${i}">rendering...</span>
      <span class="slide-worst" id="slide-worst-${i}"></span>
    `;

    const body = document.createElement('div');
    body.className = 'slide-pair-body';

    // PPTX pane
    const pptxPane = document.createElement('div');
    pptxPane.className = 'slide-pane';
    pptxPane.innerHTML = `<div class="slide-pane-label"><span class="badge pptx">PPTX</span> Render</div>`;
    const pptxWrap = document.createElement('div');
    pptxWrap.className = 'slide-canvas-wrap';
    const pptxCanvas = document.createElement('canvas');
    pptxCanvas.className = 'render-canvas';
    pptxCanvas.width = slideWidthPx;
    pptxCanvas.height = slideHeightPx;
    const pptxOverlay = document.createElement('canvas');
    pptxOverlay.className = 'overlay-canvas';
    pptxOverlay.width = slideWidthPx;
    pptxOverlay.height = slideHeightPx;
    pptxWrap.appendChild(pptxCanvas);
    pptxWrap.appendChild(pptxOverlay);
    pptxPane.appendChild(pptxWrap);

    // PDF pane
    const pdfPane = document.createElement('div');
    pdfPane.className = 'slide-pane';
    pdfPane.innerHTML = `<div class="slide-pane-label"><span class="badge pdf">PDF</span> Reference</div>`;
    const pdfWrap = document.createElement('div');
    pdfWrap.className = 'slide-canvas-wrap';
    const pdfCanvas = document.createElement('canvas');
    pdfCanvas.className = 'render-canvas';
    const pdfOverlay = document.createElement('canvas');
    pdfOverlay.className = 'overlay-canvas';
    pdfWrap.appendChild(pdfCanvas);
    pdfWrap.appendChild(pdfOverlay);
    pdfPane.appendChild(pdfWrap);

    body.appendChild(pptxPane);
    body.appendChild(pdfPane);
    pair.appendChild(header);
    pair.appendChild(body);
    container.appendChild(pair);

    // ── Render PPTX directly onto display canvas with tracing ──
    // TracingBackend wraps CanvasBackend — renders visually AND captures trace in one pass.
    const pctx = pptxCanvas.getContext('2d')!;
    pctx.clearRect(0, 0, pptxCanvas.width, pptxCanvas.height);
    const tracingBackend = new TracingBackend(new CanvasBackend(pctx), {
      dpiScale,
      glyphLevel: false,
    });

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
        resolveFont: (name: string) => kit._resolveFont(name),
        colorMap,
        fontMetricsDB: kit._fontMetricsDB,
        slideNumber: i + 1,
      } as Parameters<typeof renderSlide>[1],
      slideWidthPx,
      slideHeightPx,
    );

    const trace: RenderTrace = tracingBackend.getTrace(`pptx:slide${i + 1}`, slideWidthPt, slideHeightPt);
    const pptxElements = traceToElements(trace);

    // ── Render PDF page ──
    let pdfElements: PageElement[] = [];
    if (i < pdfPageCount) {
      pdfElements = pdfRenderer!.getPageElements(i);
      await pdfRenderer!.renderPageToCanvas(i, pdfCanvas, { scale: 2 });
      pdfOverlay.width = pdfCanvas.width;
      pdfOverlay.height = pdfCanvas.height;
    }

    // ── Diff ──
    const report = generateDiffReport(pptxElements, pdfElements);
    const worst = worstSeverity(report);

    const result: SlideResult = {
      index: i,
      report,
      pptxElements,
      pdfElements,
      pptxCanvas,
      pdfCanvas,
      pptxOverlay,
      pdfOverlay,
    };
    slideResults.push(result);

    // Draw overlays
    drawSlideOverlays(result);

    // Update header stats
    const statsEl = document.getElementById(`slide-stats-${i}`)!;
    statsEl.textContent = `${report.summary.matchedCount} matched  |  ${report.unmatchedA.length}+${report.unmatchedB.length} unmatched  |  pos: ${report.summary.avgPositionDelta.toFixed(1)}pt`;
    const worstEl = document.getElementById(`slide-worst-${i}`)!;
    worstEl.textContent = worst;
    worstEl.style.color = severityColor(worst, 1);

    // Wire click handlers for this slide's canvases
    wireClickHandlers(result, pptxWrap, pdfWrap);

    // Accumulate totals
    totalMatched += report.summary.matchedCount;
    totalUnmatchedA += report.unmatchedA.length;
    totalUnmatchedB += report.unmatchedB.length;
    totalPosDelta += report.summary.avgPositionDelta;
    totalFontMismatch += report.summary.fontMismatches;
    totalColorMismatch += report.summary.colorMismatches;
    reportCount++;
  }

  setProgress(100);

  // Update summary bar
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
}

// ─── Overlay Drawing ────────────────────────────────────

function drawSlideOverlays(result: SlideResult) {
  const { report, pptxCanvas, pdfCanvas, pptxOverlay, pdfOverlay } = result;

  const pptxOctx = pptxOverlay.getContext('2d')!;
  const pdfOctx = pdfOverlay.getContext('2d')!;
  pptxOctx.clearRect(0, 0, pptxOverlay.width, pptxOverlay.height);
  pdfOctx.clearRect(0, 0, pdfOverlay.width, pdfOverlay.height);

  const scaleX = pptxCanvas.width / slideWidthPt;
  const scaleY = pptxCanvas.height / slideHeightPt;
  const pdfScaleX = pdfCanvas.width > 0 ? pdfCanvas.width / slideWidthPt : scaleX;
  const pdfScaleY = pdfCanvas.height > 0 ? pdfCanvas.height / slideHeightPt : scaleY;

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

    const b = diff.pair.b;
    pdfOctx.fillStyle = fill;
    pdfOctx.strokeStyle = stroke;
    pdfOctx.lineWidth = 2;
    pdfOctx.fillRect(b.x * pdfScaleX, b.y * pdfScaleY, b.width * pdfScaleX, b.height * pdfScaleY);
    pdfOctx.strokeRect(b.x * pdfScaleX, b.y * pdfScaleY, b.width * pdfScaleX, b.height * pdfScaleY);
  }

  for (const el of report.unmatchedA) {
    pptxOctx.strokeStyle = 'rgba(244, 67, 54, 0.6)';
    pptxOctx.lineWidth = 1;
    pptxOctx.setLineDash([4, 4]);
    pptxOctx.strokeRect(el.x * scaleX, el.y * scaleY, el.width * scaleX, el.height * scaleY);
    pptxOctx.setLineDash([]);
  }

  for (const el of report.unmatchedB) {
    pdfOctx.strokeStyle = 'rgba(244, 67, 54, 0.6)';
    pdfOctx.lineWidth = 1;
    pdfOctx.setLineDash([4, 4]);
    pdfOctx.strokeRect(el.x * pdfScaleX, el.y * pdfScaleY, el.width * pdfScaleX, el.height * pdfScaleY);
    pdfOctx.setLineDash([]);
  }
}

// ─── Click → Detail Panel ───────────────────────────────

function wireClickHandlers(result: SlideResult, pptxWrap: HTMLElement, pdfWrap: HTMLElement) {
  pptxWrap.addEventListener('click', (e) => {
    handleClick(e, result, result.pptxCanvas, result.pptxElements, 'PPTX');
  });
  pdfWrap.addEventListener('click', (e) => {
    handleClick(e, result, result.pdfCanvas, result.pdfElements, 'PDF');
  });
}

function handleClick(
  e: MouseEvent,
  result: SlideResult,
  canvas: HTMLCanvasElement,
  elements: PageElement[],
  side: 'PPTX' | 'PDF',
) {
  const rect = canvas.getBoundingClientRect();
  const clickX = ((e.clientX - rect.left) / rect.width) * slideWidthPt;
  const clickY = ((e.clientY - rect.top) / rect.height) * slideHeightPt;

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

// ─── CI bridge ──────────────────────────────────────────

const win = window as unknown as {
  __ciLoad: typeof loadPptx;
  __ciLoadPdf: typeof loadPdf;
  __ciRenderSlide: (i: number) => Promise<unknown>;
  __ciReady: boolean;
};

async function ciRenderSlide(slideIndex: number) {
  if (!slideKit || !pdfRenderer) throw new Error('Load files first');
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

  // Trace render
  const tc = document.createElement('canvas');
  tc.width = wPx; tc.height = hPx;
  const tctx = tc.getContext('2d')!;
  const tb = new TracingBackend(new CanvasBackend(tctx), { dpiScale, glyphLevel: false });
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
  const pptxEls = traceToElements(tb.getTrace(`pptx:slide${slideIndex + 1}`, slideWidthPt, slideHeightPt));
  const pdfEls = slideIndex < pdfPageCount ? pdfRenderer!.getPageElements(slideIndex) : [];
  const report = generateDiffReport(pptxEls, pdfEls);
  return {
    slideIndex,
    matched: report.matched.map((d) => ({
      aId: d.pair.a.id, bId: d.pair.b.id, aType: d.pair.a.type,
      matchMethod: d.pair.matchMethod, confidence: d.pair.confidence,
      overallSeverity: d.overallSeverity,
      deltas: d.deltas.map((dd) => ({ property: dd.property, valueA: dd.valueA, valueB: dd.valueB, delta: dd.delta, severity: dd.severity })),
    })),
    unmatchedA: report.unmatchedA.length,
    unmatchedB: report.unmatchedB.length,
    summary: report.summary,
  };
}

win.__ciLoad = loadPptx;
win.__ciLoadPdf = loadPdf;
win.__ciRenderSlide = ciRenderSlide;
win.__ciReady = true;

setStatus('Ready — load PPTX and PDF files to begin');
