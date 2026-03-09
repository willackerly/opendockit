/**
 * Tests for TracingBackend.
 *
 * Verifies:
 * - Inner backend receives all calls unchanged (transparent delegation)
 * - Trace events have correct world-space coordinates after transforms
 * - Save/restore correctly scopes the shadow CTM
 * - Shape context attribution works
 * - Per-glyph tracing (glyphLevel mode)
 * - Zero events when no draw calls are made
 * - Pixel-to-point coordinate conversion
 */

import { describe, it, expect } from 'vitest';
import { TracingBackend } from '../tracing-backend.js';
import { CanvasBackend } from '../canvas-backend.js';
import { createMockContext } from './mock-canvas.js';
import type { TextTraceEvent, ShapeTraceEvent, ImageTraceEvent } from '../trace-types.js';

// ---------------------------------------------------------------------------
// Helper: create a TracingBackend wrapping a mock canvas
// ---------------------------------------------------------------------------

function createTracing(opts?: { glyphLevel?: boolean; dpiScale?: number }) {
  const mockCtx = createMockContext();
  const inner = new CanvasBackend(mockCtx as unknown as CanvasRenderingContext2D);
  const dpiScale = opts?.dpiScale ?? 1;
  const tracing = new TracingBackend(inner, {
    glyphLevel: opts?.glyphLevel ?? false,
    dpiScale,
  });
  return { tracing, mockCtx, inner };
}

// Conversion factor: at dpiScale=1, 1px = 1/(96/72) = 0.75pt
const PX_TO_PT_1X = 72 / 96; // 0.75

