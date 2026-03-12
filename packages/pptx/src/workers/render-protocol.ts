/**
 * Message protocol for OffscreenCanvas render worker communication.
 *
 * Defines the typed message contract between the main thread and the
 * render worker. All messages are JSON-serializable (no functions,
 * no class instances) so they can cross the structured-clone boundary.
 *
 * The OffscreenCanvas itself is transferred (not cloned) via the
 * Transferable mechanism in the 'init' message.
 */

import type { ThemeIR } from '@opendockit/core';
import type { EnrichedSlideData, ColorMapOverride } from '../../model/index.js';

// ---------------------------------------------------------------------------
// Main → Worker messages
// ---------------------------------------------------------------------------

/** Transfer an OffscreenCanvas and initialize the rendering context. */
export interface InitMessage {
  type: 'init';
  canvas: OffscreenCanvas;
  slideWidth: number;
  slideHeight: number;
}

/**
 * Request a render frame with the given slide data.
 *
 * Carries the full enriched slide chain (slide + layout + master) plus
 * the theme and color map needed to construct a RenderContext in the worker.
 */
export interface RenderMessage {
  type: 'render';
  slideData: SerializedSlideData;
  viewportRect?: ViewportRect;
}

/** Resize the offscreen canvas dimensions. */
export interface ResizeMessage {
  type: 'resize';
  width: number;
  height: number;
}

/** Tear down the worker — release resources and close. */
export interface DisposeMessage {
  type: 'dispose';
}

/** Union of all messages sent from main thread to worker. */
export type MainToWorkerMessage = InitMessage | RenderMessage | ResizeMessage | DisposeMessage;

// ---------------------------------------------------------------------------
// Worker → Main messages
// ---------------------------------------------------------------------------

/** Worker is initialized and ready to receive render commands. */
export interface ReadyMessage {
  type: 'ready';
}

/** A render frame completed successfully. */
export interface RenderedMessage {
  type: 'rendered';
  frameId: number;
  /** Render duration in milliseconds. */
  duration: number;
}

/** An error occurred in the worker. */
export interface ErrorMessage {
  type: 'error';
  message: string;
}

/** Union of all messages sent from worker to main thread. */
export type WorkerToMainMessage = ReadyMessage | RenderedMessage | ErrorMessage;

// ---------------------------------------------------------------------------
// Shared data types
// ---------------------------------------------------------------------------

/**
 * Serialized slide data for transfer across the worker boundary.
 *
 * Carries the full enriched slide chain (slide + layout + master) which
 * is pure IR data (JSON-serializable). The theme and color map are included
 * so the worker can construct a complete RenderContext without callbacks
 * to the main thread.
 *
 * Media (images) are sent as pre-decoded ArrayBuffers keyed by part URI.
 */
export interface SerializedSlideData {
  /** The enriched slide chain: slide + layout + master. */
  enrichedSlide: EnrichedSlideData;
  /** Presentation theme for the slide's master chain. */
  theme: ThemeIR;
  /** Merged color map (master → layout → slide overrides). */
  colorMap?: ColorMapOverride;
  /** Slide width in EMU. */
  width: number;
  /** Slide height in EMU. */
  height: number;
  /** 1-based slide number for field code rendering. */
  slideNumber?: number;
  /**
   * Pre-loaded media buffers keyed by OPC part URI.
   * Images are transferred as ArrayBuffers to avoid re-fetching in the worker.
   */
  mediaBuffers?: Record<string, ArrayBuffer>;
}

/**
 * Viewport rectangle for culling — only elements intersecting this
 * rect need to be rendered.
 */
export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
