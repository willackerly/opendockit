import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  extractIndirectObject,
  extractObjectFromObjectStream,
  buildAcroFormUpdatePlan,
  buildPageWidgetDictionary,
  documentHasDocMdp,
  documentHasExistingSignatures,
} from '../parser/object';
import {
  COSObjectReference,
  COSName,
  COSArray,
  COSInteger,
  COSDictionary,
} from '../cos/COSTypes';
import { parsePdfTrailer } from '../parser/trailer';
import { COSDocumentState } from '../writer/COSDocumentState';

const SAMPLE_PDF = new TextEncoder().encode(`1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<< /Annots [ ] >>
endobj
startxref
42
%%EOF`);

const PDF_WITH_ACROFORM_REF = new TextEncoder().encode(`1 0 obj
<< /Type /Catalog /Pages 2 0 R /AcroForm 5 0 R >>
endobj
2 0 obj
<< /Annots [ ] >>
endobj
5 0 obj
<< /Fields [ 8 0 R ] /SigFlags 1 >>
endobj
startxref
99
%%EOF`);

const PDF_WITH_PERMS = new TextEncoder().encode(`1 0 obj
<< /Type /Catalog /Pages 2 0 R /Perms 9 0 R /AcroForm << /Fields [ 6 0 R ] >> >>
endobj
2 0 obj
<< /Annots [ ] >>
endobj
6 0 obj
<< /FT /Sig /V 7 0 R >>
endobj
7 0 obj
<< /Type /Sig >>
endobj
9 0 obj
<< /DocMDP 7 0 R >>
endobj
trailer
<< /Root 1 0 R /Size 10 >>
startxref
0
%%EOF`);

describe('object parser helpers', () => {
  it('extracts indirect objects by number', () => {
    const catalog = extractIndirectObject(SAMPLE_PDF, 1);
    expect(catalog.objectNumber).toBe(1);
    expect(catalog.generationNumber).toBe(0);
    expect(catalog.body).toContain('/Type /Catalog');
  });

  it('builds update plan for referenced AcroForm objects', () => {
    const catalog = extractIndirectObject(PDF_WITH_ACROFORM_REF, 1);
    const widgetRef = new COSObjectReference(9, 0);
    const plan = buildAcroFormUpdatePlan(
      PDF_WITH_ACROFORM_REF,
      catalog.body,
      widgetRef
    );
    expect(plan.catalogDict.getItem('AcroForm')).toBeDefined();
    expect(plan.acroFormObject).toBeDefined();
    const acroForm = plan.acroFormObject?.dict;
    expect(acroForm?.getCOSArray('Fields')?.getElements().length).toBe(2);
    expect(acroForm?.getInt('SigFlags')).toBe(3);
  });

  it('updates inline AcroForm dictionaries in catalog bodies', () => {
    const catalog = {
      ...extractIndirectObject(SAMPLE_PDF, 1),
      body: '<< /Type /Catalog /AcroForm << /Fields [] >> >>',
    };
    const widgetRef = new COSObjectReference(7, 0);
    const plan = buildAcroFormUpdatePlan(
      SAMPLE_PDF,
      catalog.body,
      widgetRef
    );
    const inlineAcro = plan.catalogDict.getItem('AcroForm') as COSDictionary;
    const fields = inlineAcro.getCOSArray('Fields');
    expect(fields?.getElements().length).toBe(1);
    expect(inlineAcro.getInt('SigFlags')).toBe(3);
  });

  it('creates new AcroForm when missing', () => {
    const catalog = extractIndirectObject(SAMPLE_PDF, 1);
    const widgetRef = new COSObjectReference(11, 0);
    const plan = buildAcroFormUpdatePlan(
      SAMPLE_PDF,
      catalog.body,
      widgetRef
    );
    const acro = plan.catalogDict.getItem('AcroForm') as COSDictionary;
    expect(acro).toBeDefined();
    const fields = acro.getCOSArray('Fields');
    expect(fields?.getElements().length).toBe(1);
  });

  it('does not duplicate widget references when already present', () => {
    const widgetRef = new COSObjectReference(9, 0);
    const plan = buildAcroFormUpdatePlan(
      PDF_WITH_ACROFORM_REF,
      '<< /Type /Catalog /AcroForm << /Fields [ 9 0 R ] >> >>',
      widgetRef
    );
    const acro = plan.catalogDict.getItem('AcroForm') as COSDictionary;
    const fields = acro.getCOSArray('Fields');
    expect(fields?.getElements().length).toBe(1);
  });

  it('detects existing DocMDP permissions referenced from catalog /Perms', () => {
    const catalog = extractIndirectObject(PDF_WITH_PERMS, 1);
    const widgetRef = new COSObjectReference(11, 0);
    const plan = buildAcroFormUpdatePlan(PDF_WITH_PERMS, catalog.body, widgetRef);
    expect(plan.hasDocMdp).toBe(true);
    expect(plan.hasExistingSignatures).toBe(true);
  });

  it('detects document-level DocMDP via helper', () => {
    expect(documentHasDocMdp(PDF_WITH_PERMS)).toBe(true);
  });

  it('detects existing signatures via helper', () => {
    expect(documentHasExistingSignatures(PDF_WITH_PERMS)).toBe(true);
  });

  it('appends widget references to /Annots', () => {
    const page = extractIndirectObject(SAMPLE_PDF, 2);
    const widgetRef = new COSObjectReference(9, 0);
    const updated = buildPageWidgetDictionary(page.body, widgetRef);
    const annots = updated.getCOSArray('Annots');
    expect(annots?.getElements().length).toBe(1);
  });

  it('loads catalog objects stored inside object streams', () => {
    const pdfPath = path.join(
      process.cwd(),
      'test-pdfs',
      'working',
      'object-stream.pdf'
    );
    const bytes = readFileSync(pdfPath);
    const trailer = parsePdfTrailer(bytes);
    expect(trailer.hasXRefStream).toBe(true);
    const state = new COSDocumentState(bytes, trailer);
    const catalogLocation = state.getLocation(2, 0);
    expect(catalogLocation?.entry.type).toBeDefined();
    const parentNumber = catalogLocation?.entry.objectStreamParent;
    expect(parentNumber).toBeDefined();
    const parentLocation = state.getLocation(parentNumber!, 0);
    expect(parentLocation?.entry.byteOffset).toBeGreaterThan(0);
    const parsed = extractObjectFromObjectStream(
      bytes,
      parentLocation!.entry.byteOffset,
      parentNumber!,
      2
    );
    expect(parsed.body).toContain('/Type /Catalog');
  });
});
