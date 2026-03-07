import { describe, it, expect } from 'vitest';
import { getRedactionPreview, formatRedactionLog } from '../redaction-preview.js';
import type { PageElement, TextElement, ShapeElement, ImageElement, PathElement } from '../types.js';

// ─── Mock element factories ────────────────────────────────

function makeTextElement(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: 'text-1',
    type: 'text',
    x: 72,
    y: 540,
    width: 200,
    height: 20,
    rotation: 0,
    opacity: 1,
    index: '0',
    parentId: null,
    locked: false,
    paragraphs: [
      {
        runs: [
          {
            text: 'Account Number: 1234-5678',
            fontFamily: 'Helvetica',
            fontSize: 12,
            color: { r: 0, g: 0, b: 0 },
            x: 0,
            y: 0,
            width: 180,
            height: 14,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeShapeElement(overrides: Partial<ShapeElement> = {}): ShapeElement {
  return {
    id: 'shape-1',
    type: 'shape',
    x: 70,
    y: 515,
    width: 240,
    height: 45,
    rotation: 0,
    opacity: 1,
    index: '1',
    parentId: null,
    locked: false,
    shapeType: 'rectangle',
    fill: { type: 'solid', color: { r: 1, g: 1, b: 1 } },
    stroke: null,
    ...overrides,
  };
}

function makeImageElement(overrides: Partial<ImageElement> = {}): ImageElement {
  return {
    id: 'image-1',
    type: 'image',
    x: 200,
    y: 400,
    width: 150,
    height: 100,
    rotation: 0,
    opacity: 1,
    index: '2',
    parentId: null,
    locked: false,
    imageRef: 'Im0',
    mimeType: 'image/jpeg',
    objectFit: 'fill',
    ...overrides,
  };
}

function makePathElement(overrides: Partial<PathElement> = {}): PathElement {
  return {
    id: 'path-1',
    type: 'path',
    x: 50,
    y: 500,
    width: 100,
    height: 30,
    rotation: 0,
    opacity: 1,
    index: '3',
    parentId: null,
    locked: false,
    d: 'M 0 0 L 100 0 L 100 30 L 0 30 Z',
    fill: null,
    stroke: { color: { r: 0, g: 0, b: 0 }, width: 1 },
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────

describe('getRedactionPreview', () => {
  it('returns correct count and descriptions for matching elements', () => {
    const elements: PageElement[] = [
      makeTextElement(),
      makeShapeElement(),
    ];
    // Rect that overlaps both elements
    const rect = { x: 60, y: 510, width: 250, height: 60 };
    const preview = getRedactionPreview(elements, rect);

    expect(preview.count).toBe(2);
    expect(preview.elements).toHaveLength(2);
    expect(preview.descriptions).toHaveLength(2);
    expect(preview.rect).toEqual(rect);
  });

  it('includes text content and font info for text elements', () => {
    const elements: PageElement[] = [makeTextElement()];
    const rect = { x: 60, y: 530, width: 250, height: 40 };
    const preview = getRedactionPreview(elements, rect);

    expect(preview.count).toBe(1);
    const desc = preview.descriptions[0];
    expect(desc.type).toBe('text');
    expect(desc.text).toBe('Account Number: 1234-5678');
    expect(desc.fontInfo).toBe('12pt Helvetica');
    expect(desc.colorInfo).toBe('#000000');
    expect(desc.position).toEqual({ x: 72, y: 540 });
    expect(desc.size).toEqual({ width: 200, height: 20 });
  });

  it('includes color info for shape elements', () => {
    const elements: PageElement[] = [makeShapeElement()];
    const rect = { x: 60, y: 510, width: 250, height: 60 };
    const preview = getRedactionPreview(elements, rect);

    expect(preview.count).toBe(1);
    const desc = preview.descriptions[0];
    expect(desc.type).toBe('shape');
    expect(desc.colorInfo).toBe('filled #ffffff');
  });

  it('includes stroked color for shape with no fill', () => {
    const shape = makeShapeElement({
      fill: null,
      stroke: { color: { r: 1, g: 0, b: 0 }, width: 2 },
    });
    const elements: PageElement[] = [shape];
    const rect = { x: 60, y: 510, width: 250, height: 60 };
    const preview = getRedactionPreview(elements, rect);

    expect(preview.descriptions[0].colorInfo).toBe('stroked #ff0000');
  });

  it('handles mixed element types correctly', () => {
    const elements: PageElement[] = [
      makeTextElement({ x: 50, y: 500 }),
      makeShapeElement({ x: 50, y: 500, width: 100, height: 30 }),
      makeImageElement({ x: 50, y: 500, width: 80, height: 60 }),
      makePathElement({ x: 50, y: 500 }),
    ];
    // Big rect overlapping everything
    const rect = { x: 0, y: 400, width: 500, height: 200 };
    const preview = getRedactionPreview(elements, rect);

    expect(preview.count).toBe(4);
    expect(preview.descriptions.map(d => d.type)).toEqual([
      'text', 'shape', 'image', 'path',
    ]);
    // Text description has text
    expect(preview.descriptions[0].text).toBe('Account Number: 1234-5678');
    // Image description has mimeType in text field
    expect(preview.descriptions[2].text).toBe('image/jpeg');
  });

  it('returns empty results when no elements match', () => {
    const elements: PageElement[] = [
      makeTextElement({ x: 500, y: 500 }),
      makeShapeElement({ x: 600, y: 600 }),
    ];
    // Rect far from any element
    const rect = { x: 0, y: 0, width: 50, height: 50 };
    const preview = getRedactionPreview(elements, rect);

    expect(preview.count).toBe(0);
    expect(preview.elements).toHaveLength(0);
    expect(preview.descriptions).toHaveLength(0);
    expect(preview.summary).toBe('Redacting 0 elements:');
  });

  it('truncates long text (>60 chars) in summary', () => {
    const longText = 'This is a very long text string that exceeds sixty characters and should be truncated in the summary output';
    const textEl = makeTextElement({
      paragraphs: [
        {
          runs: [
            {
              text: longText,
              fontFamily: 'Helvetica',
              fontSize: 10,
              color: { r: 0, g: 0, b: 0 },
              x: 0,
              y: 0,
              width: 500,
              height: 12,
            },
          ],
        },
      ],
    });
    const elements: PageElement[] = [textEl];
    const rect = { x: 60, y: 530, width: 250, height: 40 };
    const preview = getRedactionPreview(elements, rect);

    // Full text preserved in description
    expect(preview.descriptions[0].text).toBe(longText);

    // Summary should have truncated version (57 chars + '...')
    expect(preview.summary).toContain('...');
    // Extract the quoted text from the summary line
    const match = preview.summary.match(/"([^"]+)"/);
    expect(match).toBeTruthy();
    expect(match![1].length).toBe(60); // 57 chars + '...'
  });

  it('uses singular "element" for count=1 in summary', () => {
    const elements: PageElement[] = [makeTextElement()];
    const rect = { x: 60, y: 530, width: 250, height: 40 };
    const preview = getRedactionPreview(elements, rect);

    expect(preview.summary).toContain('Redacting 1 element:');
    expect(preview.summary).not.toContain('elements');
  });

  it('uses plural "elements" for count!=1 in summary', () => {
    const elements: PageElement[] = [
      makeTextElement(),
      makeShapeElement(),
    ];
    const rect = { x: 60, y: 510, width: 250, height: 60 };
    const preview = getRedactionPreview(elements, rect);

    expect(preview.summary).toContain('Redacting 2 elements:');
  });

  it('handles text element with multiple paragraphs and runs', () => {
    const textEl = makeTextElement({
      paragraphs: [
        {
          runs: [
            { text: 'Hello ', fontFamily: 'Arial', fontSize: 14, color: { r: 0, g: 0, b: 0 }, x: 0, y: 0, width: 40, height: 16 },
            { text: 'World', fontFamily: 'Arial, sans-serif', fontSize: 14, color: { r: 1, g: 0, b: 0 }, x: 40, y: 0, width: 40, height: 16 },
          ],
        },
        {
          runs: [
            { text: 'Line 2', fontFamily: 'Arial', fontSize: 12, color: { r: 0, g: 0, b: 0 }, x: 0, y: 16, width: 50, height: 14 },
          ],
        },
      ],
    });
    const elements: PageElement[] = [textEl];
    const rect = { x: 60, y: 530, width: 250, height: 40 };
    const preview = getRedactionPreview(elements, rect);

    // All text joined into single string
    expect(preview.descriptions[0].text).toBe('Hello WorldLine 2');
    // Font info from first run
    expect(preview.descriptions[0].fontInfo).toBe('14pt Arial');
  });
});

describe('formatRedactionLog', () => {
  it('returns the summary string from the preview', () => {
    const elements: PageElement[] = [makeTextElement()];
    const rect = { x: 60, y: 530, width: 250, height: 40 };
    const preview = getRedactionPreview(elements, rect);
    const log = formatRedactionLog(preview);

    expect(log).toBe(preview.summary);
    expect(log).toContain('Redacting 1 element:');
    expect(log).toContain('Text: "Account Number: 1234-5678"');
    expect(log).toContain('12pt Helvetica');
  });

  it('produces multi-line output for multiple elements', () => {
    const elements: PageElement[] = [
      makeTextElement({ x: 50, y: 500 }),
      makeShapeElement({ x: 50, y: 500, width: 100, height: 30 }),
    ];
    const rect = { x: 0, y: 400, width: 500, height: 200 };
    const preview = getRedactionPreview(elements, rect);
    const log = formatRedactionLog(preview);

    const lines = log.split('\n');
    expect(lines.length).toBe(3); // header + 2 element lines
    expect(lines[0]).toContain('Redacting 2 elements:');
    expect(lines[1]).toContain('Text:');
    expect(lines[2]).toContain('Shape:');
  });
});
