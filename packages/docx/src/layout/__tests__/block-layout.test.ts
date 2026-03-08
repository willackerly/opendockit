import { describe, it, expect } from 'vitest';
import { layoutSection, layoutDocument, estimateParagraphHeight } from '../block-layout.js';
import type { SectionIR, ParagraphIR, RunIR } from '../../model/document-ir.js';

function makeRun(text: string, overrides?: Partial<RunIR>): RunIR {
  return { text, ...overrides };
}

function makePara(runs: RunIR[], overrides?: Partial<ParagraphIR>): ParagraphIR {
  return { runs, ...overrides };
}

function makeSection(paragraphs: ParagraphIR[], overrides?: Partial<SectionIR>): SectionIR {
  return {
    pageWidth: 612,
    pageHeight: 792,
    marginTop: 72,
    marginBottom: 72,
    marginLeft: 72,
    marginRight: 72,
    paragraphs,
    ...overrides,
  };
}

describe('estimateParagraphHeight', () => {
  it('should estimate height for empty paragraph', () => {
    const para = makePara([]);
    const height = estimateParagraphHeight(para);
    // Default: 11pt * 1.15 line spacing
    expect(height).toBeCloseTo(12.65, 1);
  });

  it('should use largest font size in the paragraph', () => {
    const para = makePara([makeRun('Small', { fontSize: 10 }), makeRun('Big', { fontSize: 24 })]);
    const height = estimateParagraphHeight(para);
    // 24pt * 1.15 = 27.6
    expect(height).toBeCloseTo(27.6, 1);
  });

  it('should use custom line spacing', () => {
    const para = makePara([makeRun('Double', { fontSize: 12 })], {
      lineSpacing: 2.0,
    });
    const height = estimateParagraphHeight(para);
    expect(height).toBe(24); // 12 * 2.0
  });

  it('should use default font size when runs have no font size', () => {
    const para = makePara([makeRun('Default size')]);
    const height = estimateParagraphHeight(para);
    // 11pt * 1.15 = 12.65
    expect(height).toBeCloseTo(12.65, 1);
  });
});

describe('layoutSection', () => {
  it('should produce one page for a single paragraph', () => {
    const section = makeSection([makePara([makeRun('Hello')])]);
    const result = layoutSection(section);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].paragraphs).toHaveLength(1);
  });

  it('should produce one page for empty section', () => {
    const section = makeSection([]);
    const result = layoutSection(section);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].paragraphs).toHaveLength(0);
  });

  it('should report correct page dimensions', () => {
    const section = makeSection([]);
    const result = layoutSection(section);
    expect(result.pageWidth).toBe(612);
    expect(result.pageHeight).toBe(792);
  });

  it('should position first paragraph at y=0', () => {
    const section = makeSection([makePara([makeRun('First')])]);
    const result = layoutSection(section);
    expect(result.pages[0].paragraphs[0].y).toBe(0);
  });

  it('should stack paragraphs vertically with spacing', () => {
    const section = makeSection([
      makePara([makeRun('Para 1')], { spacingAfter: 10 }),
      makePara([makeRun('Para 2')], { spacingBefore: 5 }),
    ]);
    const result = layoutSection(section);
    const paras = result.pages[0].paragraphs;
    expect(paras).toHaveLength(2);
    // Second paragraph should be offset by first paragraph's height + spacing
    expect(paras[1].y).toBeGreaterThan(0);
  });

  it('should break to a new page when content exceeds page height', () => {
    // Create a section with many large paragraphs that exceed a page
    const paragraphs: ParagraphIR[] = [];
    // Content height = 792 - 72 - 72 = 648pt
    // Each paragraph with 72pt font: ~72 * 1.15 = 82.8pt height + 8pt spacing = ~90.8pt
    // About 7 paragraphs per page
    for (let i = 0; i < 15; i++) {
      paragraphs.push(makePara([makeRun(`Para ${i}`, { fontSize: 72 })]));
    }
    const section = makeSection(paragraphs);
    const result = layoutSection(section);
    expect(result.pages.length).toBeGreaterThan(1);
  });

  it('should have correct page indices', () => {
    const paragraphs: ParagraphIR[] = [];
    for (let i = 0; i < 30; i++) {
      paragraphs.push(makePara([makeRun(`Para ${i}`, { fontSize: 48 })]));
    }
    const section = makeSection(paragraphs);
    const result = layoutSection(section);
    for (let i = 0; i < result.pages.length; i++) {
      expect(result.pages[i].pageIndex).toBe(i);
    }
  });

  it('should start new page paragraphs at y=0', () => {
    const paragraphs: ParagraphIR[] = [];
    for (let i = 0; i < 30; i++) {
      paragraphs.push(makePara([makeRun(`Para ${i}`, { fontSize: 48 })]));
    }
    const section = makeSection(paragraphs);
    const result = layoutSection(section);
    if (result.pages.length > 1) {
      expect(result.pages[1].paragraphs[0].y).toBe(0);
    }
  });

  it('should not apply spacingBefore to the first paragraph on a page', () => {
    const paragraphs: ParagraphIR[] = [];
    // Fill first page
    for (let i = 0; i < 20; i++) {
      paragraphs.push(makePara([makeRun(`Para ${i}`, { fontSize: 48 })], { spacingBefore: 20 }));
    }
    const section = makeSection(paragraphs);
    const result = layoutSection(section);
    // First paragraph on each page should start at y=0 (no spacingBefore)
    for (const page of result.pages) {
      if (page.paragraphs.length > 0) {
        expect(page.paragraphs[0].y).toBe(0);
      }
    }
  });
});

describe('layoutDocument', () => {
  it('should layout each section independently', () => {
    const sections = [
      makeSection([makePara([makeRun('Section 1')])]),
      makeSection([makePara([makeRun('Section 2')])]),
    ];
    const results = layoutDocument(sections);
    expect(results).toHaveLength(2);
    expect(results[0].pages[0].paragraphs[0].paragraph.runs[0].text).toBe('Section 1');
    expect(results[1].pages[0].paragraphs[0].paragraph.runs[0].text).toBe('Section 2');
  });

  it('should handle empty sections array', () => {
    const results = layoutDocument([]);
    expect(results).toHaveLength(0);
  });

  it('should preserve different page dimensions per section', () => {
    const sections = [
      makeSection([makePara([makeRun('Letter')])], {
        pageWidth: 612,
        pageHeight: 792,
      }),
      makeSection([makePara([makeRun('A4')])], {
        pageWidth: 595.3,
        pageHeight: 841.9,
      }),
    ];
    const results = layoutDocument(sections);
    expect(results[0].pageWidth).toBe(612);
    expect(results[1].pageWidth).toBeCloseTo(595.3, 1);
  });
});
