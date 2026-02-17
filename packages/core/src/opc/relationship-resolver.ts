/**
 * OPC Relationship resolver.
 *
 * Each part in an OPC package can have an associated `.rels` file
 * describing its relationships to other parts (or external resources).
 * This module parses those `.rels` files and resolves relative target
 * URIs against the source part.
 *
 * Reference: ECMA-376 Part 2, §9 (Relationships).
 */

import type { XmlElement } from '../xml/index.js';
import { resolvePartUri } from './part-uri.js';

// ---------------------------------------------------------------------------
// Relationship type constants
// ---------------------------------------------------------------------------

export const REL_SLIDE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
export const REL_SLIDE_LAYOUT =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout';
export const REL_SLIDE_MASTER =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster';
export const REL_THEME =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme';
export const REL_OFFICE_DOCUMENT =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';
export const REL_IMAGE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
export const REL_CHART =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart';
export const REL_NOTES_SLIDE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide';
export const REL_HYPERLINK =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';
export const REL_COMMENT_AUTHORS =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/commentAuthors';
export const REL_PRES_PROPS =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps';
export const REL_VIEW_PROPS =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps';
export const REL_TABLE_STYLES =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface Relationship {
  /** Relationship ID, e.g. 'rId1'. */
  id: string;
  /** Relationship type URI. */
  type: string;
  /** Resolved target URI (absolute for Internal, original for External). */
  target: string;
  /** Target mode — Internal (within the package) or External (URL/path). */
  targetMode?: 'Internal' | 'External';
}

export interface RelationshipMap {
  /** Look up a relationship by its ID. */
  getById(id: string): Relationship | undefined;
  /** Get all relationships of a given type. */
  getByType(type: string): Relationship[];
  /** Return all relationships. */
  all(): Relationship[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class RelationshipMapImpl implements RelationshipMap {
  private readonly byId: Map<string, Relationship>;
  private readonly byType: Map<string, Relationship[]>;
  private readonly list: Relationship[];

  constructor(relationships: Relationship[]) {
    this.list = relationships;
    this.byId = new Map();
    this.byType = new Map();

    for (const rel of relationships) {
      this.byId.set(rel.id, rel);

      let arr = this.byType.get(rel.type);
      if (arr === undefined) {
        arr = [];
        this.byType.set(rel.type, arr);
      }
      arr.push(rel);
    }
  }

  getById(id: string): Relationship | undefined {
    return this.byId.get(id);
  }

  getByType(type: string): Relationship[] {
    return this.byType.get(type) ?? [];
  }

  all(): Relationship[] {
    return this.list;
  }
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a `.rels` XML file into a {@link RelationshipMap}.
 *
 * @param rootElement - The parsed root `<Relationships>` XML element.
 * @param sourcePartUri - The URI of the part that owns this .rels file.
 *   Used to resolve relative target paths. For root relationships
 *   (`/_rels/.rels`), pass `'/'`.
 *
 * Expected XML shape:
 * ```xml
 * <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 *   <Relationship Id="rId1"
 *                 Type="http://...../slide"
 *                 Target="slides/slide1.xml"/>
 * </Relationships>
 * ```
 */
export function parseRelationships(
  rootElement: XmlElement,
  sourcePartUri: string
): RelationshipMap {
  const relationships: Relationship[] = [];

  for (const child of rootElement.children) {
    if (child.is('Relationship')) {
      const id = child.attr('Id');
      const type = child.attr('Type');
      const rawTarget = child.attr('Target');
      const targetMode = child.attr('TargetMode') as 'Internal' | 'External' | undefined;

      if (id === undefined || type === undefined || rawTarget === undefined) {
        continue;
      }

      // External targets are kept as-is (URLs, mailto:, etc.)
      // Internal targets are resolved relative to the source part
      const target =
        targetMode === 'External' ? rawTarget : resolvePartUri(sourcePartUri, rawTarget);

      relationships.push({ id, type, target, targetMode });
    }
  }

  return new RelationshipMapImpl(relationships);
}
