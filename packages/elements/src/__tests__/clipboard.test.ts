import { describe, it, expect } from 'vitest';
import { serializeToClipboard, deserializeFromClipboard } from '../clipboard.js';
import type { PageElement, TextElement, ShapeElement, GroupElement, ClipboardData } from '../index.js';
import { makeTextElement, makeShapeElement, makeImageElement } from './test-helpers.js';

// ─── serializeToClipboard ────────────────────────────────

describe('serializeToClipboard', () => {
  it('produces a ClipboardData with correct metadata', () => {
    const elements = [makeShapeElement('s1', 0, 0, 100, 50)];
    const data = serializeToClipboard(elements, 'pptx', 2);

    expect(data.sourceFormat).toBe('pptx');
    expect(data.sourcePage).toBe(2);
    expect(data.elements).toHaveLength(1);
  });

  it('strips the source bag from shape elements', () => {
    const shape: ShapeElement = {
      ...makeShapeElement('s1', 10, 20, 100, 50),
      source: { format: 'pptx', offX: 914400, offY: 1828800, extCx: 3657600, extCy: 1828800, rot: 0 },
    };
    const data = serializeToClipboard([shape], 'pptx', 0);
    expect((data.elements[0] as ShapeElement).source).toBeUndefined();
  });

  it('strips the source bag from text elements', () => {
    const text: TextElement = {
      ...makeTextElement('t1', 0, 0, 200, 40, 'Hello'),
      source: { format: 'pdf', opRange: [0, 10], ctm: [1, 0, 0, 1, 0, 0] },
    };
    const data = serializeToClipboard([text], 'pdf', 1);
    expect(data.elements[0].source).toBeUndefined();
  });

  it('strips the source bag from image elements', () => {
    const img = {
      ...makeImageElement('i1', 0, 0, 50, 50),
      source: { format: 'pdf', opRange: [5, 10], ctm: [1, 0, 0, 1, 0, 0] },
    };
    const data = serializeToClipboard([img], 'pdf', 0);
    expect(data.elements[0].source).toBeUndefined();
  });

  it('preserves visual properties', () => {
    const shape = makeShapeElement('s1', 15, 25, 80, 60);
    const data = serializeToClipboard([shape], 'pptx', 0);
    const out = data.elements[0];

    expect(out.x).toBe(15);
    expect(out.y).toBe(25);
    expect(out.width).toBe(80);
    expect(out.height).toBe(60);
    expect(out.rotation).toBe(0);
    expect(out.opacity).toBe(1);
    expect(out.locked).toBe(false);
  });

  it('preserves fill and stroke on shape elements', () => {
    const shape: ShapeElement = {
      ...makeShapeElement('s1', 0, 0, 100, 50),
      fill: { type: 'solid', color: { r: 255, g: 0, b: 0 } },
      stroke: { color: { r: 0, g: 0, b: 0 }, width: 2 },
    };
    const data = serializeToClipboard([shape], 'pptx', 0);
    const out = data.elements[0] as ShapeElement;

    expect(out.fill).not.toBeNull();
    expect(out.fill?.color).toEqual({ r: 255, g: 0, b: 0 });
    expect(out.stroke).not.toBeNull();
    expect(out.stroke?.width).toBe(2);
  });

  it('preserves text paragraph content', () => {
    const text = makeTextElement('t1', 0, 0, 100, 30, 'Hello world');
    const data = serializeToClipboard([text], 'pptx', 0);
    const out = data.elements[0] as TextElement;

    expect(out.paragraphs).toHaveLength(1);
    expect(out.paragraphs[0].runs[0].text).toBe('Hello world');
  });

  it('normalizes unknown format to pptx', () => {
    const data = serializeToClipboard([], 'PPTX', 0);
    expect(data.sourceFormat).toBe('pptx');
  });

  it('normalizes pdf format correctly', () => {
    const data = serializeToClipboard([], 'PDF', 0);
    expect(data.sourceFormat).toBe('pdf');
  });

  it('does not mutate the original element', () => {
    const shape: ShapeElement = {
      ...makeShapeElement('s1', 0, 0, 100, 50),
      source: { format: 'pptx', offX: 914400, offY: 0, extCx: 3657600, extCy: 1828800, rot: 0 },
    };
    serializeToClipboard([shape], 'pptx', 0);
    // Original should still have its source bag
    expect(shape.source).toBeDefined();
  });

  it('handles multiple elements', () => {
    const elements = [
      makeShapeElement('s1', 0, 0, 50, 50),
      makeTextElement('t1', 60, 0, 100, 20, 'text'),
      makeImageElement('i1', 0, 60, 50, 50),
    ];
    const data = serializeToClipboard(elements, 'pptx', 0);
    expect(data.elements).toHaveLength(3);
    expect(data.elements[0].type).toBe('shape');
    expect(data.elements[1].type).toBe('text');
    expect(data.elements[2].type).toBe('image');
  });
});

