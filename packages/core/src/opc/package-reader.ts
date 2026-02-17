/**
 * OPC Package Reader — the main entry point for opening OOXML files.
 *
 * Opens a ZIP container (PPTX, DOCX, XLSX, etc.) and provides lazy,
 * cached access to individual parts. All part URIs are normalized to
 * absolute paths with a leading `/`.
 *
 * Usage:
 * ```ts
 * const pkg = await OpcPackageReader.open(arrayBuffer);
 * const rels = await pkg.getRootRelationships();
 * const presRel = rels.getByType(REL_OFFICE_DOCUMENT)[0];
 * const presXml = await pkg.getPartXml(presRel.target);
 * ```
 *
 * Reference: ECMA-376 Part 2 (OPC).
 */

import JSZip from 'jszip';
import { parseXml } from '../xml/index.js';
import type { XmlElement } from '../xml/index.js';
import { parseContentTypes } from './content-types.js';
import type { ContentTypeMap } from './content-types.js';
import { parseRelationships } from './relationship-resolver.js';
import type { RelationshipMap } from './relationship-resolver.js';
import { normalizePartUri, getRelationshipPartUri, getRootRelationshipUri } from './part-uri.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ProgressEvent {
  phase: 'unzip' | 'parse';
  loaded: number;
  total: number;
}

