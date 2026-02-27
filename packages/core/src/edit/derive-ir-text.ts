/**
 * Text body derivation — converts EditableTextBody back to TextBodyIR.
 *
 * Preserves the original bodyProperties and listStyle (only the paragraph
 * content is replaced). For runs with no explicit properties, the original
 * run's properties are used as a template (if available).
 */

import type {
  TextBodyIR,
  ParagraphIR,
  RunIR,
  CharacterPropertiesIR,
  DrawingMLShapeIR,
} from '../ir/index.js';
import type { EditableShape, EditableParagraph, EditableTextRun } from './editable-types.js';

/**
 * Derive a TextBodyIR from an editable shape's text edits.
 *
 * If the shape has no textEdits, returns the original text body unchanged.
 */
export function deriveTextBodyIR(editable: EditableShape): TextBodyIR | undefined {
  if (!editable.textEdits) {
    return (editable.originalIR as DrawingMLShapeIR).textBody;
  }

  const origTextBody = (editable.originalIR as DrawingMLShapeIR).textBody;

  const paragraphs: ParagraphIR[] = editable.textEdits.paragraphs.map((editPara, pi) =>
    deriveParagraph(editPara, origTextBody?.paragraphs?.[pi]),
  );

  return {
    paragraphs,
    bodyProperties: origTextBody?.bodyProperties ?? {},
    listStyle: origTextBody?.listStyle,
  };
}

function deriveParagraph(editPara: EditableParagraph, origPara?: ParagraphIR): ParagraphIR {
  const runs: RunIR[] = editPara.runs.map((editRun, ri) => deriveRun(editRun, origPara, ri));

  return {
    runs,
    properties: origPara?.properties ?? {},
    endParaProperties: origPara?.endParaProperties,
  };
}

function deriveRun(
  editRun: EditableTextRun,
  origPara: ParagraphIR | undefined,
  runIndex: number,
): RunIR {
  // Try to get template properties from the original run at the same index
  const origRun = origPara?.runs?.[runIndex];
  const templateProps: CharacterPropertiesIR | undefined =
    origRun && origRun.kind === 'run' ? origRun.properties : undefined;

  return {
    kind: 'run',
    text: editRun.text,
    properties: editRun.properties ?? templateProps ?? {},
  };
}
