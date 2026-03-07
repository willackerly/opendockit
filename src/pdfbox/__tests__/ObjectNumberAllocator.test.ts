import { describe, it, expect } from 'vitest';

import { ObjectNumberAllocator } from '../writer/ObjectNumberAllocator';

describe('ObjectNumberAllocator', () => {
  it('allocates sequential numbers starting from initial size', () => {
    const allocator = new ObjectNumberAllocator(5);
    const first = allocator.allocate();
    expect(first.objectNumber).toBe(5);
    const second = allocator.allocate();
    expect(second.objectNumber).toBe(6);
  });

  it('skips numbers that were already registered', () => {
    const allocator = new ObjectNumberAllocator();
    allocator.registerExisting(0);
    allocator.registerExisting(1);
    const key = allocator.allocate();
    expect(key.objectNumber).toBe(2);
  });

  it('allocates distinct numbers for different generations as needed', () => {
    const allocator = new ObjectNumberAllocator(10);
    allocator.registerExisting(10, 0);
    const reuseDifferentGeneration = allocator.allocate(1);
    expect(reuseDifferentGeneration.objectNumber).toBe(11);
    expect(reuseDifferentGeneration.generationNumber).toBe(1);
    const next = allocator.allocate();
    expect(next.objectNumber).toBe(12);
  });
});
