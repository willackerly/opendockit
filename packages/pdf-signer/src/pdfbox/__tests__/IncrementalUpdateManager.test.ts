import { describe, it, expect } from 'vitest';

import { IncrementalUpdateManager } from '../writer/IncrementalUpdateManager';
import type { TrailerInfo } from '../parser/trailer';

const BASE_TRAILER: TrailerInfo = {
  size: 15,
  rootRef: { objectNumber: 1, generation: 0 },
  startxref: 6940,
  dictionary: '<< /Size 15 /Root 1 0 R >>',
  hasXRefStream: false,
};

describe('IncrementalUpdateManager', () => {
  it('allocates sequential object numbers starting at trailer size', () => {
    const manager = new IncrementalUpdateManager(BASE_TRAILER);
    const first = manager.allocateObject();
    const second = manager.allocateObject();
    expect(first.objectNumber).toBe(15);
    expect(second.objectNumber).toBe(16);
  });

  it('tracks byte offsets via XRef builder', () => {
    const manager = new IncrementalUpdateManager(BASE_TRAILER);
    const key = manager.allocateObject();
    manager.registerOffset(key, 1234);
    manager.registerExistingObject(1, 0, 356);
    const entries = manager.buildXrefEntries();
    const signatureEntry = entries.find(
      (entry) => entry.objectNumber === key.objectNumber
    );
    expect(signatureEntry?.byteOffset).toBe(1234);
    const catalogEntry = entries.find((entry) => entry.objectNumber === 1);
    expect(catalogEntry?.byteOffset).toBe(356);
  });

  it('builds trailer dictionary with updated size and prev pointer', () => {
    const manager = new IncrementalUpdateManager(BASE_TRAILER);
    manager.allocateObject(); // bump size to 16
    const trailer = manager.buildTrailerDictionary();
    expect(trailer).toContain('/Size 16');
    expect(trailer).toContain('/Prev 6940');
  });
});
