/**
 * Font system cross-consumer consistency tests.
 *
 * Verifies that font substitution, metrics, and TTF bundles are all in sync:
 * - Every substitution resolves to a font with metrics
 * - Every metrics entry has a corresponding TTF bundle
 * - Theme placeholder resolution produces valid font names
 */

import { describe, it, expect } from 'vitest';
import { getFontSubstitution } from '../substitution-table.js';
import { metricsBundle } from '../data/metrics-bundle.js';
import { BUNDLED_TTF_FONTS } from '../data/ttf/manifest.js';
import { BUNDLED_FONTS } from '../data/woff2/manifest.js';

describe('font substitution → metrics consistency', () => {
  it('every Office font with a substitution has metrics (under original or substitute name)', () => {
    const officeFonts = [
      'Calibri', 'Arial', 'Times New Roman', 'Courier New',
      'Cambria', 'Georgia', 'Segoe UI', 'Arial Narrow',
      'Palatino Linotype', 'Bookman Old Style', 'Century Schoolbook',
    ];

    for (const font of officeFonts) {
      const fontKey = font.toLowerCase();
      const sub = getFontSubstitution(font);

      // The font should have metrics under either the original name or the substitute name
      const hasMetricsUnderOriginal = fontKey in metricsBundle.fonts;
      let hasMetricsUnderSubstitute = false;
      if (sub) {
        const primaryFamily = sub.split(',')[0].trim().replace(/'/g, '').toLowerCase();
        hasMetricsUnderSubstitute = primaryFamily in metricsBundle.fonts;
      }

      expect(
        hasMetricsUnderOriginal || hasMetricsUnderSubstitute,
        `"${font}" should have metrics under "${fontKey}" or its substitute`
      ).toBe(true);
    }
  });
});

describe('metrics → TTF bundle consistency', () => {
  it('every font in metrics bundle has a TTF bundle entry', () => {
    for (const family of Object.keys(metricsBundle.fonts)) {
      expect(
        BUNDLED_TTF_FONTS[family],
        `metrics family "${family}" should have a TTF bundle`
      ).toBeDefined();
    }
  });

  it('every font in metrics bundle has a WOFF2 bundle entry', () => {
    for (const family of Object.keys(metricsBundle.fonts)) {
      expect(
        BUNDLED_FONTS[family],
        `metrics family "${family}" should have a WOFF2 bundle`
      ).toBeDefined();
    }
  });

  it('TTF and WOFF2 manifests have matching entries', () => {
    // Every TTF entry should have a corresponding WOFF2 entry
    for (const key of Object.keys(BUNDLED_TTF_FONTS)) {
      expect(
        BUNDLED_FONTS[key],
        `TTF entry "${key}" should have a WOFF2 counterpart`
      ).toBeDefined();
    }
  });
});

describe('theme placeholder resolution', () => {
  it('+mj-lt and +mn-lt are standard OOXML theme placeholders', () => {
    // These are resolved at the font collector level (not substitution table)
    // Verify the common theme font defaults exist in our metrics
    const commonThemeFonts = [
      'Calibri', 'Calibri Light', 'Cambria', 'Arial',
    ];

    for (const font of commonThemeFonts) {
      const key = font.toLowerCase();
      expect(
        metricsBundle.fonts[key],
        `common theme font "${font}" should have metrics`
      ).toBeDefined();
    }
  });
});

describe('metrics bundle structure', () => {
  it('has at least 42 font families', () => {
    expect(Object.keys(metricsBundle.fonts).length).toBeGreaterThanOrEqual(42);
  });

  it('all faces have required fields', () => {
    for (const [family, faces] of Object.entries(metricsBundle.fonts)) {
      for (const face of faces) {
        expect(face.unitsPerEm, `${family}/${face.style} unitsPerEm`).toBeGreaterThan(0);
        expect(face.ascender, `${family}/${face.style} ascender`).toBeGreaterThan(0);
        expect(face.descender, `${family}/${face.style} descender`).toBeLessThan(0);
        expect(Object.keys(face.widths).length, `${family}/${face.style} widths`).toBeGreaterThan(50);
      }
    }
  });
});
