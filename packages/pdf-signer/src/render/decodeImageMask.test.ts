import { describe, it, expect } from 'vitest';
import { decodeImageMask } from './evaluator.js';

describe('decodeImageMask', () => {
  // 2x2 image mask: top-left and bottom-right are painted (0), others masked (1)
  // Row 0: bits 0,1 => byte 0b01_000000 = 0x40
  // Row 1: bits 1,0 => byte 0b10_000000 = 0x80
  const maskData = new Uint8Array([0x40, 0x80]);

  it('uses red fill color for painted pixels', () => {
    const result = decodeImageMask(maskData, 2, 2, { r: 1, g: 0, b: 0 });

    expect(result.width).toBe(2);
    expect(result.height).toBe(2);

    // Pixel (0,0): bit=0 => painted, should be red opaque
    expect(result.data[0]).toBe(255); // R
    expect(result.data[1]).toBe(0); // G
    expect(result.data[2]).toBe(0); // B
    expect(result.data[3]).toBe(255); // A (opaque)

    // Pixel (1,0): bit=1 => masked, should be red but transparent
    expect(result.data[4]).toBe(255); // R
    expect(result.data[5]).toBe(0); // G
    expect(result.data[6]).toBe(0); // B
    expect(result.data[7]).toBe(0); // A (transparent)
  });

  it('uses white fill color for painted pixels', () => {
    const result = decodeImageMask(maskData, 2, 2, { r: 1, g: 1, b: 1 });

    // Pixel (0,0): painted => white opaque
    expect(result.data[0]).toBe(255);
    expect(result.data[1]).toBe(255);
    expect(result.data[2]).toBe(255);
    expect(result.data[3]).toBe(255);

    // Pixel (1,0): masked => white transparent
    expect(result.data[4]).toBe(255);
    expect(result.data[5]).toBe(255);
    expect(result.data[6]).toBe(255);
    expect(result.data[7]).toBe(0);
  });

  it('defaults to black fill color when not specified', () => {
    const result = decodeImageMask(maskData, 2, 2);

    // Pixel (0,0): painted => black opaque
    expect(result.data[0]).toBe(0);
    expect(result.data[1]).toBe(0);
    expect(result.data[2]).toBe(0);
    expect(result.data[3]).toBe(255);

    // Pixel (1,0): masked => black transparent
    expect(result.data[4]).toBe(0);
    expect(result.data[5]).toBe(0);
    expect(result.data[6]).toBe(0);
    expect(result.data[7]).toBe(0);
  });

  it('handles fractional color values correctly', () => {
    // Mid-gray: r=0.5, g=0.25, b=0.75
    const result = decodeImageMask(maskData, 2, 2, { r: 0.5, g: 0.25, b: 0.75 });

    // Pixel (0,0): painted => mid-color opaque
    expect(result.data[0]).toBe(128); // round(0.5 * 255)
    expect(result.data[1]).toBe(64); // round(0.25 * 255)
    expect(result.data[2]).toBe(191); // round(0.75 * 255)
    expect(result.data[3]).toBe(255);
  });

  it('produces correct alpha pattern for all pixels', () => {
    const result = decodeImageMask(maskData, 2, 2, { r: 1, g: 0, b: 0 });

    // Row 0: bit0=0 (painted), bit1=1 (masked)
    expect(result.data[3]).toBe(255); // (0,0) opaque
    expect(result.data[7]).toBe(0); // (1,0) transparent

    // Row 1: bit0=1 (masked), bit1=0 (painted)
    expect(result.data[11]).toBe(0); // (0,1) transparent
    expect(result.data[15]).toBe(255); // (1,1) opaque
  });
});
