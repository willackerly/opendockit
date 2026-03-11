/**
 * OpenDocKit Viewer — dev tool for visual inspection and editing of PPTX and PDF rendering.
 *
 * Loads a PPTX or PDF file via file picker or drag-and-drop, renders ALL pages/slides
 * vertically in a scrollable layout with labels, PNG export, element inspector,
 * and basic editing (PPTX: move, resize, text edit, delete, save; PDF: coming soon).
 *
 * Format detection is automatic: .pptx → SlideKit pipeline, .pdf → PDFDocument + NativeRenderer.
 * Magic bytes fallback: %PDF-1 → PDF, PK\x03\x04 → PPTX.
 */

import { SlideKit, EditableSlideKit, type LoadedPresentation } from '@opendockit/pptx';
import { emuToPx } from '@opendockit/core';
import { deriveIR } from '@opendockit/core/edit';
import type { SlideElementIR, GroupIR, TransformIR, EditableElement, EditableParagraph } from '@opendockit/core';
import { PDFDocument } from '@opendockit/pdf-signer';
import { NativeRenderer } from '@opendockit/pdf-signer/render';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** EMU per inch. */
const EMU_PER_INCH = 914400;

/** Nudge distance in EMU (0.25 inches). */
const NUDGE_EMU = EMU_PER_INCH / 4;

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const btnOpen = document.getElementById('btn-open') as HTMLButtonElement;
const btnInspect = document.getElementById('btn-inspect') as HTMLButtonElement;
const btnEdit = document.getElementById('btn-edit') as HTMLButtonElement;
const btnSave = document.getElementById('btn-save') as HTMLButtonElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const fileName = document.getElementById('file-name') as HTMLSpanElement;
const formatBadge = document.getElementById('format-badge') as HTMLSpanElement;
const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
const emptyState = document.getElementById('empty-state') as HTMLDivElement;
const slidesContainer = document.getElementById('slides-container') as HTMLDivElement;
const errorBanner = document.getElementById('error-banner') as HTMLDivElement;
const loadingIndicator = document.getElementById('loading') as HTMLSpanElement;
const loadingMsg = document.getElementById('loading-msg') as HTMLSpanElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const slideInfo = document.getElementById('slide-info') as HTMLSpanElement;

// Edit panel DOM
const editPanel = document.getElementById('edit-panel') as HTMLDivElement;
const editKindEl = document.getElementById('edit-kind') as HTMLDivElement;
const editNameEl = document.getElementById('edit-name') as HTMLDivElement;
const editIdEl = document.getElementById('edit-id') as HTMLDivElement;
const editClose = document.getElementById('edit-close') as HTMLButtonElement;
const editX = document.getElementById('edit-x') as HTMLInputElement;
const editY = document.getElementById('edit-y') as HTMLInputElement;
const editW = document.getElementById('edit-w') as HTMLInputElement;
const editH = document.getElementById('edit-h') as HTMLInputElement;
const editTextGroup = document.getElementById('edit-text-group') as HTMLDivElement;
const editText = document.getElementById('edit-text') as HTMLTextAreaElement;
const editDelete = document.getElementById('edit-delete') as HTMLButtonElement;
const editApply = document.getElementById('edit-apply') as HTMLButtonElement;
const editStatusEl = document.getElementById('edit-status') as HTMLDivElement;
const editNudgeUp = document.getElementById('edit-nudge-up') as HTMLButtonElement;
const editNudgeDown = document.getElementById('edit-nudge-down') as HTMLButtonElement;
const editNudgeLeft = document.getElementById('edit-nudge-left') as HTMLButtonElement;
const editNudgeRight = document.getElementById('edit-nudge-right') as HTMLButtonElement;
const editNudgeCenter = document.getElementById('edit-nudge-center') as HTMLButtonElement;

// Thumbnail sidebar and perf overlay DOM
const btnThumbs = document.getElementById('btn-thumbs') as HTMLButtonElement;
const btnPerf = document.getElementById('btn-perf') as HTMLButtonElement;
const thumbnailSidebar = document.getElementById('thumbnail-sidebar') as HTMLDivElement;
const perfOverlay = document.getElementById('perf-overlay') as HTMLDivElement;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Active file format — determines which rendering pipeline is used. */
type FileFormat = 'pptx' | 'pdf' | null;
let activeFormat: FileFormat = null;

// --- PPTX state ---
let kit: SlideKit | null = null;
let presentation: LoadedPresentation | null = null;

// --- PDF state ---
let pdfDocument: PDFDocument | null = null;
let pdfRenderer: NativeRenderer | null = null;

// --- Common state ---
let currentFileName = '';
let isLoading = false;

/** Offscreen canvas kept alive for re-rendering invalidated slides. */
let offscreenCanvas: HTMLCanvasElement | null = null;

/** Rendered slide images by index — used for live updates on invalidation. */
let slideImages: Map<number, HTMLImageElement> = new Map();

/** Per-slide render times in milliseconds. */
let slideRenderTimes: Map<number, number> = new Map();

/** Whether the thumbnail sidebar is visible. */
let thumbsVisible = false;

/** Whether the perf overlay is visible. */
let perfVisible = false;

/** Inspector mode state. */
let inspectorActive = false;
let activeHighlight: HTMLDivElement | null = null;
let activeTooltip: HTMLDivElement | null = null;

/** Edit mode state. */
let editMode = false;
let editKit: EditableSlideKit | null = null;
let currentFileBytes: ArrayBuffer | null = null;
let selectedElementId: string | null = null;
let selectedSlideIndex: number | null = null;
let editHighlight: HTMLDivElement | null = null;
// Whether Save PPTX button should be active (tracked via btnSave.disabled)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function showError(message: string): void {
  errorBanner.textContent = message;
  errorBanner.classList.add('visible');
}

function clearError(): void {
  errorBanner.textContent = '';
  errorBanner.classList.remove('visible');
}

