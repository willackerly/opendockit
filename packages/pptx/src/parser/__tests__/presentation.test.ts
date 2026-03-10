import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { OpcPackageReader } from '@opendockit/core/opc';
import { parsePresentation } from '../presentation.js';

// ---------------------------------------------------------------------------
// Helper: build a minimal PPTX in memory
// ---------------------------------------------------------------------------

async function buildMinimalPptx(options?: {
  slideWidth?: number;
  slideHeight?: number;
  slideCount?: number;
  themeName?: string;
}): Promise<ArrayBuffer> {
  const {
    slideWidth = 9144000,
    slideHeight = 6858000,
    slideCount = 1,
    themeName = 'Office Theme',
  } = options ?? {};

  const zip = new JSZip();

  // Build slide override entries for Content_Types
  const slideOverrides = Array.from({ length: slideCount }, (_, i) => {
    const num = i + 1;
    return `  <Override PartName="/ppt/slides/slide${num}.xml"
            ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
  }).join('\n');

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/ppt/presentation.xml"
            ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
${slideOverrides}
  <Override PartName="/ppt/theme/theme1.xml"
            ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml"
            ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml"
            ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
</Types>`
  );

  // Root relationships
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="ppt/presentation.xml"/>
</Relationships>`
  );

  // Build slide ID list and presentation rels
  const sldIdEntries = Array.from({ length: slideCount }, (_, i) => {
    const num = i + 1;
    return `    <p:sldId id="${256 + i}" r:id="rId${num}"/>`;
  }).join('\n');

  const slideRelEntries = Array.from({ length: slideCount }, (_, i) => {
    const num = i + 1;
    return `  <Relationship Id="rId${num}"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
    Target="slides/slide${num}.xml"/>`;
  }).join('\n');

  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId${slideCount + 2}"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
${sldIdEntries}
  </p:sldIdLst>
  <p:sldSz cx="${slideWidth}" cy="${slideHeight}"/>
  <p:notesSz cx="${slideHeight}" cy="${slideWidth}"/>
</p:presentation>`
  );

  // Presentation relationships
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${slideRelEntries}
  <Relationship Id="rId${slideCount + 1}"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"
    Target="theme/theme1.xml"/>
  <Relationship Id="rId${slideCount + 2}"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"
    Target="slideMasters/slideMaster1.xml"/>
</Relationships>`
  );

  // Theme
  zip.file(
    'ppt/theme/theme1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${themeName}">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
      <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont>
        <a:latin typeface="Calibri Light"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:majorFont>
      <a:minorFont>
        <a:latin typeface="Calibri"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`
  );

  // Slides
  for (let i = 0; i < slideCount; i++) {
    const num = i + 1;

    zip.file(
      `ppt/slides/slide${num}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
</p:sld>`
    );

    zip.file(
      `ppt/slides/_rels/slide${num}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout"
    Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`
    );
  }

  // Slide layout
  zip.file(
    'ppt/slideLayouts/slideLayout1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             type="blank">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
</p:sldLayout>`
  );

  zip.file(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"
    Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`
  );

  // Slide master
  zip.file(
    'ppt/slideMasters/slideMaster1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"
            accent1="accent1" accent2="accent2" accent3="accent3"
            accent4="accent4" accent5="accent5" accent6="accent6"
            hlink="hlink" folHlink="folHlink"/>
</p:sldMaster>`
  );

  return zip.generateAsync({ type: 'arraybuffer' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parsePresentation', () => {
  it('extracts slide dimensions from p:sldSz', async () => {
    const data = await buildMinimalPptx({ slideWidth: 12192000, slideHeight: 6858000 });
    const pkg = await OpcPackageReader.open(data);
    const result = await parsePresentation(pkg);

    expect(result.slideWidth).toBe(12192000);
    expect(result.slideHeight).toBe(6858000);
  });

  it('uses default dimensions when p:sldSz is missing', async () => {
    // Build a PPTX but strip p:sldSz
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/ppt/presentation.xml"
            ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
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
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst/>
</p:presentation>`
    );
    zip.file(
      'ppt/_rels/presentation.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"
    Target="theme/theme1.xml"/>
</Relationships>`
    );
    zip.file(
      'ppt/theme/theme1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Test">
  <a:themeElements>
    <a:clrScheme name="Test">
      <a:dk1><a:srgbClr val="000000"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="000000"/></a:dk2>
      <a:lt2><a:srgbClr val="FFFFFF"/></a:lt2>
      <a:accent1><a:srgbClr val="000000"/></a:accent1>
      <a:accent2><a:srgbClr val="000000"/></a:accent2>
      <a:accent3><a:srgbClr val="000000"/></a:accent3>
      <a:accent4><a:srgbClr val="000000"/></a:accent4>
      <a:accent5><a:srgbClr val="000000"/></a:accent5>
      <a:accent6><a:srgbClr val="000000"/></a:accent6>
      <a:hlink><a:srgbClr val="000000"/></a:hlink>
      <a:folHlink><a:srgbClr val="000000"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Test">
      <a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Test">
      <a:fillStyleLst><a:noFill/><a:noFill/><a:noFill/></a:fillStyleLst>
      <a:lnStyleLst><a:ln/><a:ln/><a:ln/></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:noFill/><a:noFill/><a:noFill/></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`
    );

    const data = await zip.generateAsync({ type: 'arraybuffer' });
    const pkg = await OpcPackageReader.open(data);
    const result = await parsePresentation(pkg);

    // Default 10x7.5 inches
    expect(result.slideWidth).toBe(9144000);
    expect(result.slideHeight).toBe(6858000);
  });

  it('builds correct slide references for a single slide', async () => {
    const data = await buildMinimalPptx({ slideCount: 1 });
    const pkg = await OpcPackageReader.open(data);
    const result = await parsePresentation(pkg);

    expect(result.slideCount).toBe(1);
    expect(result.slides).toHaveLength(1);

    const slide = result.slides[0];
    expect(slide.index).toBe(0);
    expect(slide.partUri).toBe('/ppt/slides/slide1.xml');
    expect(slide.layoutPartUri).toBe('/ppt/slideLayouts/slideLayout1.xml');
    expect(slide.masterPartUri).toBe('/ppt/slideMasters/slideMaster1.xml');
    expect(slide.relationshipId).toBe('rId1');
  });

  it('builds correct slide references for multiple slides', async () => {
    const data = await buildMinimalPptx({ slideCount: 3 });
    const pkg = await OpcPackageReader.open(data);
    const result = await parsePresentation(pkg);

    expect(result.slideCount).toBe(3);
    expect(result.slides).toHaveLength(3);

    for (let i = 0; i < 3; i++) {
      expect(result.slides[i].index).toBe(i);
      expect(result.slides[i].partUri).toBe(`/ppt/slides/slide${i + 1}.xml`);
      expect(result.slides[i].relationshipId).toBe(`rId${i + 1}`);
    }
  });

  it('parses the theme correctly', async () => {
    const data = await buildMinimalPptx({ themeName: 'My Custom Theme' });
    const pkg = await OpcPackageReader.open(data);
    const result = await parsePresentation(pkg);

    expect(result.theme.name).toBe('My Custom Theme');
    expect(result.theme.colorScheme.dk1).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(result.theme.colorScheme.lt1).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(result.theme.colorScheme.accent1).toEqual({ r: 68, g: 114, b: 196, a: 1 });
    expect(result.theme.fontScheme.majorLatin).toBe('Calibri Light');
    expect(result.theme.fontScheme.minorLatin).toBe('Calibri');
  });

  it('parses per-master themes when masters have their own theme', async () => {
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
  <Override PartName="/ppt/slides/slide2.xml"
            ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/theme/theme1.xml"
            ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/ppt/theme/theme2.xml"
            ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml"
            ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout2.xml"
            ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml"
            ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster2.xml"
            ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
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

    // Presentation with 2 slides
    zip.file(
      'ppt/presentation.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId10"/>
    <p:sldMasterId id="2147483649" r:id="rId11"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
    <p:sldId id="257" r:id="rId2"/>
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000"/>
</p:presentation>`
    );

    zip.file(
      'ppt/_rels/presentation.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
    Target="slides/slide1.xml"/>
  <Relationship Id="rId2"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
    Target="slides/slide2.xml"/>
  <Relationship Id="rId3"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"
    Target="theme/theme1.xml"/>
  <Relationship Id="rId10"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"
    Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId11"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"
    Target="slideMasters/slideMaster2.xml"/>
</Relationships>`
    );

    // Theme 1 — accent3 = light blue (#C2D5ED)
    zip.file(
      'ppt/theme/theme1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Theme1">
  <a:themeElements>
    <a:clrScheme name="Theme1">
      <a:dk1><a:srgbClr val="000000"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
      <a:accent3><a:srgbClr val="C2D5ED"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Theme1">
      <a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Theme1">
      <a:fillStyleLst><a:noFill/><a:noFill/><a:noFill/></a:fillStyleLst>
      <a:lnStyleLst><a:ln/><a:ln/><a:ln/></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:noFill/><a:noFill/><a:noFill/></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`
    );

    // Theme 2 — accent3 = dark navy (#001E4A) — different from theme1
    zip.file(
      'ppt/theme/theme2.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Theme2">
  <a:themeElements>
    <a:clrScheme name="Theme2">
      <a:dk1><a:srgbClr val="000000"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
      <a:accent3><a:srgbClr val="001E4A"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Theme2">
      <a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Theme2">
      <a:fillStyleLst><a:noFill/><a:noFill/><a:noFill/></a:fillStyleLst>
      <a:lnStyleLst><a:ln/><a:ln/><a:ln/></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:noFill/><a:noFill/><a:noFill/></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`
    );

    // Slide 1 → layout1 → master1 → theme1
    zip.file(
      'ppt/slides/slide1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
</p:sld>`
    );
    zip.file(
      'ppt/slides/_rels/slide1.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout"
    Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`
    );

    // Slide 2 → layout2 → master2 → theme2
    zip.file(
      'ppt/slides/slide2.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
</p:sld>`
    );
    zip.file(
      'ppt/slides/_rels/slide2.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout"
    Target="../slideLayouts/slideLayout2.xml"/>
</Relationships>`
    );

    // Layout 1 → master 1
    zip.file(
      'ppt/slideLayouts/slideLayout1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
</p:sldLayout>`
    );
    zip.file(
      'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"
    Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`
    );

    // Layout 2 → master 2
    zip.file(
      'ppt/slideLayouts/slideLayout2.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
</p:sldLayout>`
    );
    zip.file(
      'ppt/slideLayouts/_rels/slideLayout2.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"
    Target="../slideMasters/slideMaster2.xml"/>
</Relationships>`
    );

    // Master 1 → theme1 (via its rels)
    zip.file(
      'ppt/slideMasters/slideMaster1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"
            accent1="accent1" accent2="accent2" accent3="accent3"
            accent4="accent4" accent5="accent5" accent6="accent6"
            hlink="hlink" folHlink="folHlink"/>
</p:sldMaster>`
    );
    zip.file(
      'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"
    Target="../theme/theme1.xml"/>
</Relationships>`
    );

    // Master 2 → theme2 (via its rels)
    zip.file(
      'ppt/slideMasters/slideMaster2.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"
            accent1="accent1" accent2="accent2" accent3="accent3"
            accent4="accent4" accent5="accent5" accent6="accent6"
            hlink="hlink" folHlink="folHlink"/>
</p:sldMaster>`
    );
    zip.file(
      'ppt/slideMasters/_rels/slideMaster2.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"
    Target="../theme/theme2.xml"/>
</Relationships>`
    );

    const data = await zip.generateAsync({ type: 'arraybuffer' });
    const pkg = await OpcPackageReader.open(data);
    const result = await parsePresentation(pkg);

    // Primary theme is from the presentation-level relationship
    expect(result.theme.name).toBe('Theme1');
    expect(result.theme.colorScheme.accent3).toEqual({ r: 194, g: 213, b: 237, a: 1 });

    // Master themes are parsed per-master
    expect(result.masterThemes).toBeDefined();
    const master1Theme = result.masterThemes!['/ppt/slideMasters/slideMaster1.xml'];
    const master2Theme = result.masterThemes!['/ppt/slideMasters/slideMaster2.xml'];

    expect(master1Theme).toBeDefined();
    expect(master1Theme.name).toBe('Theme1');
    expect(master1Theme.colorScheme.accent3).toEqual({ r: 194, g: 213, b: 237, a: 1 });

    expect(master2Theme).toBeDefined();
    expect(master2Theme.name).toBe('Theme2');
    expect(master2Theme.colorScheme.accent3).toEqual({ r: 0, g: 30, b: 74, a: 1 });

    // Font schemes differ between themes
    expect(master1Theme.fontScheme.majorLatin).toBe('Calibri Light');
    expect(master2Theme.fontScheme.majorLatin).toBe('Arial');

    // Slide 1 uses master 1, slide 2 uses master 2
    expect(result.slides[0].masterPartUri).toBe('/ppt/slideMasters/slideMaster1.xml');
    expect(result.slides[1].masterPartUri).toBe('/ppt/slideMasters/slideMaster2.xml');
  });

  it('throws when no presentation part is found', async () => {
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
</Types>`
    );
    zip.file(
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`
    );

    const data = await zip.generateAsync({ type: 'arraybuffer' });
    const pkg = await OpcPackageReader.open(data);

    await expect(parsePresentation(pkg)).rejects.toThrow('Cannot find presentation part');
  });
});
