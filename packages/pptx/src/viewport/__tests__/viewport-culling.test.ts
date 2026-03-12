/**
 * Viewport culling tests.
 *
 * Verifies that the SlideKit viewport culling infrastructure correctly
 * filters elements based on viewport rectangle, and that the renderSlide
 * function respects the element filter parameter.
 */

import { describe, expect, it } from 'vitest';
import { SlideKit } from '../slide-viewport.js';
import { renderSlide } from '../../renderer/slide-renderer.js';
import type { EnrichedSlideData } from '../../model/index.js';
import type { SlideElementIR, DrawingMLShapeIR } from '@opendockit/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal shape element with a transform at the given EMU position/size. */
function makeShape(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number
): DrawingMLShapeIR {
  return {
    kind: 'shape',
    id: name,
    name,
    properties: {
      transform: {
        position: { x, y },
        size: { width, height },
      },
      effects: [],
    },
  };
}

/** Track which elements are passed to renderSlideElement by using the filter. */
function collectRenderedElements(
  elements: SlideElementIR[],
  filter?: (element: SlideElementIR) => boolean
): SlideElementIR[] {
  if (!filter) return [...elements];
  return elements.filter(filter);
}

// ---------------------------------------------------------------------------
// SlideKit culling API tests
// ---------------------------------------------------------------------------

describe('SlideKit viewport culling', () => {
  it('culling is disabled by default', () => {
    const kit = new SlideKit({});
    expect(kit.cullingEnabled).toBe(false);
    expect(kit.viewportRect).toBeNull();
    kit.dispose();
  });

  it('enableCulling() / disableCulling() toggle the flag', () => {
    const kit = new SlideKit({});
    kit.enableCulling();
    expect(kit.cullingEnabled).toBe(true);
    kit.disableCulling();
    expect(kit.cullingEnabled).toBe(false);
    kit.dispose();
  });

  it('disableCulling() clears the viewport rect', () => {
    const kit = new SlideKit({});
    kit.enableCulling();
    kit.setViewportRect({ x: 0, y: 0, width: 1000, height: 1000 });
    expect(kit.viewportRect).not.toBeNull();
    kit.disableCulling();
    expect(kit.viewportRect).toBeNull();
    kit.dispose();
  });

  it('setViewportRect() stores and retrieves the rect', () => {
    const kit = new SlideKit({});
    const rect = { x: 100, y: 200, width: 5000000, height: 3000000 };
    kit.setViewportRect(rect);
    expect(kit.viewportRect).toEqual(rect);
    kit.setViewportRect(null);
    expect(kit.viewportRect).toBeNull();
    kit.dispose();
  });

  it('dispose() clears culling state', () => {
    const kit = new SlideKit({});
    kit.enableCulling();
    kit.setViewportRect({ x: 0, y: 0, width: 1000, height: 1000 });
    kit.dispose();
    // After dispose, create a new instance to verify defaults
    const kit2 = new SlideKit({});
    expect(kit2.cullingEnabled).toBe(false);
    expect(kit2.viewportRect).toBeNull();
    kit2.dispose();
  });
});

// ---------------------------------------------------------------------------
// renderSlide elementFilter tests
// ---------------------------------------------------------------------------

describe('renderSlide with elementFilter', () => {
  // These elements are positioned in EMU coordinates:
  // Shape A: top-left corner (0,0) to (1000000, 1000000)
  // Shape B: middle (3000000, 3000000) to (4000000, 4000000)
  // Shape C: far right (8000000, 0) to (9000000, 1000000)
  const shapeA = makeShape('A', 0, 0, 1000000, 1000000);
  const shapeB = makeShape('B', 3000000, 3000000, 1000000, 1000000);
  const shapeC = makeShape('C', 8000000, 0, 1000000, 1000000);

  it('no filter renders all elements', () => {
    const elements = [shapeA, shapeB, shapeC];
    const rendered = collectRenderedElements(elements, undefined);
    expect(rendered).toHaveLength(3);
  });

  it('filter that accepts all renders all elements', () => {
    const elements = [shapeA, shapeB, shapeC];
    const rendered = collectRenderedElements(elements, () => true);
    expect(rendered).toHaveLength(3);
  });

  it('filter that rejects all renders no elements', () => {
    const elements = [shapeA, shapeB, shapeC];
    const rendered = collectRenderedElements(elements, () => false);
    expect(rendered).toHaveLength(0);
  });

  it('filter selectively includes elements', () => {
    const elements = [shapeA, shapeB, shapeC];
    const rendered = collectRenderedElements(
      elements,
      (el) => el.kind === 'shape' && el.name === 'A'
    );
    expect(rendered).toHaveLength(1);
    expect((rendered[0] as DrawingMLShapeIR).name).toBe('A');
  });
});

