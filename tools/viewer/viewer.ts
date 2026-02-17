/**
 * OpenDocKit Viewer — dev tool for visual inspection of PPTX rendering.
 *
 * Loads a PPTX file via file picker or drag-and-drop, renders slides
 * using SlideKit, and provides navigation and screenshot controls.
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
const canvasContainer = document.getElementById('canvas-container') as HTMLDivElement;
const errorBanner = document.getElementById('error-banner') as HTMLDivElement;
const btnPrev = document.getElementById('btn-prev') as HTMLButtonElement;
const btnNext = document.getElementById('btn-next') as HTMLButtonElement;
const slideCounter = document.getElementById('slide-counter') as HTMLSpanElement;
const btnScreenshot = document.getElementById('btn-screenshot') as HTMLButtonElement;
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
  updateNavState();
}

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function updateNavState(): void {
  if (!kit || !presentation || isLoading) {
    btnPrev.disabled = true;
    btnNext.disabled = true;
    btnScreenshot.disabled = true;
    return;
  }

  btnPrev.disabled = kit.currentSlide <= 0;
  btnNext.disabled = kit.currentSlide >= presentation.slideCount - 1;
  btnScreenshot.disabled = false;

  const current = kit.currentSlide + 1;
  slideCounter.textContent = `Slide ${current} of ${presentation.slideCount}`;
}

function updateSlideInfo(): void {
  if (!presentation) {
    slideInfo.textContent = '';
    return;
  }

  const wPx = Math.round(emuToPx(presentation.slideWidth));
  const hPx = Math.round(emuToPx(presentation.slideHeight));
  slideInfo.textContent = `${wPx} x ${hPx} px @ 96 dpi | Theme: ${presentation.theme.name}`;
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

  // Show canvas area, hide empty state
  emptyState.style.display = 'none';
  canvasContainer.classList.add('visible');
  dropZone.classList.remove('empty');

  // Clear canvas container
  canvasContainer.innerHTML = '';

  setLoading(true, 'Opening file...');
  setStatus(`Loading ${file.name}...`);

  try {
    const arrayBuffer = await file.arrayBuffer();

    kit = new SlideKit({
      container: canvasContainer,
      onProgress: (event) => {
        const msg = event.message ?? `${event.phase} ${event.current}/${event.total}`;
        setLoading(true, msg);
        setStatus(msg);
      },
    });

    presentation = await kit.load(arrayBuffer);

    updateSlideInfo();
    setStatus(`Loaded ${presentation.slideCount} slides. Rendering slide 1...`);

    await kit.renderSlide(0);

    setLoading(false);
    updateNavState();
    setStatus('Ready');
  } catch (err) {
    setLoading(false);
    const message = err instanceof Error ? err.message : String(err);
    showError(`Failed to load ${file.name}: ${message}`);
    setStatus('Error');
    console.error('Load error:', err);
  }
}

async function navigate(direction: 'prev' | 'next' | 'first' | 'last'): Promise<void> {
  if (!kit || !presentation || isLoading) return;

  setLoading(true, 'Rendering...');
  clearError();

  try {
    switch (direction) {
      case 'prev':
        await kit.previousSlide();
        break;
      case 'next':
        await kit.nextSlide();
        break;
      case 'first':
        await kit.goToSlide(0);
        break;
      case 'last':
        await kit.goToSlide(presentation.slideCount - 1);
        break;
    }

    setLoading(false);
    updateNavState();
    setStatus('Ready');
  } catch (err) {
    setLoading(false);
    updateNavState();
    const message = err instanceof Error ? err.message : String(err);
    showError(`Render error: ${message}`);
    setStatus('Error');
    console.error('Navigation error:', err);
  }
}

function takeScreenshot(): void {
  if (!kit || !presentation) return;

  const canvas = canvasContainer.querySelector('canvas');
  if (!canvas) {
    showError('No canvas found to capture.');
    return;
  }

  canvas.toBlob((blob) => {
    if (!blob) {
      showError('Failed to create screenshot.');
      return;
    }

    const slideNum = kit!.currentSlide + 1;
    const baseName = currentFileName.replace(/\.pptx$/i, '');
    const downloadName = `${baseName}_slide${slideNum}.png`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    a.click();

    // Clean up the object URL after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setStatus(`Saved ${downloadName}`);
  }, 'image/png');
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
  // Reset so the same file can be re-selected
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

// Navigation buttons
btnPrev.addEventListener('click', () => navigate('prev'));
btnNext.addEventListener('click', () => navigate('next'));

// Screenshot
btnScreenshot.addEventListener('click', takeScreenshot);

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  // Don't capture when typing in an input
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    return;
  }

  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault();
      navigate('prev');
      break;
    case 'ArrowRight':
      e.preventDefault();
      navigate('next');
      break;
    case 'Home':
      e.preventDefault();
      navigate('first');
      break;
    case 'End':
      e.preventDefault();
      navigate('last');
      break;
  }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

setStatus('No file loaded. Open a PPTX file to begin.');
