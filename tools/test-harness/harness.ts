/**
 * OpenDocKit Test Harness — a polished editor-like UI for exercising
 * SlideKit and EditableSlideKit APIs.
 *
 * Features:
 * - PPTX file loading via drag-and-drop or file picker
 * - Slide thumbnail navigation panel
 * - Full canvas rendering with click-to-select
 * - Toolbar: bold/italic/underline, font/size pickers, fill color
 * - Properties panel: X/Y/W/H, text content
 * - Edit operations: move (drag, nudge), resize, delete, text edit
 * - Export: Save PPTX
 * - Performance overlay showing render time
 */

import { SlideKit, EditableSlideKit, type LoadedPresentation } from '@opendockit/pptx';
import { emuToPx } from '@opendockit/core';
import { deriveIR } from '@opendockit/core/edit';
import type {
  SlideElementIR,
  GroupIR,
  TransformIR,
  EditableElement,
  EditableParagraph,
} from '@opendockit/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMU_PER_INCH = 914400;
const NUDGE_EMU = EMU_PER_INCH / 4;

// ---------------------------------------------------------------------------
// DOM References
// ---------------------------------------------------------------------------

// Toolbar
const btnOpen = document.getElementById('btn-open') as HTMLButtonElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const fileNameEl = document.getElementById('file-name') as HTMLSpanElement;
const btnBold = document.getElementById('btn-bold') as HTMLButtonElement;
const btnItalic = document.getElementById('btn-italic') as HTMLButtonElement;
const btnUnderline = document.getElementById('btn-underline') as HTMLButtonElement;
const fontPicker = document.getElementById('font-picker') as HTMLSelectElement;
const fontSizePicker = document.getElementById('font-size-picker') as HTMLSelectElement;
const fillColor = document.getElementById('fill-color') as HTMLInputElement;
const btnExportPdf = document.getElementById('btn-export-pdf') as HTMLButtonElement;
const btnSavePptx = document.getElementById('btn-save-pptx') as HTMLButtonElement;
const btnDelete = document.getElementById('btn-delete') as HTMLButtonElement;

// Error banner
const errorBanner = document.getElementById('error-banner') as HTMLDivElement;

// Slide panel
const slidePanel = document.getElementById('slide-panel') as HTMLDivElement;
const slidePanelEmpty = document.getElementById('slide-panel-empty') as HTMLDivElement;

// Canvas area
const canvasArea = document.getElementById('canvas-area') as HTMLDivElement;
const canvasEmpty = document.getElementById('canvas-empty') as HTMLDivElement;
const canvasWrapper = document.getElementById('canvas-wrapper') as HTMLDivElement;
const mainCanvas = document.getElementById('main-canvas') as HTMLCanvasElement;
const perfOverlay = document.getElementById('perf-overlay') as HTMLDivElement;

// Properties panel
const propsEmpty = document.getElementById('props-empty') as HTMLDivElement;
const propsContent = document.getElementById('props-content') as HTMLDivElement;
const propsKind = document.getElementById('props-kind') as HTMLDivElement;
const propsName = document.getElementById('props-name') as HTMLDivElement;
const propsId = document.getElementById('props-id') as HTMLDivElement;
const propsX = document.getElementById('props-x') as HTMLInputElement;
const propsY = document.getElementById('props-y') as HTMLInputElement;
const propsW = document.getElementById('props-w') as HTMLInputElement;
const propsH = document.getElementById('props-h') as HTMLInputElement;
const propsTextSection = document.getElementById('props-text-section') as HTMLDivElement;
const propsText = document.getElementById('props-text') as HTMLTextAreaElement;
const propsApply = document.getElementById('props-apply') as HTMLButtonElement;
const propsDelete = document.getElementById('props-delete') as HTMLButtonElement;
const propsStatus = document.getElementById('props-status') as HTMLDivElement;

