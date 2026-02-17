/**
 * Media handling — image loading, caching, and transforms.
 *
 * Usage:
 *   import { MediaCache, decodeImage, loadAndCacheImage } from '@opendockit/core/media';
 */

// Cache
export { MediaCache } from './media-cache.js';
export type { MediaCacheOptions, CachedMedia } from './media-cache.js';

// Image loader
export { detectImageType, decodeImage, loadAndCacheImage } from './image-loader.js';

// Image transforms
export { calculateCropRect, calculateStretchRect } from './image-transforms.js';
