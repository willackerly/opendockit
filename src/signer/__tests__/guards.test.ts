import { describe, it, expect } from 'vitest';

import { ensureSupportedTrailerFeatures, ensureValidObjectRef } from '../guards';
import type { TrailerInfo } from '../../pdfbox';
import { UnsupportedPdfFeatureError } from '../../errors/UnsupportedPdfFeatureError';

const baseTrailer = (): TrailerInfo => ({
  size: 5,
  rootRef: { objectNumber: 1, generation: 0 },
  startxref: 100,
  dictionary: '<< /Size 5 /Root 1 0 R >>',
  hasXRefStream: false,
});

describe('ensureSupportedTrailerFeatures', () => {
  it('throws for encrypted PDFs', () => {
    const trailer = {
      ...baseTrailer(),
      encryptRef: { objectNumber: 9, generation: 0 },
    } as TrailerInfo;

    expect(() => ensureSupportedTrailerFeatures(trailer)).toThrow(UnsupportedPdfFeatureError);
  });

  it('allows hybrid xref tables now that incremental parser supports them', () => {
    const trailer = {
      ...baseTrailer(),
      hasXRefStream: true,
    } as TrailerInfo;

    expect(() => ensureSupportedTrailerFeatures(trailer)).not.toThrow();
  });
});

describe('ensureValidObjectRef', () => {
  it('throws for missing references', () => {
    expect(() => ensureValidObjectRef(0, 'catalog')).toThrow(UnsupportedPdfFeatureError);
    expect(() => ensureValidObjectRef(Number.NaN, 'page')).toThrow(/missing-object-ref/);
  });

  it('passes for valid references', () => {
    expect(() => ensureValidObjectRef(10, 'page')).not.toThrow();
  });
});
