/**
 * Slide parser for PresentationML.
 *
 * Parses `p:sld` elements into {@link SlideIR}, extracting the shape tree,
 * background, and color map override. Also provides helpers for parsing
 * speaker notes from associated notesSlide parts.
 *
 * Reference: ECMA-376 5th Edition, Part 1 ss 19.3.1.38 (sld)
 */

import type { XmlElement, ThemeIR } from '@opendockit/core';
import type { OpcPackage } from '@opendockit/core/opc';
import { REL_NOTES_SLIDE } from '@opendockit/core/opc';
import type { SlideIR } from '../model/index.js';
import { parseShapeTreeChildren } from './shape-tree.js';
import { parseBackground } from './background.js';
import { parseColorMapOverride } from './color-map.js';

/**
 * Parse a slide XML element (`p:sld`).
 *
 * @param slideElement - The root `p:sld` XML element.
 * @param partUri - OPC part URI of this slide.
 * @param layoutPartUri - OPC part URI of the associated slide layout.
 * @param masterPartUri - OPC part URI of the associated slide master.
 * @param theme - The resolved presentation theme.
 * @returns Parsed slide IR.
 */
export function parseSlide(
  slideElement: XmlElement,
  partUri: string,
  layoutPartUri: string,
  masterPartUri: string,
  theme: ThemeIR
): SlideIR {
  const cSld = slideElement.child('p:cSld');

  // Parse shape tree
  const spTree = cSld?.child('p:spTree');
  const elements = spTree ? parseShapeTreeChildren(spTree, theme) : [];

  // Parse background
  const bgElement = cSld?.child('p:bg');
  const background = bgElement ? parseBackground(bgElement, theme) : undefined;

  // Parse color map override
  const clrMapOvr = slideElement.child('p:clrMapOvr');
  const colorMap = clrMapOvr ? parseColorMapOverride(clrMapOvr) : undefined;

  return {
    partUri,
    elements,
    background,
    colorMap,
    layoutPartUri,
    masterPartUri,
  };
}

/**
 * Parse speaker notes text for a slide from the OPC package.
 *
 * Checks the slide's relationships for a notesSlide relationship. If found,
 * reads the notesSlide XML and extracts plain text from the body placeholder.
 *
 * @param pkg - The opened OPC package.
 * @param slidePartUri - OPC part URI of the slide.
 * @returns Plain text of the speaker notes, or `undefined` if none.
 */
export async function parseNotesText(
  pkg: OpcPackage,
  slidePartUri: string
): Promise<string | undefined> {
  const rels = await pkg.getPartRelationships(slidePartUri);
  const notesRels = rels.getByType(REL_NOTES_SLIDE);
  if (notesRels.length === 0) return undefined;

  const notesPartUri = notesRels[0].target;

  let notesXml: XmlElement;
  try {
    notesXml = await pkg.getPartXml(notesPartUri);
  } catch {
    // Notes part missing or unparseable — gracefully return undefined.
    return undefined;
  }

  return extractNotesText(notesXml);
}

/**
 * Extract plain text from a notesSlide XML element (`p:notes`).
 *
 * Finds the shape with placeholder type "body" in the shape tree and
 * concatenates all text runs from its paragraphs, joining with newlines.
 *
 * @param notesElement - The root `p:notes` XML element.
 * @returns Plain text of the notes, or `undefined` if no body placeholder found.
 */
export function extractNotesText(notesElement: XmlElement): string | undefined {
  const cSld = notesElement.child('p:cSld');
  if (!cSld) return undefined;

  const spTree = cSld.child('p:spTree');
  if (!spTree) return undefined;

  // Find the shape with placeholder type="body" — this is the notes text box.
  const bodyShape = findBodyPlaceholder(spTree);
  if (!bodyShape) return undefined;

  const txBody = bodyShape.child('p:txBody');
  if (!txBody) return undefined;

  return extractPlainText(txBody);
}

/**
 * Find the shape with placeholder type="body" in a notes slide shape tree.
 */
function findBodyPlaceholder(spTree: XmlElement): XmlElement | undefined {
  for (const sp of spTree.allChildren('p:sp')) {
    const nvSpPr = sp.child('p:nvSpPr');
    if (!nvSpPr) continue;

    const nvPr = nvSpPr.child('p:nvPr');
    if (!nvPr) continue;

    const ph = nvPr.child('p:ph');
    if (!ph) continue;

    if (ph.attr('type') === 'body') {
      return sp;
    }
  }
  return undefined;
}

/**
 * Extract plain text from an `a:txBody` element.
 *
 * Concatenates text runs across all paragraphs, joining paragraphs with newlines.
 */
function extractPlainText(txBody: XmlElement): string | undefined {
  const paragraphs: string[] = [];

  for (const p of txBody.allChildren('a:p')) {
    const runs: string[] = [];

    for (const child of p.children) {
      if (child.is('a:r')) {
        // Normal run — get text from a:t child.
        const t = child.child('a:t');
        if (t) {
          runs.push(t.text());
        }
      } else if (child.is('a:br')) {
        // Line break within a paragraph.
        runs.push('\n');
      } else if (child.is('a:fld')) {
        // Field (e.g., slide number) — get text from a:t child.
        const t = child.child('a:t');
        if (t) {
          runs.push(t.text());
        }
      }
    }

    paragraphs.push(runs.join(''));
  }

  const text = paragraphs.join('\n');
  return text.length > 0 ? text : undefined;
}
