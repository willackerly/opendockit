/**
 * @opendockit/pptx — Progressive-fidelity PPTX renderer.
 *
 * Public API entry point. Exports the SlideKit class (the main user-facing
 * API), model types, parsers, and renderer functions.
 */

// Public API: SlideKit
export { SlideKit } from './viewport/index.js';
export type {
  SlideKitOptions,
  SlideKitProgressEvent,
  LoadedPresentation,
  HyperlinkHitRegion,
} from './viewport/index.js';

// Model types
export type {
  PresentationIR,
  SlideReference,
  SlideMasterIR,
  SlideLayoutIR,
  SlideIR,
  BackgroundIR,
  ColorMapOverride,
} from './model/index.js';

// Parsers
export {
  parsePresentation,
  parseSlideMaster,
  parseSlideLayout,
  parseSlide,
  parseBackground,
  parseColorMap,
  parseColorMapOverride,
} from './parser/index.js';

// Renderers
export { renderSlide, renderBackground } from './renderer/index.js';
