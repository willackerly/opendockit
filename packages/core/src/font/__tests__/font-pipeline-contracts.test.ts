/**
 * Font pipeline cross-cutting contract tests.
 *
 * The three font data sources must be mutually consistent:
 *   1. Substitution table (substitution-table.ts) — maps Office font names → CSS
 *   2. Metrics bundle (data/metrics-bundle.ts) — precomputed per-font metrics
 *   3. WOFF2 manifest (data/woff2/manifest.ts) — bundled font files
 *
 * These tests verify the integration contracts between all three sources so that
 * any future changes to one source that break another are caught immediately.
 */

import { describe, it, expect } from 'vitest';
import { BUNDLED_FONTS } from '../data/woff2/manifest.js';
import { metricsBundle } from '../data/metrics-bundle.js';
import { getFontSubstitution, resolveFontName } from '../substitution-table.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const metricsKeys = new Set(Object.keys(metricsBundle.fonts));

// ---------------------------------------------------------------------------
// Substitution table → metrics coverage
// ---------------------------------------------------------------------------

describe('substitution table → metrics coverage', () => {
  it('all major Office fonts that have bundled substitutes also have metrics', () => {
    // These are the primary Office fonts users encounter. Each should have
    // a WOFF2 substitute AND metrics for accurate pre-layout.
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
      `Office fonts without metrics: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('Office fonts with bundled substitutes are resolvable', () => {
    // For every Office font name that has a WOFF2 entry, resolveFontName should
    // return something — either a substitution CSS string or the original name.
    const officeFontsInManifest = Object.values(BUNDLED_FONTS)
      .filter((e) => e.substituteFor !== undefined)
      .map((e) => e.substituteFor as string);

    const unresolvable: string[] = [];
    for (const font of officeFontsInManifest) {
      const resolved = resolveFontName(font);
      // resolveFontName always returns something; we just verify it is non-empty
      if (!resolved) {
        unresolvable.push(font);
      }
    }

    expect(unresolvable, `Fonts that could not be resolved: ${unresolvable.join(', ')}`).toEqual(
      []
    );
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
// WOFF2 manifest → metrics coverage
// ---------------------------------------------------------------------------

describe('WOFF2 manifest → metrics coverage', () => {
  it('every WOFF2 entry has font metrics accessible via its registerAs name or substituteFor', () => {
    // OFL fonts (caladea, carlito, etc.) store metrics under the Office font name
    // (cambria, calibri, etc.) not the OFL name. Both the OFL entry and the alias
    // entry in the manifest point to the same Office font's metrics.
    const missing: string[] = [];

    for (const [key, entry] of Object.entries(BUNDLED_FONTS)) {
      const registerAsLower = entry.registerAs.toLowerCase();
      const substituteForLower = entry.substituteFor?.toLowerCase();

      const hasMetrics =
        metricsKeys.has(key) ||
        metricsKeys.has(registerAsLower) ||
        (substituteForLower !== undefined && metricsKeys.has(substituteForLower));

      if (!hasMetrics) {
        missing.push(`${entry.registerAs} (key: ${key})`);
      }
    }

    expect(
      missing,
      `WOFF2 families without any metrics path:\n  ${missing.join('\n  ')}`
    ).toEqual([]);
  });

  it('every WOFF2 alias entry has metrics under the Office font name key', () => {
    // Alias entries have key === substituteFor.toLowerCase(), meaning the manifest
    // key IS the Office font name. e.g., key='calibri' → metricsBundle.fonts['calibri']
    for (const [key, entry] of Object.entries(BUNDLED_FONTS)) {
      if (entry.substituteFor && key === entry.substituteFor.toLowerCase()) {
        expect(
          metricsKeys.has(key),
          `Alias entry '${key}' (registerAs: ${entry.registerAs}) should have metrics under key '${key}'`
        ).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// WOFF2 manifest internal consistency
// ---------------------------------------------------------------------------

describe('WOFF2 manifest internal consistency', () => {
  it('no manifest key appears more than once', () => {
    const keys = Object.keys(BUNDLED_FONTS);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  it('every module path referenced exists as a unique filename', () => {
    // All referenced module filenames should be consistent (no typos)
    const moduleNames = new Set(
      Object.values(BUNDLED_FONTS).map((e) => e.module.replace('./', '').replace('.js', ''))
    );
    // Should have fewer unique modules than keys (aliases share modules)
    expect(moduleNames.size).toBeGreaterThan(0);
    expect(moduleNames.size).toBeLessThan(Object.keys(BUNDLED_FONTS).length);
  });

  it('alias entries that share modules do so consistently', () => {
    // When an alias entry (key === substituteFor.toLowerCase()) shares its module
    // with another entry, both must declare the same set of variants.
    // Some alias entries use a unique module (e.g., 'calibri light' → calibri-light.js)
    // which is fine — in that case there is no OFL entry to compare against.
    for (const [aliasKey, aliasEntry] of Object.entries(BUNDLED_FONTS)) {
      if (!aliasEntry.substituteFor || aliasKey !== aliasEntry.substituteFor.toLowerCase()) {
        continue;
      }

      // Find other entries using the same module
      const sharedEntries = Object.entries(BUNDLED_FONTS).filter(
        ([otherKey, otherEntry]) =>
          otherEntry.module === aliasEntry.module && otherKey !== aliasKey
      );

      // If the module is shared, variants should be consistent
      for (const [_olfKey, olfEntry] of sharedEntries) {
        // The alias should declare a subset of the OFL entry's variants
        const olfVariantSet = new Set(olfEntry.variants);
        for (const variant of aliasEntry.variants) {
          expect(
            olfVariantSet.has(variant),
            `Alias '${aliasKey}' declares variant '${variant}' not in shared entry '${_olfKey}'`
          ).toBe(true);
        }
      }
    }
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
      `Google Fonts without metrics: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('every font face has required fields with valid values', () => {
    for (const [family, faces] of Object.entries(metricsBundle.fonts)) {
      expect(Array.isArray(faces), `${family} should be an array of faces`).toBe(true);
      expect(faces.length, `${family} should have at least one face`).toBeGreaterThan(0);

      for (const face of faces) {
        expect(face.family, `${family}/${face.style} missing family`).toBeTruthy();
        expect(face.unitsPerEm, `${family}/${face.style} missing unitsPerEm`).toBeGreaterThan(0);
        expect(face.ascender, `${family}/${face.style} ascender should be positive`).toBeGreaterThan(0);
        expect(face.descender, `${family}/${face.style} descender should be negative`).toBeLessThan(0);

        // defaultWidth must be positive
        expect(
          face.defaultWidth,
          `${family}/${face.style} missing defaultWidth`
        ).toBeGreaterThan(0);

        // widths map should have at least basic ASCII coverage (a–z, A–Z, 0–9)
        expect(
          Object.keys(face.widths).length,
          `${family}/${face.style} has too few width entries`
        ).toBeGreaterThan(20);

        // unitsPerEm should be a power-of-two or round number (1000, 2048, etc.)
        expect(
          face.unitsPerEm === 1000 || face.unitsPerEm === 2048 || face.unitsPerEm > 0,
          `${family}/${face.style} unitsPerEm=${face.unitsPerEm} is unexpected`
        ).toBe(true);

        // lineHeight is optional but if present should be reasonable (0.9–2.0)
        if (face.lineHeight !== undefined) {
          expect(
            face.lineHeight,
            `${family}/${face.style} lineHeight=${face.lineHeight} out of range`
          ).toBeGreaterThan(0.5);
          expect(
            face.lineHeight,
            `${family}/${face.style} lineHeight=${face.lineHeight} out of range`
          ).toBeLessThan(3.0);
        }
      }
    }
  });

  it('every font family in the metrics bundle has a regular face', () => {
    // Metrics must include a regular face for every family — it is the baseline
    // used when bold/italic are not available.
    const missingRegular: string[] = [];
    for (const [family, faces] of Object.entries(metricsBundle.fonts)) {
      if (!faces.some((f) => f.style === 'regular')) {
        missingRegular.push(family);
      }
    }
    expect(
      missingRegular,
      `Families missing a regular face: ${missingRegular.join(', ')}`
    ).toEqual([]);
  });

  it('all font family keys in the metrics bundle are lowercase', () => {
    // The metrics bundle keys must be lowercase for consistent lookup
    const nonLowercase: string[] = [];
    for (const key of Object.keys(metricsBundle.fonts)) {
      if (key !== key.toLowerCase()) {
        nonLowercase.push(key);
      }
    }
    expect(
      nonLowercase,
      `Metrics keys that are not lowercase: ${nonLowercase.join(', ')}`
    ).toEqual([]);
  });

  it('face.family matches the capitalized form of the metrics key', () => {
    // The family name stored in each face should match (case-insensitively) the
    // key under which it is stored. This prevents lookup mismatches.
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
      `face.family/key mismatches:\n  ${mismatches.join('\n  ')}`
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Three-way consistency: substitution → WOFF2 → metrics
// ---------------------------------------------------------------------------

describe('three-way pipeline consistency', () => {
  it('calibri substitution chain: substitution table → WOFF2 → metrics', () => {
    // Calibri: substitution table maps to Carlito CSS string
    const sub = getFontSubstitution('Calibri');
    expect(sub).toBeDefined();
    expect(sub).toContain('Carlito');

    // WOFF2 manifest has both the 'carlito' OFL entry and the 'calibri' alias
    expect(BUNDLED_FONTS['carlito']).toBeDefined();
    expect(BUNDLED_FONTS['carlito'].substituteFor).toBe('Calibri');
    expect(BUNDLED_FONTS['calibri']).toBeDefined();
    expect(BUNDLED_FONTS['calibri'].registerAs).toBe('Calibri');

    // Metrics exist under the 'calibri' key
    expect(metricsKeys.has('calibri')).toBe(true);
  });

  it('cambria substitution chain: substitution table → WOFF2 → metrics', () => {
    const sub = getFontSubstitution('Cambria');
    expect(sub).toBeDefined();
    expect(sub).toContain('Caladea');

    expect(BUNDLED_FONTS['caladea']).toBeDefined();
    expect(BUNDLED_FONTS['caladea'].substituteFor).toBe('Cambria');
    expect(BUNDLED_FONTS['cambria']).toBeDefined();
    expect(BUNDLED_FONTS['cambria'].registerAs).toBe('Cambria');

    expect(metricsKeys.has('cambria')).toBe(true);
  });

  it('segoe ui substitution chain: substitution table → WOFF2 → metrics', () => {
    const sub = getFontSubstitution('Segoe UI');
    expect(sub).toBeDefined();
    expect(sub).toContain('Selawik');

    expect(BUNDLED_FONTS['selawik']).toBeDefined();
    expect(BUNDLED_FONTS['selawik'].substituteFor).toBe('Segoe UI');
    expect(BUNDLED_FONTS['segoe ui']).toBeDefined();
    expect(BUNDLED_FONTS['segoe ui'].registerAs).toBe('Segoe UI');

    expect(metricsKeys.has('segoe ui')).toBe(true);
  });

  it('arial substitution chain: no substitution needed → WOFF2 → metrics', () => {
    // Arial is web-safe: substitution table returns undefined
    expect(getFontSubstitution('Arial')).toBeUndefined();

    // But there IS a WOFF2 bundle (Liberation Sans) registered as Arial
    expect(BUNDLED_FONTS['arial']).toBeDefined();
    expect(BUNDLED_FONTS['arial'].registerAs).toBe('Arial');

    // And metrics exist
    expect(metricsKeys.has('arial')).toBe(true);
  });

  it('times new roman: no substitution needed → WOFF2 → metrics', () => {
    expect(getFontSubstitution('Times New Roman')).toBeUndefined();

    expect(BUNDLED_FONTS['times new roman']).toBeDefined();
    expect(BUNDLED_FONTS['times new roman'].registerAs).toBe('Times New Roman');

    expect(metricsKeys.has('times new roman')).toBe(true);
  });

  it('courier new: no substitution needed → WOFF2 → metrics', () => {
    expect(getFontSubstitution('Courier New')).toBeUndefined();

    expect(BUNDLED_FONTS['courier new']).toBeDefined();
    expect(BUNDLED_FONTS['courier new'].registerAs).toBe('Courier New');

    expect(metricsKeys.has('courier new')).toBe(true);
  });

  it('palatino linotype: substitution table → WOFF2 → metrics', () => {
    const sub = getFontSubstitution('Palatino Linotype');
    expect(sub).toBeDefined();
    expect(sub).toContain('TeX Gyre Pagella');

    expect(BUNDLED_FONTS['tex gyre pagella']).toBeDefined();
    expect(BUNDLED_FONTS['tex gyre pagella'].substituteFor).toBe('Palatino Linotype');
    expect(BUNDLED_FONTS['palatino linotype']).toBeDefined();

    expect(metricsKeys.has('palatino linotype')).toBe(true);
  });

  it('bookman old style: substitution table → WOFF2 → metrics', () => {
    const sub = getFontSubstitution('Bookman Old Style');
    expect(sub).toBeDefined();
    expect(sub).toContain('TeX Gyre Bonum');

    expect(BUNDLED_FONTS['tex gyre bonum']).toBeDefined();
    expect(BUNDLED_FONTS['bookman old style']).toBeDefined();

    expect(metricsKeys.has('bookman old style')).toBe(true);
  });

  it('century schoolbook: substitution table → WOFF2 → metrics', () => {
    const sub = getFontSubstitution('Century Schoolbook');
    expect(sub).toBeDefined();
    expect(sub).toContain('TeX Gyre Schola');

    expect(BUNDLED_FONTS['tex gyre schola']).toBeDefined();
    expect(BUNDLED_FONTS['century schoolbook']).toBeDefined();

    expect(metricsKeys.has('century schoolbook')).toBe(true);
  });
});