// Status bar
const loadingIndicator = document.getElementById('loading') as HTMLSpanElement;
const loadingMsg = document.getElementById('loading-msg') as HTMLSpanElement;
const statusSlide = document.getElementById('status-slide') as HTMLSpanElement;
const statusRender = document.getElementById('status-render') as HTMLSpanElement;
const statusElements = document.getElementById('status-elements') as HTMLSpanElement;
const statusMessage = document.getElementById('status-message') as HTMLSpanElement;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let kit: SlideKit | null = null;
let presentation: LoadedPresentation | null = null;
let editKit: EditableSlideKit | null = null;
let currentFileBytes: ArrayBuffer | null = null;
let currentFileName = '';
let isLoading = false;

let currentSlideIndex = 0;
let slideCount = 0;
/** Cached thumbnail data URLs by slide index. */
let thumbnails: Map<number, string> = new Map();

// Selection state
let selectedElementId: string | null = null;
let selectionOverlay: HTMLDivElement | null = null;

// Formatting state (for toolbar buttons -- visual state only for now)
let boldActive = false;
let italicActive = false;
let underlineActive = false;

// Performance tracking
let lastRenderTimeMs = 0;
let currentSlideElementCount = 0;

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
  statusMessage.textContent = text;
}

function showPropsStatus(text: string): void {
  propsStatus.textContent = text;
  if (text) {
    setTimeout(() => {
      if (propsStatus.textContent === text) propsStatus.textContent = '';
    }, 3000);
  }
}

function updateSlideStatus(): void {
  if (!presentation) {
    statusSlide.textContent = 'No file loaded';
    statusRender.textContent = '';
    statusElements.textContent = '';
    return;
  }
  statusSlide.textContent = `Slide ${currentSlideIndex + 1}/${slideCount}`;
  statusRender.textContent = `Render: ${lastRenderTimeMs.toFixed(1)}ms`;
  statusElements.textContent = `Elements: ${currentSlideElementCount}`;
}

function emuToInches(emu: number): number {
  return Math.round((emu / EMU_PER_INCH) * 100) / 100;
}

function inchesToEmu(inches: number): number {
  return Math.round(inches * EMU_PER_INCH);
}

// ---------------------------------------------------------------------------
// File Loading
// ---------------------------------------------------------------------------

async function loadFile(file: File): Promise<void> {
  if (isLoading) return;
  if (!file.name.toLowerCase().endsWith('.pptx')) {
    showError('Please select a .pptx file.');
    return;
  }

  clearError();
  clearSelection();

  // Dispose previous
  if (kit) {
    kit.dispose();
    kit = null;
    presentation = null;
  }
  editKit = null;
  currentFileBytes = null;
  thumbnails.clear();
  btnSavePptx.disabled = true;

  currentFileName = file.name;
  fileNameEl.textContent = file.name;

  setLoading(true, 'Opening file...');
  setStatus(`Loading ${file.name}...`);

  try {
    const arrayBuffer = await file.arrayBuffer();
    currentFileBytes = arrayBuffer;

    kit = new SlideKit({
      canvas: mainCanvas,
      onProgress: (event) => {
        const msg = event.message ?? `${event.phase} ${event.current}/${event.total}`;
        setLoading(true, msg);
      },
      onSlideInvalidated: (indices) => {
        // Re-render current slide if it was invalidated
        if (indices.includes(currentSlideIndex)) {
          renderCurrentSlide();
        }
        // Update any affected thumbnails
        for (const idx of indices) {
          generateThumbnail(idx);
        }
      },
    });

    presentation = await kit.load(arrayBuffer);
    slideCount = presentation.slideCount;

    // Show the canvas, hide empty state
    canvasEmpty.style.display = 'none';
    canvasWrapper.style.display = '';

    // Size the canvas wrapper to match slide aspect ratio
    resizeCanvasWrapper();

    // Start loading edit kit in parallel
    loadEditKit(arrayBuffer);

    // Render first slide
    await renderCurrentSlide();

    // Generate thumbnails for slide panel
    await generateAllThumbnails();

    setLoading(false);
    updateSlideStatus();
  } catch (err) {
    setLoading(false);
    const message = err instanceof Error ? err.message : String(err);
    showError(`Failed to load ${file.name}: ${message}`);
    setStatus('Error');
    console.error('Load error:', err);
  }
}

