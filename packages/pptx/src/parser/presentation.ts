/**
 * Presentation parser — the main entry point for parsing PPTX files.
 *
 * Opens an OPC package, navigates the relationship tree to find the
 * presentation part, slides, theme, layouts, and masters, then assembles
 * a {@link PresentationIR}.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 13.3.6 (Presentation)
 */

import type { ThemeIR, XmlElement } from '@opendockit/core';
import type { OpcPackage, RelationshipMap } from '@opendockit/core/opc';
import {
  REL_OFFICE_DOCUMENT,
  REL_SLIDE,
  REL_SLIDE_LAYOUT,
  REL_SLIDE_MASTER,
  REL_THEME,
} from '@opendockit/core/opc';
import { parseTheme } from '@opendockit/core/theme';
import type { PresentationIR, SlideReference, EmbeddedFontRef } from '../model/index.js';

/** Default slide width: 10 inches in EMU (standard 10:7.5 slide). */
const DEFAULT_SLIDE_WIDTH = 9144000;
/** Default slide height: 7.5 inches in EMU. */
const DEFAULT_SLIDE_HEIGHT = 6858000;

/**
 * Parse a PPTX presentation from an opened OPC package.
 *
 * This is the top-level entry point for parsing. It:
 * 1. Locates the main presentation part via root relationships
 * 2. Parses slide dimensions from `p:sldSz`
 * 3. Builds slide references with layout/master chain
 * 4. Parses the presentation theme
 *
 * @param pkg - An opened OPC package (from OpcPackageReader.open)
 * @returns The parsed presentation IR.
 */
export async function parsePresentation(pkg: OpcPackage): Promise<PresentationIR> {
  // 1. Find the main presentation part
  const rootRels = await pkg.getRootRelationships();
  const presRel = rootRels.getByType(REL_OFFICE_DOCUMENT)[0];
  if (!presRel) {
    throw new Error('Cannot find presentation part — missing officeDocument relationship');
  }
  const presPartUri = presRel.target;

  // 2. Parse presentation.xml
  const presXml = await pkg.getPartXml(presPartUri);

  // 3. Extract slide size
  const sldSz = presXml.child('p:sldSz');
  const slideWidth = sldSz?.attr('cx') ? parseInt(sldSz.attr('cx')!, 10) : DEFAULT_SLIDE_WIDTH;
  const slideHeight = sldSz?.attr('cy') ? parseInt(sldSz.attr('cy')!, 10) : DEFAULT_SLIDE_HEIGHT;

  // 4. Get presentation relationships
  const presRels = await pkg.getPartRelationships(presPartUri);

  // 5. Build slide references
  // The slide list in presentation.xml determines the order
  const sldIdLst = presXml.child('p:sldIdLst');
  const slideRels = presRels.getByType(REL_SLIDE);
  const slideRefMap = new Map(slideRels.map((r) => [r.id, r]));

  const slides: SlideReference[] = [];
  if (sldIdLst) {
    const sldIds = sldIdLst.allChildren('p:sldId');
    for (let i = 0; i < sldIds.length; i++) {
      const sldId = sldIds[i];
      const rId = sldId.attr('r:id');
      if (!rId) continue;

      const slideRel = slideRefMap.get(rId);
      if (!slideRel) continue;

      const slidePartUri = slideRel.target;

      // Follow the chain: slide -> layout -> master
      const { layoutPartUri, masterPartUri } = await resolveSlideChain(pkg, slidePartUri);

      slides.push({
        index: i,
        partUri: slidePartUri,
        layoutPartUri,
        masterPartUri,
        relationshipId: rId,
      });
    }
  }

  // 6. Parse theme
  const themeRel = presRels.getByType(REL_THEME)[0];
  let theme: ThemeIR;
  if (themeRel) {
    const themeXml = await pkg.getPartXml(themeRel.target);
    theme = parseTheme(themeXml);
  } else {
    theme = defaultTheme();
  }

  // 7. Parse embedded font list
  const embeddedFonts = parseEmbeddedFontList(presXml, presRels);

  const result: PresentationIR = {
    slideWidth,
    slideHeight,
    slideCount: slides.length,
    slides,
    theme,
  };
  if (embeddedFonts.length > 0) {
    result.embeddedFonts = embeddedFonts;
  }
  return result;
}

