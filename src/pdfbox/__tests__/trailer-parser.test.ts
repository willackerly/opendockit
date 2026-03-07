import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  parsePdfTrailer,
  buildIncrementalTrailerDictionary,
  buildFullTrailerDictionary,
} from '../parser/trailer';

describe('parsePdfTrailer', () => {
  it('parses trailers with references, IDs, and Prev', () => {
    const pdfString = `%PDF-1.7
xref
0 1
0000000000 65535 f 
trailer
<< /Size 5
   /Root 1 0 R
   /Info 2 0 R
   /Encrypt 4 0 R
   /ID [<ABCDEF0123> <456789ABCD>]
   /Prev 123
   /XRefStm 900
>>
startxref
456
%%EOF
`;

    const info = parsePdfTrailer(new TextEncoder().encode(pdfString));
    expect(info.size).toBe(5);
    expect(info.startxref).toBe(456);
    expect(info.prev).toBe(123);
    expect(info.rootRef).toEqual({ objectNumber: 1, generation: 0 });
    expect(info.infoRef).toEqual({ objectNumber: 2, generation: 0 });
    expect(info.encryptRef).toEqual({ objectNumber: 4, generation: 0 });
    expect(info.idLiteral).toBe('[<ABCDEF0123> <456789ABCD>]');
    expect(info.hasXRefStream).toBe(true);
  });

  it('parses trailers from real fixtures', () => {
    const fixturePath = path.resolve(
      process.cwd(),
      'test-pdfs',
      'working',
      'wire-instructions.pdf'
    );
    const bytes = fs.readFileSync(fixturePath);
    const info = parsePdfTrailer(new Uint8Array(bytes));

    expect(info.size).toBeGreaterThan(0);
    expect(info.rootRef).toEqual({ objectNumber: 1, generation: 0 });
    expect(info.startxref).toBeGreaterThan(0);
  });
});

describe('buildIncrementalTrailerDictionary', () => {
  it('builds trailer dictionaries with updated size/prev', () => {
    const pdfBytes = new TextEncoder().encode(
      `%PDF-1.7\ntrailer\n<< /Size 10 /Root 1 0 R /ID [<AA> <BB>] >>\nstartxref\n200\n%%EOF\n`
    );
    const info = parsePdfTrailer(pdfBytes);

    const trailer = buildIncrementalTrailerDictionary(info, {
      size: 12,
      prev: info.startxref,
    });

    expect(trailer).toContain('/Size 12');
    expect(trailer).toContain('/Prev 200');
    expect(trailer).toContain('/Root 1 0 R');
    expect(trailer).toContain('/ID [<AA> <BB>]');
  });

  it('builds full trailer dictionaries without /Prev', () => {
    const pdfBytes = new TextEncoder().encode(
      `%PDF-1.7\ntrailer\n<< /Size 3 /Root 1 0 R /ID [<AA> <BB>] >>\nstartxref\n150\n%%EOF\n`
    );
    const info = parsePdfTrailer(pdfBytes);
    const trailer = buildFullTrailerDictionary(info, 5);
    expect(trailer).toContain('/Size 5');
    expect(trailer).toContain('/Root 1 0 R');
    expect(trailer).not.toContain('/Prev');
  });
});
