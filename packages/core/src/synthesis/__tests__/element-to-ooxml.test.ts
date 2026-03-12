/**
 * Tests for OOXML synthesis from PageElement properties.
 */

import { describe, it, expect } from 'vitest';
import {
  synthesizeTransform,
  synthesizeFill,
  synthesizeLine,
  synthesizeTextBody,
  synthesizeSlideShape,
  synthesizeSlidePicture,
  synthesizeSlideGroup,
  synthesizeShape,
  ptToEmu,
  degToOoxml,
  fontSizeToOoxml,
  colorToHex,
} from '../element-to-ooxml.js';
import type {
  TextElement,
  ShapeElement,
  ImageElement,
  GroupElement,
  Fill,
  Stroke,
  Paragraph,
} from '../element-to-ooxml.js';

// ═══════════════════════════════════════════════════════════════════════════
// Unit Conversion Helpers
// ═══════════════════════════════════════════════════════════════════════════

describe('unit conversion helpers', () => {
  it('ptToEmu converts points to EMU', () => {
    expect(ptToEmu(1)).toBe(12700); // 1pt = 12700 EMU
    expect(ptToEmu(72)).toBe(914400); // 72pt = 1 inch = 914400 EMU
    expect(ptToEmu(0)).toBe(0);
  });

  it('degToOoxml converts degrees to 60,000ths', () => {
    expect(degToOoxml(45)).toBe(2700000);
    expect(degToOoxml(90)).toBe(5400000);
    expect(degToOoxml(360)).toBe(21600000);
    expect(degToOoxml(0)).toBe(0);
  });

  it('fontSizeToOoxml converts pt to hundredths of a point', () => {
    expect(fontSizeToOoxml(12)).toBe(1200);
    expect(fontSizeToOoxml(10.5)).toBe(1050);
    expect(fontSizeToOoxml(24)).toBe(2400);
  });

  it('colorToHex converts Color to 6-digit hex', () => {
    expect(colorToHex({ r: 255, g: 0, b: 0 })).toBe('FF0000');
    expect(colorToHex({ r: 0, g: 128, b: 255 })).toBe('0080FF');
    expect(colorToHex({ r: 0, g: 0, b: 0 })).toBe('000000');
    expect(colorToHex({ r: 255, g: 255, b: 255 })).toBe('FFFFFF');
  });

  it('colorToHex clamps out-of-range values', () => {
    expect(colorToHex({ r: 300, g: -10, b: 128 })).toBe('FF0080');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Transform
// ═══════════════════════════════════════════════════════════════════════════

describe('synthesizeTransform', () => {
  it('generates correct EMU values', () => {
    const xml = synthesizeTransform(36, 72, 360, 270);
    // 36pt = 457200 EMU, 72pt = 914400 EMU, 360pt = 4572000, 270pt = 3429000
    expect(xml).toContain('<a:off x="457200" y="914400"/>');
    expect(xml).toContain('<a:ext cx="4572000" cy="3429000"/>');
  });

  it('includes rotation when non-zero', () => {
    const xml = synthesizeTransform(0, 0, 100, 100, 45);
    expect(xml).toContain('rot="2700000"');
  });

  it('omits rotation when zero', () => {
    const xml = synthesizeTransform(0, 0, 100, 100, 0);
    expect(xml).not.toContain('rot=');
  });

  it('omits rotation when undefined', () => {
    const xml = synthesizeTransform(0, 0, 100, 100);
    expect(xml).not.toContain('rot=');
  });

  it('wraps in a:xfrm element', () => {
    const xml = synthesizeTransform(0, 0, 100, 100);
    expect(xml).toMatch(/^<a:xfrm>/);
    expect(xml).toMatch(/<\/a:xfrm>$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fill
// ═══════════════════════════════════════════════════════════════════════════

describe('synthesizeFill', () => {
  it('solid color → <a:solidFill><a:srgbClr/></a:solidFill>', () => {
    const fill: Fill = { type: 'solid', color: { r: 255, g: 0, b: 0 } };
    const xml = synthesizeFill(fill);
    expect(xml).toBe(
      '<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>'
    );
  });

  it('solid color with alpha', () => {
    const fill: Fill = {
      type: 'solid',
      color: { r: 0, g: 0, b: 255, a: 0.5 },
    };
    const xml = synthesizeFill(fill);
    expect(xml).toContain('<a:alpha val="50000"/>');
    expect(xml).toContain('val="0000FF"');
  });

  it('null fill → empty string', () => {
    expect(synthesizeFill(null)).toBe('');
  });

  it('undefined fill → empty string', () => {
    expect(synthesizeFill(undefined)).toBe('');
  });

  it('linear gradient → <a:gradFill> with stops and <a:lin>', () => {
    const fill: Fill = {
      type: 'linear-gradient',
      stops: [
        { offset: 0, color: { r: 255, g: 0, b: 0 } },
        { offset: 1, color: { r: 0, g: 0, b: 255 } },
      ],
      angle: 90,
    };
    const xml = synthesizeFill(fill);
    expect(xml).toContain('<a:gradFill>');
    expect(xml).toContain('<a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs>');
    expect(xml).toContain(
      '<a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs>'
    );
    expect(xml).toContain('<a:lin ang="5400000" scaled="1"/>');
  });

  it('radial gradient → <a:gradFill> with <a:path path="circle">', () => {
    const fill: Fill = {
      type: 'radial-gradient',
      stops: [
        { offset: 0, color: { r: 255, g: 255, b: 255 } },
        { offset: 1, color: { r: 0, g: 0, b: 0 } },
      ],
    };
    const xml = synthesizeFill(fill);
    expect(xml).toContain('<a:path path="circle">');
    expect(xml).toContain('l="50000" t="50000" r="50000" b="50000"');
  });

  it('pattern → <a:noFill/> (unsupported creation)', () => {
    const fill: Fill = { type: 'pattern' };
    const xml = synthesizeFill(fill);
    expect(xml).toBe('<a:noFill/>');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Line / Stroke
// ═══════════════════════════════════════════════════════════════════════════

describe('synthesizeLine', () => {
  it('generates <a:ln> with width and color', () => {
    const stroke: Stroke = {
      color: { r: 0, g: 0, b: 0 },
      width: 1,
    };
    const xml = synthesizeLine(stroke);
    // 1pt = 12700 EMU
    expect(xml).toContain('w="12700"');
    expect(xml).toContain('<a:solidFill><a:srgbClr val="000000"/></a:solidFill>');
    expect(xml).toMatch(/^<a:ln /);
    expect(xml).toMatch(/<\/a:ln>$/);
  });

  it('null stroke → empty string', () => {
    expect(synthesizeLine(null)).toBe('');
  });

  it('undefined stroke → empty string', () => {
    expect(synthesizeLine(undefined)).toBe('');
  });

  it('includes cap attribute', () => {
    const stroke: Stroke = {
      color: { r: 0, g: 0, b: 0 },
      width: 2,
      lineCap: 'round',
    };
    const xml = synthesizeLine(stroke);
    expect(xml).toContain('cap="rnd"');
  });

  it('includes line join', () => {
    const stroke: Stroke = {
      color: { r: 0, g: 0, b: 0 },
      width: 1,
      lineJoin: 'round',
    };
    const xml = synthesizeLine(stroke);
    expect(xml).toContain('<a:round/>');
  });

  it('includes bevel join', () => {
    const stroke: Stroke = {
      color: { r: 0, g: 0, b: 0 },
      width: 1,
      lineJoin: 'bevel',
    };
    const xml = synthesizeLine(stroke);
    expect(xml).toContain('<a:bevel/>');
  });

  it('includes miter join with limit', () => {
    const stroke: Stroke = {
      color: { r: 0, g: 0, b: 0 },
      width: 1,
      lineJoin: 'miter',
    };
    const xml = synthesizeLine(stroke);
    expect(xml).toContain('<a:miter lim="800000"/>');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Text Body
// ═══════════════════════════════════════════════════════════════════════════

describe('synthesizeTextBody', () => {
  it('generates <a:txBody> with paragraphs and runs', () => {
    const paragraphs: Paragraph[] = [
      {
        runs: [
          {
            text: 'Hello World',
            fontFamily: 'Arial',
            fontSize: 24,
            bold: true,
            color: { r: 0, g: 0, b: 0 },
            x: 0,
            y: 0,
            width: 100,
            height: 24,
          },
        ],
        align: 'center',
      },
    ];
    const xml = synthesizeTextBody(paragraphs);
    expect(xml).toContain('<a:txBody>');
    expect(xml).toContain('<a:bodyPr wrap="square" rtlCol="0"/>');
    expect(xml).toContain('<a:lstStyle/>');
    expect(xml).toContain('<a:pPr algn="ctr"/>');
    expect(xml).toContain('sz="2400"');
    expect(xml).toContain('b="1"');
    expect(xml).toContain('<a:latin typeface="Arial"/>');
    expect(xml).toContain('<a:t>Hello World</a:t>');
    expect(xml).toContain('</a:txBody>');
  });

  it('null/undefined/empty → empty string', () => {
    expect(synthesizeTextBody(null)).toBe('');
    expect(synthesizeTextBody(undefined)).toBe('');
    expect(synthesizeTextBody([])).toBe('');
  });

  it('escapes XML special characters in text', () => {
    const paragraphs: Paragraph[] = [
      {
        runs: [
          {
            text: 'A < B & C > D',
            fontFamily: 'Arial',
            fontSize: 12,
            color: { r: 0, g: 0, b: 0 },
            x: 0,
            y: 0,
            width: 50,
            height: 12,
          },
        ],
      },
    ];
    const xml = synthesizeTextBody(paragraphs);
    expect(xml).toContain('A &lt; B &amp; C &gt; D');
  });

  it('handles italic, underline, strikethrough', () => {
    const paragraphs: Paragraph[] = [
      {
        runs: [
          {
            text: 'styled',
            fontFamily: 'Times',
            fontSize: 12,
            italic: true,
            underline: true,
            strikethrough: true,
            color: { r: 0, g: 0, b: 0 },
            x: 0,
            y: 0,
            width: 40,
            height: 12,
          },
        ],
      },
    ];
    const xml = synthesizeTextBody(paragraphs);
    expect(xml).toContain('i="1"');
    expect(xml).toContain('u="sng"');
    expect(xml).toContain('strike="sngStrike"');
  });

  it('maps alignment values correctly', () => {
    const makeParas = (align: 'left' | 'center' | 'right' | 'justify') => [
      {
        runs: [
          {
            text: 'x',
            fontFamily: 'Arial',
            fontSize: 12,
            color: { r: 0, g: 0, b: 0 },
            x: 0,
            y: 0,
            width: 10,
            height: 12,
          },
        ],
        align,
      },
    ];

    expect(synthesizeTextBody(makeParas('left'))).toContain('algn="l"');
    expect(synthesizeTextBody(makeParas('center'))).toContain('algn="ctr"');
    expect(synthesizeTextBody(makeParas('right'))).toContain('algn="r"');
    expect(synthesizeTextBody(makeParas('justify'))).toContain('algn="just"');
  });

  it('handles multiple paragraphs', () => {
    const paragraphs: Paragraph[] = [
      {
        runs: [
          {
            text: 'First',
            fontFamily: 'Arial',
            fontSize: 12,
            color: { r: 0, g: 0, b: 0 },
            x: 0,
            y: 0,
            width: 30,
            height: 12,
          },
        ],
      },
      {
        runs: [
          {
            text: 'Second',
            fontFamily: 'Arial',
            fontSize: 12,
            color: { r: 0, g: 0, b: 0 },
            x: 0,
            y: 14,
            width: 35,
            height: 12,
          },
        ],
      },
    ];
    const xml = synthesizeTextBody(paragraphs);
    const paraCount = (xml.match(/<a:p>/g) ?? []).length;
    expect(paraCount).toBe(2);
    expect(xml).toContain('<a:t>First</a:t>');
    expect(xml).toContain('<a:t>Second</a:t>');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Slide Shape (full p:sp)
// ═══════════════════════════════════════════════════════════════════════════

describe('synthesizeSlideShape', () => {
  it('generates valid <p:sp> for a shape element', () => {
    const shape: ShapeElement = {
      id: 'shape-1',
      type: 'shape',
      shapeType: 'rectangle',
      x: 72,
      y: 72,
      width: 288,
      height: 144,
      rotation: 0,
      opacity: 1,
      index: '0',
      parentId: null,
      locked: false,
      fill: { type: 'solid', color: { r: 255, g: 0, b: 0 } },
      stroke: { color: { r: 0, g: 0, b: 0 }, width: 1 },
    };

    const xml = synthesizeSlideShape(shape, 2);

    // Structure
    expect(xml).toMatch(/^<p:sp>/);
    expect(xml).toMatch(/<\/p:sp>$/);

    // Non-visual properties
    expect(xml).toContain('<p:nvSpPr>');
    expect(xml).toContain('id="2"');
    expect(xml).toContain('name="Shape 2"');

    // Transform (72pt = 914400 EMU, 288pt = 3657600, 144pt = 1828800)
    expect(xml).toContain('<a:off x="914400" y="914400"/>');
    expect(xml).toContain('<a:ext cx="3657600" cy="1828800"/>');

    // Geometry
    expect(xml).toContain('<a:prstGeom prst="rect">');

    // Fill
    expect(xml).toContain('<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>');

    // Line
    expect(xml).toContain('<a:ln');
    expect(xml).toContain('w="12700"');

    // Text body (empty default)
    expect(xml).toContain('<a:txBody>');
    expect(xml).toContain('<a:endParaRPr lang="en-US"/>');
  });

  it('generates valid <p:sp> for a text element', () => {
    const text: TextElement = {
      id: 'text-1',
      type: 'text',
      x: 100,
      y: 100,
      width: 400,
      height: 200,
      rotation: 0,
      opacity: 1,
      index: '0',
      parentId: null,
      locked: false,
      paragraphs: [
        {
          runs: [
            {
              text: 'Title Text',
              fontFamily: 'Calibri',
              fontSize: 32,
              bold: true,
              color: { r: 0, g: 0, b: 0 },
              x: 0,
              y: 0,
              width: 200,
              height: 32,
            },
          ],
          align: 'center',
        },
      ],
    };

    const xml = synthesizeSlideShape(text, 5);
    expect(xml).toContain('id="5"');
    expect(xml).toContain('<a:t>Title Text</a:t>');
    expect(xml).toContain('sz="3200"');
    expect(xml).toContain('b="1"');
    expect(xml).toContain('<a:latin typeface="Calibri"/>');
    expect(xml).toContain('algn="ctr"');
  });

  it('maps shape types to OOXML preset geometry', () => {
    const makeShape = (shapeType: string): ShapeElement => ({
      id: 's',
      type: 'shape',
      shapeType,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      index: '0',
      parentId: null,
      locked: false,
      fill: null,
      stroke: null,
    });

    expect(synthesizeSlideShape(makeShape('rectangle'), 1)).toContain(
      'prst="rect"'
    );
    expect(synthesizeSlideShape(makeShape('ellipse'), 1)).toContain(
      'prst="ellipse"'
    );
    expect(synthesizeSlideShape(makeShape('triangle'), 1)).toContain(
      'prst="triangle"'
    );
    expect(synthesizeSlideShape(makeShape('diamond'), 1)).toContain(
      'prst="diamond"'
    );
    // Pass-through for OOXML native names
    expect(synthesizeSlideShape(makeShape('roundRect'), 1)).toContain(
      'prst="roundRect"'
    );
  });

  it('includes rotation in transform when non-zero', () => {
    const shape: ShapeElement = {
      id: 's',
      type: 'shape',
      shapeType: 'rectangle',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 45,
      opacity: 1,
      index: '0',
      parentId: null,
      locked: false,
      fill: null,
      stroke: null,
    };
    const xml = synthesizeSlideShape(shape, 1);
    expect(xml).toContain('rot="2700000"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Picture
// ═══════════════════════════════════════════════════════════════════════════

describe('synthesizeSlidePicture', () => {
  it('generates valid <p:pic> with blip reference', () => {
    const image: ImageElement = {
      id: 'img-1',
      type: 'image',
      x: 50,
      y: 50,
      width: 200,
      height: 150,
      rotation: 0,
      opacity: 1,
      index: '0',
      parentId: null,
      locked: false,
      imageRef: 'image1.png',
      mimeType: 'image/png',
      objectFit: 'fill',
    };

    const xml = synthesizeSlidePicture(image, 3, 'rId2');
    expect(xml).toMatch(/^<p:pic>/);
    expect(xml).toMatch(/<\/p:pic>$/);
    expect(xml).toContain('id="3"');
    expect(xml).toContain('name="Picture 3"');
    expect(xml).toContain('r:embed="rId2"');
    expect(xml).toContain('<a:stretch><a:fillRect/></a:stretch>');
    expect(xml).toContain('noChangeAspect="1"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group
// ═══════════════════════════════════════════════════════════════════════════

describe('synthesizeSlideGroup', () => {
  it('generates valid <p:grpSp> with children', () => {
    const group: GroupElement = {
      id: 'grp-1',
      type: 'group',
      x: 0,
      y: 0,
      width: 500,
      height: 400,
      rotation: 0,
      opacity: 1,
      index: '0',
      parentId: null,
      locked: false,
      childIds: ['c1', 'c2'],
    };

    const childXml = '<p:sp><!-- child 1 --></p:sp><p:sp><!-- child 2 --></p:sp>';
    const xml = synthesizeSlideGroup(group, 10, childXml);

    expect(xml).toMatch(/^<p:grpSp>/);
    expect(xml).toMatch(/<\/p:grpSp>$/);
    expect(xml).toContain('id="10"');
    expect(xml).toContain('name="Group 10"');
    expect(xml).toContain('<a:chOff');
    expect(xml).toContain('<a:chExt');
    expect(xml).toContain(childXml);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Top-level synthesizeShape dispatcher
// ═══════════════════════════════════════════════════════════════════════════

describe('synthesizeShape', () => {
  it('dispatches to synthesizeSlideShape', () => {
    const shape: ShapeElement = {
      id: 's',
      type: 'shape',
      shapeType: 'ellipse',
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      rotation: 0,
      opacity: 1,
      index: '0',
      parentId: null,
      locked: false,
      fill: { type: 'solid', color: { r: 0, g: 128, b: 0 } },
      stroke: null,
    };
    const xml = synthesizeShape(shape, 7);
    expect(xml).toContain('<p:sp>');
    expect(xml).toContain('prst="ellipse"');
    expect(xml).toContain('id="7"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════════════════════

describe('edge cases', () => {
  it('zero-sized element produces valid XML', () => {
    const xml = synthesizeTransform(0, 0, 0, 0);
    expect(xml).toContain('<a:off x="0" y="0"/>');
    expect(xml).toContain('<a:ext cx="0" cy="0"/>');
  });

  it('very large coordinate values', () => {
    // 10 inches = 720pt → 9144000 EMU
    const xml = synthesizeTransform(720, 720, 720, 720);
    expect(xml).toContain('x="9144000"');
  });

  it('fractional point values round to integer EMU', () => {
    const xml = synthesizeTransform(0.5, 0.5, 0.5, 0.5);
    // 0.5pt = 6350 EMU
    expect(xml).toContain('x="6350"');
    expect(xml).toContain('cx="6350"');
  });

  it('gradient with no stops → noFill', () => {
    const fill: Fill = { type: 'linear-gradient', stops: [] };
    expect(synthesizeFill(fill)).toBe('<a:noFill/>');
  });

  it('shape with no fill and no stroke', () => {
    const shape: ShapeElement = {
      id: 's',
      type: 'shape',
      shapeType: 'rectangle',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      index: '0',
      parentId: null,
      locked: false,
      fill: null,
      stroke: null,
    };
    const xml = synthesizeSlideShape(shape, 1);
    // Should still produce valid XML with empty text body
    expect(xml).toContain('<p:sp>');
    expect(xml).toContain('<a:txBody>');
    expect(xml).not.toContain('<a:solidFill>');
    expect(xml).not.toContain('<a:ln');
  });

  it('font family with special characters is escaped', () => {
    const paragraphs: Paragraph[] = [
      {
        runs: [
          {
            text: 'test',
            fontFamily: 'Font "Name" & Co',
            fontSize: 12,
            color: { r: 0, g: 0, b: 0 },
            x: 0,
            y: 0,
            width: 30,
            height: 12,
          },
        ],
      },
    ];
    const xml = synthesizeTextBody(paragraphs);
    expect(xml).toContain('Font &quot;Name&quot; &amp; Co');
  });
});
