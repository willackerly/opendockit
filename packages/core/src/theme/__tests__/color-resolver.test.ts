import { describe, it, expect } from 'vitest';
import { parseXml } from '../../xml/index.js';
import { resolveColor, resolveColorFromParent } from '../color-resolver.js';
import type { ThemeIR } from '../../ir/index.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Standard Office theme for color lookups. */
const TEST_THEME: ThemeIR = {
  name: 'Test Theme',
  colorScheme: {
    dk1: { r: 0, g: 0, b: 0, a: 1 },
    lt1: { r: 255, g: 255, b: 255, a: 1 },
    dk2: { r: 68, g: 84, b: 106, a: 1 },
    lt2: { r: 231, g: 230, b: 230, a: 1 },
    accent1: { r: 68, g: 114, b: 196, a: 1 },
    accent2: { r: 237, g: 125, b: 49, a: 1 },
    accent3: { r: 165, g: 165, b: 165, a: 1 },
    accent4: { r: 255, g: 192, b: 0, a: 1 },
    accent5: { r: 91, g: 155, b: 213, a: 1 },
    accent6: { r: 112, g: 173, b: 71, a: 1 },
    hlink: { r: 5, g: 99, b: 193, a: 1 },
    folHlink: { r: 149, g: 79, b: 114, a: 1 },
  },
  fontScheme: {
    majorLatin: 'Calibri Light',
    minorLatin: 'Calibri',
  },
  formatScheme: {
    fillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
    lineStyles: [{}, {}, {}],
    effectStyles: [[], [], []],
    bgFillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
  },
};

/** Helper to parse an XML color element and resolve it. */
function resolve(
  xml: string,
  context?: { phClr?: { r: number; g: number; b: number; a: number; schemeKey?: string } }
) {
  const el = parseXml(xml);
  return resolveColor(el, TEST_THEME, context);
}

// ---------------------------------------------------------------------------
// Tests: Base color types
// ---------------------------------------------------------------------------

