import { describe, it, expect } from 'vitest';
import { parseXml } from '../../../xml/index.js';
import { parseRun, parseHyperlink } from '../run.js';
import { parseShapeTreeChildren } from '../group.js';
import type { ThemeIR, DrawingMLShapeIR } from '../../../ir/index.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const NS = [
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
].join(' ');

const NS_P = [
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
].join(' ');

const TEST_THEME: ThemeIR = {
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
    fillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
    lineStyles: [{}, {}, {}],
    effectStyles: [[], [], []],
    bgFillStyles: [{ type: 'none' }, { type: 'none' }, { type: 'none' }],
  },
};

// ---------------------------------------------------------------------------
// Tests: parseHyperlink
// ---------------------------------------------------------------------------

describe('parseHyperlink', () => {
  it('parses a:hlinkClick with r:id', () => {
    const el = parseXml(`<a:rPr ${NS}><a:hlinkClick r:id="rId2"/></a:rPr>`);
    const hyperlink = parseHyperlink(el);

    expect(hyperlink).toBeDefined();
    expect(hyperlink!.relationshipId).toBe('rId2');
  });

  it('parses a:hlinkClick with tooltip', () => {
    const el = parseXml(`<a:rPr ${NS}><a:hlinkClick r:id="rId3" tooltip="Visit website"/></a:rPr>`);
    const hyperlink = parseHyperlink(el);

    expect(hyperlink).toBeDefined();
    expect(hyperlink!.relationshipId).toBe('rId3');
    expect(hyperlink!.tooltip).toBe('Visit website');
  });

  it('parses a:hlinkClick with action', () => {
    const el = parseXml(
      `<a:rPr ${NS}><a:hlinkClick r:id="rId4" action="ppaction://hlinksldjump"/></a:rPr>`
    );
    const hyperlink = parseHyperlink(el);

    expect(hyperlink).toBeDefined();
    expect(hyperlink!.relationshipId).toBe('rId4');
    expect(hyperlink!.action).toBe('ppaction://hlinksldjump');
  });

  it('parses a:hlinkClick with action and no r:id', () => {
    const el = parseXml(
      `<a:rPr ${NS}><a:hlinkClick action="ppaction://hlinkshowjump?jump=firstslide"/></a:rPr>`
    );
    const hyperlink = parseHyperlink(el);

    expect(hyperlink).toBeDefined();
    expect(hyperlink!.relationshipId).toBeUndefined();
    expect(hyperlink!.action).toBe('ppaction://hlinkshowjump?jump=firstslide');
  });

  it('parses a:hlinkClick with all attributes', () => {
    const el = parseXml(
      `<a:rPr ${NS}><a:hlinkClick r:id="rId5" tooltip="Go to slide" action="ppaction://hlinksldjump"/></a:rPr>`
    );
    const hyperlink = parseHyperlink(el);

    expect(hyperlink).toBeDefined();
    expect(hyperlink!.relationshipId).toBe('rId5');
    expect(hyperlink!.tooltip).toBe('Go to slide');
    expect(hyperlink!.action).toBe('ppaction://hlinksldjump');
  });

  it('returns undefined when no a:hlinkClick is present', () => {
    const el = parseXml(`<a:rPr ${NS} b="1"/>`);
    const hyperlink = parseHyperlink(el);

    expect(hyperlink).toBeUndefined();
  });

  it('returns undefined when a:hlinkClick has no r:id and no action', () => {
    const el = parseXml(`<a:rPr ${NS}><a:hlinkClick/></a:rPr>`);
    const hyperlink = parseHyperlink(el);

    expect(hyperlink).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: parseRun with hyperlinks
// ---------------------------------------------------------------------------

describe('parseRun with hyperlinks', () => {
  it('parses a run with a:hlinkClick on a:rPr', () => {
    const el = parseXml(
      `<a:r ${NS}>
        <a:rPr lang="en-US"><a:hlinkClick r:id="rId2"/></a:rPr>
        <a:t>Click here</a:t>
      </a:r>`
    );
    const run = parseRun(el, TEST_THEME);

    expect(run.kind).toBe('run');
    expect(run.text).toBe('Click here');
    expect(run.hyperlink).toBeDefined();
    expect(run.hyperlink!.relationshipId).toBe('rId2');
  });

  it('parses a run without hyperlink (no a:hlinkClick)', () => {
    const el = parseXml(
      `<a:r ${NS}>
        <a:rPr lang="en-US" b="1"/>
        <a:t>No link</a:t>
      </a:r>`
    );
    const run = parseRun(el, TEST_THEME);

    expect(run.kind).toBe('run');
    expect(run.hyperlink).toBeUndefined();
  });

  it('preserves other character properties alongside hyperlink', () => {
    const el = parseXml(
      `<a:r ${NS}>
        <a:rPr lang="en-US" sz="2400" b="1"><a:hlinkClick r:id="rId3" tooltip="Help"/></a:rPr>
        <a:t>Bold link</a:t>
      </a:r>`
    );
    const run = parseRun(el, TEST_THEME);

    expect(run.properties.fontSize).toBe(2400);
    expect(run.properties.bold).toBe(true);
    expect(run.hyperlink).toBeDefined();
    expect(run.hyperlink!.relationshipId).toBe('rId3');
    expect(run.hyperlink!.tooltip).toBe('Help');
  });
});

// ---------------------------------------------------------------------------
// Tests: Shape-level hyperlinks
// ---------------------------------------------------------------------------

describe('Shape-level hyperlinks via parseShapeTreeChildren', () => {
  it('parses shape with a:hlinkClick on p:cNvPr', () => {
    const xml = parseXml(`
      <p:spTree ${NS_P}>
        <p:nvGrpSpPr>
          <p:cNvPr id="1" name=""/>
          <p:cNvGrpSpPr/>
          <p:nvPr/>
        </p:nvGrpSpPr>
        <p:grpSpPr/>
        <p:sp>
          <p:nvSpPr>
            <p:cNvPr id="3" name="Rectangle 1">
              <a:hlinkClick r:id="rId5" tooltip="Shape link"/>
            </p:cNvPr>
            <p:cNvSpPr/>
            <p:nvPr/>
          </p:nvSpPr>
          <p:spPr>
            <a:xfrm>
              <a:off x="100" y="200"/>
              <a:ext cx="300" cy="400"/>
            </a:xfrm>
          </p:spPr>
        </p:sp>
      </p:spTree>
    `);

    const elements = parseShapeTreeChildren(xml, TEST_THEME);
    expect(elements).toHaveLength(1);

    const shape = elements[0] as DrawingMLShapeIR;
    expect(shape.kind).toBe('shape');
    expect(shape.hyperlink).toBeDefined();
    expect(shape.hyperlink!.relationshipId).toBe('rId5');
    expect(shape.hyperlink!.tooltip).toBe('Shape link');
  });

  it('parses shape without hyperlink on p:cNvPr', () => {
    const xml = parseXml(`
      <p:spTree ${NS_P}>
        <p:nvGrpSpPr>
          <p:cNvPr id="1" name=""/>
          <p:cNvGrpSpPr/>
          <p:nvPr/>
        </p:nvGrpSpPr>
        <p:grpSpPr/>
        <p:sp>
          <p:nvSpPr>
            <p:cNvPr id="3" name="Rectangle 1"/>
            <p:cNvSpPr/>
            <p:nvPr/>
          </p:nvSpPr>
          <p:spPr>
            <a:xfrm>
              <a:off x="100" y="200"/>
              <a:ext cx="300" cy="400"/>
            </a:xfrm>
          </p:spPr>
        </p:sp>
      </p:spTree>
    `);

    const elements = parseShapeTreeChildren(xml, TEST_THEME);
    expect(elements).toHaveLength(1);

    const shape = elements[0] as DrawingMLShapeIR;
    expect(shape.kind).toBe('shape');
    expect(shape.hyperlink).toBeUndefined();
  });

  it('parses shape with action-only hyperlink on p:cNvPr', () => {
    const xml = parseXml(`
      <p:spTree ${NS_P}>
        <p:nvGrpSpPr>
          <p:cNvPr id="1" name=""/>
          <p:cNvGrpSpPr/>
          <p:nvPr/>
        </p:nvGrpSpPr>
        <p:grpSpPr/>
        <p:sp>
          <p:nvSpPr>
            <p:cNvPr id="3" name="Action Button">
              <a:hlinkClick action="ppaction://hlinkshowjump?jump=firstslide"/>
            </p:cNvPr>
            <p:cNvSpPr/>
            <p:nvPr/>
          </p:nvSpPr>
          <p:spPr>
            <a:xfrm>
              <a:off x="100" y="200"/>
              <a:ext cx="300" cy="400"/>
            </a:xfrm>
          </p:spPr>
        </p:sp>
      </p:spTree>
    `);

    const elements = parseShapeTreeChildren(xml, TEST_THEME);
    expect(elements).toHaveLength(1);

    const shape = elements[0] as DrawingMLShapeIR;
    expect(shape.kind).toBe('shape');
    expect(shape.hyperlink).toBeDefined();
    expect(shape.hyperlink!.action).toBe('ppaction://hlinkshowjump?jump=firstslide');
    expect(shape.hyperlink!.relationshipId).toBeUndefined();
  });
});
