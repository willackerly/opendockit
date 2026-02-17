/**
 * OPC Content Types parser.
 *
 * Every OPC package contains a `[Content_Types].xml` file at its root.
 * This XML declares the MIME content type for each part, either by:
 * - **Default** — matching by file extension (e.g. `xml` → `application/xml`)
 * - **Override** — exact match on the part name (takes precedence)
 *
 * Reference: ECMA-376 Part 2, §10.1.2.
 */

import type { XmlElement } from '../xml/index.js';
import { normalizePartUri } from './part-uri.js';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ContentTypeMap {
  /** Get the content type for a part URI. Override takes precedence over Default. */
  getType(partUri: string): string | undefined;

  /** Get all part URIs matching a given content type (from Overrides only). */
  getPartsByType(contentType: string): string[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class ContentTypeMapImpl implements ContentTypeMap {
  /** Extension → content type (from Default elements). Key is lowercase, no dot. */
  private readonly defaults: Map<string, string>;

  /** Normalized part URI → content type (from Override elements). */
  private readonly overrides: Map<string, string>;

  constructor(defaults: Map<string, string>, overrides: Map<string, string>) {
    this.defaults = defaults;
    this.overrides = overrides;
  }

  getType(partUri: string): string | undefined {
    const normalized = normalizePartUri(partUri);

    // Override takes precedence
    const override = this.overrides.get(normalized);
    if (override !== undefined) {
      return override;
    }

    // Fall back to default by extension
    const dotIndex = normalized.lastIndexOf('.');
    if (dotIndex >= 0) {
      const ext = normalized.substring(dotIndex + 1).toLowerCase();
      return this.defaults.get(ext);
    }

    return undefined;
  }

  getPartsByType(contentType: string): string[] {
    const result: string[] = [];
    for (const [uri, ct] of this.overrides) {
      if (ct === contentType) {
        result.push(uri);
      }
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a `[Content_Types].xml` root element into a {@link ContentTypeMap}.
 *
 * Expected XML shape:
 * ```xml
 * <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 *   <Default Extension="xml" ContentType="application/xml"/>
 *   <Override PartName="/ppt/presentation.xml"
 *             ContentType="application/vnd...presentation.main+xml"/>
 * </Types>
 * ```
 */
export function parseContentTypes(rootElement: XmlElement): ContentTypeMap {
  const defaults = new Map<string, string>();
  const overrides = new Map<string, string>();

  for (const child of rootElement.children) {
    if (child.is('Default')) {
      const ext = child.attr('Extension');
      const ct = child.attr('ContentType');
      if (ext !== undefined && ct !== undefined) {
        defaults.set(ext.toLowerCase(), ct);
      }
    } else if (child.is('Override')) {
      const partName = child.attr('PartName');
      const ct = child.attr('ContentType');
      if (partName !== undefined && ct !== undefined) {
        overrides.set(normalizePartUri(partName), ct);
      }
    }
  }

  return new ContentTypeMapImpl(defaults, overrides);
}
