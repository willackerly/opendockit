/**
 * Document parser — top-level parser that reads `word/document.xml` from
 * an OPC package and returns a {@link DocumentIR}.
 *
 * Orchestrates the section, paragraph, run, and style parsers to build
 * the complete document intermediate representation.
 *
 * Reference: ECMA-376, Part 1, Section 17.2 (Document Body).
 */

import type { XmlElement } from '@opendockit/core';
import type { OpcPackage } from '@opendockit/core/opc';
import { REL_OFFICE_DOCUMENT } from '@opendockit/core/opc';
import type {
  DocumentIR,
  SectionIR,
  ParagraphIR,
  BlockElement,
  StyleMap,
} from '../model/document-ir.js';
import { parseParagraph } from './paragraph.js';
import { parseTable } from './table.js';
import { parseSectionProperties, defaultSectionDimensions } from './section-properties.js';
import { parseStyles, parseDocDefaults } from './styles.js';

/**
 * Parse an OPC package containing a DOCX file into a {@link DocumentIR}.
 *
 * Reads the main document part (`word/document.xml`) and styles
 * (`word/styles.xml`), then constructs the full document IR.
 */
export async function parseDocument(pkg: OpcPackage): Promise<DocumentIR> {
  // Find the main document relationship
  const rootRels = await pkg.getRootRelationships();
  const docRel = rootRels.getByType(REL_OFFICE_DOCUMENT)[0];
  if (docRel === undefined) {
    throw new Error('DOCX package is missing the main document relationship.');
  }

  // Parse the main document XML
  const docXml = await pkg.getPartXml(docRel.target);
  const body = docXml.child('w:body');
  if (body === undefined) {
    throw new Error('document.xml is missing <w:body> element.');
  }

  // Parse styles (optional — some minimal DOCX files may lack styles.xml)
  const { styles, defaultStyle } = await parseStylesFromPackage(pkg, docRel.target);

  // Parse document body into sections
  const sections = parseDocumentBody(body);

  return { sections, styles, defaultStyle };
}

/**
 * Parse a document body XML string directly (for testing without OPC).
 *
 * @param documentXml - The XML string of document.xml.
 * @param stylesXml - Optional XML string of styles.xml.
 */
export function parseDocumentFromXml(bodyEl: XmlElement, stylesEl?: XmlElement): DocumentIR {
  let styles: StyleMap = new Map();
  let defaultStyle = undefined;

  if (stylesEl !== undefined) {
    styles = parseStyles(stylesEl);
    defaultStyle = parseDocDefaults(stylesEl);
  }

  const sections = parseDocumentBody(bodyEl);
  return { sections, styles, defaultStyle };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse the `<w:body>` element into sections.
 *
 * Paragraphs are grouped into sections based on `<w:sectPr>` elements.
 * Section breaks can appear:
 * 1. Inside `<w:pPr>` of a paragraph (mid-document section break)
 * 2. As the last child of `<w:body>` (final section properties)
 */
function parseDocumentBody(body: XmlElement): SectionIR[] {
  const sections: SectionIR[] = [];
  let currentParagraphs: ParagraphIR[] = [];
  let currentBlocks: BlockElement[] = [];

  function commitSection(dims: ReturnType<typeof parseSectionProperties>): void {
    sections.push({ ...dims, paragraphs: currentParagraphs, blocks: currentBlocks });
    currentParagraphs = [];
    currentBlocks = [];
  }

  for (const child of body.children) {
    if (child.is('w:p')) {
      const para = parseParagraph(child);

      // Check for section break in paragraph properties
      const pPr = child.child('w:pPr');
      const sectPr = pPr?.child('w:sectPr');

      currentParagraphs.push(para);
      currentBlocks.push({ kind: 'paragraph', paragraph: para });

      if (sectPr !== undefined) {
        // This paragraph ends the current section
        const dims = parseSectionProperties(sectPr);
        commitSection(dims);
      }
    } else if (child.is('w:tbl')) {
      const table = parseTable(child);
      currentBlocks.push({ kind: 'table', table });
    } else if (child.is('w:sectPr')) {
      // Final section properties (last child of body)
      const dims = parseSectionProperties(child);
      commitSection(dims);
    }
  }

  // If there are remaining elements without a trailing sectPr,
  // create a section with default dimensions
  if (currentParagraphs.length > 0 || currentBlocks.length > 0) {
    const dims = defaultSectionDimensions();
    commitSection(dims);
  }

  // Edge case: empty document gets one empty section
  if (sections.length === 0) {
    const dims = defaultSectionDimensions();
    sections.push({ ...dims, paragraphs: [], blocks: [] });
  }

  return sections;
}

/**
 * Attempt to parse styles.xml from the package.
 *
 * Falls back to empty styles if the file is not present.
 */
async function parseStylesFromPackage(
  pkg: OpcPackage,
  documentPartUri: string
): Promise<{ styles: StyleMap; defaultStyle?: DocumentIR['defaultStyle'] }> {
  try {
    const rels = await pkg.getPartRelationships(documentPartUri);
    const stylesRel = rels.getByType(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles'
    )[0];

    if (stylesRel === undefined) {
      return { styles: new Map() };
    }

    const stylesXml = await pkg.getPartXml(stylesRel.target);
    const styles = parseStyles(stylesXml);
    const defaultStyle = parseDocDefaults(stylesXml);

    return { styles, defaultStyle };
  } catch {
    return { styles: new Map() };
  }
}
