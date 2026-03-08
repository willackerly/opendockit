/**
 * PDF Image Collector — walks slide IR to discover all images needed for PDF export.
 *
 * Scans slides, layouts, and masters for PictureIR elements and collects
 * unique image part URIs. Works with the OPC package to extract raw
 * image bytes for embedding.
 *
 * Architecture:
 *   EnrichedSlideData[] -> collectImagesFromSlide() -> ImageCollectionResult[]
 *   (one call per slide, not per presentation, since images are embedded per-page)
 *
 * @module pdf-image-collector
 */

import type { SlideElementIR, PictureIR, GroupIR } from '@opendockit/core';
import type { EnrichedSlideData } from '../model/index.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Result of collecting a single image from the slide IR. */
export interface CollectedImage {
  /** OPC part URI of the image (unique identifier). */
  imagePartUri: string;
  /** Image width in EMU (from the picture's transform). */
  widthEmu: number;
  /** Image height in EMU (from the picture's transform). */
  heightEmu: number;
}

// ---------------------------------------------------------------------------
// Collection logic
// ---------------------------------------------------------------------------

/**
 * Collect all unique images referenced by a single slide.
 *
 * Walks master, layout, and slide elements (respecting showMasterSp)
 * to find PictureIR elements with valid transforms and image part URIs.
 *
 * @param slideData - Enriched slide data (slide + layout + master chain)
 * @returns Array of unique CollectedImage entries (deduplicated by imagePartUri)
 */
export function collectImagesFromSlide(slideData: EnrichedSlideData): CollectedImage[] {
  const seen = new Set<string>();
  const result: CollectedImage[] = [];

  function addImage(imagePartUri: string, widthEmu: number, heightEmu: number): void {
    if (seen.has(imagePartUri)) return;
    seen.add(imagePartUri);
    result.push({ imagePartUri, widthEmu, heightEmu });
  }

  function processElement(element: SlideElementIR): void {
    switch (element.kind) {
      case 'picture': {
        const pic = element as PictureIR;
        const transform = pic.properties.transform;
        if (transform && pic.imagePartUri) {
          addImage(pic.imagePartUri, transform.size.width, transform.size.height);
        }
        break;
      }
      case 'group': {
        const group = element as GroupIR;
        for (const child of group.children) {
          processElement(child);
        }
        break;
      }
      // shapes, tables, connectors, etc. — no image references
      default:
        break;
    }
  }

  function processElements(elements: SlideElementIR[]): void {
    for (const element of elements) {
      processElement(element);
    }
  }

  // Respect showMasterSp flag
  const showMaster = slideData.layout.showMasterSp !== false;
  if (showMaster) {
    processElements(slideData.master.elements);
  }
  processElements(slideData.layout.elements);
  processElements(slideData.slide.elements);

  return result;
}

/**
 * Collect all unique images across all slides in a presentation.
 *
 * Used for pre-flight collection when images need to be embedded
 * once and referenced from multiple pages.
 *
 * @param slides - All enriched slide data
 * @returns Array of unique CollectedImage entries (deduplicated across slides)
 */
export function collectImagesFromPresentation(slides: EnrichedSlideData[]): CollectedImage[] {
  const seen = new Set<string>();
  const result: CollectedImage[] = [];

  for (const slideData of slides) {
    const slideImages = collectImagesFromSlide(slideData);
    for (const img of slideImages) {
      if (!seen.has(img.imagePartUri)) {
        seen.add(img.imagePartUri);
        result.push(img);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Image format detection
// ---------------------------------------------------------------------------

/**
 * Detect the MIME type of an image from its raw bytes.
 *
 * Checks magic bytes for JPEG, PNG, GIF, TIFF, BMP, and WEBP.
 * Falls back to 'application/octet-stream' for unknown formats.
 */
export function detectImageMimeType(bytes: Uint8Array): string {
  if (bytes.length < 4) return 'application/octet-stream';

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }

  // GIF: 47 49 46
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif';
  }

  // TIFF: 49 49 2A 00 (little-endian) or 4D 4D 00 2A (big-endian)
  if (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)
  ) {
    return 'image/tiff';
  }

  // BMP: 42 4D
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp';
  }

  // WEBP: 52 49 46 46 ... 57 45 42 50
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  // EMF: 01 00 00 00 (Windows Enhanced Metafile)
  if (bytes[0] === 0x01 && bytes[1] === 0x00 && bytes[2] === 0x00 && bytes[3] === 0x00) {
    return 'image/x-emf';
  }

  return 'application/octet-stream';
}
