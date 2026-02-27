import { describe, it, expect } from 'vitest';
import { parseXmlDom, serializeXmlDom } from '../dom-utils.js';
import { patchTextBody } from '../text-patcher.js';
import type { EditableTextBody } from '../../editable-types.js';

/**
 * Helper to find the first <a:txBody> (or <p:txBody>) in a parsed document.
 */
function findTxBody(doc: Document): Element {
  const allElements = doc.getElementsByTagName('*');
  for (let i = 0; i < allElements.length; i++) {
    if (allElements[i].localName === 'txBody') {
      return allElements[i];
    }
  }
  throw new Error('No txBody found in document');
}

/**
 * Helper to extract all text content from <a:t> elements in a txBody.
 */
function extractTexts(txBody: Element): string[][] {
  const result: string[][] = [];
  for (let pi = 0; pi < txBody.childNodes.length; pi++) {
    const pNode = txBody.childNodes[pi];
    if (pNode.nodeType !== 1 || (pNode as Element).localName !== 'p') continue;
    const runs: string[] = [];
    for (let ri = 0; ri < pNode.childNodes.length; ri++) {
      const rNode = pNode.childNodes[ri];
      if (rNode.nodeType !== 1 || (rNode as Element).localName !== 'r')
        continue;
      for (let ti = 0; ti < rNode.childNodes.length; ti++) {
        const tNode = rNode.childNodes[ti];
        if (tNode.nodeType === 1 && (tNode as Element).localName === 't') {
          runs.push(tNode.textContent || '');
        }
      }
    }
    result.push(runs);
  }
  return result;
}

/** Simple text body with one paragraph and one run. */
const SIMPLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sp xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:txBody>
    <a:bodyPr/>
    <a:p>
      <a:r>
        <a:rPr lang="en-US" dirty="0" b="1"/>
        <a:t>Hello</a:t>
      </a:r>
    </a:p>
  </p:txBody>
</p:sp>`;

/** Text body with multiple runs in one paragraph. */
const MULTI_RUN_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sp xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:txBody>
    <a:bodyPr/>
    <a:p>
      <a:pPr algn="ctr"/>
      <a:r>
        <a:rPr lang="en-US" b="1"/>
        <a:t>Bold</a:t>
      </a:r>
      <a:r>
        <a:rPr lang="en-US" i="1"/>
        <a:t> Italic</a:t>
      </a:r>
    </a:p>
  </p:txBody>
</p:sp>`;

/** Text body with multiple paragraphs. */
const MULTI_PARA_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sp xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:txBody>
    <a:bodyPr/>
    <a:p>
      <a:r>
        <a:rPr lang="en-US"/>
        <a:t>First paragraph</a:t>
      </a:r>
    </a:p>
    <a:p>
      <a:r>
        <a:rPr lang="en-US"/>
        <a:t>Second paragraph</a:t>
      </a:r>
    </a:p>
  </p:txBody>
</p:sp>`;

/** Empty text body — no paragraphs. */
const EMPTY_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sp xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:txBody>
    <a:bodyPr/>
  </p:txBody>
</p:sp>`;

