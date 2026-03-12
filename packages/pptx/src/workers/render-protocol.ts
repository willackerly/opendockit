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

/** Request a render frame with the given slide data. */
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
 * This is a JSON-safe intermediate representation. The full
 * `EnrichedSlideData` contains parsed XML references and class instances
 * that cannot cross the structured-clone boundary, so this flattened
 * form carries only the data needed for rendering.
 */
export interface SerializedSlideData {
  /** Slide IR elements (already JSON-serializable from the parser). */
  elements: unknown[];
  /** Background fill data. */
  background?: unknown;
  /** Slide width in EMU. */
  width: number;
  /** Slide height in EMU. */
  height: number;
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
