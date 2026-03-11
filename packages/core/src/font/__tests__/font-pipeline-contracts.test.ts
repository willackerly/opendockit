/**
 * Font pipeline cross-cutting contract tests.
 *
 * The font data sources must be mutually consistent:
 *   1. Substitution table (substitution-table.ts) — maps Office font names -> CSS
 *   2. Metrics bundle (data/metrics-bundle.ts) — precomputed per-font metrics
 *
 * After the font delivery redesign, WOFF2/TTF bundles live in @opendockit/fonts
 * (companion package). These tests verify the core-internal contracts only.
 */

import { describe, it, expect } from 'vitest';
import { metricsBundle } from '../data/metrics-bundle.js';
import { getFontSubstitution, resolveFontName } from '../substitution-table.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const metricsKeys = new Set(Object.keys(metricsBundle.fonts));

// ---------------------------------------------------------------------------
// Substitution table -> metrics coverage
// ---------------------------------------------------------------------------

describe('substitution table -> metrics coverage', () => {
  it('all major Office fonts that have bundled substitutes also have metrics', () => {
    const keyOfficeFonts = [
      'calibri',
      'calibri light',
      'cambria',
      'arial',
      'arial narrow',
      'times new roman',
      'courier new',
      'georgia',
      'segoe ui',
      'segoe ui light',
      'segoe ui semibold',
      'segoe ui semilight',
      'palatino linotype',
      'bookman old style',
      'century schoolbook',
    ];

    const missing: string[] = [];
    for (const font of keyOfficeFonts) {
      if (!metricsKeys.has(font)) {
        missing.push(font);
      }
    }

    expect(
      missing,
      `Office fonts without metrics: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('calibri has a substitution entry', () => {
    expect(getFontSubstitution('Calibri')).toBeDefined();
  });

  it('cambria has a substitution entry', () => {
    expect(getFontSubstitution('Cambria')).toBeDefined();
  });

  it('segoe ui has a substitution entry', () => {
    expect(getFontSubstitution('Segoe UI')).toBeDefined();
  });

  it('arial narrow has a substitution entry', () => {
    expect(getFontSubstitution('Arial Narrow')).toBeDefined();
  });

  it('palatino linotype has a substitution entry', () => {
    expect(getFontSubstitution('Palatino Linotype')).toBeDefined();
  });

  it('bookman old style has a substitution entry', () => {
    expect(getFontSubstitution('Bookman Old Style')).toBeDefined();
  });

  it('century schoolbook has a substitution entry', () => {
    expect(getFontSubstitution('Century Schoolbook')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Metrics bundle completeness
// ---------------------------------------------------------------------------

describe('metrics bundle completeness', () => {
  it('all Google Fonts families used in test fixtures have metrics', () => {
    const googleFonts = [
      'barlow',
      'barlow light',
      'barlow medium',
      'roboto slab',
      'roboto slab light',
      'roboto slab medium',
      'roboto slab semibold',
      'lato',
      'lato light',
      'montserrat',
      'open sans',
      'open sans extrabold',
      'poppins',
      'raleway',
      'roboto',
      'oswald',
      'ubuntu',
      'source sans pro',
      'source code pro',
      'playfair display',
      'noto serif',
      'noto sans',
      'noto sans symbols',
      'comfortaa',
      'comfortaa light',
      'fira code',
      'roboto mono',
      'courier prime',
      'tinos',
      'arimo',
      'play',
    ];

    const missing: string[] = [];
    for (const font of googleFonts) {
      if (!metricsKeys.has(font)) {
        missing.push(font);
      }
    }

    expect(
      missing,
      `Google Fonts without metrics: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('every font face has required fields with valid values', () => {
    for (const [family, faces] of Object.entries(metricsBundle.fonts)) {
      expect(Array.isArray(faces), `${family} should be an array of faces`).toBe(true);
      expect(faces.length, `${family} should have at least one face`).toBeGreaterThan(0);

      for (const face of faces) {
        expect(face.family, `${family}/${face.style} missing family`).toBeTruthy();
        expect(face.unitsPerEm, `${family}/${face.style} missing unitsPerEm`).toBeGreaterThan(0);
        expect(face.ascender, `${family}/${face.style} ascender should be positive`).toBeGreaterThan(
          0,
        );
        expect(face.descender, `${family}/${face.style} descender should be negative`).toBeLessThan(
          0,
        );
        expect(
          face.defaultWidth,
          `${family}/${face.style} missing defaultWidth`,
        ).toBeGreaterThan(0);
        expect(
          Object.keys(face.widths).length,
          `${family}/${face.style} has too few width entries`,
        ).toBeGreaterThan(20);
        expect(
          face.unitsPerEm === 1000 || face.unitsPerEm === 2048 || face.unitsPerEm > 0,
          `${family}/${face.style} unitsPerEm=${face.unitsPerEm} is unexpected`,
        ).toBe(true);

        if (face.lineHeight !== undefined) {
          expect(
            face.lineHeight,
            `${family}/${face.style} lineHeight=${face.lineHeight} out of range`,
          ).toBeGreaterThan(0.5);
          expect(
            face.lineHeight,
            `${family}/${face.style} lineHeight=${face.lineHeight} out of range`,
          ).toBeLessThan(3.0);
        }
      }
    }
  });

  it('every font family in the metrics bundle has a regular face', () => {
    const missingRegular: string[] = [];
    for (const [family, faces] of Object.entries(metricsBundle.fonts)) {
      if (!faces.some((f) => f.style === 'regular')) {
        missingRegular.push(family);
      }
    }
    expect(
      missingRegular,
      `Families missing a regular face: ${missingRegular.join(', ')}`,
    ).toEqual([]);
  });

  it('all font family keys in the metrics bundle are lowercase', () => {
    const nonLowercase: string[] = [];
    for (const key of Object.keys(metricsBundle.fonts)) {
      if (key !== key.toLowerCase()) {
        nonLowercase.push(key);
      }
    }
    expect(
      nonLowercase,
      `Metrics keys that are not lowercase: ${nonLowercase.join(', ')}`,
    ).toEqual([]);
  });

  it('face.family matches the capitalized form of the metrics key', () => {
    const mismatches: string[] = [];
    for (const [key, faces] of Object.entries(metricsBundle.fonts)) {
      for (const face of faces) {
        if (face.family.toLowerCase() !== key) {
          mismatches.push(`key='${key}' face.family='${face.family}'`);
        }
      }
    }
    expect(
      mismatches,
      `face.family/key mismatches:\n  ${mismatches.join('\n  ')}`,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Three-way consistency: substitution -> metrics
// ---------------------------------------------------------------------------

describe('substitution -> metrics consistency', () => {
  it('calibri: substitution table maps to Carlito, metrics exist', () => {
    const sub = getFontSubstitution('Calibri');
    expect(sub).toBeDefined();
    expect(sub).toContain('Carlito');
    expect(metricsKeys.has('calibri')).toBe(true);
  });

  it('cambria: substitution table maps to Caladea, metrics exist', () => {
    const sub = getFontSubstitution('Cambria');
    expect(sub).toBeDefined();
    expect(sub).toContain('Caladea');
    expect(metricsKeys.has('cambria')).toBe(true);
  });

  it('segoe ui: substitution table maps to Selawik, metrics exist', () => {
    const sub = getFontSubstitution('Segoe UI');
    expect(sub).toBeDefined();
    expect(sub).toContain('Selawik');
    expect(metricsKeys.has('segoe ui')).toBe(true);
  });

  it('arial: web-safe font with metrics', () => {
    expect(getFontSubstitution('Arial')).toBeUndefined();
    expect(metricsKeys.has('arial')).toBe(true);
  });

  it('times new roman: web-safe font with metrics', () => {
    expect(getFontSubstitution('Times New Roman')).toBeUndefined();
    expect(metricsKeys.has('times new roman')).toBe(true);
  });

  it('courier new: web-safe font with metrics', () => {
    expect(getFontSubstitution('Courier New')).toBeUndefined();
    expect(metricsKeys.has('courier new')).toBe(true);
  });

  it('palatino linotype: substitution table maps to TeX Gyre Pagella, metrics exist', () => {
    const sub = getFontSubstitution('Palatino Linotype');
    expect(sub).toBeDefined();
    expect(sub).toContain('TeX Gyre Pagella');
    expect(metricsKeys.has('palatino linotype')).toBe(true);
  });

  it('bookman old style: substitution table maps to TeX Gyre Bonum, metrics exist', () => {
    const sub = getFontSubstitution('Bookman Old Style');
    expect(sub).toBeDefined();
    expect(sub).toContain('TeX Gyre Bonum');
    expect(metricsKeys.has('bookman old style')).toBe(true);
  });

  it('century schoolbook: substitution table maps to TeX Gyre Schola, metrics exist', () => {
    const sub = getFontSubstitution('Century Schoolbook');
    expect(sub).toBeDefined();
    expect(sub).toContain('TeX Gyre Schola');
    expect(metricsKeys.has('century schoolbook')).toBe(true);
  });
});