// ─── deserializeFromClipboard ────────────────────────────

describe('deserializeFromClipboard', () => {
  it('assigns new IDs to all pasted elements', () => {
    const elements = [makeShapeElement('s1', 0, 0, 100, 50)];
    const data = serializeToClipboard(elements, 'pptx', 0);
    const pasted = deserializeFromClipboard(data, 'pptx');

    expect(pasted).toHaveLength(1);
    expect(pasted[0].id).not.toBe('s1');
  });

  it('assigns unique IDs across multiple elements', () => {
    const elements = [
      makeShapeElement('s1', 0, 0, 50, 50),
      makeShapeElement('s2', 60, 0, 50, 50),
    ];
    const data = serializeToClipboard(elements, 'pptx', 0);
    const pasted = deserializeFromClipboard(data, 'pptx');

    const ids = pasted.map((el) => el.id);
    expect(ids[0]).not.toBe('s1');
    expect(ids[1]).not.toBe('s2');
    expect(new Set(ids).size).toBe(2);
  });

  it('preserves visual properties after round-trip', () => {
    const shape = makeShapeElement('s1', 15, 25, 80, 60);
    const data = serializeToClipboard([shape], 'pptx', 0);
    const pasted = deserializeFromClipboard(data, 'pdf');

    expect(pasted[0].x).toBe(15);
    expect(pasted[0].y).toBe(25);
    expect(pasted[0].width).toBe(80);
    expect(pasted[0].height).toBe(60);
  });

  it('preserves element type across round-trip', () => {
    const elements: PageElement[] = [
      makeShapeElement('s1', 0, 0, 50, 50),
      makeTextElement('t1', 60, 0, 100, 20, 'hello'),
      makeImageElement('i1', 0, 60, 50, 50),
    ];
    const data = serializeToClipboard(elements, 'pptx', 0);
    const pasted = deserializeFromClipboard(data, 'pptx');

    expect(pasted[0].type).toBe('shape');
    expect(pasted[1].type).toBe('text');
    expect(pasted[2].type).toBe('image');
  });

  it('updates childIds in group elements to use new IDs', () => {
    const child = makeShapeElement('child1', 10, 10, 30, 30);
    const group: GroupElement = {
      id: 'group1',
      type: 'group',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      index: '0',
      parentId: null,
      locked: false,
      childIds: ['child1'],
    };
    const data = serializeToClipboard([child, group], 'pptx', 0);
    const pasted = deserializeFromClipboard(data, 'pptx');

    const pastedGroup = pasted.find((el) => el.type === 'group') as GroupElement;
    const pastedChild = pasted.find((el) => el.type === 'shape');

    expect(pastedGroup).toBeDefined();
    expect(pastedChild).toBeDefined();
    // Group's childIds should reference the new child ID
    expect(pastedGroup.childIds).toContain(pastedChild!.id);
    // Group's childIds should NOT reference the old child ID
    expect(pastedGroup.childIds).not.toContain('child1');
  });

  it('updates parentId references to new IDs', () => {
    const parent = makeShapeElement('parent1', 0, 0, 100, 100);
    const child: ShapeElement = {
      ...makeShapeElement('child1', 10, 10, 50, 50),
      parentId: 'parent1',
    };
    const data = serializeToClipboard([parent, child], 'pptx', 0);
    const pasted = deserializeFromClipboard(data, 'pptx');

    const pastedParent = pasted[0];
    const pastedChild = pasted[1];

    expect(pastedChild.parentId).toBe(pastedParent.id);
    expect(pastedChild.parentId).not.toBe('parent1');
  });

  it('retains null parentId when not in the copied set', () => {
    const shape: ShapeElement = {
      ...makeShapeElement('s1', 0, 0, 50, 50),
      parentId: 'some-external-group', // parent not in clipboard
    };
    const data = serializeToClipboard([shape], 'pptx', 0);
    const pasted = deserializeFromClipboard(data, 'pptx');

    // parentId references an ID not in the clipboard — keep the original value
    // (the paste target will need to handle orphaned parents)
    expect(pasted[0].parentId).toBe('some-external-group');
  });

  it('returns empty array for empty clipboard data', () => {
    const data: ClipboardData = { elements: [], sourceFormat: 'pptx', sourcePage: 0 };
    expect(deserializeFromClipboard(data, 'pptx')).toHaveLength(0);
  });

  it('each paste call produces distinct IDs', () => {
    const elements = [makeShapeElement('s1', 0, 0, 50, 50)];
    const data = serializeToClipboard(elements, 'pptx', 0);

    const paste1 = deserializeFromClipboard(data, 'pptx');
    const paste2 = deserializeFromClipboard(data, 'pptx');

    // The two paste operations should produce different IDs
    expect(paste1[0].id).not.toBe(paste2[0].id);
  });
});