describe('resolveColor', () => {
  describe('srgbClr', () => {
    it('resolves a hex RGB color', () => {
      const color = resolve(
        '<a:srgbClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="FF0000"/>'
      );
      expect(color.r).toBe(255);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
      expect(color.a).toBe(1);
    });

    it('resolves accent1 hex color', () => {
      const color = resolve(
        '<a:srgbClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="4472C4"/>'
      );
      expect(color.r).toBe(68);
      expect(color.g).toBe(114);
      expect(color.b).toBe(196);
    });

    it('handles lowercase hex', () => {
      const color = resolve(
        '<a:srgbClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="ff8800"/>'
      );
      expect(color.r).toBe(255);
      expect(color.g).toBe(136);
      expect(color.b).toBe(0);
    });
  });

  describe('schemeClr', () => {
    it('resolves accent1 from theme', () => {
      const color = resolve(
        '<a:schemeClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="accent1"/>'
      );
      expect(color.r).toBe(68);
      expect(color.g).toBe(114);
      expect(color.b).toBe(196);
      expect(color.schemeKey).toBe('accent1');
    });

    it('resolves dk1 from theme', () => {
      const color = resolve(
        '<a:schemeClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="dk1"/>'
      );
      expect(color.r).toBe(0);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
    });

    it('resolves lt1 from theme', () => {
      const color = resolve(
        '<a:schemeClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="lt1"/>'
      );
      expect(color.r).toBe(255);
      expect(color.g).toBe(255);
      expect(color.b).toBe(255);
    });
  });

  describe('schemeClr aliases', () => {
    it('tx1 maps to dk1', () => {
      const color = resolve(
        '<a:schemeClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="tx1"/>'
      );
      expect(color.r).toBe(0);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
      expect(color.schemeKey).toBe('dk1');
    });

    it('tx2 maps to dk2', () => {
      const color = resolve(
        '<a:schemeClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="tx2"/>'
      );
      expect(color.r).toBe(68);
      expect(color.g).toBe(84);
      expect(color.b).toBe(106);
      expect(color.schemeKey).toBe('dk2');
    });

    it('bg1 maps to lt1', () => {
      const color = resolve(
        '<a:schemeClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="bg1"/>'
      );
      expect(color.r).toBe(255);
      expect(color.g).toBe(255);
      expect(color.b).toBe(255);
      expect(color.schemeKey).toBe('lt1');
    });

    it('bg2 maps to lt2', () => {
      const color = resolve(
        '<a:schemeClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="bg2"/>'
      );
      expect(color.r).toBe(231);
      expect(color.g).toBe(230);
      expect(color.b).toBe(230);
      expect(color.schemeKey).toBe('lt2');
    });
  });

  describe('schemeClr phClr', () => {
    it('resolves phClr from context', () => {
      const context = { phClr: { r: 100, g: 150, b: 200, a: 1 } };
      const color = resolve(
        '<a:schemeClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="phClr"/>',
        context
      );
      expect(color.r).toBe(100);
      expect(color.g).toBe(150);
      expect(color.b).toBe(200);
      expect(color.schemeKey).toBe('phClr');
    });

    it('returns black when phClr context is not provided', () => {
      const color = resolve(
        '<a:schemeClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="phClr"/>'
      );
      expect(color.r).toBe(0);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
    });
  });

  describe('sysClr', () => {
    it('resolves system color using lastClr attribute', () => {
      const color = resolve(
        '<a:sysClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="windowText" lastClr="000000"/>'
      );
      expect(color.r).toBe(0);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
    });

    it('resolves white system color using lastClr', () => {
      const color = resolve(
        '<a:sysClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="window" lastClr="FFFFFF"/>'
      );
      expect(color.r).toBe(255);
      expect(color.g).toBe(255);
      expect(color.b).toBe(255);
    });

    it('falls back to system color name when lastClr is absent', () => {
      const color = resolve(
        '<a:sysClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="windowText"/>'
      );
      // Should resolve to black (windowText default)
      expect(color.r).toBe(0);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
    });
  });

  describe('prstClr', () => {
    it('resolves preset color "red"', () => {
      const color = resolve(
        '<a:prstClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="red"/>'
      );
      expect(color.r).toBe(255);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
    });

    it('resolves preset color "black"', () => {
      const color = resolve(
        '<a:prstClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="black"/>'
      );
      expect(color.r).toBe(0);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
    });

    it('resolves preset color "white"', () => {
      const color = resolve(
        '<a:prstClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="white"/>'
      );
      expect(color.r).toBe(255);
      expect(color.g).toBe(255);
      expect(color.b).toBe(255);
    });

    it('resolves preset color "blue"', () => {
      const color = resolve(
        '<a:prstClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="blue"/>'
      );
      expect(color.r).toBe(0);
      expect(color.g).toBe(0);
      expect(color.b).toBe(255);
    });

    it('resolves preset color "coral"', () => {
      const color = resolve(
        '<a:prstClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="coral"/>'
      );
      expect(color.r).toBe(255);
      expect(color.g).toBe(127);
      expect(color.b).toBe(80);
    });

    it('returns black for unknown preset color', () => {
      const color = resolve(
        '<a:prstClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="notAColor"/>'
      );
      expect(color.r).toBe(0);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
    });
  });

  describe('hslClr', () => {
    it('resolves pure red from HSL', () => {
      // hue=0, sat=100%, lum=50% -> red
      const color = resolve(
        '<a:hslClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" hue="0" sat="100000" lum="50000"/>'
      );
      expect(color.r).toBe(255);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
    });

    it('resolves black from HSL (lum=0)', () => {
      const color = resolve(
        '<a:hslClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" hue="0" sat="0" lum="0"/>'
      );
      expect(color.r).toBe(0);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
    });

    it('resolves white from HSL (lum=100%)', () => {
      const color = resolve(
        '<a:hslClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" hue="0" sat="0" lum="100000"/>'
      );
      expect(color.r).toBe(255);
      expect(color.g).toBe(255);
      expect(color.b).toBe(255);
    });

    it('resolves green from HSL (hue=120deg)', () => {
      // hue=120 degrees = 120 * 60000 = 7200000
      const color = resolve(
        '<a:hslClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" hue="7200000" sat="100000" lum="50000"/>'
      );
      expect(color.r).toBe(0);
      expect(color.g).toBe(255);
      expect(color.b).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: Color transforms
  // ---------------------------------------------------------------------------

  describe('color transforms', () => {
    describe('lumMod (luminance modulation)', () => {
      it('darkens accent1 by 75% luminance', () => {
        const color = resolve(`
          <a:schemeClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="accent1">
            <a:lumMod val="75000"/>
          </a:schemeClr>
        `);
        // accent1 is #4472C4 -> should be darker
        expect(color.r).toBeLessThan(68);
        expect(color.b).toBeLessThan(196);
        expect(color.a).toBe(1);
      });

      it('lumMod 50000 makes color noticeably darker', () => {
        const color = resolve(`
          <a:schemeClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="accent1">
            <a:lumMod val="50000"/>
          </a:schemeClr>
        `);
        // Should be significantly darker than original accent1
        expect(color.r).toBeLessThan(68);
        expect(color.g).toBeLessThan(114);
      });
    });

    describe('lumOff (luminance offset)', () => {
      it('lightens with lumOff 25%', () => {
        const color = resolve(`
          <a:schemeClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="accent1">
            <a:lumOff val="25000"/>
          </a:schemeClr>
        `);
        // Should be lighter than original
        expect(color.r).toBeGreaterThan(68);
        expect(color.g).toBeGreaterThan(114);
      });
    });

    describe('lumMod + lumOff combined (tint pattern)', () => {
      it('applies lumMod 60% + lumOff 40%', () => {
        const color = resolve(`
          <a:schemeClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="accent1">
            <a:lumMod val="60000"/>
            <a:lumOff val="40000"/>
          </a:schemeClr>
        `);
        // This is a common tint pattern (60% luminance mod + 40% luminance offset)
        // Result should be lighter than original accent1
        expect(color.r).toBeGreaterThan(68);
        expect(color.g).toBeGreaterThan(114);
        expect(color.b).toBeGreaterThan(196);
      });
    });

    describe('tint', () => {
      it('tint 50% moves halfway to white', () => {
        // Start with black, tint 50% -> should be ~grey
        const color = resolve(`
          <a:srgbClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="000000">
            <a:tint val="50000"/>
          </a:srgbClr>
        `);
        // tint formula: 255 - (255 - 0) * 0.5 = 128
        expect(color.r).toBeCloseTo(128, -1);
        expect(color.g).toBeCloseTo(128, -1);
        expect(color.b).toBeCloseTo(128, -1);
      });

      it('tint 100% returns original color', () => {
        const color = resolve(`
          <a:srgbClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="FF0000">
            <a:tint val="100000"/>
          </a:srgbClr>
        `);
        expect(color.r).toBe(255);
        expect(color.g).toBe(0);
        expect(color.b).toBe(0);
      });

      it('tint on accent1 produces a lighter color', () => {
        const color = resolve(`
          <a:schemeClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="accent1">
            <a:tint val="50000"/>
          </a:schemeClr>
        `);
        // Should be lighter (closer to white) than accent1
        expect(color.r).toBeGreaterThan(68);
        expect(color.g).toBeGreaterThan(114);
        expect(color.b).toBeGreaterThan(196);
      });
    });

    describe('shade', () => {
      it('shade 50% darkens white to grey', () => {
        const color = resolve(`
          <a:srgbClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="FFFFFF">
            <a:shade val="50000"/>
          </a:srgbClr>
        `);
        // shade formula: 255 * 0.5 = 128
        expect(color.r).toBeCloseTo(128, -1);
        expect(color.g).toBeCloseTo(128, -1);
        expect(color.b).toBeCloseTo(128, -1);
      });

      it('shade 100% returns original color', () => {
        const color = resolve(`
          <a:srgbClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="FF0000">
            <a:shade val="100000"/>
          </a:srgbClr>
        `);
        expect(color.r).toBe(255);
        expect(color.g).toBe(0);
        expect(color.b).toBe(0);
      });

      it('shade on accent1 produces a darker color', () => {
        const color = resolve(`
          <a:schemeClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="accent1">
            <a:shade val="50000"/>
          </a:schemeClr>
        `);
        // Should be darker than accent1
        expect(color.r).toBeLessThan(68);
        expect(color.g).toBeLessThan(114);
        expect(color.b).toBeLessThan(196);
      });
    });

    describe('alpha', () => {
      it('sets alpha to 50%', () => {
        const color = resolve(`
          <a:srgbClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="FF0000">
            <a:alpha val="50000"/>
          </a:srgbClr>
        `);
        expect(color.r).toBe(255);
        expect(color.g).toBe(0);
        expect(color.b).toBe(0);
        expect(color.a).toBeCloseTo(0.5);
      });

      it('sets alpha to 0% (fully transparent)', () => {
        const color = resolve(`
          <a:srgbClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="FF0000">
            <a:alpha val="0"/>
          </a:srgbClr>
        `);
        expect(color.a).toBe(0);
      });

      it('sets alpha to 100% (fully opaque)', () => {
        const color = resolve(`
          <a:srgbClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="FF0000">
            <a:alpha val="100000"/>
          </a:srgbClr>
        `);
        expect(color.a).toBe(1);
      });
    });

    describe('satMod (saturation modulation)', () => {
      it('satMod 120% increases saturation', () => {
        const original = resolve(
          '<a:schemeClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="accent1"/>'
        );
        const color = resolve(`
          <a:schemeClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="accent1">
            <a:satMod val="120000"/>
          </a:schemeClr>
        `);
        // With more saturation, the color should be more vivid
        // Blue channel dominant in accent1, so it should stay high
        expect(color.b).toBeGreaterThanOrEqual(original.b - 10); // Allow some rounding
      });

      it('satMod 0% desaturates completely', () => {
        const color = resolve(`
          <a:srgbClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="FF0000">
            <a:satMod val="0"/>
          </a:srgbClr>
        `);
        // Fully desaturated red should be gray
        expect(color.r).toBe(color.g);
        expect(color.g).toBe(color.b);
      });
    });

    describe('comp (complementary)', () => {
      it('complement of red is cyan', () => {
        const color = resolve(`
          <a:srgbClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="FF0000">
            <a:comp/>
          </a:srgbClr>
        `);
        // Complement rotates hue by 180 degrees
        // Red -> Cyan
        expect(color.r).toBe(0);
        expect(color.g).toBe(255);
        expect(color.b).toBe(255);
      });
    });

    describe('inv (inverse)', () => {
      it('inverse of red is cyan', () => {
        const color = resolve(`
          <a:srgbClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="FF0000">
            <a:inv/>
          </a:srgbClr>
        `);
        // inv: 255 - r, 255 - g, 255 - b
        expect(color.r).toBe(0);
        expect(color.g).toBe(255);
        expect(color.b).toBe(255);
      });

      it('inverse of black is white', () => {
        const color = resolve(`
          <a:srgbClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="000000">
            <a:inv/>
          </a:srgbClr>
        `);
        expect(color.r).toBe(255);
        expect(color.g).toBe(255);
        expect(color.b).toBe(255);
      });
    });

    describe('gray (grayscale)', () => {
      it('converts colored to gray', () => {
        const color = resolve(`
          <a:srgbClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="FF0000">
            <a:gray/>
          </a:srgbClr>
        `);
        // All channels should be equal (grayscale)
        expect(color.r).toBe(color.g);
        expect(color.g).toBe(color.b);
        // Red with BT.601 luma: 0.299 * 255 ≈ 76
        expect(color.r).toBeCloseTo(76, -1);
      });
    });

    describe('no transforms', () => {
      it('returns base color unchanged when no children', () => {
        const color = resolve(
          '<a:srgbClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="4472C4"/>'
        );
        expect(color.r).toBe(68);
        expect(color.g).toBe(114);
        expect(color.b).toBe(196);
        expect(color.a).toBe(1);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // resolveColorFromParent
  // ---------------------------------------------------------------------------

  describe('resolveColorFromParent', () => {
    it('finds srgbClr child in solidFill', () => {
      const el = parseXml(
        '<a:solidFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:srgbClr val="FF0000"/></a:solidFill>'
      );
      const color = resolveColorFromParent(el, TEST_THEME);
      expect(color).toBeDefined();
      expect(color!.r).toBe(255);
      expect(color!.g).toBe(0);
      expect(color!.b).toBe(0);
    });

    it('finds schemeClr child in solidFill', () => {
      const el = parseXml(
        '<a:solidFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:schemeClr val="accent1"/></a:solidFill>'
      );
      const color = resolveColorFromParent(el, TEST_THEME);
      expect(color).toBeDefined();
      expect(color!.r).toBe(68);
      expect(color!.g).toBe(114);
      expect(color!.b).toBe(196);
    });

    it('finds sysClr child', () => {
      const el = parseXml(
        '<a:solidFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:sysClr val="windowText" lastClr="000000"/></a:solidFill>'
      );
      const color = resolveColorFromParent(el, TEST_THEME);
      expect(color).toBeDefined();
      expect(color!.r).toBe(0);
    });

    it('returns undefined when no color child is found', () => {
      const el = parseXml(
        '<a:noFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>'
      );
      const color = resolveColorFromParent(el, TEST_THEME);
      expect(color).toBeUndefined();
    });

    it('resolves schemeClr with transforms in parent', () => {
      const el = parseXml(`
        <a:solidFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:schemeClr val="accent1">
            <a:lumMod val="75000"/>
          </a:schemeClr>
        </a:solidFill>
      `);
      const color = resolveColorFromParent(el, TEST_THEME);
      expect(color).toBeDefined();
      // Should be darker than accent1 (#4472C4)
      expect(color!.r).toBeLessThan(68);
    });
  });
});
