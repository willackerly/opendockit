import { describe, it, expect } from 'vitest';
import { EditablePresentation } from '../editable-presentation.js';
import type { EditableSlide } from '../editable-presentation.js';
import type {
  EditableElement,
  EditableShape,
  EditableGroup,
  EditableGeneric,
} from '../editable-types.js';
import type { DrawingMLShapeIR, SlideElementIR } from '../../ir/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const partUri1 = '/ppt/slides/slide1.xml';
const partUri2 = '/ppt/slides/slide2.xml';

function makeShapeIR(id: string, name: string): DrawingMLShapeIR {
  return {
    kind: 'shape',
    id,
    name,
    properties: {
      transform: {
        position: { x: 100000, y: 200000 },
        size: { width: 500000, height: 300000 },
      },
      effects: [],
    },
  };
}

function makeEditableShape(
  elementId: string,
  partUri: string,
  ir: SlideElementIR,
): EditableShape {
  const transform =
    ir.kind !== 'unsupported' && ir.properties.transform
      ? {
          x: ir.properties.transform.position.x,
          y: ir.properties.transform.position.y,
          width: ir.properties.transform.size.width,
          height: ir.properties.transform.size.height,
          rotation: ir.properties.transform.rotation,
          flipH: ir.properties.transform.flipH,
          flipV: ir.properties.transform.flipV,
        }
      : { x: 0, y: 0, width: 0, height: 0 };

  return {
    id: elementId,
    kind: 'shape',
    originalIR: ir,
    originalPartUri: partUri,
    dirty: {},
    transform,
    deleted: false,
  };
}

function makeEditableGeneric(
  elementId: string,
  partUri: string,
  ir: SlideElementIR,
  kind: 'chart' | 'unsupported',
): EditableGeneric {
  return {
    id: elementId,
    kind,
    originalIR: ir,
    originalPartUri: partUri,
    dirty: {},
    transform: { x: 0, y: 0, width: 0, height: 0 },
    deleted: false,
  };
}

function makeMockPresentation(): {
  presentation: EditablePresentation;
  shape1Id: string;
  shape2Id: string;
  shape3Id: string;
} {
  const ir1 = makeShapeIR('1', 'Title');
  const ir2 = makeShapeIR('2', 'Subtitle');
  const ir3 = makeShapeIR('3', 'Content');

  const shape1Id = `${partUri1}#1`;
  const shape2Id = `${partUri1}#2`;
  const shape3Id = `${partUri2}#3`;

  const el1 = makeEditableShape(shape1Id, partUri1, ir1);
  const el2 = makeEditableShape(shape2Id, partUri1, ir2);
  const el3 = makeEditableShape(shape3Id, partUri2, ir3);

  const slides: EditableSlide[] = [
    { index: 0, partUri: partUri1, elements: [el1, el2] },
    { index: 1, partUri: partUri2, elements: [el3] },
  ];

  const originalXml = new Map<string, string>();
  originalXml.set(partUri1, '<p:sld>...</p:sld>');
  originalXml.set(partUri2, '<p:sld>...</p:sld>');

  return {
    presentation: new EditablePresentation(slides, originalXml),
    shape1Id,
    shape2Id,
    shape3Id,
  };
}

// ---------------------------------------------------------------------------
// Element lookup
// ---------------------------------------------------------------------------

describe('EditablePresentation — element lookup', () => {
  it('retrieves elements by ID', () => {
    const { presentation, shape1Id } = makeMockPresentation();
    const el = presentation.getElement(shape1Id);
    expect(el).toBeDefined();
    expect(el!.id).toBe(shape1Id);
    expect(el!.kind).toBe('shape');
  });

  it('returns undefined for unknown IDs', () => {
    const { presentation } = makeMockPresentation();
    expect(presentation.getElement('nonexistent#99')).toBeUndefined();
  });

  it('getSlides returns all slides', () => {
    const { presentation } = makeMockPresentation();
    const slides = presentation.getSlides();
    expect(slides).toHaveLength(2);
    expect(slides[0].partUri).toBe(partUri1);
    expect(slides[1].partUri).toBe(partUri2);
  });
});

// ---------------------------------------------------------------------------
// moveElement
// ---------------------------------------------------------------------------

