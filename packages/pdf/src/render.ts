/**
 * @opendockit/pdf/render — PDF page rendering.
 *
 * Re-exports rendering functionality from @opendockit/pdf-signer/render.
 */

export {
  PDFRenderer,
  renderPage,
  NativeRenderer,
  renderPageNative,
  evaluatePage,
  OperatorList,
  OPS,
  NativeCanvasGraphics,
  evaluatePageWithElements,
  getPageElements,
} from '@opendockit/pdf-signer/render';

export type {
  RenderOptions,
  RenderResult,
  NativeFont,
  Glyph,
  NativeImage,
} from '@opendockit/pdf-signer/render';
