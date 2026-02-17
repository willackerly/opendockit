/**
 * DrawingML renderers — Canvas2D rendering for DrawingML IR objects.
 *
 * Usage:
 *   import { RenderContext, applyFill, applyLine } from '@opendockit/core/drawingml/renderer';
 *   import { renderShape, renderSlideElement, renderGroup } from '@opendockit/core/drawingml/renderer';
 */

// Render context
export type { RenderContext } from './render-context.js';
export { emuToScaledPx } from './render-context.js';

// Fill renderer
export { applyFill } from './fill-renderer.js';

// Line renderer
export { applyLine, drawLineEnds } from './line-renderer.js';

// Effect renderer
export { applyEffects } from './effect-renderer.js';

// Text renderer
export { renderTextBody } from './text-renderer.js';

// Picture renderer
export { renderPicture } from './picture-renderer.js';

// Shape renderer (composition layer)
export { renderShape, renderSlideElement } from './shape-renderer.js';

// Connector renderer
export { renderConnector } from './connector-renderer.js';

// Group renderer
export { renderGroup } from './group-renderer.js';

// Table renderer
export { renderTable } from './table-renderer.js';
