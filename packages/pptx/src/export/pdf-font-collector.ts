/**
 * PDF Font Collector — walks presentation IR to discover all fonts needed for PDF export.
 *
 * Scans slides, layouts, and masters for text runs and collects unique
 * (family, bold, italic) combinations. Resolves OOXML theme font
 * references (+mj-lt, +mn-lt) to actual font names via the theme's
 * fontScheme.
 *
 * @module pdf-font-collector
 */

import type {
  SlideElementIR,
  DrawingMLShapeIR,
  GroupIR,
  TableIR,
  TextBodyIR,
  ParagraphIR,
  CharacterPropertiesIR,
  ThemeIR,
} from '@opendockit/core';
import type { EnrichedSlideData } from '../model/index.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A unique font variant identified by family name and style. */
export interface FontKey {
  family: string;
  bold: boolean;
  italic: boolean;
}

// ---------------------------------------------------------------------------
// Theme font resolution
// ---------------------------------------------------------------------------

/**
 * Resolve OOXML theme font placeholders to actual font names.
 *
 * OOXML uses `+mj-lt` for major latin font and `+mn-lt` for minor
 * latin font. These are resolved via the theme's fontScheme.
 */
function resolveThemeFont(
  fontFamily: string | undefined,
  theme: ThemeIR | undefined
): string | undefined {
  if (!fontFamily) return undefined;

  if (!theme) return fontFamily;

  // Theme font references start with '+mj-' (major) or '+mn-' (minor)
  if (fontFamily === '+mj-lt' || fontFamily === '+mj-ea' || fontFamily === '+mj-cs') {
    return theme.fontScheme.majorLatin;
  }
  if (fontFamily === '+mn-lt' || fontFamily === '+mn-ea' || fontFamily === '+mn-cs') {
    return theme.fontScheme.minorLatin;
  }

  return fontFamily;
}

// ---------------------------------------------------------------------------
// Collection logic
// ---------------------------------------------------------------------------

/**
 * Collect all unique fonts used in a presentation's slide data.
 *
 * Walks through all text runs across master/layout/slide elements,
 * resolves theme font references, and deduplicates by (family, bold, italic).
 *
 * @param slides - Enriched slide data (slide + layout + master chains)
 * @param theme - The presentation theme (for resolving +mj-lt/+mn-lt)
 * @returns Array of unique FontKey entries
 */
export function collectFontsFromPresentation(
  slides: EnrichedSlideData[],
  theme?: ThemeIR
): FontKey[] {
  const seen = new Set<string>();
  const result: FontKey[] = [];

  function addFont(family: string, bold: boolean, italic: boolean): void {
    const key = `${family.toLowerCase()}|${bold}|${italic}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ family, bold, italic });
  }

  function processCharProps(props: CharacterPropertiesIR | undefined): void {
    if (!props) return;

    // Try fontFamily first, then latin typeface
    const rawFamily = props.fontFamily ?? props.latin;
    const resolvedFamily = resolveThemeFont(rawFamily, theme);
    if (!resolvedFamily) return;

    const bold = !!props.bold;
    const italic = !!props.italic;
    addFont(resolvedFamily, bold, italic);
  }

  function processParagraph(para: ParagraphIR): void {
    for (const run of para.runs) {
      if (run.kind === 'run') {
        processCharProps(run.properties);
      } else if (run.kind === 'lineBreak') {
        processCharProps(run.properties);
      }
    }
    // endParaProperties may specify a font for empty paragraphs
    processCharProps(para.endParaProperties);
  }

  function processTextBody(textBody: TextBodyIR | undefined): void {
    if (!textBody) return;
    for (const para of textBody.paragraphs) {
      processParagraph(para);
    }
  }

  function processElement(element: SlideElementIR): void {
    switch (element.kind) {
      case 'shape': {
        const shape = element as DrawingMLShapeIR;
        processTextBody(shape.textBody);
        break;
      }
      case 'group': {
        const group = element as GroupIR;
        for (const child of group.children) {
          processElement(child);
        }
        break;
      }
      case 'table': {
        const table = element as TableIR;
        for (const row of table.rows) {
          for (const cell of row.cells) {
            processTextBody(cell.textBody);
          }
        }
        break;
      }
      // picture, connector, chart, unsupported: no text bodies
      default:
        break;
    }
  }

  function processElements(elements: SlideElementIR[]): void {
    for (const element of elements) {
      processElement(element);
    }
  }

  for (const slideData of slides) {
    processElements(slideData.master.elements);
    processElements(slideData.layout.elements);
    processElements(slideData.slide.elements);
  }

  return result;
}
