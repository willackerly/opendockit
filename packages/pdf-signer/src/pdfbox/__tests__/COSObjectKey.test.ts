import { describe, it, expect } from 'vitest';

import { COSObjectKey } from '../writer/COSObjectKey';

describe('COSObjectKey', () => {
  it('tracks object and generation', () => {
    const key = new COSObjectKey(10, 2);
    expect(key.objectNumber).toBe(10);
    expect(key.generationNumber).toBe(2);
  });

  it('compares equality based on number + generation', () => {
    const a = new COSObjectKey(5, 0);
    const b = new COSObjectKey(5, 0);
    const c = new COSObjectKey(5, 1);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('validates constructor inputs', () => {
    expect(() => new COSObjectKey(-1, 0)).toThrow(/Invalid object number/);
    expect(() => new COSObjectKey(1, -5)).toThrow(/Invalid generation number/);
  });

  it('provides a stable string representation', () => {
    const key = new COSObjectKey(12, 7);
    expect(key.toString()).toBe('12_7');
  });
});
