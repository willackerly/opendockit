/**
 * Tests for the PPTX→Elements bridge.
 *
 * Verifies that slideElementsToPageElements correctly converts SlideElementIR
 * objects into unified PageElement objects with accurate coordinate conversion,
 * preserved rotation, and lossless PptxSource round-trip data.
 */

import { describe, expect, it } from 'vitest';
import type {
  DrawingMLShapeIR,
  PictureIR,
  GroupIR,
  ShapePropertiesIR,
  TransformIR,
  SlideElementIR,
} from '@opendockit/core';
import type { TextElement, ShapeElement, ImageElement, GroupElement, PptxSource } from '@opendockit/elements';
import { slideElementsToPageElements } from '../pptx-to-elements.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

const SLIDE_WIDTH_EMU = 9144000; // 10 inches
const SLIDE_HEIGHT_EMU = 5143500; // ~5.63 inches (16:9)

function makeTransform(
  offX: number,
  offY: number,
  extCx: number,
  extCy: number,
  rotation?: number,
): TransformIR {
  return {
    position: { x: offX, y: offY },
    size: { width: extCx, height: extCy },
    rotation,
  };
}

function makeProperties(transform?: TransformIR, overrides?: Partial<ShapePropertiesIR>): ShapePropertiesIR {
  return {
    transform,
    effects: [],
    ...overrides,
  };
}

function makeShape(overrides?: Partial<DrawingMLShapeIR>): DrawingMLShapeIR {
  return {
    kind: 'shape',
    id: 'shape-1',
    name: 'Rectangle 1',
    properties: makeProperties(makeTransform(914400, 457200, 2743200, 1828800)),
    ...overrides,
  };
}

function makePicture(overrides?: Partial<PictureIR>): PictureIR {
  return {
    kind: 'picture',
    imagePartUri: '/ppt/media/image1.png',
    properties: makeProperties(makeTransform(457200, 228600, 1828800, 1371600)),
    blipFill: { stretch: true },
    nonVisualProperties: {
      name: 'Picture 2',
      description: 'A test image',
    },
    ...overrides,
  };
}

function makeGroup(children: SlideElementIR[], transform?: TransformIR): GroupIR {
  const t = transform ?? makeTransform(0, 0, 9144000, 5143500);
  return {
    kind: 'group',
    properties: makeProperties(t),
    childOffset: { x: 0, y: 0 },
    childExtent: { width: 9144000, height: 5143500 },
    children,
  };
}

// ─── EMU conversion constant ──────────────────────────────────────────────────

