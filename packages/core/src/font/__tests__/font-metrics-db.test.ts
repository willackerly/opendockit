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
  lineHeight: 1.05, // (800 + 200 + 50) / 1000
  lineGap: 0.05, // 50 / 1000
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
  lineHeight: 1.05,
  lineGap: 0.05,
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
  lineHeight: 1.05,
  lineGap: 0.05,
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
      expect(m).toBeDefined();
      expect(m!.ascender).toBe(8);
      expect(m!.descender).toBe(-2);
      expect(m!.capHeight).toBe(7);
    });

    it('returns lineHeight and lineGap scaled to font size', () => {
      // lineHeight = 1.05 (normalized to em), at 10px → 10.5
      // lineGap = 0.05 (normalized to em), at 10px → 0.5
      const m = db.getVerticalMetrics('TestFont', 10, false, false);
      expect(m).toBeDefined();
      expect(m!.lineHeight).toBeCloseTo(10.5);
      expect(m!.lineGap).toBeCloseTo(0.5);
    });

    it('supports first-line height calculation (lineHeight - lineGap) * fontSize pattern', () => {
      // pdf.js pattern: firstLineHeight = (lineHeight - lineGap) * fontSize
      // With normalized values: lineHeight=1.05, lineGap=0.05
      // firstLineHeight = (1.05 - 0.05) * 10 = 10
      const m = db.getVerticalMetrics('TestFont', 10, false, false);
      expect(m).toBeDefined();
      const firstLineHeight = m!.lineHeight! - m!.lineGap!;
      expect(firstLineHeight).toBeCloseTo(10);
    });

    it('omits lineHeight/lineGap when face has no values', () => {
      const noLineMetricsFace: FontFaceMetrics = {
        family: 'NoLineMetrics',
        style: 'regular',
        unitsPerEm: 1000,
        ascender: 800,
        descender: -200,
        capHeight: 700,
        widths: { '65': 600 },
        defaultWidth: 500,
      };
      db.loadFontMetrics(noLineMetricsFace);
      const m = db.getVerticalMetrics('NoLineMetrics', 10, false, false);
      expect(m).toBeDefined();
      expect(m!.ascender).toBe(8);
      expect(m!.lineHeight).toBeUndefined();
      expect(m!.lineGap).toBeUndefined();
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

    // Original 6 families
    expect(db.hasMetrics('Calibri')).toBe(true);
    expect(db.hasMetrics('Arial')).toBe(true);
    expect(db.hasMetrics('Times New Roman')).toBe(true);
    expect(db.hasMetrics('Courier New')).toBe(true);
    expect(db.hasMetrics('Cambria')).toBe(true);

    // Wave 2: 6 additional families
    expect(db.hasMetrics('Georgia')).toBe(true);
    expect(db.hasMetrics('Segoe UI')).toBe(true);
    expect(db.hasMetrics('Arial Narrow')).toBe(true);
    expect(db.hasMetrics('Palatino Linotype')).toBe(true);
    expect(db.hasMetrics('Bookman Old Style')).toBe(true);
    expect(db.hasMetrics('Century Schoolbook')).toBe(true);
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

  it('bundle entries have lineHeight and lineGap fields', async () => {
    const { metricsBundle } = await import('../data/metrics-bundle.js');
    // Check that all faces in the bundle have lineHeight and lineGap
    for (const [family, faces] of Object.entries(metricsBundle.fonts)) {
      for (const face of faces) {
        expect(face.lineHeight).toBeDefined();
        expect(face.lineGap).toBeDefined();
        expect(typeof face.lineHeight).toBe('number');
        expect(typeof face.lineGap).toBe('number');
        // lineHeight should be positive and reasonable (typically 0.8 to 1.5)
        expect(face.lineHeight!).toBeGreaterThan(0);
        expect(face.lineHeight!).toBeLessThan(2);
        // lineGap should be non-negative
        expect(face.lineGap!).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('returns lineHeight and lineGap for Calibri at 12px', async () => {
    const { metricsBundle } = await import('../data/metrics-bundle.js');
    const db = new FontMetricsDB();
    db.loadBundle(metricsBundle);

    const m = db.getVerticalMetrics('Calibri', 12, false, false);
    expect(m).toBeDefined();
    expect(m!.lineHeight).toBeDefined();
    expect(m!.lineGap).toBeDefined();
    // Calibri lineHeight = 1.0 (Carlito has ascender+|descender| = upm, lineGap=0)
    // So lineHeight at 12px = 12
    expect(m!.lineHeight).toBeCloseTo(12);
    expect(m!.lineGap).toBe(0);
  });

  it('returns non-zero lineGap for Arial', async () => {
    const { metricsBundle } = await import('../data/metrics-bundle.js');
    const db = new FontMetricsDB();
    db.loadBundle(metricsBundle);

    const m = db.getVerticalMetrics('Arial', 12, false, false);
    expect(m).toBeDefined();
    // Arial (Liberation Sans) has non-zero hhea.lineGap
    expect(m!.lineGap).toBeDefined();
    expect(m!.lineGap!).toBeGreaterThan(0);
    // lineHeight should be > (ascender + |descender|) / upm * fontSize
    // because lineGap contributes to it
    expect(m!.lineHeight).toBeDefined();
    expect(m!.lineHeight!).toBeGreaterThan(0);
  });
});
