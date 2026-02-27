import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { OpcPackageReader } from '../package-reader.js';
import { OpcPackageWriter } from '../package-writer.js';
import { REL_OFFICE_DOCUMENT, REL_SLIDE } from '../relationship-resolver.js';
import type { Relationship } from '../relationship-resolver.js';

// ---------------------------------------------------------------------------
// Helper: build a minimal PPTX-like ZIP in memory
// ---------------------------------------------------------------------------

async function buildMinimalPptx(): Promise<ArrayBuffer> {
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/ppt/presentation.xml"
            ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml"
            ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="ppt/presentation.xml"/>
</Relationships>`
  );

  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId2"/>
  </p:sldIdLst>
</p:presentation>`
  );

  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
    Target="slides/slide1.xml"/>
</Relationships>`
  );

  zip.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree/></p:cSld>
</p:sld>`
  );

  return zip.generateAsync({ type: 'arraybuffer' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpcPackageWriter — round-trip', () => {
  it('produces a valid package with all original parts', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const writer = new OpcPackageWriter(reader);

    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    // All original parts should be present
    const parts = result.listParts();
    expect(parts).toContain('/[Content_Types].xml');
    expect(parts).toContain('/_rels/.rels');
    expect(parts).toContain('/ppt/presentation.xml');
    expect(parts).toContain('/ppt/slides/slide1.xml');
    expect(parts).toContain('/ppt/_rels/presentation.xml.rels');
  });

  it('preserves content of unchanged parts', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const originalSlide = await reader.getPartText('/ppt/slides/slide1.xml');

    const writer = new OpcPackageWriter(reader);
    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    const roundTrippedSlide = await result.getPartText('/ppt/slides/slide1.xml');
    expect(roundTrippedSlide).toBe(originalSlide);
  });

  it('preserves root relationships', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const writer = new OpcPackageWriter(reader);

    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    const rels = await result.getRootRelationships();
    expect(rels.all()).toHaveLength(1);
    const officeDoc = rels.getByType(REL_OFFICE_DOCUMENT);
    expect(officeDoc).toHaveLength(1);
    expect(officeDoc[0].target).toBe('/ppt/presentation.xml');
  });

  it('preserves content types', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const writer = new OpcPackageWriter(reader);

    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    const ct = result.getContentTypes();
    expect(ct.getType('/ppt/slides/slide1.xml')).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'
    );
    expect(ct.getType('/ppt/presentation.xml')).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'
    );
  });
});

