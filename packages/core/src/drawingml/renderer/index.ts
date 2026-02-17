/**
 * DrawingML renderers — Canvas2D rendering for DrawingML IR objects.
 *
 * Usage:
 *   import { RenderContext, applyFill, applyLine } from '@opendockit/core/drawingml/renderer';
 */

// Render context
export type { RenderContext } from './render-context.js';
export { emuToScaledPx } from './render-context.js';

// Fill renderer
export { applyFill } from './fill-renderer.js';

// Line renderer
export { applyLine, drawLineEnds } from './line-renderer.js';
