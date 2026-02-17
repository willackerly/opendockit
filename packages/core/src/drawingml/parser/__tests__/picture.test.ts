import { describe, it, expect } from 'vitest';
import { parsePicture } from '../picture.js';
import { parseXml } from '../../../xml/index.js';
import type { ThemeIR } from '../../../ir/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Helper: minimal theme for picture parsing
// ═══════════════════════════════════════════════════════════════════════════

function minimalTheme(): ThemeIR {
  return {
    name: 'Test Theme',
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
    fontScheme: {
      majorLatin: 'Calibri Light',
      minorLatin: 'Calibri',
    },
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
}

// Namespace declarations reused across XML fragments
const NS = [
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
].join(' ');

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('parsePicture', () => {
  const theme = minimalTheme();

  // -----------------------------------------------------------------------
  // Basic picture with embed reference
  // -----------------------------------------------------------------------
  it('parses basic picture with embed reference', () => {
    const xml = parseXml(`
      <p:pic ${NS}>
        <p:nvPicPr>
          <p:cNvPr id="4" name="Picture 3"/>
          <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId2"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="0" y="0"/>
            <a:ext cx="9144000" cy="6858000"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>
    `);

    const pic = parsePicture(xml, theme);

    expect(pic.kind).toBe('picture');
    expect(pic.imagePartUri).toBe('rId2');
    expect(pic.nonVisualProperties.name).toBe('Picture 3');
    expect(pic.blipFill?.stretch).toBe(true);
    expect(pic.properties.geometry).toBeDefined();
    expect(pic.properties.geometry!.kind).toBe('preset');
    if (pic.properties.geometry!.kind === 'preset') {
      expect(pic.properties.geometry!.name).toBe('rect');
    }
  });

  // -----------------------------------------------------------------------
  // Picture with crop rect
  // -----------------------------------------------------------------------
  it('parses picture with crop rect', () => {
    const xml = parseXml(`
      <p:pic ${NS}>
        <p:nvPicPr>
          <p:cNvPr id="5" name="Cropped Image"/>
          <p:cNvPicPr/>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId3"/>
          <a:srcRect l="10000" t="20000" r="15000" b="25000"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="100" y="200"/>
            <a:ext cx="5000000" cy="3000000"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>
    `);

    const pic = parsePicture(xml, theme);

    expect(pic.blipFill?.crop).toBeDefined();
    expect(pic.blipFill!.crop!.left).toBeCloseTo(0.1);
    expect(pic.blipFill!.crop!.top).toBeCloseTo(0.2);
    expect(pic.blipFill!.crop!.right).toBeCloseTo(0.15);
    expect(pic.blipFill!.crop!.bottom).toBeCloseTo(0.25);
  });

  // -----------------------------------------------------------------------
  // Picture with stretch
  // -----------------------------------------------------------------------
  it('parses picture with stretch', () => {
    const xml = parseXml(`
      <p:pic ${NS}>
        <p:nvPicPr>
          <p:cNvPr id="6" name="Stretched"/>
          <p:cNvPicPr/>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId4"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="0" y="0"/>
            <a:ext cx="1000000" cy="1000000"/>
          </a:xfrm>
        </p:spPr>
      </p:pic>
    `);

    const pic = parsePicture(xml, theme);

    expect(pic.blipFill?.stretch).toBe(true);
    expect(pic.blipFill?.tile).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Picture with tile
  // -----------------------------------------------------------------------
  it('parses picture with tile', () => {
    const xml = parseXml(`
      <p:pic ${NS}>
        <p:nvPicPr>
          <p:cNvPr id="7" name="Tiled"/>
          <p:cNvPicPr/>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId5"/>
          <a:tile tx="914400" ty="457200" sx="50000" sy="75000" flip="xy" algn="ctr"/>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="0" y="0"/>
            <a:ext cx="5000000" cy="5000000"/>
          </a:xfrm>
        </p:spPr>
      </p:pic>
    `);

    const pic = parsePicture(xml, theme);

    expect(pic.blipFill?.stretch).toBeUndefined();
    expect(pic.blipFill?.tile).toBeDefined();
    expect(pic.blipFill!.tile!.offsetX).toBe(914400);
    expect(pic.blipFill!.tile!.offsetY).toBe(457200);
    expect(pic.blipFill!.tile!.scaleX).toBeCloseTo(0.5);
    expect(pic.blipFill!.tile!.scaleY).toBeCloseTo(0.75);
    expect(pic.blipFill!.tile!.flip).toBe('xy');
    expect(pic.blipFill!.tile!.alignment).toBe('ctr');
  });

  // -----------------------------------------------------------------------
  // Non-visual properties (name, description)
  // -----------------------------------------------------------------------
  it('parses non-visual properties with name and description', () => {
    const xml = parseXml(`
      <p:pic ${NS}>
        <p:nvPicPr>
          <p:cNvPr id="8" name="Company Logo" descr="Acme Corp logo in blue"/>
          <p:cNvPicPr/>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId6"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr/>
      </p:pic>
    `);

    const pic = parsePicture(xml, theme);

    expect(pic.nonVisualProperties.name).toBe('Company Logo');
    expect(pic.nonVisualProperties.description).toBe('Acme Corp logo in blue');
    expect(pic.nonVisualProperties.hidden).toBeUndefined();
  });

  it('parses hidden non-visual property', () => {
    const xml = parseXml(`
      <p:pic ${NS}>
        <p:nvPicPr>
          <p:cNvPr id="9" name="Hidden Pic" hidden="1"/>
          <p:cNvPicPr/>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId7"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr/>
      </p:pic>
    `);

    const pic = parsePicture(xml, theme);

    expect(pic.nonVisualProperties.name).toBe('Hidden Pic');
    expect(pic.nonVisualProperties.hidden).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Picture with transform (position, size)
  // -----------------------------------------------------------------------
  it('parses picture with transform position and size', () => {
    const xml = parseXml(`
      <p:pic ${NS}>
        <p:nvPicPr>
          <p:cNvPr id="10" name="Positioned"/>
          <p:cNvPicPr/>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId8"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="457200" y="274638"/>
            <a:ext cx="8229600" cy="1143000"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>
    `);

    const pic = parsePicture(xml, theme);

    expect(pic.properties.transform).toBeDefined();
    expect(pic.properties.transform!.position.x).toBe(457200);
    expect(pic.properties.transform!.position.y).toBe(274638);
    expect(pic.properties.transform!.size.width).toBe(8229600);
    expect(pic.properties.transform!.size.height).toBe(1143000);
  });

  // -----------------------------------------------------------------------
  // Picture with rotation
  // -----------------------------------------------------------------------
  it('parses picture with rotation', () => {
    const xml = parseXml(`
      <p:pic ${NS}>
        <p:nvPicPr>
          <p:cNvPr id="11" name="Rotated"/>
          <p:cNvPicPr/>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId9"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm rot="5400000">
            <a:off x="100000" y="200000"/>
            <a:ext cx="3000000" cy="2000000"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>
    `);

    const pic = parsePicture(xml, theme);

    expect(pic.properties.transform).toBeDefined();
    expect(pic.properties.transform!.rotation).toBeCloseTo(90);
  });

  it('parses picture with flips', () => {
    const xml = parseXml(`
      <p:pic ${NS}>
        <p:nvPicPr>
          <p:cNvPr id="12" name="Flipped"/>
          <p:cNvPicPr/>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId10"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm flipH="1" flipV="1">
            <a:off x="0" y="0"/>
            <a:ext cx="5000000" cy="3000000"/>
          </a:xfrm>
        </p:spPr>
      </p:pic>
    `);

    const pic = parsePicture(xml, theme);

    expect(pic.properties.transform!.flipH).toBe(true);
    expect(pic.properties.transform!.flipV).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Picture without crop
  // -----------------------------------------------------------------------
  it('parses picture without crop - no crop in IR', () => {
    const xml = parseXml(`
      <p:pic ${NS}>
        <p:nvPicPr>
          <p:cNvPr id="13" name="No Crop"/>
          <p:cNvPicPr/>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId11"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="0" y="0"/>
            <a:ext cx="4000000" cy="3000000"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>
    `);

    const pic = parsePicture(xml, theme);

    expect(pic.blipFill?.crop).toBeUndefined();
    expect(pic.blipFill?.stretch).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Picture with preset geometry adjust values
  // -----------------------------------------------------------------------
  it('parses preset geometry with adjust values', () => {
    const xml = parseXml(`
      <p:pic ${NS}>
        <p:nvPicPr>
          <p:cNvPr id="14" name="Rounded"/>
          <p:cNvPicPr/>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId12"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="0" y="0"/>
            <a:ext cx="4000000" cy="3000000"/>
          </a:xfrm>
          <a:prstGeom prst="roundRect">
            <a:avLst>
              <a:gd name="adj" fmla="val 16667"/>
            </a:avLst>
          </a:prstGeom>
        </p:spPr>
      </p:pic>
    `);

    const pic = parsePicture(xml, theme);

    expect(pic.properties.geometry).toBeDefined();
    expect(pic.properties.geometry!.kind).toBe('preset');
    if (pic.properties.geometry!.kind === 'preset') {
      expect(pic.properties.geometry!.name).toBe('roundRect');
      expect(pic.properties.geometry!.adjustValues).toBeDefined();
      expect(pic.properties.geometry!.adjustValues!['adj']).toBe(16667);
    }
  });

  // -----------------------------------------------------------------------
  // Minimal picture (missing optional elements)
  // -----------------------------------------------------------------------
  it('handles minimal picture with missing optional elements', () => {
    const xml = parseXml(`
      <p:pic ${NS}>
        <p:nvPicPr>
          <p:cNvPr id="15" name="Minimal"/>
          <p:cNvPicPr/>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId13"/>
        </p:blipFill>
        <p:spPr/>
      </p:pic>
    `);

    const pic = parsePicture(xml, theme);

    expect(pic.kind).toBe('picture');
    expect(pic.imagePartUri).toBe('rId13');
    expect(pic.nonVisualProperties.name).toBe('Minimal');
    expect(pic.nonVisualProperties.description).toBeUndefined();
    expect(pic.blipFill?.stretch).toBeUndefined();
    expect(pic.blipFill?.crop).toBeUndefined();
    expect(pic.blipFill?.tile).toBeUndefined();
    expect(pic.properties.transform).toBeUndefined();
    expect(pic.properties.geometry).toBeUndefined();
    expect(pic.properties.effects).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Crop values are 1/1000 percent, converted to 0-1 fractions
  // -----------------------------------------------------------------------
  it('converts crop values from 1/1000 percent to 0-1 fractions', () => {
    const xml = parseXml(`
      <p:pic ${NS}>
        <p:nvPicPr>
          <p:cNvPr id="16" name="Full Crop"/>
          <p:cNvPicPr/>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId14"/>
          <a:srcRect l="50000" t="25000" r="0" b="75000"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr/>
      </p:pic>
    `);

    const pic = parsePicture(xml, theme);

    expect(pic.blipFill!.crop!.left).toBeCloseTo(0.5);
    expect(pic.blipFill!.crop!.top).toBeCloseTo(0.25);
    expect(pic.blipFill!.crop!.right).toBeCloseTo(0);
    expect(pic.blipFill!.crop!.bottom).toBeCloseTo(0.75);
  });
});
