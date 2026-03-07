import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface PageRenderInfo {
  wrapper: HTMLElement;
  canvas: HTMLCanvasElement;
  pdfWidth: number;
  pdfHeight: number;
}

export interface RenderTimings {
  numPages: number;
  pages: PageRenderInfo[];
  timings: number[];
}

export async function renderPdf(
  container: HTMLElement,
  pdfBytes: Uint8Array,
  options?: { scale?: number; maxPages?: number; password?: string }
): Promise<RenderTimings> {
  // Clone bytes to prevent ArrayBuffer detachment
  const data = new Uint8Array(pdfBytes);
  const pdf = await pdfjsLib.getDocument({ data, password: options?.password }).promise;

  container.innerHTML = '';
  const scale = options?.scale ?? 1.5;
  const maxPages = options?.maxPages ?? pdf.numPages;
  const pages: PageRenderInfo[] = [];
  const timings: number[] = [];

  for (let i = 1; i <= Math.min(maxPages, pdf.numPages); i++) {
    const t0 = performance.now();
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page';
    wrapper.setAttribute('data-page', String(i));

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: canvas.getContext('2d')!,
      viewport,
    }).promise;

    const t1 = performance.now();
    timings.push(t1 - t0);

    wrapper.appendChild(canvas);

    const label = document.createElement('div');
    label.className = 'page-label';
    label.textContent = `Page ${i} of ${pdf.numPages}`;
    wrapper.appendChild(label);

    container.appendChild(wrapper);

    // Expose original PDF dimensions (unscaled)
    const unscaledViewport = page.getViewport({ scale: 1 });
    pages.push({
      wrapper,
      canvas,
      pdfWidth: unscaledViewport.width,
      pdfHeight: unscaledViewport.height,
    });
  }

  return { numPages: pdf.numPages, pages, timings };
}

export async function renderPdfWithNative(
  container: HTMLElement,
  pdfBytes: Uint8Array,
  options?: { scale?: number; maxPages?: number; password?: string }
): Promise<RenderTimings> {
  // Dynamic import to avoid bundling NativeRenderer when not used
  const { PDFDocument } = await import('../../src/document/PDFDocument');
  const { NativeRenderer } = await import('../../src/render/NativeRenderer');

  const doc = await PDFDocument.load(pdfBytes, {
    password: options?.password,
    ignoreEncryption: !options?.password,
    throwOnInvalidObject: false,
  });
  const renderer = NativeRenderer.fromDocument(doc);

  container.innerHTML = '';
  const scale = options?.scale ?? 1.5;
  const maxPages = options?.maxPages ?? renderer.pageCount;
  const pages: PageRenderInfo[] = [];
  const timings: number[] = [];

  for (let i = 0; i < Math.min(maxPages, renderer.pageCount); i++) {
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page';
    wrapper.setAttribute('data-page', String(i + 1));

    const canvas = document.createElement('canvas');

    const result = await renderer.renderPageToCanvas(i, canvas, { scale });
    timings.push(result.timeMs);

    wrapper.appendChild(canvas);

    const label = document.createElement('div');
    label.className = 'page-label';
    label.textContent = `Page ${i + 1} of ${renderer.pageCount}`;
    wrapper.appendChild(label);

    container.appendChild(wrapper);

    pages.push({
      wrapper,
      canvas,
      pdfWidth: result.width / scale,
      pdfHeight: result.height / scale,
    });
  }

  return { numPages: renderer.pageCount, pages, timings };
}
