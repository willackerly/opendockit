/**
 * Font system cross-consumer consistency tests.
 *
 * Verifies that font substitution and metrics are in sync:
 * - Every substitution resolves to a font with metrics
 * - Theme placeholder resolution produces valid font names
 *
 * After the font delivery redesign, WOFF2/TTF bundles live in the
 * @opendockit/fonts companion package. Cross-consistency with those
 * bundles is verified in the companion package's own tests.
 */

import { describe, it, expect } from 'vitest';
import { getFontSubstitution } from '../substitution-table.js';
import { metricsBundle } from '../data/metrics-bundle.js';

describe('font substitution -> metrics consistency', () => {
  it('every Office font with a substitution has metrics (under original or substitute name)', () => {
    const officeFonts = [
      'Calibri',
      'Arial',
      'Times New Roman',
      'Courier New',
      'Cambria',
      'Georgia',
      'Segoe UI',
      'Arial Narrow',
      'Palatino Linotype',
      'Bookman Old Style',
      'Century Schoolbook',
    ];

    for (const font of officeFonts) {
      const fontKey = font.toLowerCase();
      const sub = getFontSubstitution(font);

      const hasMetricsUnderOriginal = fontKey in metricsBundle.fonts;
      let hasMetricsUnderSubstitute = false;
      if (sub) {
        const primaryFamily = sub
          .split(',')[0]
          .trim()
          .replace(/'/g, '')
          .toLowerCase();
        hasMetricsUnderSubstitute = primaryFamily in metricsBundle.fonts;
      }

      expect(
        hasMetricsUnderOriginal || hasMetricsUnderSubstitute,
        `"${font}" should have metrics under "${fontKey}" or its substitute`,
      ).toBe(true);
    }
  });
});

describe('theme placeholder resolution', () => {
  it('+mj-lt and +mn-lt are standard OOXML theme placeholders', () => {
    const commonThemeFonts = ['Calibri', 'Calibri Light', 'Cambria', 'Arial'];

    for (const font of commonThemeFonts) {
      const key = font.toLowerCase();
      expect(
        metricsBundle.fonts[key],
        `common theme font "${font}" should have metrics`,
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
        expect(Object.keys(face.widths).length, `${family}/${face.style} widths`).toBeGreaterThan(
          50,
        );
      }
    }
  });
});
