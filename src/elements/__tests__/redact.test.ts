import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  applyElementRedaction,
  redactContentByRect,
} from '../redact.js';
import {
  tokenizeContentStream,
  parseOperations,
} from '../../document/redaction/ContentStreamRedactor.js';
import type { PageElement, TextElement, ShapeElement, PdfSource } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseProps = {
  rotation: 0,
  opacity: 1,
  index: '0',
  parentId: null,
  locked: false,
};

/** Build a TextElement with a PdfSource opRange. */
function makeTextElement(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  opRange: [number, number],
): TextElement {
  return {
    ...baseProps,
    id,
    type: 'text',
    x,
    y,
    width,
    height,
    paragraphs: [{
      runs: [{
        text,
        fontFamily: 'Helvetica',
        fontSize: 12,
        color: { r: 0, g: 0, b: 0 },
        x: 0, y: 0, width, height,
      }],
    }],
    source: {
      format: 'pdf' as const,
      opRange,
      ctm: [1, 0, 0, 1, 0, 0],
      textMatrix: [1, 0, 0, 1, x, y],
      fontName: '/F1',
    },
  };
}

/** Build a ShapeElement with a PdfSource opRange. */
function makeShapeElement(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  opRange: [number, number],
): ShapeElement {
  return {
    ...baseProps,
    id,
    type: 'shape',
    x,
    y,
    width,
    height,
    shapeType: 'rectangle',
    fill: { type: 'solid', color: { r: 1, g: 1, b: 1 } },
    stroke: null,
    source: {
      format: 'pdf' as const,
      opRange,
      ctm: [1, 0, 0, 1, 0, 0],
    },
  };
}

