import { describe, it, expect } from 'vitest';
import { resolveThemeFont, isThemeFontRef } from '../font-resolver.js';
import type { ThemeIR } from '../../ir/index.js';

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

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
    majorEastAsia: 'Yu Gothic Light',
    majorComplexScript: 'Arial',
    minorLatin: 'Calibri',
    minorEastAsia: 'Yu Gothic',
    minorComplexScript: 'Arial',
  },
  formatScheme: {
    fillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
    lineStyles: [{}, {}, {}],
    effectStyles: [[], [], []],
    bgFillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveThemeFont', () => {
  it('resolves +mj-lt to major Latin font', () => {
    expect(resolveThemeFont('+mj-lt', TEST_THEME)).toBe('Calibri Light');
  });

  it('resolves +mj-ea to major East Asian font', () => {
    expect(resolveThemeFont('+mj-ea', TEST_THEME)).toBe('Yu Gothic Light');
  });

  it('resolves +mj-cs to major Complex Script font', () => {
    expect(resolveThemeFont('+mj-cs', TEST_THEME)).toBe('Arial');
  });

  it('resolves +mn-lt to minor Latin font', () => {
    expect(resolveThemeFont('+mn-lt', TEST_THEME)).toBe('Calibri');
  });

  it('resolves +mn-ea to minor East Asian font', () => {
    expect(resolveThemeFont('+mn-ea', TEST_THEME)).toBe('Yu Gothic');
  });

  it('resolves +mn-cs to minor Complex Script font', () => {
    expect(resolveThemeFont('+mn-cs', TEST_THEME)).toBe('Arial');
  });

  it('returns undefined for non-theme font names', () => {
    expect(resolveThemeFont('Arial', TEST_THEME)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(resolveThemeFont('', TEST_THEME)).toBeUndefined();
  });

  it('returns undefined for invalid theme reference', () => {
    expect(resolveThemeFont('+xx-lt', TEST_THEME)).toBeUndefined();
  });

  it('returns undefined when theme has no optional font defined', () => {
    const themeWithoutOptionals: ThemeIR = {
      ...TEST_THEME,
      fontScheme: {
        majorLatin: 'Calibri Light',
        minorLatin: 'Calibri',
      },
    };
    expect(resolveThemeFont('+mj-ea', themeWithoutOptionals)).toBeUndefined();
    expect(resolveThemeFont('+mn-cs', themeWithoutOptionals)).toBeUndefined();
  });
});

describe('isThemeFontRef', () => {
  it('identifies major font references', () => {
    expect(isThemeFontRef('+mj-lt')).toBe(true);
    expect(isThemeFontRef('+mj-ea')).toBe(true);
    expect(isThemeFontRef('+mj-cs')).toBe(true);
  });

  it('identifies minor font references', () => {
    expect(isThemeFontRef('+mn-lt')).toBe(true);
    expect(isThemeFontRef('+mn-ea')).toBe(true);
    expect(isThemeFontRef('+mn-cs')).toBe(true);
  });

  it('rejects non-theme font names', () => {
    expect(isThemeFontRef('Arial')).toBe(false);
    expect(isThemeFontRef('Calibri')).toBe(false);
    expect(isThemeFontRef('')).toBe(false);
    expect(isThemeFontRef('+')).toBe(false);
  });

  it('rejects similar but invalid patterns', () => {
    expect(isThemeFontRef('+xx-lt')).toBe(false);
    expect(isThemeFontRef('+m-lt')).toBe(false);
    expect(isThemeFontRef('mj-lt')).toBe(false);
  });
});
