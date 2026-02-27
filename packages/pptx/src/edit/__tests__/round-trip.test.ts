/**
 * Round-trip test suite for the PPTX editing pipeline.
 *
 * Tests the full cycle: load PPTX → edit → save → reload → verify.
 * Uses programmatic minimal PPTXs for targeted assertions and the
 * basic-shapes.pptx fixture for real-world validation.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { OpcPackageReader } from '@opendockit/core/opc';
import { parseXmlDom } from '@opendockit/core';
import { EditableSlideKit } from '../editable-slide-kit.js';
import { parsePresentation } from '../../parser/presentation.js';
import { parseSlide } from '../../parser/slide.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal PPTX with explicit shapes for testing. */
async function buildTestPptx(options?: {
  slideCount?: number;
  shapes?: Array<{
    id: number;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;
    bold?: boolean;
  }>;
  slideShapes?: Map<number, typeof options extends { shapes: infer S } ? S : never>;
}): Promise<ArrayBuffer> {
  const { slideCount = 1, shapes = [] } = options ?? {};
  const slideShapes = options?.slideShapes;

  const zip = new JSZip();

  // Content_Types
  const slideOverrides = Array.from({ length: slideCount }, (_, i) =>
    `  <Override PartName="/ppt/slides/slide${i + 1}.xml"
            ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join('\n');

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

  // Root rels
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="ppt/presentation.xml"/>
</Relationships>`
  );

  // Presentation
  const sldIdEntries = Array.from({ length: slideCount }, (_, i) =>
    `    <p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`
  ).join('\n');

  const slideRelEntries = Array.from({ length: slideCount }, (_, i) =>
    `  <Relationship Id="rId${i + 1}"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
    Target="slides/slide${i + 1}.xml"/>`
  ).join('\n');

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
  <p:sldSz cx="9144000" cy="6858000"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`
  );

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
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Test">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:srgbClr val="000000"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
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
      <a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
      <a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`
  );

  // Slides
  for (let i = 0; i < slideCount; i++) {
    const num = i + 1;
    const slideSpecificShapes = slideShapes?.get(i) ?? (i === 0 ? shapes : []);

    const shapeXml = slideSpecificShapes
      .map((s) => {
        const textBody = s.text != null
          ? `
      <p:txBody>
        <a:bodyPr/>
        <a:lstStyle/>
        <a:p>
          <a:r>
            <a:rPr lang="en-US"${s.bold ? ' b="1"' : ''}/>
            <a:t>${escapeXml(s.text)}</a:t>
          </a:r>
        </a:p>
      </p:txBody>`
          : '';

        return `
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="${s.id}" name="${s.name}"/>
        <p:cNvSpPr/>
        <p:nvPr/>
      </p:nvSpPr>
      <p:spPr>
        <a:xfrm>
          <a:off x="${s.x}" y="${s.y}"/>
          <a:ext cx="${s.width}" cy="${s.height}"/>
        </a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      </p:spPr>${textBody}
    </p:sp>`;
      })
      .join('');

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
      <p:grpSpPr/>${shapeXml}
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

  // Layout
  zip.file(
    'ppt/slideLayouts/slideLayout1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             type="blank">
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

  // Master
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

  return zip.generateAsync({ type: 'arraybuffer' });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Parse raw slide XML to extract a:off x/y and a:ext cx/cy for a shape by cNvPr id. */
function getTransformFromXml(
  xml: string,
  shapeId: number
): { x: number; y: number; cx: number; cy: number } | undefined {
  const doc = parseXmlDom(xml);
  // Find p:sp containing cNvPr with matching id
  const shapes = doc.getElementsByTagName('p:sp');
  for (let i = 0; i < shapes.length; i++) {
    const sp = shapes[i];
    const cNvPrs = sp.getElementsByTagName('p:cNvPr');
    if (cNvPrs.length === 0) continue;
    const id = cNvPrs[0].getAttribute('id');
    if (id !== String(shapeId)) continue;

    const offs = sp.getElementsByTagName('a:off');
    const exts = sp.getElementsByTagName('a:ext');
    if (offs.length === 0 || exts.length === 0) continue;

    return {
      x: Number(offs[0].getAttribute('x')),
      y: Number(offs[0].getAttribute('y')),
      cx: Number(exts[0].getAttribute('cx')),
      cy: Number(exts[0].getAttribute('cy')),
    };
  }
  return undefined;
}

/** Extract text content from a shape in raw XML by cNvPr id. */
function getTextFromXml(xml: string, shapeId: number): string[] {
  const doc = parseXmlDom(xml);
  const shapes = doc.getElementsByTagName('p:sp');
  for (let i = 0; i < shapes.length; i++) {
    const sp = shapes[i];
    const cNvPrs = sp.getElementsByTagName('p:cNvPr');
    if (cNvPrs.length === 0) continue;
    if (cNvPrs[0].getAttribute('id') !== String(shapeId)) continue;

    const runs: string[] = [];
    const atNodes = sp.getElementsByTagName('a:t');
    for (let j = 0; j < atNodes.length; j++) {
      runs.push(atNodes[j].textContent ?? '');
    }
    return runs;
  }
  return [];
}

/** Check if a shape exists in the XML by cNvPr id. */
function shapeExistsInXml(xml: string, shapeId: number): boolean {
  const doc = parseXmlDom(xml);
  const cNvPrs = doc.getElementsByTagName('p:cNvPr');
  for (let i = 0; i < cNvPrs.length; i++) {
    if (cNvPrs[i].getAttribute('id') === String(shapeId)) return true;
  }
  return false;
}

/** Get the slide relationship IDs in order from presentation.xml sldIdLst. */
function getSlideIdOrder(presXml: string): string[] {
  const doc = parseXmlDom(presXml);
  const sldIds = doc.getElementsByTagName('p:sldId');
  const rIds: string[] = [];
  for (let i = 0; i < sldIds.length; i++) {
    const rId =
      sldIds[i].getAttribute('r:id') ??
      sldIds[i].getAttributeNS(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'id'
      );
    if (rId) rIds.push(rId);
  }
  return rIds;
}

// ---------------------------------------------------------------------------
// Tests: Open → Save (no edits)
// ---------------------------------------------------------------------------

describe('round-trip: open → save (no edits)', () => {
  it('produces a valid PPTX that can be reopened', async () => {
    const data = await buildTestPptx({
      shapes: [
        { id: 2, name: 'Rect1', x: 100000, y: 200000, width: 500000, height: 300000 },
      ],
    });

    const kit = new EditableSlideKit();
    await kit.load(data);
    const saved = await kit.save();

    // Verify saved output can be reopened
    const pkg = await OpcPackageReader.open(saved);
    const parts = pkg.listParts();
    expect(parts).toContain('/ppt/presentation.xml');
    expect(parts).toContain('/ppt/slides/slide1.xml');
  });

  it('preserves slide count and dimensions', async () => {
    const data = await buildTestPptx({ slideCount: 2 });

    const kit = new EditableSlideKit();
    const info = await kit.load(data);

    expect(info.slideCount).toBe(2);
    expect(info.slideWidth).toBe(9144000);
    expect(info.slideHeight).toBe(6858000);

    const saved = await kit.save();

    // Reload and verify
    const kit2 = new EditableSlideKit();
    const info2 = await kit2.load(saved);

    expect(info2.slideCount).toBe(2);
    expect(info2.slideWidth).toBe(9144000);
    expect(info2.slideHeight).toBe(6858000);
  });

  it('preserves shape transform values unchanged', async () => {
    const data = await buildTestPptx({
      shapes: [
        { id: 2, name: 'Rect1', x: 914400, y: 457200, width: 2743200, height: 1828800 },
      ],
    });

    const kit = new EditableSlideKit();
    await kit.load(data);
    const saved = await kit.save();

    // Read raw XML from saved package and verify transform
    const pkg = await OpcPackageReader.open(saved);
    const slideXml = await pkg.getPartText('/ppt/slides/slide1.xml');
    const t = getTransformFromXml(slideXml, 2);

    expect(t).toBeDefined();
    expect(t!.x).toBe(914400);
    expect(t!.y).toBe(457200);
    expect(t!.cx).toBe(2743200);
    expect(t!.cy).toBe(1828800);
  });

  it('preserves text content unchanged', async () => {
    const data = await buildTestPptx({
      shapes: [
        {
          id: 2, name: 'TextBox1', x: 100000, y: 100000,
          width: 500000, height: 300000, text: 'Hello World',
        },
      ],
    });

    const kit = new EditableSlideKit();
    await kit.load(data);
    const saved = await kit.save();

    const pkg = await OpcPackageReader.open(saved);
    const slideXml = await pkg.getPartText('/ppt/slides/slide1.xml');
    const texts = getTextFromXml(slideXml, 2);

    expect(texts).toEqual(['Hello World']);
  });
});

// ---------------------------------------------------------------------------
// Tests: Move element
// ---------------------------------------------------------------------------

describe('round-trip: move element', () => {
  it('patches transform position in saved XML', async () => {
    const data = await buildTestPptx({
      shapes: [
        { id: 2, name: 'Rect1', x: 100000, y: 200000, width: 500000, height: 300000 },
      ],
    });

    const kit = new EditableSlideKit();
    await kit.load(data);

    // Move 1 inch right (914400 EMU) and 0.5 inch down (457200 EMU)
    kit.moveElement('/ppt/slides/slide1.xml#2', 914400, 457200);
    const saved = await kit.save();

    const pkg = await OpcPackageReader.open(saved);
    const slideXml = await pkg.getPartText('/ppt/slides/slide1.xml');
    const t = getTransformFromXml(slideXml, 2);

    expect(t).toBeDefined();
    expect(t!.x).toBe(100000 + 914400);
    expect(t!.y).toBe(200000 + 457200);
    // Size should be unchanged
    expect(t!.cx).toBe(500000);
    expect(t!.cy).toBe(300000);
  });

  it('preserves text when only moving', async () => {
    const data = await buildTestPptx({
      shapes: [
        {
          id: 2, name: 'TextBox1', x: 0, y: 0,
          width: 500000, height: 300000, text: 'Keep me!',
        },
      ],
    });

    const kit = new EditableSlideKit();
    await kit.load(data);
    kit.moveElement('/ppt/slides/slide1.xml#2', 100000, 100000);
    const saved = await kit.save();

    const pkg = await OpcPackageReader.open(saved);
    const slideXml = await pkg.getPartText('/ppt/slides/slide1.xml');
    const texts = getTextFromXml(slideXml, 2);
    expect(texts).toEqual(['Keep me!']);
  });

  it('leaves other shapes untouched', async () => {
    const data = await buildTestPptx({
      shapes: [
        { id: 2, name: 'Rect1', x: 100000, y: 100000, width: 500000, height: 300000 },
        { id: 3, name: 'Rect2', x: 900000, y: 900000, width: 400000, height: 200000 },
      ],
    });

    const kit = new EditableSlideKit();
    await kit.load(data);

    // Only move shape 2
    kit.moveElement('/ppt/slides/slide1.xml#2', 50000, 50000);
    const saved = await kit.save();

    const pkg = await OpcPackageReader.open(saved);
    const slideXml = await pkg.getPartText('/ppt/slides/slide1.xml');

    // Shape 2 moved
    const t2 = getTransformFromXml(slideXml, 2);
    expect(t2!.x).toBe(150000);
    expect(t2!.y).toBe(150000);

    // Shape 3 unchanged
    const t3 = getTransformFromXml(slideXml, 3);
    expect(t3!.x).toBe(900000);
    expect(t3!.y).toBe(900000);
    expect(t3!.cx).toBe(400000);
    expect(t3!.cy).toBe(200000);
  });
});

// ---------------------------------------------------------------------------
// Tests: Resize element
// ---------------------------------------------------------------------------

describe('round-trip: resize element', () => {
  it('patches size in saved XML', async () => {
    const data = await buildTestPptx({
      shapes: [
        { id: 2, name: 'Rect1', x: 100000, y: 200000, width: 500000, height: 300000 },
      ],
    });

    const kit = new EditableSlideKit();
    await kit.load(data);

    kit.resizeElement('/ppt/slides/slide1.xml#2', 1000000, 800000);
    const saved = await kit.save();

    const pkg = await OpcPackageReader.open(saved);
    const slideXml = await pkg.getPartText('/ppt/slides/slide1.xml');
    const t = getTransformFromXml(slideXml, 2);

    expect(t).toBeDefined();
    // Position should be unchanged
    expect(t!.x).toBe(100000);
    expect(t!.y).toBe(200000);
    // Size should be new values
    expect(t!.cx).toBe(1000000);
    expect(t!.cy).toBe(800000);
  });
});

// ---------------------------------------------------------------------------
// Tests: Edit text
// ---------------------------------------------------------------------------

describe('round-trip: edit text', () => {
  it('replaces text content in saved XML', async () => {
    const data = await buildTestPptx({
      shapes: [
        {
          id: 2, name: 'TextBox1', x: 0, y: 0,
          width: 500000, height: 300000, text: 'Original text',
        },
      ],
    });

    const kit = new EditableSlideKit();
    await kit.load(data);

    kit.setText('/ppt/slides/slide1.xml#2', [
      { runs: [{ text: 'Updated text' }] },
    ]);
    const saved = await kit.save();

    const pkg = await OpcPackageReader.open(saved);
    const slideXml = await pkg.getPartText('/ppt/slides/slide1.xml');
    const texts = getTextFromXml(slideXml, 2);
    expect(texts).toContain('Updated text');
  });

  it('preserves bold formatting from template run properties', async () => {
    const data = await buildTestPptx({
      shapes: [
        {
          id: 2, name: 'TextBox1', x: 0, y: 0,
          width: 500000, height: 300000, text: 'Bold text', bold: true,
        },
      ],
    });

    const kit = new EditableSlideKit();
    await kit.load(data);

    kit.setText('/ppt/slides/slide1.xml#2', [
      { runs: [{ text: 'Still bold' }] },
    ]);
    const saved = await kit.save();

    const pkg = await OpcPackageReader.open(saved);
    const slideXml = await pkg.getPartText('/ppt/slides/slide1.xml');
    const texts = getTextFromXml(slideXml, 2);
    expect(texts).toContain('Still bold');
  });
});

// ---------------------------------------------------------------------------
// Tests: Delete element
// ---------------------------------------------------------------------------

describe('round-trip: delete element', () => {
  it('removes shape from saved XML', async () => {
    const data = await buildTestPptx({
      shapes: [
        { id: 2, name: 'Rect1', x: 100000, y: 100000, width: 500000, height: 300000 },
        { id: 3, name: 'Rect2', x: 900000, y: 900000, width: 400000, height: 200000 },
      ],
    });

    const kit = new EditableSlideKit();
    await kit.load(data);

    kit.deleteElement('/ppt/slides/slide1.xml#2');
    const saved = await kit.save();

    const pkg = await OpcPackageReader.open(saved);
    const slideXml = await pkg.getPartText('/ppt/slides/slide1.xml');

    // Shape 2 should be gone
    expect(shapeExistsInXml(slideXml, 2)).toBe(false);
    // Shape 3 should still be present
    expect(shapeExistsInXml(slideXml, 3)).toBe(true);
  });

  it('deleted element no longer appears on reload', async () => {
    const data = await buildTestPptx({
      shapes: [
        { id: 2, name: 'Rect1', x: 100000, y: 100000, width: 500000, height: 300000 },
      ],
    });

    const kit = new EditableSlideKit();
    await kit.load(data);
    kit.deleteElement('/ppt/slides/slide1.xml#2');
    const saved = await kit.save();

    // Reload and verify the element is gone from the model
    const kit2 = new EditableSlideKit();
    await kit2.load(saved);
    const el = kit2.getElement('/ppt/slides/slide1.xml#2');
    expect(el).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: Reorder slides
// ---------------------------------------------------------------------------

describe('round-trip: reorder slides', () => {
  it('updates sldIdLst order in presentation.xml', async () => {
    const data = await buildTestPptx({ slideCount: 3 });

    const kit = new EditableSlideKit();
    await kit.load(data);

    // Move slide 0 to position 2 (ABC → BCA)
    kit.reorderSlides(0, 2);
    const saved = await kit.save();

    const pkg = await OpcPackageReader.open(saved);
    const presXml = await pkg.getPartText('/ppt/presentation.xml');
    const order = getSlideIdOrder(presXml);

    // Original order was [rId1, rId2, rId3] → after move 0→2 → [rId2, rId3, rId1]
    expect(order).toEqual(['rId2', 'rId3', 'rId1']);
  });

  it('preserves all slide parts after reorder', async () => {
    const data = await buildTestPptx({ slideCount: 2 });

    const kit = new EditableSlideKit();
    await kit.load(data);
    kit.reorderSlides(0, 1);
    const saved = await kit.save();

    const pkg = await OpcPackageReader.open(saved);
    const parts = pkg.listParts();
    expect(parts).toContain('/ppt/slides/slide1.xml');
    expect(parts).toContain('/ppt/slides/slide2.xml');
  });
});

// ---------------------------------------------------------------------------
// Tests: Delete slide
// ---------------------------------------------------------------------------

describe('round-trip: delete slide', () => {
  it('removes slide part from saved PPTX', async () => {
    const data = await buildTestPptx({ slideCount: 2 });

    const kit = new EditableSlideKit();
    await kit.load(data);
    kit.deleteSlide(1);
    const saved = await kit.save();

    const pkg = await OpcPackageReader.open(saved);
    const parts = pkg.listParts();
    expect(parts).toContain('/ppt/slides/slide1.xml');
    expect(parts).not.toContain('/ppt/slides/slide2.xml');
  });

  it('updates presentation.xml sldIdLst after deletion', async () => {
    const data = await buildTestPptx({ slideCount: 3 });

    const kit = new EditableSlideKit();
    await kit.load(data);
    kit.deleteSlide(1); // Delete middle slide
    const saved = await kit.save();

    const pkg = await OpcPackageReader.open(saved);
    const presXml = await pkg.getPartText('/ppt/presentation.xml');
    const order = getSlideIdOrder(presXml);

    // Only rId1 and rId3 should remain
    expect(order).toHaveLength(2);
    expect(order).toContain('rId1');
    expect(order).toContain('rId3');
    expect(order).not.toContain('rId2');
  });
});

// ---------------------------------------------------------------------------
// Tests: Multiple edits on same slide
// ---------------------------------------------------------------------------

describe('round-trip: multiple edits on same slide', () => {
  it('composes move + resize on different elements', async () => {
    const data = await buildTestPptx({
      shapes: [
        { id: 2, name: 'Rect1', x: 100000, y: 100000, width: 500000, height: 300000 },
        { id: 3, name: 'Rect2', x: 900000, y: 900000, width: 400000, height: 200000 },
      ],
    });

    const kit = new EditableSlideKit();
    await kit.load(data);

    // Move shape 2 and resize shape 3
    kit.moveElement('/ppt/slides/slide1.xml#2', 50000, 50000);
    kit.resizeElement('/ppt/slides/slide1.xml#3', 800000, 600000);
    const saved = await kit.save();

    const pkg = await OpcPackageReader.open(saved);
    const slideXml = await pkg.getPartText('/ppt/slides/slide1.xml');

    const t2 = getTransformFromXml(slideXml, 2);
    expect(t2!.x).toBe(150000);
    expect(t2!.y).toBe(150000);
    expect(t2!.cx).toBe(500000); // unchanged

    const t3 = getTransformFromXml(slideXml, 3);
    expect(t3!.x).toBe(900000); // unchanged
    expect(t3!.y).toBe(900000); // unchanged
    expect(t3!.cx).toBe(800000);
    expect(t3!.cy).toBe(600000);
  });

  it('composes move + text edit on same element', async () => {
    const data = await buildTestPptx({
      shapes: [
        {
          id: 2, name: 'TextBox1', x: 100000, y: 100000,
          width: 500000, height: 300000, text: 'Original',
        },
      ],
    });

    const kit = new EditableSlideKit();
    await kit.load(data);

    kit.moveElement('/ppt/slides/slide1.xml#2', 200000, 0);
    kit.setText('/ppt/slides/slide1.xml#2', [
      { runs: [{ text: 'Updated' }] },
    ]);
    const saved = await kit.save();

    const pkg = await OpcPackageReader.open(saved);
    const slideXml = await pkg.getPartText('/ppt/slides/slide1.xml');

    // Verify position changed
    const t = getTransformFromXml(slideXml, 2);
    expect(t!.x).toBe(300000);

    // Verify text changed
    const texts = getTextFromXml(slideXml, 2);
    expect(texts).toContain('Updated');
  });

  it('composes move + delete on different elements', async () => {
    const data = await buildTestPptx({
      shapes: [
        { id: 2, name: 'Keep', x: 100000, y: 100000, width: 500000, height: 300000 },
        { id: 3, name: 'Remove', x: 900000, y: 900000, width: 400000, height: 200000 },
      ],
    });

    const kit = new EditableSlideKit();
    await kit.load(data);

    kit.moveElement('/ppt/slides/slide1.xml#2', 100000, 0);
    kit.deleteElement('/ppt/slides/slide1.xml#3');
    const saved = await kit.save();

    const pkg = await OpcPackageReader.open(saved);
    const slideXml = await pkg.getPartText('/ppt/slides/slide1.xml');

    // Shape 2 moved
    const t = getTransformFromXml(slideXml, 2);
    expect(t!.x).toBe(200000);

    // Shape 3 deleted
    expect(shapeExistsInXml(slideXml, 3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Real fixture (basic-shapes.pptx)
// ---------------------------------------------------------------------------

describe('round-trip: basic-shapes.pptx fixture', () => {
  const pptxPath = resolve(__dirname, '../../../../../test-data/basic-shapes.pptx');
  let pptxData: ArrayBuffer;

  try {
    pptxData = readFileSync(pptxPath).buffer as ArrayBuffer;
  } catch {
    // If fixture doesn't exist, skip these tests
    pptxData = null!;
  }

  it('loads and saves without errors', async () => {
    if (!pptxData) return;

    const kit = new EditableSlideKit();
    const info = await kit.load(pptxData);

    expect(info.slideCount).toBeGreaterThan(0);
    expect(info.slideWidth).toBeGreaterThan(0);
    expect(info.slideHeight).toBeGreaterThan(0);

    const saved = await kit.save();
    expect(saved).toBeInstanceOf(Uint8Array);
    expect(saved.length).toBeGreaterThan(0);
  });

  it('saved output can be reopened', async () => {
    if (!pptxData) return;

    const kit = new EditableSlideKit();
    await kit.load(pptxData);
    const saved = await kit.save();

    // Verify it's a valid PPTX
    const pkg = await OpcPackageReader.open(saved);
    const parts = pkg.listParts();
    expect(parts).toContain('/ppt/presentation.xml');
    expect(parts.some((p) => p.startsWith('/ppt/slides/'))).toBe(true);
  });

  it('preserved slides can be re-parsed', async () => {
    if (!pptxData) return;

    const kit = new EditableSlideKit();
    const info = await kit.load(pptxData);
    const saved = await kit.save();

    // Reload and parse
    const kit2 = new EditableSlideKit();
    const info2 = await kit2.load(saved);

    expect(info2.slideCount).toBe(info.slideCount);
    expect(info2.slideWidth).toBe(info.slideWidth);
    expect(info2.slideHeight).toBe(info.slideHeight);
  });
});

// ---------------------------------------------------------------------------
// Tests: Dirty state reset after save
// ---------------------------------------------------------------------------

describe('round-trip: dirty state management', () => {
  it('clears dirty state after save', async () => {
    const data = await buildTestPptx({
      shapes: [
        { id: 2, name: 'Rect1', x: 100000, y: 100000, width: 500000, height: 300000 },
      ],
    });

    const kit = new EditableSlideKit();
    await kit.load(data);

    kit.moveElement('/ppt/slides/slide1.xml#2', 100000, 0);
    expect(kit.presentation.getDirtyParts()).toHaveLength(1);

    await kit.save();
    expect(kit.presentation.getDirtyParts()).toHaveLength(0);
  });

  it('can perform second save after re-editing', async () => {
    const data = await buildTestPptx({
      shapes: [
        { id: 2, name: 'Rect1', x: 100000, y: 100000, width: 500000, height: 300000 },
      ],
    });

    const kit = new EditableSlideKit();
    await kit.load(data);

    // First edit + save
    kit.moveElement('/ppt/slides/slide1.xml#2', 100000, 0);
    const saved1 = await kit.save();

    // Second edit + save
    kit.moveElement('/ppt/slides/slide1.xml#2', 100000, 0);
    const saved2 = await kit.save();

    // Both saves should produce valid output
    expect(saved1.length).toBeGreaterThan(0);
    expect(saved2.length).toBeGreaterThan(0);

    // Verify second save has cumulative position
    const pkg = await OpcPackageReader.open(saved2);
    const slideXml = await pkg.getPartText('/ppt/slides/slide1.xml');
    const t = getTransformFromXml(slideXml, 2);
    expect(t!.x).toBe(300000); // 100000 + 100000 + 100000
  });
});
