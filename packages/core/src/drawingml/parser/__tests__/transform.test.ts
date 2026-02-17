import { describe, it, expect } from 'vitest';
import { parseXml } from '../../../xml/index.js';
import { parseTransform, parseTransformFromParent, parseGroupTransform } from '../transform.js';

// Helper to wrap XML in namespace
function xfrm(attrs: string, innerXml: string): string {
  return `<a:xfrm xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ${attrs}>${innerXml}</a:xfrm>`;
}

// ---------------------------------------------------------------------------
// parseTransform
// ---------------------------------------------------------------------------

describe('parseTransform', () => {
  it('parses basic transform with position and size', () => {
    const xml = xfrm(
      '',
      `
      <a:off x="457200" y="274638"/>
      <a:ext cx="8229600" cy="1143000"/>
    `
    );
    const el = parseXml(xml);
    const result = parseTransform(el);

    expect(result.position.x).toBe(457200);
    expect(result.position.y).toBe(274638);
    expect(result.size.width).toBe(8229600);
    expect(result.size.height).toBe(1143000);
    expect(result.rotation).toBeUndefined();
    expect(result.flipH).toBeUndefined();
    expect(result.flipV).toBeUndefined();
  });

  it('parses transform with rotation', () => {
    const xml = xfrm(
      'rot="5400000"',
      `
      <a:off x="0" y="0"/>
      <a:ext cx="1000000" cy="500000"/>
    `
    );
    const el = parseXml(xml);
    const result = parseTransform(el);

    expect(result.rotation).toBeCloseTo(90);
  });

  it('parses transform with flipH', () => {
    const xml = xfrm(
      'flipH="1"',
      `
      <a:off x="0" y="0"/>
      <a:ext cx="1000000" cy="500000"/>
    `
    );
    const el = parseXml(xml);
    const result = parseTransform(el);

    expect(result.flipH).toBe(true);
    expect(result.flipV).toBeUndefined();
  });

  it('parses transform with flipV', () => {
    const xml = xfrm(
      'flipV="1"',
      `
      <a:off x="0" y="0"/>
      <a:ext cx="1000000" cy="500000"/>
    `
    );
    const el = parseXml(xml);
    const result = parseTransform(el);

    expect(result.flipH).toBeUndefined();
    expect(result.flipV).toBe(true);
  });

  it('parses transform with all attributes', () => {
    const xml = xfrm(
      'rot="5400000" flipH="1" flipV="1"',
      `
      <a:off x="457200" y="274638"/>
      <a:ext cx="8229600" cy="1143000"/>
    `
    );
    const el = parseXml(xml);
    const result = parseTransform(el);

    expect(result.position.x).toBe(457200);
    expect(result.position.y).toBe(274638);
    expect(result.size.width).toBe(8229600);
    expect(result.size.height).toBe(1143000);
    expect(result.rotation).toBeCloseTo(90);
    expect(result.flipH).toBe(true);
    expect(result.flipV).toBe(true);
  });

  it('defaults position and size to 0 when children are missing', () => {
    const xml = `<a:xfrm xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>`;
    const el = parseXml(xml);
    const result = parseTransform(el);

    expect(result.position.x).toBe(0);
    expect(result.position.y).toBe(0);
    expect(result.size.width).toBe(0);
    expect(result.size.height).toBe(0);
  });

  it('preserves EMU values without conversion', () => {
    // 914400 EMU = 1 inch = 96 pixels at 96 DPI
    const xml = xfrm(
      '',
      `
      <a:off x="914400" y="914400"/>
      <a:ext cx="914400" cy="914400"/>
    `
    );
    const el = parseXml(xml);
    const result = parseTransform(el);

    expect(result.position.x).toBe(914400);
    expect(result.position.y).toBe(914400);
    expect(result.size.width).toBe(914400);
    expect(result.size.height).toBe(914400);
  });

  it('does not set flipH/flipV when explicitly false', () => {
    const xml = xfrm(
      'flipH="0" flipV="0"',
      `
      <a:off x="0" y="0"/>
      <a:ext cx="100" cy="100"/>
    `
    );
    const el = parseXml(xml);
    const result = parseTransform(el);

    // flipH=false should not appear in the result (we only set when true)
    expect(result.flipH).toBeUndefined();
    expect(result.flipV).toBeUndefined();
  });

  it('handles 45-degree rotation', () => {
    const xml = xfrm(
      'rot="2700000"',
      `
      <a:off x="0" y="0"/>
      <a:ext cx="100" cy="100"/>
    `
    );
    const el = parseXml(xml);
    const result = parseTransform(el);

    expect(result.rotation).toBeCloseTo(45);
  });

  it('handles 360-degree rotation', () => {
    const xml = xfrm(
      'rot="21600000"',
      `
      <a:off x="0" y="0"/>
      <a:ext cx="100" cy="100"/>
    `
    );
    const el = parseXml(xml);
    const result = parseTransform(el);

    expect(result.rotation).toBeCloseTo(360);
  });
});

