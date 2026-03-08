import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { DocKit } from '../doc-kit.js';
import type { DocumentIR, SectionIR, ParagraphIR } from '../../model/document-ir.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePara(text: string, overrides?: Partial<ParagraphIR>): ParagraphIR {
  return {
    runs: [{ text }],
    ...overrides,
  };
}

function makeSection(paragraphs: ParagraphIR[], overrides?: Partial<SectionIR>): SectionIR {
  return {
    pageWidth: 612,
    pageHeight: 792,
    marginTop: 72,
    marginBottom: 72,
    marginLeft: 72,
    marginRight: 72,
    paragraphs,
    ...overrides,
  };
}

function makeDocumentIR(sections: SectionIR[]): DocumentIR {
  return {
    sections,
    styles: new Map(),
  };
}

/**
 * Create a minimal valid DOCX file as a Uint8Array.
 *
 * The DOCX format is just a ZIP file with specific parts:
 * - [Content_Types].xml
 * - _rels/.rels
 * - word/document.xml
 */
async function createMinimalDocx(bodyContent: string): Promise<Uint8Array> {
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>'
  );

  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>'
  );

  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' +
      bodyContent +
      '<w:sectPr>' +
      '<w:pgSz w:w="12240" w:h="15840"/>' +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>' +
      '</w:sectPr>' +
      '</w:body>' +
      '</w:document>'
  );

  return zip.generateAsync({ type: 'uint8array' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DocKit.fromDocumentIR', () => {
  it('should create a DocKit from a document IR', () => {
    const doc = makeDocumentIR([makeSection([makePara('Hello World')])]);
    const kit = DocKit.fromDocumentIR(doc);
    expect(kit.pageCount).toBe(1);
    expect(kit.sectionCount).toBe(1);
  });

  it('should expose the document IR', () => {
    const doc = makeDocumentIR([makeSection([makePara('Hello')])]);
    const kit = DocKit.fromDocumentIR(doc);
    expect(kit.document).toBe(doc);
  });

  it('should count pages across sections', () => {
    const doc = makeDocumentIR([
      makeSection([makePara('Section 1')]),
      makeSection([makePara('Section 2')]),
    ]);
    const kit = DocKit.fromDocumentIR(doc);
    expect(kit.sectionCount).toBe(2);
    expect(kit.pageCount).toBe(2);
  });

  it('should handle empty document', () => {
    const doc = makeDocumentIR([makeSection([])]);
    const kit = DocKit.fromDocumentIR(doc);
    expect(kit.pageCount).toBe(1);
  });

  it('should report page dimensions', () => {
    const doc = makeDocumentIR([makeSection([], { pageWidth: 612, pageHeight: 792 })]);
    const kit = DocKit.fromDocumentIR(doc);
    const dims = kit.getPageDimensions(0);
    expect(dims.width).toBe(612);
    expect(dims.height).toBe(792);
  });

  it('should throw for out-of-range page index', () => {
    const doc = makeDocumentIR([makeSection([makePara('Hello')])]);
    const kit = DocKit.fromDocumentIR(doc);
    expect(() => kit.getPageDimensions(-1)).toThrow(RangeError);
    expect(() => kit.getPageDimensions(1)).toThrow(RangeError);
  });

  it('should handle multiple pages from page breaks', () => {
    // Create many large paragraphs to force page breaks
    const paragraphs: ParagraphIR[] = [];
    for (let i = 0; i < 50; i++) {
      paragraphs.push(
        makePara(`Paragraph ${i}`, {
          runs: [{ text: `Paragraph ${i}`, fontSize: 48 }],
        })
      );
    }
    const doc = makeDocumentIR([makeSection(paragraphs)]);
    const kit = DocKit.fromDocumentIR(doc);
    expect(kit.pageCount).toBeGreaterThan(1);
  });
});

describe('DocKit.fromOpcData', () => {
  it('should load a minimal DOCX file', async () => {
    const data = await createMinimalDocx('<w:p><w:r><w:t>Hello World</w:t></w:r></w:p>');
    const kit = await DocKit.fromOpcData(data);
    expect(kit.pageCount).toBeGreaterThanOrEqual(1);
    expect(kit.document.sections[0].paragraphs[0].runs[0].text).toBe('Hello World');
  });

  it('should parse page dimensions from DOCX sectPr', async () => {
    const data = await createMinimalDocx('<w:p><w:r><w:t>Content</w:t></w:r></w:p>');
    const kit = await DocKit.fromOpcData(data);
    const dims = kit.getPageDimensions(0);
    expect(dims.width).toBe(612); // US Letter
    expect(dims.height).toBe(792);
  });

  it('should parse multiple paragraphs from DOCX', async () => {
    const data = await createMinimalDocx(
      '<w:p><w:r><w:t>First</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>Second</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>Third</w:t></w:r></w:p>'
    );
    const kit = await DocKit.fromOpcData(data);
    expect(kit.document.sections[0].paragraphs).toHaveLength(3);
  });

  it('should parse formatted text from DOCX', async () => {
    const data = await createMinimalDocx(
      '<w:p><w:r>' +
        '<w:rPr><w:b/><w:i/><w:sz w:val="28"/></w:rPr>' +
        '<w:t>Bold Italic 14pt</w:t>' +
        '</w:r></w:p>'
    );
    const kit = await DocKit.fromOpcData(data);
    const run = kit.document.sections[0].paragraphs[0].runs[0];
    expect(run.bold).toBe(true);
    expect(run.italic).toBe(true);
    expect(run.fontSize).toBe(14);
  });

  it('should parse paragraph alignment from DOCX', async () => {
    const data = await createMinimalDocx(
      '<w:p>' +
        '<w:pPr><w:jc w:val="center"/></w:pPr>' +
        '<w:r><w:t>Centered</w:t></w:r>' +
        '</w:p>'
    );
    const kit = await DocKit.fromOpcData(data);
    expect(kit.document.sections[0].paragraphs[0].alignment).toBe('center');
  });
});

describe('DocKit.fromOpcData with styles', () => {
  it('should load a DOCX with styles.xml', async () => {
    const zip = new JSZip();

    zip.file(
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        '</Types>'
    );

    zip.file(
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>'
    );

    zip.file(
      'word/_rels/document.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>'
    );

    zip.file(
      'word/document.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:body>' +
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Title</w:t></w:r></w:p>' +
        '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>' +
        '</w:body>' +
        '</w:document>'
    );

    zip.file(
      'word/styles.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:style w:type="paragraph" w:styleId="Heading1">' +
        '<w:name w:val="heading 1"/>' +
        '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>' +
        '</w:style>' +
        '</w:styles>'
    );

    const data = await zip.generateAsync({ type: 'uint8array' });
    const kit = await DocKit.fromOpcData(data);

    expect(kit.document.styles.size).toBe(1);
    expect(kit.document.styles.get('Heading1')?.name).toBe('heading 1');
    expect(kit.document.styles.get('Heading1')?.runProperties?.bold).toBe(true);
    expect(kit.document.sections[0].paragraphs[0].styleId).toBe('Heading1');
  });
});
