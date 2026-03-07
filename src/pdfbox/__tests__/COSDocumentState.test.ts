import { describe, it, expect } from 'vitest';

import { COSDocumentState } from '../writer/COSDocumentState';
import type { TrailerInfo } from '../parser/trailer';

const SAMPLE_PDF = new TextEncoder().encode(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< >>
endobj
xref
0 3
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
trailer
<< /Size 3 /Root 1 0 R >>
startxref
79
%%EOF
`);

const TRAILER: TrailerInfo = {
  size: 3,
  rootRef: { objectNumber: 1, generation: 0 },
  startxref: 79,
  dictionary: '<< /Size 3 /Root 1 0 R >>',
  hasXRefStream: false,
};

describe('COSDocumentState', () => {
  it('tracks offsets for objects from the prior xref table', () => {
    const state = new COSDocumentState(SAMPLE_PDF, TRAILER);
    expect(state.hasObject(1, 0)).toBe(true);
    expect(state.getObjectOffset(1, 0)).toBe(10);
    expect(state.getObjectOffset(2, 0)).toBe(60);
    expect(state.hasObject(5, 0)).toBe(false);
  });
});
