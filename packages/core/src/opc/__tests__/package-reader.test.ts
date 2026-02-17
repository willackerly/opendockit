import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { OpcPackageReader } from '../package-reader.js';
import { REL_OFFICE_DOCUMENT, REL_SLIDE } from '../relationship-resolver.js';

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
  <Override PartName="/ppt/theme/theme1.xml"
            ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
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
  <Relationship Id="rId3"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"
    Target="theme/theme1.xml"/>
</Relationships>`
  );

  zip.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
</p:sld>`
  );

  zip.file(
    'ppt/theme/theme1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
    </a:clrScheme>
  </a:themeElements>
</a:theme>`
  );

  return zip.generateAsync({ type: 'arraybuffer' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpcPackageReader.open', () => {
  it('opens a minimal PPTX-like ZIP', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);
    expect(pkg).toBeDefined();
  });

  it('rejects a ZIP missing [Content_Types].xml', async () => {
    const zip = new JSZip();
    zip.file('dummy.txt', 'hello');
    const data = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(OpcPackageReader.open(data)).rejects.toThrow('[Content_Types].xml');
  });

  it('fires progress callbacks', async () => {
    const data = await buildMinimalPptx();
    const events: Array<{ phase: string; loaded: number; total: number }> = [];
    await OpcPackageReader.open(data, (e) => events.push({ ...e }));

    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.some((e) => e.phase === 'unzip')).toBe(true);
    expect(events.some((e) => e.phase === 'parse')).toBe(true);
  });
});

describe('OpcPackageReader.listParts', () => {
  it('lists all parts with normalized URIs', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);
    const parts = pkg.listParts();

    expect(parts).toContain('/[Content_Types].xml');
    expect(parts).toContain('/_rels/.rels');
    expect(parts).toContain('/ppt/presentation.xml');
    expect(parts).toContain('/ppt/slides/slide1.xml');
    expect(parts).toContain('/ppt/theme/theme1.xml');
    expect(parts).toContain('/ppt/_rels/presentation.xml.rels');
  });

  it('all parts have a leading slash', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);
    for (const part of pkg.listParts()) {
      expect(part.startsWith('/')).toBe(true);
    }
  });
});

describe('OpcPackageReader.getPart', () => {
  it('returns raw bytes for a part', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);
    const bytes = await pkg.getPart('/ppt/slides/slide1.xml');

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('throws for a non-existent part', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);

    await expect(pkg.getPart('/nonexistent.xml')).rejects.toThrow('Part not found');
  });

  it('caches extracted bytes', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);

    const bytes1 = await pkg.getPart('/ppt/slides/slide1.xml');
    const bytes2 = await pkg.getPart('/ppt/slides/slide1.xml');

    // Same reference — cached
    expect(bytes1).toBe(bytes2);
  });
});

describe('OpcPackageReader.getPartText', () => {
  it('returns UTF-8 decoded text', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);
    const text = await pkg.getPartText('/ppt/slides/slide1.xml');

    expect(typeof text).toBe('string');
    expect(text).toContain('p:sld');
  });

  it('throws for a non-existent part', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);

    await expect(pkg.getPartText('/missing.xml')).rejects.toThrow('Part not found');
  });
});

describe('OpcPackageReader.getPartXml', () => {
  it('returns a parsed XmlElement', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);
    const el = await pkg.getPartXml('/ppt/slides/slide1.xml');

    expect(el.name).toBe('p:sld');
    const cSld = el.child('p:cSld');
    expect(cSld).toBeDefined();
  });

  it('parses presentation.xml', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);
    const el = await pkg.getPartXml('/ppt/presentation.xml');

    expect(el.name).toBe('p:presentation');
    const sldIdLst = el.child('p:sldIdLst');
    expect(sldIdLst).toBeDefined();
  });
});

describe('OpcPackageReader.getRootRelationships', () => {
  it('returns root relationships', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);
    const rels = await pkg.getRootRelationships();

    expect(rels.all()).toHaveLength(1);
    const officeDoc = rels.getByType(REL_OFFICE_DOCUMENT);
    expect(officeDoc).toHaveLength(1);
    expect(officeDoc[0].target).toBe('/ppt/presentation.xml');
  });

  it('caches root relationships', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);

    const rels1 = await pkg.getRootRelationships();
    const rels2 = await pkg.getRootRelationships();
    expect(rels1).toBe(rels2);
  });
});

describe('OpcPackageReader.getPartRelationships', () => {
  it('returns relationships for a part', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);
    const rels = await pkg.getPartRelationships('/ppt/presentation.xml');

    expect(rels.all()).toHaveLength(2);
    const slides = rels.getByType(REL_SLIDE);
    expect(slides).toHaveLength(1);
    expect(slides[0].target).toBe('/ppt/slides/slide1.xml');
  });

  it('returns empty map for parts with no .rels file', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);
    const rels = await pkg.getPartRelationships('/ppt/slides/slide1.xml');

    // slide1 has no _rels/slide1.xml.rels in our fixture
    expect(rels.all()).toHaveLength(0);
  });

  it('caches relationship maps', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);

    const rels1 = await pkg.getPartRelationships('/ppt/presentation.xml');
    const rels2 = await pkg.getPartRelationships('/ppt/presentation.xml');
    expect(rels1).toBe(rels2);
  });
});

describe('OpcPackageReader.resolveRelTarget', () => {
  it('resolves a relationship target by rel ID', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);

    const target = await pkg.resolveRelTarget('/ppt/presentation.xml', 'rId2');
    expect(target).toBe('/ppt/slides/slide1.xml');
  });

  it('returns undefined for a missing rel ID', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);

    const target = await pkg.resolveRelTarget('/ppt/presentation.xml', 'rId99');
    expect(target).toBeUndefined();
  });
});

describe('OpcPackageReader.getContentTypes', () => {
  it('returns the content type map', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);
    const ct = pkg.getContentTypes();

    expect(ct.getType('/ppt/slides/slide1.xml')).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'
    );
  });

  it('resolves default content types by extension', async () => {
    const data = await buildMinimalPptx();
    const pkg = await OpcPackageReader.open(data);
    const ct = pkg.getContentTypes();

    expect(ct.getType('/_rels/.rels')).toBe(
      'application/vnd.openxmlformats-package.relationships+xml'
    );
  });
});