async function loadEditKit(bytes: ArrayBuffer): Promise<void> {
  try {
    editKit = new EditableSlideKit();
    await editKit.load(bytes);
    document.body.dataset.editKitReady = 'true';
  } catch (err) {
    console.warn('Failed to load edit kit:', err);
    editKit = null;
    document.body.dataset.editKitReady = 'error';
  }
}

// ---------------------------------------------------------------------------
// Canvas Sizing
// ---------------------------------------------------------------------------

function resizeCanvasWrapper(): void {
  if (!presentation) return;

  const area = canvasArea;
  const padding = 40;
  const availW = area.clientWidth - padding * 2;
  const availH = area.clientHeight - padding * 2;

  const slideW = emuToPx(presentation.slideWidth);
  const slideH = emuToPx(presentation.slideHeight);
  const aspect = slideW / slideH;

  let displayW: number;
  let displayH: number;

  if (availW / availH > aspect) {
    // Height-constrained
    displayH = Math.min(availH, slideH);
    displayW = displayH * aspect;
  } else {
    // Width-constrained
    displayW = Math.min(availW, slideW);
    displayH = displayW / aspect;
  }

  canvasWrapper.style.width = `${displayW}px`;
  canvasWrapper.style.height = `${displayH}px`;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

async function renderCurrentSlide(): Promise<void> {
  if (!kit || !presentation) return;

  const t0 = performance.now();

  // Check if we need to render with overrides (edited elements)
  if (editKit) {
    const overrides = buildOverridesMap(currentSlideIndex);
    if (overrides.size > 0) {
      await kit.renderSlideWithOverrides(currentSlideIndex, overrides);
    } else {
      await kit.renderSlide(currentSlideIndex);
    }
  } else {
    await kit.renderSlide(currentSlideIndex);
  }

  lastRenderTimeMs = performance.now() - t0;
  perfOverlay.textContent = `${lastRenderTimeMs.toFixed(1)}ms`;

  // Count elements
  const data = await kit.getSlideElements(currentSlideIndex);
  currentSlideElementCount = data.elements.length;

  updateSlideStatus();
}

/**
 * Build an overrides map from the edit model for a given slide.
 */
function buildOverridesMap(slideIndex: number): Map<number, SlideElementIR | null> {
  const overrides = new Map<number, SlideElementIR | null>();
  if (!editKit) return overrides;

  const slides = editKit.presentation.getSlides();
  if (slideIndex >= slides.length) return overrides;

  const elements = slides[slideIndex].elements;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const derived = deriveIR(el);
    if (derived.kind === 'unsupported' && (derived as any).elementType === 'deleted') {
      overrides.set(i, null);
    } else if (derived !== el.originalIR) {
      overrides.set(i, derived);
    }
  }

  return overrides;
}

// ---------------------------------------------------------------------------
// Thumbnails
// ---------------------------------------------------------------------------

/** Offscreen canvas used exclusively for thumbnail generation. */
let thumbCanvas: HTMLCanvasElement | null = null;
let thumbKit: SlideKit | null = null;

async function generateAllThumbnails(): Promise<void> {
  if (!kit || !presentation || !currentFileBytes) return;

  // Clear existing thumbnails in the panel
  slidePanel.innerHTML = '';
  slidePanelEmpty.style.display = 'none';

  // Create a dedicated offscreen canvas + SlideKit for thumbnails
  // so we never disrupt the main canvas rendering.
  if (thumbCanvas) thumbCanvas.remove();
  thumbCanvas = document.createElement('canvas');
  thumbCanvas.style.display = 'none';
  document.body.appendChild(thumbCanvas);

  if (thumbKit) thumbKit.dispose();
  thumbKit = new SlideKit({ canvas: thumbCanvas });
  await thumbKit.load(currentFileBytes);

  for (let i = 0; i < slideCount; i++) {
    setLoading(true, `Generating thumbnail ${i + 1}/${slideCount}...`);
    await generateThumbnailFromKit(thumbKit, thumbCanvas, i);
  }
}

async function generateThumbnailFromKit(
  tKit: SlideKit,
  tCanvas: HTMLCanvasElement,
  slideIndex: number,
): Promise<void> {
  await tKit.renderSlide(slideIndex);
  const dataUrl = tCanvas.toDataURL('image/png');
  thumbnails.set(slideIndex, dataUrl);
  createOrUpdateThumbnailElement(slideIndex, dataUrl);
}