function setLoading(loading: boolean, message?: string): void {
  isLoading = loading;
  if (loading) {
    loadingIndicator.classList.add('visible');
    loadingMsg.textContent = message ?? 'Loading...';
  } else {
    loadingIndicator.classList.remove('visible');
  }
}

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function setEditStatus(text: string): void {
  editStatusEl.textContent = text;
  if (text) {
    setTimeout(() => {
      if (editStatusEl.textContent === text) editStatusEl.textContent = '';
    }, 3000);
  }
}

function updateSlideInfo(): void {
  if (activeFormat === 'pptx' && presentation) {
    const wPx = Math.round(emuToPx(presentation.slideWidth));
    const hPx = Math.round(emuToPx(presentation.slideHeight));
    slideInfo.textContent = `${presentation.slideCount} slides | ${wPx} x ${hPx} px @ 96 dpi | Theme: ${presentation.theme.name}`;
  } else if (activeFormat === 'pdf' && pdfRenderer) {
    slideInfo.textContent = `${pdfRenderer.pageCount} page${pdfRenderer.pageCount !== 1 ? 's' : ''}`;
  } else {
    slideInfo.textContent = '';
  }
}

function emuToInches(emu: number): number {
  return Math.round((emu / EMU_PER_INCH) * 100) / 100;
}

function inchesToEmu(inches: number): number {
  return Math.round(inches * EMU_PER_INCH);
}

/**
 * Detect the format of a file from extension and/or magic bytes.
 * Returns 'pdf', 'pptx', or null if unrecognized.
 */
function detectFormat(file: File, firstBytes?: Uint8Array): FileFormat {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.pptx')) return 'pptx';

  // Fallback to magic bytes if extension is ambiguous
  if (firstBytes && firstBytes.length >= 4) {
    // PDF: starts with %PDF
    if (firstBytes[0] === 0x25 && firstBytes[1] === 0x50 && firstBytes[2] === 0x44 && firstBytes[3] === 0x46) {
      return 'pdf';
    }
    // PPTX (ZIP): starts with PK\x03\x04
    if (firstBytes[0] === 0x50 && firstBytes[1] === 0x4b && firstBytes[2] === 0x03 && firstBytes[3] === 0x04) {
      return 'pptx';
    }
  }

  return null;
}

/** Update the format badge to show the current file format. */
function updateFormatBadge(format: FileFormat): void {
  if (!format) {
    formatBadge.style.display = 'none';
    formatBadge.className = 'format-badge';
    return;
  }
  formatBadge.style.display = '';
  formatBadge.className = `format-badge ${format}`;
  formatBadge.textContent = format.toUpperCase();
}

// ---------------------------------------------------------------------------
// Helpers: yield to browser for paint
// ---------------------------------------------------------------------------

/** Yield to the browser so it can paint pending DOM changes. */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

async function loadFile(file: File): Promise<void> {
  if (isLoading) return;

  clearError();
  clearEditSelection();

  // Read a small header to enable magic-byte detection
  const headerSlice = file.slice(0, 8);
  const headerBuffer = await headerSlice.arrayBuffer();
  const firstBytes = new Uint8Array(headerBuffer);

  const format = detectFormat(file, firstBytes);
  if (!format) {
    showError('Unsupported file type. Please open a .pptx or .pdf file.');
    return;
  }

  // Dispose previous instances regardless of old format
  if (kit) {
    kit.dispose();
    kit = null;
    presentation = null;
  }
  pdfDocument = null;
  pdfRenderer = null;
  editKit = null;
  currentFileBytes = null;
  activeFormat = null;
  btnSave.disabled = true;

  if (offscreenCanvas) {
    offscreenCanvas.remove();
    offscreenCanvas = null;
  }
  slideImages.clear();

  currentFileName = file.name;
  fileName.textContent = file.name;
  updateFormatBadge(format);

  // Show slides area, hide empty state
  emptyState.style.display = 'none';
  slidesContainer.classList.add('visible');
  dropZone.classList.remove('empty');

  // Clear previous slides
  slidesContainer.innerHTML = '';

  setLoading(true, 'Opening file...');
  setStatus(`Loading ${file.name}...`);

  try {
    const arrayBuffer = await file.arrayBuffer();
    currentFileBytes = arrayBuffer;
    activeFormat = format;

    if (format === 'pptx') {
      await loadPptxFile(arrayBuffer);
    } else {
      await loadPdfFile(arrayBuffer);
    }

  } catch (err) {
    setLoading(false);
    activeFormat = null;
    updateFormatBadge(null);
    const message = err instanceof Error ? err.message : String(err);
    showError(`Failed to load ${file.name}: ${message}`);
    setStatus('Error');
    console.error('Load error:', err);
  }
}

/** Load and render a PPTX file. */
async function loadPptxFile(arrayBuffer: ArrayBuffer): Promise<void> {
  // Create a hidden offscreen canvas — kept alive for re-rendering
  // invalidated slides when deferred capabilities load.
  offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.style.display = 'none';
  document.body.appendChild(offscreenCanvas);

  kit = new SlideKit({
    canvas: offscreenCanvas,
    onProgress: (event) => {
      const msg = event.message ?? `${event.phase} ${event.current}/${event.total}`;
      setLoading(true, msg);
    },
    onSlideInvalidated: (indices) => {
      // A new capability loaded — re-render affected slides in-place.
      reRenderSlides(indices);
    },
  });

  presentation = await kit.load(arrayBuffer);
  updateSlideInfo();

  // Load edit kit in parallel (non-blocking, for when edit mode is needed)
  loadEditKit(arrayBuffer);

  await renderAllSlides();
}

/** Load and render a PDF file using NativeRenderer. */
async function loadPdfFile(arrayBuffer: ArrayBuffer): Promise<void> {
  setLoading(true, 'Parsing PDF...');
  pdfDocument = await PDFDocument.load(arrayBuffer);

  setLoading(true, 'Setting up renderer...');
  pdfRenderer = NativeRenderer.fromDocument(pdfDocument);

  updateSlideInfo();

  // PDF edit mode is not yet implemented — disable edit/inspect buttons
  // (they still exist for future wiring)
  await renderAllPdfPages();
}

