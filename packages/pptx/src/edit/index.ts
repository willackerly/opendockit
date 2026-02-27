/**
 * Edit API — barrel export.
 *
 * Re-exports the EditableSlideKit (main public API), the builder,
 * and the save pipeline.
 */

export { EditableSlideKit } from './editable-slide-kit.js';
export type { EditableLoadResult } from './editable-slide-kit.js';
export { buildEditablePresentation } from './editable-builder.js';
export { savePptx } from './save-pipeline.js';