describe('OpcPackageWriter.setPart', () => {
  it('replaces content of an existing part (string)', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const writer = new OpcPackageWriter(reader);

    const newSlide = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp/></p:spTree></p:cSld>
</p:sld>`;

    writer.setPart('/ppt/slides/slide1.xml', newSlide);

    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    const text = await result.getPartText('/ppt/slides/slide1.xml');
    expect(text).toBe(newSlide);
  });

  it('replaces content of an existing part (Uint8Array)', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const writer = new OpcPackageWriter(reader);

    const content = new TextEncoder().encode('binary content');
    writer.setPart('/ppt/slides/slide1.xml', content);

    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    const bytes = await result.getPart('/ppt/slides/slide1.xml');
    expect(new TextDecoder().decode(bytes)).toBe('binary content');
  });

  it('does not affect other parts', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const originalPres = await reader.getPartText('/ppt/presentation.xml');

    const writer = new OpcPackageWriter(reader);
    writer.setPart('/ppt/slides/slide1.xml', '<modified/>');

    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    const pres = await result.getPartText('/ppt/presentation.xml');
    expect(pres).toBe(originalPres);
  });

  it('normalizes the URI', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const writer = new OpcPackageWriter(reader);

    // Use un-normalized URI (no leading slash)
    writer.setPart('ppt/slides/slide1.xml', '<normalized/>');

    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    const text = await result.getPartText('/ppt/slides/slide1.xml');
    expect(text).toBe('<normalized/>');
  });
});

describe('OpcPackageWriter.deletePart', () => {
  it('removes a part from the output', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const writer = new OpcPackageWriter(reader);

    writer.deletePart('/ppt/slides/slide1.xml');

    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    const parts = result.listParts();
    expect(parts).not.toContain('/ppt/slides/slide1.xml');
  });

  it('removes the Override entry from [Content_Types].xml', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const writer = new OpcPackageWriter(reader);

    writer.deletePart('/ppt/slides/slide1.xml');

    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    // The slide content type should no longer resolve via override
    const ctText = await result.getPartText('/[Content_Types].xml');
    expect(ctText).not.toContain('/ppt/slides/slide1.xml');
  });

  it('preserves remaining parts and content types', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const writer = new OpcPackageWriter(reader);

    writer.deletePart('/ppt/slides/slide1.xml');

    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    // Presentation should still be there with correct content type
    const ct = result.getContentTypes();
    expect(ct.getType('/ppt/presentation.xml')).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'
    );
    const parts = result.listParts();
    expect(parts).toContain('/ppt/presentation.xml');
  });
});

describe('OpcPackageWriter.addPart', () => {
  it('adds a new part to the package', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const writer = new OpcPackageWriter(reader);

    const newSlide =
      '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>';
    writer.addPart(
      '/ppt/slides/slide2.xml',
      newSlide,
      'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'
    );

    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    const parts = result.listParts();
    expect(parts).toContain('/ppt/slides/slide2.xml');

    const text = await result.getPartText('/ppt/slides/slide2.xml');
    expect(text).toBe(newSlide);
  });

  it('adds content type for the new part', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const writer = new OpcPackageWriter(reader);

    writer.addPart('/ppt/media/image1.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png');

    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    const ct = result.getContentTypes();
    expect(ct.getType('/ppt/media/image1.png')).toBe('image/png');
  });

  it('preserves original parts alongside new ones', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const originalSlide = await reader.getPartText('/ppt/slides/slide1.xml');

    const writer = new OpcPackageWriter(reader);
    writer.addPart('/ppt/slides/slide2.xml', '<new/>', 'application/xml');

    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    const text = await result.getPartText('/ppt/slides/slide1.xml');
    expect(text).toBe(originalSlide);
  });

  it('supports adding binary parts', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const writer = new OpcPackageWriter(reader);

    const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
    writer.addPart('/ppt/media/data.bin', binaryData, 'application/octet-stream');

    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    const bytes = await result.getPart('/ppt/media/data.bin');
    expect(bytes).toEqual(binaryData);
  });
});

describe('OpcPackageWriter.setRelationships', () => {
  it('replaces root relationships', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const writer = new OpcPackageWriter(reader);

    const newRels: Relationship[] = [
      {
        id: 'rId1',
        type: REL_OFFICE_DOCUMENT,
        target: 'ppt/presentation.xml',
      },
      {
        id: 'rId2',
        type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
        target: 'docProps/core.xml',
      },
    ];

    writer.setRelationships('/', newRels);

    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    // Read the serialized .rels to verify
    const relsText = await result.getPartText('/_rels/.rels');
    expect(relsText).toContain('rId1');
    expect(relsText).toContain('rId2');
    expect(relsText).toContain('ppt/presentation.xml');
    expect(relsText).toContain('docProps/core.xml');
  });

  it('replaces part relationships', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const writer = new OpcPackageWriter(reader);

    const newRels: Relationship[] = [
      {
        id: 'rId2',
        type: REL_SLIDE,
        target: 'slides/slide1.xml',
      },
      {
        id: 'rId3',
        type: REL_SLIDE,
        target: 'slides/slide2.xml',
      },
    ];

    writer.setRelationships('/ppt/presentation.xml', newRels);

    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    const relsText = await result.getPartText('/ppt/_rels/presentation.xml.rels');
    expect(relsText).toContain('rId2');
    expect(relsText).toContain('rId3');
    expect(relsText).toContain('slides/slide1.xml');
    expect(relsText).toContain('slides/slide2.xml');
  });

  it('includes TargetMode for external relationships', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const writer = new OpcPackageWriter(reader);

    const newRels: Relationship[] = [
      {
        id: 'rId1',
        type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
        target: 'https://example.com',
        targetMode: 'External',
      },
    ];

    writer.setRelationships('/ppt/slides/slide1.xml', newRels);

    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    const relsText = await result.getPartText('/ppt/slides/_rels/slide1.xml.rels');
    expect(relsText).toContain('TargetMode="External"');
    expect(relsText).toContain('https://example.com');
  });
});

describe('OpcPackageWriter — combined operations', () => {
  it('supports setPart + addPart + deletePart together', async () => {
    const data = await buildMinimalPptx();
    const reader = await OpcPackageReader.open(data);
    const writer = new OpcPackageWriter(reader);

    // Modify existing part
    writer.setPart('/ppt/presentation.xml', '<modified-presentation/>');

    // Add a new part
    writer.addPart('/ppt/slides/slide2.xml', '<new-slide/>', 'application/xml');

    // Delete the original slide
    writer.deletePart('/ppt/slides/slide1.xml');

    const output = await writer.build();
    const result = await OpcPackageReader.open(output);

    const parts = result.listParts();

    // Modified part should exist with new content
    expect(parts).toContain('/ppt/presentation.xml');
    expect(await result.getPartText('/ppt/presentation.xml')).toBe('<modified-presentation/>');

    // New part should exist
    expect(parts).toContain('/ppt/slides/slide2.xml');
    expect(await result.getPartText('/ppt/slides/slide2.xml')).toBe('<new-slide/>');

    // Deleted part should be gone
    expect(parts).not.toContain('/ppt/slides/slide1.xml');

    // Content types should reflect changes
    const ct = result.getContentTypes();
    expect(ct.getType('/ppt/slides/slide2.xml')).toBe('application/xml');
  });
});
