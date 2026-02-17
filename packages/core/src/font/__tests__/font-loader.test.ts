import { describe, it, expect } from 'vitest';
import { isFontAvailable, loadFont, ensureFontLoaded } from '../font-loader.js';

// ---------------------------------------------------------------------------
// Node.js environment (no browser APIs)
// ---------------------------------------------------------------------------

describe('isFontAvailable', () => {
  it('returns false in Node.js environment', () => {
    expect(isFontAvailable('Arial')).toBe(false);
  });

  it('returns false for any font name in Node.js', () => {
    expect(isFontAvailable('Calibri')).toBe(false);
    expect(isFontAvailable('Times New Roman')).toBe(false);
    expect(isFontAvailable('NonExistent Font')).toBe(false);
  });

  it('accepts optional fontSize parameter', () => {
    expect(isFontAvailable('Arial', 24)).toBe(false);
  });
});

describe('loadFont', () => {
  it('returns false in Node.js environment (no FontFace API)', async () => {
    const data = new ArrayBuffer(16);
    const result = await loadFont('TestFont', data);
    expect(result).toBe(false);
  });

  it('accepts optional descriptors', async () => {
    const data = new ArrayBuffer(16);
    const result = await loadFont('TestFont', data, { weight: 'bold' });
    expect(result).toBe(false);
  });
});

describe('ensureFontLoaded', () => {
  it('returns false in Node.js environment', async () => {
    const data = new ArrayBuffer(16);
    const result = await ensureFontLoaded('TestFont', data);
    expect(result).toBe(false);
  });

  it('handles empty ArrayBuffer gracefully', async () => {
    const data = new ArrayBuffer(0);
    const result = await ensureFontLoaded('TestFont', data);
    expect(result).toBe(false);
  });
});
