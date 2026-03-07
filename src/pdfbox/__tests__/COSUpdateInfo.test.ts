import { describe, it, expect } from 'vitest';

import { COSDictionary, COSArray, COSInteger } from '../cos/COSTypes';
import {
  markObjectUpdated,
  isObjectUpdated,
  resetUpdateTracking,
} from '../cos/COSUpdateInfo';

describe('COSUpdateInfo', () => {
  it('tracks objects marked as updated', () => {
    resetUpdateTracking();
    const dict = new COSDictionary();
    expect(isObjectUpdated(dict)).toBe(false);
    markObjectUpdated(dict);
    expect(isObjectUpdated(dict)).toBe(true);
  });

  it('auto-marks dictionaries and arrays when mutated', () => {
    resetUpdateTracking();
    const dict = new COSDictionary();
    dict.setItem('Key', COSInteger.ZERO);
    expect(isObjectUpdated(dict)).toBe(true);

    resetUpdateTracking();
    const array = new COSArray();
    array.add(COSInteger.ZERO);
    expect(isObjectUpdated(array)).toBe(true);
  });
});
