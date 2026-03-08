/**
 * Metrics bundle sync test.
 *
 * Ensures that @opendockit/render's metricsBundle is always in sync with
 * @opendockit/core's authoritative copy. The render package re-exports from
 * core, so these tests verify the re-export works and the data is identical.
 */

import { describe, expect, it } from 'vitest';
import { metricsBundle as coreBundle } from '../../../core/src/font/data/metrics-bundle.js';
import { metricsBundle as renderBundle } from '../metrics-bundle.js';

describe('metrics bundle sync', () => {
  it('render bundle references same data as core bundle', () => {
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
});