/**
 * Regenerate a single thumbnail using the main canvas
 * (called after edits when the offscreen thumb kit may be stale).
 */
async function generateThumbnail(slideIndex: number): Promise<void> {
  if (!kit || !presentation) return;

  // Use the main kit — render the slide, snapshot, then restore current slide
  await kit.renderSlide(slideIndex);
  const dataUrl = mainCanvas.toDataURL('image/png');
  thumbnails.set(slideIndex, dataUrl);
  createOrUpdateThumbnailElement(slideIndex, dataUrl);

  // Restore the current slide on main canvas
  await renderCurrentSlide();
}

function createOrUpdateThumbnailElement(slideIndex: number, dataUrl: string): void {
  let thumbEl = slidePanel.querySelector(
    `[data-slide-index="${slideIndex}"]`,
  ) as HTMLDivElement | null;

  if (!thumbEl) {
    thumbEl = document.createElement('div');
    thumbEl.className = 'slide-thumb';
    thumbEl.dataset.slideIndex = String(slideIndex);
    if (slideIndex === currentSlideIndex) thumbEl.classList.add('active');

    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = `Slide ${slideIndex + 1}`;

    const label = document.createElement('div');
    label.className = 'slide-thumb-label';
    label.textContent = String(slideIndex + 1);

    thumbEl.appendChild(img);
    thumbEl.appendChild(label);
    slidePanel.appendChild(thumbEl);

    thumbEl.addEventListener('click', () => navigateToSlide(slideIndex));
  } else {
    const img = thumbEl.querySelector('img');
    if (img) img.src = dataUrl;
  }
}

async function navigateToSlide(slideIndex: number): Promise<void> {
  if (slideIndex < 0 || slideIndex >= slideCount) return;
  if (slideIndex === currentSlideIndex) return;

  clearSelection();

  // Update active state on thumbnails
  slidePanel.querySelectorAll('.slide-thumb').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-slide-index') === String(slideIndex));
  });

  currentSlideIndex = slideIndex;
  await renderCurrentSlide();
}

// ---------------------------------------------------------------------------
// Hit Testing
// ---------------------------------------------------------------------------

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