const EMU_PER_PT = 12700;
function emuToPt(emu: number): number {
  return emu / EMU_PER_PT;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('slideElementsToPageElements', () => {
  it('returns empty array for empty input', () => {
    const result = slideElementsToPageElements([], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
    expect(result).toEqual([]);
  });

  describe('shape conversion', () => {
    it('converts a shape transform: x/y/width/height in points', () => {
      const offX = 914400;   // 1 inch = 72 pt
      const offY = 457200;   // 0.5 inch = 36 pt
      const extCx = 2743200; // 3 inches = 216 pt
      const extCy = 1828800; // 2 inches = 144 pt

      const shape = makeShape({
        properties: makeProperties(makeTransform(offX, offY, extCx, extCy)),
      });
      const result = slideElementsToPageElements([shape], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);

      expect(result).toHaveLength(1);
      const el = result[0] as ShapeElement;
      expect(el.type).toBe('shape');
      expect(el.x).toBeCloseTo(emuToPt(offX), 5);
      expect(el.y).toBeCloseTo(emuToPt(offY), 5);
      expect(el.width).toBeCloseTo(emuToPt(extCx), 5);
      expect(el.height).toBeCloseTo(emuToPt(extCy), 5);
    });

    it('preserves rotation from TransformIR', () => {
      const shape = makeShape({
        properties: makeProperties(makeTransform(914400, 914400, 1828800, 914400, 45)),
      });
      const result = slideElementsToPageElements([shape], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      expect(result[0]?.rotation).toBe(45);
    });

    it('defaults rotation to 0 when not set', () => {
      const shape = makeShape({
        properties: makeProperties(makeTransform(914400, 914400, 1828800, 914400)),
      });
      const result = slideElementsToPageElements([shape], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      expect(result[0]?.rotation).toBe(0);
    });

    it('uses shape id as element id', () => {
      const shape = makeShape({ id: 'my-shape-42' });
      const result = slideElementsToPageElements([shape], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      expect(result[0]?.id).toBe('my-shape-42');
    });

    it('falls back to indexed id when shape has no id', () => {
      const shape = makeShape({ id: undefined });
      const result = slideElementsToPageElements([shape], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      expect(result[0]?.id).toBe('shape-0');
    });

    it('assigns opacity 1 by default', () => {
      const shape = makeShape();
      const result = slideElementsToPageElements([shape], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      expect(result[0]?.opacity).toBe(1);
    });

    it('assigns parentId null for top-level elements', () => {
      const shape = makeShape();
      const result = slideElementsToPageElements([shape], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      expect(result[0]?.parentId).toBeNull();
    });

    it('generates z-order index strings', () => {
      const shape1 = makeShape({ id: '1' });
      const shape2 = makeShape({ id: '2' });
      const result = slideElementsToPageElements([shape1, shape2], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      expect(result[0]?.index).toBeTruthy();
      expect(result[1]?.index).toBeTruthy();
      // Indexes should differ and be string type
      expect(typeof result[0]?.index).toBe('string');
      expect(result[0]?.index).not.toBe(result[1]?.index);
    });
  });

  describe('picture conversion', () => {
    it('converts a picture to ImageElement', () => {
      const picture = makePicture();
      const result = slideElementsToPageElements([picture], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);

      expect(result).toHaveLength(1);
      const el = result[0] as ImageElement;
      expect(el.type).toBe('image');
    });

    it('converts picture transform coordinates to points', () => {
      const offX = 457200;   // 0.5 inch = 36 pt
      const offY = 228600;   // 0.25 inch = 18 pt
      const extCx = 1828800; // 2 inches = 144 pt
      const extCy = 1371600; // 1.5 inches = 108 pt

      const picture = makePicture({
        properties: makeProperties(makeTransform(offX, offY, extCx, extCy)),
      });
      const result = slideElementsToPageElements([picture], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      const el = result[0] as ImageElement;

      expect(el.x).toBeCloseTo(emuToPt(offX), 5);
      expect(el.y).toBeCloseTo(emuToPt(offY), 5);
      expect(el.width).toBeCloseTo(emuToPt(extCx), 5);
      expect(el.height).toBeCloseTo(emuToPt(extCy), 5);
    });

    it('carries the imagePartUri in imageRef', () => {
      const picture = makePicture({ imagePartUri: '/ppt/media/logo.png' });
      const result = slideElementsToPageElements([picture], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      const el = result[0] as ImageElement;
      expect(el.imageRef).toBe('/ppt/media/logo.png');
    });

    it('uses nonVisualProperties.name as element id', () => {
      const picture = makePicture({
        nonVisualProperties: { name: 'my-logo', description: '' },
      });
      const result = slideElementsToPageElements([picture], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      expect(result[0]?.id).toBe('my-logo');
    });
  });

  describe('group conversion', () => {
    it('converts a group and its children', () => {
      const child1 = makeShape({ id: 'child-shape-1' });
      const child2 = makePicture({ nonVisualProperties: { name: 'child-pic-2' } });
      const group = makeGroup([child1, child2]);

      const result = slideElementsToPageElements([group], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);

      // Should have group + 2 children = 3 total
      expect(result).toHaveLength(3);
      expect(result[0]?.type).toBe('group');
    });

    it('assigns group element type group', () => {
      const group = makeGroup([makeShape({ id: 'child-1' })]);
      const result = slideElementsToPageElements([group], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      const groupEl = result[0] as GroupElement;
      expect(groupEl.type).toBe('group');
    });

    it('populates childIds on GroupElement', () => {
      const child1 = makeShape({ id: 'child-shape-A' });
      const child2 = makeShape({ id: 'child-shape-B' });
      const group = makeGroup([child1, child2]);

      const result = slideElementsToPageElements([group], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      const groupEl = result[0] as GroupElement;

      expect(groupEl.childIds).toHaveLength(2);
      expect(groupEl.childIds).toContain('child-shape-A');
      expect(groupEl.childIds).toContain('child-shape-B');
    });

    it('assigns parentId on group children', () => {
      const child = makeShape({ id: 'child-1' });
      const group = makeGroup([child]);
      const result = slideElementsToPageElements([group], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);

      const groupEl = result[0] as GroupElement;
      const childEl = result[1];

      expect(childEl?.parentId).toBe(groupEl.id);
    });

    it('recursively converts nested groups', () => {
      const innerChild = makeShape({ id: 'inner-child' });
      const innerGroup = makeGroup([innerChild], makeTransform(914400, 914400, 1828800, 914400));
      const outerGroup = makeGroup([innerGroup], makeTransform(0, 0, 9144000, 5143500));

      const result = slideElementsToPageElements([outerGroup], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);

      // outerGroup + innerGroup + innerChild = 3 elements
      expect(result).toHaveLength(3);
      expect(result[0]?.type).toBe('group'); // outer
      expect(result[1]?.type).toBe('group'); // inner
      expect(result[2]?.type).toBe('shape'); // innerChild
    });
  });

  describe('PptxSource round-trip', () => {
    it('carries original EMU values in PptxSource', () => {
      const offX = 914400;
      const offY = 457200;
      const extCx = 2743200;
      const extCy = 1828800;
      const rotation = 30;

      const shape = makeShape({
        properties: makeProperties(makeTransform(offX, offY, extCx, extCy, rotation)),
      });
      const result = slideElementsToPageElements([shape], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      const el = result[0] as ShapeElement;
      const src = el.source as PptxSource;

      expect(src.format).toBe('pptx');
      expect(src.offX).toBe(offX);
      expect(src.offY).toBe(offY);
      expect(src.extCx).toBe(extCx);
      expect(src.extCy).toBe(extCy);
    });

    it('converts rotation to 60,000ths-of-a-degree in PptxSource.rot', () => {
      const rotationDegrees = 45;
      const shape = makeShape({
        properties: makeProperties(makeTransform(914400, 914400, 1828800, 914400, rotationDegrees)),
      });
      const result = slideElementsToPageElements([shape], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      const src = (result[0] as ShapeElement).source as PptxSource;

      expect(src.rot).toBe(rotationDegrees * 60000);
    });

    it('PptxSource.rot is 0 when rotation is absent', () => {
      const shape = makeShape({
        properties: makeProperties(makeTransform(914400, 914400, 1828800, 914400)),
      });
      const result = slideElementsToPageElements([shape], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      const src = (result[0] as ShapeElement).source as PptxSource;

      expect(src.rot).toBe(0);
    });

    it('carries kind in PptxSource.passthrough for shapes', () => {
      const shape = makeShape({ id: 'test-shape' });
      const result = slideElementsToPageElements([shape], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      const src = (result[0] as ShapeElement).source as PptxSource;

      expect(src.passthrough?.kind).toBe('shape');
    });

    it('carries imagePartUri in PptxSource.passthrough for pictures', () => {
      const picture = makePicture({ imagePartUri: '/ppt/media/image2.jpg' });
      const result = slideElementsToPageElements([picture], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      const src = (result[0] as ImageElement).source as PptxSource;

      expect(src.passthrough?.imagePartUri).toBe('/ppt/media/image2.jpg');
    });
  });

  describe('text shape conversion', () => {
    it('converts a shape with visible text to TextElement', () => {
      const shape = makeShape({
        textBody: {
          paragraphs: [
            {
              runs: [
                {
                  kind: 'run',
                  text: 'Hello World',
                  properties: {
                    fontSize: 2400, // 24pt in hundredths-of-a-point
                    fontFamily: 'Arial',
                    bold: true,
                  },
                },
              ],
              properties: { alignment: 'center' },
            },
          ],
          bodyProperties: {},
        },
      });

      const result = slideElementsToPageElements([shape], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      expect(result).toHaveLength(1);
      const el = result[0] as TextElement;
      expect(el.type).toBe('text');
    });

    it('converts empty text shape to ShapeElement', () => {
      const shape = makeShape({
        textBody: {
          paragraphs: [
            {
              runs: [],
              properties: {},
            },
          ],
          bodyProperties: {},
        },
      });

      const result = slideElementsToPageElements([shape], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      // Empty text body → ShapeElement, not TextElement
      expect(result[0]?.type).toBe('shape');
    });
  });

  describe('unsupported elements', () => {
    it('skips chart elements (returns no element)', () => {
      const chart: SlideElementIR = {
        kind: 'chart',
        chartType: 'bar',
        properties: makeProperties(makeTransform(914400, 914400, 1828800, 914400)),
        chartPartUri: '/ppt/charts/chart1.xml',
      };

      const result = slideElementsToPageElements([chart], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      expect(result).toHaveLength(0);
    });

    it('skips unsupported elements', () => {
      const unsupported: SlideElementIR = {
        kind: 'unsupported',
        elementType: 'mc:AlternateContent',
        reason: 'Unknown element type',
      };

      const result = slideElementsToPageElements([unsupported], SLIDE_WIDTH_EMU, SLIDE_HEIGHT_EMU);
      expect(result).toHaveLength(0);
    });
  });

  describe('multiple elements', () => {
    it('converts multiple elements preserving order', () => {
      const shape1 = makeShape({ id: 'first' });
      const shape2 = makeShape({ id: 'second' });
      const picture = makePicture({ nonVisualProperties: { name: 'third' } });

      const result = slideElementsToPageElements(
        [shape1, shape2, picture],
        SLIDE_WIDTH_EMU,
        SLIDE_HEIGHT_EMU,
      );

      expect(result).toHaveLength(3);
      expect(result[0]?.id).toBe('first');
      expect(result[1]?.id).toBe('second');
      expect(result[2]?.id).toBe('third');
    });
  });
});
