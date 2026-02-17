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

    // Create a hidden offscreen canvas for SlideKit to render into
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.style.display = 'none';
    document.body.appendChild(offscreenCanvas);

    kit = new SlideKit({
      canvas: offscreenCanvas,
      onProgress: (event) => {
        const msg = event.message ?? `${event.phase} ${event.current}/${event.total}`;
        setLoading(true, msg);
      },
    });

    presentation = await kit.load(arrayBuffer);
    updateSlideInfo();

    // Render all slides
    for (let i = 0; i < presentation.slideCount; i++) {
      setLoading(true, `Rendering slide ${i + 1} of ${presentation.slideCount}...`);
      setStatus(`Rendering slide ${i + 1} of ${presentation.slideCount}...`);

      await kit.renderSlide(i);

      // Snapshot the offscreen canvas into a visible element
      const slideWrapper = document.createElement('div');
      slideWrapper.className = 'slide-wrapper';

      const label = document.createElement('div');
      label.className = 'slide-label';
      label.textContent = `Slide ${i + 1}`;

      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn btn-sm';
      saveBtn.textContent = 'Save PNG';
      saveBtn.addEventListener('click', () => saveSlideAsPng(img, i));
      label.appendChild(saveBtn);

      // Copy canvas to an img element
      const img = document.createElement('img');
      img.src = offscreenCanvas.toDataURL('image/png');
      img.alt = `Slide ${i + 1}`;
      img.className = 'slide-image';

      slideWrapper.appendChild(label);
      slideWrapper.appendChild(img);
      slidesContainer.appendChild(slideWrapper);
    }

    // Clean up offscreen canvas
    document.body.removeChild(offscreenCanvas);

    setLoading(false);
    setStatus(`Rendered ${presentation.slideCount} slides.`);
  } catch (err) {
    setLoading(false);
    const message = err instanceof Error ? err.message : String(err);
    showError(`Failed to load ${file.name}: ${message}`);
    setStatus('Error');
    console.error('Load error:', err);
  }
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
