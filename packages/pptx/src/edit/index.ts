/**
 * Edit API — barrel export.
 *
 * Re-exports the EditableSlideKit (main public API), the builder,
 * the save pipeline, and text editing primitives.
 */

export { EditableSlideKit } from './editable-slide-kit.js';
export type { EditableLoadResult } from './editable-slide-kit.js';
export { buildEditablePresentation } from './editable-builder.js';
export { savePptx } from './save-pipeline.js';

// Text editing primitives
export { SelectionModel } from './selection-model.js';
export type { TextPosition } from './selection-model.js';
export { TextInputCapture } from './text-input-capture.js';
export { CaretRenderer } from './caret-renderer.js';
