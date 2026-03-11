/**
 * Canvas Tree Recorder — unit + integration tests.
 *
 * Tests the CanvasTreeRecorder class and its integration with
 * NativeCanvasGraphics and NativeRenderer.
 *
 * Run: pnpm test -- src/render/__tests__/canvas-tree-recorder.test.ts
 */
import { describe, it, expect } from 'vitest';
import { CanvasTreeRecorder } from '../canvas-tree-recorder.js';
import type { TextTraceEvent, ShapeTraceEvent, ImageTraceEvent } from '../canvas-tree-recorder.js';

describe('CanvasTreeRecorder', () => {
  describe('state management', () => {
    it('starts with identity CTM', () => {
      const rec = new CanvasTreeRecorder(612, 792);
      expect(rec.getCurrentCTM()).toEqual([1, 0, 0, 1, 0, 0]);
    });

    it('tracks transform composition', () => {
      const rec = new CanvasTreeRecorder(612, 792);
      rec.applyTransform(2, 0, 0, 2, 100, 200); // scale 2x, translate (100, 200)
      const ctm = rec.getCurrentCTM();
      expect(ctm[0]).toBeCloseTo(2);
      expect(ctm[3]).toBeCloseTo(2);
      expect(ctm[4]).toBeCloseTo(100);
      expect(ctm[5]).toBeCloseTo(200);
    });

    it('save/restore preserves CTM', () => {
      const rec = new CanvasTreeRecorder(612, 792);
      rec.applyTransform(2, 0, 0, 2, 0, 0);
      rec.pushState();
      rec.applyTransform(1, 0, 0, 1, 50, 50);
      // After additional translate (50 * scale 2 = 100 in composed matrix)
      expect(rec.getCurrentCTM()[4]).toBeCloseTo(100);
      rec.popState();
      // Restored to just the scale (no translation)
      expect(rec.getCurrentCTM()[4]).toBeCloseTo(0);
      expect(rec.getCurrentCTM()[0]).toBeCloseTo(2);
    });

    it('nested save/restore works correctly', () => {
      const rec = new CanvasTreeRecorder(612, 792);
      rec.pushState(); // level 1
      rec.applyTransform(1, 0, 0, 1, 10, 0);
      rec.pushState(); // level 2
      rec.applyTransform(1, 0, 0, 1, 20, 0);
      expect(rec.getCurrentCTM()[4]).toBeCloseTo(30);
      rec.popState(); // back to level 1
      expect(rec.getCurrentCTM()[4]).toBeCloseTo(10);
      rec.popState(); // back to identity
      expect(rec.getCurrentCTM()[4]).toBeCloseTo(0);
    });
  });

  describe('text recording', () => {
    it('records text events with world-space coordinates', () => {
      const rec = new CanvasTreeRecorder(612, 792);
      // Simulate viewport transform: scale 2x
      rec.applyTransform(2, 0, 0, -2, 0, 1584);

      rec.recordText(
        'H',
        100, 700, // position in user space
        12,
        'normal normal 12px Helvetica',
        'rgb(0,0,0)',
        7.2, // glyph width
        [1, 0, 0, 1, 100, 700],
      );

      expect(rec.events).toHaveLength(1);
      const ev = rec.events[0] as TextTraceEvent;
      expect(ev.kind).toBe('text');
      expect(ev.text).toBe('H');
      expect(ev.fontSizePt).toBe(12);
      expect(ev.fontString).toBe('normal normal 12px Helvetica');
      expect(ev.fillStyle).toBe('rgb(0,0,0)');
      // World-space x should be transformed: 2 * 100 + 0 = 200
      expect(ev.x).toBeCloseTo(200);
    });

    it('records multiple glyphs', () => {
      const rec = new CanvasTreeRecorder(612, 792);
      rec.recordText('H', 100, 700, 12, 'normal normal 12px Helvetica', '#000', 7.2, [1, 0, 0, 1, 100, 700]);
      rec.recordText('e', 107.2, 700, 12, 'normal normal 12px Helvetica', '#000', 6.0, [1, 0, 0, 1, 107.2, 700]);
      rec.recordText('l', 113.2, 700, 12, 'normal normal 12px Helvetica', '#000', 3.0, [1, 0, 0, 1, 113.2, 700]);

      expect(rec.events).toHaveLength(3);
      expect(rec.events.map(e => (e as TextTraceEvent).text).join('')).toBe('Hel');
    });

    it('handles pattern fill style', () => {
      const rec = new CanvasTreeRecorder(612, 792);
      rec.recordText('X', 0, 0, 12, 'normal normal 12px Arial', 'pattern', 7, [1, 0, 0, 1, 0, 0]);

      const ev = rec.events[0] as TextTraceEvent;
      expect(ev.fillStyle).toBe('pattern');
    });
  });

  describe('shape recording', () => {
    it('records fill with bounds', () => {
      const rec = new CanvasTreeRecorder(612, 792);
      rec.recordShape('fill', 10, 20, 100, 50, 'rgb(255,0,0)');

      expect(rec.events).toHaveLength(1);
      const ev = rec.events[0] as ShapeTraceEvent;
      expect(ev.kind).toBe('shape');
      expect(ev.operation).toBe('fill');
      expect(ev.x).toBeCloseTo(10);
      expect(ev.y).toBeCloseTo(20);
      expect(ev.width).toBeCloseTo(100);
      expect(ev.height).toBeCloseTo(50);
      expect(ev.fill).toBe('rgb(255,0,0)');
    });

    it('records stroke with line width', () => {
      const rec = new CanvasTreeRecorder(612, 792);
      rec.recordShape('stroke', 0, 0, 200, 100, undefined, 'rgb(0,0,255)', 2);

      const ev = rec.events[0] as ShapeTraceEvent;
      expect(ev.stroke).toBe('rgb(0,0,255)');
      expect(ev.lineWidth).toBe(2);
    });

    it('transforms bounds through CTM', () => {
      const rec = new CanvasTreeRecorder(612, 792);
      rec.applyTransform(2, 0, 0, 2, 10, 20); // scale 2x, translate (10, 20)
      rec.recordShape('fill', 0, 0, 50, 25, 'red');

      const ev = rec.events[0] as ShapeTraceEvent;
      // (0,0) → (10, 20), (50, 25) → (110, 70)
      expect(ev.x).toBeCloseTo(10);
      expect(ev.y).toBeCloseTo(20);
      expect(ev.width).toBeCloseTo(100);
      expect(ev.height).toBeCloseTo(50);
    });

    it('records rectangle with precise bounds', () => {
      const rec = new CanvasTreeRecorder(612, 792);
      rec.recordRect('fillRect', 50, 100, 200, 150, 'green');

      const ev = rec.events[0] as ShapeTraceEvent;
      expect(ev.operation).toBe('fillRect');
      expect(ev.x).toBeCloseTo(50);
      expect(ev.y).toBeCloseTo(100);
      expect(ev.width).toBeCloseTo(200);
      expect(ev.height).toBeCloseTo(150);
    });
  });

  describe('image recording', () => {
    it('records image position from CTM', () => {
      const rec = new CanvasTreeRecorder(612, 792);
      // Typical PDF image CTM: scale to 200x150 at position (100, 300)
      rec.applyTransform(200, 0, 0, 150, 100, 300);
      rec.recordImage();

      expect(rec.events).toHaveLength(1);
      const ev = rec.events[0] as ImageTraceEvent;
      expect(ev.kind).toBe('image');
      // 1×1 unit square → (0,0) maps to (100,300), (1,1) maps to (300,450)
      expect(ev.x).toBeCloseTo(100);
      expect(ev.y).toBeCloseTo(300);
      expect(ev.width).toBeCloseTo(200);
      expect(ev.height).toBeCloseTo(150);
    });
  });

  describe('trace output', () => {
    it('produces RenderTrace with correct metadata', () => {
      const rec = new CanvasTreeRecorder(612, 792);
      rec.recordText('A', 0, 0, 12, 'normal 12px Arial', '#000', 7, [1, 0, 0, 1, 0, 0]);

      const trace = rec.getTrace('pdf:page0');
      expect(trace.source).toBe('pdf:page0');
      expect(trace.slideWidthPt).toBe(612);
      expect(trace.slideHeightPt).toBe(792);
      expect(trace.events).toHaveLength(1);
      expect(trace.config.glyphLevel).toBe(false);
      expect(trace.config.dpiScale).toBe(1);
      expect(trace.timestamp).toBeGreaterThan(0);
    });

    it('reset clears events and CTM', () => {
      const rec = new CanvasTreeRecorder(612, 792);
      rec.applyTransform(2, 0, 0, 2, 0, 0);
      rec.recordText('X', 0, 0, 12, 'normal 12px Arial', '#000', 7, [1, 0, 0, 1, 0, 0]);
      expect(rec.events).toHaveLength(1);

      rec.reset(595, 842);
      expect(rec.events).toHaveLength(0);
      expect(rec.getCurrentCTM()).toEqual([1, 0, 0, 1, 0, 0]);

      const trace = rec.getTrace('pdf:page1');
      expect(trace.slideWidthPt).toBe(595);
      expect(trace.slideHeightPt).toBe(842);
    });
  });

  describe('mixed event types', () => {
    it('records text, shapes, and images in order', () => {
      const rec = new CanvasTreeRecorder(612, 792);
      rec.recordShape('fill', 0, 0, 612, 792, 'white'); // background
      rec.recordText('Title', 50, 700, 24, 'bold 24px Arial', '#000', 60, [1, 0, 0, 1, 50, 700]);
      rec.recordImage();
      rec.recordShape('stroke', 10, 10, 592, 772, undefined, 'black', 1);

      expect(rec.events).toHaveLength(4);
      expect(rec.events[0].kind).toBe('shape');
      expect(rec.events[1].kind).toBe('text');
      expect(rec.events[2].kind).toBe('image');
      expect(rec.events[3].kind).toBe('shape');
    });
  });
});
