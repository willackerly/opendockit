import { bench, describe } from 'vitest';
import { parseXml } from '@opendockit/core';
import { parseFill } from '@opendockit/core/drawingml';
import type { ThemeIR } from '@opendockit/core/ir';

/**
 * Benchmark fill IR creation from XML.
 */

const theme: ThemeIR = {
  name: 'Bench Theme',
  colorScheme: {
    dk1: { r: 0, g: 0, b: 0, a: 1 },
    lt1: { r: 255, g: 255, b: 255, a: 1 },
    dk2: { r: 68, g: 84, b: 106, a: 1 },
    lt2: { r: 231, g: 230, b: 230, a: 1 },
    accent1: { r: 68, g: 114, b: 196, a: 1 },
    accent2: { r: 237, g: 125, b: 49, a: 1 },
    accent3: { r: 165, g: 165, b: 165, a: 1 },
    accent4: { r: 255, g: 192, b: 0, a: 1 },
    accent5: { r: 91, g: 155, b: 213, a: 1 },
    accent6: { r: 112, g: 173, b: 71, a: 1 },
    hlink: { r: 5, g: 99, b: 193, a: 1 },
    folHlink: { r: 149, g: 79, b: 114, a: 1 },
  },
  fontScheme: { majorLatin: 'Calibri Light', minorLatin: 'Calibri' },
  formatScheme: {
    fillStyles: [
      { type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } },
      { type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } },
      { type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } },
    ],
    lineStyles: [{}, {}, {}],
    effectStyles: [[], [], []],
    bgFillStyles: [
      { type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 } },
      { type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 } },
      { type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 } },
    ],
  },
};

const solidXml = parseXml(`
<a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>
</a:spPr>`);

const gradientXml = parseXml(`
<a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:gradFill>
    <a:gsLst>
      <a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs>
      <a:gs pos="50000"><a:srgbClr val="00FF00"/></a:gs>
      <a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs>
    </a:gsLst>
    <a:lin ang="5400000" scaled="1"/>
  </a:gradFill>
</a:spPr>`);

const schemeXml = parseXml(`
<a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:solidFill><a:schemeClr val="accent1"/></a:solidFill>
</a:spPr>`);

describe('Fill Parsing', () => {
  bench('parse solid fill (srgbClr)', () => {
    parseFill(solidXml, theme);
  });

  bench('parse gradient fill (3 stops)', () => {
    parseFill(gradientXml, theme);
  });

  bench('parse solid fill (schemeClr)', () => {
    parseFill(schemeXml, theme);
  });
});
