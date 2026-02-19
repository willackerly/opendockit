/**
 * PPTX-specific Intermediate Representation types.
 *
 * These types extend the core DrawingML IR with PresentationML-specific
 * concepts: slides, slide masters, slide layouts, backgrounds, and
 * color map overrides.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 13 (PresentationML)
 */

import type { ThemeIR, SlideElementIR, FillIR, ListStyleIR } from '@opendockit/core';

// ═══════════════════════════════════════════════════════════════════════════
// Presentation
// ═══════════════════════════════════════════════════════════════════════════

/** Reference to an embedded font in the PPTX package. */
export interface EmbeddedFontRef {
  /** Font family name (from p:font typeface). */
  typeface: string;
  /** OPC part URI for the regular variant. */
  regular?: string;
  /** OPC part URI for the bold variant. */
  bold?: string;
  /** OPC part URI for the italic variant. */
  italic?: string;
  /** OPC part URI for the bold-italic variant. */
  boldItalic?: string;
}

/** Top-level presentation IR produced by parsing a PPTX file. */
export interface PresentationIR {
  /** Slide width in EMU. */
  slideWidth: number;
  /** Slide height in EMU. */
  slideHeight: number;
  /** Total number of slides. */
  slideCount: number;
  /** Ordered list of slide references. */
  slides: SlideReference[];
  /** Presentation theme (from the first/primary theme part). */
  theme: ThemeIR;
  /** Embedded fonts from the PPTX package (from p:embeddedFontLst). */
  embeddedFonts?: EmbeddedFontRef[];
}

/** Reference to a slide and its associated layout/master chain. */
export interface SlideReference {
  /** Zero-based slide index. */
  index: number;
  /** OPC part URI of the slide, e.g. "/ppt/slides/slide1.xml". */
  partUri: string;
  /** OPC part URI of the slide layout. */
  layoutPartUri: string;
  /** OPC part URI of the slide master. */
  masterPartUri: string;
  /** Relationship ID from the presentation to this slide. */
  relationshipId: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Slide Master
// ═══════════════════════════════════════════════════════════════════════════

/** Parsed slide master IR. */
export interface SlideMasterIR {
  /** OPC part URI of the slide master. */
  partUri: string;
  /** Shape tree elements from the master. */
  elements: SlideElementIR[];
  /** Master background. */
  background?: BackgroundIR;
  /** Color map that maps scheme roles to theme color slots. */
  colorMap: ColorMapOverride;
  /** Text styles for placeholder text defaults (titleStyle, bodyStyle, otherStyle). */
  txStyles?: {
    titleStyle?: ListStyleIR;
    bodyStyle?: ListStyleIR;
    otherStyle?: ListStyleIR;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Slide Layout
// ═══════════════════════════════════════════════════════════════════════════

/** Parsed slide layout IR. */
export interface SlideLayoutIR {
  /** OPC part URI of the slide layout. */
  partUri: string;
  /** Shape tree elements from the layout. */
  elements: SlideElementIR[];
  /** Layout background (overrides master if present). */
  background?: BackgroundIR;
  /** OPC part URI of the associated slide master. */
  masterPartUri: string;
  /** Color map override (overrides master if present). */
  colorMap?: ColorMapOverride;
  /** Whether to show master shapes on this layout (defaults to true if absent). */
  showMasterSp?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Slide
// ═══════════════════════════════════════════════════════════════════════════

/** Parsed slide IR. */
export interface SlideIR {
  /** OPC part URI of the slide. */
  partUri: string;
  /** Shape tree elements from the slide. */
  elements: SlideElementIR[];
  /** Slide background (overrides layout/master if present). */
  background?: BackgroundIR;
  /** Color map override (overrides layout/master if present). */
  colorMap?: ColorMapOverride;
  /** OPC part URI of the associated slide layout. */
  layoutPartUri: string;
  /** OPC part URI of the associated slide master. */
  masterPartUri: string;
  /** Speaker notes text content, if any. */
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Enriched Slide (slide + layout + master chain)
// ═══════════════════════════════════════════════════════════════════════════

/** A slide bundled with its layout and master chain, ready for rendering. */
export interface EnrichedSlideData {
  slide: SlideIR;
  layout: SlideLayoutIR;
  master: SlideMasterIR;
}

// ═══════════════════════════════════════════════════════════════════════════
// Background
// ═══════════════════════════════════════════════════════════════════════════

/** Background fill for a slide, layout, or master. */
export interface BackgroundIR {
  /** The resolved fill for this background. */
  fill?: FillIR;
}

// ═══════════════════════════════════════════════════════════════════════════
// Color Map
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Color map override — maps scheme color roles to theme color slots.
 *
 * Example: `{ bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2', ... }`
 *
 * Reference: ECMA-376 Part 1 ss 19.3.1.6 (clrMap)
 */
export interface ColorMapOverride {
  [schemeKey: string]: string;
}
