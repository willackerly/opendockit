/**
 * Metrics sync test.
 *
 * Verifies that @opendockit/render's font-metrics-db and metricsBundle are
 * proper re-exports from @opendockit/core. Since both are now re-exports
 * (not copies), these tests verify the re-export wiring is correct and
 * the same data/functionality is available through render.
 */

import { describe, expect, it } from 'vitest';
import { metricsBundle as coreBundle } from '../../../core/src/font/data/metrics-bundle.js';
import { metricsBundle as renderBundle } from '../metrics-bundle.js';
import { FontMetricsDB } from '../font-metrics-db.js';
import type { FontFaceMetrics } from '../font-metrics-db.js';

describe('metrics bundle sync', () => {
  it('render bundle has same font families as core bundle', () => {
    expect(Object.keys(renderBundle.fonts).sort()).toEqual(
      Object.keys(coreBundle.fonts).sort()
    );
  });

  it('font family count matches', () => {
    expect(Object.keys(renderBundle.fonts).length).toBe(
      Object.keys(coreBundle.fonts).length
    );
  });

  it('every family has same number of faces', () => {
    for (const [family, faces] of Object.entries(coreBundle.fonts)) {
      expect(
        renderBundle.fonts[family]?.length,
        `${family} face count`
      ).toBe(faces.length);
    }
  });

  it('version numbers match', () => {
    expect(renderBundle.version).toBe(coreBundle.version);
  });

  it('spot-check: calibri regular widths match', () => {
    const coreFaces = coreBundle.fonts['calibri'];
    const renderFaces = renderBundle.fonts['calibri'];
    expect(coreFaces).toBeDefined();
    expect(renderFaces).toBeDefined();
    const coreRegular = coreFaces.find((f) => f.style === 'regular');
    const renderRegular = renderFaces.find((f) => f.style === 'regular');
    expect(coreRegular).toBeDefined();
    expect(renderRegular).toBeDefined();
    expect(renderRegular!.widths).toEqual(coreRegular!.widths);
    expect(renderRegular!.unitsPerEm).toBe(coreRegular!.unitsPerEm);
    expect(renderRegular!.ascender).toBe(coreRegular!.ascender);
    expect(renderRegular!.descender).toBe(coreRegular!.descender);
  });

  it('FontMetricsDB from render re-export works correctly', () => {
    const db = new FontMetricsDB();
    db.loadBundle(renderBundle);
    expect(db.hasMetrics('Calibri')).toBe(true);
    const w = db.measureText('Hello', 'Calibri', 12, false, false);
    expect(w).toBeDefined();
    expect(w!).toBeGreaterThan(15);
    expect(w!).toBeLessThan(50);
  });
});
