import { describe, it, expect } from 'vitest';
import {
  viewportToPage,
  pageToViewport,
  pageRectToViewport,
  viewportRectToPage,
} from '../coordinate-utils.js';
import type { Viewport } from '../interaction-types.js';

const VP_1X: Viewport = { scale: 1, pageWidth: 612, pageHeight: 792 };
const VP_2X: Viewport = { scale: 2, pageWidth: 612, pageHeight: 792 };
const VP_1_5X: Viewport = { scale: 1.5, pageWidth: 612, pageHeight: 792 };

describe('viewportToPage', () => {
  it('converts origin at scale 1 (top-left viewport → top of page)', () => {
    const p = viewportToPage(VP_1X, 0, 0);
    expect(p.x).toBe(0);
    expect(p.y).toBe(792); // top of page
  });

  it('converts bottom-left of viewport to page origin', () => {
    const p = viewportToPage(VP_1X, 0, 792);
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
  });

  it('applies scale factor', () => {
    const p = viewportToPage(VP_2X, 200, 400);
    expect(p.x).toBe(100);          // 200 / 2
    expect(p.y).toBe(792 - 200);    // 792 - 400/2
  });

  it('handles fractional scale', () => {
    const p = viewportToPage(VP_1_5X, 150, 300);
    expect(p.x).toBeCloseTo(100);        // 150 / 1.5
    expect(p.y).toBeCloseTo(792 - 200);  // 792 - 300/1.5
  });
});

describe('pageToViewport', () => {
  it('converts page origin to bottom-left of viewport at scale 1', () => {
    const p = pageToViewport(VP_1X, 0, 0);
    expect(p.x).toBe(0);
    expect(p.y).toBe(792); // bottom of viewport
  });

  it('converts top of page to viewport origin', () => {
    const p = pageToViewport(VP_1X, 0, 792);
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
  });

  it('applies scale factor', () => {
    const p = pageToViewport(VP_2X, 100, 592);
    expect(p.x).toBe(200);              // 100 * 2
    expect(p.y).toBe((792 - 592) * 2);  // 400
  });
});

describe('round-trip conversions', () => {
  it('viewportToPage → pageToViewport is identity', () => {
    const vx = 150, vy = 300;
    const page = viewportToPage(VP_2X, vx, vy);
    const back = pageToViewport(VP_2X, page.x, page.y);
    expect(back.x).toBeCloseTo(vx);
    expect(back.y).toBeCloseTo(vy);
  });

  it('pageToViewport → viewportToPage is identity', () => {
    const px = 306, py = 396;
    const vp = pageToViewport(VP_1_5X, px, py);
    const back = viewportToPage(VP_1_5X, vp.x, vp.y);
    expect(back.x).toBeCloseTo(px);
    expect(back.y).toBeCloseTo(py);
  });
});

describe('pageRectToViewport', () => {
  it('converts a page rect to viewport at scale 1', () => {
    // Page rect: bottom-left at (100, 500), size 200x100
    const vpRect = pageRectToViewport(VP_1X, { x: 100, y: 500, width: 200, height: 100 });
    // Top of rect in page coords = 500 + 100 = 600
    // Viewport top-left y = (792 - 600) * 1 = 192
    expect(vpRect.x).toBe(100);
    expect(vpRect.y).toBe(192);
    expect(vpRect.width).toBe(200);
    expect(vpRect.height).toBe(100);
  });

  it('applies scale factor to rect dimensions', () => {
    const vpRect = pageRectToViewport(VP_2X, { x: 50, y: 300, width: 100, height: 50 });
    expect(vpRect.x).toBe(100);     // 50 * 2
    expect(vpRect.width).toBe(200);  // 100 * 2
    expect(vpRect.height).toBe(100); // 50 * 2
  });
});

describe('viewportRectToPage', () => {
  it('converts a viewport rect to page coords at scale 1', () => {
    const pageRect = viewportRectToPage(VP_1X, { x: 100, y: 192, width: 200, height: 100 });
    expect(pageRect.x).toBeCloseTo(100);
    expect(pageRect.y).toBeCloseTo(500);
    expect(pageRect.width).toBeCloseTo(200);
    expect(pageRect.height).toBeCloseTo(100);
  });

  it('pageRectToViewport → viewportRectToPage round-trips', () => {
    const original = { x: 50, y: 300, width: 100, height: 80 };
    const vp = pageRectToViewport(VP_2X, original);
    const back = viewportRectToPage(VP_2X, vp);
    expect(back.x).toBeCloseTo(original.x);
    expect(back.y).toBeCloseTo(original.y);
    expect(back.width).toBeCloseTo(original.width);
    expect(back.height).toBeCloseTo(original.height);
  });
});