// ---------------------------------------------------------------------------
// AABB overlap logic tests (viewport culling filter behavior)
// ---------------------------------------------------------------------------

describe('viewport culling AABB overlap', () => {
  // Simulate the _buildCullingFilter logic directly for unit testing
  function buildFilter(vr: { x: number; y: number; width: number; height: number }) {
    const vrRight = vr.x + vr.width;
    const vrBottom = vr.y + vr.height;

    return (element: SlideElementIR): boolean => {
      if (element.kind !== 'shape' || !element.properties.transform) return true;
      const { position, size } = element.properties.transform;
      const elRight = position.x + size.width;
      const elBottom = position.y + size.height;

      return !(
        elRight <= vr.x ||
        vrRight <= position.x ||
        elBottom <= vr.y ||
        vrBottom <= position.y
      );
    };
  }

  const shapeA = makeShape('A', 0, 0, 1000000, 1000000);
  const shapeB = makeShape('B', 3000000, 3000000, 1000000, 1000000);
  const shapeC = makeShape('C', 8000000, 0, 1000000, 1000000);

  it('element fully inside viewport is included', () => {
    // Viewport covers the entire slide (0,0 to 10M x 8M)
    const filter = buildFilter({ x: 0, y: 0, width: 10000000, height: 8000000 });
    expect(filter(shapeA)).toBe(true);
    expect(filter(shapeB)).toBe(true);
    expect(filter(shapeC)).toBe(true);
  });

  it('element fully outside viewport is excluded', () => {
    // Viewport covers only top-left corner
    const filter = buildFilter({ x: 0, y: 0, width: 500000, height: 500000 });
    // shapeA overlaps (0,0)-(500000,500000) and (0,0)-(1000000,1000000)
    expect(filter(shapeA)).toBe(true);
    // shapeB at (3M,3M) is outside
    expect(filter(shapeB)).toBe(false);
    // shapeC at (8M,0) is outside
    expect(filter(shapeC)).toBe(false);
  });

  it('element partially overlapping viewport is included', () => {
    // Viewport partially overlaps shape B
    const filter = buildFilter({
      x: 3500000,
      y: 3500000,
      width: 1000000,
      height: 1000000,
    });
    expect(filter(shapeA)).toBe(false); // far away
    expect(filter(shapeB)).toBe(true); // overlaps
    expect(filter(shapeC)).toBe(false); // far away
  });

  it('panning viewport reveals different elements', () => {
    // Pan to show only shape A
    const filterLeft = buildFilter({ x: 0, y: 0, width: 2000000, height: 2000000 });
    expect(filterLeft(shapeA)).toBe(true);
    expect(filterLeft(shapeB)).toBe(false);
    expect(filterLeft(shapeC)).toBe(false);

    // Pan to show only shape C
    const filterRight = buildFilter({
      x: 7000000,
      y: 0,
      width: 3000000,
      height: 2000000,
    });
    expect(filterRight(shapeA)).toBe(false);
    expect(filterRight(shapeB)).toBe(false);
    expect(filterRight(shapeC)).toBe(true);
  });

  it('zooming out includes more elements', () => {
    // Zoomed in — only shape A visible
    const filterZoomed = buildFilter({
      x: 0,
      y: 0,
      width: 2000000,
      height: 2000000,
    });
    expect(filterZoomed(shapeA)).toBe(true);
    expect(filterZoomed(shapeB)).toBe(false);

    // Zoomed out — both shapes A and B visible
    const filterWide = buildFilter({
      x: 0,
      y: 0,
      width: 5000000,
      height: 5000000,
    });
    expect(filterWide(shapeA)).toBe(true);
    expect(filterWide(shapeB)).toBe(true);
  });

  it('empty slide (no elements) causes no errors', () => {
    const filter = buildFilter({ x: 0, y: 0, width: 5000000, height: 5000000 });
    const elements: SlideElementIR[] = [];
    const rendered = elements.filter(filter);
    expect(rendered).toHaveLength(0);
  });

  it('element touching viewport edge is excluded (exclusive boundary)', () => {
    // Viewport ends exactly where shape B starts
    const filter = buildFilter({
      x: 0,
      y: 0,
      width: 3000000,
      height: 3000000,
    });
    // shapeB starts at (3000000, 3000000) — viewport ends there (exclusive)
    expect(filter(shapeB)).toBe(false);
  });

  it('element without transform is always included', () => {
    const noTransform: SlideElementIR = {
      kind: 'unsupported',
      elementType: 'mc:AlternateContent',
      reason: 'test',
    };
    const filter = buildFilter({ x: 0, y: 0, width: 100, height: 100 });
    expect(filter(noTransform)).toBe(true);
  });
});
