/**
 * PPTX Parser — barrel export.
 *
 * Re-exports all PresentationML parsers: presentation (top-level),
 * slide, slide master, slide layout, and background.
 */

export { parsePresentation } from './presentation.js';
export { parseSlideMaster } from './slide-master.js';
export { parseSlideLayout } from './slide-layout.js';
export { parseSlide } from './slide.js';
export { parseBackground } from './background.js';
export { parseColorMap, parseColorMapOverride } from './color-map.js';
