import { bench, describe } from 'vitest';
import { FontMetricsDB } from '@opendockit/core/font';
import type { FontMetricsBundle } from '@opendockit/core/font';

/**
 * Benchmark font metrics lookup and text measurement.
 */

// Minimal metrics bundle for benchmarking (avoids loading the full 750KB bundle)
const testBundle: FontMetricsBundle = {
  version: 1,
  fonts: {
    arial: [
      {
        family: 'Arial',
        style: 'regular',
        unitsPerEm: 2048,
        ascender: 1854,
        descender: -434,
        capHeight: 1467,
        lineHeight: 1.0884,
        lineGap: 0,
        widths: Object.fromEntries(
          // ASCII printable range with typical widths
          Array.from({ length: 95 }, (_, i) => [
            String(32 + i),
            500 + (i % 10) * 50,
          ])
        ),
        defaultWidth: 600,
      },
    ],
  },
};

const db = new FontMetricsDB();
db.loadBundle(testBundle);

describe('Font Metrics', () => {
  bench('getVerticalMetrics (Arial, regular)', () => {
    db.getVerticalMetrics('Arial', 18, false, false);
  });

  bench('measureText short string', () => {
    db.measureText('Hello World', 'Arial', 18, false, false);
  });

  bench('measureText long string', () => {
    db.measureText(
      'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.',
      'Arial',
      18,
      false,
      false
    );
  });
});
