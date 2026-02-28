import { describe, it, expect } from 'vitest';
import { deriveIR } from '../derive-ir.js';
import type { EditableShape } from '../editable-types.js';
import type { DrawingMLShapeIR, PictureIR, GroupIR } from '../../ir/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeShapeIR(overrides?: Partial<DrawingMLShapeIR>): DrawingMLShapeIR {
  return {
    kind: 'shape',
    id: '2',
    name: 'Test Shape',
    properties: {
      transform: {
        position: { x: 100000, y: 200000 },
        size: { width: 500000, height: 300000 },
        rotation: 0,
      },
      fill: { type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 } },
      effects: [],
    },
    textBody: {
      paragraphs: [
        {
          runs: [{ kind: 'run', text: 'Hello', properties: { fontSize: 1200, bold: true } }],
          properties: { alignment: 'left' },
        },
      ],
      bodyProperties: { verticalAlign: 'top' },
    },
    ...overrides,
  };
}

function makeEditableShape(
  ir?: DrawingMLShapeIR,
  overrides?: Partial<EditableShape>,
): EditableShape {
  const shapeIR = ir ?? makeShapeIR();
  return {
    id: '/ppt/slides/slide1.xml#2',
    kind: 'shape',
    originalIR: Object.freeze(shapeIR) as DrawingMLShapeIR,
    originalPartUri: '/ppt/slides/slide1.xml',
    dirty: {},
    transform: {
      x: shapeIR.properties.transform!.position.x,
      y: shapeIR.properties.transform!.position.y,
      width: shapeIR.properties.transform!.size.width,
      height: shapeIR.properties.transform!.size.height,
      rotation: shapeIR.properties.transform!.rotation,
    },
    deleted: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deriveIR', () => {
  // ═══════════════════════════════════════════════════════════════════════
  // FAST PATH tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('fast path (clean elements)', () => {
    it('returns originalIR when element is not dirty', () => {
      const shape = makeEditableShape();
      const result = deriveIR(shape);
      // Same reference — zero allocation
      expect(result).toBe(shape.originalIR);
    });

    it('returns originalIR for clean element even when transform is changed but not marked dirty', () => {
      const shape = makeEditableShape();
      shape.transform.x = 999999;
      // Not marked dirty — fast path should still return originalIR
      const result = deriveIR(shape);
      expect(result).toBe(shape.originalIR);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // POSITION tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('position changes', () => {
    it('patches position when position dirty', () => {
      const shape = makeEditableShape();
      shape.transform.x = 150000;
      shape.transform.y = 250000;
      shape.dirty.position = true;

      const result = deriveIR(shape) as DrawingMLShapeIR;
      expect(result.properties.transform!.position).toEqual({ x: 150000, y: 250000 });
      // Size should be unchanged
      expect(result.properties.transform!.size).toEqual({ width: 500000, height: 300000 });
    });

    it('produces a new IR object (not same reference as original)', () => {
      const shape = makeEditableShape();
      shape.transform.x = 150000;
      shape.dirty.position = true;

      const result = deriveIR(shape);
      expect(result).not.toBe(shape.originalIR);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // SIZE tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('size changes', () => {
    it('patches size when size dirty', () => {
      const shape = makeEditableShape();
      shape.transform.width = 600000;
      shape.transform.height = 400000;
      shape.dirty.size = true;

      const result = deriveIR(shape) as DrawingMLShapeIR;
      expect(result.properties.transform!.size).toEqual({ width: 600000, height: 400000 });
      // Position should be unchanged
      expect(result.properties.transform!.position).toEqual({ x: 100000, y: 200000 });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ROTATION tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('rotation changes', () => {
    it('patches rotation when rotation dirty', () => {
      const shape = makeEditableShape();
      shape.transform.rotation = 45;
      shape.dirty.rotation = true;

      const result = deriveIR(shape) as DrawingMLShapeIR;
      expect(result.properties.transform!.rotation).toBe(45);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FILL tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('fill changes', () => {
    it('patches fill when fill dirty', () => {
      const shape = makeEditableShape();
      shape.fillOverride = { type: 'solid', color: { r: 0, g: 255, b: 0, a: 1 } };
      shape.dirty.fill = true;

      const result = deriveIR(shape) as DrawingMLShapeIR;
      expect(result.properties.fill).toEqual({
        type: 'solid',
        color: { r: 0, g: 255, b: 0, a: 1 },
      });
    });

    it('keeps original fill when fill dirty but no override set', () => {
      const shape = makeEditableShape();
      shape.dirty.fill = true;
      // fillOverride is undefined

      const result = deriveIR(shape) as DrawingMLShapeIR;
      // Properties object is new (because fill dirty flag triggers copy), but
      // fill value should still be the original
      expect(result.properties.fill).toEqual({
        type: 'solid',
        color: { r: 255, g: 0, b: 0, a: 1 },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // TEXT tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('text changes', () => {
    it('patches text body when text dirty', () => {
      const shape = makeEditableShape();
      shape.textEdits = {
        paragraphs: [{ runs: [{ text: 'World' }] }],
      };
      shape.dirty.text = true;

      const result = deriveIR(shape) as DrawingMLShapeIR;
      expect(result.textBody).toBeDefined();
      expect(result.textBody!.paragraphs[0].runs[0]).toMatchObject({
        kind: 'run',
        text: 'World',
      });
    });

    it('preserves bodyProperties from original', () => {
      const shape = makeEditableShape();
      shape.textEdits = {
        paragraphs: [{ runs: [{ text: 'New' }] }],
      };
      shape.dirty.text = true;

      const result = deriveIR(shape) as DrawingMLShapeIR;
      expect(result.textBody!.bodyProperties).toEqual({ verticalAlign: 'top' });
    });

    it('preserves original run properties as template', () => {
      const shape = makeEditableShape();
      shape.textEdits = {
        paragraphs: [{ runs: [{ text: 'Styled' }] }],
      };
      shape.dirty.text = true;

      const result = deriveIR(shape) as DrawingMLShapeIR;
      // Should pick up fontSize: 1200, bold: true from the original first run
      const run = result.textBody!.paragraphs[0].runs[0];
      expect(run.kind).toBe('run');
      if (run.kind === 'run') {
        expect(run.properties?.fontSize).toBe(1200);
        expect(run.properties?.bold).toBe(true);
      }
    });

    it('uses explicit properties over template when provided', () => {
      const shape = makeEditableShape();
      shape.textEdits = {
        paragraphs: [{ runs: [{ text: 'Styled', properties: { fontSize: 2400, italic: true } }] }],
      };
      shape.dirty.text = true;

      const result = deriveIR(shape) as DrawingMLShapeIR;
      const run = result.textBody!.paragraphs[0].runs[0];
      expect(run.kind).toBe('run');
      if (run.kind === 'run') {
        expect(run.properties?.fontSize).toBe(2400);
        expect(run.properties?.italic).toBe(true);
        // Should NOT have bold from original (explicit properties take precedence)
        expect(run.properties?.bold).toBeUndefined();
      }
    });

    it('keeps original textBody when text dirty but no textEdits', () => {
      const shape = makeEditableShape();
      shape.dirty.text = true;
      // textEdits is undefined

      const result = deriveIR(shape) as DrawingMLShapeIR;
      // textBody should remain unchanged from original
      expect(result.textBody).toBe(shape.originalIR.textBody);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // DELETION tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('deleted elements', () => {
    it('returns unsupported IR for deleted elements', () => {
      const shape = makeEditableShape();
      shape.deleted = true;
      shape.dirty.deleted = true;

      const result = deriveIR(shape);
      expect(result.kind).toBe('unsupported');
    });

    it('returns unsupported IR for deleted elements even without dirty flag', () => {
      const shape = makeEditableShape();
      shape.deleted = true;
      // No dirty flag set — but deleted overrides everything

      const result = deriveIR(shape);
      expect(result.kind).toBe('unsupported');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // MULTIPLE DIRTY tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('multiple dirty fields', () => {
    it('patches both position and text', () => {
      const shape = makeEditableShape();
      shape.transform.x = 0;
      shape.dirty.position = true;
      shape.textEdits = { paragraphs: [{ runs: [{ text: 'Both' }] }] };
      shape.dirty.text = true;

      const result = deriveIR(shape) as DrawingMLShapeIR;
      expect(result.properties.transform!.position.x).toBe(0);
      expect(result.textBody!.paragraphs[0].runs[0]).toMatchObject({ text: 'Both' });
    });

    it('patches position, fill, and text together', () => {
      const shape = makeEditableShape();
      shape.transform.x = 50000;
      shape.dirty.position = true;
      shape.fillOverride = { type: 'none' };
      shape.dirty.fill = true;
      shape.textEdits = { paragraphs: [{ runs: [{ text: 'All' }] }] };
      shape.dirty.text = true;

      const result = deriveIR(shape) as DrawingMLShapeIR;
      expect(result.properties.transform!.position.x).toBe(50000);
      expect(result.properties.fill).toEqual({ type: 'none' });
      expect(result.textBody!.paragraphs[0].runs[0]).toMatchObject({ text: 'All' });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // IMMUTABILITY tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('immutability', () => {
    it('does not mutate the original IR when position changes', () => {
      const ir = makeShapeIR();
      const origX = ir.properties.transform!.position.x;
      const shape = makeEditableShape(ir);

      shape.transform.x = 999999;
      shape.dirty.position = true;
      deriveIR(shape);

      // Original IR must be unchanged
      expect(ir.properties.transform!.position.x).toBe(origX);
    });

    it('does not mutate the original IR when fill changes', () => {
      const ir = makeShapeIR();
      const origFill = ir.properties.fill;
      const shape = makeEditableShape(ir);

      shape.fillOverride = { type: 'solid', color: { r: 0, g: 0, b: 255, a: 1 } };
      shape.dirty.fill = true;
      deriveIR(shape);

      // Original IR must be unchanged
      expect(ir.properties.fill).toBe(origFill);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // GENERIC ELEMENT tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('generic elements (picture, connector, etc.)', () => {
    it('patches transform on a picture element', () => {
      const pictureIR: PictureIR = {
        kind: 'picture',
        imagePartUri: '/ppt/media/image1.png',
        properties: {
          transform: {
            position: { x: 100, y: 200 },
            size: { width: 300, height: 400 },
          },
          effects: [],
        },
        nonVisualProperties: { name: 'Picture 1' },
      };

      const editable = {
        id: '/ppt/slides/slide1.xml#3',
        kind: 'picture' as const,
        originalIR: pictureIR,
        originalPartUri: '/ppt/slides/slide1.xml',
        dirty: { position: true },
        transform: { x: 500, y: 600, width: 300, height: 400 },
        deleted: false,
      };

      const result = deriveIR(editable) as PictureIR;
      expect(result.properties.transform!.position).toEqual({ x: 500, y: 600 });
      // Other fields preserved
      expect(result.imagePartUri).toBe('/ppt/media/image1.png');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // GROUP CHILDREN DEEP-CLONE tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('group children deep-clone', () => {
    function makeFrozenGroupIR(): GroupIR {
      const pictureChild: PictureIR = {
        kind: 'picture',
        imagePartUri: 'rId2',
        properties: {
          transform: {
            position: { x: 10, y: 20 },
            size: { width: 100, height: 80 },
          },
          effects: [],
        },
        nonVisualProperties: { name: 'Pic 1' },
      };
      Object.freeze(pictureChild);

      const groupIR: GroupIR = {
        kind: 'group',
        properties: {
          transform: {
            position: { x: 0, y: 0 },
            size: { width: 500, height: 400 },
          },
          effects: [],
        },
        childOffset: { x: 0, y: 0 },
        childExtent: { width: 500, height: 400 },
        children: [pictureChild],
      };
      Object.freeze(groupIR);
      return groupIR;
    }

    it('dirty group with frozen picture child produces mutable children', () => {
      const groupIR = makeFrozenGroupIR();
      const editable = {
        id: '/ppt/slides/slide1.xml#5',
        kind: 'group' as const,
        originalIR: groupIR,
        originalPartUri: '/ppt/slides/slide1.xml',
        dirty: { position: true },
        transform: { x: 100, y: 200, width: 500, height: 400 },
        deleted: false,
      };

      const result = deriveIR(editable) as GroupIR;

      // Children should be a new array with cloned (mutable) objects
      expect(result.children).not.toBe(groupIR.children);
      expect(result.children).toHaveLength(1);

      // Assigning imagePartUri should NOT throw (the whole point of this fix)
      const child = result.children[0] as PictureIR;
      expect(() => {
        child.imagePartUri = '/ppt/media/image1.png';
      }).not.toThrow();
      expect(child.imagePartUri).toBe('/ppt/media/image1.png');
    });

    it('nested group: recursive cloning produces mutable children at all levels', () => {
      const innerPic: PictureIR = {
        kind: 'picture',
        imagePartUri: 'rId3',
        properties: {
          transform: {
            position: { x: 5, y: 5 },
            size: { width: 50, height: 50 },
          },
          effects: [],
        },
        nonVisualProperties: { name: 'Inner Pic' },
      };
      Object.freeze(innerPic);

      const innerGroup: GroupIR = {
        kind: 'group',
        properties: {
          transform: {
            position: { x: 10, y: 10 },
            size: { width: 200, height: 200 },
          },
          effects: [],
        },
        childOffset: { x: 0, y: 0 },
        childExtent: { width: 200, height: 200 },
        children: [innerPic],
      };
      Object.freeze(innerGroup);

      const outerGroup: GroupIR = {
        kind: 'group',
        properties: {
          transform: {
            position: { x: 0, y: 0 },
            size: { width: 600, height: 500 },
          },
          effects: [],
        },
        childOffset: { x: 0, y: 0 },
        childExtent: { width: 600, height: 500 },
        children: [innerGroup],
      };
      Object.freeze(outerGroup);

      const editable = {
        id: '/ppt/slides/slide1.xml#10',
        kind: 'group' as const,
        originalIR: outerGroup,
        originalPartUri: '/ppt/slides/slide1.xml',
        dirty: { position: true },
        transform: { x: 50, y: 60, width: 600, height: 500 },
        deleted: false,
      };

      const result = deriveIR(editable) as GroupIR;
      const resultInner = result.children[0] as GroupIR;
      const resultInnerPic = resultInner.children[0] as PictureIR;

      // Deeply nested picture should be mutable
      expect(() => {
        resultInnerPic.imagePartUri = '/ppt/media/deep.png';
      }).not.toThrow();
      expect(resultInnerPic.imagePartUri).toBe('/ppt/media/deep.png');
    });

    it('clean group: fast path returns original frozen IR (zero alloc)', () => {
      const groupIR = makeFrozenGroupIR();
      const editable = {
        id: '/ppt/slides/slide1.xml#5',
        kind: 'group' as const,
        originalIR: groupIR,
        originalPartUri: '/ppt/slides/slide1.xml',
        dirty: {},
        transform: { x: 0, y: 0, width: 500, height: 400 },
        deleted: false,
      };

      const result = deriveIR(editable);
      // Same reference — fast path, zero allocation
      expect(result).toBe(groupIR);
    });
  });
});