function hitTestElement(
  el: SlideElementIR,
  layer: 'master' | 'layout' | 'slide',
  emuX: number,
  emuY: number,
  offsetX: number,
  offsetY: number,
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
      const scaleX = childExtent.width / w;
      const scaleY = childExtent.height / h;
      const localX = (emuX - absX) * scaleX + childOffset.x;
      const localY = (emuY - absY) * scaleY + childOffset.y;

      for (let i = group.children.length - 1; i >= 0; i--) {
        const hit = hitTestElement(group.children[i], layer, localX, localY, 0, 0);
        if (hit) {
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

/**
 * Hit-test using the edit model for slide-layer elements (current positions
 * after edits) and the cached IR for master/layout layers.
 */
async function editModeHitTest(
  event: MouseEvent,
): Promise<{
  element: SlideElementIR;
  layer: 'master' | 'layout' | 'slide';
  transform: TransformIR;
  editableId?: string;
} | null> {
  if (!kit || !presentation) return null;

  const rect = mainCanvas.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;

  const scaleX = presentation.slideWidth / rect.width;
  const scaleY = presentation.slideHeight / rect.height;
  const emuX = clickX * scaleX;
  const emuY = clickY * scaleY;

  const data = await kit.getSlideElements(currentSlideIndex);

  // Build augmented element list
  const elements: { element: SlideElementIR; layer: 'master' | 'layout' | 'slide'; editableId?: string }[] = [];

  // Master + layout elements (read-only)
  for (const item of data.elements) {
    if (item.layer !== 'slide') {
      elements.push(item);
    }
  }

  // Slide elements from edit model (if available) for current positions
  if (editKit) {
    const slides = editKit.presentation.getSlides();
    if (currentSlideIndex < slides.length) {
      for (const editable of slides[currentSlideIndex].elements) {
        if (editable.deleted) continue;
        const derived = deriveIR(editable);
        elements.push({ element: derived, layer: 'slide' as const, editableId: editable.id });
      }
    }
  } else {
    // Fallback: use cached slide elements
    for (const item of data.elements) {
      if (item.layer === 'slide') {
        elements.push(item);
      }
    }
  }

  // Hit-test in reverse order (topmost first)
  for (let i = elements.length - 1; i >= 0; i--) {
    const { element, layer, editableId } = elements[i];
    const result = hitTestElement(element, layer, emuX, emuY, 0, 0);
    if (result) return { ...result, editableId };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

function clearSelection(): void {
  selectedElementId = null;
  if (selectionOverlay) {
    selectionOverlay.remove();
    selectionOverlay = null;
  }
  propsContent.style.display = 'none';
  propsEmpty.style.display = '';
  btnDelete.disabled = true;
}

function showSelectionOverlay(transform: TransformIR): void {
  if (!presentation) return;

  // Remove existing overlay
  if (selectionOverlay) {
    selectionOverlay.remove();
  }

  const rect = mainCanvas.getBoundingClientRect();
  const scaleX = presentation.slideWidth / rect.width;
  const scaleY = presentation.slideHeight / rect.height;

  const overlay = document.createElement('div');
  overlay.className = 'selection-overlay';
  overlay.style.left = `${transform.position.x / scaleX}px`;
  overlay.style.top = `${transform.position.y / scaleY}px`;
  overlay.style.width = `${transform.size.width / scaleX}px`;
  overlay.style.height = `${transform.size.height / scaleY}px`;

  // Corner handles
  for (const pos of ['nw', 'ne', 'sw', 'se']) {
    const handle = document.createElement('div');
    handle.className = `selection-handle ${pos}`;
    overlay.appendChild(handle);
  }

  canvasWrapper.appendChild(overlay);
  selectionOverlay = overlay;
}

function updateSelectionOverlay(): void {
  if (!selectionOverlay || !editKit || !selectedElementId || !presentation) return;

  const editable = editKit.getElement(selectedElementId);
  if (!editable) return;

  const rect = mainCanvas.getBoundingClientRect();
  const scaleX = presentation.slideWidth / rect.width;
  const scaleY = presentation.slideHeight / rect.height;

  selectionOverlay.style.left = `${editable.transform.x / scaleX}px`;
  selectionOverlay.style.top = `${editable.transform.y / scaleY}px`;
  selectionOverlay.style.width = `${editable.transform.width / scaleX}px`;
  selectionOverlay.style.height = `${editable.transform.height / scaleY}px`;
}

// ---------------------------------------------------------------------------
// Text Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Properties Panel
// ---------------------------------------------------------------------------

function populatePropertiesPanel(editable: EditableElement, irElement: SlideElementIR): void {
  propsKind.textContent = editable.kind.toUpperCase();
  propsName.textContent =
    (irElement as any).name ?? (irElement as any).nonVisualProperties?.name ?? '';
  propsId.textContent = editable.id;

  propsX.value = String(emuToInches(editable.transform.x));
  propsY.value = String(emuToInches(editable.transform.y));
  propsW.value = String(emuToInches(editable.transform.width));
  propsH.value = String(emuToInches(editable.transform.height));

  const fullText = getFullText(irElement);
  if (fullText !== undefined && editable.kind === 'shape') {
    propsTextSection.style.display = '';
    propsText.value = fullText;
  } else {
    propsTextSection.style.display = 'none';
    propsText.value = '';
  }

  propsStatus.textContent = '';
  propsEmpty.style.display = 'none';
  propsContent.style.display = '';
  btnDelete.disabled = false;
}

function updatePropertiesPanelValues(): void {
  if (!editKit || !selectedElementId) return;

  const editable = editKit.getElement(selectedElementId);
  if (!editable) return;

  propsX.value = String(emuToInches(editable.transform.x));
  propsY.value = String(emuToInches(editable.transform.y));
  propsW.value = String(emuToInches(editable.transform.width));
  propsH.value = String(emuToInches(editable.transform.height));
}

// ---------------------------------------------------------------------------
// Canvas Click Handler
// ---------------------------------------------------------------------------

async function handleCanvasClick(event: MouseEvent): Promise<void> {
  if (!kit || !presentation) return;

  const hit = await editModeHitTest(event);
  clearSelection();

  if (!hit) return;

  const { element, layer, transform, editableId } = hit;

  if (layer !== 'slide') {
    setStatus(`${layer}-layer element (read-only)`);
    // Still show the selection overlay for visual feedback
    showSelectionOverlay(transform);
    return;
  }

  if (!editableId || !editKit) {
    setStatus('No edit model available');
    showSelectionOverlay(transform);
    return;
  }

  const editable = editKit.getElement(editableId);
  if (!editable) {
    setStatus(`Element not found: ${editableId}`);
    return;
  }

  selectedElementId = editableId;
  showSelectionOverlay(transform);
  populatePropertiesPanel(editable, element);
  setStatus(`Selected: ${editable.kind} "${getTextPreview(element) ?? editable.id}"`);
}

// ---------------------------------------------------------------------------
// Edit Operations
// ---------------------------------------------------------------------------

async function applyEdits(): Promise<void> {
  if (!editKit || !selectedElementId) return;

  const editable = editKit.getElement(selectedElementId);
  if (!editable) {
    showPropsStatus('Element no longer exists');
    return;
  }

  try {
    // Position changes
    const newX = inchesToEmu(parseFloat(propsX.value));
    const newY = inchesToEmu(parseFloat(propsY.value));
    const dx = newX - editable.transform.x;
    const dy = newY - editable.transform.y;
    if (dx !== 0 || dy !== 0) {
      editKit.moveElement(selectedElementId, dx, dy);
    }

    // Size changes
    const newW = inchesToEmu(parseFloat(propsW.value));
    const newH = inchesToEmu(parseFloat(propsH.value));
    if (newW !== editable.transform.width || newH !== editable.transform.height) {
      editKit.resizeElement(selectedElementId, newW, newH);
    }

    // Text changes (shapes only)
    if (editable.kind === 'shape' && propsTextSection.style.display !== 'none') {
      const newText = propsText.value;
      const originalText = getFullText(editable.originalIR);
      if (newText !== originalText) {
        const paragraphs: EditableParagraph[] = newText.split('\n').map((line) => ({
          runs: [{ text: line }],
        }));
        editKit.setText(selectedElementId, paragraphs);
      }
    }

    await renderCurrentSlide();
    updateSelectionOverlay();
    btnSavePptx.disabled = false;
    showPropsStatus('Applied');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    showPropsStatus(`Error: ${message}`);
    console.error('Apply error:', err);
  }
}

async function deleteSelected(): Promise<void> {
  if (!editKit || !selectedElementId) return;

  try {
    editKit.deleteElement(selectedElementId);
    clearSelection();
    await renderCurrentSlide();
    // Regenerate thumbnail for this slide
    await generateThumbnail(currentSlideIndex);
    // Re-render current slide on main canvas
    await renderCurrentSlide();
    btnSavePptx.disabled = false;
    setStatus('Element deleted');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    showPropsStatus(`Delete error: ${message}`);
    console.error('Delete error:', err);
  }
}

async function nudgeSelected(dx: number, dy: number): Promise<void> {
  if (!editKit || !selectedElementId) return;

  try {
    editKit.moveElement(selectedElementId, dx, dy);
    await renderCurrentSlide();
    updateSelectionOverlay();
    updatePropertiesPanelValues();
    btnSavePptx.disabled = false;
  } catch (err) {
    console.error('Nudge error:', err);
  }
}

// ---------------------------------------------------------------------------
// Save PPTX
// ---------------------------------------------------------------------------

async function downloadPptx(): Promise<void> {
  if (!editKit || !currentFileBytes) return;

  setLoading(true, 'Saving PPTX...');

  try {
    const bytes = await editKit.save();
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

    // Re-load edit kit from saved bytes
    currentFileBytes = bytes.buffer as ArrayBuffer;
    await loadEditKit(currentFileBytes);

    setLoading(false);
    btnSavePptx.disabled = true;
    setStatus(`Downloaded ${a.download}`);
  } catch (err) {
    setLoading(false);
    const message = err instanceof Error ? err.message : String(err);
    showError(`Save failed: ${message}`);
    console.error('Save error:', err);
  }
}

// ---------------------------------------------------------------------------
// Event Handlers: Toolbar
// ---------------------------------------------------------------------------

btnOpen.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) loadFile(file);
  fileInput.value = '';
});

btnBold.addEventListener('click', () => {
  boldActive = !boldActive;
  btnBold.classList.toggle('active', boldActive);
});

btnItalic.addEventListener('click', () => {
  italicActive = !italicActive;
  btnItalic.classList.toggle('active', italicActive);
});

btnUnderline.addEventListener('click', () => {
  underlineActive = !underlineActive;
  btnUnderline.classList.toggle('active', underlineActive);
});

btnSavePptx.addEventListener('click', () => downloadPptx());
btnDelete.addEventListener('click', () => deleteSelected());
btnExportPdf.addEventListener('click', () => {
  setStatus('PDF export not yet implemented');
});

// Properties panel buttons
propsApply.addEventListener('click', () => applyEdits());
propsDelete.addEventListener('click', () => deleteSelected());

// ---------------------------------------------------------------------------
// Event Handlers: Canvas
// ---------------------------------------------------------------------------

mainCanvas.addEventListener('click', (e) => handleCanvasClick(e));

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Don't capture if typing in an input
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  if (!selectedElementId) {
    // Navigation without selection
    if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      navigateToSlide(currentSlideIndex + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      navigateToSlide(currentSlideIndex - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      navigateToSlide(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      navigateToSlide(slideCount - 1);
    }
    return;
  }

  // Element selected — handle editing shortcuts
  switch (e.key) {
    case 'Escape':
      clearSelection();
      break;
    case 'Delete':
    case 'Backspace':
      e.preventDefault();
      deleteSelected();
      break;
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
  }
});

// Ctrl shortcuts
document.addEventListener('keydown', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  switch (e.key.toLowerCase()) {
    case 'b':
      e.preventDefault();
      btnBold.click();
      break;
    case 'i':
      e.preventDefault();
      btnItalic.click();
      break;
    case 'u':
      e.preventDefault();
      btnUnderline.click();
      break;
    case 's':
      e.preventDefault();
      if (!btnSavePptx.disabled) downloadPptx();
      break;
  }
});

// ---------------------------------------------------------------------------
// Event Handlers: Drag and Drop
// ---------------------------------------------------------------------------

let dragCounter = 0;

canvasArea.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  canvasArea.classList.add('drop-active');
});

