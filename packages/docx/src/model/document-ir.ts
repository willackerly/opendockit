/**
 * Document IR — intermediate representation types for WordprocessingML (DOCX).
 *
 * These types mirror the OOXML WordprocessingML structure at a level of
 * abstraction suitable for layout and rendering. All measurements are in
 * typographic points (1/72") unless otherwise noted.
 *
 * Reference: ECMA-376, Part 1, Section 17 (WordprocessingML).
 */

// ---------------------------------------------------------------------------
// Run-level IR
// ---------------------------------------------------------------------------

/** Intermediate representation for a single run of text with uniform formatting. */
export interface RunIR {
  /** The text content of this run. */
  text: string;
  /** Bold formatting. */
  bold?: boolean;
  /** Italic formatting. */
  italic?: boolean;
  /** Underline formatting. */
  underline?: boolean;
  /** Strikethrough formatting. */
  strikethrough?: boolean;
  /** Font size in points. */
  fontSize?: number;
  /** Font family name (e.g., 'Calibri', 'Arial'). */
  fontFamily?: string;
  /** Text color as hex RGB string (e.g., 'FF0000' for red). */
  color?: string;
  /** Superscript positioning. */
  superscript?: boolean;
  /** Subscript positioning. */
  subscript?: boolean;
}

// ---------------------------------------------------------------------------
// Paragraph-level IR
// ---------------------------------------------------------------------------

/** Text alignment within a paragraph. */
export type ParagraphAlignment = 'left' | 'center' | 'right' | 'justify';

/** Intermediate representation for a single paragraph. */
export interface ParagraphIR {
  /** Runs of text within this paragraph. */
  runs: RunIR[];
  /** Horizontal text alignment. */
  alignment?: ParagraphAlignment;
  /** Space before the paragraph in points. */
  spacingBefore?: number;
  /** Space after the paragraph in points. */
  spacingAfter?: number;
  /** Line spacing multiplier (e.g., 1.0 = single, 1.5 = 1.5x, 2.0 = double). */
  lineSpacing?: number;
  /** Left indentation in points. */
  indentLeft?: number;
  /** Right indentation in points. */
  indentRight?: number;
  /** First-line indent in points (positive = indent, negative = hanging). */
  indentFirstLine?: number;
  /** Bullet/list character (e.g., '\u2022' for bullet). */
  bulletChar?: string;
  /** Numbering level (0-based) for numbered/bulleted lists. */
  numberingLevel?: number;
  /** Style ID reference (e.g., 'Heading1'). */
  styleId?: string;
}

// ---------------------------------------------------------------------------
// Section-level IR
// ---------------------------------------------------------------------------

/** Intermediate representation for a document section (page layout region). */
export interface SectionIR {
  /** Page width in points. */
  pageWidth: number;
  /** Page height in points. */
  pageHeight: number;
  /** Top margin in points. */
  marginTop: number;
  /** Bottom margin in points. */
  marginBottom: number;
  /** Left margin in points. */
  marginLeft: number;
  /** Right margin in points. */
  marginRight: number;
  /** Paragraphs in this section. */
  paragraphs: ParagraphIR[];
}

// ---------------------------------------------------------------------------
// Style IR
// ---------------------------------------------------------------------------

/** Intermediate representation for a paragraph style definition. */
export interface ParagraphStyleIR {
  /** Style display name. */
  name: string;
  /** Parent style ID (for inheritance). */
  basedOn?: string;
  /** Default paragraph alignment. */
  alignment?: ParagraphAlignment;
  /** Default spacing before in points. */
  spacingBefore?: number;
  /** Default spacing after in points. */
  spacingAfter?: number;
  /** Default line spacing multiplier. */
  lineSpacing?: number;
  /** Default run-level properties for this style. */
  runProperties?: Partial<RunIR>;
}

/** Map from style ID to paragraph style definition. */
export type StyleMap = Map<string, ParagraphStyleIR>;

// ---------------------------------------------------------------------------
// Document-level IR
// ---------------------------------------------------------------------------

/** Top-level intermediate representation for an entire DOCX document. */
export interface DocumentIR {
  /** Document sections (each section can have different page layout). */
  sections: SectionIR[];
  /** Parsed style definitions. */
  styles: StyleMap;
  /** Default document-wide paragraph/run style (from w:docDefaults). */
  defaultStyle?: ParagraphStyleIR;
}