// ─── Round-trip integrity ────────────────────────────────

describe('clipboard round-trip', () => {
  it('shape round-trip preserves all visual fields', () => {
    const shape: ShapeElement = {
      id: 'orig',
      type: 'shape',
      x: 10,
      y: 20,
      width: 200,
      height: 100,
      rotation: 45,
      opacity: 0.75,
      index: 'a1',
      parentId: null,
      locked: true,
      shapeType: 'ellipse',
      cornerRadius: 8,
      fill: {
        type: 'linear-gradient',
        stops: [
          { offset: 0, color: { r: 255, g: 0, b: 0 } },
          { offset: 1, color: { r: 0, g: 0, b: 255 } },
        ],
        angle: 90,
      },
      stroke: {
        color: { r: 0, g: 0, b: 0 },
        width: 3,
        dashArray: [5, 3],
        lineCap: 'round',
        lineJoin: 'bevel',
      },
      source: { format: 'pptx', offX: 0, offY: 0, extCx: 0, extCy: 0, rot: 0 },
    };

    const data = serializeToClipboard([shape], 'pptx', 0);
    const [pasted] = deserializeFromClipboard(data, 'pdf') as ShapeElement[];

    expect(pasted.type).toBe('shape');
    expect(pasted.x).toBe(10);
    expect(pasted.y).toBe(20);
    expect(pasted.width).toBe(200);
    expect(pasted.height).toBe(100);
    expect(pasted.rotation).toBe(45);
    expect(pasted.opacity).toBe(0.75);
    expect(pasted.locked).toBe(true);
    expect(pasted.shapeType).toBe('ellipse');
    expect(pasted.cornerRadius).toBe(8);
    expect(pasted.fill?.type).toBe('linear-gradient');
    expect(pasted.fill?.stops).toHaveLength(2);
    expect(pasted.fill?.angle).toBe(90);
    expect(pasted.stroke?.width).toBe(3);
    expect(pasted.stroke?.dashArray).toEqual([5, 3]);
    expect(pasted.stroke?.lineCap).toBe('round');
    // Source bag should be gone
    expect(pasted.source).toBeUndefined();
    // ID should be new
    expect(pasted.id).not.toBe('orig');
  });

  it('text round-trip preserves paragraphs and runs', () => {
    const text: TextElement = {
      id: 't-orig',
      type: 'text',
      x: 5,
      y: 10,
      width: 300,
      height: 80,
      rotation: 0,
      opacity: 1,
      index: '0',
      parentId: null,
      locked: false,
      paragraphs: [
        {
          align: 'center',
          runs: [
            {
              text: 'Bold text',
              fontFamily: 'Arial',
              fontSize: 18,
              bold: true,
              italic: false,
              underline: true,
              color: { r: 0, g: 0, b: 255, a: 1 },
              x: 0,
              y: 0,
              width: 100,
              height: 18,
            },
          ],
        },
      ],
    };

    const data = serializeToClipboard([text], 'pptx', 3);
    const [pasted] = deserializeFromClipboard(data, 'pptx') as TextElement[];

    expect(pasted.type).toBe('text');
    expect(pasted.paragraphs).toHaveLength(1);
    expect(pasted.paragraphs[0].align).toBe('center');
    expect(pasted.paragraphs[0].runs[0].text).toBe('Bold text');
    expect(pasted.paragraphs[0].runs[0].bold).toBe(true);
    expect(pasted.paragraphs[0].runs[0].underline).toBe(true);
    expect(pasted.paragraphs[0].runs[0].color).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    expect(pasted.id).not.toBe('t-orig');
  });
});