// ---------------------------------------------------------------------------
// parseTransformFromParent
// ---------------------------------------------------------------------------

describe('parseTransformFromParent', () => {
  it('returns undefined when no xfrm is present', () => {
    const xml = `<a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>`;
    const el = parseXml(xml);
    const result = parseTransformFromParent(el);
    expect(result).toBeUndefined();
  });

  it('parses transform from parent element', () => {
    const xml = `
      <a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:xfrm rot="5400000">
          <a:off x="100" y="200"/>
          <a:ext cx="300" cy="400"/>
        </a:xfrm>
      </a:spPr>
    `;
    const el = parseXml(xml);
    const result = parseTransformFromParent(el);

    expect(result).toBeDefined();
    expect(result!.position.x).toBe(100);
    expect(result!.position.y).toBe(200);
    expect(result!.size.width).toBe(300);
    expect(result!.size.height).toBe(400);
    expect(result!.rotation).toBeCloseTo(90);
  });
});

// ---------------------------------------------------------------------------
// parseGroupTransform
// ---------------------------------------------------------------------------

describe('parseGroupTransform', () => {
  it('parses group transform with child offset and extent', () => {
    const xml = xfrm(
      '',
      `
      <a:off x="0" y="0"/>
      <a:ext cx="9144000" cy="6858000"/>
      <a:chOff x="100" y="200"/>
      <a:chExt cx="9144000" cy="6858000"/>
    `
    );
    const el = parseXml(xml);
    const result = parseGroupTransform(el);

    expect(result).toBeDefined();
    expect(result!.transform.position.x).toBe(0);
    expect(result!.transform.position.y).toBe(0);
    expect(result!.transform.size.width).toBe(9144000);
    expect(result!.transform.size.height).toBe(6858000);
    expect(result!.childOffset).toEqual({ x: 100, y: 200 });
    expect(result!.childExtent).toEqual({ width: 9144000, height: 6858000 });
  });

  it('handles group transform without child offset/extent', () => {
    const xml = xfrm(
      '',
      `
      <a:off x="457200" y="274638"/>
      <a:ext cx="8229600" cy="1143000"/>
    `
    );
    const el = parseXml(xml);
    const result = parseGroupTransform(el);

    expect(result).toBeDefined();
    expect(result!.transform.position.x).toBe(457200);
    expect(result!.transform.position.y).toBe(274638);
    expect(result!.childOffset).toBeUndefined();
    expect(result!.childExtent).toBeUndefined();
  });

  it('parses group transform with rotation and child coords', () => {
    const xml = xfrm(
      'rot="10800000"',
      `
      <a:off x="0" y="0"/>
      <a:ext cx="5000000" cy="3000000"/>
      <a:chOff x="0" y="0"/>
      <a:chExt cx="10000000" cy="6000000"/>
    `
    );
    const el = parseXml(xml);
    const result = parseGroupTransform(el);

    expect(result).toBeDefined();
    expect(result!.transform.rotation).toBeCloseTo(180);
    expect(result!.childOffset).toEqual({ x: 0, y: 0 });
    expect(result!.childExtent).toEqual({ width: 10000000, height: 6000000 });
  });
});
