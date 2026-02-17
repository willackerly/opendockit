#!/usr/bin/env node
/**
 * generate-test-pptx.mjs
 *
 * Creates a minimal but visually interesting PPTX test fixture using JSZip.
 * A PPTX is a ZIP archive containing XML files following the OOXML standard.
 *
 * Output: test-data/basic-shapes.pptx
 *
 * Usage: node scripts/generate-test-pptx.mjs
 */

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// Resolve JSZip from the core package where it's already installed
const require = createRequire(resolve(rootDir, 'packages/core/node_modules/.package-lock.json'));
const JSZip = require('jszip');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** EMU (English Metric Unit): 1 inch = 914400 EMU, 1 cm = 360000 EMU */
const EMU_PER_INCH = 914400;
const EMU_PER_PT = 12700;

const inches = (n) => Math.round(n * EMU_PER_INCH);
const pt = (n) => Math.round(n * 100); // hundredths of a point for font size
const emu = (n) => n; // passthrough for clarity

/** Standard 10x7.5 inch slide dimensions */
const SLIDE_W = inches(10);
const SLIDE_H = inches(7.5);

// ── XML Boilerplate ──────────────────────────────────────────────────────────

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function contentTypesXml() {
  return `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>`;
}

function rootRelsXml() {
  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;
}

function presentationXml() {
  return `${XML_HEADER}<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId2"/>
    <p:sldId id="257" r:id="rId3"/>
    <p:sldId id="258" r:id="rId4"/>
  </p:sldIdLst>
  <p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/>
  <p:notesSz cx="${SLIDE_H}" cy="${SLIDE_W}"/>
</p:presentation>`;
}

function presentationRelsXml() {
  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`;
}

function slideRelsXml() {
  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;
}

function slideLayoutRelsXml() {
  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;
}

function slideMasterRelsXml() {
  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`;
}

function slideLayoutXml() {
  return `${XML_HEADER}<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  type="blank" preserve="1">
  <p:cSld name="Blank">
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
</p:sldLayout>`;
}

function slideMasterXml() {
  return `${XML_HEADER}<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:bg>
      <p:bgPr>
        <a:solidFill>
          <a:srgbClr val="FFFFFF"/>
        </a:solidFill>
        <a:effectLst/>
      </p:bgPr>
    </p:bg>
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
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rId1"/>
  </p:sldLayoutIdLst>
</p:sldMaster>`;
}

function themeXml() {
  return `${XML_HEADER}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="OpenDocKit">
  <a:themeElements>
    <a:clrScheme name="OpenDocKit">
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
    <a:fontScheme name="OpenDocKit">
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
    <a:fmtScheme name="OpenDocKit">
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
</a:theme>`;
}

// ── Shape Builders ───────────────────────────────────────────────────────────

/**
 * Build a shaped <p:sp> element.
 * @param {object} opts
 * @param {number} opts.id - shape id
 * @param {string} opts.name - shape name
 * @param {string} opts.prstGeom - preset geometry name (rect, ellipse, roundRect, triangle, line)
 * @param {number} opts.x - x offset in EMU
 * @param {number} opts.y - y offset in EMU
 * @param {number} opts.cx - width in EMU
 * @param {number} opts.cy - height in EMU
 * @param {string} [opts.fillColor] - solid fill sRGB hex (no #)
 * @param {string} [opts.lineColor] - outline sRGB hex (no #)
 * @param {number} [opts.lineWidth] - outline width in EMU
 * @param {string} [opts.textBody] - inner XML for a:txBody (if any)
 * @param {boolean} [opts.flipV] - vertical flip
 * @param {number} [opts.rot] - rotation in 60,000ths of a degree
 */