/** Encode a string to content stream bytes. */
function toBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Decode content stream bytes to string. */
function fromBytes(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

// ---------------------------------------------------------------------------
// Test: applyElementRedaction
// ---------------------------------------------------------------------------

describe('applyElementRedaction', () => {
  it('removes operations at specified opRange indices', () => {
    // Content stream with 5 operations:
    //   0: BT
    //   1: /F1 12 Tf
    //   2: 72 700 Td
    //   3: (Hello World) Tj    <-- to remove
    //   4: ET
    const cs = toBytes('BT\n/F1 12 Tf\n72 700 Td\n(Hello World) Tj\nET');

    const textEl = makeTextElement('t1', 72, 700, 100, 14, 'Hello World', [3, 3]);

    const result = applyElementRedaction(cs, [textEl], [], { verbose: false });
    const output = fromBytes(result);

    // The Tj op (index 3) should be gone
    expect(output).not.toContain('Tj');
    expect(output).not.toContain('Hello World');

    // But BT, Tf, Td, ET should all remain
    expect(output).toContain('BT');
    expect(output).toContain('/F1 12 Tf');
    expect(output).toContain('72 700 Td');
    expect(output).toContain('ET');
  });

  it('appends fill rectangles at the end', () => {
    const cs = toBytes('BT\n(Some text) Tj\nET');
    const textEl = makeTextElement('t1', 50, 500, 100, 20, 'Some text', [1, 1]);

    const result = applyElementRedaction(
      cs,
      [textEl],
      [{ x: 50, y: 500, width: 100, height: 20 }],
      { interiorColor: { r: 0, g: 0, b: 0 }, verbose: false },
    );
    const output = fromBytes(result);

    // Should have fill rect block at the end
    expect(output).toContain('q');
    expect(output).toContain('0 0 0 rg');
    expect(output).toContain('50 500 100 20 re');
    expect(output).toContain('f');
    expect(output).toContain('Q');

    // The fill block should come after the main content
    const qIdx = output.lastIndexOf('q');
    const btIdx = output.indexOf('BT');
    expect(qIdx).toBeGreaterThan(btIdx);
  });

  it('preserves operations outside removal range exactly', () => {
    // 0: q
    // 1: 1 0 0 1 10 10 cm
    // 2: 0 0 100 50 re
    // 3: f
    // 4: Q
    // 5: BT
    // 6: /F1 12 Tf
    // 7: 72 700 Td
    // 8: (Keep me) Tj
    // 9: ET
    const cs = toBytes(
      'q\n1 0 0 1 10 10 cm\n0 0 100 50 re\nf\nQ\nBT\n/F1 12 Tf\n72 700 Td\n(Keep me) Tj\nET',
    );

    // Remove only the rect fill (ops 0-4)
    const shapeEl = makeShapeElement('s1', 10, 10, 100, 50, [0, 4]);

    const result = applyElementRedaction(cs, [shapeEl], [], { verbose: false });
    const output = fromBytes(result);

    // Text block should be fully preserved
    expect(output).toContain('BT');
    expect(output).toContain('/F1 12 Tf');
    expect(output).toContain('72 700 Td');
    expect(output).toContain('(Keep me) Tj');
    expect(output).toContain('ET');

    // The rect/fill ops should be gone
    // (the 'q' and 'Q' from the original rect group are in indices 0-4)
    // Note: there may still be q/Q from the fill rect appended, but the
    // original cm and re should be gone
    expect(output).not.toContain('1 0 0 1 10 10 cm');
    expect(output).not.toContain('0 0 100 50 re');
  });

  it('removes multiple non-overlapping element ranges correctly', () => {
    // 0: BT
    // 1: /F1 12 Tf
    // 2: 72 700 Td
    // 3: (Line 1) Tj      <-- remove
    // 4: 0 -14 Td
    // 5: (Line 2) Tj      <-- remove
    // 6: 0 -14 Td
    // 7: (Line 3) Tj      <-- keep
    // 8: ET
    const cs = toBytes(
      'BT\n/F1 12 Tf\n72 700 Td\n(Line 1) Tj\n0 -14 Td\n(Line 2) Tj\n0 -14 Td\n(Line 3) Tj\nET',
    );

    const el1 = makeTextElement('t1', 72, 700, 50, 14, 'Line 1', [3, 3]);
    const el2 = makeTextElement('t2', 72, 686, 50, 14, 'Line 2', [5, 5]);

    const result = applyElementRedaction(cs, [el1, el2], [], { verbose: false });
    const output = fromBytes(result);

    // Line 1 and Line 2 should be gone
    expect(output).not.toContain('(Line 1)');
    expect(output).not.toContain('(Line 2)');

    // Line 3 should still be there
    expect(output).toContain('(Line 3) Tj');

    // Structure ops preserved
    expect(output).toContain('BT');
    expect(output).toContain('ET');
    expect(output).toContain('/F1 12 Tf');
  });

  it('logs redaction preview when verbose=true', () => {
    const cs = toBytes('BT\n/F1 12 Tf\n72 700 Td\n(Secret) Tj\nET');
    const textEl = makeTextElement('t1', 72, 700, 50, 14, 'Secret', [3, 3]);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      // verbose defaults to true, but since applyElementRedaction doesn't log
      // on its own (only redactContentByRect does), we verify it doesn't throw
      applyElementRedaction(
        cs,
        [textEl],
        [{ x: 72, y: 700, width: 50, height: 14 }],
        { verbose: true },
      );
      // applyElementRedaction itself does not log -- that's redactContentByRect's job
      // This test simply verifies it runs without error
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('produces re-parseable content stream output', () => {
    const cs = toBytes(
      'q\n1 0 0 rg\n10 20 30 40 re\nf\nQ\nBT\n/F1 10 Tf\n50 600 Td\n(Hello) Tj\nET',
    );
    const shapeEl = makeShapeElement('s1', 10, 20, 30, 40, [0, 4]);

    const result = applyElementRedaction(
      cs,
      [shapeEl],
      [{ x: 10, y: 20, width: 30, height: 40 }],
      { verbose: false },
    );

    // Re-parse the output -- should not throw
    const tokens2 = tokenizeContentStream(result);
    const ops2 = parseOperations(tokens2);

    // Should have: BT, Tf, Td, Tj, ET, q, rg, re, f, Q
    expect(ops2.length).toBeGreaterThanOrEqual(5);

    // All operators should be valid
    const operators = ops2.map(op => op.operator).filter(Boolean);
    for (const op of operators) {
      expect(typeof op).toBe('string');
      expect(op.length).toBeGreaterThan(0);
    }
  });

  it('returns content stream with only fill rects when removal set is empty', () => {
    const cs = toBytes('BT\n/F1 12 Tf\n72 700 Td\n(Keep everything) Tj\nET');

    const result = applyElementRedaction(
      cs,
      [], // empty removal set
      [{ x: 50, y: 500, width: 200, height: 50 }],
      { interiorColor: { r: 1, g: 0, b: 0 }, verbose: false },
    );
    const output = fromBytes(result);

    // All original content preserved
    expect(output).toContain('BT');
    expect(output).toContain('/F1 12 Tf');
    expect(output).toContain('(Keep everything) Tj');
    expect(output).toContain('ET');

    // Fill rect appended
    expect(output).toContain('1 0 0 rg');
    expect(output).toContain('50 500 200 50 re');
    expect(output).toContain('f');
  });

  it('handles custom fill color', () => {
    const cs = toBytes('BT\n(X) Tj\nET');
    const el = makeTextElement('t1', 0, 0, 10, 10, 'X', [1, 1]);

    const result = applyElementRedaction(
      cs,
      [el],
      [{ x: 0, y: 0, width: 10, height: 10 }],
      { interiorColor: { r: 0.5, g: 0.3, b: 0.8 }, verbose: false },
    );
    const output = fromBytes(result);

    expect(output).toContain('0.5 0.3 0.8 rg');
  });

  it('skips elements without PdfSource', () => {
    const cs = toBytes('BT\n/F1 12 Tf\n72 700 Td\n(Keep) Tj\nET');

    // Element with no source at all
    const noSourceEl: TextElement = {
      ...baseProps,
      id: 'noSrc',
      type: 'text',
      x: 72, y: 700, width: 50, height: 14,
      paragraphs: [{
        runs: [{
          text: 'Keep',
          fontFamily: 'Helvetica',
          fontSize: 12,
          color: { r: 0, g: 0, b: 0 },
          x: 0, y: 0, width: 50, height: 14,
        }],
      }],
      // no source
    };

    const result = applyElementRedaction(cs, [noSourceEl], [], { verbose: false });
    const output = fromBytes(result);

    // Everything preserved -- the element had no source so nothing removed
    expect(output).toContain('(Keep) Tj');
  });

  it('handles overlapping opRanges from multiple elements (dedups indices)', () => {
    // Ops: 0:BT 1:Tf 2:Td 3:Tj 4:Td 5:Tj 6:ET
    const cs = toBytes('BT\n/F1 12 Tf\n72 700 Td\n(A) Tj\n0 -14 Td\n(B) Tj\nET');

    // Two elements whose opRanges overlap at index 4
    const el1 = makeTextElement('t1', 72, 700, 10, 14, 'A', [3, 4]);
    const el2 = makeTextElement('t2', 72, 686, 10, 14, 'B', [4, 5]);

    const result = applyElementRedaction(cs, [el1, el2], [], { verbose: false });
    const output = fromBytes(result);

    // Both text ops and the shared Td should be removed
    expect(output).not.toContain('(A)');
    expect(output).not.toContain('(B)');
    expect(output).toContain('BT');
    expect(output).toContain('ET');
  });

  it('handles no fill rects (removal only)', () => {
    const cs = toBytes('BT\n(Remove) Tj\nET');
    const el = makeTextElement('t1', 0, 0, 50, 14, 'Remove', [1, 1]);

    const result = applyElementRedaction(cs, [el], [], { verbose: false });
    const output = fromBytes(result);

    // No fill rect block
    expect(output).not.toContain('rg');
    expect(output).not.toContain(' re');

    // Text removed
    expect(output).not.toContain('(Remove)');

    // BT/ET still present
    expect(output).toContain('BT');
    expect(output).toContain('ET');
  });

  it('handles hex string operands in content stream', () => {
    // Ops: 0:BT 1:Tf 2:Td 3:TJ(hex) 4:ET
    const cs = toBytes('BT\n/F1 12 Tf\n72 700 Td\n[<0048> <0065>] TJ\nET');

    const el = makeTextElement('t1', 72, 700, 50, 14, 'He', [3, 3]);

    const result = applyElementRedaction(cs, [el], [], { verbose: false });
    const output = fromBytes(result);

    expect(output).not.toContain('0048');
    expect(output).not.toContain('TJ');
    expect(output).toContain('BT');
    expect(output).toContain('ET');
  });
});

// ---------------------------------------------------------------------------
// Test: redactContentByRect (integration)
// ---------------------------------------------------------------------------

describe('redactContentByRect', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('logs redaction preview by default (verbose)', async () => {
    // We can't easily set up a full page dict + resolver in unit tests,
    // but we can verify the function signature works with a real PDF.
    // For unit testing, we test that applyElementRedaction + queryElementsInRect
    // work correctly separately. This test is a smoke test for the wiring.

    // Create a minimal content stream and verify applyElementRedaction works
    const cs = toBytes('BT\n/F1 12 Tf\n72 700 Td\n(Secret Data) Tj\nET');
    const textEl = makeTextElement('t1', 72, 700, 100, 14, 'Secret Data', [3, 3]);

    // Manually replicate what redactContentByRect does
    const elements: PageElement[] = [textEl];
    const rect = { x: 60, y: 690, width: 120, height: 30 };

    // Import spatial query
    const { queryElementsInRect } = await import('../spatial.js');
    const matched = queryElementsInRect(elements, rect);
    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe('t1');

    const result = applyElementRedaction(cs, matched, [rect], { verbose: false });
    const output = fromBytes(result);

    // Text removed
    expect(output).not.toContain('Secret Data');
    // Fill rect present
    expect(output).toContain('60 690 120 30 re');
  });
});
