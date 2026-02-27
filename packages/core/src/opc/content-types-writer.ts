/**
 * OPC Content Types serializer.
 *
 * Produces a `[Content_Types].xml` string from a list of content type entries.
 * Each entry is either a Default (keyed by extension) or an Override (keyed by
 * part name).
 *
 * Reference: ECMA-376 Part 2, §10.1.2.
 */

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ContentTypeEntry {
  /** File extension (without dot) for Default elements. */
  extension?: string;
  /** Normalized part URI for Override elements. */
  partName?: string;
  /** The MIME content type. */
  contentType: string;
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

/**
 * Serialize content type entries to a `[Content_Types].xml` string.
 *
 * Entries with `extension` become `<Default>` elements.
 * Entries with `partName` become `<Override>` elements.
 * Entries with neither are silently skipped.
 */
export function serializeContentTypes(entries: ContentTypeEntry[]): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
  ];

  for (const entry of entries) {
    if (entry.extension !== undefined) {
      lines.push(
        `  <Default Extension="${escapeXmlAttr(entry.extension)}" ContentType="${escapeXmlAttr(entry.contentType)}"/>`
      );
    } else if (entry.partName !== undefined) {
      lines.push(
        `  <Override PartName="${escapeXmlAttr(entry.partName)}" ContentType="${escapeXmlAttr(entry.contentType)}"/>`
      );
    }
  }

  lines.push('</Types>');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape XML attribute characters: &, <, >, ", ' */
function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
