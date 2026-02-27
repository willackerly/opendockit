/**
 * OPC Package Writer — creates modified OOXML packages.
 *
 * Given a source {@link OpcPackageReader}, produces a new ZIP where only
 * changed parts are replaced. Unchanged parts are copied as raw bytes,
 * preserving the original content exactly.
 *
 * Usage:
 * ```ts
 * const reader = await OpcPackageReader.open(data);
 * const writer = new OpcPackageWriter(reader);
 * writer.setPart('/ppt/slides/slide1.xml', newSlideXml);
 * writer.addPart('/ppt/media/image2.png', pngBytes, 'image/png');
 * const output = await writer.build();
 * ```
 *
 * Reference: ECMA-376 Part 2 (OPC).
 */

import JSZip from 'jszip';
import type { OpcPackageReader } from './package-reader.js';
import type { Relationship } from './relationship-resolver.js';
import { normalizePartUri, getRelationshipPartUri, getRootRelationshipUri } from './part-uri.js';
import { serializeContentTypes } from './content-types-writer.js';
import type { ContentTypeEntry } from './content-types-writer.js';
import { serializeRelationships } from './relationship-writer.js';
import { parseXml } from '../xml/index.js';

// ---------------------------------------------------------------------------
// Public class
// ---------------------------------------------------------------------------

export class OpcPackageWriter {
  private readonly source: OpcPackageReader;
  private readonly modifiedParts: Map<string, Uint8Array | string>;
  private readonly deletedParts: Set<string>;
  private readonly addedParts: Map<string, { content: Uint8Array | string; contentType: string }>;
  private readonly modifiedRelationships: Map<string, Relationship[]>;

  constructor(source: OpcPackageReader) {
    this.source = source;
    this.modifiedParts = new Map();
    this.deletedParts = new Set();
    this.addedParts = new Map();
    this.modifiedRelationships = new Map();
  }

  /**
   * Replace the content of an existing part.
   *
   * The part must already exist in the source package. Its content type
   * is preserved from the original.
   */
  setPart(uri: string, content: Uint8Array | string): void {
    const normalized = normalizePartUri(uri);
    this.modifiedParts.set(normalized, content);
  }

  /**
   * Mark an existing part for deletion.
   *
   * The part will not appear in the output package. Its Override entry
   * in `[Content_Types].xml` will also be removed.
   */
  deletePart(uri: string): void {
    const normalized = normalizePartUri(uri);
    this.deletedParts.add(normalized);
  }

  /**
   * Add a new part to the package.
   *
   * An Override entry for the given content type will be added to
   * `[Content_Types].xml`.
   */
  addPart(uri: string, content: Uint8Array | string, contentType: string): void {
    const normalized = normalizePartUri(uri);
    this.addedParts.set(normalized, { content, contentType });
  }

  /**
   * Set the relationships for a source part.
   *
   * Pass `'/'` as the source part URI to set root relationships
   * (`/_rels/.rels`).
   *
   * The relationships will be serialized to the appropriate `.rels` file.
   * Note: relationship targets should be stored as relative paths in the
   * serialized output for internal relationships, or as absolute URIs for
   * external ones. The caller is responsible for providing the correct
   * target values in each {@link Relationship}.
   */
  setRelationships(sourcePartUri: string, relationships: Relationship[]): void {
    const normalized = sourcePartUri === '/' ? '/' : normalizePartUri(sourcePartUri);
    this.modifiedRelationships.set(normalized, relationships);
  }

  /**
   * Build the final ZIP package as a `Uint8Array`.
   *
   * 1. Copies all unchanged parts from the source as raw bytes.
   * 2. Substitutes modified parts with their new content.
   * 3. Skips deleted parts entirely.
   * 4. Adds new parts.
   * 5. Serializes modified relationship files.
   * 6. Regenerates `[Content_Types].xml` if the part set changed.
   */
  async build(): Promise<Uint8Array> {
    const zip = new JSZip();
    const contentTypesUri = '/[Content_Types].xml';
    const needsContentTypeRegen = this.addedParts.size > 0 || this.deletedParts.size > 0;

    // Compute which .rels files will be written from modifiedRelationships
    const relsFileUris = new Set<string>();
    for (const sourceUri of this.modifiedRelationships.keys()) {
      const relsUri =
        sourceUri === '/' ? getRootRelationshipUri() : getRelationshipPartUri(sourceUri);
      relsFileUris.add(relsUri);
    }

    // 1–3. Iterate source parts: copy, modify, or skip
    const sourceParts = this.source.listParts();
    for (const uri of sourceParts) {
      // Skip [Content_Types].xml if we need to regenerate it
      if (uri.toLowerCase() === contentTypesUri.toLowerCase() && needsContentTypeRegen) {
        continue;
      }

      // Skip deleted parts
      if (this.deletedParts.has(uri)) {
        continue;
      }

      // Skip .rels files that will be replaced by modifiedRelationships
      if (relsFileUris.has(uri)) {
        continue;
      }

      const zipPath = uri.substring(1); // strip leading '/'

      if (this.modifiedParts.has(uri)) {
        // Use modified content
        zip.file(zipPath, this.modifiedParts.get(uri)!);
      } else {
        // Copy raw bytes from source
        const bytes = await this.source.getPart(uri);
        zip.file(zipPath, bytes);
      }
    }

    // 4. Add new parts
    for (const [uri, { content }] of this.addedParts) {
      const zipPath = uri.substring(1);
      zip.file(zipPath, content);
    }

    // 5. Serialize modified relationships
    for (const [sourceUri, relationships] of this.modifiedRelationships) {
      const relsUri =
        sourceUri === '/' ? getRootRelationshipUri() : getRelationshipPartUri(sourceUri);
      const zipPath = relsUri.substring(1);
      zip.file(zipPath, serializeRelationships(relationships));
    }

    // 6. Regenerate [Content_Types].xml if needed
    if (needsContentTypeRegen) {
      const entries = await this.buildContentTypeEntries();
      zip.file('[Content_Types].xml', serializeContentTypes(entries));
    }

    return zip.generateAsync({ type: 'uint8array' });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Parse the source [Content_Types].xml and build a mutated list of entries
   * reflecting additions and deletions.
   */
  private async buildContentTypeEntries(): Promise<ContentTypeEntry[]> {
    const entries: ContentTypeEntry[] = [];

    // Read and parse the original [Content_Types].xml
    const ctText = await this.source.getPartText('/[Content_Types].xml');
    const ctXml = parseXml(ctText);

    // Extract existing Default and Override entries
    for (const child of ctXml.children) {
      if (child.is('Default')) {
        const ext = child.attr('Extension');
        const ct = child.attr('ContentType');
        if (ext !== undefined && ct !== undefined) {
          entries.push({ extension: ext, contentType: ct });
        }
      } else if (child.is('Override')) {
        const partName = child.attr('PartName');
        const ct = child.attr('ContentType');
        if (partName !== undefined && ct !== undefined) {
          const normalized = normalizePartUri(partName);
          // Skip overrides for deleted parts
          if (!this.deletedParts.has(normalized)) {
            entries.push({ partName: normalized, contentType: ct });
          }
        }
      }
    }

    // Add overrides for new parts
    for (const [uri, { contentType }] of this.addedParts) {
      entries.push({ partName: uri, contentType });
    }

    return entries;
  }
}
