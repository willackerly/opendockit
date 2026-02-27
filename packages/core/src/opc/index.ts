/**
 * OPC Package — barrel export.
 *
 * Re-exports the full public API of the OPC module:
 * - {@link OpcPackageReader} and {@link OpcPackage} from `package-reader`
 * - {@link OpcPackageWriter} from `package-writer`
 * - {@link ContentTypeMap} and {@link parseContentTypes} from `content-types`
 * - {@link serializeContentTypes} and {@link ContentTypeEntry} from `content-types-writer`
 * - {@link RelationshipMap}, {@link Relationship}, relationship constants,
 *   and {@link parseRelationships} from `relationship-resolver`
 * - {@link serializeRelationships} from `relationship-writer`
 * - Part URI utilities from `part-uri`
 */

export { OpcPackageReader } from './package-reader.js';
export type { OpcPackage, ProgressEvent } from './package-reader.js';

export { OpcPackageWriter } from './package-writer.js';

export { parseContentTypes } from './content-types.js';
export type { ContentTypeMap } from './content-types.js';

export { serializeContentTypes } from './content-types-writer.js';
export type { ContentTypeEntry } from './content-types-writer.js';

export {
  parseRelationships,
  REL_SLIDE,
  REL_SLIDE_LAYOUT,
  REL_SLIDE_MASTER,
  REL_THEME,
  REL_OFFICE_DOCUMENT,
  REL_IMAGE,
  REL_CHART,
  REL_NOTES_SLIDE,
  REL_HYPERLINK,
  REL_COMMENT_AUTHORS,
  REL_PRES_PROPS,
  REL_VIEW_PROPS,
  REL_TABLE_STYLES,
  REL_FONT,
  REL_DIAGRAM_DATA,
  REL_DIAGRAM_DRAWING,
} from './relationship-resolver.js';
export type { Relationship, RelationshipMap } from './relationship-resolver.js';

export { serializeRelationships } from './relationship-writer.js';

export {
  normalizePartUri,
  resolvePartUri,
  getPartDirectory,
  getRelationshipPartUri,
  getRootRelationshipUri,
} from './part-uri.js';