describe('TracingBackend', () => {
  // -------------------------------------------------------------------------
  // Transparent delegation
  // -------------------------------------------------------------------------

  describe('transparent delegation', () => {
    it('delegates save/restore to inner backend', () => {
      const { tracing, mockCtx } = createTracing();
      tracing.save();
      tracing.restore();
      const saves = mockCtx._calls.filter((c) => c.method === 'save');
      const restores = mockCtx._calls.filter((c) => c.method === 'restore');
      expect(saves).toHaveLength(1);
      expect(restores).toHaveLength(1);
    });

    it('delegates transform operations', () => {
      const { tracing, mockCtx } = createTracing();
      tracing.translate(10, 20);
      tracing.scale(2, 3);
      tracing.rotate(Math.PI / 4);
      const calls = mockCtx._calls;
      expect(calls).toContainEqual({ method: 'translate', args: [10, 20] });
      expect(calls).toContainEqual({ method: 'scale', args: [2, 3] });
      expect(calls).toContainEqual({ method: 'rotate', args: [Math.PI / 4] });
    });

    it('delegates fillText to inner backend', () => {
      const { tracing, mockCtx } = createTracing();
      tracing.font = '16px Arial';
      tracing.fillText('hello', 100, 200);
      const calls = mockCtx._calls.filter((c) => c.method === 'fillText');
      expect(calls).toHaveLength(1);
      expect(calls[0].args).toEqual(['hello', 100, 200]);
    });

    it('delegates drawImage to inner backend', () => {
      const { tracing, mockCtx } = createTracing();
      const img = { width: 50, height: 30 } as unknown as CanvasImageSource;
      tracing.drawImage(img, 10, 20, 50, 30);
      const calls = mockCtx._calls.filter((c) => c.method === 'drawImage');
      expect(calls).toHaveLength(1);
    });

    it('delegates fillRect to inner backend', () => {
      const { tracing, mockCtx } = createTracing();
      tracing.fillRect(5, 10, 100, 50);
      const calls = mockCtx._calls.filter((c) => c.method === 'fillRect');
      expect(calls).toHaveLength(1);
      expect(calls[0].args).toEqual([5, 10, 100, 50]);
    });

    it('delegates style properties', () => {
      const { tracing } = createTracing();
      tracing.fillStyle = 'red';
      tracing.strokeStyle = 'blue';
      tracing.lineWidth = 3;
      tracing.globalAlpha = 0.5;
      // No assertion on inner since mock-canvas uses direct property assignment;
      // just verify no errors
    });
  });

  // -------------------------------------------------------------------------
  // Trace event recording
  // -------------------------------------------------------------------------

  describe('text trace events', () => {
    it('records a TextTraceEvent for fillText', () => {
      const { tracing } = createTracing();
      tracing.font = '16px Arial';
      tracing.fillStyle = 'rgba(0,0,0,1)';
      tracing.fillText('hello', 100, 200);

      const trace = tracing.getTrace('test', 720, 540);
      expect(trace.events).toHaveLength(1);
      const evt = trace.events[0] as TextTraceEvent;
      expect(evt.kind).toBe('text');
      expect(evt.text).toBe('hello');
      expect(evt.fontString).toBe('16px Arial');
      expect(evt.fillStyle).toBe('rgba(0,0,0,1)');
    });

    it('records correct world-space coordinates at identity transform', () => {
      const { tracing } = createTracing({ dpiScale: 1 });
      tracing.font = '16px Arial';
      tracing.fillText('test', 96, 72);

      const evt = tracing.getTrace('test', 720, 540).events[0] as TextTraceEvent;
      // At dpiScale=1: pt = px * (72/96) = px * 0.75
      expect(evt.x).toBeCloseTo(96 * PX_TO_PT_1X, 4);
      expect(evt.y).toBeCloseTo(72 * PX_TO_PT_1X, 4);
    });

    it('records font size in points', () => {
      const { tracing } = createTracing({ dpiScale: 1 });
      tracing.font = '24px Arial';
      tracing.fillText('big', 0, 0);

      const evt = tracing.getTrace('test', 720, 540).events[0] as TextTraceEvent;
      // 24px at dpiScale=1 → 24 * 0.75 = 18pt
      expect(evt.fontSizePt).toBeCloseTo(18, 4);
    });

    it('records a StrokeTextTraceEvent for strokeText', () => {
      const { tracing } = createTracing();
      tracing.font = '12px Arial';
      tracing.strokeStyle = 'blue';
      tracing.lineWidth = 2;
      tracing.strokeText('outline', 50, 60);

      const trace = tracing.getTrace('test', 720, 540);
      expect(trace.events).toHaveLength(1);
      expect(trace.events[0].kind).toBe('strokeText');
    });
  });

  describe('shape trace events', () => {
    it('records a ShapeTraceEvent for fillRect', () => {
      const { tracing } = createTracing({ dpiScale: 1 });
      tracing.fillStyle = 'red';
      tracing.fillRect(0, 0, 96, 72);

      const trace = tracing.getTrace('test', 720, 540);
      expect(trace.events).toHaveLength(1);
      const evt = trace.events[0] as ShapeTraceEvent;
      expect(evt.kind).toBe('shape');
      expect(evt.operation).toBe('fillRect');
      expect(evt.x).toBeCloseTo(0, 4);
      expect(evt.y).toBeCloseTo(0, 4);
      expect(evt.width).toBeCloseTo(96 * PX_TO_PT_1X, 4);
      expect(evt.height).toBeCloseTo(72 * PX_TO_PT_1X, 4);
      expect(evt.fill).toBe('red');
    });

    it('records a ShapeTraceEvent for fill() with path bounds', () => {
      const { tracing } = createTracing({ dpiScale: 1 });
      tracing.fillStyle = 'green';
      tracing.beginPath();
      tracing.moveTo(10, 10);
      tracing.lineTo(50, 10);
      tracing.lineTo(50, 40);
      tracing.lineTo(10, 40);
      tracing.closePath();
      tracing.fill();

      const trace = tracing.getTrace('test', 720, 540);
      expect(trace.events).toHaveLength(1);
      const evt = trace.events[0] as ShapeTraceEvent;
      expect(evt.kind).toBe('shape');
      expect(evt.operation).toBe('fill');
      expect(evt.x).toBeCloseTo(10 * PX_TO_PT_1X, 4);
      expect(evt.y).toBeCloseTo(10 * PX_TO_PT_1X, 4);
      expect(evt.width).toBeCloseTo(40 * PX_TO_PT_1X, 4);
      expect(evt.height).toBeCloseTo(30 * PX_TO_PT_1X, 4);
    });

    it('records a ShapeTraceEvent for strokeRect', () => {
      const { tracing } = createTracing({ dpiScale: 1 });
      tracing.strokeStyle = 'black';
      tracing.lineWidth = 2;
      tracing.strokeRect(10, 20, 80, 60);

      const trace = tracing.getTrace('test', 720, 540);
      expect(trace.events).toHaveLength(1);
      const evt = trace.events[0] as ShapeTraceEvent;
      expect(evt.operation).toBe('strokeRect');
      expect(evt.stroke).toBe('black');
      expect(evt.lineWidth).toBeCloseTo(2 * PX_TO_PT_1X, 4);
    });
  });

  describe('image trace events', () => {
    it('records an ImageTraceEvent for drawImage (5-arg form)', () => {
      const { tracing } = createTracing({ dpiScale: 1 });
      const img = { width: 200, height: 100 } as unknown as CanvasImageSource;
      tracing.drawImage(img, 10, 20, 200, 100);

      const trace = tracing.getTrace('test', 720, 540);
      expect(trace.events).toHaveLength(1);
      const evt = trace.events[0] as ImageTraceEvent;
      expect(evt.kind).toBe('image');
      expect(evt.x).toBeCloseTo(10 * PX_TO_PT_1X, 4);
      expect(evt.y).toBeCloseTo(20 * PX_TO_PT_1X, 4);
      expect(evt.width).toBeCloseTo(200 * PX_TO_PT_1X, 4);
      expect(evt.height).toBeCloseTo(100 * PX_TO_PT_1X, 4);
    });
  });

  // -------------------------------------------------------------------------
  // Transform tracking
  // -------------------------------------------------------------------------

  describe('transform tracking', () => {
    it('applies translate to text coordinates', () => {
      const { tracing } = createTracing({ dpiScale: 1 });
      tracing.font = '10px Arial';
      tracing.translate(100, 200);
      tracing.fillText('moved', 0, 0);

      const evt = tracing.getTrace('test', 720, 540).events[0] as TextTraceEvent;
      // World-space = translate(100,200) + local(0,0) = (100, 200) px → pt
      expect(evt.x).toBeCloseTo(100 * PX_TO_PT_1X, 4);
      expect(evt.y).toBeCloseTo(200 * PX_TO_PT_1X, 4);
    });

    it('composes multiple translates', () => {
      const { tracing } = createTracing({ dpiScale: 1 });
      tracing.font = '10px Arial';
      tracing.translate(50, 60);
      tracing.translate(10, 20);
      tracing.fillText('composed', 0, 0);

      const evt = tracing.getTrace('test', 720, 540).events[0] as TextTraceEvent;
      expect(evt.x).toBeCloseTo(60 * PX_TO_PT_1X, 4);
      expect(evt.y).toBeCloseTo(80 * PX_TO_PT_1X, 4);
    });

    it('applies scale to coordinates', () => {
      const { tracing } = createTracing({ dpiScale: 1 });
      tracing.font = '10px Arial';
      tracing.scale(2, 2);
      tracing.fillText('scaled', 50, 50);

      const evt = tracing.getTrace('test', 720, 540).events[0] as TextTraceEvent;
      // scale(2,2) + local(50,50) → world(100, 100)
      expect(evt.x).toBeCloseTo(100 * PX_TO_PT_1X, 4);
      expect(evt.y).toBeCloseTo(100 * PX_TO_PT_1X, 4);
    });

    it('applies rotation to coordinates', () => {
      const { tracing } = createTracing({ dpiScale: 1 });
      tracing.font = '10px Arial';
      // Rotate 90° clockwise
      tracing.rotate(Math.PI / 2);
      tracing.fillText('rotated', 100, 0);

      const evt = tracing.getTrace('test', 720, 540).events[0] as TextTraceEvent;
      // rotate(π/2): (100, 0) → (0, 100) in world-space
      expect(evt.x).toBeCloseTo(0 * PX_TO_PT_1X, 2);
      expect(evt.y).toBeCloseTo(100 * PX_TO_PT_1X, 2);
    });

    it('composes translate + rotate correctly', () => {
      const { tracing } = createTracing({ dpiScale: 1 });
      tracing.font = '10px Arial';
      tracing.translate(200, 100);
      tracing.rotate(Math.PI / 2);
      // Local (50, 0) → after rotation → (0, 50) → after translate → (200, 150)
      tracing.fillText('composed', 50, 0);

      const evt = tracing.getTrace('test', 720, 540).events[0] as TextTraceEvent;
      expect(evt.x).toBeCloseTo(200 * PX_TO_PT_1X, 2);
      expect(evt.y).toBeCloseTo(150 * PX_TO_PT_1X, 2);
    });

    it('setTransform replaces the CTM', () => {
      const { tracing } = createTracing({ dpiScale: 1 });
      tracing.font = '10px Arial';
      tracing.translate(999, 999); // should be replaced
      tracing.setTransform(1, 0, 0, 1, 50, 60); // identity + translate(50,60)
      tracing.fillText('reset', 0, 0);

      const evt = tracing.getTrace('test', 720, 540).events[0] as TextTraceEvent;
      expect(evt.x).toBeCloseTo(50 * PX_TO_PT_1X, 4);
      expect(evt.y).toBeCloseTo(60 * PX_TO_PT_1X, 4);
    });

    it('transform() multiplies the current CTM', () => {
      const { tracing } = createTracing({ dpiScale: 1 });
      tracing.font = '10px Arial';
      tracing.translate(10, 20);
      // Apply additional translate(30, 40) via transform()
      tracing.transform(1, 0, 0, 1, 30, 40);
      tracing.fillText('xform', 0, 0);

      const evt = tracing.getTrace('test', 720, 540).events[0] as TextTraceEvent;
      expect(evt.x).toBeCloseTo(40 * PX_TO_PT_1X, 4);
      expect(evt.y).toBeCloseTo(60 * PX_TO_PT_1X, 4);
    });
  });

  // -------------------------------------------------------------------------
  // Save/restore CTM scoping
  // -------------------------------------------------------------------------

  describe('save/restore CTM scoping', () => {
    it('restore reverts to saved CTM', () => {
      const { tracing } = createTracing({ dpiScale: 1 });
      tracing.font = '10px Arial';

      tracing.translate(100, 100);
      tracing.save();
      tracing.translate(50, 50);
      tracing.fillText('inside', 0, 0); // world = (150, 150)
      tracing.restore();
      tracing.fillText('outside', 0, 0); // world = (100, 100)

      const events = tracing.getTrace('test', 720, 540).events as TextTraceEvent[];
      expect(events).toHaveLength(2);
      expect(events[0].x).toBeCloseTo(150 * PX_TO_PT_1X, 4);
      expect(events[0].y).toBeCloseTo(150 * PX_TO_PT_1X, 4);
      expect(events[1].x).toBeCloseTo(100 * PX_TO_PT_1X, 4);
      expect(events[1].y).toBeCloseTo(100 * PX_TO_PT_1X, 4);
    });

    it('nested save/restore scoping', () => {
      const { tracing } = createTracing({ dpiScale: 1 });
      tracing.font = '10px Arial';

      tracing.save();
      tracing.translate(10, 0);
      tracing.save();
      tracing.translate(20, 0);
      tracing.fillText('deep', 0, 0); // world = (30, 0)
      tracing.restore();
      tracing.fillText('mid', 0, 0); // world = (10, 0)
      tracing.restore();
      tracing.fillText('top', 0, 0); // world = (0, 0)

      const events = tracing.getTrace('test', 720, 540).events as TextTraceEvent[];
      expect(events).toHaveLength(3);
      expect(events[0].x).toBeCloseTo(30 * PX_TO_PT_1X, 4);
      expect(events[1].x).toBeCloseTo(10 * PX_TO_PT_1X, 4);
      expect(events[2].x).toBeCloseTo(0, 4);
    });
  });

  // -------------------------------------------------------------------------
  // DPI scaling
  // -------------------------------------------------------------------------

  describe('DPI scaling', () => {
    it('converts pixels to points correctly at 2x DPI', () => {
      const { tracing } = createTracing({ dpiScale: 2 });
      tracing.font = '32px Arial'; // 32px at 2x = 16px logical = 12pt
      tracing.fillText('retina', 192, 144);

      const evt = tracing.getTrace('test', 720, 540).events[0] as TextTraceEvent;
      // pt = px / (2 * 96/72) = px / 2.6667
      const pxToPt2x = 72 / (2 * 96);
      expect(evt.x).toBeCloseTo(192 * pxToPt2x, 4);
      expect(evt.y).toBeCloseTo(144 * pxToPt2x, 4);
      expect(evt.fontSizePt).toBeCloseTo(32 * pxToPt2x, 4); // 12pt
    });
  });

  // -------------------------------------------------------------------------
  // Shape context
  // -------------------------------------------------------------------------

  describe('shape context', () => {
    it('attributes trace events to the current shape', () => {
      const { tracing } = createTracing();
      tracing.font = '10px Arial';
      tracing.setShapeContext({
        shapeId: '42',
        shapeName: 'Title 1',
        paragraphIndex: 0,
        runIndex: 1,
      });
      tracing.fillText('attributed', 0, 0);
      tracing.clearShapeContext();
      tracing.fillText('unattributed', 0, 0);

      const events = tracing.getTrace('test', 720, 540).events as TextTraceEvent[];
      expect(events[0].shapeId).toBe('42');
      expect(events[0].shapeName).toBe('Title 1');
      expect(events[0].paragraphIndex).toBe(0);
      expect(events[0].runIndex).toBe(1);
      expect(events[1].shapeId).toBeUndefined();
      expect(events[1].shapeName).toBeUndefined();
    });

    it('propagates shape context to shape events', () => {
      const { tracing } = createTracing();
      tracing.setShapeContext({ shapeId: '7', shapeName: 'Box' });
      tracing.fillStyle = 'blue';
      tracing.fillRect(0, 0, 100, 100);

      const evt = tracing.getTrace('test', 720, 540).events[0] as ShapeTraceEvent;
      expect(evt.shapeId).toBe('7');
      expect(evt.shapeName).toBe('Box');
    });
  });

  // -------------------------------------------------------------------------
  // Glyph-level tracing
  // -------------------------------------------------------------------------

  describe('glyph-level tracing', () => {
    it('records per-character advance widths when enabled', () => {
      const { tracing } = createTracing({ glyphLevel: true });
      tracing.font = '10px Arial';
      tracing.fillText('ABC', 0, 0);

      const evt = tracing.getTrace('test', 720, 540).events[0] as TextTraceEvent;
      expect(evt.charAdvances).toBeDefined();
      expect(evt.charAdvances).toHaveLength(3);
      // Each should be a positive number (measured by mock)
      for (const adv of evt.charAdvances!) {
        expect(adv).toBeGreaterThan(0);
      }
    });

    it('does not record charAdvances when glyphLevel is false', () => {
      const { tracing } = createTracing({ glyphLevel: false });
      tracing.font = '10px Arial';
      tracing.fillText('ABC', 0, 0);

      const evt = tracing.getTrace('test', 720, 540).events[0] as TextTraceEvent;
      expect(evt.charAdvances).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('returns empty events when no draw calls are made', () => {
      const { tracing } = createTracing();
      tracing.save();
      tracing.translate(100, 100);
      tracing.restore();

      const trace = tracing.getTrace('test', 720, 540);
      expect(trace.events).toHaveLength(0);
    });

    it('eventCount tracks the number of events', () => {
      const { tracing } = createTracing();
      expect(tracing.eventCount).toBe(0);
      tracing.font = '10px Arial';
      tracing.fillText('a', 0, 0);
      expect(tracing.eventCount).toBe(1);
      tracing.fillRect(0, 0, 10, 10);
      expect(tracing.eventCount).toBe(2);
    });

    it('getTrace includes metadata', () => {
      const { tracing } = createTracing({ dpiScale: 2 });
      const trace = tracing.getTrace('pptx:slide3', 720, 540);
      expect(trace.source).toBe('pptx:slide3');
      expect(trace.slideWidthPt).toBe(720);
      expect(trace.slideHeightPt).toBe(540);
      expect(trace.config.dpiScale).toBe(2);
      expect(trace.config.glyphLevel).toBe(false);
      expect(trace.timestamp).toBeGreaterThan(0);
    });

    it('handles empty text gracefully', () => {
      const { tracing } = createTracing();
      tracing.font = '10px Arial';
      tracing.fillText('', 0, 0);

      const trace = tracing.getTrace('test', 720, 540);
      expect(trace.events).toHaveLength(1);
      expect((trace.events[0] as TextTraceEvent).text).toBe('');
    });

    it('restore with empty stack does not throw', () => {
      const { tracing } = createTracing();
      // Extra restore with no matching save
      expect(() => tracing.restore()).not.toThrow();
    });

    it('path bounds reset on beginPath', () => {
      const { tracing } = createTracing({ dpiScale: 1 });
      tracing.fillStyle = 'red';

      // First path
      tracing.beginPath();
      tracing.moveTo(0, 0);
      tracing.lineTo(100, 100);
      tracing.fill();

      // Second path (fresh bounds)
      tracing.beginPath();
      tracing.moveTo(200, 200);
      tracing.lineTo(300, 300);
      tracing.fill();

      const events = tracing.getTrace('test', 720, 540).events as ShapeTraceEvent[];
      expect(events).toHaveLength(2);
      // Second path should NOT include (0,0) from first path
      expect(events[1].x).toBeCloseTo(200 * PX_TO_PT_1X, 4);
      expect(events[1].y).toBeCloseTo(200 * PX_TO_PT_1X, 4);
    });
  });

  // -------------------------------------------------------------------------
  // CTM stored in trace events
  // -------------------------------------------------------------------------

  describe('CTM in trace events', () => {
    it('stores the current CTM at time of drawing', () => {
      const { tracing } = createTracing();
      tracing.font = '10px Arial';
      tracing.translate(50, 60);
      tracing.scale(2, 3);
      tracing.fillText('test', 0, 0);

      const evt = tracing.getTrace('test', 720, 540).events[0] as TextTraceEvent;
      expect(evt.ctm).toBeDefined();
      expect(evt.ctm).toHaveLength(6);
      // After translate(50,60) + scale(2,3): [2, 0, 0, 3, 50, 60]
      expect(evt.ctm[0]).toBeCloseTo(2, 4); // a = sx
      expect(evt.ctm[3]).toBeCloseTo(3, 4); // d = sy
      expect(evt.ctm[4]).toBeCloseTo(50, 4); // tx
      expect(evt.ctm[5]).toBeCloseTo(60, 4); // ty
    });
  });
});
