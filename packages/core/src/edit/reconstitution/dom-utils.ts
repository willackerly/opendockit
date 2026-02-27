/**
 * DOM utilities for XML parsing and element lookup.
 *
 * Uses @xmldom/xmldom for surgical XML patching. The reconstitution engine
 * operates on raw part XML strings (not fast-xml-parser output). DOMParser
 * and XMLSerializer preserve unknown namespaces and elements — which is the
 * whole point of this approach.
 */

import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const domParser = new DOMParser();
const xmlSerializer = new XMLSerializer();

/** Parse an XML string to a Document. */
export function parseXmlDom(xml: string): Document {
  return domParser.parseFromString(xml, 'application/xml');
}

/** Serialize a Document back to an XML string. */
export function serializeXmlDom(doc: Document): string {
  return xmlSerializer.serializeToString(doc);
}

/**
 * Find a shape element by its p:cNvPr id attribute.
 *
 * Searches for `<p:sp>`, `<p:pic>`, `<p:cxnSp>`, `<p:graphicFrame>`, `<p:grpSp>`
 * that contain a `<p:cNvPr>` child with matching id.
 *
 * Returns the shape container element (p:sp, p:pic, etc.), not the cNvPr.
 *
 * OOXML structure:
 * ```xml
 * <p:sp>           <!-- returned element -->
 *   <p:nvSpPr>
 *     <p:cNvPr id="2" name="Title 1"/>
 *   </p:nvSpPr>
 *   ...
 * </p:sp>
 * ```
 */
export function findShapeById(doc: Document, shapeId: string): Element | null {
  const allElements = doc.getElementsByTagName('*');
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    if (el.localName === 'cNvPr') {
      const idAttr = el.getAttribute('id');
      if (idAttr === shapeId) {
        // cNvPr -> nvSpPr/nvPicPr/nvCxnSpPr/etc -> sp/pic/cxnSp/etc
        const nvParent = el.parentNode;
        if (nvParent && nvParent.parentNode) {
          return nvParent.parentNode as Element;
        }
      }
    }
  }
  return null;
}

/**
 * Find the `<a:xfrm>` element inside a shape element.
 *
 * Looks inside `<p:spPr>`, `<p:grpSpPr>`, etc. for the DrawingML transform.
 */
export function findTransformElement(shapeEl: Element): Element | null {
  const allChildren = shapeEl.getElementsByTagName('*');
  for (let i = 0; i < allChildren.length; i++) {
    const el = allChildren[i];
    if (
      el.localName === 'xfrm' &&
      (el.prefix === 'a' ||
        (el.namespaceURI !== null &&
          el.namespaceURI.includes('drawingml')))
    ) {
      return el;
    }
  }
  return null;
}

/**
 * Find the `<a:txBody>` or `<p:txBody>` element inside a shape element.
 */
export function findTextBodyElement(shapeEl: Element): Element | null {
  const allChildren = shapeEl.getElementsByTagName('*');
  for (let i = 0; i < allChildren.length; i++) {
    const el = allChildren[i];
    if (
      el.localName === 'txBody' &&
      (el.prefix === 'a' || el.prefix === 'p')
    ) {
      return el;
    }
  }
  return null;
}
