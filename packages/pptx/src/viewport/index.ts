/**
 * PPTX Viewport — barrel export.
 *
 * Re-exports the public SlideKit API and related types.
 */

export { SlideKit } from './slide-viewport.js';
export type {
  SlideKitOptions,
  SlideKitProgressEvent,
  LoadedPresentation,
  HyperlinkHitRegion,
} from './slide-viewport.js';

// Re-export FontConfig so users can configure fontConfig without reaching into core
export type { FontConfig } from '@opendockit/core/font';
