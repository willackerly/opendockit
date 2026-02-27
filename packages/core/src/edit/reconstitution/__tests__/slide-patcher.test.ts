import { describe, it, expect } from 'vitest';
import { parseXmlDom, serializeXmlDom, findShapeById } from '../dom-utils.js';
import { removeShapeFromSlide } from '../slide-patcher.js';

/** Slide XML with multiple shapes of different types. */
const MULTI_SHAPE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title 1"/>
          <p:cNvSpPr/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="457200" y="274638"/>
            <a:ext cx="8229600" cy="1143000"/>
          </a:xfrm>
        </p:spPr>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Subtitle 2"/>
          <p:cNvSpPr/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="457200" y="1600200"/>
            <a:ext cx="8229600" cy="4525963"/>
          </a:xfrm>
        </p:spPr>
      </p:sp>
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="4" name="Picture 1"/>
          <p:cNvPicPr/>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId2"/>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="0" y="0"/>
            <a:ext cx="1000000" cy="1000000"/>
          </a:xfrm>
        </p:spPr>
      </p:pic>
      <p:cxnSp>
        <p:nvCxnSpPr>
          <p:cNvPr id="5" name="Connector 1"/>
          <p:cNvCxnSpPr/>
          <p:nvPr/>
        </p:nvCxnSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="100000" y="100000"/>
            <a:ext cx="500000" cy="500000"/>
          </a:xfrm>
        </p:spPr>
      </p:cxnSp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

describe('removeShapeFromSlide', () => {
  it('removes the correct <p:sp> node', () => {
    const doc = parseXmlDom(MULTI_SHAPE_XML);

    const result = removeShapeFromSlide(doc, '2');
    expect(result).toBe(true);

    // Shape with id=2 should be gone
    expect(findShapeById(doc, '2')).toBeNull();

    // Other shapes should remain
    expect(findShapeById(doc, '3')).not.toBeNull();
    expect(findShapeById(doc, '4')).not.toBeNull();
    expect(findShapeById(doc, '5')).not.toBeNull();
  });

  it('removes the second <p:sp> node', () => {
    const doc = parseXmlDom(MULTI_SHAPE_XML);

    const result = removeShapeFromSlide(doc, '3');
    expect(result).toBe(true);

    expect(findShapeById(doc, '3')).toBeNull();
    expect(findShapeById(doc, '2')).not.toBeNull();
  });

  it('returns false when shape is not found', () => {
    const doc = parseXmlDom(MULTI_SHAPE_XML);

    const result = removeShapeFromSlide(doc, '999');
    expect(result).toBe(false);

    // All shapes should remain
    expect(findShapeById(doc, '2')).not.toBeNull();
    expect(findShapeById(doc, '3')).not.toBeNull();
    expect(findShapeById(doc, '4')).not.toBeNull();
    expect(findShapeById(doc, '5')).not.toBeNull();
  });

  it('works with <p:pic> elements', () => {
    const doc = parseXmlDom(MULTI_SHAPE_XML);

    const result = removeShapeFromSlide(doc, '4');
    expect(result).toBe(true);

    expect(findShapeById(doc, '4')).toBeNull();
    // Other shapes should remain
    expect(findShapeById(doc, '2')).not.toBeNull();
    expect(findShapeById(doc, '3')).not.toBeNull();
    expect(findShapeById(doc, '5')).not.toBeNull();
  });

  it('works with <p:cxnSp> elements', () => {
    const doc = parseXmlDom(MULTI_SHAPE_XML);

    const result = removeShapeFromSlide(doc, '5');
    expect(result).toBe(true);

    expect(findShapeById(doc, '5')).toBeNull();
    expect(findShapeById(doc, '2')).not.toBeNull();
  });

  it('produces valid XML after removal', () => {
    const doc = parseXmlDom(MULTI_SHAPE_XML);

    removeShapeFromSlide(doc, '2');

    const serialized = serializeXmlDom(doc);
    // Should be parseable again
    const reparsed = parseXmlDom(serialized);
    expect(reparsed).toBeDefined();
    // Removed shape should not appear in serialized output
    expect(serialized).not.toContain('id="2"');
    expect(serialized).toContain('id="3"');
  });

  it('handles removing multiple shapes sequentially', () => {
    const doc = parseXmlDom(MULTI_SHAPE_XML);

    removeShapeFromSlide(doc, '2');
    removeShapeFromSlide(doc, '4');

    expect(findShapeById(doc, '2')).toBeNull();
    expect(findShapeById(doc, '4')).toBeNull();
    expect(findShapeById(doc, '3')).not.toBeNull();
    expect(findShapeById(doc, '5')).not.toBeNull();
  });
});
