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

/** Result of font collection including used codepoints per font. */
export interface FontCollectionResult {
  /** Unique font variants discovered. */
  fontKeys: FontKey[];
  /** Set of Unicode codepoints used per font key (key: "family|bold|italic"). */
  usedCodepoints: Map<string, Set<number>>;
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
  return collectFontsWithCodepoints(slides, theme).fontKeys;
}

/**
 * Collect all unique fonts AND codepoints used per font.
 *
 * Same IR walk as collectFontsFromPresentation but also tracks which
 * Unicode codepoints appear in text runs for each (family, bold, italic)
 * combination. This enables font subsetting — only include glyphs that
 * are actually used in the document.
 */
export function collectFontsWithCodepoints(
  slides: EnrichedSlideData[],
  theme?: ThemeIR
): FontCollectionResult {
  const seen = new Set<string>();
  const result: FontKey[] = [];
  const usedCodepoints = new Map<string, Set<number>>();

  function fontKeyStr(family: string, bold: boolean, italic: boolean): string {
    return `${family.toLowerCase()}|${bold}|${italic}`;
  }

  function addFont(family: string, bold: boolean, italic: boolean): string {
    const key = fontKeyStr(family, bold, italic);
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ family, bold, italic });
      usedCodepoints.set(key, new Set<number>());
    }
    return key;
  }

  function addCodepoints(key: string, text: string): void {
    const cpSet = usedCodepoints.get(key);
    if (!cpSet) return;
    for (let i = 0; i < text.length; i++) {
      const cp = text.codePointAt(i)!;
      cpSet.add(cp);
      if (cp > 0xffff) i++; // skip low surrogate
    }
  }

  function processRun(
    props: CharacterPropertiesIR | undefined,
    text?: string
  ): void {
    if (!props) return;

    const rawFamily = props.fontFamily ?? props.latin;
    const resolvedFamily = resolveThemeFont(rawFamily, theme);
    if (!resolvedFamily) return;

    const bold = !!props.bold;
    const italic = !!props.italic;
    const key = addFont(resolvedFamily, bold, italic);

    if (text) {
      addCodepoints(key, text);
    }
  }

  function processParagraph(para: ParagraphIR): void {
    for (const run of para.runs) {
      if (run.kind === 'run') {
        processRun(run.properties, run.text);
      } else if (run.kind === 'lineBreak') {
        processRun(run.properties);
      }
    }
    // endParaProperties may specify a font for empty paragraphs
    processRun(para.endParaProperties);
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

  return { fontKeys: result, usedCodepoints };
}
