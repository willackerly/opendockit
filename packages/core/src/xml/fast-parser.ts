/**
 * Core XML parsing and navigation API.
 *
 * Wraps fast-xml-parser's `preserveOrder` output in an ergonomic
 * {@link XmlElement} interface. Every OOXML parser module depends on this.
 *
 * Design rationale:
 * - `preserveOrder: true` is critical because OOXML element order is
 *   semantically meaningful (gradient stops, shape tree z-order, etc.).
 * - Namespace prefixes are preserved so callers use familiar names like
 *   `'a:solidFill'` rather than Clark notation.
 * - The `XmlElement` interface is the public API. The implementing class
 *   (`XmlElementImpl`) is private — consumers never construct it directly.
 */

import { XMLParser } from 'fast-xml-parser';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Ergonomic read-only wrapper around a parsed XML element. */
export interface XmlElement {
  /** Tag name including namespace prefix, e.g. `'a:solidFill'`. */
  readonly name: string;

  /** Get attribute value by name. Returns `undefined` if not present. */
  attr(name: string): string | undefined;

  /** Get first child element matching the given tag name. Returns `undefined` if not found. */
  child(tagName: string): XmlElement | undefined;

  /** All direct child elements (excludes text nodes). */
  readonly children: XmlElement[];

  /** All child elements matching the given tag name. */
  allChildren(tagName: string): XmlElement[];

  /** Text content of this element. Returns empty string if no text. */
  text(): string;

  /** Check if this element has the given tag name. */
  is(tagName: string): boolean;
}

// ---------------------------------------------------------------------------
// Parser configuration
// ---------------------------------------------------------------------------

/**
 * Shared fast-xml-parser instance. `preserveOrder: true` changes the output
 * format to an *ordered array* of objects — each object has a single key
 * (the tag name) whose value is an array of child items. Attributes live
 * in a sibling `:@` key.
 *
 * Output shape per element (preserveOrder mode):
 * ```
 * {
 *   "a:solidFill": [ ...children... ],
 *   ":@": { "@_val": "FF0000" }
 * }
 * ```
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  preserveOrder: true,
  trimValues: true,
  // Do NOT remove namespace prefixes — we need them.
  removeNSPrefix: false,
});

// ---------------------------------------------------------------------------
// Internal types for fast-xml-parser preserveOrder output
// ---------------------------------------------------------------------------

/**
 * A single node in the fast-xml-parser preserveOrder output array.
 *
 * Each node is an object with exactly one content key (the tag name or
 * `#text`) and an optional `:@` key holding attributes.
 */
interface RawNode {
  [tagName: string]: RawNode[] | string | Record<string, string> | undefined;
  ':@'?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Private implementation
// ---------------------------------------------------------------------------

class XmlElementImpl implements XmlElement {
  readonly name: string;

  /** Raw children array from fast-xml-parser. */
  private readonly _rawChildren: RawNode[];

  /** Raw attributes object (keys prefixed with `@_`). */
  private readonly _attrs: Record<string, string>;

  constructor(name: string, rawChildren: RawNode[], attrs: Record<string, string>) {
    this.name = name;
    this._rawChildren = rawChildren;
    this._attrs = attrs;
  }

  attr(name: string): string | undefined {
    const val = this._attrs[`@_${name}`];
    return val === undefined ? undefined : String(val);
  }

  child(tagName: string): XmlElement | undefined {
    for (const raw of this._rawChildren) {
      const el = nodeToElement(raw);
      if (el !== undefined && el.name === tagName) {
        return el;
      }
    }
    return undefined;
  }

  get children(): XmlElement[] {
    const result: XmlElement[] = [];
    for (const raw of this._rawChildren) {
      const el = nodeToElement(raw);
      if (el !== undefined) {
        result.push(el);
      }
    }
    return result;
  }

  allChildren(tagName: string): XmlElement[] {
    const result: XmlElement[] = [];
    for (const raw of this._rawChildren) {
      const el = nodeToElement(raw);
      if (el !== undefined && el.name === tagName) {
        result.push(el);
      }
    }
    return result;
  }

  text(): string {
    const parts: string[] = [];
    for (const raw of this._rawChildren) {
      if ('#text' in raw) {
        const t = raw['#text'];
        if (typeof t === 'string') {
          parts.push(t);
        } else if (Array.isArray(t) && t.length > 0) {
          // fast-xml-parser may wrap text in an array with preserveOrder
          const inner = (t as RawNode[])[0];
          if (typeof inner === 'object' && '#text' in inner) {
            parts.push(String(inner['#text']));
          }
        }
      }
    }
    return parts.join('');
  }

  is(tagName: string): boolean {
    return this.name === tagName;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a single raw fast-xml-parser node into an {@link XmlElement}.
 * Returns `undefined` for text-only nodes (`#text`).
 */
function nodeToElement(raw: RawNode): XmlElementImpl | undefined {
  // Find the content key (skip ':@', '#text', and processing instructions '?...')
  for (const key of Object.keys(raw)) {
    if (key === ':@' || key === '#text' || key.startsWith('?')) continue;

    const children = raw[key];
    const attrs: Record<string, string> = (raw[':@'] as Record<string, string> | undefined) ?? {};

    return new XmlElementImpl(key, Array.isArray(children) ? (children as RawNode[]) : [], attrs);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse an XML string into an {@link XmlElement} tree.
 *
 * Returns the root element of the document. Throws if the XML is empty
 * or unparsable.
 *
 * @example
 * ```ts
 * const el = parseXml('<a:off x="457200" y="274638"/>');
 * el.attr('x'); // '457200'
 * ```
 */
export function parseXml(xml: string): XmlElement {
  const raw: RawNode[] = parser.parse(xml) as RawNode[];

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('parseXml: no elements found in XML input');
  }

  // The parser returns an array of top-level nodes. Walk past any
  // processing instructions / text nodes to find the first real element.
  for (const node of raw) {
    const el = nodeToElement(node);
    if (el !== undefined) {
      return el;
    }
  }

  throw new Error('parseXml: no root element found in XML input');
}
