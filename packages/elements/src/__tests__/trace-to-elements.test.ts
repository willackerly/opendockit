/**
 * Tests for trace-to-elements converter.
 */

import { describe, it, expect } from 'vitest';
import { traceToElements, parseCssColor, parseCssFont } from '../debug/trace-to-elements.js';
import type { RenderTrace } from '../debug/trace-to-elements.js';
import type { TextElement, ShapeElement, ImageElement } from '../types.js';

function makeTrace(events: RenderTrace['events']): RenderTrace {
  return {
    events,
    slideWidthPt: 720,
    slideHeightPt: 540,
    source: 'test',
    timestamp: Date.now(),
    config: {},
  };
}

describe('parseCssColor', () => {
  it('parses rgba()', () => {
    expect(parseCssColor('rgba(255, 128, 0, 0.5)')).toEqual({
      r: 255,
      g: 128,
      b: 0,
      a: 0.5,
    });
  });

  it('parses rgb()', () => {
    expect(parseCssColor('rgb(10, 20, 30)')).toEqual({
      r: 10,
      g: 20,
      b: 30,
      a: 1,
    });
  });

  it('parses #rrggbb', () => {
    expect(parseCssColor('#ff8000')).toEqual({ r: 255, g: 128, b: 0, a: 1 });
  });

  it('parses #rgb', () => {
    expect(parseCssColor('#f80')).toEqual({ r: 255, g: 136, b: 0, a: 1 });
  });

  it('returns black for empty input', () => {
    expect(parseCssColor('')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });
});

describe('parseCssFont', () => {
  it('extracts family from simple font string', () => {
    expect(parseCssFont('16px Arial').fontFamily).toBe('Arial');
  });

  it('detects bold', () => {
    expect(parseCssFont('bold 16px Arial').bold).toBe(true);
  });

  it('detects italic', () => {
    expect(parseCssFont('italic 16px Arial').italic).toBe(true);
  });

  it('handles quoted family names', () => {
    const result = parseCssFont("14px 'Segoe UI', sans-serif");
    expect(result.fontFamily).toBe('Segoe UI');
  });

  it('returns sans-serif as default', () => {
    expect(parseCssFont('invalid').fontFamily).toBe('sans-serif');
  });
});

describe('traceToElements', () => {
  it('converts a text trace event into a TextElement', () => {
    const trace = makeTrace([
      {
        kind: 'text' as const,
        text: 'Hello World',
        x: 10,
        y: 20,
        width: 80,
        fontSizePt: 12,
        fontString: 'bold 16px Arial',
        fillStyle: 'rgba(0,0,0,1)',
        ctm: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
        shapeId: 'sp1',
        shapeName: 'Title',
        paragraphIndex: 0,
        runIndex: 0,
      },
    ]);

    const elements = traceToElements(trace);
    expect(elements).toHaveLength(1);
    const el = elements[0] as TextElement;
    expect(el.type).toBe('text');
    expect(el.id).toBe('sp1');
    expect(el.paragraphs).toHaveLength(1);
    expect(el.paragraphs[0].runs).toHaveLength(1);
    expect(el.paragraphs[0].runs[0].text).toBe('Hello World');
    expect(el.paragraphs[0].runs[0].fontFamily).toBe('Arial');
    expect(el.paragraphs[0].runs[0].bold).toBe(true);
    expect(el.paragraphs[0].runs[0].fontSize).toBe(12);
  });

  it('groups multiple text events by shapeId', () => {
    const trace = makeTrace([
      {
        kind: 'text' as const,
        text: 'Run 1',
        x: 10,
        y: 20,
        width: 30,
        fontSizePt: 12,
        fontString: '16px Arial',
        fillStyle: 'rgba(0,0,0,1)',
        ctm: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
        shapeId: 'sp1',
        paragraphIndex: 0,
        runIndex: 0,
      },
      {
        kind: 'text' as const,
        text: 'Run 2',
        x: 40,
        y: 20,
        width: 30,
        fontSizePt: 12,
        fontString: 'bold 16px Arial',
        fillStyle: 'rgba(255,0,0,1)',
        ctm: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
        shapeId: 'sp1',
        paragraphIndex: 0,
        runIndex: 1,
      },
    ]);

    const elements = traceToElements(trace);
    expect(elements).toHaveLength(1);
    const el = elements[0] as TextElement;
    expect(el.paragraphs[0].runs).toHaveLength(2);
    expect(el.paragraphs[0].runs[0].text).toBe('Run 1');
    expect(el.paragraphs[0].runs[1].text).toBe('Run 2');
  });

  it('separates elements by shapeId', () => {
    const trace = makeTrace([
      {
        kind: 'text' as const,
        text: 'Shape A',
        x: 10,
        y: 20,
        width: 50,
        fontSizePt: 12,
        fontString: '16px Arial',
        fillStyle: 'rgba(0,0,0,1)',
        ctm: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
        shapeId: 'sp1',
        paragraphIndex: 0,
        runIndex: 0,
      },
      {
        kind: 'text' as const,
        text: 'Shape B',
        x: 100,
        y: 20,
        width: 50,
        fontSizePt: 14,
        fontString: '18px Calibri',
        fillStyle: 'rgba(0,0,0,1)',
        ctm: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
        shapeId: 'sp2',
        paragraphIndex: 0,
        runIndex: 0,
      },
    ]);

    const elements = traceToElements(trace);
    expect(elements).toHaveLength(2);
    expect(elements[0].id).toBe('sp1');
    expect(elements[1].id).toBe('sp2');
  });

  it('converts shape events into ShapeElement', () => {
    const trace = makeTrace([
      {
        kind: 'shape' as const,
        operation: 'fillRect' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        fill: 'rgba(255,0,0,1)',
        ctm: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
        shapeId: 'rect1',
      },
    ]);

    const elements = traceToElements(trace);
    expect(elements).toHaveLength(1);
    const el = elements[0] as ShapeElement;
    expect(el.type).toBe('shape');
    expect(el.fill).toEqual({ type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 } });
  });

  it('converts image events into ImageElement', () => {
    const trace = makeTrace([
      {
        kind: 'image' as const,
        x: 50,
        y: 60,
        width: 200,
        height: 150,
        ctm: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
        shapeId: 'pic1',
      },
    ]);

    const elements = traceToElements(trace);
    expect(elements).toHaveLength(1);
    const el = elements[0] as ImageElement;
    expect(el.type).toBe('image');
    expect(el.x).toBe(50);
    expect(el.y).toBe(60);
  });

  it('assigns synthetic IDs to events without shapeId', () => {
    const trace = makeTrace([
      {
        kind: 'shape' as const,
        operation: 'fill' as const,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        fill: 'red',
        ctm: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
      },
      {
        kind: 'shape' as const,
        operation: 'fill' as const,
        x: 20,
        y: 20,
        width: 10,
        height: 10,
        fill: 'blue',
        ctm: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
      },
    ]);

    const elements = traceToElements(trace);
    expect(elements).toHaveLength(2);
    expect(elements[0].id).toMatch(/^trace-anon-/);
    expect(elements[1].id).toMatch(/^trace-anon-/);
    expect(elements[0].id).not.toBe(elements[1].id);
  });

  it('groups text events by paragraphIndex', () => {
    const trace = makeTrace([
      {
        kind: 'text' as const,
        text: 'Paragraph 1',
        x: 10,
        y: 20,
        width: 70,
        fontSizePt: 12,
        fontString: '16px Arial',
        fillStyle: 'rgba(0,0,0,1)',
        ctm: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
        shapeId: 'sp1',
        paragraphIndex: 0,
        runIndex: 0,
      },
      {
        kind: 'text' as const,
        text: 'Paragraph 2',
        x: 10,
        y: 40,
        width: 70,
        fontSizePt: 12,
        fontString: '16px Arial',
        fillStyle: 'rgba(0,0,0,1)',
        ctm: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
        shapeId: 'sp1',
        paragraphIndex: 1,
        runIndex: 0,
      },
    ]);

    const elements = traceToElements(trace);
    expect(elements).toHaveLength(1);
    const el = elements[0] as TextElement;
    expect(el.paragraphs).toHaveLength(2);
    expect(el.paragraphs[0].runs[0].text).toBe('Paragraph 1');
    expect(el.paragraphs[1].runs[0].text).toBe('Paragraph 2');
  });

  it('returns empty array for empty trace', () => {
    expect(traceToElements(makeTrace([]))).toEqual([]);
  });

  it('prefers text > image > shape when mixed events share shapeId', () => {
    const trace = makeTrace([
      {
        kind: 'shape' as const,
        operation: 'fillRect' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        fill: 'red',
        ctm: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
        shapeId: 'sp1',
      },
      {
        kind: 'text' as const,
        text: 'Hello',
        x: 10,
        y: 20,
        width: 40,
        fontSizePt: 12,
        fontString: '16px Arial',
        fillStyle: 'rgba(0,0,0,1)',
        ctm: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
        shapeId: 'sp1',
        paragraphIndex: 0,
        runIndex: 0,
      },
    ]);

    const elements = traceToElements(trace);
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe('text');
  });
});