function sp(opts) {
  const {
    id,
    name,
    prstGeom,
    x,
    y,
    cx,
    cy,
    fillColor,
    lineColor,
    lineWidth,
    textBody,
    flipV,
    rot,
  } = opts;

  const xfrmAttrs = [rot ? `rot="${rot}"` : '', flipV ? 'flipV="1"' : ''].filter(Boolean).join(' ');
  const xfrmOpen = xfrmAttrs ? `<a:xfrm ${xfrmAttrs}>` : '<a:xfrm>';

  let fillXml = '';
  if (fillColor) {
    fillXml = `<a:solidFill><a:srgbClr val="${fillColor}"/></a:solidFill>`;
  } else {
    fillXml = '<a:noFill/>';
  }

  let lnXml = '';
  if (lineColor) {
    const w = lineWidth || 12700;
    lnXml = `<a:ln w="${w}"><a:solidFill><a:srgbClr val="${lineColor}"/></a:solidFill></a:ln>`;
  }

  let txBodyXml = '';
  if (textBody) {
    txBodyXml = `<p:txBody>${textBody}</p:txBody>`;
  }

  return `<p:sp>
  <p:nvSpPr>
    <p:cNvPr id="${id}" name="${name}"/>
    <p:cNvSpPr/>
    <p:nvPr/>
  </p:nvSpPr>
  <p:spPr>
    ${xfrmOpen}
      <a:off x="${x}" y="${y}"/>
      <a:ext cx="${cx}" cy="${cy}"/>
    </a:xfrm>
    <a:prstGeom prst="${prstGeom}"><a:avLst/></a:prstGeom>
    ${fillXml}
    ${lnXml}
  </p:spPr>
  ${txBodyXml}
</p:sp>`;
}

/** Helper: simple text body with one paragraph/run */
function simpleTextBody(text, opts = {}) {
  const { fontSize, bold, italic, color, align } = opts;
  const rpAttrs = [];
  if (fontSize) rpAttrs.push(`sz="${pt(fontSize)}"`);
  if (bold) rpAttrs.push('b="1"');
  if (italic) rpAttrs.push('i="1"');
  rpAttrs.push('dirty="0"');

  const solidFill = color ? `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` : '';
  const latin = '<a:latin typeface="Calibri"/>';

  const algn = align ? ` algn="${align}"` : '';

  return `<a:bodyPr wrap="square" rtlCol="0"/>
    <a:lstStyle/>
    <a:p>
      <a:pPr${algn}/>
      <a:r>
        <a:rPr lang="en-US" ${rpAttrs.join(' ')}>${solidFill}${latin}</a:rPr>
        <a:t>${escapeXml(text)}</a:t>
      </a:r>
    </a:p>`;
}

/** Helper: multi-paragraph text body */
function multiParaTextBody(paragraphs, bodyPrAttrs = '') {
  const bodyPr = bodyPrAttrs
    ? `<a:bodyPr ${bodyPrAttrs}/>`
    : '<a:bodyPr wrap="square" rtlCol="0"/>';
  const parasXml = paragraphs
    .map((p) => {
      const rpAttrs = [];
      if (p.fontSize) rpAttrs.push(`sz="${pt(p.fontSize)}"`);
      if (p.bold) rpAttrs.push('b="1"');
      if (p.italic) rpAttrs.push('i="1"');
      rpAttrs.push('dirty="0"');

      const solidFill = p.color ? `<a:solidFill><a:srgbClr val="${p.color}"/></a:solidFill>` : '';
      const latin = '<a:latin typeface="Calibri"/>';

      const pPrParts = [];
      if (p.align) pPrParts.push(`algn="${p.align}"`);

      // Bullet support
      let bulletXml = '';
      if (p.bullet) {
        bulletXml = '<a:buFont typeface="Arial"/><a:buChar char="\u2022"/>';
        pPrParts.push(`marL="${inches(0.5)}" indent="${-inches(0.25)}"`);
      }

      const pPrAttrs = pPrParts.length ? ' ' + pPrParts.join(' ') : '';
      const pPrContent = bulletXml;
      const pPr = pPrContent ? `<a:pPr${pPrAttrs}>${pPrContent}</a:pPr>` : `<a:pPr${pPrAttrs}/>`;

      return `<a:p>
      ${pPr}
      <a:r>
        <a:rPr lang="en-US" ${rpAttrs.join(' ')}>${solidFill}${latin}</a:rPr>
        <a:t>${escapeXml(p.text)}</a:t>
      </a:r>
    </a:p>`;
    })
    .join('\n    ');

  return `${bodyPr}
    <a:lstStyle/>
    ${parasXml}`;
}

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Slide XML Builders ───────────────────────────────────────────────────────

