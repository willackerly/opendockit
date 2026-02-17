/**
 * OpenDocKit Viewer — dev tool for visual inspection of PPTX rendering.
 *
 * Loads a PPTX file via file picker or drag-and-drop, renders ALL slides
 * vertically in a scrollable layout with slide labels and PNG export.
 */

import { SlideKit, type LoadedPresentation } from '@opendockit/pptx';
import { emuToPx } from '@opendockit/core';

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const btnOpen = document.getElementById('btn-open') as HTMLButtonElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const fileName = document.getElementById('file-name') as HTMLSpanElement;
const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
const emptyState = document.getElementById('empty-state') as HTMLDivElement;
const slidesContainer = document.getElementById('slides-container') as HTMLDivElement;
const errorBanner = document.getElementById('error-banner') as HTMLDivElement;
const loadingIndicator = document.getElementById('loading') as HTMLSpanElement;
const loadingMsg = document.getElementById('loading-msg') as HTMLSpanElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const slideInfo = document.getElementById('slide-info') as HTMLSpanElement;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let kit: SlideKit | null = null;
let presentation: LoadedPresentation | null = null;
let currentFileName = '';
let isLoading = false;

/** Offscreen canvas kept alive for re-rendering invalidated slides. */
let offscreenCanvas: HTMLCanvasElement | null = null;

/** Rendered slide images by index — used for live updates on invalidation. */
let slideImages: Map<number, HTMLImageElement> = new Map();

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

function updateSlideInfo(): void {
  if (!presentation) {
    slideInfo.textContent = '';
    return;
  }

  const wPx = Math.round(emuToPx(presentation.slideWidth));
  const hPx = Math.round(emuToPx(presentation.slideHeight));
  slideInfo.textContent = `${presentation.slideCount} slides | ${wPx} x ${hPx} px @ 96 dpi | Theme: ${presentation.theme.name}`;
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
  if (!file.name.toLowerCase().endsWith('.pptx')) {
    showError('Please select a .pptx file.');
    return;
  }

  clearError();

  // Dispose previous instance
  if (kit) {
    kit.dispose();
    kit = null;
    presentation = null;
  }
  if (offscreenCanvas) {
    offscreenCanvas.remove();
    offscreenCanvas = null;
  }
  slideImages.clear();

  currentFileName = file.name;
  fileName.textContent = file.name;

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

    const { slideCount } = presentation;

    // Calculate the aspect ratio for skeleton placeholders.
    const slideAspect = emuToPx(presentation.slideHeight) / emuToPx(presentation.slideWidth);

    // Phase 1: Create all slide slots with skeleton placeholders immediately.
    // This gives the user the full scrollable layout right away.
    const slots: { wrapper: HTMLDivElement; skeleton: HTMLDivElement }[] = [];
    for (let i = 0; i < slideCount; i++) {
      const slideWrapper = document.createElement('div');
      slideWrapper.className = 'slide-wrapper';
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
    for (let i = 0; i < slideCount; i++) {
      setLoading(true, `Rendering slide ${i + 1} of ${slideCount}...`);
      setStatus(`Rendering slide ${i + 1} of ${slideCount}...`);

      await kit.renderSlide(i);

      // Snapshot the offscreen canvas into a visible <img>.
      const img = document.createElement('img');
      img.src = offscreenCanvas!.toDataURL('image/png');
      img.alt = `Slide ${i + 1}`;
      img.className = 'slide-image';

      // Track the image for live updates on invalidation.
      slideImages.set(i, img);

      // Replace the skeleton with the rendered image.
      const { wrapper, skeleton } = slots[i];
      wrapper.replaceChild(img, skeleton);

      // Enable the Save PNG button now that we have image data.
      const saveBtn = wrapper.querySelector('.btn-sm') as HTMLButtonElement;
      saveBtn.disabled = false;
      const slideIndex = i;
      saveBtn.addEventListener('click', () => saveSlideAsPng(img, slideIndex));

      // Yield to browser between slides so each one appears immediately.
      await yieldToBrowser();
    }

    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    setLoading(false);
    setStatus(`Rendered ${slideCount} slides in ${elapsed}s.`);
  } catch (err) {
    setLoading(false);
    const message = err instanceof Error ? err.message : String(err);
    showError(`Failed to load ${file.name}: ${message}`);
    setStatus('Error');
    console.error('Load error:', err);
  }
}

/**
 * Re-render specific slides after a capability becomes available.
 *
 * Called by SlideKit's `onSlideInvalidated` callback when a WASM
 * module finishes loading. Re-renders each affected slide and
 * hot-swaps the image src — no DOM rebuild needed.
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

function saveSlideAsPng(img: HTMLImageElement, index: number): void {
  const a = document.createElement('a');
  a.href = img.src;
  const baseName = currentFileName.replace(/\.pptx$/i, '');
  a.download = `${baseName}_slide${index + 1}.png`;
  a.click();
  setStatus(`Saved ${a.download}`);
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

// File picker
btnOpen.addEventListener('click', () => {
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
    fileInput.click();
  }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

setStatus('No file loaded. Open a PPTX file to begin.');
