/**
 * WOFF2 bundle integrity tests.
 *
 * Verifies that every entry in the WOFF2 manifest:
 *   1. Has a non-empty variants list
 *   2. Resolves to a module that exports base64 strings for each declared variant
 *   3. Produces data whose length is consistent with real font data
 *
 * Also checks cross-consistency between the WOFF2 manifest and the metrics bundle:
 *   - Every WOFF2 manifest key has either direct metrics or metrics accessible via
 *     its registerAs name (alias entries share a module with their OFL counterpart,
 *     and metrics are stored under the Office font name, not the OFL name).
 */

import { describe, it, expect } from 'vitest';
import { BUNDLED_FONTS } from '../data/woff2/manifest.js';
import { metricsBundle } from '../data/metrics-bundle.js';

// ---------------------------------------------------------------------------
// Manifest structure tests
// ---------------------------------------------------------------------------

describe('WOFF2 manifest structure', () => {
  it('has at least 40 entries', () => {
    expect(Object.keys(BUNDLED_FONTS).length).toBeGreaterThanOrEqual(40);
  });

  it('every entry has a non-empty module path', () => {
    for (const [key, entry] of Object.entries(BUNDLED_FONTS)) {
      expect(entry.module, `${key}.module`).toBeTruthy();
      expect(entry.module, `${key}.module should start with ./`).toMatch(/^\.\//);
    }
  });

  it('every entry has a non-empty registerAs name', () => {
    for (const [key, entry] of Object.entries(BUNDLED_FONTS)) {
      expect(entry.registerAs, `${key}.registerAs`).toBeTruthy();
    }
  });

  it('every entry has at least one variant', () => {
    for (const [key, entry] of Object.entries(BUNDLED_FONTS)) {
      expect(entry.variants.length, `${key} has no variants`).toBeGreaterThan(0);
    }
  });

  it('all variants are known variant names', () => {
    const validVariants = new Set(['regular', 'bold', 'italic', 'boldItalic']);
    for (const [key, entry] of Object.entries(BUNDLED_FONTS)) {
      for (const variant of entry.variants) {
        expect(validVariants.has(variant), `${key}/${variant} is not a valid variant`).toBe(true);
      }
    }
  });

  it('no duplicate manifest keys', () => {
    // Object.keys deduplicates automatically — this tests that every key is unique
    const keys = Object.keys(BUNDLED_FONTS);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  it('substituteFor entries have registerAs matching their substituteFor target', () => {
    // When a key is an alias (e.g., key='calibri', substituteFor='Calibri'),
    // the registerAs should equal substituteFor so the font loads under the Office name.
    for (const [key, entry] of Object.entries(BUNDLED_FONTS)) {
      if (entry.substituteFor) {
        // Alias entries (where key === substituteFor.toLowerCase()) must match
        if (key === entry.substituteFor.toLowerCase()) {
          expect(
            entry.registerAs,
            `alias entry '${key}' should register as '${entry.substituteFor}'`
          ).toBe(entry.substituteFor);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Static module import map — loaded once, used per-entry
// ---------------------------------------------------------------------------
//
// Vite/Vitest cannot analyse template-literal dynamic imports at build time.
// We use import.meta.glob to eagerly load every WOFF2 module in one shot.
// The glob is relative to this test file, so ../data/woff2/*.ts matches all
// bundled font modules.

type Woff2Module = Record<string, string>;

// Eagerly import all WOFF2 modules. Keys are relative paths like
// '../data/woff2/arimo.ts'.
const woff2Modules = import.meta.glob<Woff2Module>('../data/woff2/*.ts', { eager: true });

/**
 * Resolve a manifest module path (e.g., './arimo.js') to the eagerly-loaded
 * module object.
 */
function getWoff2Module(manifestModule: string): Woff2Module | undefined {
  // Manifest paths: './arimo.js' → key in glob map: '../data/woff2/arimo.ts'
  const name = manifestModule.replace('./', '').replace('.js', '');
  const key = `../data/woff2/${name}.ts`;
  return woff2Modules[key];
}

// ---------------------------------------------------------------------------
// Module import tests — verify each WOFF2 module exports valid base64 data
// ---------------------------------------------------------------------------

describe('WOFF2 module exports', () => {
  // These are the unique module files referenced by the manifest
  // (multiple keys may share the same module, e.g., 'calibri' and 'carlito' both
  // use './carlito.js')
  const uniqueModules = new Map<string, { key: string; variants: string[] }>();
  for (const [key, entry] of Object.entries(BUNDLED_FONTS)) {
    const moduleName = entry.module.replace('./', '').replace('.js', '');
    if (!uniqueModules.has(moduleName)) {
      uniqueModules.set(moduleName, { key, variants: entry.variants });
    }
  }

  it('glob loaded at least 40 WOFF2 modules', () => {
    expect(Object.keys(woff2Modules).length).toBeGreaterThanOrEqual(40);
  });

  it('every manifest module is present in the glob result', () => {
    const missing: string[] = [];
    for (const [, entry] of Object.entries(BUNDLED_FONTS)) {
      if (getWoff2Module(entry.module) === undefined) {
        missing.push(entry.module);
      }
    }
    expect(missing, `Manifest modules not found by glob: ${missing.join(', ')}`).toEqual([]);
  });

  for (const [moduleName, { key, variants }] of uniqueModules) {
    describe(`${moduleName}`, () => {
      it('exports non-empty base64 strings for each declared variant', () => {
        const mod = getWoff2Module(`./${moduleName}.js`);
        expect(mod, `module ${moduleName} not found in glob`).toBeDefined();
        if (!mod) return;

        for (const variant of variants) {
          const value: unknown = mod[variant];
          expect(value, `${key}/${variant} export should exist`).toBeDefined();
          expect(typeof value, `${key}/${variant} should be a string`).toBe('string');

          const b64 = value as string;
          // Real WOFF2 fonts are at minimum several kilobytes; base64 encoding adds ~33%
          // A 4KB font becomes ~5400 base64 chars. We use a generous minimum.
          expect(b64.length, `${key}/${variant} base64 string is too short`).toBeGreaterThan(100);
        }
      });

      it('base64 data decodes to WOFF2 magic bytes', () => {
        const mod = getWoff2Module(`./${moduleName}.js`);
        if (!mod) return; // covered by prior test

        // Check only the 'regular' variant (all variants in one module share format)
        const regularOrFirst = variants.includes('regular') ? 'regular' : variants[0];
        const value: unknown = mod[regularOrFirst];
        if (typeof value !== 'string' || value.length < 8) return;

        // Decode first 6 bytes of base64 (8 base64 chars → 6 raw bytes)
        const binaryStr = atob(value.slice(0, 8));
        const bytes = Array.from(binaryStr).map((c) => c.charCodeAt(0));

        // WOFF2: magic = 0x774F4632 ("wOF2")
        // WOFF:  magic = 0x774F4646 ("wOFF")
        // Either is acceptable
        const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
        expect(
          magic === 'wOF2' || magic === 'wOFF',
          `${key}/${regularOrFirst}: expected WOFF2 or WOFF magic bytes, got "${magic}" (bytes: ${bytes.slice(0, 4).join(',')})`
        ).toBe(true);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// WOFF2 manifest ↔ metrics bundle cross-consistency
// ---------------------------------------------------------------------------

describe('WOFF2 ↔ metrics bundle consistency', () => {
  const metricsKeys = new Set(Object.keys(metricsBundle.fonts));

  it('every WOFF2 manifest key resolves to font metrics', () => {
    // For OFL substitute fonts (e.g., key='carlito', substituteFor='Calibri'),
    // metrics are stored under the Office font name (e.g., 'calibri'), not the
    // OFL name. The alias entry (key='calibri') provides the metrics lookup path.
    // So we check: either the key itself, or the registerAs (lowercase), or the
    // substituteFor (lowercase) is in the metrics bundle.
    const missingMetrics: string[] = [];

    for (const [key, entry] of Object.entries(BUNDLED_FONTS)) {
      const registerAsLower = entry.registerAs.toLowerCase();
      const substituteForLower = entry.substituteFor?.toLowerCase();

      const hasMetrics =
        metricsKeys.has(key) ||
        metricsKeys.has(registerAsLower) ||
        (substituteForLower !== undefined && metricsKeys.has(substituteForLower));

      if (!hasMetrics) {
        missingMetrics.push(`${key} (registerAs: ${entry.registerAs})`);
      }
    }

    expect(
      missingMetrics,
      `WOFF2 entries without any metrics coverage:\n  ${missingMetrics.join('\n  ')}`
    ).toEqual([]);
  });

  it('metrics bundle has at least 40 font families', () => {
    expect(Object.keys(metricsBundle.fonts).length).toBeGreaterThanOrEqual(40);
  });

  it('metrics bundle version is 1', () => {
    expect(metricsBundle.version).toBe(1);
  });
});
