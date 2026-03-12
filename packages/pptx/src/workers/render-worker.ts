/**
 * OffscreenCanvas render worker.
 *
 * Receives slide data via postMessage and renders it on a transferred
 * OffscreenCanvas. This keeps rendering off the main thread so the UI
 * stays responsive at 60fps even for complex slides.
 *
 * The worker constructs a minimal RenderContext from the serialized data
 * and delegates to the existing renderSlide() pipeline for full element
 * rendering (shapes, text, images, groups, tables, etc.).
 */

import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
  SerializedSlideData,
  ViewportRect,
} from './render-protocol.js';
import type { RenderContext } from '@opendockit/core/drawingml/renderer';
import { CanvasBackend } from '@opendockit/core/drawingml/renderer';
import { MediaCache } from '@opendockit/core/media';
import { emuToPx } from '@opendockit/core';
import { renderSlide } from '../renderer/slide-renderer.js';

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let frameId = 0;

/**
 * Worker-local media cache.
 *
 * Populated from the ArrayBuffers transferred in each render message.
 * Persists across frames so repeated renders of the same slide don't
 * re-decode images.
 */
const mediaCache = new MediaCache();

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'init': {
      canvas = msg.canvas;
      ctx = canvas.getContext('2d');
      if (!ctx) {
        postResponse({ type: 'error', message: 'Failed to get 2d context from OffscreenCanvas' });
        return;
      }
      postResponse({ type: 'ready' });
      break;
    }

    case 'render': {
      if (!ctx || !canvas) {
        postResponse({ type: 'error', message: 'Worker not initialized — call init first' });
        return;
      }
      const start = performance.now();
      frameId++;

      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        renderSlideData(ctx, msg.slideData, msg.viewportRect);
        postResponse({
          type: 'rendered',
          frameId,
          duration: performance.now() - start,
        });
      } catch (err) {
        postResponse({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case 'resize': {
      if (canvas) {
        canvas.width = msg.width;
        canvas.height = msg.height;
      }
      break;
    }

    case 'dispose': {
      canvas = null;
      ctx = null;
      mediaCache.clear();
      self.close();
      break;
    }
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function postResponse(msg: WorkerToMainMessage): void {
  (self as unknown as Worker).postMessage(msg);
}

/**
 * Populate the worker-local media cache from transferred ArrayBuffers.
 *
 * Creates ImageBitmap objects from the raw buffers. This runs async but
 * the current render frame proceeds synchronously — images that aren't
 * decoded in time will appear on the next render frame.
 */
function populateMediaCache(
  mediaBuffers: Record<string, ArrayBuffer>,
): void {
  for (const [partUri, buffer] of Object.entries(mediaBuffers)) {
    if (mediaCache.has(partUri)) continue;
    // Store raw bytes immediately so the cache key exists.
    // Renderers handle Uint8Array as a fallback path.
    mediaCache.set(partUri, new Uint8Array(buffer), buffer.byteLength);

    // Attempt async decode to ImageBitmap for better rendering.
    // In worker contexts, createImageBitmap is always available.
    if (typeof createImageBitmap === 'function') {
      const blob = new Blob([buffer]);
      createImageBitmap(blob)
        .then((bitmap) => {
          mediaCache.set(partUri, bitmap, buffer.byteLength);
        })
        .catch(() => {
          // Keep the Uint8Array fallback — already stored above.
        });
    }
  }
}

/**
 * Render serialized slide data to the canvas context.
 *
 * Constructs a RenderContext from the serialized data and delegates
 * to the full renderSlide() pipeline for element-level rendering
 * including backgrounds, master/layout/slide cascade, text, shapes,
 * images, and groups.
 */
function renderSlideData(
  ctx: OffscreenCanvasRenderingContext2D,
  data: SerializedSlideData,
  _viewport?: ViewportRect,
): void {
  const { enrichedSlide, theme, colorMap, width, height, slideNumber, mediaBuffers } = data;
  if (width <= 0 || height <= 0) return;

  // Populate media cache from transferred buffers
  if (mediaBuffers) {
    populateMediaCache(mediaBuffers);
  }

  // Compute pixel dimensions matching the canvas size
  const slideWidthPx = ctx.canvas.width;
  const slideHeightPx = ctx.canvas.height;

  // Compute DPI scale from canvas size vs EMU-based slide dimensions.
  // The main thread sizes the canvas to slideWidthPx = emuToPx(width) * dpiScale,
  // so dpiScale = slideWidthPx / emuToPx(width, 96).
  const baseWidthPx = emuToPx(width, 96);
  const dpiScale = baseWidthPx > 0 ? slideWidthPx / baseWidthPx : 1;

  // Build a minimal RenderContext for the worker.
  // Font resolution is passthrough — the browser's CSS font matching
  // handles substitution. FontMetricsDB and FontResolver can be
  // transferred to the worker in a future enhancement for pixel-perfect
  // text layout.
  const rctx: RenderContext = {
    backend: new CanvasBackend(ctx as unknown as CanvasRenderingContext2D),
    dpiScale,
    theme,
    mediaCache,
    resolveFont: (name: string) => name,
    colorMap,
    slideNumber,
  };

  renderSlide(enrichedSlide, rctx, slideWidthPx, slideHeightPx);
}
