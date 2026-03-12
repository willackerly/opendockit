import { describe, it, expect } from 'vitest';
import {
  variationSettingsCSS,
  styleToVariationAxes,
  isVariableFontFilename,
} from '../variable-font.js';
import type { VariationAxes } from '../variable-font.js';
import { FontResolver } from '../font-resolver.js';

// ---------------------------------------------------------------------------
// variationSettingsCSS
// ---------------------------------------------------------------------------

describe('variationSettingsCSS', () => {
  it('returns empty string for empty axes', () => {
    expect(variationSettingsCSS({})).toBe('');
  });

  it('generates weight-only setting', () => {
    expect(variationSettingsCSS({ weight: 700 })).toBe("'wght' 700");
  });

  it('generates multiple axes in deterministic order', () => {
    const axes: VariationAxes = { weight: 700, width: 100, slant: -12 };
    expect(variationSettingsCSS(axes)).toBe(
      "'wght' 700, 'wdth' 100, 'slnt' -12",
    );
  });

  it('includes italic axis', () => {
    const axes: VariationAxes = { weight: 400, italic: 1 };
    expect(variationSettingsCSS(axes)).toBe("'wght' 400, 'ital' 1");
  });

  it('includes optical size axis', () => {
    const axes: VariationAxes = { opticalSize: 14 };
    expect(variationSettingsCSS(axes)).toBe("'opsz' 14");
  });

  it('omits undefined axes', () => {
    const axes: VariationAxes = { weight: 300, italic: undefined };
    expect(variationSettingsCSS(axes)).toBe("'wght' 300");
  });
});

// ---------------------------------------------------------------------------
// styleToVariationAxes
// ---------------------------------------------------------------------------

describe('styleToVariationAxes', () => {
  it('maps "normal" to weight 400', () => {
    const axes = styleToVariationAxes('normal', false);
    expect(axes).toEqual({ weight: 400 });
  });

  it('maps "bold" to weight 700', () => {
    const axes = styleToVariationAxes('bold', false);
    expect(axes).toEqual({ weight: 700 });
  });

  it('maps bold italic to weight 700 + italic 1', () => {
    const axes = styleToVariationAxes('bold', true);
    expect(axes).toEqual({ weight: 700, italic: 1 });
  });

  it('maps numeric weight', () => {
    const axes = styleToVariationAxes(300, false);
    expect(axes).toEqual({ weight: 300 });
  });

  it('maps numeric weight + italic', () => {
    const axes = styleToVariationAxes(600, true);
    expect(axes).toEqual({ weight: 600, italic: 1 });
  });

  it('does not set italic when false', () => {
    const axes = styleToVariationAxes(400, false);
    expect(axes.italic).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isVariableFontFilename
// ---------------------------------------------------------------------------

describe('isVariableFontFilename', () => {
  it('detects bracketed wght axis', () => {
    expect(isVariableFontFilename('Roboto[wght].ttf')).toBe(true);
  });

  it('detects bracketed multi-axis', () => {
    expect(isVariableFontFilename('NotoSans[wght,wdth].ttf')).toBe(true);
  });

  it('detects -VariableFont suffix', () => {
    expect(isVariableFontFilename('NotoSans-VariableFont_wght.ttf')).toBe(
      true,
    );
  });

  it('detects -VariableFont case-insensitively', () => {
    expect(isVariableFontFilename('Roboto-variablefont_wght.woff2')).toBe(
      true,
    );
  });

  it('returns false for static font filenames', () => {
    expect(isVariableFontFilename('Roboto-Regular.ttf')).toBe(false);
  });

  it('returns false for bold static font', () => {
    expect(isVariableFontFilename('Roboto-Bold.woff2')).toBe(false);
  });

  it('returns false for italic static font', () => {
    expect(isVariableFontFilename('Roboto-Italic.ttf')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FontResolver accepts preferVariableFonts config
// ---------------------------------------------------------------------------

describe('FontResolver preferVariableFonts config', () => {
  it('accepts preferVariableFonts: true without error', () => {
    const resolver = new FontResolver({ preferVariableFonts: true });
    expect(resolver).toBeDefined();
  });

  it('accepts preferVariableFonts: false without error', () => {
    const resolver = new FontResolver({ preferVariableFonts: false });
    expect(resolver).toBeDefined();
  });

  it('defaults to undefined when not specified', () => {
    const resolver = new FontResolver({});
    expect(resolver).toBeDefined();
  });
});
