import { bench, describe } from 'vitest';
import { parseXml } from '@opendockit/core';

/**
 * Benchmark XML parsing throughput with sample DrawingML XML.
 */

const SMALL_XML = `
<a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>
  <a:ln w="12700"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>
</a:spPr>`;

const MEDIUM_XML = `
<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:nvSpPr>
    <p:cNvPr id="4" name="TextBox 3"/>
    <p:cNvSpPr txBox="1"/>
    <p:nvPr/>
  </p:nvSpPr>
  <p:spPr>
    <a:xfrm><a:off x="457200" y="1600200"/><a:ext cx="4572000" cy="3429000"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    <a:solidFill><a:schemeClr val="accent1"/></a:solidFill>
    <a:ln w="12700">
      <a:solidFill><a:srgbClr val="000000"/></a:solidFill>
      <a:prstDash val="solid"/>
    </a:ln>
  </p:spPr>
  <p:txBody>
    <a:bodyPr wrap="square" rtlCol="0"/>
    <a:lstStyle/>
    <a:p>
      <a:r><a:rPr lang="en-US" sz="1800" b="1"/><a:t>Hello World</a:t></a:r>
    </a:p>
    <a:p>
      <a:r><a:rPr lang="en-US" sz="1400"/><a:t>Second paragraph with more text content.</a:t></a:r>
    </a:p>
  </p:txBody>
</p:sp>`;

describe('XML Parsing', () => {
  bench('parse small DrawingML (fill + line)', () => {
    parseXml(SMALL_XML);
  });

  bench('parse medium DrawingML (full shape)', () => {
    parseXml(MEDIUM_XML);
  });
});