function wrapSlide(shapesXml, bgXml = '') {
  return `${XML_HEADER}<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    ${bgXml}
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
      ${shapesXml}
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

// ── Slide 1: Title Slide ─────────────────────────────────────────────────────

function slide1Xml() {
  const bg = `<p:bg>
      <p:bgPr>
        <a:solidFill><a:srgbClr val="4472C4"/></a:solidFill>
        <a:effectLst/>
      </p:bgPr>
    </p:bg>`;

  const title = sp({
    id: 2,
    name: 'Title',
    prstGeom: 'rect',
    x: inches(1),
    y: inches(2),
    cx: inches(8),
    cy: inches(1.5),
    textBody: simpleTextBody('OpenDocKit Test', {
      fontSize: 44,
      bold: true,
      color: 'FFFFFF',
      align: 'ctr',
    }),
  });

  const subtitle = sp({
    id: 3,
    name: 'Subtitle',
    prstGeom: 'rect',
    x: inches(2),
    y: inches(3.8),
    cx: inches(6),
    cy: inches(1),
    textBody: simpleTextBody('Basic Shapes & Text', {
      fontSize: 24,
      color: 'D9E2F3',
      align: 'ctr',
    }),
  });

  return wrapSlide(`${title}\n${subtitle}`, bg);
}

// ── Slide 2: Shapes ──────────────────────────────────────────────────────────

function slide2Xml() {
  const margin = inches(0.75);
  const shapeW = inches(3.5);
  const shapeH = inches(2.5);
  const rightX = SLIDE_W - margin - shapeW;
  const bottomY = SLIDE_H - margin - shapeH;

  // Red rectangle - top-left
  const rect = sp({
    id: 2,
    name: 'Rectangle',
    prstGeom: 'rect',
    x: margin,
    y: margin,
    cx: shapeW,
    cy: shapeH,
    fillColor: 'FF0000',
    lineColor: 'CC0000',
    lineWidth: 19050,
    textBody: simpleTextBody('Rectangle', {
      fontSize: 24,
      bold: true,
      color: 'FFFFFF',
      align: 'ctr',
    }),
  });

  // Blue ellipse - top-right
  const ellipse = sp({
    id: 3,
    name: 'Ellipse',
    prstGeom: 'ellipse',
    x: rightX,
    y: margin,
    cx: shapeW,
    cy: shapeH,
    fillColor: '4472C4',
    lineColor: '2F5597',
    lineWidth: 19050,
    textBody: simpleTextBody('Ellipse', {
      fontSize: 24,
      bold: true,
      color: 'FFFFFF',
      align: 'ctr',
    }),
  });

  // Green rounded rectangle - bottom-left
  const roundRect = sp({
    id: 4,
    name: 'Rounded Rect',
    prstGeom: 'roundRect',
    x: margin,
    y: bottomY,
    cx: shapeW,
    cy: shapeH,
    fillColor: '70AD47',
    lineColor: '548235',
    lineWidth: 19050,
    textBody: simpleTextBody('Rounded Rect', {
      fontSize: 24,
      bold: true,
      color: 'FFFFFF',
      align: 'ctr',
    }),
  });

  // Yellow triangle - bottom-right
  const triangle = sp({
    id: 5,
    name: 'Triangle',
    prstGeom: 'triangle',
    x: rightX,
    y: bottomY,
    cx: shapeW,
    cy: shapeH,
    fillColor: 'FFC000',
    lineColor: 'BF9000',
    lineWidth: 19050,
    textBody: simpleTextBody('Triangle', {
      fontSize: 20,
      bold: true,
      color: '000000',
      align: 'ctr',
    }),
  });

  return wrapSlide(`${rect}\n${ellipse}\n${roundRect}\n${triangle}`);
}

// ── Slide 3: Text & Lines ────────────────────────────────────────────────────

function slide3Xml() {
  // Multi-paragraph text box at top
  const textBox = sp({
    id: 2,
    name: 'TextBox',
    prstGeom: 'rect',
    x: inches(0.75),
    y: inches(0.5),
    cx: inches(8.5),
    cy: inches(2.5),
    textBody: multiParaTextBody(
      [
        { text: 'Heading', fontSize: 28, bold: true, color: '2F5597' },
        {
          text: 'Body text in normal weight',
          fontSize: 18,
          color: '333333',
        },
        {
          text: 'Italic text for emphasis',
          fontSize: 18,
          italic: true,
          color: '666666',
        },
      ],
      'wrap="square" rtlCol="0" anchor="t"'
    ),
  });

  // Horizontal line across the middle
  const line = sp({
    id: 3,
    name: 'Line',
    prstGeom: 'line',
    x: inches(0.75),
    y: inches(3.5),
    cx: inches(8.5),
    cy: 0,
    lineColor: '4472C4',
    lineWidth: 25400, // 2pt line
  });

  // Bullet points below
  const bullets = sp({
    id: 4,
    name: 'Bullets',
    prstGeom: 'rect',
    x: inches(0.75),
    y: inches(4),
    cx: inches(8.5),
    cy: inches(3),
    textBody: multiParaTextBody(
      [
        {
          text: 'Key Features',
          fontSize: 22,
          bold: true,
          color: '2F5597',
        },
        {
          text: '100% client-side rendering',
          fontSize: 16,
          color: '333333',
          bullet: true,
        },
        {
          text: 'Progressive fidelity (fast first paint)',
          fontSize: 16,
          color: '333333',
          bullet: true,
        },
        {
          text: 'Canvas2D primary renderer',
          fontSize: 16,
          color: '333333',
          bullet: true,
        },
        {
          text: 'Full DrawingML shape support',
          fontSize: 16,
          color: '333333',
          bullet: true,
        },
      ],
      'wrap="square" rtlCol="0" anchor="t"'
    ),
  });

  return wrapSlide(`${textBox}\n${line}\n${bullets}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const zip = new JSZip();

  // Root structure
  zip.file('[Content_Types].xml', contentTypesXml());
  zip.file('_rels/.rels', rootRelsXml());

  // Presentation
  zip.file('ppt/presentation.xml', presentationXml());
  zip.file('ppt/_rels/presentation.xml.rels', presentationRelsXml());

  // Theme
  zip.file('ppt/theme/theme1.xml', themeXml());

  // Slide master and layout
  zip.file('ppt/slideMasters/slideMaster1.xml', slideMasterXml());
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', slideMasterRelsXml());
  zip.file('ppt/slideLayouts/slideLayout1.xml', slideLayoutXml());
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', slideLayoutRelsXml());

  // Slides
  zip.file('ppt/slides/slide1.xml', slide1Xml());
  zip.file('ppt/slides/_rels/slide1.xml.rels', slideRelsXml());

  zip.file('ppt/slides/slide2.xml', slide2Xml());
  zip.file('ppt/slides/_rels/slide2.xml.rels', slideRelsXml());

  zip.file('ppt/slides/slide3.xml', slide3Xml());
  zip.file('ppt/slides/_rels/slide3.xml.rels', slideRelsXml());

  // Generate
  const buf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const outDir = resolve(rootDir, 'test-data');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'basic-shapes.pptx');
  writeFileSync(outPath, buf);

  const sizeKB = (buf.length / 1024).toFixed(1);
  console.log(`Generated: ${outPath}`);
  console.log(`Size: ${sizeKB} KB (${buf.length} bytes)`);

  if (buf.length < 5000) {
    console.error('WARNING: File seems too small, might be invalid');
    process.exit(1);
  }

  // Quick validation: check ZIP signature
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
    console.error('ERROR: Not a valid ZIP file');
    process.exit(1);
  }

  console.log('Validation: ZIP signature OK, size reasonable');
}

main().catch((err) => {
  console.error('Failed to generate PPTX:', err);
  process.exit(1);
});
