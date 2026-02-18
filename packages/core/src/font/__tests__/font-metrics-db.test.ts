import { describe, it, expect, beforeEach } from 'vitest';
import { FontMetricsDB } from '../font-metrics-db.js';
import type { FontFaceMetrics, FontMetricsBundle } from '../font-metrics-db.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const REGULAR_FACE: FontFaceMetrics = {
  family: 'TestFont',
  style: 'regular',
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  capHeight: 700,
  widths: {
    // 'A' = 65, 'B' = 66, ' ' = 32
    '65': 600,
    '66': 650,
    '32': 250,
  },
  defaultWidth: 500,
};

const BOLD_FACE: FontFaceMetrics = {
  family: 'TestFont',
  style: 'bold',
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  capHeight: 700,
  widths: {
    '65': 650,
    '66': 700,
    '32': 280,
  },
  defaultWidth: 550,
};

const ITALIC_FACE: FontFaceMetrics = {
  family: 'TestFont',
  style: 'italic',
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  capHeight: 700,
  widths: {
    '65': 580,
    '66': 630,
    '32': 240,
  },
  defaultWidth: 480,
};

const BUNDLE: FontMetricsBundle = {
  version: 1,
  fonts: {
    testfont: [REGULAR_FACE, BOLD_FACE, ITALIC_FACE],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FontMetricsDB', () => {
  let db: FontMetricsDB;

  beforeEach(() => {
    db = new FontMetricsDB();
  });

  describe('loadBundle / hasMetrics', () => {
    it('reports metrics after loading a bundle', () => {
      expect(db.hasMetrics('TestFont')).toBe(false);
      db.loadBundle(BUNDLE);
      expect(db.hasMetrics('TestFont')).toBe(true);
    });

    it('is case-insensitive', () => {
      db.loadBundle(BUNDLE);
      expect(db.hasMetrics('TESTFONT')).toBe(true);
      expect(db.hasMetrics('testfont')).toBe(true);
    });
  });

  describe('loadFontMetrics', () => {
    it('loads a single face', () => {
      db.loadFontMetrics(REGULAR_FACE);
      expect(db.hasMetrics('TestFont')).toBe(true);
    });
  });

  describe('measureText', () => {
    beforeEach(() => {
      db.loadBundle(BUNDLE);
    });

    it('returns undefined for unknown fonts', () => {
      expect(db.measureText('A', 'UnknownFont', 10, false, false)).toBeUndefined();
    });

    it('measures single character correctly', () => {
      // 'A' width = 600 in 1000 UPM at 10px = 6px
      const w = db.measureText('A', 'TestFont', 10, false, false);
      expect(w).toBe(6);
    });

    it('measures multi-character string', () => {
      // 'AB ' = (600 + 650 + 250) / 1000 * 10 = 15
      const w = db.measureText('AB ', 'TestFont', 10, false, false);
      expect(w).toBe(15);
    });

    it('uses defaultWidth for unmapped codepoints', () => {
      // 'C' (67) is not in widths → defaultWidth 500
      // 'AC' = (600 + 500) / 1000 * 10 = 11
      const w = db.measureText('AC', 'TestFont', 10, false, false);
      expect(w).toBe(11);
    });

    it('scales with font size', () => {
      const w10 = db.measureText('A', 'TestFont', 10, false, false);
      const w20 = db.measureText('A', 'TestFont', 20, false, false);
      expect(w20).toBe(w10! * 2);
    });

    it('uses bold face when bold=true', () => {
      // Bold 'A' = 650/1000 * 10 = 6.5
      const w = db.measureText('A', 'TestFont', 10, true, false);
      expect(w).toBe(6.5);
    });

    it('uses italic face when italic=true', () => {
      // Italic 'A' = 580/1000 * 10 = 5.8
      const w = db.measureText('A', 'TestFont', 10, false, true);
      expect(w).toBeCloseTo(5.8);
    });

    it('falls back to bold for boldItalic when boldItalic face missing', () => {
      // No boldItalic face loaded → should fallback to bold
      const w = db.measureText('A', 'TestFont', 10, true, true);
      expect(w).toBe(6.5);
    });

    it('is case-insensitive for family name', () => {
      const w1 = db.measureText('A', 'TestFont', 10, false, false);
      const w2 = db.measureText('A', 'testfont', 10, false, false);
      expect(w1).toBe(w2);
    });
  });

  describe('getVerticalMetrics', () => {
    beforeEach(() => {
      db.loadBundle(BUNDLE);
    });

    it('returns undefined for unknown fonts', () => {
      expect(db.getVerticalMetrics('UnknownFont', 10, false, false)).toBeUndefined();
    });

    it('returns scaled vertical metrics', () => {
      // At 10px, 1000 UPM: ascender 800 → 8, descender -200 → -2, capHeight 700 → 7
      const m = db.getVerticalMetrics('TestFont', 10, false, false);
      expect(m).toEqual({ ascender: 8, descender: -2, capHeight: 7 });
    });
  });

  describe('style fallback cascade', () => {
    it('falls back to regular when only regular is loaded', () => {
      db.loadFontMetrics(REGULAR_FACE);
      // Bold request falls back to regular
      const w = db.measureText('A', 'TestFont', 10, true, false);
      expect(w).toBe(6); // regular width
    });

    it('returns first available face for any request', () => {
      db.loadFontMetrics(BOLD_FACE);
      // Regular request falls back to bold (only face available)
      const w = db.measureText('A', 'TestFont', 10, false, false);
      expect(w).toBe(6.5); // bold width
    });
  });
});

// ---------------------------------------------------------------------------
// Integration test with actual metrics bundle
// ---------------------------------------------------------------------------

describe('metricsBundle integration', () => {
  it('loads the built-in metrics bundle without error', async () => {
    const { metricsBundle } = await import('../data/metrics-bundle.js');
    const db = new FontMetricsDB();
    db.loadBundle(metricsBundle);

    expect(db.hasMetrics('Calibri')).toBe(true);
    expect(db.hasMetrics('Arial')).toBe(true);
    expect(db.hasMetrics('Times New Roman')).toBe(true);
    expect(db.hasMetrics('Courier New')).toBe(true);
    expect(db.hasMetrics('Cambria')).toBe(true);
  });

  it('measures "Hello" in Calibri to a reasonable width', async () => {
    const { metricsBundle } = await import('../data/metrics-bundle.js');
    const db = new FontMetricsDB();
    db.loadBundle(metricsBundle);

    // "Hello" at 12px should be roughly 25-35px wide
    const w = db.measureText('Hello', 'Calibri', 12, false, false);
    expect(w).toBeDefined();
    expect(w!).toBeGreaterThan(15);
    expect(w!).toBeLessThan(50);
  });

  it('bold text is wider than regular', async () => {
    const { metricsBundle } = await import('../data/metrics-bundle.js');
    const db = new FontMetricsDB();
    db.loadBundle(metricsBundle);

    const regular = db.measureText('Hello World', 'Calibri', 12, false, false)!;
    const bold = db.measureText('Hello World', 'Calibri', 12, true, false)!;
    expect(bold).toBeGreaterThan(regular);
  });
});
