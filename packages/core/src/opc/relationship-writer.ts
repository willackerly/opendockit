/**
 * OPC Relationship serializer.
 *
 * Produces a `.rels` XML string from a list of relationships.
 *
 * Reference: ECMA-376 Part 2, §9 (Relationships).
 */

import type { Relationship } from './relationship-resolver.js';

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

/**
 * Serialize relationships to a `.rels` XML string.
 *
 * Each {@link Relationship} becomes a `<Relationship>` element. The
 * `TargetMode` attribute is only emitted when set to `"External"`.
 */
export function serializeRelationships(relationships: Relationship[]): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  ];

  for (const rel of relationships) {
    const targetModeAttr = rel.targetMode === 'External' ? ' TargetMode="External"' : '';
    lines.push(
      `  <Relationship Id="${escapeXmlAttr(rel.id)}" Type="${escapeXmlAttr(rel.type)}" Target="${escapeXmlAttr(rel.target)}"${targetModeAttr}/>`
    );
  }

  lines.push('</Relationships>');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape XML attribute characters: &, <, >, " */
function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