/** Load the editing kit from file bytes. */
async function loadEditKit(bytes: ArrayBuffer): Promise<void> {
  try {
    editKit = new EditableSlideKit();
    await editKit.load(bytes);
    // Signal to E2E tests that the edit kit is ready
    document.body.dataset.editKitReady = 'true';
  } catch (err) {
    console.warn('Failed to load edit kit:', err);
    editKit = null;
    document.body.dataset.editKitReady = 'error';
  }
}

/** Render all slides from the current SlideKit. */
async function renderAllSlides(): Promise<void> {
  if (!kit || !presentation || !offscreenCanvas) return;

  const { slideCount } = presentation;

  // Calculate the aspect ratio for skeleton placeholders.
  const slideAspect = emuToPx(presentation.slideHeight) / emuToPx(presentation.slideWidth);

  // Phase 1: Create all slide slots with skeleton placeholders immediately.
  const slots: { wrapper: HTMLDivElement; skeleton: HTMLDivElement }[] = [];
  slidesContainer.innerHTML = '';
  slideImages.clear();

  for (let i = 0; i < slideCount; i++) {
    const slideWrapper = document.createElement('div');
    slideWrapper.className = 'slide-wrapper';
    if (editMode) slideWrapper.classList.add('edit-active');
    slideWrapper.dataset.slideIndex = String(i);

    const label = document.createElement('div');
    label.className = 'slide-label';
    label.textContent = `Slide ${i + 1}`;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-sm';
    saveBtn.textContent = 'Save PNG';
    saveBtn.disabled = true;
    label.appendChild(saveBtn);

    const skeleton = document.createElement('div');
    skeleton.className = 'slide-skeleton';
    skeleton.style.aspectRatio = `1 / ${slideAspect}`;

    slideWrapper.appendChild(label);
    slideWrapper.appendChild(skeleton);
    slidesContainer.appendChild(slideWrapper);
    slots.push({ wrapper: slideWrapper, skeleton });
  }

  // Yield so the browser paints all the skeleton placeholders.
  await yieldToBrowser();

  // Phase 2: Render each slide incrementally, replacing skeletons as we go.
  const t0 = performance.now();
  slideRenderTimes.clear();
  thumbnailSidebar.innerHTML = '';

  for (let i = 0; i < slideCount; i++) {
    setLoading(true, `Rendering slide ${i + 1} of ${slideCount}...`);
    setStatus(`Rendering slide ${i + 1} of ${slideCount}...`);

    const slideT0 = performance.now();
    await kit.renderSlide(i);
    const slideMs = performance.now() - slideT0;
    slideRenderTimes.set(i, slideMs);

    // Snapshot the offscreen canvas into a visible <img> inside
    // a container div (needed for inspector/edit overlay positioning).
    const imgContainer = document.createElement('div');
    imgContainer.className = 'slide-image-container';

    const dataUrl = offscreenCanvas!.toDataURL('image/png');

    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = `Slide ${i + 1}`;
    img.className = 'slide-image';

    imgContainer.appendChild(img);

    // Track the image for live updates on invalidation.
    slideImages.set(i, img);

    // Wire up click handler for inspector and edit mode.
    const slideIdx = i;
    img.addEventListener('click', (e) => handleSlideClick(img, slideIdx, e));

    // Replace the skeleton with the rendered image container.
    const { wrapper, skeleton } = slots[i];
    wrapper.replaceChild(imgContainer, skeleton);

    // Enable the Save PNG button now that we have image data.
    const saveBtn = wrapper.querySelector('.btn-sm') as HTMLButtonElement;
    saveBtn.disabled = false;
    const slideIndex = i;
    saveBtn.addEventListener('click', () => saveSlideAsPng(img, slideIndex));

    // Generate thumbnail for sidebar.
    const thumbItem = document.createElement('div');
    thumbItem.className = 'thumb-item';
    thumbItem.dataset.slideIndex = String(i);
    const thumbImg = document.createElement('img');
    thumbImg.src = dataUrl;
    thumbImg.alt = `Slide ${i + 1}`;
    const thumbNum = document.createElement('span');
    thumbNum.className = 'thumb-num';
    thumbNum.textContent = String(i + 1);
    thumbItem.appendChild(thumbImg);
    thumbItem.appendChild(thumbNum);
    thumbItem.addEventListener('click', () => {
      const target = document.querySelector(`.slide-wrapper[data-slide-index="${i}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    thumbnailSidebar.appendChild(thumbItem);

    // Yield to browser between slides so each one appears immediately.
    await yieldToBrowser();
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  setLoading(false);
  setStatus(`Rendered ${slideCount} slides in ${elapsed}s.`);
  updatePerfOverlay();
}

/**
 * Re-render specific slides after a capability becomes available.
 */
async function reRenderSlides(indices: number[]): Promise<void> {
  if (!kit || !offscreenCanvas) return;

  const count = indices.length;
  setStatus(`Upgrading ${count} slide${count > 1 ? 's' : ''} with new capability...`);

  for (const i of indices) {
    try {
      await kit.renderSlide(i);

      // Hot-swap the image src — the existing <img> element stays in the DOM.
      const img = slideImages.get(i);
      if (img) {
        img.src = offscreenCanvas.toDataURL('image/png');
      }
    } catch (err) {
      console.warn(`Failed to re-render slide ${i + 1}:`, err);
    }
  }

  setStatus(`Upgraded ${count} slide${count > 1 ? 's' : ''}.`);
}

/** Render all pages from the current PDF NativeRenderer. */
async function renderAllPdfPages(): Promise<void> {
  if (!pdfRenderer) return;

  const pageCount = pdfRenderer.pageCount;

  // Phase 1: Create all page slots with skeleton placeholders.
  const slots: { wrapper: HTMLDivElement; skeleton: HTMLDivElement }[] = [];
  slidesContainer.innerHTML = '';
  slideImages.clear();

  // Use a default A4 aspect ratio for initial skeletons (1.414 ≈ 297/210)
  const skeletonAspect = 1.414;

  for (let i = 0; i < pageCount; i++) {
    const slideWrapper = document.createElement('div');
    slideWrapper.className = 'slide-wrapper';
    slideWrapper.dataset.slideIndex = String(i);

    const label = document.createElement('div');
    label.className = 'slide-label';
    label.textContent = `Page ${i + 1}`;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-sm';
    saveBtn.textContent = 'Save PNG';
    saveBtn.disabled = true;
    label.appendChild(saveBtn);

    const skeleton = document.createElement('div');
    skeleton.className = 'slide-skeleton';
    skeleton.style.aspectRatio = `1 / ${skeletonAspect}`;

    slideWrapper.appendChild(label);
    slideWrapper.appendChild(skeleton);
    slidesContainer.appendChild(slideWrapper);
    slots.push({ wrapper: slideWrapper, skeleton });
  }

  // Yield so the browser paints the skeletons first.
  await yieldToBrowser();

  // Phase 2: Render each page using renderPageToCanvas, snapshot to <img>.
  const offscreen = document.createElement('canvas');
  offscreen.style.display = 'none';
  document.body.appendChild(offscreen);

  const t0 = performance.now();
  try {
    for (let i = 0; i < pageCount; i++) {
      setLoading(true, `Rendering page ${i + 1} of ${pageCount}...`);
      setStatus(`Rendering page ${i + 1} of ${pageCount}...`);

      // Render directly to our offscreen canvas (scale 1.5 = ~108 DPI)
      const renderResult = await pdfRenderer.renderPageToCanvas(i, offscreen, { scale: 1.5 });
      if (renderResult.diagnostics && renderResult.diagnostics.length > 0) {
        console.warn(`[PDF Page ${i + 1}] ${renderResult.diagnostics.length} diagnostic(s):`);
        for (const d of renderResult.diagnostics) {
          console.warn(`  [${d.category}] ${d.message}`, d.details || '');
        }
      }

      // Snapshot the rendered canvas to a data URL
      const imgContainer = document.createElement('div');
      imgContainer.className = 'slide-image-container';

      const img = document.createElement('img');
      img.src = offscreen.toDataURL('image/png');
      img.alt = `Page ${i + 1}`;
      img.className = 'slide-image';

      imgContainer.appendChild(img);

      // Track for live updates
      slideImages.set(i, img);

      // Replace skeleton with rendered image
      const { wrapper, skeleton } = slots[i];
      wrapper.replaceChild(imgContainer, skeleton);

      // Enable Save PNG button
      const saveBtn = wrapper.querySelector('.btn-sm') as HTMLButtonElement;
      saveBtn.disabled = false;
      const pageIndex = i;
      saveBtn.addEventListener('click', () => savePageAsPng(img, pageIndex));

      await yieldToBrowser();
    }
  } finally {
    offscreen.remove();
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  setLoading(false);
  setStatus(`Rendered ${pageCount} page${pageCount !== 1 ? 's' : ''} in ${elapsed}s.`);
}

function saveSlideAsPng(img: HTMLImageElement, index: number): void {
  const a = document.createElement('a');
  a.href = img.src;
  const baseName = currentFileName.replace(/\.pptx$/i, '');
  a.download = `${baseName}_slide${index + 1}.png`;
  a.click();
  setStatus(`Saved ${a.download}`);
}

function savePageAsPng(img: HTMLImageElement, index: number): void {
  const a = document.createElement('a');
  a.href = img.src;
  const baseName = currentFileName.replace(/\.pdf$/i, '');
  a.download = `${baseName}_page${index + 1}.png`;
  a.click();
  setStatus(`Saved ${a.download}`);
}

// ---------------------------------------------------------------------------
// Shared hit-testing
// ---------------------------------------------------------------------------

/** Extract a short text preview from an element. */
function getTextPreview(element: SlideElementIR): string | undefined {
  if (element.kind !== 'shape') return undefined;
  const shape = element as any;
  if (!shape.textBody?.paragraphs) return undefined;
  const texts: string[] = [];
  for (const para of shape.textBody.paragraphs) {
    if (!para.runs) continue;
    for (const run of para.runs) {
      if (run.text) texts.push(run.text);
    }
  }
  const full = texts.join('').trim();
  if (!full) return undefined;
  return full.length > 80 ? full.slice(0, 77) + '...' : full;
}

/** Extract full text from an element (newline per paragraph). */
function getFullText(element: SlideElementIR): string | undefined {
  if (element.kind !== 'shape') return undefined;
  const shape = element as any;
  if (!shape.textBody?.paragraphs) return undefined;
  const lines: string[] = [];
  for (const para of shape.textBody.paragraphs) {
    const texts: string[] = [];
    if (para.runs) {
      for (const run of para.runs) {
        if (run.text) texts.push(run.text);
      }
    }
    lines.push(texts.join(''));
  }
  return lines.join('\n');
}

/** Get transform from any element type. */
function getTransform(el: SlideElementIR): TransformIR | undefined {
  if (el.kind === 'unsupported') {
    const u = el as any;
    if (u.bounds) {
      return {
        position: { x: u.bounds.x, y: u.bounds.y },
        size: { width: u.bounds.width, height: u.bounds.height },
      };
    }
    return undefined;
  }
  return (el as any).properties?.transform;
}

/** Hit-test a point (in EMU) against an element, handling groups recursively.
 *  Returns the deepest matching element (highest specificity). */
function hitTestElement(
  el: SlideElementIR,
  layer: 'master' | 'layout' | 'slide',
  emuX: number,
  emuY: number,
  offsetX: number,
  offsetY: number
): { element: SlideElementIR; layer: 'master' | 'layout' | 'slide'; transform: TransformIR } | null {
  const transform = getTransform(el);
  if (!transform) return null;

  const absX = offsetX + transform.position.x;
  const absY = offsetY + transform.position.y;
  const w = transform.size.width;
  const h = transform.size.height;

  // For groups, check children first (deeper = higher priority)
  if (el.kind === 'group') {
    const group = el as GroupIR;
    const childOffset = group.childOffset;
    const childExtent = group.childExtent;

    if (childOffset && childExtent && w > 0 && h > 0) {
      // Map point from parent space into group's child coordinate space
      const scaleX = childExtent.width / w;
      const scaleY = childExtent.height / h;
      const localX = (emuX - absX) * scaleX + childOffset.x;
      const localY = (emuY - absY) * scaleY + childOffset.y;

      // Check children in reverse order (later = on top)
      for (let i = group.children.length - 1; i >= 0; i--) {
        const hit = hitTestElement(group.children[i], layer, localX, localY, 0, 0);
        if (hit) {
          // Inverse-map child-space coordinates back to parent (slide) space.
          // Forward: localX = (emuX - absX) * scaleX + childOffset.x
          // Inverse: slideX = (childX - childOffset.x) / scaleX + absX
          const cp = hit.transform.position;
          const cs = hit.transform.size;
          return {
            ...hit,
            transform: {
              ...hit.transform,
              position: {
                x: (cp.x - childOffset.x) / scaleX + absX,
                y: (cp.y - childOffset.y) / scaleY + absY,
              },
              size: {
                width: cs.width / scaleX,
                height: cs.height / scaleY,
              },
            },
          };
        }
      }
    }
  }

  // Check if point is inside this element's bounds
  if (emuX >= absX && emuX <= absX + w && emuY >= absY && emuY <= absY + h) {
    return {
      element: el,
      layer,
      transform: {
        ...transform,
        position: { x: absX, y: absY },
      },
    };
  }

  return null;
}

/** Dispatch click on a slide image to inspector or edit mode. */
async function handleSlideClick(img: HTMLImageElement, slideIndex: number, event: MouseEvent): Promise<void> {
  // PDF inspector/edit not yet implemented — ignore clicks in PDF mode
  if (activeFormat === 'pdf') return;

  if (editMode) {
    await handleEditClick(img, slideIndex, event);
  } else if (inspectorActive) {
    await handleInspectorClick(img, slideIndex, event);
  }
}

/** Perform hit-test on a slide and return the result. */
async function hitTestSlide(
  img: HTMLImageElement,
  slideIndex: number,
  event: MouseEvent
): Promise<{ element: SlideElementIR; layer: 'master' | 'layout' | 'slide'; transform: TransformIR } | null> {
  if (!kit || !presentation) return null;

  const rect = img.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;

  // Convert CSS pixels to EMU
  const scaleX = presentation.slideWidth / rect.width;
  const scaleY = presentation.slideHeight / rect.height;
  const emuX = clickX * scaleX;
  const emuY = clickY * scaleY;

  // Get all elements for this slide
  const data = await kit.getSlideElements(slideIndex);

  // Hit test in reverse render order (topmost first)
  for (let i = data.elements.length - 1; i >= 0; i--) {
    const { element, layer } = data.elements[i];
    const result = hitTestElement(element, layer, emuX, emuY, 0, 0);
    if (result) return result;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Inspector mode
// ---------------------------------------------------------------------------

function toggleInspector(): void {
  // PDF inspector not yet implemented
  if (activeFormat === 'pdf') {
    setStatus('Element inspector is not yet available for PDF files.');
    return;
  }

  // Turn off edit mode if active
  if (editMode) toggleEditMode();

  inspectorActive = !inspectorActive;
  btnInspect.classList.toggle('active', inspectorActive);

  document.querySelectorAll('.slide-wrapper').forEach((w) => {
    w.classList.toggle('inspector-active', inspectorActive);
  });

  if (!inspectorActive) {
    clearInspectorOverlay();
  }
}

function clearInspectorOverlay(): void {
  if (activeHighlight) {
    activeHighlight.remove();
    activeHighlight = null;
  }
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
}

async function handleInspectorClick(img: HTMLImageElement, slideIndex: number, event: MouseEvent): Promise<void> {
  if (!inspectorActive || !kit || !presentation) return;

  const hit = await hitTestSlide(img, slideIndex, event);
  clearInspectorOverlay();
  if (!hit) return;

  const container = img.parentElement!;
  const { transform, element, layer } = hit;
  const rect = img.getBoundingClientRect();
  const scaleX = presentation.slideWidth / rect.width;
  const scaleY = presentation.slideHeight / rect.height;

  // Convert element bounds to CSS pixels relative to the image
  const left = transform.position.x / scaleX;
  const top = transform.position.y / scaleY;
  const width = transform.size.width / scaleX;
  const height = transform.size.height / scaleY;

  // Create highlight overlay
  const highlight = document.createElement('div');
  highlight.className = 'inspector-highlight';
  highlight.style.left = `${left}px`;
  highlight.style.top = `${top}px`;
  highlight.style.width = `${width}px`;
  highlight.style.height = `${height}px`;
  container.appendChild(highlight);
  activeHighlight = highlight;

  // Create tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'inspector-tooltip';

  const kindLabel = document.createElement('div');
  kindLabel.className = 'tooltip-kind';
  kindLabel.textContent = element.kind;
  tooltip.appendChild(kindLabel);

  const name = (element as any).name ?? (element as any).nonVisualProperties?.name;
  if (name) {
    const nameLabel = document.createElement('div');
    nameLabel.className = 'tooltip-name';
    nameLabel.textContent = name;
    tooltip.appendChild(nameLabel);
  }

  const detail = document.createElement('div');
  detail.className = 'tooltip-detail';
  const posX = Math.round(emuToPx(transform.position.x));
  const posY = Math.round(emuToPx(transform.position.y));
  const szW = Math.round(emuToPx(transform.size.width));
  const szH = Math.round(emuToPx(transform.size.height));
  detail.textContent = `${posX}, ${posY}  ${szW} x ${szH} px`;
  tooltip.appendChild(detail);

  const textPreview = getTextPreview(element);
  if (textPreview) {
    const textEl = document.createElement('div');
    textEl.className = 'tooltip-text';
    textEl.textContent = `"${textPreview}"`;
    tooltip.appendChild(textEl);
  }

  const layerEl = document.createElement('div');
  layerEl.className = 'tooltip-layer';
  layerEl.textContent = `${layer} layer`;
  tooltip.appendChild(layerEl);

  let tooltipLeft = left + width + 8;
  let tooltipTop = top;
  if (tooltipLeft + 200 > rect.width) {
    tooltipLeft = left - 208;
    if (tooltipLeft < 0) tooltipLeft = 8;
  }

  tooltip.style.left = `${tooltipLeft}px`;
  tooltip.style.top = `${tooltipTop}px`;
  container.appendChild(tooltip);
  activeTooltip = tooltip;
}

// ---------------------------------------------------------------------------
// Edit mode
// ---------------------------------------------------------------------------

function toggleEditMode(): void {
  // PDF edit mode not yet implemented
  if (activeFormat === 'pdf') {
    setStatus('Edit mode is not yet available for PDF files.');
    return;
  }

  // Turn off inspector if active
  if (inspectorActive) {
    inspectorActive = false;
    btnInspect.classList.remove('active');
    document.querySelectorAll('.slide-wrapper').forEach((w) => {
      w.classList.remove('inspector-active');
    });
    clearInspectorOverlay();
  }

  editMode = !editMode;
  btnEdit.classList.toggle('active', editMode);

  document.querySelectorAll('.slide-wrapper').forEach((w) => {
    w.classList.toggle('edit-active', editMode);
  });

  if (!editMode) {
    clearEditSelection();
  }
}

function clearEditSelection(): void {
  selectedElementId = null;
  selectedSlideIndex = null;
  editPanel.classList.remove('visible');

  if (editHighlight) {
    editHighlight.remove();
    editHighlight = null;
  }
}

/**
 * Hit-test using edit model positions for slide-layer elements.
 *
 * After edits, SlideKit's cached IR has stale positions. This function
 * builds an augmented element list: master/layout from cache (read-only),
 * slide-layer elements from deriveIR (current edit model positions).
 *
 * Returns the editable element ID alongside the hit, so callers don't
 * need to reconstruct composite IDs from IR fields (which vary by kind).
 */
async function editModeHitTest(
  img: HTMLImageElement,
  slideIndex: number,
  event: MouseEvent
): Promise<{
  element: SlideElementIR;
  layer: 'master' | 'layout' | 'slide';
  transform: TransformIR;
  editableId?: string;
} | null> {
  if (!kit || !presentation || !editKit) return null;

  const rect = img.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;

  const scaleX = presentation.slideWidth / rect.width;
  const scaleY = presentation.slideHeight / rect.height;
  const emuX = clickX * scaleX;
  const emuY = clickY * scaleY;

  // Get original elements for master/layout layers
  const data = await kit.getSlideElements(slideIndex);

  // Build augmented element list, tracking editable IDs for slide-layer elements
  const elements: { element: SlideElementIR; layer: 'master' | 'layout' | 'slide'; editableId?: string }[] = [];

  // Master + layout elements (from cache — read-only, no edits possible)
  for (const item of data.elements) {
    if (item.layer !== 'slide') {
      elements.push(item);
    }
  }

  // Slide elements from edit model with current positions via deriveIR
  const slides = editKit.presentation.getSlides();
  if (slideIndex < slides.length) {
    for (const editable of slides[slideIndex].elements) {
      if (editable.deleted) continue;
      const derived = deriveIR(editable);
      elements.push({ element: derived, layer: 'slide' as const, editableId: editable.id });
    }
  }

  // Hit-test in reverse order (topmost = last = highest z-order)
  for (let i = elements.length - 1; i >= 0; i--) {
    const { element, layer, editableId } = elements[i];
    const result = hitTestElement(element, layer, emuX, emuY, 0, 0);
    if (result) return { ...result, editableId };
  }

  return null;
}

async function handleEditClick(img: HTMLImageElement, slideIndex: number, event: MouseEvent): Promise<void> {
  if (!editMode || !kit || !presentation || !editKit) return;

  // In edit mode, build an augmented element list that uses the edit model's
  // current positions for slide-layer elements (not stale cached IR).
  const hit = await editModeHitTest(img, slideIndex, event);

  // Clear previous selection
  clearEditSelection();

  if (!hit) return;

  const { element, layer, editableId } = hit;

  // Only allow editing slide-layer elements
  if (layer !== 'slide') {
    setEditStatus(`Cannot edit ${layer}-layer elements`);
    return;
  }

  // Use the editable ID returned by editModeHitTest
  if (!editableId) {
    setEditStatus('Element has no editable ID');
    return;
  }

  // Look up the editable element
  const editable = editKit.getElement(editableId);
  if (!editable) {
    setEditStatus(`Element not found in edit model: ${editableId}`);
    return;
  }

  selectedElementId = editableId;
  selectedSlideIndex = slideIndex;

  // Show highlight on the slide — use the editable's transform so the highlight
  // matches the element being edited (for groups, the group bounding box).
  const container = img.parentElement!;
  const rect = img.getBoundingClientRect();
  const scaleX = presentation.slideWidth / rect.width;
  const scaleY = presentation.slideHeight / rect.height;

  const left = editable.transform.x / scaleX;
  const top = editable.transform.y / scaleY;
  const width = editable.transform.width / scaleX;
  const height = editable.transform.height / scaleY;

  const highlight = document.createElement('div');
  highlight.className = 'edit-highlight';
  highlight.style.left = `${left}px`;
  highlight.style.top = `${top}px`;
  highlight.style.width = `${width}px`;
  highlight.style.height = `${height}px`;

  // Add corner handles
  for (const pos of ['tl', 'tr', 'bl', 'br']) {
    const handle = document.createElement('div');
    handle.className = `edit-handle ${pos}`;
    highlight.appendChild(handle);
  }

  container.appendChild(highlight);
  editHighlight = highlight;

  // Populate the edit panel
  populateEditPanel(editable, element);
}

function populateEditPanel(editable: EditableElement, irElement: SlideElementIR): void {
  editKindEl.textContent = editable.kind.toUpperCase();
  editNameEl.textContent = (irElement as any).name ?? (irElement as any).nonVisualProperties?.name ?? '';
  editIdEl.textContent = editable.id;

  // Position & size in inches
  editX.value = String(emuToInches(editable.transform.x));
  editY.value = String(emuToInches(editable.transform.y));
  editW.value = String(emuToInches(editable.transform.width));
  editH.value = String(emuToInches(editable.transform.height));

  // Text (shapes only)
  const fullText = getFullText(irElement);
  if (fullText !== undefined && editable.kind === 'shape') {
    editTextGroup.style.display = '';
    editText.value = fullText;
  } else {
    editTextGroup.style.display = 'none';
    editText.value = '';
  }

  editStatusEl.textContent = '';
  editPanel.classList.add('visible');
}

/** Apply the current edit panel values to the editable element. */
async function applyEdits(): Promise<void> {
  if (!editKit || !selectedElementId || selectedSlideIndex === null) return;

  const editable = editKit.getElement(selectedElementId);
  if (!editable) {
    setEditStatus('Element no longer exists');
    return;
  }

  try {
    // Check for position changes
    const newX = inchesToEmu(parseFloat(editX.value));
    const newY = inchesToEmu(parseFloat(editY.value));
    const dx = newX - editable.transform.x;
    const dy = newY - editable.transform.y;
    if (dx !== 0 || dy !== 0) {
      editKit.moveElement(selectedElementId, dx, dy);
    }

    // Check for size changes
    const newW = inchesToEmu(parseFloat(editW.value));
    const newH = inchesToEmu(parseFloat(editH.value));
    if (newW !== editable.transform.width || newH !== editable.transform.height) {
      editKit.resizeElement(selectedElementId, newW, newH);
    }

    // Check for text changes (shapes only)
    if (editable.kind === 'shape' && editTextGroup.style.display !== 'none') {
      const newText = editText.value;
      const originalText = getFullText(editable.originalIR);
      if (newText !== originalText) {
        const paragraphs: EditableParagraph[] = newText.split('\n').map((line) => ({
          runs: [{ text: line }],
        }));
        editKit.setText(selectedElementId, paragraphs);
      }
    }

    // Instant re-render of just this slide
    await reRenderEditedSlide(selectedSlideIndex);
    updateEditHighlight();
    btnSave.disabled = false;
    setEditStatus('Applied');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setEditStatus(`Error: ${message}`);
    console.error('Apply error:', err);
  }
}

/** Delete the currently selected element. */
async function deleteSelected(): Promise<void> {
  if (!editKit || !selectedElementId || selectedSlideIndex === null) return;

  const slideIdx = selectedSlideIndex;
  try {
    editKit.deleteElement(selectedElementId);
    clearEditSelection();
    await reRenderEditedSlide(slideIdx);
    btnSave.disabled = false;
    setStatus('Element deleted');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setEditStatus(`Delete error: ${message}`);
    console.error('Delete error:', err);
  }
}

/** Nudge the selected element by a delta. */
async function nudgeSelected(dx: number, dy: number): Promise<void> {
  if (!editKit || !selectedElementId || selectedSlideIndex === null) return;

  try {
    editKit.moveElement(selectedElementId, dx, dy);
    await reRenderEditedSlide(selectedSlideIndex);
    updateEditHighlight();
    updateEditPanelValues();
    btnSave.disabled = false;
  } catch (err) {
    console.error('Nudge error:', err);
  }
}

/** Center the selected element on the slide. */
async function centerSelected(): Promise<void> {
  if (!editKit || !selectedElementId || !presentation || selectedSlideIndex === null) return;

  const editable = editKit.getElement(selectedElementId);
  if (!editable) return;

  const centerX = (presentation.slideWidth - editable.transform.width) / 2;
  const centerY = (presentation.slideHeight - editable.transform.height) / 2;
  const dx = Math.round(centerX) - editable.transform.x;
  const dy = Math.round(centerY) - editable.transform.y;

  if (dx !== 0 || dy !== 0) {
    editKit.moveElement(selectedElementId, dx, dy);
    await reRenderEditedSlide(selectedSlideIndex);
    updateEditHighlight();
    updateEditPanelValues();
    btnSave.disabled = false;
  }
}

/**
 * Re-render a single slide with edits applied via deriveIR.
 *
 * Builds an overrides map from the edit model's dirty elements,
 * calls renderSlideWithOverrides on the rendering SlideKit, and
 * hot-swaps the affected slide image. No save/reload needed.
 */
async function reRenderEditedSlide(slideIndex: number): Promise<void> {
  if (!editKit || !kit || !offscreenCanvas || !presentation) return;

  // Build overrides map: element index → derived IR (or null for deleted).
  // Indices correspond to the slide's elements array from parsing — the editable
  // model preserves this order, so index i maps to the i-th parsed element.
  const overrides = new Map<number, SlideElementIR | null>();
  const slides = editKit.presentation.getSlides();
  if (slideIndex >= slides.length) return;

  const elements = slides[slideIndex].elements;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const derived = deriveIR(el);
    if (derived.kind === 'unsupported' && (derived as any).elementType === 'deleted') {
      overrides.set(i, null);
    } else if (derived !== el.originalIR) {
      // Only add to overrides if actually changed (deriveIR returns originalIR for clean elements)
      overrides.set(i, derived);
    }
  }

  // Render with overrides (only if there are any edits on this slide)
  if (overrides.size > 0) {
    await kit.renderSlideWithOverrides(slideIndex, overrides);
  } else {
    await kit.renderSlide(slideIndex);
  }

  // Hot-swap just this slide's image
  const img = slideImages.get(slideIndex);
  if (img) {
    img.src = offscreenCanvas.toDataURL('image/png');
  }
}

/** Update the edit highlight position from the current editable transform. */
function updateEditHighlight(): void {
  if (!editHighlight || !editKit || !selectedElementId || !presentation) return;

  const editable = editKit.getElement(selectedElementId);
  if (!editable) return;

  // Find the slide image to get scale factors
  const img = selectedSlideIndex !== null ? slideImages.get(selectedSlideIndex) : null;
  if (!img) return;

  const rect = img.getBoundingClientRect();
  const scaleX = presentation.slideWidth / rect.width;
  const scaleY = presentation.slideHeight / rect.height;

  editHighlight.style.left = `${editable.transform.x / scaleX}px`;
  editHighlight.style.top = `${editable.transform.y / scaleY}px`;
  editHighlight.style.width = `${editable.transform.width / scaleX}px`;
  editHighlight.style.height = `${editable.transform.height / scaleY}px`;
}

/** Update the edit panel input values from the current editable element. */
function updateEditPanelValues(): void {
  if (!editKit || !selectedElementId) return;

  const editable = editKit.getElement(selectedElementId);
  if (!editable) return;

  editX.value = String(emuToInches(editable.transform.x));
  editY.value = String(emuToInches(editable.transform.y));
  editW.value = String(emuToInches(editable.transform.width));
  editH.value = String(emuToInches(editable.transform.height));
}

/**
 * Save and download the edited PPTX.
 *
 * Calls editKit.save() to produce patched bytes, then re-loads the
 * edit kit from the saved bytes (new baseline for subsequent edits).
 */
async function downloadPptx(): Promise<void> {
  if (!editKit || !currentFileBytes) return;

  setLoading(true, 'Saving PPTX...');

  try {
    // Save to get patched bytes
    const bytes = await editKit.save();

    // Download
    const blob = new Blob([bytes as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = currentFileName.replace(/\.pptx$/i, '');
    a.download = `${baseName}_edited.pptx`;
    a.click();
    URL.revokeObjectURL(url);

    // Re-load edit kit from saved bytes so subsequent edits build on this baseline
    currentFileBytes = bytes.buffer as ArrayBuffer;
    await loadEditKit(currentFileBytes);

    setLoading(false);
    btnSave.disabled = true;
    setStatus(`Downloaded ${a.download}`);
  } catch (err) {
    setLoading(false);
    const message = err instanceof Error ? err.message : String(err);
    showError(`Save failed: ${message}`);
    console.error('Save error:', err);
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

// Inspector toggle
btnInspect.addEventListener('click', () => toggleInspector());

// Edit mode toggle
btnEdit.addEventListener('click', () => toggleEditMode());

// Save PPTX button
btnSave.addEventListener('click', () => downloadPptx());

// Edit panel: close
editClose.addEventListener('click', () => clearEditSelection());

// Edit panel: apply
editApply.addEventListener('click', () => applyEdits());

// Edit panel: delete
editDelete.addEventListener('click', () => deleteSelected());

// Edit panel: nudge buttons
editNudgeUp.addEventListener('click', () => nudgeSelected(0, -NUDGE_EMU));
editNudgeDown.addEventListener('click', () => nudgeSelected(0, NUDGE_EMU));
editNudgeLeft.addEventListener('click', () => nudgeSelected(-NUDGE_EMU, 0));
editNudgeRight.addEventListener('click', () => nudgeSelected(NUDGE_EMU, 0));
editNudgeCenter.addEventListener('click', () => centerSelected());

// Escape to dismiss selection / inspector
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    clearInspectorOverlay();
    clearEditSelection();
  }
});

// Arrow keys for nudging in edit mode
document.addEventListener('keydown', (e) => {
  if (!editMode || !selectedElementId) return;
  // Don't capture if typing in an input
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault();
      nudgeSelected(0, -NUDGE_EMU);
      break;
    case 'ArrowDown':
      e.preventDefault();
      nudgeSelected(0, NUDGE_EMU);
      break;
    case 'ArrowLeft':
      e.preventDefault();
      nudgeSelected(-NUDGE_EMU, 0);
      break;
    case 'ArrowRight':
      e.preventDefault();
      nudgeSelected(NUDGE_EMU, 0);
      break;
    case 'Delete':
    case 'Backspace':
      e.preventDefault();
      deleteSelected();
      break;
  }
});

// File picker
btnOpen.addEventListener('click', () => {
  fileInput.value = ''; // Reset so re-selecting same file fires change
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) {
    loadFile(file);
  }
  fileInput.value = '';
});

// Drag and drop
let dragCounter = 0;

dropZone.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dropZone.classList.remove('drag-over');
  }
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropZone.classList.remove('drag-over');

  const file = e.dataTransfer?.files[0];
  if (file) {
    loadFile(file);
  }
});

// Click on empty drop zone to open file picker
dropZone.addEventListener('click', (e) => {
  if ((dropZone.classList.contains('empty') && e.target === dropZone) || e.target === emptyState) {
    fileInput.value = '';
    fileInput.click();
  }
});

// ---------------------------------------------------------------------------
// Thumbnail sidebar & Perf overlay
// ---------------------------------------------------------------------------

/** Update the performance overlay badge with render stats. */
function updatePerfOverlay(): void {
  if (!perfVisible || slideRenderTimes.size === 0) {
    perfOverlay.classList.remove('visible');
    return;
  }
  const times = [...slideRenderTimes.values()];
  const total = times.reduce((a, b) => a + b, 0);
  const avg = total / times.length;
  const max = Math.max(...times);
  perfOverlay.innerHTML =
    `Total: ${total.toFixed(0)}ms | Avg: ${avg.toFixed(0)}ms | Max: ${max.toFixed(0)}ms | ${times.length} slides`;
  perfOverlay.classList.add('visible');
}

/** Track which slide is in view and highlight its thumbnail. */
function setupThumbnailScrollTracking(): void {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const idx = (entry.target as HTMLElement).dataset.slideIndex;
          thumbnailSidebar
            .querySelectorAll('.thumb-item')
            .forEach((el) =>
              el.classList.toggle('active', (el as HTMLElement).dataset.slideIndex === idx)
            );
        }
      }
    },
    { threshold: 0.5 }
  );
  document.querySelectorAll('.slide-wrapper').forEach((el) => observer.observe(el));
}

btnThumbs.addEventListener('click', () => {
  thumbsVisible = !thumbsVisible;
  thumbnailSidebar.classList.toggle('visible', thumbsVisible);
  btnThumbs.classList.toggle('active', thumbsVisible);
  if (thumbsVisible) setupThumbnailScrollTracking();
});

btnPerf.addEventListener('click', () => {
  perfVisible = !perfVisible;
  btnPerf.classList.toggle('active', perfVisible);
  updatePerfOverlay();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

// Expose debug helpers for E2E tests and diagnostic tooling
(window as any).__debug = {
  get kit() { return kit; },
  get presentation() { return presentation; },
  get pdfDocument() { return pdfDocument; },
  get pdfRenderer() { return pdfRenderer; },
  get activeFormat() { return activeFormat; },
  get editKit() { return editKit; },
  get inspectorActive() { return inspectorActive; },
  get editMode() { return editMode; },
};

setStatus('No file loaded. Open a PPTX or PDF file to begin.');
