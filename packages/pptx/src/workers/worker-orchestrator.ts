/**
 * WorkerOrchestrator — manages the OffscreenCanvas render worker lifecycle
 * from the main thread.
 *
 * Handles:
 * - Worker creation and OffscreenCanvas transfer
 * - Typed message passing (MainToWorkerMessage / WorkerToMainMessage)
 * - Ready-state gating (render requests before init are no-ops)
 * - Graceful disposal
 *
 * Usage:
 * ```ts
 * const orch = new WorkerOrchestrator();
 * await orch.init(canvasElement);
 * orch.onRendered((frameId, duration) => console.log(`Frame ${frameId}: ${duration}ms`));
 * orch.requestRender(slideData);
 * orch.dispose();
 * ```
 */

import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
  SerializedSlideData,
  ViewportRect,
} from './render-protocol.js';

export interface WorkerOrchestratorOptions {
  /** Optional worker script URL override. Defaults to co-located render-worker.js. */
  workerURL?: string | URL;
}

export class WorkerOrchestrator {
  private _worker: Worker | null = null;
  private _ready = false;
  private _onRendered: ((frameId: number, duration: number) => void) | null = null;
  private _onError: ((message: string) => void) | null = null;
  private _readyResolve: (() => void) | null = null;

  /**
   * Initialize the worker with a transferred OffscreenCanvas.
   *
   * Calls `canvas.transferControlToOffscreen()` to obtain an OffscreenCanvas,
   * creates a module Worker, and transfers ownership of the canvas to it.
   * Resolves once the worker signals 'ready'.
   */
  async init(canvas: HTMLCanvasElement, options?: WorkerOrchestratorOptions): Promise<void> {
    const offscreen = canvas.transferControlToOffscreen();

    const url = options?.workerURL ?? new URL('./render-worker.js', import.meta.url);
    this._worker = new Worker(url, { type: 'module' });

    this._worker.onmessage = (e: MessageEvent<WorkerToMainMessage>) => {
      this._handleMessage(e.data);
    };

    this._worker.onerror = (e: ErrorEvent) => {
      this._onError?.(e.message ?? 'Unknown worker error');
    };

    const initMsg: MainToWorkerMessage = {
      type: 'init',
      canvas: offscreen,
      slideWidth: canvas.width,
      slideHeight: canvas.height,
    };
    this._worker.postMessage(initMsg, [offscreen as unknown as Transferable]);

    await this._waitForReady();
  }

  /**
   * Request a render frame with the given slide data.
   * No-op if the worker is not yet initialized.
   *
   * If the slide data includes media buffers, they are listed as
   * Transferable objects so ownership moves to the worker without copying.
   * After this call, the ArrayBuffer values in `slideData.mediaBuffers`
   * will be neutered (zero-length) on the main thread.
   */
  requestRender(slideData: SerializedSlideData, viewportRect?: ViewportRect): void {
    if (!this._worker || !this._ready) return;
    const msg: MainToWorkerMessage = { type: 'render', slideData, viewportRect };

    // Collect media ArrayBuffers as transferables to avoid copying
    const transferables: Transferable[] = [];
    if (slideData.mediaBuffers) {
      for (const buf of Object.values(slideData.mediaBuffers)) {
        if (buf.byteLength > 0) {
          transferables.push(buf);
        }
      }
    }

    if (transferables.length > 0) {
      this._worker.postMessage(msg, transferables);
    } else {
      this._worker.postMessage(msg);
    }
  }

  /**
   * Resize the offscreen canvas.
   * No-op if the worker is not yet initialized.
   */
  resize(width: number, height: number): void {
    if (!this._worker) return;
    const msg: MainToWorkerMessage = { type: 'resize', width, height };
    this._worker.postMessage(msg);
  }

  /** Register a callback for successful render completion. */
  onRendered(handler: (frameId: number, duration: number) => void): void {
    this._onRendered = handler;
  }

  /** Register a callback for worker errors. */
  onError(handler: (message: string) => void): void {
    this._onError = handler;
  }

  /** Whether the worker is initialized and ready to receive commands. */
  get ready(): boolean {
    return this._ready;
  }

  /** Terminate the worker and release resources. */
  dispose(): void {
    if (this._worker) {
      const msg: MainToWorkerMessage = { type: 'dispose' };
      this._worker.postMessage(msg);
      this._worker.terminate();
      this._worker = null;
    }
    this._ready = false;
    this._readyResolve = null;
    this._onRendered = null;
    this._onError = null;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private _handleMessage(msg: WorkerToMainMessage): void {
    switch (msg.type) {
      case 'ready':
        this._ready = true;
        this._readyResolve?.();
        this._readyResolve = null;
        break;

      case 'rendered':
        this._onRendered?.(msg.frameId, msg.duration);
        break;

      case 'error':
        this._onError?.(msg.message);
        break;
    }
  }

  private _waitForReady(): Promise<void> {
    if (this._ready) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this._readyResolve = resolve;
    });
  }
}
