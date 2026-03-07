import { describe, it, expect } from 'vitest';

import { PDSignatureField } from '../PDSignatureField';
import {
  COSStandardOutputStream,
  COSWriter,
  COSObjectReference,
  COSDictionary,
  COSName,
} from '../../index';

function serializeDict(dict: COSDictionary): string {
  const output = new COSStandardOutputStream();
  const writer = new COSWriter(output);
  dict.accept(writer);
  return new TextDecoder('latin1').decode(output.toUint8Array());
}

describe('PDSignatureField', () => {
  it('produces widget dictionary matching legacy structure', () => {
    const field = new PDSignatureField('Signature1');
    field.setRectangle([50, 50, 250, 100]);
    field.setAppearance(new COSObjectReference(20, 0));
    field.setValue(new COSObjectReference(18, 0));
    field.setPage(new COSObjectReference(3, 0));

    const body = serializeDict(field.getCOSObject());
    expect(body).toContain('/Type /Annot');
    expect(body).toContain('/Subtype /Widget');
    expect(body).toContain('/FT /Sig');
    expect(body).toContain('/F 132');
    expect(body).toContain('/T (Signature1)');
    expect(body).toMatch(/\/Rect\s*\[\s*50\.0\s+50\.0\s+250\.0\s+100\.0\s*\]/);
    expect(body).toContain('/V 18 0 R');
    expect(body).toContain('/P 3 0 R');
    expect(body).toContain('/AP 20 0 R');
  });
});
