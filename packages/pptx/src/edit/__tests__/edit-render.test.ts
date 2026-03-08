/**
 * Visual regression tests for the edit → derive → render pipeline.
 *
 * Verifies that edits (move, resize, text, delete) produce correct visual
 * changes in the rendered output using the mock canvas. Tests build
 * EditableElement fixtures directly, use deriveIR() to get modified IR,
 * and render via renderSlide() to verify canvas calls.
 */

import { describe, it, expect } from 'vitest';
import type {
  DrawingMLShapeIR,
  ShapePropertiesIR,
  TransformIR,
  TextBodyIR,
  ParagraphIR,
  RunIR,
  SlideElementIR,
} from '@opendockit/core';
import type {
  EditableShape,
  EditableTransform,
} from '@opendockit/core';
import { deriveIR } from '@opendockit/core';
import type {
  SlideIR,
  SlideLayoutIR,
  SlideMasterIR,
  EnrichedSlideData,
} from '../../model/index.js';
import { renderSlide } from '../../renderer/slide-renderer.js';
import { createMockRenderContext } from '../../renderer/__tests__/mock-canvas.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTransform(overrides?: Partial<TransformIR>): TransformIR {
  return {
    position: { x: 914400, y: 914400 },
    size: { width: 1828800, height: 914400 },
    ...overrides,
  };
}

function makeProperties(overrides?: Partial<ShapePropertiesIR>): ShapePropertiesIR {
  return {
    effects: [],
    ...overrides,
  };
}

function makeShapeIR(overrides?: Partial<DrawingMLShapeIR>): DrawingMLShapeIR {
  return {
    kind: 'shape',
    properties: makeProperties({ transform: makeTransform() }),
    ...overrides,
  };
}

function makeEditableTransform(overrides?: Partial<EditableTransform>): EditableTransform {
  return {
    x: 914400,
    y: 914400,
    width: 1828800,
    height: 914400,
    ...overrides,
  };
}

function makeEditableShape(
  ir: DrawingMLShapeIR,
  overrides?: Partial<EditableShape>
): EditableShape {
  return {
    id: '/ppt/slides/slide1.xml#2',
    kind: 'shape',
    originalIR: Object.freeze(ir) as Readonly<SlideElementIR>,
    originalPartUri: '/ppt/slides/slide1.xml',
    dirty: {},
    transform: makeEditableTransform({
      x: ir.properties?.transform?.position?.x ?? 0,
      y: ir.properties?.transform?.position?.y ?? 0,
      width: ir.properties?.transform?.size?.width ?? 0,
      height: ir.properties?.transform?.size?.height ?? 0,
    }),
    deleted: false,
    ...overrides,
  };
}

function makeTextParagraph(text: string, bold?: boolean): ParagraphIR {
  const run: RunIR = {
    kind: 'run' as const,
    text,
    properties: bold ? { bold: true } : {},
  };
  return { runs: [run], properties: {} };
}

function makeTextBody(text: string): TextBodyIR {
  return {
    bodyProperties: {},
    paragraphs: [makeTextParagraph(text)],
  };
}

const emptyMaster: SlideMasterIR = {
  partUri: '/ppt/slideMasters/slideMaster1.xml',
  elements: [],
  colorMap: {},
};

const emptyLayout: SlideLayoutIR = {
  partUri: '/ppt/slideLayouts/slideLayout1.xml',
  elements: [],
  masterPartUri: '/ppt/slideMasters/slideMaster1.xml',
};

