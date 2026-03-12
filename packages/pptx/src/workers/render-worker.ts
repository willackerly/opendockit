/**
 * OffscreenCanvas render worker.
 *
 * Receives slide data via postMessage and renders it on a transferred
 * OffscreenCanvas. This keeps rendering off the main thread so the UI
 * stays responsive at 60fps even for complex slides.
 *
 * Current status: **scaffold**. The render loop performs basic scaling
 * and background fill. Full integration with the SlideRenderer pipeline
 * (element rendering, text layout, effects) is future work — it requires
 * bundling the renderer into the worker entry point.
 */

import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
  SerializedSlideData,
  ViewportRect,
} from './render-protocol.js';

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let frameId = 0;

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
 * Render serialized slide data to the canvas context.
 *
 * TRACKED-TASK: Full element rendering in worker — see TODO.md "OffscreenCanvas Worker"
 *
 * Currently a scaffold that:
 * 1. Computes uniform scale to fit slide dimensions into the canvas.
 * 2. Fills the background white.
 * 3. Placeholder for per-element rendering.
 */
function renderSlideData(
  ctx: OffscreenCanvasRenderingContext2D,
  data: SerializedSlideData,
  _viewport?: ViewportRect,
): void {
  const { width, height } = data;
  if (width <= 0 || height <= 0) return;

  const scaleX = ctx.canvas.width / width;
  const scaleY = ctx.canvas.height / height;
  const scale = Math.min(scaleX, scaleY);

  ctx.save();
  ctx.scale(scale, scale);

  // Background fill (scaffold — always white)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // TRACKED-TASK: Render individual slide elements in worker — see TODO.md "OffscreenCanvas Worker"
  // Full implementation would import CanvasBackend + element renderers
  // and iterate over data.elements with viewport culling applied.

  ctx.restore();
}
