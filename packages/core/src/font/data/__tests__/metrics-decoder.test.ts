import { describe, it, expect } from 'vitest';
import { statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('metrics-decoder', () => {
  it('decoded bundle has correct face count', async () => {
    const { metricsBundle } = await import('../metrics-bundle.js');
    let faceCount = 0;
    for (const faces of Object.values(metricsBundle.fonts)) {
      faceCount += faces.length;
    }
    expect(faceCount).toBe(134);
  });

  it('decoded bundle has correct family count', async () => {
    const { metricsBundle } = await import('../metrics-bundle.js');
    expect(Object.keys(metricsBundle.fonts).length).toBe(46);
  });

  it('Calibri regular codepoint 65 (A) width is 1185', async () => {
    const { metricsBundle } = await import('../metrics-bundle.js');
    const calibriFaces = metricsBundle.fonts['calibri'];
    expect(calibriFaces).toBeDefined();
    const regular = calibriFaces.find((f) => f.style === 'regular');
    expect(regular).toBeDefined();
    expect(regular!.widths[65]).toBe(1185);
  });

  it('all faces have non-empty widths', async () => {
    const { metricsBundle } = await import('../metrics-bundle.js');
    for (const [family, faces] of Object.entries(metricsBundle.fonts)) {
      for (const face of faces) {
        expect(
          Object.keys(face.widths).length,
          `${family} ${face.style} should have widths`
        ).toBeGreaterThan(0);
      }
    }
  });

  it('all faces have lineHeight and lineGap defined', async () => {
    const { metricsBundle } = await import('../metrics-bundle.js');
    for (const [family, faces] of Object.entries(metricsBundle.fonts)) {
      for (const face of faces) {
        expect(face.lineHeight, `${family} ${face.style} lineHeight`).toBeDefined();
        expect(face.lineGap, `${family} ${face.style} lineGap`).toBeDefined();
      }
    }
  });

  it('vertical metrics are plausible', async () => {
    const { metricsBundle } = await import('../metrics-bundle.js');
    for (const [family, faces] of Object.entries(metricsBundle.fonts)) {
      for (const face of faces) {
        expect(face.unitsPerEm).toBeGreaterThan(0);
        expect(face.ascender).toBeGreaterThan(0);
        expect(face.descender).toBeLessThan(0);
        expect(face.capHeight).toBeGreaterThan(0);
        expect(face.defaultWidth).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('metrics-bundle.ts file is under 400KB', () => {
    const bundlePath = resolve(__dirname, '..', 'metrics-bundle.ts');
    const stat = statSync(bundlePath);
    expect(stat.size).toBeLessThan(400 * 1024);
  });

  it('version is 1', async () => {
    const { metricsBundle } = await import('../metrics-bundle.js');
    expect(metricsBundle.version).toBe(1);
  });

  it('style values are valid', async () => {
    const { metricsBundle } = await import('../metrics-bundle.js');
    const validStyles = new Set(['regular', 'bold', 'italic', 'boldItalic']);
    for (const faces of Object.values(metricsBundle.fonts)) {
      for (const face of faces) {
        expect(validStyles.has(face.style)).toBe(true);
      }
    }
  });
});
