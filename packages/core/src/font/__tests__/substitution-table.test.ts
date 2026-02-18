import { describe, it, expect } from 'vitest';
import { getFontSubstitution, resolveFontName } from '../substitution-table.js';

// ---------------------------------------------------------------------------
// getFontSubstitution
// ---------------------------------------------------------------------------

describe('getFontSubstitution', () => {
  // Sans-serif substitutions
  it('substitutes Calibri', () => {
    expect(getFontSubstitution('Calibri')).toBe("Carlito, 'Segoe UI', Arial, sans-serif");
  });

  it('substitutes Calibri Light', () => {
    expect(getFontSubstitution('Calibri Light')).toBe(
      "Carlito, 'Segoe UI Light', Arial, sans-serif"
    );
  });

  it('substitutes Segoe UI', () => {
    expect(getFontSubstitution('Segoe UI')).toBe('Selawik, system-ui, sans-serif');
  });

  it('substitutes Tahoma', () => {
    expect(getFontSubstitution('Tahoma')).toBe('Arial, sans-serif');
  });

  it('substitutes Century Gothic', () => {
    expect(getFontSubstitution('Century Gothic')).toBe("'Gill Sans', sans-serif");
  });

  it('substitutes Franklin Gothic', () => {
    expect(getFontSubstitution('Franklin Gothic')).toBe('Arial, sans-serif');
  });

  it('substitutes Arial Narrow', () => {
    expect(getFontSubstitution('Arial Narrow')).toBe(
      "'Liberation Sans Narrow', 'Arial Narrow', sans-serif"
    );
  });

  // Serif substitutions
  it('substitutes Cambria', () => {
    expect(getFontSubstitution('Cambria')).toBe('Caladea, Georgia, serif');
  });

  it('substitutes Cambria Math', () => {
    expect(getFontSubstitution('Cambria Math')).toBe('Caladea, Georgia, serif');
  });

  it('substitutes Book Antiqua', () => {
    expect(getFontSubstitution('Book Antiqua')).toBe(
      "'TeX Gyre Pagella', 'Palatino Linotype', Palatino, serif"
    );
  });

  it('substitutes Garamond', () => {
    expect(getFontSubstitution('Garamond')).toBe('Georgia, serif');
  });

  it('substitutes Palatino Linotype', () => {
    expect(getFontSubstitution('Palatino Linotype')).toBe("'TeX Gyre Pagella', Palatino, serif");
  });

  it('substitutes Bookman Old Style', () => {
    expect(getFontSubstitution('Bookman Old Style')).toBe(
      "'TeX Gyre Bonum', 'Bookman Old Style', serif"
    );
  });

  it('substitutes Century Schoolbook', () => {
    expect(getFontSubstitution('Century Schoolbook')).toBe(
      "'TeX Gyre Schola', 'Century Schoolbook', serif"
    );
  });

  // Monospace substitutions
  it('substitutes Consolas', () => {
    expect(getFontSubstitution('Consolas')).toBe("'Courier New', monospace");
  });

  it('substitutes Lucida Console', () => {
    expect(getFontSubstitution('Lucida Console')).toBe('monospace');
  });

  // CJK substitutions
  it('substitutes MS Gothic', () => {
    expect(getFontSubstitution('MS Gothic')).toBe('monospace');
  });

  it('substitutes MS Mincho', () => {
    expect(getFontSubstitution('MS Mincho')).toBe('serif');
  });

  it('substitutes Meiryo', () => {
    expect(getFontSubstitution('Meiryo')).toBe('sans-serif');
  });

  it('substitutes Yu Gothic', () => {
    expect(getFontSubstitution('Yu Gothic')).toBe('sans-serif');
  });

  it('substitutes SimSun', () => {
    expect(getFontSubstitution('SimSun')).toBe('serif');
  });

  it('substitutes Microsoft YaHei', () => {
    expect(getFontSubstitution('Microsoft YaHei')).toBe('sans-serif');
  });

  it('substitutes Malgun Gothic', () => {
    expect(getFontSubstitution('Malgun Gothic')).toBe('sans-serif');
  });

  it('substitutes Batang', () => {
    expect(getFontSubstitution('Batang')).toBe('serif');
  });

  it('substitutes Gulim', () => {
    expect(getFontSubstitution('Gulim')).toBe('sans-serif');
  });

  // Decorative / other
  it('substitutes Impact', () => {
    expect(getFontSubstitution('Impact')).toBe("'Arial Black', sans-serif");
  });

  it('substitutes Comic Sans MS', () => {
    expect(getFontSubstitution('Comic Sans MS')).toBe('cursive');
  });

  // Case insensitivity
  it('is case-insensitive: CALIBRI', () => {
    expect(getFontSubstitution('CALIBRI')).toBe("Carlito, 'Segoe UI', Arial, sans-serif");
  });

  it('is case-insensitive: calibri', () => {
    expect(getFontSubstitution('calibri')).toBe("Carlito, 'Segoe UI', Arial, sans-serif");
  });

  it('is case-insensitive: cAlIbRi', () => {
    expect(getFontSubstitution('cAlIbRi')).toBe("Carlito, 'Segoe UI', Arial, sans-serif");
  });

  // Web-safe fonts need no substitution
  it('returns undefined for Arial', () => {
    expect(getFontSubstitution('Arial')).toBeUndefined();
  });

  it('returns undefined for Times New Roman', () => {
    expect(getFontSubstitution('Times New Roman')).toBeUndefined();
  });

  it('returns undefined for Helvetica', () => {
    expect(getFontSubstitution('Helvetica')).toBeUndefined();
  });

  it('returns undefined for Verdana', () => {
    expect(getFontSubstitution('Verdana')).toBeUndefined();
  });

  it('returns undefined for Trebuchet MS', () => {
    expect(getFontSubstitution('Trebuchet MS')).toBeUndefined();
  });

  it('returns undefined for Courier New', () => {
    expect(getFontSubstitution('Courier New')).toBeUndefined();
  });

  it('returns undefined for Georgia', () => {
    expect(getFontSubstitution('Georgia')).toBeUndefined();
  });

  // Unknown fonts
  it('returns undefined for unknown fonts', () => {
    expect(getFontSubstitution('My Custom Font')).toBeUndefined();
  });

  it('returns undefined for Wingdings (no useful sub)', () => {
    expect(getFontSubstitution('Wingdings')).toBeUndefined();
  });

  it('returns undefined for Symbol (no useful sub)', () => {
    expect(getFontSubstitution('Symbol')).toBeUndefined();
  });

  // Whitespace trimming
  it('trims whitespace from font names', () => {
    expect(getFontSubstitution('  Calibri  ')).toBe("Carlito, 'Segoe UI', Arial, sans-serif");
  });
});