describe('patchTextBody', () => {
  it('replaces text in a single run while preserving formatting', () => {
    const doc = parseXmlDom(SIMPLE_XML);
    const txBody = findTxBody(doc);

    const edits: EditableTextBody = {
      paragraphs: [{ runs: [{ text: 'World' }] }],
    };

    patchTextBody(txBody, edits);

    // Text should be replaced
    const texts = extractTexts(txBody);
    expect(texts).toEqual([['World']]);

    // Formatting should be preserved (check rPr attributes)
    const serialized = serializeXmlDom(doc);
    expect(serialized).toContain('lang="en-US"');
    expect(serialized).toContain('dirty="0"');
    expect(serialized).toContain('b="1"');
  });

  it('replaces text in multiple runs while preserving per-run formatting', () => {
    const doc = parseXmlDom(MULTI_RUN_XML);
    const txBody = findTxBody(doc);

    const edits: EditableTextBody = {
      paragraphs: [
        {
          runs: [{ text: 'New Bold' }, { text: ' New Italic' }],
        },
      ],
    };

    patchTextBody(txBody, edits);

    const texts = extractTexts(txBody);
    expect(texts).toEqual([['New Bold', ' New Italic']]);

    // Both run properties should be preserved
    const serialized = serializeXmlDom(doc);
    expect(serialized).toContain('b="1"');
    expect(serialized).toContain('i="1"');
    // Paragraph alignment should be preserved
    expect(serialized).toContain('algn="ctr"');
  });

  it('replaces text across multiple paragraphs (same count)', () => {
    const doc = parseXmlDom(MULTI_PARA_XML);
    const txBody = findTxBody(doc);

    const edits: EditableTextBody = {
      paragraphs: [
        { runs: [{ text: 'Updated first' }] },
        { runs: [{ text: 'Updated second' }] },
      ],
    };

    patchTextBody(txBody, edits);

    const texts = extractTexts(txBody);
    expect(texts).toEqual([['Updated first'], ['Updated second']]);
  });

  it('handles paragraph count increase (structural change)', () => {
    const doc = parseXmlDom(SIMPLE_XML);
    const txBody = findTxBody(doc);

    const edits: EditableTextBody = {
      paragraphs: [
        { runs: [{ text: 'Line 1' }] },
        { runs: [{ text: 'Line 2' }] },
        { runs: [{ text: 'Line 3' }] },
      ],
    };

    patchTextBody(txBody, edits);

    const texts = extractTexts(txBody);
    expect(texts).toEqual([['Line 1'], ['Line 2'], ['Line 3']]);
  });

  it('handles paragraph count decrease (structural change)', () => {
    const doc = parseXmlDom(MULTI_PARA_XML);
    const txBody = findTxBody(doc);

    const edits: EditableTextBody = {
      paragraphs: [{ runs: [{ text: 'Single paragraph now' }] }],
    };

    patchTextBody(txBody, edits);

    const texts = extractTexts(txBody);
    expect(texts).toEqual([['Single paragraph now']]);
  });

  it('handles run count change within a paragraph', () => {
    const doc = parseXmlDom(MULTI_RUN_XML);
    const txBody = findTxBody(doc);

    // Change from 2 runs to 3 runs
    const edits: EditableTextBody = {
      paragraphs: [
        {
          runs: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
        },
      ],
    };

    patchTextBody(txBody, edits);

    const texts = extractTexts(txBody);
    expect(texts).toEqual([['A', 'B', 'C']]);
  });

  it('handles run count decrease within a paragraph', () => {
    const doc = parseXmlDom(MULTI_RUN_XML);
    const txBody = findTxBody(doc);

    // Change from 2 runs to 1 run
    const edits: EditableTextBody = {
      paragraphs: [{ runs: [{ text: 'Combined text' }] }],
    };

    patchTextBody(txBody, edits);

    const texts = extractTexts(txBody);
    expect(texts).toEqual([['Combined text']]);
  });

  it('works with an empty text body (no existing paragraphs)', () => {
    const doc = parseXmlDom(EMPTY_XML);
    const txBody = findTxBody(doc);

    const edits: EditableTextBody = {
      paragraphs: [{ runs: [{ text: 'New text' }] }],
    };

    patchTextBody(txBody, edits);

    const texts = extractTexts(txBody);
    expect(texts).toEqual([['New text']]);
  });

  it('preserves bodyPr element when patching', () => {
    const doc = parseXmlDom(SIMPLE_XML);
    const txBody = findTxBody(doc);

    const edits: EditableTextBody = {
      paragraphs: [{ runs: [{ text: 'Changed' }] }],
    };

    patchTextBody(txBody, edits);

    // bodyPr should still be present
    const serialized = serializeXmlDom(doc);
    expect(serialized).toContain('bodyPr');
  });

  it('handles empty text replacement', () => {
    const doc = parseXmlDom(SIMPLE_XML);
    const txBody = findTxBody(doc);

    const edits: EditableTextBody = {
      paragraphs: [{ runs: [{ text: '' }] }],
    };

    patchTextBody(txBody, edits);

    const texts = extractTexts(txBody);
    expect(texts).toEqual([['']]);
  });
});
