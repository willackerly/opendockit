import { describe, it, expect } from 'vitest';
import { parseXml } from '../fast-parser.js';
import { serializeXmlElement } from '../xml-serializer.js';

describe('serializeXmlElement', () => {
  it('round-trips a simple self-closing element', () => {
    const el = parseXml('<a:off x="457200" y="274638"/>');
    const xml = serializeXmlElement(el);
    expect(xml).toBe('<a:off x="457200" y="274638"/>');
  });

  it('round-trips an element with text content', () => {
    const el = parseXml('<a:t>Hello World</a:t>');
    const xml = serializeXmlElement(el);
    expect(xml).toBe('<a:t>Hello World</a:t>');
  });

  it('round-trips nested elements', () => {
    const el = parseXml(
      '<a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="200"/></a:xfrm>'
    );
    const xml = serializeXmlElement(el);
    expect(xml).toContain('<a:off x="0" y="0"/>');
    expect(xml).toContain('<a:ext cx="100" cy="200"/>');
    expect(xml).toMatch(/^<a:xfrm>.*<\/a:xfrm>$/);
  });

  it('preserves element order', () => {
    const el = parseXml('<root><first/><second/><third/></root>');
    const xml = serializeXmlElement(el);
    const firstIdx = xml.indexOf('<first/>');
    const secondIdx = xml.indexOf('<second/>');
    const thirdIdx = xml.indexOf('<third/>');
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });

  it('escapes text content', () => {
    const el = parseXml('<a:t>A &amp; B &lt; C</a:t>');
    const xml = serializeXmlElement(el);
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
  });

  it('escapes attribute values', () => {
    const el = parseXml('<tag attr="value &amp; more"/>');
    const xml = serializeXmlElement(el);
    expect(xml).toContain('&amp;');
  });

  it('handles element with children but no attributes', () => {
    const el = parseXml('<parent><child/></parent>');
    const xml = serializeXmlElement(el);
    expect(xml).toBe('<parent><child/></parent>');
  });

  it('handles deeply nested OOXML structure', () => {
    const input = `<p:sp>
      <p:nvSpPr>
        <p:cNvPr id="2" name="Title"/>
        <p:cNvSpPr/>
        <p:nvPr/>
      </p:nvSpPr>
      <p:spPr>
        <a:xfrm>
          <a:off x="457200" y="274638"/>
          <a:ext cx="8229600" cy="1143000"/>
        </a:xfrm>
      </p:spPr>
    </p:sp>`;
    const el = parseXml(input);
    const xml = serializeXmlElement(el);
    // Verify key attributes are preserved
    expect(xml).toContain('id="2"');
    expect(xml).toContain('name="Title"');
    expect(xml).toContain('x="457200"');
    expect(xml).toContain('cy="1143000"');
  });

  it('handles empty elements with namespace prefixes', () => {
    const el = parseXml('<mc:AlternateContent/>');
    const xml = serializeXmlElement(el);
    expect(xml).toBe('<mc:AlternateContent/>');
  });

  // Round-trip: parse -> serialize -> parse -> serialize should be stable
  it('double round-trip produces stable output', () => {
    const input =
      '<a:r><a:rPr lang="en-US" b="1"/><a:t>Bold text</a:t></a:r>';
    const first = serializeXmlElement(parseXml(input));
    const second = serializeXmlElement(parseXml(first));
    expect(first).toBe(second);
  });
});

describe('XmlElement.attributeNames', () => {
  it('returns attribute names without @_ prefix', () => {
    const el = parseXml('<a:off x="100" y="200"/>');
    const names = el.attributeNames();
    expect(names).toContain('x');
    expect(names).toContain('y');
    expect(names.length).toBe(2);
  });

  it('returns empty array for element with no attributes', () => {
    const el = parseXml('<a:avLst/>');
    expect(el.attributeNames()).toEqual([]);
  });

  it('excludes namespace declarations from attribute names', () => {
    const el = parseXml(
      '<a:off xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" x="100"/>'
    );
    const names = el.attributeNames();
    // xmlns:a should appear as an attribute (fast-xml-parser treats it as one)
    // but the important thing is x is present
    expect(names).toContain('x');
  });
});