// ---------------------------------------------------------------------------
// resolveFontName
// ---------------------------------------------------------------------------

describe('resolveFontName', () => {
  it('returns original for web-safe font Arial', () => {
    expect(resolveFontName('Arial')).toBe('Arial');
  });

  it('returns original for web-safe font Times New Roman', () => {
    expect(resolveFontName('Times New Roman')).toBe('Times New Roman');
  });

  it('returns original for web-safe font Georgia', () => {
    expect(resolveFontName('Georgia')).toBe('Georgia');
  });

  it('returns original for web-safe font Verdana', () => {
    expect(resolveFontName('Verdana')).toBe('Verdana');
  });

  it('returns original for web-safe font Courier New', () => {
    expect(resolveFontName('Courier New')).toBe('Courier New');
  });

  it('returns substitution for Calibri', () => {
    expect(resolveFontName('Calibri')).toBe("Carlito, 'Segoe UI', Arial, sans-serif");
  });

  it('returns substitution for Cambria', () => {
    expect(resolveFontName('Cambria')).toBe('Caladea, Georgia, serif');
  });

  it('returns substitution for Consolas', () => {
    expect(resolveFontName('Consolas')).toBe("'Courier New', monospace");
  });

  it('returns original for Wingdings (symbol font, no sub)', () => {
    expect(resolveFontName('Wingdings')).toBe('Wingdings');
  });

  it('returns original for Symbol (symbol font, no sub)', () => {
    expect(resolveFontName('Symbol')).toBe('Symbol');
  });

  it('wraps unknown font with generic fallback', () => {
    expect(resolveFontName('Obscure Corporate Font')).toBe("'Obscure Corporate Font', sans-serif");
  });

  it('is case-insensitive for web-safe detection', () => {
    expect(resolveFontName('ARIAL')).toBe('ARIAL');
  });
});
