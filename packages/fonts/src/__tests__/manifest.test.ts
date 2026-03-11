import { describe, it, expect } from 'vitest';
import { getManifest, getBasePath } from '../index.js';
import manifest from '../../manifest.json';

describe('manifest.json', () => {
  it('imports and has correct top-level structure', () => {
    expect(manifest).toHaveProperty('version');
    expect(manifest).toHaveProperty('families');
    expect(typeof manifest.version).toBe('number');
    expect(typeof manifest.families).toBe('object');
  });

  it('has version 1', () => {
    expect(manifest.version).toBe(1);
  });
});

describe('getManifest()', () => {
  it('returns a valid FontManifest', () => {
    const m = getManifest();
    expect(m).toHaveProperty('version');
    expect(m).toHaveProperty('families');
    expect(typeof m.version).toBe('number');
    expect(typeof m.families).toBe('object');
  });

  it('returns the same object as direct import', () => {
    const m = getManifest();
    expect(m.version).toBe(manifest.version);
    expect(m.families).toEqual(manifest.families);
  });
});

describe('getBasePath()', () => {
  it('returns a string ending with /', () => {
    const base = getBasePath();
    expect(typeof base).toBe('string');
    expect(base.endsWith('/')).toBe(true);
  });
});
