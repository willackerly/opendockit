/**
 * Text patcher — patches `<a:txBody>` text content.
 *
 * Strategy: replace `<a:t>` text content within existing runs.
 * For simple edits (same paragraph/run count), preserve all formatting.
 * For structural changes, rebuild paragraphs while preserving templates.
 */

import type { EditableTextBody, EditableParagraph } from '../editable-types.js';

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

/**
 * Patch the text body of a shape element with edited text.
 *
 * When paragraph and run counts match the original, all formatting
 * (run properties, paragraph properties, list styles) is preserved.
 * When counts differ, new elements are created using template properties
 * from the first existing element.
 */
export function patchTextBody(
  txBodyEl: Element,
  textEdits: EditableTextBody
): void {
  // Collect existing <a:p> elements (direct children only)
  const existingParas: Element[] = [];
  for (let i = 0; i < txBodyEl.childNodes.length; i++) {
    const child = txBodyEl.childNodes[i];
    if (child.nodeType === 1 && (child as Element).localName === 'p') {
      existingParas.push(child as Element);
    }
  }

  const editParas = textEdits.paragraphs;

  // Same number of paragraphs: patch in place (preserves formatting)
  if (existingParas.length === editParas.length) {
    for (let pi = 0; pi < editParas.length; pi++) {
      patchParagraph(existingParas[pi], editParas[pi]);
    }
  } else {
    // Structural change: remove old paragraphs, create new ones
    const templatePPr =
      existingParas.length > 0
        ? findChildByLocalName(existingParas[0], 'pPr')
        : null;

    // Get a template run properties from the first run of the first paragraph
    const templateRPr = getTemplateRunProperties(existingParas);

    // Remove existing paragraphs
    for (const para of existingParas) {
      txBodyEl.removeChild(para);
    }

    // Create new paragraphs
    const doc = txBodyEl.ownerDocument!;

    for (const editPara of editParas) {
      const pEl = doc.createElementNS(NS_A, 'a:p');

      // Clone template paragraph properties if available
      if (templatePPr) {
        pEl.appendChild(templatePPr.cloneNode(true));
      }

      for (const run of editPara.runs) {
        const rEl = doc.createElementNS(NS_A, 'a:r');
        if (templateRPr) {
          rEl.appendChild(templateRPr.cloneNode(true));
        }
        const tEl = doc.createElementNS(NS_A, 'a:t');
        tEl.textContent = run.text;
        rEl.appendChild(tEl);
        pEl.appendChild(rEl);
      }

      txBodyEl.appendChild(pEl);
    }
  }
}

function patchParagraph(
  paraEl: Element,
  editPara: EditableParagraph
): void {
  // Find existing <a:r> elements (direct children only)
  const existingRuns: Element[] = [];
  for (let i = 0; i < paraEl.childNodes.length; i++) {
    const child = paraEl.childNodes[i];
    if (child.nodeType === 1 && (child as Element).localName === 'r') {
      existingRuns.push(child as Element);
    }
  }

  // Same number of runs: patch <a:t> text in place (preserve formatting)
  if (existingRuns.length === editPara.runs.length) {
    for (let ri = 0; ri < editPara.runs.length; ri++) {
      const tEl = findChildByLocalName(existingRuns[ri], 't');
      if (tEl) {
        tEl.textContent = editPara.runs[ri].text;
      }
    }
  } else {
    // Different run count: rebuild (loses per-run formatting for extra/removed runs)
    const doc = paraEl.ownerDocument!;

    // Get template run properties from first existing run (if any)
    const templateRPr =
      existingRuns.length > 0
        ? findChildByLocalName(existingRuns[0], 'rPr')
        : null;

    // Remove old runs
    for (const run of existingRuns) {
      paraEl.removeChild(run);
    }

    // Create new runs
    for (const editRun of editPara.runs) {
      const rEl = doc.createElementNS(NS_A, 'a:r');
      if (templateRPr) {
        rEl.appendChild(templateRPr.cloneNode(true));
      }
      const tEl = doc.createElementNS(NS_A, 'a:t');
      tEl.textContent = editRun.text;
      rEl.appendChild(tEl);
      paraEl.appendChild(rEl);
    }
  }
}

/**
 * Extract template run properties from the first run of the first paragraph.
 */
function getTemplateRunProperties(
  existingParas: Element[]
): Element | null {
  if (existingParas.length === 0) return null;
  for (let i = 0; i < existingParas[0].childNodes.length; i++) {
    const child = existingParas[0].childNodes[i];
    if (child.nodeType === 1 && (child as Element).localName === 'r') {
      return findChildByLocalName(child as Element, 'rPr');
    }
  }
  return null;
}

function findChildByLocalName(el: Element, localName: string): Element | null {
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child.nodeType === 1 && (child as Element).localName === localName) {
      return child as Element;
    }
  }
  return null;
}
