/**
 * pdfbox-ts/render — PDF page rendering.
 *
 * Two rendering paths:
 *
 * 1. PDFRenderer (PDF.js-based):
 *    Wraps PDF.js for high-fidelity rendering from raw bytes.
 *    Requires pdfjs-dist as a peer dependency.
 *
 * 2. NativeRenderer (native evaluator):
 *    Renders directly from COS objects — no save→re-parse round-trip.
 *    Enables instant edit→render workflows.
 *    Only requires the `canvas` npm package (Node.js) or native Canvas (browser).
 *
 * Usage:
 *   import { PDFRenderer, NativeRenderer, renderPage, renderPageNative } from 'pdfbox-ts/render';
 *
 * In Node.js, also requires the `canvas` npm package.
 */

// PDF.js-based rendering (high fidelity, requires pdfjs-dist)
export { PDFRenderer, renderPage } from './PDFRenderer.js';

// Native rendering (no PDF.js, direct from COS objects)
export { NativeRenderer, renderPageNative } from './NativeRenderer.js';

// Evaluator + canvas graphics (for advanced usage)
export { evaluatePage } from './evaluator.js';
export { OperatorList } from './operator-list.js';
export { OPS } from './ops.js';
export { NativeCanvasGraphics } from './canvas-graphics.js';

// Element extraction
export { evaluatePageWithElements } from './evaluator.js';
export { getPageElements } from './NativeRenderer.js';

// Types
export type { RenderOptions, RenderResult } from './types.js';
export type { NativeFont, Glyph, NativeImage } from './evaluator.js';
