import { describe, it, expect } from 'vitest';
import { parseXml } from '../../../xml/index.js';
import type { ThemeIR } from '../../../ir/index.js';
import { parseEffectList, parseEffectsFromParent } from '../effect.js';

// ---------------------------------------------------------------------------
// Minimal theme fixture for color resolution
// ---------------------------------------------------------------------------

const minimalTheme: ThemeIR = {
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
    name: 'Test',
    majorFont: { latin: 'Calibri Light', eastAsian: '', complexScript: '' },
    minorFont: { latin: 'Calibri', eastAsian: '', complexScript: '' },
  },
  formatScheme: {
    name: 'Test',
    fillStyles: [],
    lineStyles: [],
    effectStyles: [],
    bgFillStyles: [],
  },
};

// Helper to wrap XML in a namespace-qualified element
function effectLst(innerXml: string): string {
  return `<a:effectLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${innerXml}</a:effectLst>`;
}

// ---------------------------------------------------------------------------
// Outer shadow
// ---------------------------------------------------------------------------

describe('parseEffectList: outer shadow', () => {
  it('parses outer shadow with all attributes', () => {
    const xml = effectLst(`
      <a:outerShdw blurRad="50800" dist="38100" dir="5400000" algn="tl" rotWithShape="0">
        <a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr>
      </a:outerShdw>
    `);
    const el = parseXml(xml);
    const effects = parseEffectList(el, minimalTheme);

    expect(effects).toHaveLength(1);
    const shadow = effects[0];
    expect(shadow.type).toBe('outerShadow');
    if (shadow.type !== 'outerShadow') return;

    expect(shadow.blurRadius).toBe(50800);
    expect(shadow.distance).toBe(38100);
    expect(shadow.direction).toBeCloseTo(90);
    expect(shadow.alignment).toBe('tl');
    expect(shadow.color.r).toBe(0);
    expect(shadow.color.g).toBe(0);
    expect(shadow.color.b).toBe(0);
    expect(shadow.color.a).toBeCloseTo(0.4);
  });

  it('defaults missing attributes to 0', () => {
    const xml = effectLst(`
      <a:outerShdw>
        <a:srgbClr val="FF0000"/>
      </a:outerShdw>
    `);
    const el = parseXml(xml);
    const effects = parseEffectList(el, minimalTheme);

    expect(effects).toHaveLength(1);
    const shadow = effects[0];
    if (shadow.type !== 'outerShadow') return;

    expect(shadow.blurRadius).toBe(0);
    expect(shadow.distance).toBe(0);
    expect(shadow.direction).toBe(0);
    expect(shadow.alignment).toBeUndefined();
    expect(shadow.color.r).toBe(255);
    expect(shadow.color.g).toBe(0);
    expect(shadow.color.b).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Inner shadow
// ---------------------------------------------------------------------------

describe('parseEffectList: inner shadow', () => {
  it('parses inner shadow', () => {
    const xml = effectLst(`
      <a:innerShdw blurRad="63500" dist="50800" dir="2700000">
        <a:srgbClr val="000000"><a:alpha val="50000"/></a:srgbClr>
      </a:innerShdw>
    `);
    const el = parseXml(xml);
    const effects = parseEffectList(el, minimalTheme);

    expect(effects).toHaveLength(1);
    const shadow = effects[0];
    expect(shadow.type).toBe('innerShadow');
    if (shadow.type !== 'innerShadow') return;

    expect(shadow.blurRadius).toBe(63500);
    expect(shadow.distance).toBe(50800);
    expect(shadow.direction).toBeCloseTo(45);
    expect(shadow.color.r).toBe(0);
    expect(shadow.color.g).toBe(0);
    expect(shadow.color.b).toBe(0);
    expect(shadow.color.a).toBeCloseTo(0.5);
  });
});

// ---------------------------------------------------------------------------
// Glow
// ---------------------------------------------------------------------------

describe('parseEffectList: glow', () => {
  it('parses glow with scheme color', () => {
    const xml = effectLst(`
      <a:glow rad="63500">
        <a:schemeClr val="accent1"><a:alpha val="40000"/></a:schemeClr>
      </a:glow>
    `);
    const el = parseXml(xml);
    const effects = parseEffectList(el, minimalTheme);

    expect(effects).toHaveLength(1);
    const glow = effects[0];
    expect(glow.type).toBe('glow');
    if (glow.type !== 'glow') return;

    expect(glow.radius).toBe(63500);
    // accent1 is (68, 114, 196) with alpha 0.4
    expect(glow.color.r).toBe(68);
    expect(glow.color.g).toBe(114);
    expect(glow.color.b).toBe(196);
    expect(glow.color.a).toBeCloseTo(0.4);
  });

  it('parses glow with srgb color', () => {
    const xml = effectLst(`
      <a:glow rad="101600">
        <a:srgbClr val="FF6600"/>
      </a:glow>
    `);
    const el = parseXml(xml);
    const effects = parseEffectList(el, minimalTheme);

    expect(effects).toHaveLength(1);
    const glow = effects[0];
    if (glow.type !== 'glow') return;

    expect(glow.radius).toBe(101600);
    expect(glow.color.r).toBe(255);
    expect(glow.color.g).toBe(102);
    expect(glow.color.b).toBe(0);
    expect(glow.color.a).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Reflection
// ---------------------------------------------------------------------------

describe('parseEffectList: reflection', () => {
  it('parses reflection', () => {
    const xml = effectLst(`
      <a:reflection blurRad="6350" stA="50000" endA="300" endPos="55000" dist="50800" dir="5400000" fadeDir="5400000"/>
    `);
    const el = parseXml(xml);
    const effects = parseEffectList(el, minimalTheme);

    expect(effects).toHaveLength(1);
    const refl = effects[0];
    expect(refl.type).toBe('reflection');
    if (refl.type !== 'reflection') return;

    expect(refl.blurRadius).toBe(6350);
    expect(refl.startOpacity).toBeCloseTo(0.5);
    expect(refl.endOpacity).toBeCloseTo(0.003);
    expect(refl.distance).toBe(50800);
    expect(refl.direction).toBeCloseTo(90);
    expect(refl.fadeDirection).toBeCloseTo(90);
  });

  it('defaults reflection opacity to full range when absent', () => {
    const xml = effectLst(`
      <a:reflection dist="12700" dir="5400000" fadeDir="5400000"/>
    `);
    const el = parseXml(xml);
    const effects = parseEffectList(el, minimalTheme);

    expect(effects).toHaveLength(1);
    const refl = effects[0];
    if (refl.type !== 'reflection') return;

    expect(refl.startOpacity).toBeCloseTo(1.0);
    expect(refl.endOpacity).toBeCloseTo(0.0);
  });
});

// ---------------------------------------------------------------------------
// Soft edge
// ---------------------------------------------------------------------------

describe('parseEffectList: soft edge', () => {
  it('parses soft edge', () => {
    const xml = effectLst(`
      <a:softEdge rad="63500"/>
    `);
    const el = parseXml(xml);
    const effects = parseEffectList(el, minimalTheme);

    expect(effects).toHaveLength(1);
    const softEdge = effects[0];
    expect(softEdge.type).toBe('softEdge');
    if (softEdge.type !== 'softEdge') return;

    expect(softEdge.radius).toBe(63500);
  });
});

// ---------------------------------------------------------------------------
// Multiple effects
// ---------------------------------------------------------------------------

describe('parseEffectList: multiple effects', () => {
  it('parses effect list with multiple effects', () => {
    const xml = effectLst(`
      <a:outerShdw blurRad="50800" dist="38100" dir="5400000">
        <a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr>
      </a:outerShdw>
      <a:glow rad="63500">
        <a:srgbClr val="4472C4"/>
      </a:glow>
      <a:softEdge rad="25400"/>
    `);
    const el = parseXml(xml);
    const effects = parseEffectList(el, minimalTheme);

    expect(effects).toHaveLength(3);
    expect(effects[0].type).toBe('outerShadow');
    expect(effects[1].type).toBe('glow');
    expect(effects[2].type).toBe('softEdge');
  });
});

// ---------------------------------------------------------------------------
// Empty / missing effect list
// ---------------------------------------------------------------------------

describe('parseEffectList: empty', () => {
  it('returns empty array for empty effect list', () => {
    const xml = effectLst('');
    const el = parseXml(xml);
    const effects = parseEffectList(el, minimalTheme);
    expect(effects).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseEffectsFromParent
// ---------------------------------------------------------------------------

describe('parseEffectsFromParent', () => {
  it('returns empty array when no effectLst is present', () => {
    const xml = `<a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>`;
    const el = parseXml(xml);
    const effects = parseEffectsFromParent(el, minimalTheme);
    expect(effects).toEqual([]);
  });

  it('parses effects from parent element', () => {
    const xml = `
      <a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:effectLst>
          <a:outerShdw blurRad="50800" dist="38100" dir="5400000">
            <a:srgbClr val="000000"/>
          </a:outerShdw>
        </a:effectLst>
      </a:spPr>
    `;
    const el = parseXml(xml);
    const effects = parseEffectsFromParent(el, minimalTheme);

    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('outerShadow');
  });
});

// ---------------------------------------------------------------------------
// Color transforms on shadow color
// ---------------------------------------------------------------------------

describe('parseEffectList: color transforms', () => {
  it('applies alpha transform to shadow color', () => {
    const xml = effectLst(`
      <a:outerShdw blurRad="50800" dist="38100" dir="5400000">
        <a:srgbClr val="000000">
          <a:alpha val="75000"/>
        </a:srgbClr>
      </a:outerShdw>
    `);
    const el = parseXml(xml);
    const effects = parseEffectList(el, minimalTheme);

    expect(effects).toHaveLength(1);
    const shadow = effects[0];
    if (shadow.type !== 'outerShadow') return;

    expect(shadow.color.a).toBeCloseTo(0.75);
  });

  it('resolves scheme color with transforms for glow', () => {
    const xml = effectLst(`
      <a:glow rad="63500">
        <a:schemeClr val="accent1">
          <a:alpha val="60000"/>
        </a:schemeClr>
      </a:glow>
    `);
    const el = parseXml(xml);
    const effects = parseEffectList(el, minimalTheme);

    expect(effects).toHaveLength(1);
    const glow = effects[0];
    if (glow.type !== 'glow') return;

    expect(glow.color.r).toBe(68);
    expect(glow.color.g).toBe(114);
    expect(glow.color.b).toBe(196);
    expect(glow.color.a).toBeCloseTo(0.6);
  });
});