export interface OpcPackage {
  /** Get raw bytes for a part. */
  getPart(uri: string): Promise<Uint8Array>;
  /** Get text content of a part (decoded as UTF-8). */
  getPartText(uri: string): Promise<string>;
  /** Get parsed XML for a part. */
  getPartXml(uri: string): Promise<XmlElement>;
  /** Get relationships for a part. */
  getPartRelationships(uri: string): Promise<RelationshipMap>;
  /** Get root relationships (/_rels/.rels). */
  getRootRelationships(): Promise<RelationshipMap>;
  /** Get the content type map. */
  getContentTypes(): ContentTypeMap;
  /** List all part URIs in the package. */
  listParts(): string[];
  /** Resolve a relationship target relative to a source part by rel ID. */
  resolveRelTarget(sourcePart: string, relId: string): Promise<string | undefined>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class OpcPackageReader implements OpcPackage {
  private readonly zip: JSZip;
  private readonly contentTypes: ContentTypeMap;
  private readonly partCache: Map<string, Uint8Array>;
  private readonly relCache: Map<string, RelationshipMap>;
  private readonly partList: string[];

  /** Map from normalized URI to the raw ZIP entry name. */
  private readonly uriToZipPath: Map<string, string>;

  private constructor(
    zip: JSZip,
    contentTypes: ContentTypeMap,
    partList: string[],
    uriToZipPath: Map<string, string>
  ) {
    this.zip = zip;
    this.contentTypes = contentTypes;
    this.partList = partList;
    this.uriToZipPath = uriToZipPath;
    this.partCache = new Map();
    this.relCache = new Map();
  }

  /**
   * Open an OPC package from raw file data.
   *
   * @param data - The raw bytes of the OOXML file (ZIP container).
   * @param onProgress - Optional progress callback for the unzip phase.
   */
  static async open(
    data: ArrayBuffer | Blob | Uint8Array,
    onProgress?: (event: ProgressEvent) => void
  ): Promise<OpcPackageReader> {
    // 1. Load ZIP
    onProgress?.({ phase: 'unzip', loaded: 0, total: 1 });
    const zip = await JSZip.loadAsync(data);
    onProgress?.({ phase: 'unzip', loaded: 1, total: 1 });

    // 2. Build part list and URI-to-path mapping
    const partList: string[] = [];
    const uriToZipPath = new Map<string, string>();

    zip.forEach((relativePath, _file) => {
      // Skip directories
      if (relativePath.endsWith('/')) return;

      const normalized = normalizePartUri(relativePath);
      partList.push(normalized);
      uriToZipPath.set(normalized, relativePath);
    });

    // 3. Parse [Content_Types].xml
    const contentTypesPath = partList.find((p) => p.toLowerCase() === '/[content_types].xml');
    if (contentTypesPath === undefined) {
      throw new Error('OPC package is missing [Content_Types].xml — not a valid OOXML file.');
    }

    const zipEntry = uriToZipPath.get(contentTypesPath);
    if (zipEntry === undefined) {
      throw new Error('Internal error: missing ZIP entry for content types.');
    }

    onProgress?.({ phase: 'parse', loaded: 0, total: 1 });
    const ctText = await zip.file(zipEntry)!.async('string');
    const ctXml = parseXml(ctText);
    const contentTypes = parseContentTypes(ctXml);
    onProgress?.({ phase: 'parse', loaded: 1, total: 1 });

    return new OpcPackageReader(zip, contentTypes, partList, uriToZipPath);
  }

  async getPart(uri: string): Promise<Uint8Array> {
    const normalized = normalizePartUri(uri);

    // Check cache
    const cached = this.partCache.get(normalized);
    if (cached !== undefined) {
      return cached;
    }

    // Extract from ZIP
    const zipPath = this.uriToZipPath.get(normalized);
    if (zipPath === undefined) {
      throw new Error(`Part not found in package: ${normalized}`);
    }

    const bytes = await this.zip.file(zipPath)!.async('uint8array');
    this.partCache.set(normalized, bytes);
    return bytes;
  }

  async getPartText(uri: string): Promise<string> {
    const normalized = normalizePartUri(uri);
    const zipPath = this.uriToZipPath.get(normalized);
    if (zipPath === undefined) {
      throw new Error(`Part not found in package: ${normalized}`);
    }

    // For text, we go straight to string to avoid intermediate Uint8Array
    return this.zip.file(zipPath)!.async('string');
  }

  async getPartXml(uri: string): Promise<XmlElement> {
    const text = await this.getPartText(uri);
    return parseXml(text);
  }

  async getPartRelationships(uri: string): Promise<RelationshipMap> {
    const normalized = normalizePartUri(uri);

    // Check cache
    const cached = this.relCache.get(normalized);
    if (cached !== undefined) {
      return cached;
    }

    // Determine the .rels file path for this part
    const relsUri = getRelationshipPartUri(normalized);
    const zipPath = this.uriToZipPath.get(relsUri);

    if (zipPath === undefined) {
      // No relationships file — return an empty map
      const empty = parseRelationships(
        parseXml(
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
        ),
        normalized
      );
      this.relCache.set(normalized, empty);
      return empty;
    }

    const text = await this.zip.file(zipPath)!.async('string');
    const xml = parseXml(text);
    const rels = parseRelationships(xml, normalized);
    this.relCache.set(normalized, rels);
    return rels;
  }

  async getRootRelationships(): Promise<RelationshipMap> {
    const rootRelsUri = getRootRelationshipUri();

    // Check cache (keyed on '/' — the "source" for root rels)
    const cached = this.relCache.get('/');
    if (cached !== undefined) {
      return cached;
    }

    const zipPath = this.uriToZipPath.get(rootRelsUri);
    if (zipPath === undefined) {
      throw new Error('OPC package is missing /_rels/.rels — not a valid OOXML file.');
    }

    const text = await this.zip.file(zipPath)!.async('string');
    const xml = parseXml(text);
    const rels = parseRelationships(xml, '/');
    this.relCache.set('/', rels);
    return rels;
  }

  getContentTypes(): ContentTypeMap {
    return this.contentTypes;
  }

  listParts(): string[] {
    return [...this.partList];
  }

  async resolveRelTarget(sourcePart: string, relId: string): Promise<string | undefined> {
    const rels = await this.getPartRelationships(sourcePart);
    const rel = rels.getById(relId);
    return rel?.target;
  }
}
