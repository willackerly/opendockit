import { describe, it, expect } from 'vitest';
import { parseXmlDom, findShapeById, findTransformElement } from '../dom-utils.js';
import { patchTransform } from '../transform-patcher.js';
import type { EditableTransform, DirtyFlags } from '../../editable-types.js';

/** Minimal slide XML with a single shape containing a transform. */
const SLIDE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
    </p:spTree>
  </p:cSld>
</p:sld>`;

/** Slide XML with a rotated shape. */
const ROTATED_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Shape 1"/>
          <p:cNvSpPr/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm rot="5400000">
            <a:off x="100000" y="200000"/>
            <a:ext cx="300000" cy="400000"/>
          </a:xfrm>
        </p:spPr>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

describe('patchTransform', () => {
  it('updates position (x, y) when position is dirty', () => {
    const doc = parseXmlDom(SLIDE_XML);
    const shape = findShapeById(doc, '2')!;
    expect(shape).not.toBeNull();

    const transform: EditableTransform = {
      x: 500000,
      y: 300000,
      width: 8229600,
      height: 1143000,
    };
    const dirty: DirtyFlags = { position: true };

    patchTransform(shape, transform, dirty);

    const xfrm = findTransformElement(shape)!;
    const off = xfrm.getElementsByTagName('*');
    let offEl: Element | null = null;
    for (let i = 0; i < off.length; i++) {
      if (off[i].localName === 'off') {
        offEl = off[i];
        break;
      }
    }
    expect(offEl!.getAttribute('x')).toBe('500000');
    expect(offEl!.getAttribute('y')).toBe('300000');
  });

  it('updates size (cx, cy) when size is dirty', () => {
    const doc = parseXmlDom(SLIDE_XML);
    const shape = findShapeById(doc, '2')!;

    const transform: EditableTransform = {
      x: 457200,
      y: 274638,
      width: 9000000,
      height: 2000000,
    };
    const dirty: DirtyFlags = { size: true };

    patchTransform(shape, transform, dirty);

    const xfrm = findTransformElement(shape)!;
    const allEls = xfrm.getElementsByTagName('*');
    let extEl: Element | null = null;
    for (let i = 0; i < allEls.length; i++) {
      if (allEls[i].localName === 'ext') {
        extEl = allEls[i];
        break;
      }
    }
    expect(extEl!.getAttribute('cx')).toBe('9000000');
    expect(extEl!.getAttribute('cy')).toBe('2000000');
  });

  it('does not modify position when only size is dirty', () => {
    const doc = parseXmlDom(SLIDE_XML);
    const shape = findShapeById(doc, '2')!;

    const transform: EditableTransform = {
      x: 999999,
      y: 888888,
      width: 5000000,
      height: 3000000,
    };
    const dirty: DirtyFlags = { size: true };

    patchTransform(shape, transform, dirty);

    const xfrm = findTransformElement(shape)!;
    const allEls = xfrm.getElementsByTagName('*');
    let offEl: Element | null = null;
    for (let i = 0; i < allEls.length; i++) {
      if (allEls[i].localName === 'off') {
        offEl = allEls[i];
        break;
      }
    }
    // Position should remain unchanged
    expect(offEl!.getAttribute('x')).toBe('457200');
    expect(offEl!.getAttribute('y')).toBe('274638');
  });

  it('does not modify size when only position is dirty', () => {
    const doc = parseXmlDom(SLIDE_XML);
    const shape = findShapeById(doc, '2')!;

    const transform: EditableTransform = {
      x: 100000,
      y: 200000,
      width: 999999,
      height: 888888,
    };
    const dirty: DirtyFlags = { position: true };

    patchTransform(shape, transform, dirty);

    const xfrm = findTransformElement(shape)!;
    const allEls = xfrm.getElementsByTagName('*');
    let extEl: Element | null = null;
    for (let i = 0; i < allEls.length; i++) {
      if (allEls[i].localName === 'ext') {
        extEl = allEls[i];
        break;
      }
    }
    // Size should remain unchanged
    expect(extEl!.getAttribute('cx')).toBe('8229600');
    expect(extEl!.getAttribute('cy')).toBe('1143000');
  });

  it('writes integer values (no decimals)', () => {
    const doc = parseXmlDom(SLIDE_XML);
    const shape = findShapeById(doc, '2')!;

    const transform: EditableTransform = {
      x: 123456,
      y: 789012,
      width: 8229600,
      height: 1143000,
    };
    const dirty: DirtyFlags = { position: true };

    patchTransform(shape, transform, dirty);

    const xfrm = findTransformElement(shape)!;
    const allEls = xfrm.getElementsByTagName('*');
    let offEl: Element | null = null;
    for (let i = 0; i < allEls.length; i++) {
      if (allEls[i].localName === 'off') {
        offEl = allEls[i];
        break;
      }
    }
    // Values should be plain integers
    expect(offEl!.getAttribute('x')).toBe('123456');
    expect(offEl!.getAttribute('y')).toBe('789012');
    expect(offEl!.getAttribute('x')).not.toContain('.');
    expect(offEl!.getAttribute('y')).not.toContain('.');
  });

  it('sets rotation attribute when rotation is dirty and non-zero', () => {
    const doc = parseXmlDom(SLIDE_XML);
    const shape = findShapeById(doc, '2')!;

    const transform: EditableTransform = {
      x: 457200,
      y: 274638,
      width: 8229600,
      height: 1143000,
      rotation: 45,
    };
    const dirty: DirtyFlags = { rotation: true };

    patchTransform(shape, transform, dirty);

    const xfrm = findTransformElement(shape)!;
    // 45 degrees * 60000 = 2700000
    expect(xfrm.getAttribute('rot')).toBe('2700000');
  });

  it('removes rotation attribute when rotation is zero', () => {
    const doc = parseXmlDom(ROTATED_XML);
    const shape = findShapeById(doc, '3')!;

    const xfrm = findTransformElement(shape)!;
    expect(xfrm.getAttribute('rot')).toBe('5400000');

    const transform: EditableTransform = {
      x: 100000,
      y: 200000,
      width: 300000,
      height: 400000,
      rotation: 0,
    };
    const dirty: DirtyFlags = { rotation: true };

    patchTransform(shape, transform, dirty);

    // xmldom returns '' for missing attributes; browser DOM returns null
    expect(xfrm.hasAttribute('rot')).toBe(false);
  });

  it('does nothing when dirty flags are all false', () => {
    const doc = parseXmlDom(SLIDE_XML);
    const shape = findShapeById(doc, '2')!;

    const transform: EditableTransform = {
      x: 999999,
      y: 999999,
      width: 999999,
      height: 999999,
      rotation: 90,
    };
    const dirty: DirtyFlags = {};

    patchTransform(shape, transform, dirty);

    const xfrm = findTransformElement(shape)!;
    const allEls = xfrm.getElementsByTagName('*');
    let offEl: Element | null = null;
    let extEl: Element | null = null;
    for (let i = 0; i < allEls.length; i++) {
      if (allEls[i].localName === 'off') offEl = allEls[i];
      if (allEls[i].localName === 'ext') extEl = allEls[i];
    }

    // Everything should remain unchanged
    expect(offEl!.getAttribute('x')).toBe('457200');
    expect(offEl!.getAttribute('y')).toBe('274638');
    expect(extEl!.getAttribute('cx')).toBe('8229600');
    expect(extEl!.getAttribute('cy')).toBe('1143000');
    // xmldom returns '' for missing attributes; browser DOM returns null
    expect(xfrm.hasAttribute('rot')).toBe(false);
  });

  it('updates both position and size when both are dirty', () => {
    const doc = parseXmlDom(SLIDE_XML);
    const shape = findShapeById(doc, '2')!;

    const transform: EditableTransform = {
      x: 100000,
      y: 200000,
      width: 5000000,
      height: 3000000,
    };
    const dirty: DirtyFlags = { position: true, size: true };

    patchTransform(shape, transform, dirty);

    const xfrm = findTransformElement(shape)!;
    const allEls = xfrm.getElementsByTagName('*');
    let offEl: Element | null = null;
    let extEl: Element | null = null;
    for (let i = 0; i < allEls.length; i++) {
      if (allEls[i].localName === 'off') offEl = allEls[i];
      if (allEls[i].localName === 'ext') extEl = allEls[i];
    }

    expect(offEl!.getAttribute('x')).toBe('100000');
    expect(offEl!.getAttribute('y')).toBe('200000');
    expect(extEl!.getAttribute('cx')).toBe('5000000');
    expect(extEl!.getAttribute('cy')).toBe('3000000');
  });
});