/**
 * Resolve the slide -> layout -> master relationship chain.
 *
 * Given a slide part URI, follows relationships to find the associated
 * slide layout and slide master URIs.
 */
async function resolveSlideChain(
  pkg: OpcPackage,
  slidePartUri: string
): Promise<{ layoutPartUri: string; masterPartUri: string }> {
  // Slide -> Layout
  const slideRels = await pkg.getPartRelationships(slidePartUri);
  const layoutRel = slideRels.getByType(REL_SLIDE_LAYOUT)[0];

  let layoutPartUri = '';
  let masterPartUri = '';

  if (layoutRel) {
    layoutPartUri = layoutRel.target;

    // Layout -> Master
    const layoutRels = await pkg.getPartRelationships(layoutPartUri);
    const masterRel = layoutRels.getByType(REL_SLIDE_MASTER)[0];
    if (masterRel) {
      masterPartUri = masterRel.target;
    }
  }

  return { layoutPartUri, masterPartUri };
}

/**
 * Parse `<p:embeddedFontLst>` from presentation.xml.
 *
 * Each `<p:embeddedFont>` contains a `<p:font>` with the typeface name
 * and optional `<p:regular>`, `<p:bold>`, `<p:italic>`, `<p:boldItalic>`
 * children whose `r:id` attributes point to font parts (typically .fntdata).
 */
function parseEmbeddedFontList(presXml: XmlElement, presRels: RelationshipMap): EmbeddedFontRef[] {
  const fontLst = presXml.child('p:embeddedFontLst');
  if (!fontLst) return [];

  const result: EmbeddedFontRef[] = [];
  for (const embFont of fontLst.allChildren('p:embeddedFont')) {
    const fontEl = embFont.child('p:font');
    const typeface = fontEl?.attr('typeface');
    if (!typeface) continue;

    const ref: EmbeddedFontRef = { typeface };

    const variants: Array<[keyof EmbeddedFontRef, string]> = [
      ['regular', 'p:regular'],
      ['bold', 'p:bold'],
      ['italic', 'p:italic'],
      ['boldItalic', 'p:boldItalic'],
    ];

    for (const [key, tag] of variants) {
      const variantEl = embFont.child(tag);
      const rId = variantEl?.attr('r:id');
      if (rId) {
        const rel = presRels.getById(rId);
        if (rel) {
          ref[key] = rel.target;
        }
      }
    }

    result.push(ref);
  }
  return result;
}

/** Minimal default theme when no theme part is found. */
function defaultTheme(): ThemeIR {
  return {
    name: 'Default',
    colorScheme: {
      dk1: { r: 0, g: 0, b: 0, a: 1 },
      lt1: { r: 255, g: 255, b: 255, a: 1 },
      dk2: { r: 68, g: 84, b: 106, a: 1 },
      lt2: { r: 231, g: 230, b: 230, a: 1 },
      accent1: { r: 68, g: 114, b: 196, a: 1 },
      accent2: { r: 237, g: 125, b: 49, a: 1 },
      accent3: { r: 165, g: 165, b: 165, a: 1 },
      accent4: { r: 255, g: 192, b: 0, a: 1 },
      accent5: { r: 91, g: 155, b: 213, a: 1 },
      accent6: { r: 112, g: 173, b: 71, a: 1 },
      hlink: { r: 5, g: 99, b: 193, a: 1 },
      folHlink: { r: 149, g: 79, b: 114, a: 1 },
    },
    fontScheme: {
      majorLatin: 'Calibri Light',
      minorLatin: 'Calibri',
    },
    formatScheme: {
      fillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
      lineStyles: [{}, {}, {}],
      effectStyles: [[], [], []],
      bgFillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
    },
  };
}
