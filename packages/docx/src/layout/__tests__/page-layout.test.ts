import { describe, it, expect } from 'vitest';
import { computePageDimensions } from '../page-layout.js';
import type { SectionIR } from '../../model/document-ir.js';

function makeSection(overrides?: Partial<SectionIR>): SectionIR {
  return {
    pageWidth: 612,
    pageHeight: 792,
    marginTop: 72,
    marginBottom: 72,
    marginLeft: 72,
    marginRight: 72,
    paragraphs: [],
    ...overrides,
  };
}

describe('computePageDimensions', () => {
  it('should compute content area for US Letter with 1" margins', () => {
    const dims = computePageDimensions(makeSection());
    expect(dims.pageWidth).toBe(612);
    expect(dims.pageHeight).toBe(792);
    expect(dims.contentArea.x).toBe(72);
    expect(dims.contentArea.y).toBe(72);
    expect(dims.contentArea.width).toBe(468); // 612 - 72 - 72
    expect(dims.contentArea.height).toBe(648); // 792 - 72 - 72
  });

  it('should compute content area for A4 with 1" margins', () => {
    const dims = computePageDimensions(
      makeSection({
        pageWidth: 595.3,
        pageHeight: 841.9,
      })
    );
    expect(dims.contentArea.width).toBeCloseTo(451.3, 1);
    expect(dims.contentArea.height).toBeCloseTo(697.9, 1);
  });

  it('should compute content area with zero margins', () => {
    const dims = computePageDimensions(
      makeSection({
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
      })
    );
    expect(dims.contentArea.x).toBe(0);
    expect(dims.contentArea.y).toBe(0);
    expect(dims.contentArea.width).toBe(612);
    expect(dims.contentArea.height).toBe(792);
  });

  it('should compute content area with asymmetric margins', () => {
    const dims = computePageDimensions(
      makeSection({
        marginTop: 36,
        marginBottom: 72,
        marginLeft: 54,
        marginRight: 90,
      })
    );
    expect(dims.contentArea.x).toBe(54);
    expect(dims.contentArea.y).toBe(36);
    expect(dims.contentArea.width).toBe(468); // 612 - 54 - 90
    expect(dims.contentArea.height).toBe(684); // 792 - 36 - 72
  });

  it('should clamp content area to zero if margins exceed page size', () => {
    const dims = computePageDimensions(
      makeSection({
        pageWidth: 100,
        marginLeft: 60,
        marginRight: 60,
      })
    );
    expect(dims.contentArea.width).toBe(0);
  });
});