function makeEnriched(elements: SlideElementIR[]): EnrichedSlideData {
  const slide: SlideIR = {
    partUri: '/ppt/slides/slide1.xml',
    elements,
    layoutPartUri: '/ppt/slideLayouts/slideLayout1.xml',
    masterPartUri: '/ppt/slideMasters/slideMaster1.xml',
  };
  return { slide, layout: emptyLayout, master: emptyMaster };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('edit → derive → render pipeline', () => {
  it('move element: canvas translate coordinates shift', () => {
    const ir = makeShapeIR({
      properties: makeProperties({
        transform: makeTransform({
          position: { x: 914400, y: 914400 },
          size: { width: 1828800, height: 914400 },
        }),
      }),
    });

    const editable = makeEditableShape(ir, {
      transform: makeEditableTransform({
        x: 1828800,
        y: 1828800,
        width: 1828800,
        height: 914400,
      }),
      dirty: { position: true },
    });

    const derived = deriveIR(editable) as DrawingMLShapeIR;

    // Verify the derived IR has the new position
    expect(derived.properties.transform?.position?.x).toBe(1828800);
    expect(derived.properties.transform?.position?.y).toBe(1828800);
    // Size should be preserved
    expect(derived.properties.transform?.size?.width).toBe(1828800);

    // Render the moved shape and the original, compare translate calls
    const rctxMoved = createMockRenderContext();
    renderSlide(makeEnriched([derived]), rctxMoved, 960, 540);

    const rctxOrig = createMockRenderContext();
    renderSlide(makeEnriched([ir]), rctxOrig, 960, 540);

    // The renderer translates to (x + w/2, y + h/2) for center-based transform.
    // Compare the first element translate to verify the position shifted by
    // (914400 EMU = 96px at 96 DPI).
    const movedTranslates = rctxMoved.backend._calls.filter((c) => c.method === 'translate');
    const origTranslates = rctxOrig.backend._calls.filter((c) => c.method === 'translate');
    expect(movedTranslates.length).toBeGreaterThanOrEqual(1);
    expect(origTranslates.length).toBeGreaterThanOrEqual(1);

    const [movedTx, movedTy] = movedTranslates[0].args as [number, number];
    const [origTx, origTy] = origTranslates[0].args as [number, number];
    expect(movedTx - origTx).toBeCloseTo(96, 0);
    expect(movedTy - origTy).toBeCloseTo(96, 0);
  });

  it('edit text: new text appears in canvas calls', () => {
    const ir = makeShapeIR({
      properties: makeProperties({
        transform: makeTransform(),
      }),
      textBody: makeTextBody('Original'),
    });

    const editable = makeEditableShape(ir, {
      dirty: { text: true },
      textEdits: {
        paragraphs: [{ runs: [{ text: 'Updated' }] }],
      },
    });

    const derived = deriveIR(editable) as DrawingMLShapeIR;

    // Verify the derived IR has new text
    expect(derived.textBody?.paragraphs[0]?.runs[0]?.text).toBe('Updated');

    // Render and check fillText calls
    const rctx = createMockRenderContext();
    renderSlide(makeEnriched([derived]), rctx, 960, 540);

    const fillTexts = rctx.backend._calls
      .filter((c) => c.method === 'fillText')
      .map((c) => c.args[0] as string);

    expect(fillTexts).toContain('Updated');
    expect(fillTexts).not.toContain('Original');
  });

  it('delete element: shape drawing calls absent', () => {
    const ir1 = makeShapeIR({
      id: 2,
      name: 'Shape1',
      properties: makeProperties({
        transform: makeTransform({
          position: { x: 0, y: 0 },
          size: { width: 914400, height: 914400 },
        }),
        fill: { type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 } },
      }),
    });
    const ir2 = makeShapeIR({
      id: 3,
      name: 'Shape2',
      properties: makeProperties({
        transform: makeTransform({
          position: { x: 2000000, y: 0 },
          size: { width: 914400, height: 914400 },
        }),
        fill: { type: 'solid', color: { r: 0, g: 0, b: 255, a: 1 } },
      }),
    });

    // Delete shape 1
    const editable1 = makeEditableShape(ir1, {
      deleted: true,
      dirty: { deleted: true },
    });

    const derived1 = deriveIR(editable1);
    const editable2 = makeEditableShape(ir2);
    const derived2 = deriveIR(editable2);

    // Deleted element returns UnsupportedIR
    expect(derived1.kind).toBe('unsupported');

    // Only render non-deleted elements
    const renderableElements = [derived1, derived2].filter(
      (el) => el.kind !== 'unsupported'
    );

    const rctx = createMockRenderContext();
    renderSlide(makeEnriched(renderableElements), rctx, 960, 540);

    // Should have exactly 1 element's save/restore pair (background + 1 shape)
    const saves = rctx.backend._calls.filter((c) => c.method === 'save');
    const restores = rctx.backend._calls.filter((c) => c.method === 'restore');
    // 1 save/restore for the surviving shape
    expect(saves).toHaveLength(1);
    expect(restores).toHaveLength(1);
  });

  it('resize element: canvas dimensions change', () => {
    const ir = makeShapeIR({
      properties: makeProperties({
        transform: makeTransform({
          position: { x: 914400, y: 914400 },
          size: { width: 1828800, height: 914400 }, // 2 x 1 inch
        }),
      }),
    });

    const editable = makeEditableShape(ir, {
      transform: makeEditableTransform({
        x: 914400,
        y: 914400,
        width: 3657600, // 4 inches
        height: 1828800, // 2 inches
      }),
      dirty: { size: true },
    });

    const derived = deriveIR(editable) as DrawingMLShapeIR;

    // Verify the derived IR has new size
    expect(derived.properties.transform?.size?.width).toBe(3657600);
    expect(derived.properties.transform?.size?.height).toBe(1828800);
    // Position should be preserved
    expect(derived.properties.transform?.position?.x).toBe(914400);

    // Render both and verify they produce different canvas outputs
    const rctxResized = createMockRenderContext();
    renderSlide(makeEnriched([derived]), rctxResized, 960, 540);

    const rctxOrig = createMockRenderContext();
    renderSlide(makeEnriched([ir]), rctxOrig, 960, 540);

    // Both should render (produce translate calls for element)
    expect(rctxResized.backend._calls.filter((c) => c.method === 'translate').length).toBeGreaterThan(0);
    expect(rctxOrig.backend._calls.filter((c) => c.method === 'translate').length).toBeGreaterThan(0);

    // The translate calls should differ because w/2 changed
    const resizedTranslates = rctxResized.backend._calls.filter((c) => c.method === 'translate');
    const origTranslates = rctxOrig.backend._calls.filter((c) => c.method === 'translate');
    const [rtx] = resizedTranslates[0].args as [number, number];
    const [otx] = origTranslates[0].args as [number, number];
    // The first translate encodes (x + w/2), so resized should differ
    expect(rtx).not.toBeCloseTo(otx, 0);
  });

  it('no edit: identical rendering (fast path)', () => {
    const ir = makeShapeIR({
      properties: makeProperties({
        transform: makeTransform(),
      }),
      textBody: makeTextBody('Hello World'),
    });

    const editable = makeEditableShape(ir);
    const derived = deriveIR(editable);

    // Fast path: returns the exact same object reference
    expect(derived).toBe(ir);

    // Render both and verify identical call sequences
    const rctx1 = createMockRenderContext();
    renderSlide(makeEnriched([ir]), rctx1, 960, 540);

    const rctx2 = createMockRenderContext();
    renderSlide(makeEnriched([derived]), rctx2, 960, 540);

    // Call sequences should be identical
    expect(JSON.stringify(rctx1.backend._calls)).toBe(JSON.stringify(rctx2.backend._calls));
  });

  it('combined move + text edit: both changes visible', () => {
    const ir = makeShapeIR({
      properties: makeProperties({
        transform: makeTransform({
          position: { x: 0, y: 0 },
          size: { width: 1828800, height: 914400 },
        }),
      }),
      textBody: makeTextBody('Before'),
    });

    const editable = makeEditableShape(ir, {
      transform: makeEditableTransform({
        x: 914400, // moved 1 inch right
        y: 914400, // moved 1 inch down
        width: 1828800,
        height: 914400,
      }),
      dirty: { position: true, text: true },
      textEdits: {
        paragraphs: [{ runs: [{ text: 'After' }] }],
      },
    });

    const derived = deriveIR(editable) as DrawingMLShapeIR;

    // Verify both changes in derived IR
    expect(derived.properties.transform?.position?.x).toBe(914400);
    expect(derived.properties.transform?.position?.y).toBe(914400);
    expect(derived.textBody?.paragraphs[0]?.runs[0]?.text).toBe('After');

    // Render moved+edited and original, compare
    const rctxEdited = createMockRenderContext();
    renderSlide(makeEnriched([derived]), rctxEdited, 960, 540);

    const rctxOrig = createMockRenderContext();
    renderSlide(makeEnriched([ir]), rctxOrig, 960, 540);

    // Position shifted by 96px (914400 EMU)
    const editedTranslates = rctxEdited.backend._calls.filter((c) => c.method === 'translate');
    const origTranslates = rctxOrig.backend._calls.filter((c) => c.method === 'translate');
    expect(editedTranslates.length).toBeGreaterThanOrEqual(1);
    expect(origTranslates.length).toBeGreaterThanOrEqual(1);

    const [etx, ety] = editedTranslates[0].args as [number, number];
    const [otx, oty] = origTranslates[0].args as [number, number];
    expect(etx - otx).toBeCloseTo(96, 0);
    expect(ety - oty).toBeCloseTo(96, 0);

    // Text changed
    const fillTexts = rctxEdited.backend._calls
      .filter((c) => c.method === 'fillText')
      .map((c) => c.args[0] as string);
    expect(fillTexts).toContain('After');
    expect(fillTexts).not.toContain('Before');
  });
});