canvasArea.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    canvasArea.classList.remove('drop-active');
  }
});

canvasArea.addEventListener('dragover', (e) => {
  e.preventDefault();
});

canvasArea.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  canvasArea.classList.remove('drop-active');

  const file = e.dataTransfer?.files[0];
  if (file) loadFile(file);
});

// Click on empty state to open file picker
canvasEmpty.addEventListener('click', () => fileInput.click());

// ---------------------------------------------------------------------------
// Window Resize
// ---------------------------------------------------------------------------

window.addEventListener('resize', () => {
  resizeCanvasWrapper();
  updateSelectionOverlay();
});

// ---------------------------------------------------------------------------
// Debug Exports
// ---------------------------------------------------------------------------

(window as any).__debug = {
  get kit() {
    return kit;
  },
  get presentation() {
    return presentation;
  },
  get editKit() {
    return editKit;
  },
  get currentSlideIndex() {
    return currentSlideIndex;
  },
  get slideCount() {
    return slideCount;
  },
  get selectedElementId() {
    return selectedElementId;
  },
  get boldActive() {
    return boldActive;
  },
  get italicActive() {
    return italicActive;
  },
  get underlineActive() {
    return underlineActive;
  },
  // DOM element refs (for E2E and diagnostic tooling)
  fontPicker,
  fontSizePicker,
  fillColor,
  // Actions
  navigateToSlide,
  renderCurrentSlide,
  applyEdits,
  deleteSelected,
  nudgeSelected,
  downloadPptx,
};

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

setStatus('Ready');
