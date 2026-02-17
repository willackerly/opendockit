import { describe, it, expect } from 'vitest';
import { estimateTextWidth, getLineHeight, getAverageCharWidthRatio } from '../font-metrics.js';

// ---------------------------------------------------------------------------
// getAverageCharWidthRatio
// ---------------------------------------------------------------------------

describe('getAverageCharWidthRatio', () => {
  it('returns 0.6 for monospace fonts', () => {
    expect(getAverageCharWidthRatio('Courier New')).toBe(0.6);
    expect(getAverageCharWidthRatio('Consolas')).toBe(0.6);
    expect(getAverageCharWidthRatio('monospace')).toBe(0.6);
    expect(getAverageCharWidthRatio('Lucida Console')).toBe(0.6);
  });

  it('returns 0.5 for serif fonts', () => {
    expect(getAverageCharWidthRatio('Times New Roman')).toBe(0.5);
    expect(getAverageCharWidthRatio('Georgia')).toBe(0.5);
    expect(getAverageCharWidthRatio('Cambria')).toBe(0.5);
    expect(getAverageCharWidthRatio('serif')).toBe(0.5);
  });

  it('returns 0.48 for sans-serif fonts', () => {
    expect(getAverageCharWidthRatio('Arial')).toBe(0.48);
    expect(getAverageCharWidthRatio('Calibri')).toBe(0.48);
    expect(getAverageCharWidthRatio('sans-serif')).toBe(0.48);
  });

  it('is case-insensitive', () => {
    expect(getAverageCharWidthRatio('COURIER NEW')).toBe(0.6);
    expect(getAverageCharWidthRatio('times new roman')).toBe(0.5);
  });

  it('handles CSS font-family strings with fallbacks', () => {
    // Primary font determines the ratio
    expect(getAverageCharWidthRatio("'Courier New', monospace")).toBe(0.6);
    expect(getAverageCharWidthRatio('Georgia, serif')).toBe(0.5);
  });

  it('handles quoted font names in CSS strings', () => {
    expect(getAverageCharWidthRatio("'Courier New'")).toBe(0.6);
    expect(getAverageCharWidthRatio('"Times New Roman"')).toBe(0.5);
  });

  it('returns sans-serif ratio for unknown fonts', () => {
    expect(getAverageCharWidthRatio('Custom Font')).toBe(0.48);
  });

  it('detects serif from fallback chain when primary is unknown', () => {
    // If font-family includes "serif" but not "sans-serif", treat as serif
    expect(getAverageCharWidthRatio('Garamond, serif')).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// estimateTextWidth
// ---------------------------------------------------------------------------

describe('estimateTextWidth', () => {
  // In Node.js (no Canvas), falls back to character-width estimation

  it('returns 0 for empty string', () => {
    expect(estimateTextWidth('', 16, 'Arial')).toBe(0);
  });

  it('returns positive value for non-empty string', () => {
    const width = estimateTextWidth('Hello', 16, 'Arial');
    expect(width).toBeGreaterThan(0);
  });

  it('scales with font size', () => {
    const small = estimateTextWidth('Hello', 12, 'Arial');
    const large = estimateTextWidth('Hello', 24, 'Arial');
    expect(large).toBeCloseTo(small * 2, 5);
  });

  it('scales with text length', () => {
    const short = estimateTextWidth('Hi', 16, 'Arial');
    const long = estimateTextWidth('HiHi', 16, 'Arial');
    expect(long).toBeCloseTo(short * 2, 5);
  });

  it('uses different ratios for different font categories', () => {
    const mono = estimateTextWidth('Hello', 16, 'Courier New');
    const serif = estimateTextWidth('Hello', 16, 'Times New Roman');
    const sans = estimateTextWidth('Hello', 16, 'Arial');

    // Monospace should be widest, sans-serif narrowest
    expect(mono).toBeGreaterThan(serif);
    expect(serif).toBeGreaterThan(sans);
  });

  it('produces reasonable widths for sans-serif at 16px', () => {
    // 5 chars * 16px * 0.48 = 38.4px
    const width = estimateTextWidth('Hello', 16, 'Arial');
    expect(width).toBeCloseTo(38.4, 5);
  });

  it('produces reasonable widths for monospace at 16px', () => {
    // 5 chars * 16px * 0.6 = 48px
    const width = estimateTextWidth('Hello', 16, 'Courier New');
    expect(width).toBeCloseTo(48, 5);
  });

  it('produces reasonable widths for serif at 16px', () => {
    // 5 chars * 16px * 0.5 = 40px
    const width = estimateTextWidth('Hello', 16, 'Times New Roman');
    expect(width).toBeCloseTo(40, 5);
  });
});

// ---------------------------------------------------------------------------
// getLineHeight
// ---------------------------------------------------------------------------

describe('getLineHeight', () => {
  it('uses default 120% spacing', () => {
    expect(getLineHeight(16)).toBeCloseTo(19.2, 5);
  });

  it('calculates single spacing (100%)', () => {
    expect(getLineHeight(16, 100)).toBe(16);
  });

  it('calculates 1.5x spacing (150%)', () => {
    expect(getLineHeight(16, 150)).toBe(24);
  });

  it('calculates double spacing (200%)', () => {
    expect(getLineHeight(16, 200)).toBe(32);
  });

  it('handles zero font size', () => {
    expect(getLineHeight(0)).toBe(0);
  });

  it('handles fractional font sizes', () => {
    expect(getLineHeight(13.5, 100)).toBe(13.5);
  });

  it('handles custom percentages', () => {
    expect(getLineHeight(20, 115)).toBeCloseTo(23, 5);
  });
});
