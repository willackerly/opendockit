/**
 * XML Serializer — converts XmlElement trees back to XML strings.
 *
 * This is a utility for test assertions and diagnostic output,
 * not the primary save path (which uses DOMParser/XMLSerializer
 * on raw part XML).
 *
 * Features:
 * - Preserves element order (critical for OOXML)
 * - Preserves namespace prefixes
 * - Self-closing tags for elements with no children and no text
 * - Text content and attribute values are XML-escaped
 *
 * Limitations:
 * - Processing instructions are not preserved
 * - Comments are not preserved
 * - Namespace declarations are not reconstructed
 *   (they appear as regular attributes)
 */

import type { XmlElement } from './fast-parser.js';

/**
 * Serialize a fast-xml-parser {@link XmlElement} back to an XML string.
 *
 * @example
 * ```ts
 * const el = parseXml('<a:off x="457200" y="274638"/>');
 * serializeXmlElement(el); // '<a:off x="457200" y="274638"/>'
 * ```
 */
export function serializeXmlElement(el: XmlElement): string {
  return serializeElement(el);
}

function serializeElement(el: XmlElement): string {
  const name = el.name;
  const attrNames = el.attributeNames();
  const children = el.children;
  const textContent = el.text();

  // Build attribute string
  let attrs = '';
  for (const attrName of attrNames) {
    const val = el.attr(attrName);
    if (val !== undefined) {
      attrs += ` ${attrName}="${escapeXmlAttr(val)}"`;
    }
  }

  // Self-closing if no children and no text
  if (children.length === 0 && textContent === '') {
    return `<${name}${attrs}/>`;
  }

  // Build content
  let content = '';

  if (children.length > 0) {
    for (const child of children) {
      content += serializeElement(child);
    }
  }

  if (textContent !== '') {
    content += escapeXmlText(textContent);
  }

  return `<${name}${attrs}>${content}</${name}>`;
}

/** Escape special characters in XML text content. */
function escapeXmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escape special characters in XML attribute values. */
function escapeXmlAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