describe('EditablePresentation — moveElement', () => {
  it('moves an element by delta EMU', () => {
    const { presentation, shape1Id } = makeMockPresentation();
    presentation.moveElement(shape1Id, 10000, 20000);

    const el = presentation.getElement(shape1Id)!;
    expect(el.transform.x).toBe(110000);
    expect(el.transform.y).toBe(220000);
  });

  it('marks position dirty', () => {
    const { presentation, shape1Id } = makeMockPresentation();
    presentation.moveElement(shape1Id, 5000, 5000);

    const el = presentation.getElement(shape1Id)!;
    expect(el.dirty.position).toBe(true);
  });

  it('marks element dirty in tracker', () => {
    const { presentation, shape1Id } = makeMockPresentation();
    expect(presentation.isElementDirty(shape1Id)).toBe(false);

    presentation.moveElement(shape1Id, 1000, 1000);
    expect(presentation.isElementDirty(shape1Id)).toBe(true);
  });

  it('throws for non-existent elements', () => {
    const { presentation } = makeMockPresentation();
    expect(() => presentation.moveElement('fake#id', 0, 0)).toThrow(
      'Element not found: fake#id',
    );
  });

  it('throws for deleted elements', () => {
    const { presentation, shape1Id } = makeMockPresentation();
    presentation.deleteElement(shape1Id);
    expect(() => presentation.moveElement(shape1Id, 0, 0)).toThrow(
      `Element has been deleted: ${shape1Id}`,
    );
  });
});

// ---------------------------------------------------------------------------
// resizeElement
// ---------------------------------------------------------------------------

