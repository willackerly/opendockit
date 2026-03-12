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
// Table-level IR
// ---------------------------------------------------------------------------

/** Border style for table/cell borders. */
export interface BorderIR {
  /** Border width in points. */
  width: number;
  /** Border color as hex RGB string (e.g., '000000'). */
  color: string;
  /** Border style (e.g., 'single', 'double', 'dashed'). */
  style: string;
}

/** Set of borders (top, bottom, left, right). */
export interface BordersIR {
  top?: BorderIR;
  bottom?: BorderIR;
  left?: BorderIR;
  right?: BorderIR;
  insideH?: BorderIR;
  insideV?: BorderIR;
}

/** Cell margin/padding in points. */
export interface CellMarginsIR {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Vertical alignment within a table cell. */
export type CellVerticalAlignment = 'top' | 'center' | 'bottom';

/** Intermediate representation for a single table cell. */
export interface TableCellIR {
  /** Paragraphs within this cell. */
  paragraphs: ParagraphIR[];
  /** Cell width in points (from w:tcPr/w:tcW). */
  width?: number;
  /** Horizontal merge: 'restart' starts a new span, 'continue' continues it. */
  hMerge?: 'restart' | 'continue';
  /** Vertical merge: 'restart' starts a new span, 'continue' continues it. */
  vMerge?: 'restart' | 'continue';
  /** Column span (resolved from hMerge). */
  colSpan: number;
  /** Cell borders (override table borders). */
  borders?: BordersIR;
  /** Cell margins/padding. */
  margins?: CellMarginsIR;
  /** Vertical alignment of content within the cell. */
  vAlign?: CellVerticalAlignment;
}

/** Intermediate representation for a single table row. */
export interface TableRowIR {
  /** Cells in this row. */
  cells: TableCellIR[];
  /** Minimum row height in points (from w:trPr/w:trHeight). */
  minHeight?: number;
  /** Whether the row height is exact (vs. at-least). */
  exactHeight?: boolean;
}

/** Intermediate representation for a table. */
export interface TableIR {
  /** Table rows. */
  rows: TableRowIR[];
  /** Column widths in points from w:tblGrid/w:gridCol. */
  gridColWidths: number[];
  /** Table-level borders. */
  borders?: BordersIR;
  /** Table width in points. */
  width?: number;
  /** Table alignment within the page. */
  alignment?: ParagraphAlignment;
  /** Default cell margins. */
  defaultCellMargins?: CellMarginsIR;
}

// ---------------------------------------------------------------------------
// Block-level content elements
// ---------------------------------------------------------------------------

/** A paragraph block element. */
export interface ParagraphBlock {
  kind: 'paragraph';
  paragraph: ParagraphIR;
}

/** A table block element. */
export interface TableBlock {
  kind: 'table';
  table: TableIR;
}

/** Union of all block-level elements in a section. */
export type BlockElement = ParagraphBlock | TableBlock;

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
  /** Paragraphs in this section (legacy — use blocks for mixed content). */
  paragraphs: ParagraphIR[];
  /** Block-level elements (paragraphs and tables) in document order. */
  blocks: BlockElement[];
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