describe('EditablePresentation — resizeElement', () => {
  it('resizes an element to new dimensions', () => {
    const { presentation, shape1Id } = makeMockPresentation();
    presentation.resizeElement(shape1Id, 1000000, 600000);

    const el = presentation.getElement(shape1Id)!;
    expect(el.transform.width).toBe(1000000);
    expect(el.transform.height).toBe(600000);
  });

  it('marks size dirty', () => {
    const { presentation, shape1Id } = makeMockPresentation();
    presentation.resizeElement(shape1Id, 800000, 400000);

    const el = presentation.getElement(shape1Id)!;
    expect(el.dirty.size).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// setText
// ---------------------------------------------------------------------------

describe('EditablePresentation — setText', () => {
  it('sets text on a shape', () => {
    const { presentation, shape1Id } = makeMockPresentation();
    presentation.setText(shape1Id, [
      { runs: [{ text: 'New Title' }] },
    ]);

    const el = presentation.getElement(shape1Id)! as EditableShape;
    expect(el.textEdits).toBeDefined();
    expect(el.textEdits!.paragraphs).toHaveLength(1);
    expect(el.textEdits!.paragraphs[0].runs[0].text).toBe('New Title');
  });

  it('marks text dirty', () => {
    const { presentation, shape1Id } = makeMockPresentation();
    presentation.setText(shape1Id, [{ runs: [{ text: 'X' }] }]);

    const el = presentation.getElement(shape1Id)!;
    expect(el.dirty.text).toBe(true);
  });

  it('throws when setting text on a non-shape element', () => {
    const genericIR: SlideElementIR = {
      kind: 'chart',
      chartType: 'bar',
      properties: { effects: [] },
      chartPartUri: '/ppt/charts/chart1.xml',
    };
    const chartEl = makeEditableGeneric(
      `${partUri1}#99`,
      partUri1,
      genericIR,
      'chart',
    );
    const slides: EditableSlide[] = [
      { index: 0, partUri: partUri1, elements: [chartEl] },
    ];
    const pres = new EditablePresentation(slides, new Map());
    expect(() =>
      pres.setText(`${partUri1}#99`, [{ runs: [{ text: 'hi' }] }]),
    ).toThrow("Cannot set text on element kind 'chart'");
  });
});

// ---------------------------------------------------------------------------
// setFill
// ---------------------------------------------------------------------------

describe('EditablePresentation — setFill', () => {
  it('sets fill on a shape', () => {
    const { presentation, shape1Id } = makeMockPresentation();
    presentation.setFill(shape1Id, {
      type: 'solid',
      color: { r: 255, g: 0, b: 0, a: 1 },
    });

    const el = presentation.getElement(shape1Id)! as EditableShape;
    expect(el.fillOverride).toBeDefined();
    expect(el.fillOverride!.type).toBe('solid');
  });

  it('marks fill dirty', () => {
    const { presentation, shape1Id } = makeMockPresentation();
    presentation.setFill(shape1Id, { type: 'none' });

    const el = presentation.getElement(shape1Id)!;
    expect(el.dirty.fill).toBe(true);
  });

  it('throws when setting fill on a non-shape element', () => {
    const genericIR: SlideElementIR = {
      kind: 'unsupported',
      elementType: 'mc:AlternateContent',
      reason: 'test',
    };
    const unsupportedEl = makeEditableGeneric(
      `${partUri1}#88`,
      partUri1,
      genericIR,
      'unsupported',
    );
    const slides: EditableSlide[] = [
      { index: 0, partUri: partUri1, elements: [unsupportedEl] },
    ];
    const pres = new EditablePresentation(slides, new Map());
    expect(() =>
      pres.setFill(`${partUri1}#88`, { type: 'none' }),
    ).toThrow("Cannot set fill on element kind 'unsupported'");
  });
});

// ---------------------------------------------------------------------------
// deleteElement
// ---------------------------------------------------------------------------

describe('EditablePresentation — deleteElement', () => {
  it('soft-deletes an element', () => {
    const { presentation, shape1Id } = makeMockPresentation();
    presentation.deleteElement(shape1Id);

    const el = presentation.getElement(shape1Id)!;
    expect(el.deleted).toBe(true);
    expect(el.dirty.deleted).toBe(true);
  });

  it('marks the element dirty', () => {
    const { presentation, shape1Id } = makeMockPresentation();
    presentation.deleteElement(shape1Id);
    expect(presentation.isElementDirty(shape1Id)).toBe(true);
  });

  it('throws for non-existent elements', () => {
    const { presentation } = makeMockPresentation();
    expect(() => presentation.deleteElement('fake#id')).toThrow(
      'Element not found: fake#id',
    );
  });
});

// ---------------------------------------------------------------------------
// getDirtyParts
// ---------------------------------------------------------------------------

describe('EditablePresentation — getDirtyParts', () => {
  it('returns empty array when nothing is dirty', () => {
    const { presentation } = makeMockPresentation();
    expect(presentation.getDirtyParts()).toEqual([]);
  });

  it('returns part URIs that contain dirty elements', () => {
    const { presentation, shape1Id, shape3Id } = makeMockPresentation();
    presentation.moveElement(shape1Id, 1, 1);
    presentation.moveElement(shape3Id, 1, 1);

    const dirtyParts = presentation.getDirtyParts();
    expect(dirtyParts).toContain(partUri1);
    expect(dirtyParts).toContain(partUri2);
    expect(dirtyParts).toHaveLength(2);
  });

  it('returns unique part URIs when multiple elements in same part are dirty', () => {
    const { presentation, shape1Id, shape2Id } = makeMockPresentation();
    presentation.moveElement(shape1Id, 1, 1);
    presentation.moveElement(shape2Id, 1, 1);

    const dirtyParts = presentation.getDirtyParts();
    expect(dirtyParts).toEqual([partUri1]);
  });
});

// ---------------------------------------------------------------------------
// getDirtyElementsForPart
// ---------------------------------------------------------------------------

describe('EditablePresentation — getDirtyElementsForPart', () => {
  it('returns dirty elements for a specific part', () => {
    const { presentation, shape1Id, shape2Id } = makeMockPresentation();
    presentation.moveElement(shape1Id, 1, 1);

    const dirtyEls = presentation.getDirtyElementsForPart(partUri1);
    expect(dirtyEls).toHaveLength(1);
    expect(dirtyEls[0].id).toBe(shape1Id);
  });

  it('returns empty array for clean parts', () => {
    const { presentation } = makeMockPresentation();
    expect(presentation.getDirtyElementsForPart(partUri1)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Slide operations
// ---------------------------------------------------------------------------

describe('EditablePresentation — slide operations', () => {
  it('reorderSlides changes the slide order', () => {
    const { presentation } = makeMockPresentation();
    expect(presentation.getSlideOrder()).toEqual([partUri1, partUri2]);

    presentation.reorderSlides(0, 1);
    expect(presentation.getSlideOrder()).toEqual([partUri2, partUri1]);
  });

  it('isSlideOrderDirty detects order changes', () => {
    const { presentation } = makeMockPresentation();
    expect(presentation.isSlideOrderDirty()).toBe(false);

    presentation.reorderSlides(0, 1);
    expect(presentation.isSlideOrderDirty()).toBe(true);
  });

  it('deleteSlide marks the slide as deleted', () => {
    const { presentation } = makeMockPresentation();
    presentation.deleteSlide(0);

    expect(presentation.getDeletedSlides().has(0)).toBe(true);
    expect(presentation.isSlideOrderDirty()).toBe(true);
  });

  it('deleteSlide throws for out-of-range index', () => {
    const { presentation } = makeMockPresentation();
    expect(() => presentation.deleteSlide(-1)).toThrow(
      'Invalid slide index: -1',
    );
    expect(() => presentation.deleteSlide(5)).toThrow(
      'Invalid slide index: 5',
    );
  });

  it('reorderSlides throws for out-of-range indices', () => {
    const { presentation } = makeMockPresentation();
    expect(() => presentation.reorderSlides(-1, 0)).toThrow(
      'Invalid fromIndex: -1',
    );
    expect(() => presentation.reorderSlides(0, 5)).toThrow(
      'Invalid toIndex: 5',
    );
  });
});

// ---------------------------------------------------------------------------
// resetDirtyState
// ---------------------------------------------------------------------------

describe('EditablePresentation — resetDirtyState', () => {
  it('clears all dirty tracking', () => {
    const { presentation, shape1Id, shape2Id, shape3Id } =
      makeMockPresentation();
    presentation.moveElement(shape1Id, 1, 1);
    presentation.resizeElement(shape2Id, 100, 100);
    presentation.deleteElement(shape3Id);

    presentation.resetDirtyState();

    expect(presentation.isElementDirty(shape1Id)).toBe(false);
    expect(presentation.isElementDirty(shape2Id)).toBe(false);
    // shape3 is still marked "deleted" in its field, but dirty tracking is reset
    expect(presentation.isElementDirty(shape3Id)).toBe(false);
    expect(presentation.getDirtyParts()).toEqual([]);
  });

  it('clears per-field dirty flags', () => {
    const { presentation, shape1Id } = makeMockPresentation();
    presentation.moveElement(shape1Id, 1, 1);
    presentation.resizeElement(shape1Id, 100, 100);

    const el = presentation.getElement(shape1Id)!;
    expect(el.dirty.position).toBe(true);
    expect(el.dirty.size).toBe(true);

    presentation.resetDirtyState();
    expect(el.dirty.position).toBeUndefined();
    expect(el.dirty.size).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Group children registration
// ---------------------------------------------------------------------------

describe('EditablePresentation — group children', () => {
  it('registers group children in the element registry', () => {
    const childIR = makeShapeIR('10', 'Child');
    const groupIR: SlideElementIR = {
      kind: 'group',
      properties: {
        transform: {
          position: { x: 0, y: 0 },
          size: { width: 1000000, height: 1000000 },
        },
        effects: [],
      },
      childOffset: { x: 0, y: 0 },
      childExtent: { width: 1000000, height: 1000000 },
      children: [childIR],
    };

    const childEl: EditableShape = {
      id: `${partUri1}#10`,
      kind: 'shape',
      originalIR: childIR,
      originalPartUri: partUri1,
      dirty: {},
      transform: { x: 0, y: 0, width: 100000, height: 100000 },
      deleted: false,
    };

    const groupEl: EditableGroup = {
      id: `${partUri1}#20`,
      kind: 'group',
      originalIR: groupIR,
      originalPartUri: partUri1,
      dirty: {},
      transform: { x: 0, y: 0, width: 1000000, height: 1000000 },
      deleted: false,
      children: [childEl],
    };

    const slides: EditableSlide[] = [
      { index: 0, partUri: partUri1, elements: [groupEl] },
    ];
    const pres = new EditablePresentation(slides, new Map());

    // Both group and child should be findable by ID
    expect(pres.getElement(`${partUri1}#20`)).toBeDefined();
    expect(pres.getElement(`${partUri1}#10`)).toBeDefined();
  });

  it('registers deeply nested group children', () => {
    const deepChildIR = makeShapeIR('100', 'DeepChild');
    const innerGroupIR: SlideElementIR = {
      kind: 'group',
      properties: { effects: [] },
      childOffset: { x: 0, y: 0 },
      childExtent: { width: 500, height: 500 },
      children: [deepChildIR],
    };

    const deepChildEl: EditableShape = {
      id: `${partUri1}#100`,
      kind: 'shape',
      originalIR: deepChildIR,
      originalPartUri: partUri1,
      dirty: {},
      transform: { x: 0, y: 0, width: 100, height: 100 },
      deleted: false,
    };

    const innerGroupEl: EditableGroup = {
      id: `${partUri1}#50`,
      kind: 'group',
      originalIR: innerGroupIR,
      originalPartUri: partUri1,
      dirty: {},
      transform: { x: 0, y: 0, width: 500, height: 500 },
      deleted: false,
      children: [deepChildEl],
    };

    const outerGroupEl: EditableGroup = {
      id: `${partUri1}#30`,
      kind: 'group',
      originalIR: innerGroupIR, // reusing IR for simplicity
      originalPartUri: partUri1,
      dirty: {},
      transform: { x: 0, y: 0, width: 1000, height: 1000 },
      deleted: false,
      children: [innerGroupEl],
    };

    const slides: EditableSlide[] = [
      { index: 0, partUri: partUri1, elements: [outerGroupEl] },
    ];
    const pres = new EditablePresentation(slides, new Map());

    expect(pres.getElement(`${partUri1}#30`)).toBeDefined();
    expect(pres.getElement(`${partUri1}#50`)).toBeDefined();
    expect(pres.getElement(`${partUri1}#100`)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// originalPartXml
// ---------------------------------------------------------------------------

describe('EditablePresentation — originalPartXml', () => {
  it('stores original XML per part', () => {
    const { presentation } = makeMockPresentation();
    expect(presentation.originalPartXml.get(partUri1)).toBe(
      '<p:sld>...</p:sld>',
    );
    expect(presentation.originalPartXml.get(partUri2)).toBe(
      '<p:sld>...</p:sld>',
    );
  });
});
